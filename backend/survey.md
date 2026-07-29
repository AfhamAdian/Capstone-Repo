# Survey Feature — Backend Implementation Plan

## Context

`new_frontend/src/app/App.tsx` already has a fully-built, fully-mocked Survey UI (SendSurveyModal, SurveysView, GlobalSurveysView, SurveyFlow, SurveyRubricPanel, Dashboard survey widget) with no backend behind it at all. The backend (`backend/apps/api/`) currently only implements the Sync feature (metrics ingestion + risk scoring) — there is no survey data model, no AI integration, no notification integration, and no auth system anywhere in the repo. This plan designs the backend needed to make the existing survey UI real, plus a distribution strategy (confirmed with the user) that goes beyond what the mock UI shows: surveys are sent two ways — an admin-triggered "Send Survey Now" blast (rate-limited, background-worker-driven) and an automatic **two-round, 50/50 monthly rollout** that surveys developers periodically (not daily) to avoid survey fatigue.

> **Revision note (current design, 2nd pass).** Sections below reflect two rounds of decisions from the original plan. First pass: (1) automatic distribution became a **two-round 50/50 monthly rollout**, not a daily trickle; (2) survey links use a **switchable strategy** — default **one shared, anonymous link per cycle** (`SURVEY_LINK_MODE=shared`), per-developer single-use one env-flip away; (3) link delivery spans **four channels** (email + Slack per-recipient, Telegram + Discord broadcast); custom categories and AI question scoring/dedup were added. Second pass (this revision): (4) the two rounds are no longer a single org-wide blast on a fixed day — **each project gets its own randomized send moment** within a window around the round's anchor day, so projects don't all fire at once; (5) questions for each project's round are **auto-generated 2 days before its send moment**, with **no approval gate** — editing *is* the review step; (6) **level-1 users (CEO/CTO) can edit questions** any time up until the survey is dispatched, **and after** (an edit made post-dispatch sets a "modified" tag instead of being blocked); (7) editing is **permanently locked once ≥1 response has been submitted**. Where a section describes an older model, the revised behavior is called out inline.

Verified against the real schema (`backend/apps/api/src/database/schema.sql`, `backend/libs/risk-engines/types.ts`): the existing `riskscore` table and `RiskType` enum have exactly 6 categories (delivery, code_quality, engineering_process, cicd_reliability, team_health, security_risk) — no `blockers` category exists, and blocker-related metrics currently live inside `TeamHealthMetrics` (`blockedItemsCount`, `blockedItemsAvgAgeDays`, `overdueItemsCount`). The frontend's 5-category rubric (delivery/codeQuality/cicd/teamHealth/blockers, `App.tsx:65`, `App.tsx:1797-1803`) doesn't map 1:1 onto this, so the plan adds `blockers` as a 7th risk category rather than disturbing the existing 6, and keeps survey-derived "blended" scores in a new table separate from `riskscore` so the pure-metrics Sync feature is untouched.

Decisions confirmed with the user (current):
- **AI provider**: Google Gemini (2.5 Flash) for question generation, **question scoring**, and response analysis.
- **AI question quality**: generated questions are deduplicated (deterministic token-similarity pass) and then LLM-scored on **relevance / clarity / importance / diversity** + a holistic `overall`; only questions clearing `SURVEY_QUESTION_MIN_SCORE` survive, and at most `SURVEY_QUESTION_MAX_COUNT` are returned (see §3).
- **Manual "Send Survey Now"**: capped at **2 sends per project per calendar month**, executed via a background worker job (not synchronous), triggers all current project members at once.
- **Automatic distribution — two-round 50/50 monthly rollout, staggered per project**: round 1 opens on `SURVEY_ROUND1_START_DAY` (default day 1), round 2 on `SURVEY_ROUND2_START_DAY` (default day 15). Rather than every project firing at the same instant, **each project is independently assigned a randomized send moment** somewhere inside a `SURVEY_ROUND_WINDOW_DAYS`-day window around that anchor (default 3 days), decided once and persisted (`surveyschedule`, see §1/§4c) — so sends are spread out, not a single org-wide blast. Within each project's round, round 1 surveys a random ~50% of that project's *currently eligible* members, round 2 surveys the remainder. **Each developer still receives at most one survey per calendar month, enforced globally across all their project memberships** (not just within one project) via a live cross-membership check at the moment their project's round fires (a 15-day minimum gap also applies). Replaces the earlier daily-trickle and fixed-day-blast designs (see §4c).
- **Auto-generated questions, no approval gate**: for each project's round, questions are generated automatically **`SURVEY_QUESTION_GEN_LEAD_DAYS` (default 2) days before** that project's assigned send moment — through the same dedupe+score+quality-gate pipeline as manual generation (§3). There is no separate "approve before publish" step; the survey **auto-sends at the assigned moment regardless**. Editing (next bullet) is the review mechanism, not a gate that blocks sending.
- **Level-1 (CEO/CTO) question editing**: a per-project role check — **not full auth** (there is no login system yet) — restricts `PATCH /api/v1/surveys/:surveyId/questions` to callers whose role resolves to level-1 (see §8). Editing is allowed any time before the survey is sent **and after**: an edit made once the survey has already been dispatched at least once sets a `questions_modified_at` "modified" tag rather than being rejected, so respondents/other viewers can tell the form changed after going out. **Editing is permanently locked once ≥1 response has been submitted** — a live form can't be rewritten out from under someone who already answered it.
- **Link delivery — five channels** (revised in 1.0.3): email (SendGrid), Slack DM (`users.lookupByEmail` + `chat.postMessage`), and **Discord DM** (Discord Bot API) are **per-recipient**; Telegram (Bot API) + a Discord incoming-webhook are **broadcast** channels that post one shared link to a team group/channel. Slack resolves purely from `User.email` (no new column); Discord DM cannot - Discord's Bot API has no email-based lookup, so it needs `User.discord_user_id` (new column, `db/migrations/005_discord_user_id.sql`), populated out of band. A recipient with no linked Discord account simply has that channel skipped (logged, non-fatal) - email/Slack still cover them. All channels best-effort.
- **Link strategy — switchable, shared by default**: `SURVEY_LINK_MODE` selects the model (see §7):
  - `shared` (default): **one anonymous link per cycle**, reusable by the whole cohort. The bundle carries **no `user_id`**, so responses are provably untraceable. Not single-use. Broadcast channels are used only in this mode.
  - `single_use`: **one per-developer link**, atomically consumed on first submit. Switching is a single env flag — no code change.
  - Completion in shared mode is a **count** (there is no per-person "did they respond"); the 50/50 rollout is tracked via `projectmember.last_survey_sent_at`, not via who submitted.
