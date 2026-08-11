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

Responses are anonymous by construction. `surveybundle` has no user or
project-member relationship, and `surveyresponse` stores only the shared link,
an opaque client retry key, and submission time.

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
- `db/schema/005_surveys.sql` is the compact current-state survey schema.
- `db/migration.sql` is the consolidated idempotent migration.
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

`project -> survey -> surveyquestion`

`survey -> surveybundle -> surveyresponse -> surveyanswer`

`survey -> surveyinsight`

`project -> projecthealthscore`

`project -> surveyschedule`

Core tables:

- `survey`: lifecycle, trigger, audience target, immutable health snapshot,
  review/send/close timestamps, and analysis state.
- `surveyquestion`: ordered text or 1–5 scale questions.
- `surveycategory`: built-in and admin-defined category keys mapped to the five
  canonical score buckets.
- `surveybundle`: one shared encrypted-link record, expiry, state, and compact
  per-channel delivery result JSON.
- `surveyresponse`: anonymous submission metadata and client-generated UUID
  used only to make retries idempotent.
- `surveyanswer`: one validated answer per response/question.
- `surveyinsight`: validated Gemini scores, themes, narrative, model, and
  generation timestamp.
- `projecthealthscore`: health history, including the metrics snapshot and
  survey that contributed to a blended row.
- `surveyschedule`: one randomized monthly send time per project.

There is no survey-owned user table, recipient table, delivery-attempt table,
bundle-to-member join, bundle mode, or persisted raw token.

The migration function `submit_survey_response` inserts the response and all
answers in one PostgreSQL transaction. Database constraints enforce unique
question answers, answer shape, and valid scale range.

## 4. Lifecycle

Supported survey states:

- `draft`: row created; questions may still be generated.
- `in_review`: questions are ready and the review deadline is visible.
- `scheduled`: manual survey queued for immediate background delivery.
- `sending`: worker claimed the survey; pre-send lifecycle actions are locked.
- `active`: at least one broadcast channel accepted the link.
- `paused`: automatic send is suspended before dispatch.
- `closed`: response collection ended; insight work is queued.
- `analyzing`: Gemini analysis is in progress.
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
2. Creates one schedule per project when the configured review lead time
   begins, including round-one dates that fall near the previous month end.
3. Chooses and persists one randomized send moment inside
   `SURVEY_MONTHLY_START_DAY` plus `SURVEY_MONTHLY_WINDOW_DAYS`.
4. Generates and persists questions at
   `SURVEY_QUESTION_GEN_LEAD_DAYS` before the send moment.
5. Marks the survey `in_review`.
6. Broadcasts at the persisted moment unless paused or cancelled.
7. Expires due links, closes active surveys, and queues insight jobs.

The persisted schedule, unique project/month constraint, unique link cycle,
and deterministic queue IDs make repeated hourly ticks safe.

## 6. Manual surveys

The manager flow:

1. `POST /projects/:projectId/surveys/generate-questions`
2. Review and edit Gemini-scored questions in the existing modal.
3. `POST /projects/:projectId/surveys`
4. Persist the survey, questions, and health-context snapshot.
5. Enqueue a deterministic send job.
6. The worker creates or reuses `manual-<surveyId>`, broadcasts once, stores
   channel results, sets the project-member count as the audience target, and
   marks the survey active.

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

- bundle id;
- cycle id;
- response deadline.

The token is not stored. Public requests:

1. decrypt and authenticate the token;
2. reject payload expiry before database work;
3. verify bundle id, cycle id, pending state, and database expiry;
4. verify the linked survey is active;
5. verify every question belongs to that survey;
6. reject duplicate question ids;
7. enforce text length `1..4000`;
8. enforce integer scale values `1..5`;
9. require exactly one text or scale value;
10. commit response and answers atomically.

The frontend sends one random UUID per response attempt. Repeating the same
request returns the original response id and does not duplicate answers. This
protects against accidental retry/double-click without identifying a person.

Public form loads are limited to 60 per IP/15 minutes. Submissions are limited
to 10 per IP/15 minutes. These are abuse controls, not identity controls.

## 10. Closing, privacy, and aggregation

Shared links are reusable until closed. A survey closes:

- automatically when `expires_at` passes; or
- when a manager closes it.

Closing updates both survey and link state before queuing analysis.

`SURVEY_MIN_ANONYMOUS_RESPONSES` defaults to 5 and is clamped to at least 3.
Below the threshold:

- Gemini analysis is skipped;
- raw answers are suppressed from admin API responses;
- the survey completes with an `insufficient_responses:<count>/<minimum>`
  reason;
- metrics health remains available and unchanged.

At or above the threshold, answers are grouped by question, Gemini produces
five category scores, themes, and narrative, and the validated result is
stored once per survey.

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
Successful channel booleans and `notified_at` are persisted on the bundle so a
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
- `GET /api/v1/projects/:projectId/surveys`
- `GET /api/v1/projects/:projectId/surveys/quota`
- `GET /api/v1/projects/:projectId/surveys/schedule`
- `GET /api/v1/projects/:projectId/pending-survey`
- `GET /api/v1/surveys`
- `GET /api/v1/surveys/:surveyId`
- `PATCH /api/v1/surveys/:surveyId/questions`
- `PATCH /api/v1/surveys/:surveyId/lifecycle`
- `PATCH /api/v1/surveys/:surveyId/complete` (compatibility close endpoint)
- survey-category CRUD under `/api/v1/survey-categories`

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

- manual Gemini generation with visible quality scores;
- editable question wording and type;
- scheduled-survey review card;
- captured health-context summary;
- pause, resume, cancel, and save actions;
- expanded lifecycle statuses;
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

No automated migration runner exists. Apply:

```bash
psql "$DATABASE_URL" -f db/migration.sql
```

or run numbered files in order. `005_survey_shared_lifecycle.sql` also removes
legacy personal-delivery columns/tables if an older survey migration was
applied. The migration is safe to rerun.

Run API and worker as separate processes. Redis and the worker are required for
delivery, deadline closing, and insights.

Operational checks:

- worker logs show the hourly distribution job;
- `surveybundle.delivery_results` shows channel acceptance;
- `survey.sent_at` is the actual first successful broadcast time;
- `survey.closed_at` and `close_reason` explain collection closure;
- `survey.analysis_error` explains privacy skip/failure state;
- `surveyinsight.ai_model` records the model used;
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
