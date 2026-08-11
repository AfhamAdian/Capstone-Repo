# Survey Feature — Version Log

Format loosely follows [Keep a Changelog](https://keepachangelog.com/). Each entry
covers the survey module only (`backend/apps/api/src/{routes,controllers,services,database}/survey*`,
`backend/apps/worker/src/processors/survey*`, `backend/libs/{ai,notifications,security,queue}`).
See `survey.md` for the living design doc these versions implement.

---

## [1.1.0] - 2026-08-11

### Changed
- Standardized the system on one anonymous shared broadcast link and one
  monthly project pulse. Removed the unusable 50/50 member targeting model.
- Added persisted review deadlines, pause/resume/cancel/close lifecycle
  actions, deadline closing, and privacy-threshold analysis.
- Captured immutable project-health context for Gemini generation, quality
  scoring, and response interpretation; added strict JSON output validation.
- Made anonymous submissions transactional and retry-idempotent.
- Added survey/metrics provenance to blended project-health rows.
- Completed scheduled-review and respondent UX in the existing frontend.

### Removed
- Discord user identity migration/column, per-recipient email delivery,
  SendGrid dependency/configuration, direct-notification wrappers, single-use
  link mode, bundle user/member fields, and the bundle/survey join table.
- Per-member survey-delivery timestamps and round-selection code.

### Documentation
- Replaced `survey.md` with the post-implementation architecture, privacy,
  lifecycle, data-flow, operations, and extension-point reference.
- Simplified numbered migrations and the current-state schema; added
  `005_survey_shared_lifecycle.sql` for safe legacy cleanup and lifecycle
  upgrades.

---

## [1.0.0] - 2026-07-29

Baseline release. Full backend implementation of the AI-assisted developer
survey module: distribution, AI question generation/scoring, management,
aggregation, and custom categories.

### Added — Data model
- Migration `002_survey.sql`: `survey`, `surveyquestion`, `surveybundle`,
  `surveybundlesurvey`, `surveyresponse`, `surveyanswer`, `surveyinsight`,
  `projecthealthscore`; `project.pending_survey(_trigger)`,
  `projectmember.last_survey_sent_at`, `riskscore.blockers_score`.
- Migration `003_survey_categories_and_link_mode.sql`: `surveycategory`
  (5 built-ins seeded, protected), `surveybundle.mode`, nullable
  `surveybundle.user_id` / `surveybundlesurvey.project_member_id` (shared
  cohort bundles have no single owner).
- Migration `004_survey_scheduling_and_editing.sql`: `surveyschedule`
  (per-project, per-round send scheduling), `survey.first_sent_at`,
  `survey.questions_modified_at`.
- 7th risk category `blockers` added to `risk-calculation.service.ts`
  (metrics side), additive to the existing 6-category Sync feature.

### Added — AI (Gemini)
- `libs/ai/`: `GeminiAiClient` (generate / score / analyze) with
  `StubAiClient` fallback for keyless local dev.
- Question generation with a data-driven category list.
- Deterministic dedup (`libs/ai/dedup.ts`, token-set Jaccard) run before the
  paid scoring call.
- Question quality scoring — relevance / clarity / importance / diversity +
  holistic `overall` — with a configurable quality gate
  (`SURVEY_QUESTION_MIN_SCORE`) and result cap (`SURVEY_QUESTION_MAX_COUNT`).
- Shared `generateQualityQuestions` pipeline (`survey-question-generation.service.ts`)
  used by both the manual `generate-questions` endpoint and the auto-pulse
  scheduler, so the two flows can't drift apart.
- Response analysis → per-category scores, themes, AI insight; custom
  categories translated to their rubric bucket before scoring.

### Added — Survey management
- Admin endpoints: generate-questions, create+send, list (project + global),
  detail, complete, quota.
- `PATCH /api/v1/surveys/:surveyId/questions` — level-1-gated full-replace
  editing. Locked (`409`) once ≥1 response exists; sets `questionsModifiedAt`
  if edited after the survey's first dispatch. No approval workflow —
  editing is the review step.
- `survey-trigger.service.ts` sets `project.pending_survey` from
  sync-derived risk signals.

### Added — Distribution
- Manual "Send Survey Now": background job, 2/month cap
  (`MANUAL_SURVEY_MONTHLY_LIMIT`), mode-aware send.
- Automatic two-round (50/50) monthly rollout: each project independently
  assigned a randomized send moment inside each round's window
  (`SURVEY_ROUND1_START_DAY` / `ROUND2_START_DAY` / `ROUND_WINDOW_DAYS`),
  not a single org-wide blast. Hourly-tick processor
  (`survey-distribution-processor.ts`) handles schedule assignment, question
  generation (`SURVEY_QUESTION_GEN_LEAD_DAYS` before send), and dispatch as
  three idempotent steps.
- Global cross-project cap: a developer surveyed via one project is
  correctly excluded from another project's round in the same run
  (`project-member.ts::getLastSurveyedAtByUser`).

### Added — Link / anonymity model
- Switchable `SURVEY_LINK_MODE`: `shared` (default — one anonymous,
  non-consumed link per cohort per round, no `user_id`) vs `single_use`
  (per-developer, atomically consumed on submit). One env flag, no code
  change to switch.
- Self-describing AES-256-GCM encrypted token (`libs/security/survey-token.ts`)
  — bundle id / cycle id / deadline embedded, decodable without a DB
  round-trip; stateless expiry check before any DB hit.
- Per-IP rate limiting on public survey routes.

### Added — Notifications
- Per-recipient: email (SendGrid), Slack DM (`users.lookupByEmail` +
  `chat.postMessage`).
- Broadcast (shared-link mode only): Telegram (Bot API), Discord (incoming
  webhook).

### Added — Custom categories
- Full CRUD (`/api/v1/survey-categories`); built-ins protected from
  deletion/rubric-remap; in-use categories protected from deletion.

### Added — Scoring integration
- `health-score-blend.service.ts`: 60% metrics / 40% survey-sentiment blend
  into `projecthealthscore`, wired into both `sync-processor.ts` (non-fatal)
  and `survey-insight-processor.ts`.

### Added — Access control (interim)
- `apps/api/src/utils/requester-role.ts`: header-based level-1 (CEO/CTO)
  role check, explicitly a stand-in until real JWT auth exists — isolated to
  one function so the swap requires no call-site changes.

### Known gaps at this version
See the audit delivered alongside this changelog entry (chat) for the full
list — headline items: no frontend integration yet, no project-scoped
authorization (level-1 check is global, not per-project), no automated test
suite, no migration runner, `surveybundle.status='expired'` is declared but
never written.

---

## [1.0.1] - 2026-07-29

Closes the four gaps flagged at 1.0.0 as highest-priority: project-scoped
authorization, schedule visibility, a real test suite, and full frontend
integration of the previously fully-mocked survey UI.

### Added — Authorization
- `apps/api/src/services/authorization.service.ts::assertProjectAccess` —
  interim project-scoped check (mirrors `requester-role.ts`'s pattern: trusts
  `x-user-role`/`x-user-id` headers, not verified auth). Level-1 bypasses
  (org-wide oversight); everyone else must be a `projectmember` of the
  project they're calling into. Applied to the mutating project-scoped
  routes (`generate-questions`, create+send, `PATCH .../questions`,
  `PATCH .../complete`); read endpoints stay open, matching
  `GlobalSurveysView`'s existing cross-project visibility.
- `apps/api/src/utils/errors.ts` — shared `ForbiddenError`, now reused by
  both `survey.service.ts` and `authorization.service.ts` instead of a
  service-local duplicate.
- `database/project-member.ts::isProjectMember`.

### Added — Schedule visibility
- `GET /api/v1/projects/:projectId/surveys/schedule` — admin-facing view
  into the current month's auto-pulse rounds (`survey.service.ts::getSchedule`,
  `database/survey-schedule.ts::listSchedulesForProject`), so the
  previously worker-internal `surveyschedule` table is finally visible to
  the UI ("next pulse survey: Aug 3" becomes possible).