- **Custom categories**: admins can create/edit/delete survey categories (see §1, §2, §8). The five built-ins (delivery/codeQuality/cicd/teamHealth/blockers) are seeded and protected; each custom category maps to one built-in rubric bucket so scoring/blending keeps working.
- **Recipients**: auto-derived from `projectmember`, no manual recipient picker.
- **Multi-project developers**: to honor "max one survey per developer per month", a developer selected in a round is surveyed for **exactly one** of their projects that month (chosen at random); they are then excluded for the rest of the month. (This supersedes the original "one combined multi-project link per developer" design — in shared-link mode a link belongs to a cohort, not a person, so per-developer bundling no longer applies. The `surveybundle`/`surveybundlesurvey` tables remain and still support per-developer bundling when `SURVEY_LINK_MODE=single_use`.)

---

## 1. Data model

New tables, added Supabase-style (no ORM), following `schema.sql`'s conventions. Migration files now live in `backend/db/migrations/` (moved out of `apps/api/src/database/migrations/` in 1.0.2 - see `backend/db/README.md`): `002_survey.sql` (core tables), `003_survey_categories_and_link_mode.sql` (custom categories + link-mode changes), `004_survey_scheduling_and_editing.sql` (scheduling + editing). A consolidated, idempotent `backend/db/migration.sql` runs all of them in one shot (`psql "$DATABASE_URL" -f db/migration.sql`) - still no automated migration runner, so this is the fast path for applying everything manually. `backend/db/schema/` holds the same schema split into per-domain "current shape" reference files (context-only, mirrors `schema.sql`'s existing convention), with `005_surveys.sql` being the merged result of all three survey migrations.

