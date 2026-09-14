# Survey System — Technical Reference

How Pulse's developer-survey feature works end to end: creation, question generation, **dispatch (the sending mechanism)**, response collection, and AI analysis. Written for engineering understanding and for demo/presentation prep. Everything below is verified against the current source; file/line references are relative to `backend/`.

---

## 1. Overview

A survey is an **anonymous, shared-link questionnaire** sent to every developer on a project. One link is minted per survey ("cycle"), broadcast once to team chat channels (Slack / Telegram / Discord), and additionally emailed individually to eligible developers. Anyone with the link can answer; responses are stored with no identity attached. When the survey closes, Gemini analyzes all responses and writes back seven category health scores, quantified insight bullets, and a one-line summary per question.

Two independent scoring systems exist side by side and never mix:

| System | Source | Table | Feeds |
|---|---|---|---|
| **Risk engine** | Connector metrics (GitHub, CI/CD, Jira, etc.) | `riskscore` | Dashboard health tiles |
| **Survey analysis** | Anonymous developer responses | `survey.insight` (jsonb) | Survey results page |

The risk engine's latest scores + trend + raw metrics are handed to the survey system as *read-only background context* (to help the AI write better questions and interpret answers). Survey results are never written back into `riskscore` or `projecthealthscore`.

### 1.1 Component map

| Layer | File | Responsibility |
|---|---|---|
| Routes | `apps/api/routes/project-survey.route.ts`, `survey.route.ts`, `survey-public.route.ts` | HTTP surface (project-scoped, global, public/anonymous) |
| Controllers | `apps/api/controllers/survey.controller.ts`, `survey-public.controller.ts` | Request parsing, status codes |
| Admin service | `apps/api/services/survey.service.ts` | Lifecycle: generate → create → enqueue → list/detail → close → remind |
| **Dispatch service** | `apps/api/services/survey-dispatch.service.ts` | **The actual send: claim, mint link, broadcast, email, mark active** |
| Question pipeline | `apps/api/services/survey-question-generation.service.ts` | generate → dedupe → score → gate → select |
| Health context | `apps/api/database/survey-health-context.ts`, `incident-signals.ts` | Risk scores + trend + raw connector metrics snapshot |
| Response service | `apps/api/services/survey-response.service.ts` | Token decode, answer validation, anonymous insert |
| Insight service | `apps/api/services/survey-insight.service.ts` | Post-close AI analysis |
| Link token | `libs/security/survey-token.ts` | AES-256-GCM self-describing token |
| Broadcast | `libs/notifications/broadcast-survey-link.ts` + `slack/telegram/discord.client.ts` | One message per cycle to team channels |
| Email | `apps/api/services/email.service.ts` → `sendSurveyEmail` | Per-developer notification (Nodemailer / Gmail SMTP) |
| Queues | `libs/queue/survey-queue-manager.ts` | BullMQ: `survey-send`, `survey-insight`, `survey-distribution` |
| Workers | `apps/worker/processors/survey-*-processor.ts`, wired in `apps/worker/worker.ts` | Async execution of send / cron / analysis |

---

## 2. Data Model

| Table | Purpose |
|---|---|
| `survey` | One row per survey/cycle: `status`, `source`, `trigger`, `questions` (jsonb), `insight` (jsonb), `health_context` (jsonb snapshot), `scheduled_send_at`, `cycle_id`, `expires_at`, `notified_at`, `delivery` (jsonb), `sent_at`, `period_month` |
| `survey_response` | One row per anonymous submission: `submission_key` (client UUID), `answers` (jsonb array of `{questionId, answerText?, answerScale?}`) — **no identity column of any kind** |
| `survey_recipient` | One row per (survey, developer) email attempt: `status` (`sent`/`skipped`/`failed`), `skip_reason`, `sent_at` — this is what the cooldown/rotation math reads |
| `project.pending_survey` / `pending_survey_trigger` | A UI flag only — "this project looks like it needs a pulse check" — does **not** create a survey |

Sending-relevant columns on `survey`, and who writes them:

| Column | Written by | Meaning |
|---|---|---|
| `scheduled_send_at` | `SurveyService` (manual) / distribution cron (auto) | When the survey becomes due for dispatch. For a manual draft it doubles as the **review deadline** (§4.1). |
| `cycle_id` | `claimSurveyForSend` | Identifies this send cycle; embedded in the link and re-checked on every response. `manual-<surveyId>` or `auto-<projectId>-<YYYY-MM>`. |
| `expires_at` | `claimSurveyForSend` | Response deadline, also embedded in the token. |
| `notified_at` | `markSurveyNotified` | Set once the chat broadcast succeeded — the guard that prevents re-broadcasting on retry. |
| `delivery` | `markSurveyNotified` / `updateSurveyDelivery` | `{slackSent, telegramSent, discordSent, lastRemindedAt}` |
| `sent_at` | `markSurveySent` | Set last; flips status to `active` and permanently locks questions. |

