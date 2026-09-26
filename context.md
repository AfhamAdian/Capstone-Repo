# Project Context — "Pulse" Engineering Health Platform

> This document is a full technical context dump of the repository as it exists on `main`
> (last reviewed commit `a2d6f15`). It exists so a new contributor, a teammate writing the
> capstone report, or a future session of an AI assistant can get oriented without re-reading
> the whole codebase. It reflects what the code actually does, not what was originally planned —
> where the two differ (see `plan-action.md`, `plan-backend-implementaion.md`,
> `plan-frontend-implementation.md`), this document follows the code.

## 1. What the product is

Pulse is a web platform that continuously monitors the engineering health of software
projects by pulling metrics from the tools a team already uses (GitHub, GitLab, Jira,
Linear, SonarQube, GitHub Actions), turning those metrics into a set of interpretable
0–100 risk/health scores across seven categories, and pairing that quantitative signal
with **qualitative** signal gathered directly from developers via anonymous, AI-generated
pulse surveys. A third pillar, **action logging**, lets a team record what remediation
was tried for a given problem and later rate whether it worked, with semantic (AI
embedding-based) search over past actions so teams don't re-solve the same problem twice.

The intended user is an engineering manager or team lead responsible for a portfolio of
projects, who wants an early-warning system for security, reliability, maintainability,
CI/CD health, team health, process, and delivery-execution risk — without manually
digging through five different dashboards.

## 2. Repository layout

```
Capstone-Repo/
├── backend/            Express + TypeScript API and background worker
│   ├── apps/
│   │   ├── api/        HTTP server: routes, controllers, services, database access
│   │   └── worker/     Standalone BullMQ worker process (sync, surveys, embeddings)
│   ├── libs/           Shared library code (see §4)
│   ├── db/
│   │   ├── schema/     One .sql file per table — "context only", not executable migrations
│   │   └── migrations/ Early numbered migrations (superseded by supabase/migrations)
│   └── tests/          Node-native test suites for the semantic search pipeline
├── frontend/           React + TypeScript SPA (Vite)
│   └── src/app/        pages/, components/, hooks/, context/
├── supabase/migrations/  Authoritative, timestamped SQL migrations (current source of truth)
├── .github/workflows/ci.yml   CI pipeline (typecheck, lint, build, test, coverage)
└── docker-compose.yml  Local dev stack (Redis, likely Postgres/Supabase emulation)
```

Two independently deployable Node processes come out of `backend/`: the **API** (`apps/api/server.ts`,
listens on `PORT`) and the **worker** (`apps/worker/worker.ts`, listens on `WORKER_PORT`,
default 4000, for health-check probing only — its real job is consuming BullMQ queues).
They share the same `.env` and the same `libs/` code but must never bind the same port.

## 3. Tech stack

**Backend:** Node.js + TypeScript, Express, Supabase (Postgres) via `@supabase/supabase-js`,
Redis + BullMQ for job queues, `bcryptjs` for password hashing, `cookie-parser` for
session cookies, `helmet` + `cors` for HTTP hardening, `pino` for structured logging,
`morgan` for request logging, `@google/genai` (Gemini) for AI text generation and
embeddings, `@octokit/rest` (+ retry/throttling plugins) for GitHub, `@slack/web-api`
for Slack, `nodemailer`/`resend` historically for email (superseded by a direct Brevo
HTTP integration — see `email.service.ts`), `express-rate-limit`, `fast-xml-parser`,
`adm-zip`. Path aliases: `@libs/*` → `libs/*`. Vitest for unit tests (with V8 coverage
configured to report every source file, not just imported ones) plus three Node-native
(`node:test`) suites for the search pipeline, run separately via `test:actions`.

**Frontend:** React + TypeScript on Vite, React Router (`react-router`), Tailwind CSS
(with a `default_shadcn_theme.css` — shadcn/ui conventions layered on Radix UI
primitives: dialog, dropdown, tabs, tooltip, select, accordion, etc.), MUI (`@mui/material`,
`@mui/icons-material`) used alongside Radix, `recharts` for the score graphs, `sonner`
for toasts, `react-hook-form`, `date-fns`, `lucide-react` icons, `next-themes` for
dark/light mode, `motion` for animation, `cmdk` for command palettes, `canvas-confetti`
for celebratory UI moments (e.g. survey completion), `react-dnd` for drag-and-drop.