```sql
CREATE TABLE public.survey (
  id integer PRIMARY KEY DEFAULT nextval('survey_id_seq'),
  project_id integer NOT NULL REFERENCES public.project(id),
  status character varying NOT NULL DEFAULT 'sent', -- 'active' | 'sent' | 'completed'
  source character varying NOT NULL,                 -- 'manual' | 'auto_pulse'
  trigger character varying NOT NULL,                 -- e.g. "Open blockers exceeded threshold" or "Scheduled monthly pulse check"
  custom_guidance text,
  target_count integer NOT NULL DEFAULT 0,            -- grows incrementally for auto_pulse surveys
  response_count integer NOT NULL DEFAULT 0,
  sent_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  period_month date                                   -- first-of-month marker, used to find/create this month's auto_pulse survey per project
);

CREATE TABLE public.surveyquestion (
  id integer PRIMARY KEY DEFAULT nextval('surveyquestion_id_seq'),
  survey_id integer NOT NULL REFERENCES public.survey(id),   -- still per-project: survey.project_id gives the project
  category character varying NOT NULL,   -- 'delivery' | 'codeQuality' | 'cicd' | 'teamHealth' | 'blockers' — which rubric bucket this question feeds
  question_text text NOT NULL,
  question_type character varying NOT NULL, -- 'text' | 'scale'
  order_index integer NOT NULL
);

-- One link/token per DEVELOPER per distribution event — NOT per project.
-- A developer who belongs to multiple projects due to be surveyed in the same
-- cycle gets one bundle spanning several survey_id's, so they answer one combined
-- form instead of receiving N separate links.
CREATE TABLE public.surveybundle (
  id integer PRIMARY KEY DEFAULT nextval('surveybundle_id_seq'),
  user_id integer NOT NULL REFERENCES public.User(id),
  cycle_id character varying NOT NULL,   -- e.g. 'manual-<uuid>' or 'auto-<project_id>-<YYYY-MM>'; identifies the send batch, embedded in the token itself
  status character varying NOT NULL DEFAULT 'pending', -- 'pending' | 'used' | 'expired'
  scheduled_send_at timestamp with time zone NOT NULL DEFAULT now(),
  notified_at timestamp with time zone,               -- when email/Slack was actually dispatched
  expires_at timestamp with time zone NOT NULL,        -- the deadline; also embedded in the token itself
  used_at timestamp with time zone
);
-- No token/hash column: the link token is never persisted. It's an encrypted
-- payload derived from this row's own id/cycle_id/expires_at (see §7) and can be
-- regenerated identically at any time from the row, so nothing needs storing to validate it.

-- Join table: which per-project survey campaigns are bundled into this one link.
CREATE TABLE public.surveybundlesurvey (
  id integer PRIMARY KEY DEFAULT nextval('surveybundlesurvey_id_seq'),
  bundle_id integer NOT NULL REFERENCES public.surveybundle(id),
  survey_id integer NOT NULL REFERENCES public.survey(id),
  project_member_id integer NOT NULL REFERENCES public.projectmember(id), -- which membership row's last_survey_sent_at to update on send
  UNIQUE (bundle_id, survey_id)
);

CREATE TABLE public.surveyresponse (
  id integer PRIMARY KEY DEFAULT nextval('surveyresponse_id_seq'),
  bundle_id integer NOT NULL REFERENCES public.surveybundle(id), -- one response row per combined-form submission, spanning all bundled projects
  submitted_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.surveyanswer (
  id integer PRIMARY KEY DEFAULT nextval('surveyanswer_id_seq'),
  response_id integer NOT NULL REFERENCES public.surveyresponse(id),
  question_id integer NOT NULL REFERENCES public.surveyquestion(id), -- project + category derived by joining question -> survey -> project
  answer_text text,
  answer_scale integer
);

CREATE TABLE public.surveyinsight (
  id integer PRIMARY KEY DEFAULT nextval('surveyinsight_id_seq'),
  survey_id integer NOT NULL UNIQUE REFERENCES public.survey(id),
  ai_insight text,
  themes text[],
  delivery_score numeric, code_quality_score numeric, cicd_score numeric,
  team_health_score numeric, blockers_score numeric,      -- the 40%-weight sentiment side
  ai_model character varying,
  generated_at timestamp with time zone
);

CREATE TABLE public.projecthealthscore (   -- blended (60% metrics + 40% survey) score, frontend-facing
  id integer PRIMARY KEY DEFAULT nextval('projecthealthscore_id_seq'),
  project_id integer NOT NULL REFERENCES public.project(id),
  project_snapshot_id integer REFERENCES public.projectsnapshot(id),
  survey_id integer REFERENCES public.survey(id),
  delivery_score numeric, code_quality_score numeric, cicd_score numeric,
  team_health_score numeric, blockers_score numeric,
  overall_score numeric,   -- weighted 25/20/20/20/15 per App.tsx:1839-1841
  computed_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Existing table changes (002)
ALTER TABLE public.project ADD COLUMN pending_survey boolean NOT NULL DEFAULT false;
ALTER TABLE public.project ADD COLUMN pending_survey_trigger character varying;
ALTER TABLE public.projectmember ADD COLUMN last_survey_sent_at timestamp with time zone;
ALTER TABLE public.riskscore ADD COLUMN blockers_score double precision;
```

### Migration 003 additions (`003_survey_categories_and_link_mode.sql`)

Admin-managed custom categories, plus the link-mode column and NOT-NULL relaxations that let one shared bundle represent a whole cohort:

```sql
-- Data-driven survey categories. Questions still store a category `key` string,
-- but the valid set is now this table. Each category maps to one of the five
-- canonical rubric buckets so AI scoring/blending keeps working. The five
-- built-ins are seeded and is_builtin=true (cannot be deleted; rubric mapping
-- cannot change). Custom categories are deletable only when unused.
CREATE TABLE public.surveycategory (
  id integer PRIMARY KEY DEFAULT nextval('surveycategory_id_seq'),
  key character varying NOT NULL UNIQUE,
  label character varying NOT NULL,
  description text,
  rubric_category character varying NOT NULL, -- one of the 5 built-in keys
  is_builtin boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
-- seeds: delivery, codeQuality, cicd, teamHealth, blockers (is_builtin=true)

-- Link strategy (see §7). 'shared' => one anonymous cohort link (not consumed);
-- 'single_use' => per-developer link (consumed on submit). Default 'shared'.
ALTER TABLE public.surveybundle ADD COLUMN mode character varying NOT NULL DEFAULT 'shared';

-- A shared bundle has no single owning user/membership, so relax these:
ALTER TABLE public.surveybundle ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.surveybundlesurvey ALTER COLUMN project_member_id DROP NOT NULL;
```

### Migration 004 additions (`004_survey_scheduling_and_editing.sql`)

Per-project round scheduling (decouples "when does this project's round fire" from the monthly `survey` row, since one survey row spans both rounds), plus post-send question-editing metadata:

```sql
-- One row per (project, month, round). scheduled_send_at is a randomized
-- timestamp within that round's window, assigned once when the window opens.
CREATE TABLE public.surveyschedule (
  id integer PRIMARY KEY DEFAULT nextval('surveyschedule_id_seq'),
  project_id integer NOT NULL REFERENCES public.project(id),
  period_month date NOT NULL,
  round smallint NOT NULL, -- 1 | 2
  scheduled_send_at timestamp with time zone NOT NULL,
  survey_id integer REFERENCES public.survey(id),   -- filled in once the monthly auto_pulse survey exists
  questions_generated_at timestamp with time zone,
  sent_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT surveyschedule_unique UNIQUE (project_id, period_month, round)
);

-- Post-send editing metadata (see §4c/§8). first_sent_at is set once, the
-- first time this survey is actually dispatched; questions_modified_at marks
-- an edit made after that point. Neither blocks editing on its own - only
-- an existing response (checked via the derived response_count, not a column
-- here) permanently locks the questions.
ALTER TABLE public.survey ADD COLUMN first_sent_at timestamp with time zone;
ALTER TABLE public.survey ADD COLUMN questions_modified_at timestamp with time zone;
```

No `company.survey_quota_per_month` column — the 2/month manual cap is a simple `COUNT(*) FROM survey WHERE project_id=$1 AND source='manual' AND sent_at >= date_trunc('month', now())` query, capped by an env-configurable constant (`MANUAL_SURVEY_MONTHLY_LIMIT=2`), not a persisted per-company setting.