The 7 rubric categories, used both by the risk engine and by survey questions/scores: `security`, `reliability`, `maintainability`, `cicdDeploymentHealth`, `teamHealth`, `engineeringProcess`, `planningExecution`.

---

## 3. Survey Lifecycle (states)

```
draft ──(dispatch succeeds)──▶ active ──(deadline OR manual close)──▶ closed ──(AI analysis)──▶ completed
  │                                                                                                  ▲
  └──(dispatch fails: all channels down / question-gen error)──▶ failed ──(admin retries)────────────┘
draft ──(admin pauses/cancels)──▶ paused / cancelled
```

- **draft** — created; questions may still be empty or under review. The only state (with `failed`) from which a send can be claimed.
- **active** — link is live and broadcast; `expires_at` is set; questions are frozen.
- **closed** — no longer accepting responses; analysis pending.
- **completed** — `survey.insight` has been written (scores/themes/question summaries).
- **failed** — dispatch or analysis threw (all broadcast channels unconfigured, malformed AI response, zero developers on an auto-pulse). Admin can retry.

Pause / resume / cancel are only legal **before** `sent_at` — `changeLifecycle` rejects them afterwards. Retry branches on `sent_at`: an unsent failure re-enters the send path, a sent failure (i.e. analysis failed) re-enqueues the insight job instead.

---

## 4. How a Survey Gets Created

Three distinct triggers. Only two of them actually create a `survey` row.

### 4.1 Manual — generate, review, then send (the normal admin flow)
1. Admin clicks **"Send Survey Now"** on the Surveys page → `SendSurveyModal`, trigger text defaults to `"Manual team pulse check"`.
2. **Generate**: `POST /projects/:id/surveys/generate-questions` → `SurveyService.generateQuestions` — captures health context, runs the full question-generation pipeline (§6), creates a `draft` survey (`source: 'manual'`) with `scheduled_send_at = now + SURVEY_QUESTION_GEN_LEAD_DAYS` (default 2 days). Calling it again reuses the same open draft instead of creating a second one (`findOpenManualDraft`), unless `force: true` is passed to regenerate the questions in place.
3. Admin reviews/edits the questions (`PATCH /surveys/:id/questions`) — **level-1 only** (`isLevel1`: `level1`/`ceo`/`cto`, read from the `x-user-role` header) and blocked once `sent_at` is set.
4. **Send**: `POST /projects/:id/surveys` → `SurveyService.createAndSendSurvey` — re-validates everything, sets `scheduledSendAt = now`, and enqueues a `survey-send` job. The worker dispatches immediately (§8).

> **Important:** `scheduled_send_at` on a manual draft is simultaneously the review deadline **and** an auto-send time. If nobody clicks Send, the hourly distribution cron picks the draft up once that moment passes (`listDueForSend` is not filtered by source) and dispatches it via `dispatchManualDraft`. The review window is a grace period, not an indefinite hold.

### 4.2 Manual — send now, skip review
`POST /projects/:id/surveys/send-now` → `SurveyService.sendNow` creates a bare `draft` survey with **empty questions** and enqueues the same `survey-send` job — the worker generates questions AND dispatches in one pass. (An API capability; the current frontend modal uses the two-step flow above.)

### 4.3 Auto-pulse — monthly recurring survey
An hourly BullMQ cron (`survey-distribution`, pattern `0 * * * *`, registered on worker boot) runs `processSurveyDistributionJob`, which does four things per tick:
1. **Assign a send moment** (`assignDueSurveys`) — for the current *and* next `period_month`, once `now` is within `SURVEY_QUESTION_GEN_LEAD_DAYS` of the window opening (window starts `SURVEY_MONTHLY_START_DAY`, spans `SURVEY_MONTHLY_WINDOW_DAYS`), every project gets a `getOrCreateMonthlyPulse` row with a **randomized** `scheduled_send_at` inside the window. Because the helper is get-or-create, the random moment is rolled once and never re-rolled. Trigger text: `"Scheduled monthly pulse check"`, `source: 'auto_pulse'`.
2. **Generate questions** (`processQuestionGeneration`) for any auto-pulse survey now within its lead-time window and still question-less.
3. **Dispatch** (`processSend`) any survey — manual or auto — whose `scheduled_send_at` has arrived.
4. **Expire** (`expireDueSurveys`) any `active` survey past `expires_at`; the worker then enqueues an insight job for each one closed.

The randomization is deliberate: it avoids every project's monthly survey landing in every developer's inbox on the same predictable day.

### 4.4 Metric-triggered — a UI hint, not a survey
After every sync's risk-score calculation, `evaluateSurveyTrigger` checks (priority order, first match wins):