- `apps/api/src/utils/period-month.ts` — extracted the `'YYYY-MM-01'`
  formatting helper (was duplicated in the distribution processor) so both
  the API and worker key auto-pulse surveys identically.

### Added — Automated tests
- Vitest (`vitest.config.ts`, `npm test` / `npm run test:watch`), replacing
  the old hand-run `scripts/test-survey-token.ts` (removed).
- `apps/worker/src/processors/survey-round-selection.ts` — extracted the
  50/50 round-selection logic (`shuffle`, `selectRoundParticipants`) out of
  the distribution processor into a pure, dependency-free module so it's
  unit-testable without a database.
- 22 tests across 4 suites: `survey-token` (round-trip, tamper, expiry),
  `dedup` (near-duplicate detection), `survey-round-selection` (round
  math, no-mutation, pool integrity), `survey-question-generation.service`
  (dedup-before-score, quality gate, graceful degradation on scoring
  failure, never-empty fallback, max-count cap).

### Added — Frontend integration (`new_frontend/`)
Previously the entire survey UI (`SendSurveyModal`, `SurveysView`,
`GlobalSurveysView`, `SurveyFlow`, dashboard widget) was fully mocked with
zero backend calls. Now wired end to end:
- `src/app/api-survey.ts` — typed client for every survey endpoint
  (admin + public), mirroring `api.ts`'s existing `fetch`-based conventions.
