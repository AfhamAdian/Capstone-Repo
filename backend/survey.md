# Survey System Architecture

This document describes the implemented survey system as it exists now. It is
the source of truth for product behavior, data flow, privacy, AI usage,
operations, and extension points.

## 1. Product model

The system uses one delivery model:

- one encrypted, reusable, anonymous link per survey distribution;
- one survey per project;
- one monthly automatic pulse per project, plus explicitly triggered manual
  surveys;
- one broadcast per link to the configured Slack channel, Telegram
  group/channel, and Discord webhook;
- no email delivery, direct messages, per-recipient links, Discord identities,
  survey-bundle user fields, or single-use mode.

A shared channel cannot enforce a private 50/50 recipient cohort. Automatic
distribution therefore schedules one monthly project pulse instead of
pretending that a channel-wide post targets selected individuals.

Responses are anonymous by construction. The survey row holds the shared link
fields (`cycle_id`, `expires_at`, `notified_at`, `delivery`) with no user or
project-member relationship. `survey_response` stores only the survey id, an
opaque client retry key, submission time, and answers JSON.

## 2. Runtime components

The existing folder structure is preserved:

- `apps/api/` exposes admin and public HTTP endpoints.
- `apps/worker/` runs BullMQ send, scheduling, deadline-close, and insight jobs.
- `libs/ai/` contains the Gemini/stub clients, prompts, deduplication, and
  response validation.
- `libs/notifications/` contains only channel-broadcast clients.
- `libs/security/` encrypts and decrypts survey-link tokens.
- `libs/queue/` owns deterministic BullMQ job creation.
- `db/migrations/` contains numbered, executable changes.
- `db/migrations/007_survey_compact.sql` is the compact two-table cutover.
- `db/schema/005_surveys.sql` is the compact current-state survey schema.
- `db/migration.sql` is the frozen 002–006 consolidation; do not edit it.
- `new_frontend/src/app/` contains the admin and respondent experiences.

High-level flow:

1. Capture project health context.
2. Ask Gemini for candidate questions.
3. Deduplicate, score, validate, and quality-gate the questions.
4. Persist a reviewable survey draft.
5. Auto-send at the review deadline unless paused or cancelled.
6. Broadcast one anonymous link.
7. Validate and atomically persist responses.
8. Close at the deadline or by manager action.
9. Analyze only when the anonymity threshold is met.
10. Blend validated survey sentiment with metrics and display provenance.

## 3. Database model

The core relationship is intentionally linear:

`project -> survey -> survey_response`

`survey -> projecthealthscore` (optional pointer; health history, not survey plumbing)

Core tables:

- `survey`: one pulse. Lifecycle, trigger, questions JSON, anonymous link
  fields, schedule (`period_month`, `scheduled_send_at`), delivery JSON,
  health-context snapshot, and AI insight JSON.
- `survey_response`: one anonymous submission. `submission_key` UUID retry
  key and `answers` JSON `[{ questionId, answerText?, answerScale? }]`.
- `projecthealthscore`: health history, including the metrics snapshot and
  survey that contributed to a blended row.

Questions live on the survey row as
`[{ id, category, questionText, questionType }]`. Category keys are the five
rubric buckets (`delivery`, `codeQuality`, `cicd`, `teamHealth`, `blockers`),
enforced in application code. There is no category table or HTTP API.

Dropped by `007_survey_compact.sql`: `surveyquestion`, `surveyanswer`,
`surveybundle`, `surveyschedule`, `surveyinsight`, `surveycategory`.

There is no survey-owned user table, recipient table, delivery-attempt table,
or persisted raw token.

The function `submit_survey_response(survey_id, submission_key, answers)`
inserts one `survey_response` row. Unique `(survey_id, submission_key)` makes
retries idempotent.

## 4. Lifecycle

Supported survey states:

- `draft`: row created; questions may still be generated or edited.
- `active`: the anonymous link has been broadcast and is accepting responses.
- `paused`: automatic send is suspended before dispatch.
- `closed`: response collection ended; insight work is queued.
- `completed`: analysis finished or was intentionally skipped because the
  privacy threshold was not met.