| Condition | `project.pending_survey_trigger` |
|---|---|
| Blockers risk score < 50 | `"Open blockers exceeded threshold"` |
| Team health score < 40 | `"Team health score dropped"` |
| Planning & Execution score < 40 | `"Planning & Execution score dropped"` |

This only flips a flag an admin sees as a banner/badge — it never auto-creates a survey. The check is wrapped in try/catch and is explicitly non-fatal to the sync pipeline.

---

## 5. Quotas & Gates at Creation

| Gate | Default | Where enforced |
|---|---|---|
| Manual surveys per project per calendar month | **2** (`MANUAL_SURVEY_MONTHLY_LIMIT`, 1–20) | `generateQuestions`, `createAndSendSurvey`, `sendNow` → `Monthly manual survey limit reached (N/month)` (HTTP 429). Skipped when an open unsent draft already exists — editing a draft doesn't consume a new slot. |
| Review window before a manual draft auto-sends | **2 days** (`SURVEY_QUESTION_GEN_LEAD_DAYS`) | `keepOrAssignReviewWindow` (keeps an existing future value, otherwise assigns `now + leadDays`) |
| Question count/shape on send | 1–20 questions, 10–500 chars each, known category, type `text`/`scale`, no near-duplicates | `validateSurveyQuestions` |
| Trigger / guidance text length | trigger 3–500 chars, guidance ≤ 2000 chars | `normalizeSurveyText` |
| Question editing | level-1 role, and only while `sent_at` is null | `editQuestions` |
| Zero developers on the project | auto-pulse: dispatch marks `failed` / `analysis_error: 'no_project_developers'`. Manual paths pass `allowEmptyRoster: true`, so they broadcast to chat channels anyway with `targetCount = 0`. | `dispatchAnonymousSurveyBroadcast` |
| Concurrent double-send | atomic DB claim (`claimSurveyForSend`) — the loser is a silent no-op | `dispatchAnonymousSurveyBroadcast` |

---

## 6. Question Generation Pipeline

One function (`generateQualityQuestions`) is shared by the manual flow, the auto-pulse flow, and the just-in-time generation inside the send worker — so the three paths can never silently drift apart.

**Inputs**: project name, the fixed 7 rubric categories, `trigger`, the captured health context (§7), and optional admin-written `customGuidance`.

**Guidance is opt-in and supplementary, not a default input.** It is a purely frontend concept — a per-browser (localStorage), per-project list of free-text instructions on the Surveys page, with no backend table behind it; the backend just stores whatever string arrives in `survey.custom_guidance`. It starts **empty** for every project, so by default question generation is driven entirely by the health context — i.e. purely from risk scores + raw metrics. When guidance exists, the prompt frames it explicitly as secondary: *"Optional supplementary guidance from the admin (use only to steer emphasis within a category — the health context above is the primary signal for what to probe)"*.

**Steps** (`survey-question-generation.service.ts`):
1. **Generate** — Gemini is asked for 6–8 candidate questions, each tagged with exactly one category, weighted toward categories the health context shows as weak/declining and toward any listed incident. The prompt defaults to detailed `text` questions that ask *why* something is happening; `scale` (1–5) is reserved for occasional quick confidence checks. It also forbids mentioning numeric scores, percentages, people, or ticket/PR ids in the question text.
2. **Dedupe** (cheap, non-AI, before any paid scoring call) — `dedupeQuestions` tokenizes each question (lowercase, strip punctuation, drop stopwords) and computes Jaccard similarity against every question already kept, dropping anything ≥ **0.6** similar. First occurrence wins.
3. **Score** — Gemini scores every survivor 0–100 on *relevance*, *clarity*, *importance*, *diversity*, plus an *overall* verdict. A mismatched score count is a hard error (`Gemini returned an incomplete question-score set`).
4. **Quality gate** — questions below `SURVEY_QUESTION_MIN_SCORE` (default **60**, on `overall` only) are dropped. If none pass: `No generated question met the minimum quality score of 60` — no automatic retry.
5. **Category-balanced selection**, capped at `SURVEY_QUESTION_MAX_COUNT` (default **6**): first pass takes at most one question per category (highest-scored first) to maximize topic spread; a second pass backfills with the next-highest leftovers regardless of category.

---

## 7. Health Context & Trend (fed to the AI, read-only)

`captureSurveyHealthContext` reads **only** the `riskscore` table (`getLatestRiskScoreForProject`) for the 7 category scores and overall score — never `projecthealthscore`. It also computes a **trend vs. the previous snapshot**:

```
delta = current_score − previous_score
|delta| < 3          → steady
3 ≤ |delta| < 15     → gradual_increase / gradual_decrease
|delta| ≥ 15         → sharp_increase / sharp_decrease
```

Rendered as prompt lines like *"CI/CD & Deployment: 62.0 (up 18.4 pts since last sync — sharp improvement)"*, so the AI can probe what is actively changing rather than restate a static snapshot. With no prior snapshot, trend is omitted and generation still proceeds. If no risk score exists at all, `source: 'unavailable'` and the prompt says so explicitly.