**Infrastructure:** Redis (BullMQ backing store + auth token/session stores), Supabase
Postgres (with `pgvector`-style `USER-DEFINED` embedding columns), Docker/`docker-compose.yml`
for local dev, Vercel config (`vercel.json` in both `backend/` and `frontend/`) for
deployment, GitHub Actions for CI.

## 4. Backend architecture

### 4.1 Request flow

`server.ts` builds the Express app: `helmet()` → CORS (credentialed, origin from
`env.frontendOrigin`, with `x-action-search-mode` explicitly exposed so the frontend can
tell whether a search response came from the semantic or lexical path) → `cookie-parser`
→ JSON/urlencoded body parsing → `morgan('dev')` → the versioned router mounted at
`/api/v1` → `notFoundMiddleware` → `errorMiddleware`. Routes are grouped in
`apps/api/routes/index.ts`:

| Mount | Router | Covers |
|---|---|---|
| `/health` | `health.route.ts` | Liveness/readiness, service status (`services.supabase`) |
| `/auth` | `auth.route.ts` | Register, login, logout, password reset, email verification, invites |
| `/sync` | `sync.route.ts` | Trigger a connector sync job for a project |
| `/progress` | `progress.route.ts` | SSE stream of sync-job progress |
| `/surveys` | `survey.route.ts` | Global/company-scoped survey admin |
| `/projects` | `project.route.ts` | CRUD, health feed, risk scores, tool integrations |
| `/projects/:projectId` | `project-survey.route.ts` | Project-scoped survey admin |
| `/workspaces` | `workspace.route.ts` | Workspace (multi-repo grouping) management |
| `/public/surveys` | `survey-public.route.ts` | Anonymous, token-authenticated survey answering |
| `/actions` | `actions.route.ts` | Action logging + semantic search + effectiveness review |

Each route delegates to a controller (`apps/api/controllers/*`), which validates input
and calls a service (`apps/api/services/*`), which contains business logic and calls
`apps/api/database/*` modules for Supabase access. `async-handler.ts` wraps controllers
so thrown errors reach `error.middleware.ts` instead of crashing the process.
`auth.middleware.ts` gates authenticated routes by reading the session cookie;
`authorization.service.ts` layers company/project-membership/role checks on top
(`requester-role.ts` centralizes the admin/member distinction).

### 4.2 Authentication & authorization

Session-based (not JWT): `libs/auth/session-store.ts` persists sessions (backed by
Redis, alongside `reset-token-store.ts`, `invite-token-store.ts`, and
`email-verification-store.ts` for the corresponding short-lived-token flows).
`auth.service.ts` owns registration (creates a `company` + `User` row, hashes the
password with `bcryptjs` at 10 rounds, enforces an 8-character minimum), login,
logout, invite-based signup into an existing company, and password reset — throwing a
typed `AuthError(message, status)` so the controller can map failures to the right
HTTP status without string-matching. Every `User` has a `role` of `admin` or `member`
scoped to a `company`; project-level access is additionally gated by `projectmember`
rows.

### 4.3 The sync pipeline (connectors)

"Sync" is the act of pulling fresh metrics for a project from its configured external
tools. `libs/sync/connector-registry.ts` maps a `SupportedTool` name (`github`,
`gitlab`, `jira`, `sonarqube`, `github-actions`, …) to a factory that constructs the
matching connector with credentials and project identifiers pulled from
`projecttoolintegration`. Connectors are grouped by domain, each behind a shared
interface so the risk engine doesn't care which vendor produced the numbers:

- **VCS** (`libs/connectors/vcs`): `GithubConnector`, `GitlabConnector` — commit/PR/review activity, ownership.
- **PM** (`libs/connectors/pm`): `JiraConnector`, `LinearConnector` — issue flow, planning accuracy.
- **Quality** (`libs/connectors/quality`): `SonarQubeConnector` — ratings, coverage, code smells, duplication, security hotspots.
- **CI/CD** (`libs/connectors/cicd`): `GithubActionsConnector` — pipeline success rate, deployment frequency, MTTR, lead time.

A sync request (`POST /sync`) is not processed inline — `sync.service.ts` enqueues a
job onto a BullMQ queue (`QueueManager`) and returns a `jobId` + SSE `streamKey`
immediately; the actual connector calls happen in the worker process
(`apps/worker/processors/sync-processor.ts`), and progress is pushed back to the
client over Server-Sent Events (`/progress` route) so the UI can show a live sync
banner (`SyncProgressBanner.tsx`, `SyncProgressOverlay.tsx`) rather than blocking on a
single long HTTP request. `libs/sync/map-with-concurrency.ts` bounds how many
connector calls run in parallel to respect third-party rate limits (this exact
concern is unit-tested in `connector-concurrency.test.ts`).