- `cancelled`: stopped before dispatch.
- `failed`: reserved for terminal operational failure.

Question editing is allowed only before `sent_at`. Freezing at dispatch is
stricter and safer than waiting for the first response: a respondent may have
already loaded the form before any answer is stored.

Managers can pause, resume, or cancel an unsent survey. They can manually close
an active survey and retry failed delivery or analysis. Automatic surveys send at `scheduled_send_at` when still
eligible; a paused survey remains pending until resumed.

## 5. Automatic monthly scheduling

The hourly `survey-distribution` job:

1. Looks at the current and next month.
2. Creates one auto-pulse `survey` row per project when the configured review
   lead time begins, including send dates that fall near the previous month end.
3. Chooses and persists one randomized send moment on
   `survey.scheduled_send_at` inside `SURVEY_MONTHLY_START_DAY` plus
   `SURVEY_MONTHLY_WINDOW_DAYS`.
4. Generates and persists questions JSON at
   `SURVEY_QUESTION_GEN_LEAD_DAYS` before the send moment.
5. Leaves the survey in `draft` until send.
6. Broadcasts at the persisted moment unless paused or cancelled.
7. Expires due links, closes active surveys, and queues insight jobs.

The unique project/month index for `auto_pulse`, unique `cycle_id`, and
deterministic queue IDs make repeated hourly ticks safe.

## 6. Manual surveys

The manager flow:

1. `POST /projects/:projectId/surveys/generate-questions`
2. Review, edit, and preview Gemini-scored questions in the send modal.
3. `POST /projects/:projectId/surveys` with the reviewed questions (queues a
   background send job). Optional `targetCount` comes from Settings team size.
4. Persist the survey, questions JSON, health-context snapshot, and target count.
5. The send worker broadcasts one anonymous link, stores channel results on the
   survey row, keeps the provided target count when set, and marks the survey
   active. Active list items include a reconstructed `publicUrl`.
6. `POST /api/v1/surveys/:surveyId/remind` re-broadcasts the same anonymous
   link (`kind: reminder`) with a 15-minute cooldown. Identities are never
   collected.

`POST /projects/:projectId/surveys/send-now` still exists as a skip-review
path (generate + send in one queued job) and is not used by the current UI.

Manual creation is limited per project/calendar month by
`MANUAL_SURVEY_MONTHLY_LIMIT`.

## 7. Gemini integration

`GEMINI_API_KEY` selects the real Gemini client. Without it, the stub client
supports local development.

Every generation and question-scoring request receives an immutable project
health context containing:

- capture timestamp;
- overall health score;
- delivery, code quality, CI/CD, team health, and blockers scores;
- overall trend delta;
- source metrics snapshot id.

Gemini is instructed to prioritize weak or declining areas without exposing
numeric scores in respondent-facing questions.

The same captured health context is supplied during response analysis as
background only. The analysis prompt explicitly requires sentiment scores to
come from survey evidence, not to copy, average with, or anchor to the prior
health score. This avoids a circular blend.

Gemini responses use JSON mode and strict runtime validation:

- question shape and type;
- one score per candidate;
- every quality/category score in `0..100`;
- non-empty insight text;
- string-only themes, capped at five.

Invalid AI output throws, allowing BullMQ retry behavior instead of persisting
untrusted partial data.

## 8. Question quality pipeline

The shared pipeline in
`services/survey-question-generation.service.ts`:

1. Generate candidates using project name, trigger, guidance, categories, and
   health context.
2. Remove normalized duplicates.
3. Ask Gemini to score relevance, clarity, importance, diversity, and overall
   quality.
4. Drop questions below `SURVEY_QUESTION_MIN_SCORE`.
5. Cap the final set with `SURVEY_QUESTION_MAX_COUNT`.
6. Prefer category diversity when selecting the final questions.

Admins may still edit wording and switch text/scale type during review.

## 9. Anonymous link and response safety

`survey-token.ts` uses AES-256-GCM. The encrypted payload contains:

- survey id;
- cycle id;
- response deadline.

The token is not stored. Public requests:

1. decrypt and authenticate the token;
2. reject payload expiry before database work;
3. verify survey id, cycle id, and database expiry;
4. verify the survey is active;
5. verify every question belongs to that survey;
6. reject duplicate question ids;
7. enforce text length `1..4000`;
8. enforce integer scale values `1..5`;
9. require exactly one text or scale value;
10. insert one `survey_response` row atomically.

The frontend sends one random UUID per response attempt. Repeating the same
request returns the original response id and does not duplicate answers. This
protects against accidental retry/double-click without identifying a person.

Public form loads are limited to 60 per IP/15 minutes. Submissions are limited
to 10 per IP/15 minutes. These are abuse controls, not identity controls.

## 10. Closing, privacy, and aggregation

Shared links are reusable until closed. A survey closes:

- automatically when `expires_at` passes; or
- when a manager closes it.

Closing updates the survey row and enqueues a background Gemini scoring job
(stored on `survey.insight`, then blended into `projecthealthscore`). The
same worker generates questions and delivers a "Send Survey Now" job.

`SURVEY_MIN_ANONYMOUS_RESPONSES` defaults to 5 and is clamped to at least 3.
With at least one response, Gemini produces five category scores, themes,
and a narrative. Below the privacy threshold:

- raw answers are suppressed from admin API responses;
- the survey completes with `raw_responses_hidden:<count>/<minimum>`;
- scores and the AI summary are still shown.

With zero responses, analysis is skipped and the survey completes with
`insufficient_responses:<count>/<minimum>`. Metrics health remains available.

## 11. Health-score blending and provenance

The metrics-only health score is produced during sync. Survey completion may
create a new blended row:

`blended = 60% latest metrics + 40% latest completed survey sentiment`

If one side is unavailable, the available side is used rather than inventing
neutral data.

The blended `projecthealthscore` row stores both:

- `project_snapshot_id` for the metrics source;
- `survey_id` for the sentiment source.

The health snapshot supplied to Gemini is input context only. It is not itself
treated as new response evidence.

## 12. Notifications

`broadcast-survey-link.ts` fans out concurrently:

- Slack `chat.postMessage`;
- Telegram Bot API `sendMessage`;
- Discord incoming webhook.

Each client is best-effort, but the send job succeeds only when at least one
channel accepted the broadcast. Otherwise the job throws and BullMQ retries.
Successful channel booleans and `notified_at` are persisted on the survey so a
retry does not broadcast the same link again.

Provider delivery is still at-least-once at the narrow crash boundary between a
channel accepting a message and the worker persisting that acceptance. Avoiding
that final duplicate window would require provider idempotency keys or an
outbox/receipt protocol.

The current environment config points to one shared destination per channel.
Per-project channel routing can be added later without adding recipient
identity: store project-level channel destinations and keep the same broadcast
interface.

## 13. API surface

Project/admin endpoints:

- `POST /api/v1/projects/:projectId/surveys/generate-questions`
- `POST /api/v1/projects/:projectId/surveys`
- `POST /api/v1/projects/:projectId/surveys/send-now`
- `GET /api/v1/projects/:projectId/surveys`
- `GET /api/v1/projects/:projectId/surveys/quota`
- `GET /api/v1/projects/:projectId/surveys/schedule`
- `GET /api/v1/projects/:projectId/pending-survey`
- `GET /api/v1/surveys`
- `GET /api/v1/surveys/:surveyId`
- `PATCH /api/v1/surveys/:surveyId/questions`
- `PATCH /api/v1/surveys/:surveyId/lifecycle`
- `POST /api/v1/surveys/:surveyId/close` (stop an active public form and queue analysis)
- `POST /api/v1/surveys/:surveyId/remind` (anonymous channel reminder; same shared link)
- `PATCH /api/v1/surveys/:surveyId/complete` (compatibility close endpoint)

Public endpoints:

- `GET /api/v1/public/surveys/:token`
- `POST /api/v1/public/surveys/:token/responses`

The admin APIs currently use interim `x-user-role` and `x-user-id` headers.
This is not production authentication. Replace the requester helper with real
session/JWT middleware before exposing admin endpoints outside a trusted
environment.