**Raw connector metrics (`METRICS_IN_SURVEY`, default true).** `getLatestIncidentSignals` additionally reads the latest `projectmanagementmetrics`, `versioncontrolmetrics`, and `cicdmetrics` rows for the same snapshot (each stored as a single `metrics` jsonb blob) and extracts: spillover ratio + consecutive-spillover streak, mid-sprint additions, scope-creep rate, blocked and overdue ticket counts, stale PR count, PR cycle time, deployments/week, deployment failure rate, pipeline success rate, commits/week. These are rendered into the prompt as **plain-English incident lines** (e.g. *"About 40% of committed sprint work spilled into the next sprint."*), never as raw numbers the AI could parrot back, and never feed the risk calculation itself. The fetch is `.catch(() => null)` — a project with no metrics simply gets no incident block rather than a failed generation. Set `METRICS_IN_SURVEY=false` to fall back to risk-score-only context.

The whole context object is snapshotted onto `survey.health_context` at creation time, so analysis later interprets answers against the same picture the questions were written from.

---

## 8. The Sending Mechanism

This is the core of the feature. Three rules shape the entire design:

- **The API never sends.** Every admin path only *enqueues*; the worker is the sole executor of broadcast and email. That keeps a slow Slack/SMTP/Gemini call off the request thread and gives every send BullMQ's retry semantics for free.
- **One link per cycle, not per person.** A per-developer link would make responses traceable and defeat anonymity, so a bot posts one shared link to a team channel; the per-developer email is a *notification* carrying that same link, not an authentication mechanism.
- **Every step is idempotent.** Deterministic job ids, an atomic claim, and three separate "already done" markers (`cycle_id`, `notified_at`, `sent_at`) mean a retried or duplicated job re-does nothing that already happened.

### 8.1 Queues (BullMQ + Redis)

| Queue | Enqueued by | Processor | Concurrency | What it does |
|---|---|---|---|---|
| `survey-send` | API on every manual send / send-now / retry | `survey-send-processor.ts` | 2 | Generates questions if still empty, then dispatches |
| `survey-distribution` | Self-scheduling repeatable cron `0 * * * *`, registered on every worker boot (BullMQ dedupes by name+pattern) | `survey-distribution-processor.ts` | 1 | Assigns auto-pulse send times, generates their questions, dispatches due surveys, expires finished ones |
| `survey-insight` | API on manual close; worker for every survey the hourly sweep just closed | `survey-insight-processor.ts` | 2 | AI analysis, writes `survey.insight`, flips status to `completed` |

Job ids are deterministic (`survey-send-<id>`, `survey-insight-<id>`), so a duplicate enqueue throws "already exists" and is swallowed as a no-op — the first idempotency guard. Both job types retry 3× with exponential backoff (2s base). A terminal failure on `survey-send` also writes `status: 'failed'` + the error message onto the survey from the worker's `failed` listener, so the admin UI can offer Retry.

### 8.2 End-to-end send path

```
Admin clicks Send                      Hourly cron tick (0 * * * *)
        │                                        │
POST /projects/:id/surveys              processSurveyDistributionJob
        │                                        │  assign → generate → send → expire
SurveyService.createAndSendSurvey                │
  validate + quota + persist draft               ├─ manual draft due?  dispatchManualDraft
  scheduled_send_at = now                        └─ auto pulse due?    dispatchMonthlyPulse
        │                                        │
enqueueSurveySend(surveyId)  ──▶ Redis ──▶ survey-send worker
                                             processSurveySendJob
                                               questions empty? generate (§6)
                                                        │
                                                        ▼
                            ┌──────── dispatchAnonymousSurveyBroadcast ────────┐
                            │ 1. load survey; bail if missing/paused/cancelled │
                            │    or sent_at already set                        │
                            │ 2. count developers (role='member')              │
                            │    zero + !allowEmptyRoster → status=failed      │
                            │ 3. claimSurveyForSend  ← ATOMIC, sets cycle_id   │
                            │    + expires_at; only if sent_at IS NULL and     │
                            │    status ∈ (draft, failed). Loser returns null. │
                            │ 4. mint token → publicSurveyUrlFor(survey)       │
                            │ 5. if !notified_at: broadcastSurveyLink()        │
                            │      Slack ‖ Telegram ‖ Discord (Promise.all)    │
                            │      all three false → throw (survey → failed)   │
                            │      else markSurveyNotified(delivery)           │
                            │ 6. emailEligibleDevelopers()  ← try/catch'd      │
                            │ 7. setSurveyTargetCount(developerCount)          │
                            │ 8. markSurveySent()  → status = 'active'         │
                            └──────────────────────────────────────────────────┘
```