**Periodic sync**: beyond user-triggered syncs, a scheduled tick
(`syncScheduleQueue`, reconciled against `env.scheduledSyncTimes`/`scheduledSyncTz`
on every worker boot) re-syncs every project's configured tools automatically so the
health-score history keeps accumulating data points without anyone clicking "Sync."
Each tick fans out into the same per-project `sync` queue used by interactive syncs;
a deterministic `jobId` (rather than a random one) makes a retried tick idempotent.

### 4.4 Data model and history

Each sync run creates a `projectsnapshot` row (a timestamped checkpoint), and the raw
metrics pulled for that snapshot are stored as JSONB in per-domain tables keyed by
`snapshot_id`: `versioncontrolmetrics`, `codequalitymetrics`,
`projectmanagementmetrics`, `cicdmetrics`. This "one JSONB blob per domain per
snapshot" design means adding a new raw metric field never requires a migration —
only the risk-engine strategy that reads it needs to change. From those raw metrics,
a `riskscore` row is computed per snapshot with one numeric column per risk category
(`security_score`, `reliability_score`, `maintainability_score`,
`cicd_deployment_health_score`, `team_health_score`, `engineering_process_score`,
`planning_execution_score`, `overall_score`) plus a legacy/simplified
`projecthealthscore` table (delivery/code-quality/CI-CD/team-health/blockers +
overall) that can also carry a `survey_id` link when a completed survey's insight
folds into the score.

Multi-tenancy: `company` → `project` (with per-project connector credentials stored
directly on the row, e.g. `JIRA_TOKEN`, `GITHUB_TOKEN`, `sonar_token` — see §4.7 on
encryption) → `projectmember` (join table to `User`, carrying role) →
`projecttoolintegration` (one row per connected external tool per project, holding
`config` JSONB and `last_synced_at`). Projects can be grouped into a `workspace`
(added later — see `20260826000001_create_workspace_table.sql` — to let a company
organize many repos, e.g. by team or product line). `is_tracked` (added in the two
most recent commits) is a persisted boolean on the project/portfolio relationship
that survives across sessions, replacing an earlier client-local-only "bookmark"
that reset per device.

### 4.5 The risk engine

`libs/risk-engines/risk-engine.ts` is a thin strategy dispatcher: given a `RiskType`
and its typed metrics bundle, it delegates to one of eight strategy classes under
`libs/risk-engines/risks/<name>/*.strategy.ts` (security, reliability,
maintainability, cicd-deployment-health, team-health, engineering-process,
planning-execution, blockers), each independently unit-tested
(`*.strategy.test.ts`). `getLevel(score)` buckets any 0–100 score into
`LOW`/`MEDIUM`/`HIGH` at 40/70 thresholds.

The shared scoring math lives in `libs/risk-engines/scoring.ts` and is the most
carefully-designed piece of business logic in the backend: **null-aware weighted
scoring**. Each strategy expresses its category as a list of named signals (e.g.
security = `securityRating`, `vulnCountDensity`, `securityReviewRating`,
`securityHotspotsDensity`, `dependencyUpdateLag`, `securityRemediationEffort`), each
with a raw-value-to-0–100 conversion and a weight. `renormalizedWeightedScore()`
filters to only the signals actually present for that snapshot (a project without
SonarQube configured simply has fewer inputs), **renormalizes the remaining weights
to sum to 1**, and computes the weighted average — so a missing metric never drags
the score down or silently distorts the balance between the metrics that are
present. Helper conversions include `ratingToScore()` (SonarQube A–E rating → 100–0)
and per-1000-LOC density normalization so raw counts are comparable across projects
of different sizes.

`libs/risk-engines/signal-catalog.ts` is a purely descriptive lookup (human label +
originating raw metric field) per signal key, used only by the "score breakdown"
feature (`ScoreBreakdownModal.tsx`) to show a user *what a score was actually built
from* — it plays no role in the scoring math itself.

### 4.6 Survey system (see also `backend/survey.md` for the canonical deep-dive)

A survey is an anonymous, link-based questionnaire sent to every developer on a
project, either **manually** triggered by an admin or **auto-pulse** (scheduled
monthly). Two scoring systems exist side by side and are never mixed: the
connector-driven risk engine (`riskscore`) feeds dashboard tiles; anonymous survey
responses feed `survey.insight` (AI-analyzed, jsonb) which feeds a separate survey
results page. The risk engine's latest scores are handed to the AI *read-only* as
background context to write better questions — survey results never write back into
`riskscore`.