- `src/app/hooks/useSurveys.ts` — fetches the global survey list plus full
  detail for completed surveys, mapped back onto the frontend's existing
  `Survey` shape via each project's `backendProjectId`. Lifted to the `App`
  root so `Dashboard`, `PortfolioView`, `SurveysView`, and
  `GlobalSurveysView` all get real data through the same prop they always
  received the mock array through — no per-view fetch logic needed.
  Demo-only projects (no `backendProjectId`) keep their static mock surveys,
  unioned in alongside the real ones.
- `SendSurveyModal` — now calls `generate-questions` on open (with a
  `trigger` input and a "Regenerate" action), shows each question's
  category/type/AI quality score, calls the real create+send endpoint, and
  surfaces the real quota (`GET .../quota`) and 429-on-exceeded errors.
  Demo-only projects keep the old fully-local mock flow unchanged.
- `SurveysView`'s "Question Guidance" instructions are now joined into the
  `customGuidance` string sent to question generation; its quota badge is
  now read-only, sourced from the real per-project quota endpoint (dropped
  the old locally-editable quota input, since the backend's cap is an
  env-configured constant, not a per-project setting).
- `src/app/components/SurveyFlow.tsx` (extracted from `App.tsx` to avoid a
  circular import with the new public page) — now supports a real,
  token-driven mode: renders the actual multi-project question set from
  `GET /public/surveys/:token` and submits real answers via
  `POST .../responses`, alongside its original local-only demo-preview mode.
- `src/app/pages/PublicSurveyPage.tsx` + a lightweight `/survey/:token`
  path match at the top of `App()` — the anonymous respondent link now
  resolves to a real, unauthenticated page (bypassing login/workspace
  gating entirely, since a developer clicking a survey link has no
  account). No routing library was introduced for this one path; the app's
  existing single-`screen`-state-machine architecture was preserved.

### Known gaps at this version
- No frontend TypeScript type-checking exists in `new_frontend/` at all
  (no `tsconfig.json`, no `typescript` devDependency) — verified this
  release only via `vite build` (catches syntax/resolution errors, not
  type errors). Recommended as a follow-up, scoped separately since
  retrofitting it onto ~2600 pre-existing lines may surface unrelated
  findings beyond this feature's scope.
- `surveybundle.status='expired'` is still declared but never written
  (unchanged from 1.0.0).
- No question-edit history/versioning, no resend-to-one-person action, no
  cancel/pause for an already-assigned schedule round.
- No CI pipeline; no OpenAPI spec; no request-schema validation library.

---

## [1.0.2] - 2026-07-29

### Added
- `SURVEY_MIN_DAYS_BETWEEN_SURVEYS` env var (default `15`) — the auto-pulse
  minimum-gap check in `database/project-member.ts::getEligibleMembersForAutoPulse`
  was previously hardcoded to 15 days; now configurable without a code change.
  Added to `config/env.ts`, `.env.example`, and `.env`.