Ordering reasoning:
- **Claim before doing anything external.** Nothing irreversible (no message, no email) happens until the row is exclusively claimed, so two racing workers can never both post the link.
- **Broadcast before email.** The chat broadcast is the primary distribution path and the one that can fail the whole dispatch; email is supplementary and wrapped in try/catch so a broken SMTP box can't undo a successful broadcast or leave the survey stuck in `draft`.
- **`markSurveySent` last.** `sent_at` is the "this cycle is done" marker read by every other guard, so it's written only after the work it claims to represent has actually happened.

### 8.3 The atomic claim

```sql
UPDATE survey
   SET cycle_id = :cycleId, expires_at = :expiresAt, analysis_error = NULL
 WHERE id = :id AND sent_at IS NULL AND status IN ('draft','failed')
RETURNING id;
```

Zero rows returned ⇒ somebody else already claimed it (or an admin paused/cancelled/sent it in the meantime) ⇒ `dispatchAnonymousSurveyBroadcast` returns `null` and the job completes quietly. This is what makes a BullMQ retry, a duplicate enqueue, a double-click, and a cron tick that overlaps a manual send all safe. `markSurveyNotified` and `markSurveySent` use the same conditional-update trick (`WHERE notified_at IS NULL` / `WHERE sent_at IS NULL`).

### 8.4 The link and its token

`buildSurveyUrl(token)` → `${SURVEY_FORM_BASE_URL}/${token}` (defaults to `${FRONTEND_URL}/survey`; a loopback URL configured in production is ignored in favour of the real frontend origin).

The token (`libs/security/survey-token.ts`) is **self-describing and encrypted**, not a random opaque id:

- Payload `{surveyId, cycleId, deadline}` → JSON → AES-256-GCM with a random 12-byte IV → `base64url(iv ‖ authTag ‖ ciphertext)`.
- Key from `SURVEY_TOKEN_ENC_KEY`, base64url, must decode to exactly 32 bytes; missing/short key throws at encode time.
- **Why encrypted rather than a DB-stored random token:** the survey id and deadline travel inside the link, so expiry can be rejected with zero DB round-trips, and GCM's auth tag means a tampered token fails to decrypt rather than silently resolving to another survey. There is no token table to keep in sync.
- `decodeToken` **never throws** — any malformed, tampered, or undecryptable token returns `null`, and callers treat that as a plain "invalid link". It also range-checks every field after decryption (positive integer id, non-empty cycle id ≤ 200 chars, parseable date).
- The token is **not** the authorization: on every request `loadOpenSurvey` re-checks that the survey exists, that `cycle_id` matches the token, that `expires_at` matches the token's deadline *exactly*, that the deadline is in the future, and that status is `active`. An old link from a previous cycle therefore stops working even if it hasn't expired on the clock.

`expires_at` = send moment + `SURVEY_RESPONSE_DEADLINE_DAYS` (default **7**, clamped 7–15).

### 8.5 Chat broadcast

`broadcastSurveyLink` fans out to all three channels in parallel (`Promise.all`) and returns `{slackSent, telegramSent, discordSent}`:

| Channel | Transport | Config | Failure mode |
|---|---|---|---|
| Slack | `chat.postMessage` via the bot client | `SLACK_BOT_TOKEN` + `SLACK_CHANNEL_ID` | logs a warning, returns `false` |
| Telegram | `POST api.telegram.org/bot<token>/sendMessage` | `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | non-OK status or throw → `false` |
| Discord | `POST` to an incoming webhook (expects 204) | `DISCORD_WEBHOOK_URL` | non-OK status or throw → `false` |

Each channel is independently best-effort — one being unconfigured or erroring never blocks the others. **If all three return false, dispatch throws** (`Survey link was not delivered: configure at least one broadcast channel`) and the survey ends up `failed`; a survey nobody can see isn't worth marking active. The result is persisted to `survey.delivery` so the detail view can show which channels carried it.

The same function is reused for reminders with `kind: 'reminder'`, which only changes the message wording.

### 8.6 Per-developer email — eligibility, cooldown, rotation

Run once per survey inside dispatch (`emailEligibleDevelopers`), in this exact order:

1. **Idempotency gate** — if *any* `survey_recipient` row already exists for this survey, return immediately. A retried send job never re-emails anyone.
2. **Who counts as a developer** — every `projectmember` row for the project, filtered to `User.role === 'member'` (role lives on `User`, not on `projectmember`).
3. For each developer, in priority order:
   - **a. Cross-project rotation fairness** — only applies if the developer is on **more than one project**. Compare how many surveys they have ever been successfully emailed for *this* project against every *other* project they're on. If this project is strictly ahead of the least-surveyed sibling, skip (`skip_reason: 'rotation_wait_for_other_projects'`). **Not a permanent block** — once every sibling catches up, this project is eligible again. Rationale: without it, one project could monopolize a multi-project developer's attention and starve every other project; a permanent "only once ever" rule would instead go silent everywhere after one round.
   - **b. 15-day global cooldown** (`SURVEY_MIN_DAYS_BETWEEN_SURVEYS`, default 15, range 1–60) — if they received *any* successful survey email, for *any* project, less than 15 days ago, skip (`skip_reason: 'cooldown_active'`).
   - **c. Otherwise send** — `sendSurveyEmail`, record `status: 'sent'`. If the send throws, record `status: 'failed'` with the error message truncated to 200 chars.

```
                 ┌─ this project's send-count > lowest sibling's count? ──▶ skip (rotation)