Lifecycle: `draft → active → closed → completed`, with `failed` as a recoverable
error state and `paused`/`cancelled` legal only before `sent_at`. Key mechanics:

- **Dispatch** (`survey-dispatch.service.ts`): claims the survey, mints a
  self-describing AES-256-GCM token (`libs/security/survey-token.ts`) embedding
  `cycle_id` and `expires_at`, broadcasts one link per cycle to Slack/Telegram/Discord
  (`libs/notifications/*`), and emails it individually to every eligible developer.
- **Question generation** (`survey-question-generation.service.ts` +
  `libs/ai/prompts/survey-questions.prompt.ts`): Gemini generates candidate
  questions from health context + raw metrics, which are then deduplicated
  (`libs/ai/dedup.ts`), scored (`survey-question-scoring.prompt.ts`), and gated down
  to a final set — purely from computed risk scores, with no manual admin override
  (a deliberate design revision — see the capstone report's Chapter 5 deviations).
- **Response collection** (`survey-response.service.ts`): the public route decodes
  the token, validates the cycle, and inserts into `survey_response`, which
  **deliberately carries no identity column of any kind** — anonymity is a schema-level
  guarantee, not an application-level promise.
- **Insight generation** (`survey-insight.service.ts` +
  `libs/ai/prompts/survey-analysis.prompt.ts`): once closed, Gemini analyzes all
  responses and writes back the 7 category scores, quantified insight bullets, and a
  one-line summary per question into `survey.insight`.
- **Distribution worker** (`survey-distribution-processor.ts`): an hourly tick that
  assigns each project's randomized monthly send moment, generates questions a
  configurable lead time beforehand, and auto-sends after the review window unless
  paused — idempotent, safe to run on every boot.
- **`survey_recipient`** tracks one row per (survey, developer) send attempt
  (`sent`/`skipped`/`failed` + reason), which is what cooldown/rotation logic reads
  to avoid over-surveying the same person.

### 4.7 Effectiveness review (action logging)

`actions` records remediation history: a `problem`, `reason`, `action_taken`,
`action_date`, who logged it, which `project_ids` it applies to, and an optional
1–5 `effectiveness` rating with `next_review_at` for deferral. The product rule
(see `plan-action.md`) is that a week-old action must not force a rating —
`next_review_at` lets an owner defer judgment ("not ready yet," 1/2/4-week presets)
without it being treated as an error state. The frontend
(`EffectivenessReview.tsx`, `WeeklyReviewBanner.tsx`, `InlineRating.tsx`) buckets
actions into "From last week" / "Earlier" / "Waiting for outcome" with deliberately
non-alarming styling (amber, not red, for overdue items) and a persistent,
non-modal reminder banner rather than an auto-opening dialog or a disappearing
toast.

**Semantic action search** (`actions-service` → `action-search.service.ts` →
`libs/embeddings/gemini-embedding.provider.ts` → `libs/reranking/pinecone-reranker.ts`):
when a new action is logged, an embedding job is queued
(`action-embedding.processor.ts`, via `ActionEmbeddingQueue`) that calls Gemini
(`gemini-embedding-001`, 768 dimensions) to embed the action's text and stores it in
`action_embeddings` (keyed by `(action_id, embedding_version)`, with a `status`
state machine — `pending → processing → ready`/`failed` — and `content_hash` so an
edited action re-embeds only when its text actually changed). Search queries the
embedding index and reranks with Pinecone; if Gemini is unconfigured or temporarily
unavailable, the system **falls back to PostgreSQL lexical search** transparently —
the response header `x-action-search-mode` tells the frontend which path served the
request. This fallback is deliberate resilience design, not a stopgap: it was
explicitly kept as a permanent code path, not removed once embeddings shipped.

### 4.8 Notifications, email, and secrets

`libs/notifications/` provides Slack (`@slack/web-api`), Telegram, and Discord
(webhook) clients behind a shared interface, used for survey broadcast and (per
`plan-action.md`) weekly review reminders. `email.service.ts` sends transactional
email (welcome, password reset, verification codes, survey invites) — originally
via Nodemailer over Gmail SMTP, migrated to Brevo's HTTP API (commit `fe4e8cb`)
after Gmail SMTP proved unreliable at the sending volume a multi-project portfolio
produces. `libs/security/secret-crypto.ts` encrypts sensitive per-project connector
credentials (Jira/GitHub/Sonar tokens) at rest; this was toggled off and back on
during development (commits `c54d984` → `aa77376`) while the team worked through an
issue with encrypted-value handling, then re-enabled once resolved.

### 4.9 Background job architecture

Everything asynchronous runs through BullMQ queues backed by Redis, each with its
own manager class under `libs/queue/`:

| Queue manager | Jobs | Purpose |
|---|---|---|
| `QueueManager` | `sync` | Per-project connector sync (interactive + periodic) |
| `ActionEmbeddingQueue` | embedding | Embed a logged action's text via Gemini |
| `SurveyQueueManager` | `survey-send`, `survey-insight`, `survey-distribution` | Dispatch, AI analysis, hourly scheduling tick |
| `SyncScheduleQueue` | scheduled sync ticks | Fan-out trigger for periodic sync, reconciled from env on boot |

The worker process (`apps/worker/worker.ts`) starts all of these, exposes a minimal
`/health` endpoint for platform health checks (Render, in this deployment), and
handles `SIGTERM`/`SIGINT` by closing every worker and queue connection cleanly
before exiting. `libs/queue/event-store.ts` backs the SSE progress stream so a
client that reconnects mid-sync can catch up on missed events instead of losing
progress state.

## 5. Frontend architecture

Single-page React app (`frontend/src/app/App.tsx`, routed via `react-router`).
Key pages (`app/pages/`):

- **Auth**: `LoginView`, `RegisterView`, `ForgotPasswordView`, `ResetPasswordView`
- **Onboarding**: `CreateWorkspaceView`, `AddProjectView`, `VcsWorkspaceView` (connecting a GitHub/GitLab org to import repos)
- **Core**: `Dashboard` (portfolio-level health overview), `ProjectsOverview` /
  `ProjectsView` (per-project detail: scores, graphs, sync controls),
  `GlobalActions` (cross-project action log), `Surveys` (admin survey management),
  `PublicSurveyPage` (the anonymous, token-authenticated survey-answering page —
  intentionally outside the authenticated app shell), `Settings`

Shared UI (`app/components/`): `Sidebar`/`TopBar`/`PageShell`/`AppLayout` form the
authenticated shell; `ScoreVisuals.tsx` + `ScoreBreakdownModal.tsx` render the
per-category risk scores and drill into the signals behind them (via
`signal-catalog.ts` from the backend); `DashboardSyncBar.tsx` +
`SyncProgressBanner.tsx` + `SyncProgressOverlay.tsx` surface the async sync
pipeline's live progress; `SurveyFlow.tsx` + `SurveyModals.tsx` drive the survey
admin/answering UX; `EffectivenessReview.tsx` + `WeeklyReviewBanner.tsx` +
`InlineRating.tsx` implement the action-review cohorting UX described in §4.7;
`LogActionModal.tsx` logs a new action.

State/data: `app/context/WorkspaceContext.tsx` holds the active workspace;
`app/hooks/` wraps data fetching per domain (`useProjectHealth`,
`useProjectSurveys`, `useSurveys`, `useProjectSurveySettings`, `useDashboardSync`,
`useTheme`). `app/api.ts` / `api-project.ts` / `api-survey.ts` centralize backend
calls; `app/types.ts` mirrors backend response shapes; `sync-session.ts` manages the
SSE connection lifecycle for a sync's progress stream.

Styling: Tailwind CSS with a shadcn/ui-style theme (`default_shadcn_theme.css`,
`styles/theme.css`) layered on Radix primitives, MUI used for some components,
`next-themes` for dark/light mode, `recharts` for the health-score history graphs.

## 6. Database schema summary

All tables live in Supabase Postgres, `public` schema. `backend/db/schema/*.sql` are
descriptive dumps ("context only, not meant to be run"); `supabase/migrations/*.sql`
are the real, applied, timestamped migrations.

| Table | Role |
|---|---|
| `company` | Tenant root |
| `User` | Login identity; `role` = admin/member; belongs to a `company` |
| `project` | A monitored repo/project; carries connector credentials directly (Jira/GitHub/Sonar tokens, base URLs) |
| `workspace` | Optional grouping of projects within a company (added later) |
| `projectmember` | User ↔ project membership + role |
| `projecttoolintegration` | One row per connected external tool per project (`tool_category`, `tool_name`, `config` jsonb, `last_synced_at`) |
| `projectsnapshot` | One row per sync run — the timeline anchor everything else hangs off |
| `versioncontrolmetrics`, `codequalitymetrics`, `projectmanagementmetrics`, `cicdmetrics` | Raw per-domain metrics as JSONB, keyed by `snapshot_id` |
| `riskscore` | Computed 7-category + overall score per snapshot |
| `projecthealthscore` | Simplified/legacy 5-category + overall score, can link a `survey_id` |
| `metricweight` | Per-project override of a metric's weight in scoring |
| `survey` | One row per survey cycle: status, source (manual/auto_pulse), questions (jsonb), insight (jsonb), health_context snapshot, delivery tracking |
| `survey_response` | Anonymous answers only — **no identity column** |
| `survey_recipient` | Per-(survey, developer) send-attempt tracking for cooldown logic |
| `project_survey_status` | Denormalized "does this project need a pulse check" UI flag |
| `actions` | Remediation log: problem/reason/action_taken/effectiveness/next_review_at |
| `action_embeddings` | Gemini embedding per action, keyed by `(action_id, embedding_version)`, with a pending/processing/ready/failed status machine |

Recent migrations (`supabase/migrations/`) show the schema evolving toward: dropping
dead/legacy columns (`drop_project_legacy_owner_repo`, `drop_projectmember_role`,
`drop_projecttoolintegration_dead_columns`, `drop_user_discord_user_id`), adding
workspaces, tightening action-embedding provider constraints to Gemini, converting
naive timestamps to `timestamptz`, and an "action company ownership review" pass —
i.e., normal schema-hardening work following the initial rapid build-out.

## 7. Testing and CI

`.github/workflows/ci.yml` runs on every push/PR to `main`, with a path filter
(`dorny/paths-filter`) so a backend-only or frontend-only change skips the
irrelevant job — both feed into a single required `ci-ok` status check for branch
protection. Backend CI: `typecheck` → `lint` → `build` → `test:coverage` (Vitest,
V8 coverage instrumented across **every** file under `apps/**`/`libs/**`, not just
files a test imports, so untested modules show as 0% instead of being silently
excluded) → `test:actions` (the three `node:test` suites for embeddings, the
Pinecone reranker, and end-to-end action search). Frontend CI: `typecheck` → `lint`
→ production `build` (with `VITE_API_BASE_URL=/api/v1` baked in, overridden at
actual deploy time). Unit tests exist per risk-engine strategy
(`*.strategy.test.ts`), for scoring math (`scoring.test.ts`), survey question
generation/response handling, secret encryption, survey tokens, DB timestamp
utilities, connector concurrency, and the sync-schedule/scheduled-sync processors.

## 8. Deployment

Both `backend/vercel.json` and `frontend/vercel.json` exist, and the worker exposes
a Render-style `/health` endpoint reading `process.env.RENDER`/`PORT` — indicating a
split deployment: the frontend and possibly the API on Vercel, the always-on worker
process (which can't be a serverless function, since it holds long-lived BullMQ
worker connections) on Render or similar. Local development uses
`docker-compose.yml` (Redis at minimum) plus a Supabase project reachable via
`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`.

## 9. Notable design decisions worth calling out

- **Null-aware, renormalized weighted scoring** (§4.5) — the single most
  distinctive piece of engineering in the risk engine; makes partial connector
  configuration (e.g. no SonarQube) safe rather than silently wrong.
- **Two scoring systems kept strictly separate** — connector-derived `riskscore`
  vs. AI-derived survey `insight` — to avoid one contaminating the other's meaning.
- **Anonymity as a schema guarantee** — `survey_response` has no identity column,
  by design, not by convention.
- **Deferred effectiveness review** — explicitly avoids pressuring an action owner
  to judge an outcome before evidence exists; a UX and ethics decision, not just a
  feature.
- **Semantic search with mandatory lexical fallback** — resilience against a
  single AI provider outage is a permanent code path, not a stopgap.
- **JSONB-per-domain-per-snapshot raw metrics** — new raw fields need no migration,
  only a risk-engine strategy change.
- **SSE for sync progress** rather than polling or blocking HTTP, because
  connector syncs can take long enough that a single request/response would be a
  poor UX.

## 10. Where to look for more detail

- `backend/survey.md` — the canonical, verified-against-source deep dive on the survey system.
- `plan-action.md` — original design rationale for the effectiveness-review UX (still accurate for intent, though "custom guidance" for survey generation described elsewhere in early plans was later removed).
- `backend/db/README.md` — schema file conventions.
- `Semantic-Action-Logging.md`, `periodic sync.md`, `all_metrics.md` — feature-specific design notes at the repo root.