- `backend/db/` — a new top-level folder consolidating all database schema
  and migration files, previously split only between
  `apps/api/src/database/schema.sql` (context-only reference) and
  `apps/api/src/database/migrations/*.sql` (survey feature's real migrations).
  See `backend/db/README.md` for the full layout and workflow. Summary:
  - `db/schema/001-004_*.sql` — the pre-survey base schema (13 tables),
    split out of `schema.sql` into per-domain files (users/companies,
    projects, metrics, risk) for readability. Context-only, same as before.
  - `db/schema/005_surveys.sql` — new: the survey feature's current-state
    schema, merged from migrations 002+003+004 into one reference file
    (mirrors how `schema.sql` documents "current shape," not history).
  - `db/migrations/002-004_*.sql` — **moved** from
    `apps/api/src/database/migrations/` (that directory no longer exists).
    No code ever imported these paths at runtime (pure SQL, applied
    manually), so the move is safe; two doc comments
    (`database/survey.ts`, `libs/risk-engines/types.ts`) and `survey.md`
    were updated to the new path.
  - `db/migration.sql` — new: all three migrations concatenated into one
    file, with every `CREATE TABLE`/`CREATE INDEX` upgraded to an
    `IF NOT EXISTS` guard, so the whole thing is idempotent and safe to run
    against a fresh, partially-migrated, or fully up-to-date database in a
    single `psql "$DATABASE_URL" -f db/migration.sql`.
  - `apps/api/src/database/schema.sql` itself is left in place (may be
    regenerated by a Supabase schema-dump tool) with a short note pointing
    to `db/`.

### Deferred (pending user input)
- Discord bot integration to send survey links per-recipient alongside
  Slack DM + SendGrid email. Discord's Bot API has no equivalent to Slack's
  `users.lookupByEmail` — a bot can only DM a user it already knows the
  Discord user ID for, so true per-recipient delivery needs an explicit
  identity mapping (e.g. a new `User.discord_user_id` column, populated out
  of band) that doesn't exist yet. Holding on schema/implementation until
  the user decides how Discord identity should be resolved.

---

## [1.0.3] - 2026-07-29

Resolves the deferred Discord decision (per-recipient DM, new identity
column) from 1.0.2.

> **Note:** partway through this version, `apps/api/src/*` and
> `apps/worker/src/*` were flattened to `apps/api/*` and `apps/worker/*`
> (the `src/` nesting removed) outside of this changelog's edits —
> `tsconfig.json`, `package.json` scripts, and every relative import were
> updated consistently. All file paths below reflect the new, flattened
> layout. No functional code changed as part of that move.

### Added
- `db/migrations/005_discord_user_id.sql` — `ALTER TABLE public."User" ADD
  COLUMN IF NOT EXISTS discord_user_id character varying`. Appended to
  `db/migration.sql`; noted in `db/schema/001_users_and_companies.sql`.
  Must be populated out of band (no admin UI or bot-command capture flow
  exists yet to collect it) — Discord's Bot API has no email-based user
  lookup, unlike Slack's `users.lookupByEmail`.
- `DISCORD_BOT_TOKEN` env var (`config/env.ts`, `.env.example`, `.env`) —
  separate from the existing `DISCORD_WEBHOOK_URL` (broadcast channel,
  unchanged, still shared-mode-only).
- `libs/notifications/discord.client.ts::sendSurveyLinkDiscordDM` — bot-based
  per-recipient DM: `POST /users/@me/channels` to open/reuse a DM channel,
  then `POST /channels/{id}/messages` to send, both authenticated with `Bot
  ${DISCORD_BOT_TOKEN}`. Silently no-ops (debug-logged, not an error) for any
  recipient without a `discord_user_id` on file — expected to be most
  recipients until the identity is populated some other way.
- `database/project-member.ts::getProjectMembersWithUser` now selects and
  returns `discordUserId`; `notify-survey-recipient.ts` fans out to email +
  Slack DM + Discord DM (was two channels, now three) in parallel, and both
  `survey-send-processor.ts` and `survey-distribution-processor.ts` pass
  `member.discordUserId` through. `SurveyLinkNotification` gained
  `recipientDiscordUserId`.
- `SURVEY_MIN_DAYS_BETWEEN_SURVEYS` env var (default `15`) — the previously
  hardcoded 15-day auto-pulse minimum gap
  (`project-member.ts::getEligibleMembersForAutoPulse`) is now configurable.
- `backend/db/` — new top-level folder consolidating the database schema and
  migrations (previously split across `apps/api/database/schema.sql` and
  `apps/api/database/migrations/`). See `db/README.md`. Summary:
  `db/schema/001-004_*.sql` (base schema split into per-domain files),
  `db/schema/005_surveys.sql` (survey feature's current-shape reference,
  merged from all migrations), `db/migrations/002-005_*.sql` (moved from
  `apps/api/database/migrations/`, now under `db/migrations/`), and
  `db/migration.sql` (all migrations concatenated, every statement
  `IF NOT EXISTS`-guarded, safe to run once against any environment:
  `psql "$DATABASE_URL" -f db/migration.sql`).

### Known gaps at this version
- Nothing yet populates `User.discord_user_id` — no admin field, no bot
  command, no onboarding step. The DM channel will silently do nothing
  until that identity gets linked some other way.
- Still no migration runner, no CI, no OpenAPI spec, no frontend
  type-checking (all unchanged from 1.0.1/1.0.2).

---

## [1.0.4] - 2026-07-29

First entry outside the survey feature proper: wires the dashboard's
project health score (previously 100% mock `PROJECTS` data) to the real
`projecthealthscore` table, which the Sync feature already populates on
every sync (see `health-score-blend.service.ts`, unchanged). Also fixes two
loose ends surfaced while testing the survey UI live.

### Fixed
- The frontend never sent the `x-user-role`/`x-user-id` headers
  `authorization.service.ts` (1.0.2) started requiring on mutating survey
  routes, so `generate-questions`/create+send/edit/complete all 403'd from
  the UI. `api-survey.ts::requesterHeaders` now defaults to a demo
  `x-user-role: level1` identity on every call — a stand-in until a real
  session exists, isolated to one constant
  (`DEMO_REQUESTER_ROLE`) so it's a one-line change later.
- `.env`: `DISCORD_WEBHOOK _URL` (stray space) → `DISCORD_WEBHOOK_URL`. The
  space meant the webhook broadcast was silently reading an unset env var.

### Added — Backend
- `database/project.ts::listProjects` / `getProject` — basic project rows
  (id, name, description, owner/repo, pending_survey flag). No auth/company
  scoping yet, matching the rest of this backend.
- `database/project-health-score.ts::listProjectHealthScoreHistory` —
  chronological `projecthealthscore` rows for a project; doubles as the
  source for current score, trend, sparkline, timeSeries, and per-category
  subscoreSeries with a single query (one row already exists per sync).
- `services/project.service.ts` — maps project + history into the
  dashboard's shape: `{score, scoreTrend, subscores, sparkline, timeSeries,
  subscoreSeries, pendingSurvey, lastUpdated, hasData}`. `hasData` is false
  for a project that's never been synced, so the frontend can tell "no data
  yet" apart from "score is genuinely 0" instead of just showing zeros.
  Deliberately scoped to health-score data only - raw ops metrics
  (commits, tickets closed, deployments, PR cycle time) read from a
  different set of snapshot tables and are **not** covered here; flagged as
  a follow-up, not silently done.
- `GET /api/v1/projects` (list, all projects + health) and
  `GET /api/v1/projects/:projectId/health` (single project detail) -
  `controllers/project.controller.ts`, `routes/project.route.ts`.

### Added — Frontend
- `src/app/api-project.ts` — typed client for the two new endpoints.
- `src/app/hooks/useProjectHealth.ts::useProjectHealthSync` — fetches real
  health for every project with a `backendProjectId` and merges it into the
  existing `projects` state **in place** (same `setProjects` mutation
  pattern `updateProjectRisk`, the SSE post-sync handler, already used) -
  so a live sync update keeps building on top of real data instead of the
  two competing. A project with `hasData: false` keeps its mock
  score/subscores/charts untouched rather than flashing to zeros; `name`/
  `team`/`description`/`pendingSurvey` are always overlaid from the
  backend. Demo-only projects (no `backendProjectId`) are left alone,
  consistent with how `useSurveys` (1.0.1) handles the same split.
- Wired into `App()` alongside the existing `useSurveys` call.

### Known gaps at this version
- Raw ops metrics (`project.metrics`/`metricSeries`: commits, tickets
  closed, sprint velocity, deployments, PR cycle time) are still 100% mock
  - a separate, larger wiring effort against the snapshot/metrics tables,
  not attempted here.
- `project.status` ("active"/"maintenance") and `project.tracked` have no
  backend source and stay frontend-only/mock.
- `GET /projects` has no pagination and no auth scoping - fine at current
  scale (a handful of projects), flagged for later.

---

## [1.0.5] - 2026-08-06

Simplifies survey link delivery from "message every recipient individually
on Slack/Discord" to "broadcast the link once to a shared Slack channel /
Discord server", disables email sending for now, and makes the response
deadline configurable instead of a hardcoded 7 days.

### Changed
- **Slack**: `slack.client.ts::sendSurveyLinkSlackMessage` (per-recipient
  DM via `users.lookupByEmail` + `conversations.open` + `chat.postMessage`)
  replaced with `sendSurveyLinkSlackBroadcast` — posts the shared link
  **once** to a configured channel (`SLACK_CHANNEL_ID`) via
  `chat.postMessage`, the same broadcast tier as Telegram/Discord. Moved
  from `notify-survey-recipient.ts` into `broadcast-survey-link.ts`.
- **Discord**: removed `discord.client.ts::sendSurveyLinkDiscordDM` (the
  bot-based per-recipient DM added in 1.0.3 - `POST /users/@me/channels`
  then `POST /channels/{id}/messages`). Only the incoming-webhook broadcast
  (`sendSurveyLinkDiscord`) remains. `DISCORD_BOT_TOKEN` is no longer read
  anywhere and was dropped from `.env`/`.env.example`; `User.discord_user_id`
  (migration `005_discord_user_id.sql`) is now unused by the notification
  pipeline but the column/migration is left in place.
- **Response deadline**: `SURVEY_RESPONSE_DEADLINE_DAYS` (new env var,
  default `7`, clamped server-side to a **7-15 day** range in
  `config/env.ts::surveyResponseDeadlineDays`) replaces the previously
  hardcoded `LINK_EXPIRY_DAYS = 7` in `survey-send-processor.ts` and the
  hardcoded `+ 7` in `survey-distribution-processor.ts`'s
  `dispatchScheduleRound`. Both now read `env.surveyResponseDeadlineDays`.
- `notify-survey-recipient.ts` now only calls `sendSurveyLinkEmail` (Slack/
  Discord DM calls removed) and its return type shrank to
  `{ emailSent: boolean }`. `broadcast-survey-link.ts` now fans out three
  channels (Slack + Telegram + Discord) instead of two, returning
  `{ telegramSent, discordSent, slackSent }`.
- `SurveyLinkNotification` (per-recipient type) dropped the
  `recipientDiscordUserId` field - no longer meaningful once Discord DM was
  removed. Call sites in both processors stopped passing
  `member.discordUserId` through.

### Disabled
- `email.client.ts::sendSurveyLinkEmail` — the actual `sgMail.send` call is
  commented out (not deleted); the function now short-circuits to `false`
  immediately. Per-recipient email delivery is off for now; re-enabling is
  a matter of un-commenting the block. `SENDGRID_API_KEY`/
  `SENDGRID_FROM_EMAIL` stay in `.env`/`.env.example` for when it's turned
  back on.

### Added
- `SLACK_CHANNEL_ID` env var (`config/env.ts`, `.env`, `.env.example`) -
  the channel the Slack bot broadcasts the shared survey link to.
- `SURVEY_RESPONSE_DEADLINE_DAYS` env var - customizable survey response
  window, 7-15 days, default 7.

### Removed
- `DISCORD_BOT_TOKEN` env var (no longer read anywhere - dropped from
  `.env`/`.env.example`).

### Docs
- `survey.md` §1/§5 and the top revision note updated to describe the
  broadcast-only delivery model, disabled email, and the customizable
  deadline; stale "email + Slack DM + Discord DM" language replaced
  throughout.

### Known gaps carried over from 1.0.4 (unchanged)
- No deadline-driven forced aggregation: a survey whose bundle `expires_at`
  passes without reaching `target_count` (and is never manually completed)
  stays unaggregated forever - nothing sweeps expired-but-incomplete
  surveys into `survey-insight`. More relevant now that shared-mode links
  aren't nudged out per-recipient, so completion rates may run lower.
- Delivery tracking (`surveybundle.notified_at`, per-channel success) is
  captured internally but never exposed via any API/admin view.