developer ──▶    ├─ emailed for ANY project in the last 15 days? ────────▶ skip (cooldown)
                 └─ otherwise ───────────────────────────────────────────▶ send, record status
```

Worked example: a developer on Projects A and B, both at 0. A sends first (A=1, B=0) — A is now ahead, so A's next attempt is skipped in favour of B. Once B sends (A=1, B=1) they're tied and either is eligible, subject to the 15-day cooldown. Add a project C at 0 later and both A and B wait for C to catch up.

Every outcome — sent, skipped with reason, or failed — is written to `survey_recipient`, giving a complete audit trail of who got what and why. Insert conflicts on the unique `(survey_id, user_id)` pair are swallowed (`23505` ⇒ already recorded), a third idempotency layer.

Transport is Nodemailer over Gmail SMTP (`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM`). **With no SMTP credentials configured, `sendSurveyEmail` logs the link and returns normally** — so in local dev recipients are still recorded as `sent`. That is deliberate for dev ergonomics, but worth knowing before reading `survey_recipient` as proof that mail actually left the building.

### 8.7 Auto-close (deadline sweep)

There is no per-survey delayed job for closing. The same hourly `survey-distribution` tick runs `expireDueSurveys`, closing any `active` survey past `expires_at` with `close_reason: 'deadline'` and returning their ids; the worker then enqueues one `survey-insight` job per closed survey. Consequence: an expired survey can remain `active` for up to ~1 hour before the sweep catches it — it is not an exact-time trigger.

### 8.8 Reminders

`POST /surveys/:id/remind` → `SurveyService.remindActiveSurvey` re-broadcasts the **existing** link to chat channels only (no second email round), and runs **fully synchronously in the API — no queue**, since it is a single fast call with nothing to generate. Guards: survey must be `active`, must already have a public link, and its own **15-minute** cooldown (distinct from the 15-*day* email cooldown) read from `delivery.lastRemindedAt`. All channels failing throws, same as dispatch.

---

## 9. Backend vs. Worker — task distribution

| Runs in **API** (synchronous, on HTTP request) | Runs in **Worker** (async, via queue job) |
|---|---|
| Question generation for the manual flow (calls Gemini directly on request) | Question generation for auto-pulse and send-now (same function, on a queue tick) |
| Quota checks, question validation and level-1 editing | Actual Slack/Telegram/Discord broadcast |
| Enqueueing `survey-send` / `survey-insight` | Actual per-developer email + cooldown/rotation math |
| Pause / resume / cancel / retry transitions | Hourly auto-pulse assignment + lead-time question generation |
| **Reminders** (no queue at all) | Hourly deadline sweep (auto-close) |
| Read endpoints (quota, schedule, list, detail) | AI analysis of closed surveys; BullMQ retry/backoff |

The dividing line: **anything that must answer an admin's click immediately (validation, quota, reading state) is API; anything that talks to an external channel/AI or runs on a schedule is worker.** The one deliberate exception is the reminder, which is cheap enough to do inline.

---

## 10. Response Collection

### 10.1 Public anonymous flow

- `GET /api/v1/public/surveys/:token` — loads the form (rate limit **60 / 15 min / IP**).
- `POST /api/v1/public/surveys/:token/responses` — submits answers (rate limit **10 / 15 min / IP**).

No auth of any kind; the rate limits are defence-in-depth on top of the token's entropy.

Validation (`validateSurveyAnswers`):
- Each `questionId` may appear at most once per submission and must belong to this survey.
- `scale` questions: integer 1–5, no `answerText`.
- `text` questions: 1–4000 trimmed characters, no `answerScale`.
- At least one answer overall; `submissionId` must be a well-formed UUID.

Error mapping: invalid/expired/tampered link → 400, survey not accepting responses → 409, anything else → 500.

### 10.2 Anonymity model — what "anonymous" actually means here

- The link is **reusable**, not single-use — it is never consumed or invalidated by a response.
- **No identity of any kind** is stored: no cookie, no session, no fingerprint, no account link.
- The client generates a random `submissionId` (UUID) per attempt so a network retry doesn't duplicate the *same* answers — it does **not** stop one person submitting twice with genuinely different answers. This is a deliberate trust-based design.

### 10.3 Storage & aggregation

Each submission is one `survey_response` row holding that respondent's answers as a jsonb array. `getRawResponsesForSurvey` flattens every row into per-question answer lists, so even the raw-responses view shows "R1, R2, R3…" *within* a question — there is no way to tell whether R1 on question 1 and R1 on question 2 are the same person. Respondent identity is discarded at aggregation time by construction, not by policy.

---

## 11. Closing a Survey

| Path | What happens |
|---|---|
| **Manual** — admin closes | `status → closed`, `close_reason: 'manual'`, insight job enqueued immediately |
| **Automatic** — deadline passes | Caught by the next hourly sweep (§8.7): `status → closed`, `close_reason: 'deadline'`, insight job enqueued |

Both converge on the same `survey-insight` job; analysis quality doesn't depend on how the survey closed.

---

## 12. Post-Close AI Analysis

**Gating**: analysis is skipped (and the survey completes immediately with no scores) only when there are **zero responses** or every question has zero answers — a hard `responseCount < 1`, not a minimum-anonymity threshold. The recorded `analysis_error` is `insufficient_responses:<n>/<SURVEY_MIN_ANONYMOUS_RESPONSES>`, which is where that env var's only remaining effect lives.

**What Gemini receives**: project name, the health-context snapshot captured at question-generation time (for interpretation only — explicitly instructed *not* to be copied, anchored, or averaged into the survey's own scores), total respondent count, and every question with all its answers.

**What it produces**:
1. **Seven category scores (0–100)** from survey evidence only; a category with no scale answers is inferred from free-text tone, and with no signal at all defaults to 50.
2. **3–5 quantified insight bullets** — full sentences citing an actual count, e.g. *"3 of 4 responses cite unclear sprint scope as a blocker."*
3. **A 2–4 sentence overall narrative** (stored; superseded in the UI by the bullets).
4. **One-sentence summary per question** (`questionSummaries`).

Saved to `survey.insight` with `aiModel` (`GEMINI_MODEL` or `'stub'`) and `generatedAt`, then status → `completed`.

**Fallback**: with no `GEMINI_API_KEY`, a stub client returns neutral 50s, one placeholder theme, and one placeholder per-question summary — the pipeline is fully exercisable in local dev without a real key.

**Explicitly decoupled from the risk engine**: nothing here reads or writes `projecthealthscore`. The two scores live side by side and never combine.

---

## 13. Reference: Environment Variables

| Variable | Default | Range | Controls |
|---|---|---|---|
| `MANUAL_SURVEY_MONTHLY_LIMIT` | 2 | 1–20 | Manual surveys per project per calendar month |
| `SURVEY_QUESTION_GEN_LEAD_DAYS` | 2 | 1–14 | Review window (manual) / lead time before auto-pulse send |
| `SURVEY_QUESTION_MIN_SCORE` | 60 | 0–100 | Quality gate on generated questions (`overall`) |
| `SURVEY_QUESTION_MAX_COUNT` | 6 | 1–20 | Max questions per survey |
| `SURVEY_MONTHLY_START_DAY` | 1 | 1–28 | Day of month the auto-pulse send window opens |
| `SURVEY_MONTHLY_WINDOW_DAYS` | 3 | 1–7 | Width of that window |
| `SURVEY_RESPONSE_DEADLINE_DAYS` | 7 | 7–15 | How long a link stays open for responses |
| `SURVEY_MIN_DAYS_BETWEEN_SURVEYS` | 15 | 1–60 | Global per-developer email cooldown (days) |
| `SURVEY_MIN_ANONYMOUS_RESPONSES` | 5 | 3–100 | **Cosmetic only** — appears in the `insufficient_responses:<n>/<min>` string |
| `METRICS_IN_SURVEY` | true | boolean | Feed raw CI/CD, version-control, and PM metrics into question generation |
| `SURVEY_TOKEN_ENC_KEY` | — | 32 bytes, base64url | AES-256-GCM key for link tokens (required to mint/read links) |
| `SURVEY_FORM_BASE_URL` | `${FRONTEND_URL}/survey` | — | Base of the public link |
| `SLACK_BOT_TOKEN` + `SLACK_CHANNEL_ID` | — | — | Slack broadcast |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | — | — | Telegram broadcast |
| `DISCORD_WEBHOOK_URL` | — | — | Discord broadcast |
| `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | — | — | Per-developer email; unset ⇒ log-only, still recorded as sent |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | — / `gemini-2.5-flash` | — | Unset ⇒ all AI calls fall back to the deterministic stub |