**Per-project aggregation now goes through the bundle/response join** rather than a direct FK, since one response spans multiple projects:
- `target_count` for a given `survey_id` = `COUNT(*) FROM surveybundlesurvey WHERE survey_id=$1` (how many bundles were asked to include this project).
- `response_count` for a given `survey_id` = `COUNT(DISTINCT sr.id) FROM surveyresponse sr JOIN surveyanswer sa ON sa.response_id=sr.id JOIN surveyquestion sq ON sq.id=sa.question_id WHERE sq.survey_id=$1` (a bundle submission counts toward a project only if it actually contains ≥1 answered question tagged to that project's survey).
- `database/survey.ts` should expose these as derived read functions rather than trying to keep `survey.target_count`/`response_count` columns perfectly in sync via triggers — simpler and less error-prone, at the cost of a join on read. (The `target_count`/`response_count` columns on `survey` can still be kept as cached counters updated at send/submit time for the common case, but the join-based query is the source of truth the detail endpoint should use.)

## 2. API surface

New files under `backend/apps/api/src/{routes,controllers,services,database}`, mounted in `routes/index.ts`, mirroring the existing `sync.route.ts` → `sync.controller.ts` → `sync.service.ts` → `database/*.ts` layering (thin routes with `asyncHandler`, controllers validate + call a service, services hold business logic, database files are plain `assertSupabaseClient()` functions).

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/projects/:projectId/surveys/generate-questions` | Sync AI call (Gemini): draft questions from `trigger` + `customGuidance`, for the modal's edit/preview step |
| POST | `/api/v1/projects/:projectId/surveys` | Admin "Send Survey Now" — validates 2/month cap, persists survey+questions, **enqueues a background job** (does not send synchronously) |
| GET | `/api/v1/projects/:projectId/surveys` | List for `SurveysView` |
| GET | `/api/v1/surveys?projectId=&status=&q=&sort=` | Global list for `GlobalSurveysView` |
| GET | `/api/v1/surveys/:surveyId` | Detail: `scores`, `aiInsight`, `themes`, `rawResponses`, plus `firstSentAt`, `questionsModifiedAt`, `questionsLocked` |
| PATCH | `/api/v1/surveys/:surveyId/questions` | **Level-1 only** (§8): full-replace a survey's questions. `403` if not level-1, `409` if ≥1 response already submitted (locked), sets `questionsModifiedAt` if the survey was already dispatched. No approval step — this endpoint IS the review step |
| PATCH | `/api/v1/surveys/:surveyId/complete` | Admin manually closes a survey early |
| GET | `/api/v1/projects/:projectId/surveys/quota` | `{used, limit: 2, remaining}` for the current month |
| GET | `/api/v1/projects/:projectId/pending-survey` | `{pendingSurvey, trigger}` |
| GET | `/api/v1/survey-categories` | List all categories (built-in + custom) |
| POST | `/api/v1/survey-categories` | Create a custom category (`label`, `rubricCategory`, optional `key`/`description`) |
| PATCH | `/api/v1/survey-categories/:categoryId` | Edit a category (built-in rubric mapping is protected) |
| DELETE | `/api/v1/survey-categories/:categoryId` | Delete a custom category (blocked for built-ins and in-use categories) |
| GET | `/api/v1/public/surveys/:token` | Anonymous: fetch the form for a bundle — questions **grouped by project**: `{ projects: [{ projectId, projectName, questions: [{id, category, text, type}] }] }` |
| POST | `/api/v1/public/surveys/:token/responses` | Anonymous: submit answers (keyed by `questionId`). Single-use in `single_use` mode; reusable (not consumed) in `shared` mode |

Note: `generate-questions` now returns **scored** questions (`{ questions: [{ category, questionText, questionType, score: { relevance, clarity, importance, diversity, overall, reason } }] }`) after dedup + quality gating (§3).

Controllers: `controllers/survey.controller.ts` (admin), `controllers/survey-category.controller.ts` (category CRUD), `controllers/survey-public.controller.ts` (anonymous, separate router — rate limiting on public routes).

Services: `services/survey.service.ts` (generate/create/list/detail/complete/quota + `editQuestions` with the level-1/lock/modified-tag logic), `services/survey-question-generation.service.ts` (shared dedupe+score+gate pipeline — used by BOTH the manual `generate-questions` flow and the auto-pulse scheduler, so they can't drift apart), `services/survey-category.service.ts` (category CRUD + built-in protection), `services/survey-response.service.ts` (bundle/token validation, answer submission, per-project completion + insight jobs), `services/survey-trigger.service.ts` (sets `project.pending_survey` from sync-derived risk signals), `services/health-score-blend.service.ts` (60/40 blend, see §5).

Database: `database/survey.ts` (now incl. `deleteQuestionsForSurvey`, `markQuestionsModified`, `markFirstSentAtIfAbsent`), `database/survey-schedule.ts` (per-project round scheduling - creation, due-for-generation/due-for-send queries, marking generated/sent), `database/survey-bundle.ts` (bundle creation incl. shared-cohort lookup + link mode, single-use consumption, per-project target/response counts via the join in §1), `database/survey-category.ts`, `database/survey-response.ts`, `database/survey-insight.ts`, `database/project-health-score.ts` — plain functions matching `database/risk-score.ts`'s style. `database/project-member.ts::getLastSurveyedAtByUser` computes the cross-project last-surveyed timestamp used for the global monthly cap.

`apps/api/src/utils/requester-role.ts` (§8) is the level-1 role check used by the questions-edit endpoint.

## 3. AI integration (Gemini)

New `backend/libs/ai/` module, parallel to `backend/libs/connectors/`:
- `libs/ai/types.ts` — `AiClient` interface with three methods: `generateSurveyQuestions(...)`, `scoreSurveyQuestions(...)` → `QuestionScore[]` (relevance/clarity/importance/diversity/overall per question), and `analyzeSurveyResponses(...)` → `{scores, themes, aiInsight}`.
- `libs/ai/GeminiAiClient/gemini-ai.client.ts` — uses the `@google/genai` SDK, model `gemini-2.5-flash` (configurable via `GEMINI_MODEL`).
- `libs/ai/StubAiClient/stub-ai.client.ts` — placeholder used when `GEMINI_API_KEY` is unset (local dev), so the whole pipeline runs without a live key; returns mid-high scores so the quality gate passes.
- `libs/ai/prompts/survey-questions.prompt.ts` (now takes a data-driven category list), `survey-question-scoring.prompt.ts`, `survey-analysis.prompt.ts`.
- `libs/ai/dedup.ts` — deterministic token-set Jaccard near-duplicate removal, run **before** the paid scoring call as a first line of defense (the LLM's `diversity` score is the second, semantic line).
- `libs/ai/client-factory.ts` — factory, same shape as `connectors/vcs/connector-factory.ts`.
- New env vars in `config/env.ts` + `.env`: `GEMINI_API_KEY`, `GEMINI_MODEL`, `SURVEY_QUESTION_MIN_SCORE` (quality-gate threshold on `overall`, default 60), `SURVEY_QUESTION_MAX_COUNT` (default 6).

Question **generation + dedup + scoring** is **synchronous** (admin is actively waiting in the modal): `survey.service.ts::generateQuestions` runs generate → `dedupeQuestions` → `scoreSurveyQuestions` → drop anything below the min score → return the best `MAX_COUNT` (with scores attached, for the modal). If scoring itself fails it degrades gracefully (returns the deduped set unscored rather than blocking the admin). Response analysis (`analyzeSurveyResponses`) is a **background job** triggered when a survey completes (see §4) — not on the critical path of any single anonymous submission.

## 4. Background jobs (BullMQ, extending `libs/queue/queue-manager.ts`)

Three new job types, processed in `backend/apps/worker/`:

**a. `survey-send` job** (manual "Send Survey Now"):
- Enqueued by `POST /projects/:projectId/surveys` after the 2/month check + question persistence.
- Processor `apps/worker/src/processors/survey-send-processor.ts`, honoring `SURVEY_LINK_MODE`:
  - **shared (default)**: mints ONE shared `surveybundle` (`cycle_id='manual-<surveyId>'`, `user_id=NULL`, `mode='shared'`), links this survey to it, emails every member the same link + Slack DM, then **broadcasts once** to Telegram + Discord, and sets `survey.status='active'`.
  - **single_use**: mints one per-developer bundle per member (`cycle_id='manual-<surveyId>-u<userId>'`, `mode='single_use'`) and sends only per-recipient channels (no broadcast — a personal link must never be posted to a group).
  - Either way, each member's `projectmember.last_survey_sent_at` is stamped, and `survey.first_sent_at` is set (once) so `PATCH .../questions` knows this is now a post-dispatch edit.

**b. `survey-insight` job** (AI analysis):
- Enqueued per-project when that project's derived `response_count >= target_count` (via the join in §1, checked in `survey-response.service.ts` after each submission) or on manual `complete`.
- Processor `apps/worker/src/processors/survey-insight-processor.ts`: loads all Q&A **for that one project's `survey_id`**, translates each question's category key to its rubric bucket (`survey-category.ts::getRubricCategoryMap` — a question tagged with a *custom* category still has to land in one of the 5 scored buckets), calls `aiClient.analyzeSurveyResponses`, saves via `database/survey-insight.ts`, calls `health-score-blend.service.ts`.

**c. `survey-distribution` job — per-project staggered two-round rollout, auto-send, no approval gate** (replaces both the original daily-trickle design and the first revision's single org-wide day-1/day-15 blast):
- A BullMQ repeatable job on an **hourly tick** (`0 * * * *`), processor `apps/worker/src/processors/survey-distribution-processor.ts`, running three steps every tick:
  1. **Assign due schedules** — for each round whose window is currently open (`isWithinWindow`, based on `SURVEY_ROUND1_START_DAY`/`ROUND2_START_DAY` + `SURVEY_ROUND_WINDOW_DAYS`), and each project without a `surveyschedule` row yet for that (project, month, round): create one with a `scheduled_send_at` picked uniformly at random within the window (`database/survey-schedule.ts::getOrCreateSchedule`, idempotent — decided once). This is what staggers projects instead of a single blast.
  2. **Generate questions** — for any schedule row where `now >= scheduled_send_at - SURVEY_QUESTION_GEN_LEAD_DAYS` and `questions_generated_at IS NULL`: ensure the project's monthly `auto_pulse` survey row exists, and if it has no questions yet, generate them via the **shared** `generateQualityQuestions` pipeline (§3/§2 — same dedupe+score+gate as manual generation). Round 2 reusing the same monthly survey row is a no-op here (questions already exist) — it just marks its own schedule row as generated. No approval step; generated questions are immediately live for level-1 editing (§8) and will be sent as-is if nobody edits them.
  3. **Send** — for any schedule row where `now >= scheduled_send_at` and `sent_at IS NULL`: live-query that project's eligible members (`getEligibleMembersForAutoPulse`, itself using `getLastSurveyedAtByUser` for the **global cross-project** monthly cap, re-checked fresh on every dispatch so a developer surveyed by an earlier project *in the same tick* is correctly excluded from a later one); round 1 selects a random ~50% of that eligible pool, round 2 takes the rest. Resolves the bundle for the active `SURVEY_LINK_MODE` (`cycle_id` includes the round: `auto-<projectId>-<YYYY-MM>-r<round>`), links it to the survey, sends per-recipient (email + Slack), broadcasts once per project cohort in shared mode (Telegram + Discord), stamps `last_survey_sent_at`, sets `survey.first_sent_at` (once), and marks the schedule row `sent_at`.
- Shares the same `survey`/`surveybundle`/`surveyresponse`/insight pipeline as manual sends; per-project attribution still comes from the question→survey→project join. `expires_at` for each round's bundle is `scheduled_send_at + 7 days` (not a fixed end-of-month value), so a late-month round 2 still gets a full response window.

## 5. Notification integration (email + Slack + Discord DM + Telegram + Discord webhook)

New `backend/libs/notifications/`:
- `notifications/email.client.ts` — SendGrid (`@sendgrid/mail`), `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`. **Per-recipient.**
- `notifications/slack.client.ts` — Slack Web API (`@slack/web-api`), `SLACK_BOT_TOKEN`. Resolves the recipient via `users.lookupByEmail(User.email)`, then `conversations.open` + `chat.postMessage`. **Per-recipient.** Falls back to email-only if lookup fails (logged, non-fatal).
- `notifications/telegram.client.ts` — Telegram Bot API `sendMessage` (global `fetch`, no new dep), `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`. **Broadcast** (posts one shared link to a team group).
- `notifications/discord.client.ts` — Discord incoming webhook (global `fetch`), `DISCORD_WEBHOOK_URL`. **Broadcast** (posts to a channel).
- `notifications/discord.client.ts::sendSurveyLinkDiscordDM` — bot-based per-recipient DM (`DISCORD_BOT_TOKEN`, `POST /users/@me/channels` then `POST /channels/{id}/messages`), skipped silently for recipients with no `discordUserId`.
- `notifications/notify-survey-recipient.ts` fans out the three per-recipient channels (email, Slack, Discord DM); `notifications/broadcast-survey-link.ts` fans out the two broadcast channels (called once per shared cycle, only in shared mode). All channels are best-effort — a failure/absence of any one never fails the job. Called only from the worker processors, never a request handler.

## 6. Scoring integration

`health-score-blend.service.ts::blendAndSaveProjectHealthScore(projectId)` — a **separate post-processing step**, not embedded inside the existing `risk-calculation.service.ts` (which stays pure-metrics, unchanged, now also computing a 7th `blockers_score` reusing the blocked-item metrics already in `TeamHealthMetrics`):
1. Fetch latest `riskscore` row (60%-metrics side, 5 relevant categories + blockers).
2. Fetch latest `completed` survey's `surveyinsight` row (40%-sentiment side). If none exists yet, skip blending — use metrics only.
3. Blend per category: `blended = metrics*0.6 + sentiment*0.4`.
4. `overall_score` via rubric weights: Delivery 25% / CodeQuality 20% / CI-CD 20% / TeamHealth 20% / Blockers 15% (`App.tsx:1839-1841`).
5. Insert into `projecthealthscore`.

Called from two places: `apps/worker/src/processors/sync-processor.ts` (right after existing risk calc, non-fatal try/catch) and `survey-insight-processor.ts` (after saving insight).

## 7. Anonymous response security — self-describing encrypted token

The link token is **not** a random opaque string looked up by hash — it's an encrypted, authenticated payload that embeds the bundle id, cycle id, and deadline directly, so the backend can decrypt it and read those fields without a DB round-trip, and so tampering (e.g. someone hand-editing a deadline) is cryptographically detected rather than merely unlikely.

- New module `backend/libs/security/survey-token.ts`:
  - `encodeToken({ bundleId, cycleId, deadline }): string` — JSON-serializes the payload, encrypts with **AES-256-GCM** using a server secret (`SURVEY_TOKEN_ENC_KEY`, 32-byte key, new env var in `config/env.ts` + `.env`), prepends the random IV, appends the GCM auth tag, base64url-encodes the whole thing for URL safety.
  - `decodeToken(token: string): { bundleId, cycleId, deadline } | null` — reverses this; returns `null` (never throws into the request path) if the auth tag doesn't verify (tampered/garbage input) or the payload doesn't parse.
- `surveybundle` needs no token/hash column at all (already reflected in §1) — the token is regenerated identically from `id`/`cycle_id`/`expires_at` whenever it needs to be re-sent, and nothing about it is persisted beyond those existing columns.
- **Request flow for both public endpoints**:
  1. `decodeToken(token)` — a `null` result is an immediate `400 Invalid link`, no DB hit at all.
  2. Check `deadline > now()` **statelessly from the decrypted payload** first — an expired link is rejected before touching the database.
  3. Only then load `surveybundle` by the decrypted `bundleId` to check `status` and `mode`.
- **Submit behavior depends on `surveybundle.mode`** (set at mint time from `SURVEY_LINK_MODE`, see §1/§7-mode):
  - **`single_use`**: atomic conditional UPDATE in `database/survey-bundle.ts::consumeBundle`:
    ```sql
    UPDATE surveybundle SET status='used', used_at=now()
     WHERE id=$1 AND status='pending' AND expires_at > now()
    RETURNING id;
    ```
    Zero rows → `409 Conflict`, reject before writing any answers.
  - **`shared`**: the bundle is **NOT consumed** (the whole cohort reuses one link). The submit path only rejects if the bundle is no longer `'pending'` (closed/expired). This is the deliberate trade-off of shared, provably-anonymous links: no per-person replay protection — completion is a count. Per-IP rate limiting (below) is the defense here.
- **Link mode as a one-flip switch** (`libs/security/survey-link.ts`): `getSurveyLinkMode()` reads `SURVEY_LINK_MODE` (default `'shared'`); every processor and the submit path branch on `isSingleUse(mode)`. Switching models requires no code change. In `shared` mode the bundle's `user_id` is `NULL`, so a response is untraceable to a person even in principle (anonymous by construction); in `single_use` mode `user_id` is set but `surveyresponse.bundle_id` is still never joined back to `User` when reading results (anonymous by policy).
- `surveyresponse.bundle_id` is audit-only; project attribution always comes from the question→survey→project chain, not the bundle.
- Public routes still get per-IP rate limiting (`express-rate-limit`) as defense-in-depth, since a leaked/guessed `SURVEY_TOKEN_ENC_KEY` would otherwise allow forging valid tokens — key must be treated with the same care as `SUPABASE_SERVICE_ROLE_KEY` (not committed, rotated if ever exposed).

## 8. Question editing: level-1 role check and lock rules

There is **no auth system in this repo at all** — no login, no JWT, no `User.role` column. Per the user's explicit direction, this is **not blocked on building real auth**: a lightweight, swappable role check is used now and is expected to be replaced once JWT auth exists, without touching call sites.

- `apps/api/src/utils/requester-role.ts`:
  - `getRequesterRole(request): string | null` — reads the caller's role from the `x-user-role` header (falls back to `requesterRole` in the JSON body). The frontend is expected to set this from whatever session info it already has.
  - `isLevel1(role): boolean` — checks membership in a small allowlist (`level1`, `ceo`, `cto`), case-insensitive.
  - **Migration path to real auth**: once JWT auth exists, replace the body of `getRequesterRole` with a read from the verified token's claims (e.g. `request.auth.role`). `isLevel1` and every caller (`survey.service.ts::editQuestions`, the controller) stay exactly the same — this is the one function meant to change.
- `PATCH /api/v1/surveys/:surveyId/questions` (`survey.controller.ts::updateSurveyQuestions` → `survey.service.ts::editQuestions`):
  1. `isLevel1(getRequesterRole(request))` — `403 Forbidden` if false. No project-membership check yet either (would also wait on real auth/roles being project-scoped); this is a global level-1 gate for now.
  2. Load the survey; `404` if missing.
  3. Check derived `response_count` (§1 join) — **`409 Conflict` if ≥1**, questions are permanently locked once anyone has answered (rewriting a live form under a respondent would corrupt their already-collected answers).
  4. Full-replace: `deleteQuestionsForSurvey` + `addSurveyQuestions` (safe pre-response — no `surveyanswer` row can reference the old question ids yet, since step 3 already guarantees zero responses).
  5. If `survey.first_sent_at` is set (the survey has already gone out at least once), call `markQuestionsModified` → sets `questions_modified_at`. This is purely informational (a "modified since sending" badge for the UI) — it never blocks or undoes the edit.
- No approval workflow exists or is planned: generated questions are immediately live, editable, and will be sent as-is at the scheduled moment if untouched. Editing *is* the review step (§4c), available continuously until locked by a response.

## Suggested build order

1. Migrations `002`–`004` (in `backend/db/migrations/`, or run the consolidated `backend/db/migration.sql` in one shot): all new tables + `project`/`projectmember`/`riskscore` column additions + `surveycategory` (built-in seeds) + `surveybundle.mode`/NOT-NULL relaxations + `surveyschedule` + `survey.first_sent_at`/`questions_modified_at`. Applied manually (no runner in repo).
2. `libs/security/survey-token.ts` (AES-256-GCM encode/decode) + `libs/security/survey-link.ts` (mode switch) — small, self-contained; unit-test tamper/expiry rejection first.
3. `libs/ai/` — Gemini client (`generate` + `score` + `analyze`), `StubAiClient`, prompts, `dedup.ts`. Stub fallback for local dev without a key.
4. `libs/notifications/` — email + Slack (per-recipient) and Telegram + Discord (broadcast), each independently testable/best-effort.
5. `database/survey*.ts`, `database/survey-bundle.ts`, `database/survey-category.ts`, `database/survey-schedule.ts`, `database/project-member.ts::getLastSurveyedAtByUser` read/write primitives.
6. `apps/api/src/utils/requester-role.ts` (level-1 check, §8) + `services/survey-question-generation.service.ts` (shared dedupe+score+gate pipeline, §3) — both small and used by multiple downstream pieces, build before them.
7. Admin routes/controllers/services (`generate-questions`, create+enqueue, list, detail, quota, `PATCH .../questions` edit) + `survey-categories` CRUD, using a stubbed worker so the API layer is testable before the worker exists.
8. `survey-send-processor.ts` (mode-aware manual send, sets `first_sent_at`) + public routes/controllers/services (decrypt token → fetch grouped-by-project form → submit; consume in single_use, not in shared).
9. `survey-insight-processor.ts` (incl. category→rubric translation) + `health-score-blend.service.ts`, wired into both processors.
10. `survey-distribution-processor.ts` (per-project staggered two-round scheduling: assign → generate → send) — build last; most novel/riskiest piece, benefits from the rest being proven via manual sends.
11. `survey-trigger.service.ts` wired into `sync-processor.ts` to maintain `project.pending_survey`.

## Verification

- `libs/security/survey-token.ts`: unit tests — encode→decode round-trips correctly; a flipped byte anywhere in the token fails decode (returns `null`, doesn't throw); a token with `deadline` in the past is rejected by the stateless expiry check before any DB call.
- AI quality pipeline: feed `generateQualityQuestions` a case that produces near-duplicates and confirm `dedupeQuestions` drops them; confirm questions below `SURVEY_QUESTION_MIN_SCORE` are gated out and at most `SURVEY_QUESTION_MAX_COUNT` come back, each with a `score`; confirm scoring failure degrades to the unscored deduped set rather than erroring; confirm the manual `generate-questions` endpoint and the auto-pulse processor produce consistent results (same shared helper).
- Custom categories: create/edit/delete via `/api/v1/survey-categories`; confirm a built-in cannot be deleted and its rubric mapping cannot change; confirm a custom category in use by a question cannot be deleted; confirm `generate-questions` respects the live category list; confirm a response to a *custom*-category question still lands in the right rubric bucket after `survey-insight-processor.ts`'s translation (not silently dropped).
- Question editing (§8): as a non-level-1 role, confirm `PATCH .../questions` returns `403`; as level-1, edit a not-yet-sent survey and confirm `questions_modified_at` stays null; edit an already-dispatched survey (`first_sent_at` set) and confirm `questions_modified_at` gets set; submit one response then attempt an edit and confirm `409` (locked) regardless of role.
- Link mode — **shared (default)**: run a manual send, confirm ONE shared bundle (`user_id NULL`, `mode='shared'`), that every member gets the same link, that a Telegram/Discord broadcast fires once, and that the link can be submitted **more than once** (not consumed) while still rejecting once closed/expired.
- Link mode — **single_use** (`SURVEY_LINK_MODE=single_use`): confirm one bundle per developer, no broadcast, and single-use rejection on double-submit (expect `409`).
- Unit-level DB: insert a project/projectmember fixture, run create-survey → mint a bundle → submit response → verify per-project `response_count` (via the join) increments.
- End-to-end manual flow: `POST /projects/:id/surveys` → confirm a `survey-send` job in Redis → confirm email/Slack/broadcast arrive with a working link → submit anonymously → confirm `survey-insight` fires once `response_count` reaches `target_count` → confirm `GET /surveys/:id` returns populated `scores`/`aiInsight`/`themes` → confirm `projecthealthscore` row appears.
- Staggered two-round distribution: run the hourly-tick processor with a mocked date on day 1 (round 1's window open), confirm each project gets its own `surveyschedule` row with a `scheduled_send_at` spread across the window (not identical across projects); advance the clock to `scheduled_send_at - 2 days` and confirm questions generate exactly once (round 2 reusing the same survey doesn't duplicate); advance to `scheduled_send_at` and confirm ~50% of that project's eligible members are notified, `last_survey_sent_at`/`first_sent_at` are stamped, and the schedule row is marked sent; repeat for round 2's window and confirm the *other* ~50% are picked and nobody is surveyed twice that month; seed a developer across 2 projects with different round timings and confirm they're excluded from the second project's round once the first has surveyed them (the live cross-membership check).
- Confirm the existing Sync feature (`riskscore`, `sync-processor.ts`) still behaves identically — the new `blockers_score` column and `health-score-blend` call must be additive.