## 14. Frontend experience

The existing frontend structure is retained.

Admin experience:

- generate → edit → preview before send (reviewed questions are queued);
- Settings question guidance is passed into generation; Settings team size
  is the send `targetCount`;
- copy public survey URL and anonymous Remind on Active history rows;
- live poll while Draft/Active/Closed-without-scores so response counts update;
- score-over-time chart for the last scored pulses;
- scheduled-survey review card;
- captured health-context summary;
- pause, resume, cancel, and save actions;
- expanded lifecycle statuses (`draft`, `active`, `paused`, `closed`,
  `completed`, `cancelled`, `failed`);
- safe response-rate math when target count is zero;
- insights, themes, category scores, delivery state, and privacy suppression.

Respondent experience:

- standalone token route;
- project and question context;
- keyboard-accessible text and scale controls;
- progress semantics;
- submit loading/error states;
- idempotent retry key;
- explicit anonymity confirmation.

## 15. Configuration

Required for full production behavior:

- `REDIS_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `SURVEY_TOKEN_ENC_KEY`
- `SURVEY_FORM_BASE_URL`

At least one broadcast destination must be configured:

- `SLACK_BOT_TOKEN` and `SLACK_CHANNEL_ID`
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`
- `DISCORD_WEBHOOK_URL`

Behavior controls:

- `GEMINI_MODEL`
- `SURVEY_QUESTION_MIN_SCORE`
- `SURVEY_QUESTION_MAX_COUNT`
- `SURVEY_MONTHLY_START_DAY`
- `SURVEY_MONTHLY_WINDOW_DAYS`
- `SURVEY_QUESTION_GEN_LEAD_DAYS`
- `SURVEY_RESPONSE_DEADLINE_DAYS`
- `SURVEY_MIN_ANONYMOUS_RESPONSES`
- `MANUAL_SURVEY_MONTHLY_LIMIT`

## 16. Migration and operations

No automated migration runner exists. Numbered files `002`–`006` have already
been applied (or written) against live Supabase and must not be edited.

On a database that already has the older survey tables, apply only:

```bash
psql "$DATABASE_URL" -f db/migrations/007_survey_compact.sql
```

`007` adds the compact columns, copies leftover questions/insights/links into
the survey row, replaces `submit_survey_response`, and drops the unused
tables. It is safe to rerun.

On a brand-new environment that still needs 002–006:

```bash
psql "$DATABASE_URL" -f db/migration.sql
psql "$DATABASE_URL" -f db/migrations/007_survey_compact.sql
```

Run API and worker as separate processes. Redis and the worker are required for
delivery, deadline closing, and insights.

Operational checks:

- worker logs show the hourly distribution job;
- `survey.delivery` shows channel acceptance;
- `survey.sent_at` is the actual first successful broadcast time;
- `survey.closed_at` and `close_reason` explain collection closure;
- `survey.analysis_error` explains privacy skip/failure state;
- `survey.insight.aiModel` records the model used;
- `projecthealthscore.survey_id` proves blend provenance.

## 17. Verification

Current automated checks cover AI deduplication, quality selection, token
encryption/expiry, schedule date utilities, and shared-link answer validation.
Backend `npm test` passes (22 tests). Frontend production build passes.

Before production deployment, add integration tests against a temporary
PostgreSQL/Supabase instance for:

- idempotent migration on fresh and legacy survey schemas;
- atomic duplicate submission;
- close-versus-submit concurrency;
- deterministic queue retries after partial channel failure;
- anonymity-threshold raw-text suppression;
- health-blend provenance;
- pause/resume at the exact send boundary.

## 18. Deliberate extension points

Future features should preserve the anonymous broadcast core unless product
requirements explicitly change:

- per-project broadcast channel configuration;
- production identity/session middleware for admins;
- an automated migration runner;
- richer aggregate charts and CSV export above the privacy threshold;
- optional multilingual questions/prompts;
- a separately designed personal-delivery model, with its own privacy review
  and migration, rather than dormant fields in the shared model.