---

## 14. FAQ — for demo / presentation

**Q: Why one shared link instead of a unique link per developer?**
A: A per-developer link would make responses traceable back to a person (defeating anonymity) and adds friction that suppresses response rates. The shared link is anonymous by construction; the email is a *notification*, not authentication.

**Q: If anyone with the link can submit without logging in, what stops ballot-stuffing?**
A: Nothing at the protocol level — an intentional trust trade-off for genuine anonymity. The 10-per-15-minutes-per-IP limit bounds *automated* abuse; a determined individual could still submit twice by hand. This is a known limitation of anonymous pulse surveys generally.

**Q: Why encrypt the link token instead of storing a random one in the DB?**
A: The token carries `{surveyId, cycleId, deadline}`, so an expired or tampered link is rejected with no database round-trip, and GCM's auth tag makes forgery fail closed. There's no token table to keep in sync or clean up. The DB is still consulted before serving a form — the token is identification, not authorization.

**Q: What if two admins hit Send at the same moment?**
A: `claimSurveyForSend` is a conditional UPDATE; only one succeeds. The other dispatch returns `null` and its job completes quietly. Nothing external happens before that claim.

**Q: What if Slack is down but Discord works?**
A: The survey goes out. Channels are independent; the dispatch only fails if *all three* fail. `survey.delivery` records exactly which carried it.

**Q: Why does a multi-project developer sometimes get skipped even though the 15-day cooldown has long passed?**
A: Rotation fairness, not a block. A project is skipped only while it is *ahead* of a sibling project the developer is also on; once the siblings catch up it becomes eligible again. Without this, whichever project surveys them first each cycle would monopolize their attention forever.

**Q: What if the admin never reviews the generated questions?**
A: The draft still sends. `scheduled_send_at` is both the review deadline and the auto-send time — the hourly cron dispatches it once that moment passes.

**Q: What if Gemini is unreachable when a survey should send?**
A: Question generation throws, the survey is marked `failed` with the reason, and an admin can hit Retry once the issue clears. BullMQ retries transient failures 3× with backoff before it ever surfaces as `failed`.

**Q: What if nobody responds before the deadline?**
A: The survey still closes and completes on schedule via the hourly sweep — it skips the AI call and stores `insufficient_responses:0/5`, showing as "no data" rather than hanging in `closed`.

**Q: Are survey results and the Dashboard health score the same number?**
A: No, deliberately. The Dashboard's score comes from the risk engine (connector metrics). The survey's 7 scores come purely from what developers said. They can disagree — pipelines can look green while developers report friction. The health context is shown to the AI as background only, with explicit instructions not to let it influence the survey's own scores.

**Q: Why "3 of 4 responses cite X" instead of just "unclear scope"?**
A: A bare keyword can't distinguish one outlier complaint from a near-unanimous one. Quantifying each insight lets a manager judge how widespread it is.

**Q: Can I see exactly what each person answered?**
A: You can see every raw answer, but not who gave it, and you cannot link an answer on question 1 to one on question 3 from the same person.

---

## 15. Edge Cases & Demonstration Scenarios

1. **Developer on 3 projects (A, B, C), all at zero sends.** A surveys them (A=1). Two weeks later B tries → blocked by the **15-day global cooldown** (`cooldown_active`) even though B never surveyed them. A month later A tries again → blocked by **rotation** (`rotation_wait_for_other_projects`) since A leads B and C. B then sends (A=1, B=1, C=0) — A must still wait for C. Only once every sibling catches up does A become eligible again.

2. **A project with 2 members and 1 respondent.** Closes at 1/2 response rate; analysis still runs (gate is `< 1`), producing scores/themes from that single respondent. Worth flagging in a demo that "1 of 1 responses…" is statistically thin even though the pipeline treats it identically.

3. **Zero developers on a brand-new project.** An *auto-pulse* dispatch fails cleanly with `no_project_developers`. A *manual* send passes `allowEmptyRoster: true`, so it broadcasts to the chat channels anyway and goes `active` with `targetCount = 0` — useful for demoing the link without a populated roster.

4. **`GEMINI_API_KEY` removed mid-demo.** Generation and analysis both fall back to the deterministic stub; output is obviously placeholder-looking. Shows the system degrading predictably rather than crashing.

5. **Admin closes a survey one minute after sending, zero responses.** Closes immediately (`close_reason: 'manual'`) and completes with `insufficient_responses:0/5` — closing is always available as an override.

6. **All three broadcast channels unconfigured or failing.** Dispatch throws and the survey ends `failed` — even if some emails did go out, because the shared-link broadcast is the primary path. (Email runs *after* a successful broadcast, so in practice this fails before any email is attempted.)

7. **Two admins click Send on the same draft in the same second.** `claimSurveyForSend` lets exactly one through; the other is a silent no-op.

8. **A deadline passes at 2:03pm.** The survey may stay `active` for up to ~57 more minutes until the hourly sweep closes it. Useful if demo timing looks "off" by up to an hour.

9. **SMTP unconfigured in local dev.** `survey_recipient` rows read `sent` and the link is written to the logs instead — the audit trail records intent, not proof of delivery, when SMTP is absent.
