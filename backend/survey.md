# Survey System — Technical Reference

How Pulse's developer-survey feature works end to end: creation, question generation, dispatch (Slack/Telegram/Discord + per-developer email), response collection, and AI analysis. Written for engineering understanding and for demo/presentation prep.

> This file replaces an older version that described a since-removed design (a 5-category rubric, a raw-response anonymity gate, and a 60/40 blend into `projecthealthscore`). None of that exists in the current code — everything below is verified against the current source.

---

## 1. Overview

A survey is an **anonymous, shared-link questionnaire** sent to every developer on a project. One link is created per survey ("cycle"), broadcast to team chat channels, and optionally emailed individually to each developer. Anyone with the link can answer once per browser session; responses are stored with no identity attached. When the survey closes, Gemini analyzes all responses and writes back seven category health scores, a set of quantified insight bullets, and a one-line summary per question.

Two independent scoring systems exist side by side and never mix:

| System | Source | Table | Feeds |
|---|---|---|---|
| **Risk engine** | Connector metrics (GitHub, CI/CD, Jira, etc.) | `riskscore` | Dashboard health tiles |
| **Survey analysis** | Anonymous developer responses | `survey.insight` (jsonb) | Survey results page |

The risk engine's latest scores + trend are handed to the survey system as *read-only background context* (to help the AI write better questions and interpret answers) — survey results are never written back into `riskscore` or `projecthealthscore`.

---

## 2. Data Model

| Table | Purpose |
|---|---|
| `survey` | One row per survey/cycle: status, trigger, schedule, questions (jsonb), `insight` (jsonb), `health_context` (jsonb snapshot), delivery info |
| `survey_response` | One row per anonymous submission: `submission_key` (client UUID), `answers` (jsonb array of `{questionId, answerText?, answerScale?}`) — **no identity column of any kind** |
| `survey_recipient` | One row per (survey, developer) email attempt: `status` (`sent`/`skipped`/`failed`), `skip_reason`, `sent_at` — this is what the cooldown math reads |
| `project.pending_survey` / `pending_survey_trigger` | A UI flag only — "this project looks like it needs a pulse check" — does **not** create a survey by itself |

The 7 rubric categories, used both by the risk engine and by survey questions/scores: `security`, `reliability`, `maintainability`, `cicdDeploymentHealth`, `teamHealth`, `engineeringProcess`, `planningExecution`.

---

## 3. Survey Lifecycle (states)

```
draft ──(dispatch succeeds)──▶ active ──(deadline OR manual close)──▶ closed ──(AI analysis)──▶ completed
  │                                                                                                  ▲
  └──(dispatch fails: no developers / all channels down)──▶ failed ──(admin retries)─────────────────┘
draft ──(admin pauses/cancels)──▶ paused / cancelled
```

- **draft** — created, questions may still be empty or under review.
- **active** — link is live and broadcast; `expires_at` is set.
- **closed** — no longer accepting responses; analysis pending.
- **completed** — `survey.insight` has been written (scores/themes/question summaries).
- **failed** — dispatch or analysis threw (e.g. zero developers, all broadcast channels unconfigured, malformed AI response). Admin can retry.

---

## 4. How a Survey Gets Created

There are three distinct triggers. Only two of them actually create a `survey` row.

### 4.1 Manual — generate, review, then send (the normal admin flow)
1. Admin clicks **"Send Survey Now"** on the Surveys page → `SendSurveyModal`, trigger text defaults to `"Manual team pulse check"`.
2. **Generate**: `POST /projects/:id/surveys/generate-questions` → `SurveyService.generateQuestions` — captures health context, runs the full question-generation pipeline (§6), creates a `draft` survey (`source: 'manual'`) with a review deadline `now + SURVEY_QUESTION_GEN_LEAD_DAYS` (default 2 days).
3. Admin reviews/edits the AI-generated questions in the modal (`PATCH /surveys/:id/questions`, blocked once the survey has actually been sent).
4. **Send**: `POST /projects/:id/surveys` → `SurveyService.createAndSendSurvey` — re-validates everything, sets `scheduledSendAt = now`, and enqueues a `survey-send` job. The worker picks it up immediately and dispatches (§8).

### 4.2 Manual — send now, skip review
`POST /projects/:id/surveys/send-now` → `SurveyService.sendNow` creates a bare `draft` survey with **empty questions** and enqueues the same `survey-send` job — the worker generates questions AND dispatches in one pass. (Exists as an API capability; the current frontend modal uses the two-step flow above instead.)

### 4.3 Auto-pulse — monthly recurring survey
An hourly BullMQ cron (`survey-distribution`, pattern `0 * * * *`) does three things per project, every tick:
1. **Assign a send moment**: once within `SURVEY_QUESTION_GEN_LEAD_DAYS` of the monthly window opening (window starts `SURVEY_MONTHLY_START_DAY` of the month, spans `SURVEY_MONTHLY_WINDOW_DAYS`), each project is assigned one **randomized** moment inside that window — done once and persisted, never re-rolled. Trigger text: `"Scheduled monthly pulse check"`, `source: 'auto_pulse'`.
2. **Generate questions** for any auto-pulse survey now within its lead-time window.
3. **Dispatch** any survey (manual or auto) whose `scheduled_send_at` has arrived.

The randomization is deliberate — it avoids every project's monthly survey landing in every developer's inbox on the same predictable day.

### 4.4 Metric-triggered — a UI hint, not a survey
After every sync's risk-score calculation, `evaluateSurveyTrigger` checks (in priority order, first match wins):

| Condition | Trigger string set on `project.pending_survey_trigger` |
|---|---|
| Blockers risk score < 50 | `"Open blockers exceeded threshold"` |
| Team health score < 40 | `"Team health score dropped"` |
| Planning & Execution score < 40 | `"Planning & Execution score dropped"` |

This only flips a flag an admin sees as a banner/badge ("this project looks due for a check-in") — it never auto-creates a survey. A human still has to click Send. This check is wrapped in try/catch and is explicitly non-fatal to the sync pipeline.

---

## 5. Quotas & Gates at Creation

| Gate | Default | Where enforced |
|---|---|---|
| Manual surveys per project per calendar month | **2** (`MANUAL_SURVEY_MONTHLY_LIMIT`, range 1–20) | `generateQuestions`, `createAndSendSurvey`, `sendNow` — throws `Monthly manual survey limit reached (N/month)` → HTTP 429. Skipped if an open unsent draft already exists (editing a draft doesn't count as a new one). |
| Review window before an unsent manual draft is considered stale | **2 days** (`SURVEY_QUESTION_GEN_LEAD_DAYS`) | `keepOrAssignReviewWindow` |
| Question count on send | 1–20 questions, 10–500 chars each, valid category/type, no near-duplicates | `validateSurveyQuestions` |
| Trigger / guidance text length | trigger 3–500 chars, guidance ≤ 2000 chars | `normalizeSurveyText` |
| Zero developers on the project | dispatch fails: `status: 'failed'`, `analysisError: 'no_project_developers'` | `dispatchAnonymousSurveyBroadcast` |
| Concurrent double-send | atomic DB claim (`claimSurveyForSend`) — second concurrent attempt is a no-op | `dispatchAnonymousSurveyBroadcast` |

---

## 6. Question Generation Pipeline

Same function (`generateQualityQuestions`) is shared by the manual flow, the auto-pulse flow, and the just-in-time generation in the send-worker — so the three paths can never silently drift apart.

**Inputs**: project name, the fixed 7 rubric categories, `trigger`, optional admin-written `customGuidance`, and the captured health context (§7).

**Guidance is opt-in and supplementary, not a default input.** It's a purely frontend concept — a per-browser (localStorage), per-project list of free-text instructions on the Surveys page, with no backend table backing it; the backend just stores whatever string arrives on the `survey.custom_guidance` column. It starts **empty** for every project until an admin explicitly adds an instruction — so by default, question generation is driven entirely by the health context (§7), not by any boilerplate text. When an admin does add guidance, the prompt frames it explicitly as secondary: *"Optional supplementary guidance from the admin (use only to steer emphasis within a category — the health context above is the primary signal for what to probe)"* — it can nudge emphasis, but the risk-score-driven health context still drives what gets asked about.

**Steps**:
1. **Generate** — Gemini is asked for 6–8 candidate questions, mixing `scale` (1–5) and `text` types, each tagged with exactly one category, weighted toward categories the health context shows as weak/declining.
2. **Dedupe** (cheap, non-AI, runs before any paid scoring call) — tokenizes each question, computes Jaccard similarity against every question already kept, and drops anything ≥ 0.6 similar to one already kept. This is the first line of defense; the AI's own `diversity` score (below) is the second.
3. **Score** — Gemini scores every surviving question 0–100 on four dimensions plus an overall verdict:
   - *relevance* — fit to this project/trigger/health context
   - *clarity* — unambiguous, not leading or double-barrelled
   - *importance* — how actionable the answer would be to a manager
   - *diversity* — how distinct it is from the other questions in this set
   - *overall* — holistic judgement; **this is the only dimension used for gating**
4. **Quality gate** — questions scoring below `SURVEY_QUESTION_MIN_SCORE` (default **60**) are dropped outright. If *zero* questions pass, generation fails with `No generated question met the minimum quality score of 60` — there is no automatic retry/regeneration.
5. **Category-balanced selection**, capped at `SURVEY_QUESTION_MAX_COUNT` (default **6**): first pass takes at most one question per category (highest-scored first) to maximize topic spread; if that doesn't fill the cap, a second pass backfills with the next-highest-scoring leftovers regardless of category. There is no fixed "N per category" — it depends entirely on which categories cleared the quality gate.

---

## 7. Health Context & Trend (fed to the AI, read-only)

`captureSurveyHealthContext` reads **only** the `riskscore` table (via `getLatestRiskScoreForProject`) — it never touches `projecthealthscore`. It captures the current 7 category scores, the overall score, and a **trend vs. the previous sync snapshot**:

```
delta = current_score − previous_score
|delta| < 3         → steady
3 ≤ |delta| < 15     → gradual_increase / gradual_decrease
|delta| ≥ 15         → sharp_increase / sharp_decrease
```

This produces prompt lines like *"CI/CD & Deployment: 62 (up 18.4 pts since last sync — sharp improvement)"*, so the AI can write questions that probe what's actively changing rather than restate a static snapshot. If there's no prior snapshot, trend is simply omitted — generation still proceeds.

---

## 8. Dispatch Mechanism

### 8.1 Queues (BullMQ + Redis)

| Queue | Trigger | Worker processor | What it does |
|---|---|---|---|
| `survey-send` | Enqueued by the API on every manual send/send-now, and on retry | `survey-send-processor.ts` | Generates questions if still empty, then broadcasts + emails |
| `survey-distribution` | Self-scheduling hourly cron (`0 * * * *`), registered once at worker boot | `survey-distribution-processor.ts` | Assigns auto-pulse send times, generates their questions, dispatches due surveys, closes expired surveys |
| `survey-insight` | Enqueued on manual close, and automatically for every survey the hourly sweep just closed | `survey-insight-processor.ts` | Runs AI analysis, writes `survey.insight`, flips status to `completed` |

Job IDs are deterministic (`survey-send-<id>`, `survey-insight-<id>`), so a duplicate enqueue is a harmless no-op — this is the idempotency guard against double-processing. Both queues retry failed jobs 3× with exponential backoff.

**Note:** dispatch itself (`dispatchAnonymousSurveyBroadcast`) is never called synchronously from an API request — the API only ever *enqueues*. The worker is the sole executor of the actual broadcast/email send, for both manual and auto-pulse surveys.

### 8.2 What dispatch actually does, in order

1. Load the survey; bail if it's missing, paused/cancelled, or already sent.
2. Count developers on the project; if zero (and empty rosters aren't explicitly allowed), mark the survey `failed`.
3. **Atomically claim** the survey for sending (a conditional UPDATE that only succeeds if nobody else claimed it first) — this is what makes concurrent worker retries safe.
4. Mint **one shared anonymous link** for this cycle (`{surveyFormBaseUrl}/{signed token}` encoding survey id, cycle id, and deadline).
5. If not yet broadcast: fan out in parallel to Slack, Telegram, and Discord (each independently best-effort — a channel failing doesn't fail the others). If **all three** fail or are unconfigured, the whole dispatch throws.
6. Separately, run the per-developer email pass (§9) — wrapped so an email failure never fails the broadcast that already succeeded.
7. Set the target respondent count and mark the survey `active`.

### 8.3 Auto-close (deadline sweep)

There's no per-survey delayed job for closing — it's a **shared hourly sweep**, the same `survey-distribution` cron tick: any `active` survey whose `expires_at` has passed gets closed (`close_reason: 'deadline'`), and an insight job is enqueued for each one closed. This means an expired survey can sit closed for up to ~1 hour before the sweep catches it — not an exact-time trigger.

---

## 9. Per-Developer Email — Eligibility & Cooldown Calculations

This is the part with the most "decision-making" logic in the whole feature. Run once per survey, per developer, in this exact order:

1. **Idempotency gate** — if *any* `survey_recipient` row already exists for this survey, skip the entire function (a retried send job never re-emails everyone).
2. **Who counts as a developer** — every `projectmember` row for the project, filtered to `User.role === 'member'` (role now lives on `User`, not on `projectmember`).
3. For each developer, **in priority order**:
   - **a. Cross-project rotation fairness** (checked first, only applies if the developer is on **more than one project**): compare how many surveys this developer has ever been successfully emailed for *this* project against every *other* project they're also on. If this project is already ahead of — has sent more than — the least-surveyed sibling project, skip them for now (`skip_reason: 'rotation_wait_for_other_projects'`) so that sibling gets its turn first. **This is not a permanent block** — as soon as every sibling project has caught up to (or passed) this project's count, it becomes eligible again. Rationale: without this, one project could monopolize a multi-project developer's attention and starve every other project they're on from ever reaching them; a purely permanent "only once, ever" rule would eventually go silent on every project once each had used its one shot.
   - **b. 15-day global cooldown** (`SURVEY_MIN_DAYS_BETWEEN_SURVEYS`, default 15, range 1–60): if this developer received *any* successful survey email — for *any* project — less than 15 days ago, skip them (`skip_reason: 'cooldown_active'`).
   - **c. Otherwise, send** — record `status: 'sent'`. If the send itself throws, record `status: 'failed'` with the error message (truncated to 200 chars) as the reason.

```
                 ┌─ this project's send-count > the lowest sibling project's send-count? ──▶ skip (wait for rotation)
developer ──▶    │
                 ├─ emailed for ANY project within last 15 days? ─────────────────────────▶ skip (cooldown)
                 │
                 └─ otherwise ──▶ send email, record status
```

Worked example: a developer is on Project A and Project B, both starting at 0 sends. Project A sends first (A=1, B=0) — Project A is now ahead of B, so the *next* time Project A tries, it's skipped in favor of B (B=0 is still behind). Once Project B sends (A=1, B=1), both are tied again and either project is eligible next, subject to the 15-day cooldown. If a third project C is added later with 0 sends, A and B (both at 1) each wait for C to catch up before sending again.

Every outcome — sent, skipped (with reason), or failed — is written to `survey_recipient`, giving a full audit trail of who got what and why.

---

## 10. Backend vs. Worker — Task Distribution

| Runs in **API** (synchronous, on HTTP request) | Runs in **Worker** (async, via queue job) |
|---|---|
| Question generation for the manual flow (calls Gemini directly on request) | Question generation for auto-pulse and send-now (same underlying function, called on a queue tick instead) |
| Quota checks (monthly manual limit) | Actual Slack/Telegram/Discord broadcast |
| Question validation/editing (admin review) | Actual per-developer email sends + cooldown calculations |
| Enqueueing `survey-send` / `survey-insight` jobs | The hourly auto-pulse scheduling + question-gen-lead-time check |
| Pause/resume/cancel lifecycle transitions | The hourly deadline sweep (auto-close) |
| **Reminders** — fully synchronous, no queue at all: rebuilds the existing link, enforces its own 15-*minute* cooldown, re-broadcasts to chat channels only (no re-email) | AI analysis of closed surveys (`survey-insight` job) |
| Read endpoints (quota, schedule, list, detail) | Retry logic (BullMQ's built-in exponential backoff, 3 attempts) |

The dividing line is simple: **anything that must happen right when an admin clicks a button and needs an immediate response (validation, quota checks, reading state) is API; anything that actually talks to an external channel/AI or runs on a schedule is worker.**

---

## 11. Response Collection

### 11.1 Public anonymous flow

- `GET /public/surveys/:token` — loads the form (60 requests/15min per IP).
- `POST /public/surveys/:token/responses` — submits answers (**10 requests/15min per IP**).

Validation (`validateSurveyAnswers`):
- Each `questionId` may appear at most once per submission, and must belong to this survey.
- `scale` questions: integer 1–5, no `answerText` present.
- `text` questions: 1–4000 trimmed characters, no `answerScale` present.
- At least one answer is required overall — a fully blank submission is rejected.

### 11.2 Anonymity model — what "anonymous" actually means here

- The link is **reusable**, not single-use — it isn't consumed or invalidated after one response.
- There is **no identity of any kind** stored: no cookie, no session, no fingerprint, no account link.
- The client generates a random `submissionId` (UUID) per attempt, sent so a network retry doesn't create a duplicate row of the *same* answers — but this does **not** stop one person from submitting multiple times with genuinely different answers. This is a fully trust-based, best-effort anonymous design, by intent.

### 11.3 Storage & aggregation

Each submission is one row (`survey_response`), holding all of that respondent's answers as a jsonb array. When results are read, `getRawResponsesForSurvey` flattens every row's answers into "all answers for question 1", "all answers for question 2", etc. — this is a deliberate design choice: **respondent identity is discarded at aggregation time**, so even the raw-responses view in the UI shows "R1, R2, R3..." per question rather than a respondent-linked grid across questions (there's no way to tell whether "R1" on question 1 and "R1" on question 2 came from the same person).

---

## 12. Closing a Survey

| Path | What happens |
|---|---|
| **Manual** — admin clicks Close | `status → closed`, `close_reason: 'manual'`, insight job enqueued immediately |
| **Automatic** — deadline passes | Caught by the next hourly sweep (§8.3): `status → closed`, `close_reason: 'deadline'`, insight job enqueued |

Both converge on the same `survey-insight` job — there's no behavioral difference in analysis quality based on how the survey closed.

---

## 13. Post-Close AI Analysis

**Gating**: analysis is skipped (and the survey completes immediately with no scores) only if there are **zero responses**, or every question has zero answers. This is checked as a hard `responseCount < 1` — not any minimum-anonymity threshold (see the note in §15 about `SURVEY_MIN_ANONYMOUS_RESPONSES`).

**What Gemini receives**: project name, the health-context snapshot captured at question-generation time (for interpretation only — explicitly instructed *not* to be copied/anchored/averaged into the survey's own scores), the total respondent count, and every question with all of its collected answers.

**What it's asked to produce**:
1. **Seven category scores (0–100)**, based only on survey evidence — if a category has no scale answers, infer from the tone of the free-text answers; if there's truly no signal, default to 50 (neutral).
2. **3–5 quantified insight bullets** — each a full sentence citing an actual count, e.g. *"3 of 4 responses cite unclear sprint scope as a blocker."* This replaced an earlier version that just returned bare keyword labels ("Unclear Scope") with no evidence behind them.
3. **A 2–4 sentence overall narrative** (still generated and stored, no longer shown as its own paragraph in the UI — superseded by the quantified bullets above for at-a-glance reading).
4. **One-sentence summary per question** (`questionSummaries`) — a new field, e.g. *"Most respondents rated confidence low (2/5), citing unresolved dependencies."*

**Fallback**: if `GEMINI_API_KEY` isn't configured, a stub client returns neutral 50s for every category, one placeholder theme, and one placeholder per-question summary — so the pipeline is fully exercisable in local dev without a real AI key.

**Explicitly decoupled from the risk engine**: the insight service's own header comment states it is "kept independent of the risk engine — never blended into projecthealthscore." Nothing in this pipeline reads from or writes to `projecthealthscore`; the risk engine and survey analysis are two scores that live side by side and never combine.

---

## 14. Reminders

A manager can nudge an active survey without creating a new one: `RemindSurveyButton` re-broadcasts the **existing** link to chat channels only (no new email round). It enforces its own separate 15-**minute** cooldown (distinct from the 15-*day* email cooldown) to stop accidental reminder-spam, and runs entirely synchronously in the API — no queue involved.

---

## 15. Reference: Environment Variables

| Variable | Default | Range | Controls |
|---|---|---|---|
| `MANUAL_SURVEY_MONTHLY_LIMIT` | 2 | 1–20 | Manual surveys per project per calendar month |
| `SURVEY_QUESTION_GEN_LEAD_DAYS` | 2 | 1–14 | Review window (manual) / lead time before auto-pulse send (auto) |
| `SURVEY_QUESTION_MIN_SCORE` | 60 | 0–100 | Quality gate on generated questions (`overall` dimension) |
| `SURVEY_QUESTION_MAX_COUNT` | 6 | 1–20 | Max questions per survey |
| `SURVEY_MONTHLY_START_DAY` | 1 | 1–28 | Day of month the auto-pulse send window opens |
| `SURVEY_MONTHLY_WINDOW_DAYS` | 3 | 1–7 | Width of that window |
| `SURVEY_MIN_DAYS_BETWEEN_SURVEYS` | 15 | 1–60 | Global per-developer email cooldown (days) |
| `SURVEY_MIN_ANONYMOUS_RESPONSES` | 5 | 3–100 | **Cosmetic only** — appears in the `insufficient_responses:<n>/<min>` message text; no longer gates raw-response visibility (that gate was removed) |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | — | — | If unset, all AI calls fall back to the deterministic stub client |

---

## 16. FAQ — for demo / presentation

**Q: Why is one link shared by the whole team instead of a unique link per developer?**
A: The design goal is honest, low-friction feedback. A per-developer link would make responses traceable back to a person (defeating anonymity) and adds sign-up/auth friction that suppresses response rates. The shared link is anonymous by construction; the email is just a *notification* that a survey exists, not an authentication mechanism.

**Q: If the link is shared and anyone can open it without logging in, what stops someone outside the team, or a developer, from submitting many times to skew results?**
A: Nothing at the protocol level — this is an intentional trust trade-off for genuine anonymity. The 10-submissions-per-15-minutes-per-IP rate limit bounds *automated* abuse, but a determined individual could still submit more than once by hand. This is a known, accepted limitation of anonymous pulse surveys generally, not a bug.

**Q: Why does a developer on multiple projects sometimes not get emailed for a project they've been emailed for before, even though the 15-day cooldown has long passed?**
A: By design — it's a temporary wait for fairness, not a permanent block. If someone works across multiple projects, giving each project an independent 15-day cooldown would let whichever project surveys them "first" each cycle monopolize their attention forever, since it always resets before the others get a turn. Instead, a project is only skipped while it's *ahead* of a sibling project the developer is also on (has sent them more surveys than that sibling has); once every sibling catches up, it's eligible again. So the developer's limited "survey attention" rotates fairly across every project they're on — it's never a permanent block on any one project.

**Q: What happens if the AI (Gemini) is completely unreachable when a survey should send its questions?**
A: Question generation throws, the survey is marked `failed` with a reason, and an admin can hit **Retry** once the issue clears — the retry re-enters the same pipeline (BullMQ also auto-retries transient failures 3× with backoff before it ever surfaces as `failed`).

**Q: What happens if literally nobody responds before the deadline?**
A: The survey still closes and completes on schedule (via the hourly sweep) — it just skips the AI call entirely and stores `analysisError: insufficient_responses:0/5`, so it shows as "no data" rather than hanging in `closed` forever.

**Q: Are survey results and the Dashboard's health score the same number?**
A: No — deliberately not. The Dashboard's score comes from the risk engine (connector metrics: commits, CI/CD runs, PR cycle time, etc.). The survey's 7 category scores come purely from what developers actually said in that survey. They can and often will disagree — e.g. CI/CD pipelines can look green on the dashboard while developers report high friction in the survey. The health-context snapshot is shown to the AI as background only, with explicit instructions not to let it influence the survey's own scores.

**Q: Why "3 of 4 responses cite X" instead of just "unclear sprint scope" as a theme?**
A: A bare keyword gives no sense of how many people actually felt that way — one outlier complaint reads the same as a near-unanimous one. Quantifying each insight lets a manager immediately judge whether something is a widespread pattern or a single loud voice.

**Q: Can I see exactly what each person answered?**
A: You can see every raw answer, but not who gave it — answers are grouped and displayed per-question, not per-respondent, and there is no way (by design) to link an answer on question 1 to an answer on question 3 from the same person.

---

## 17. Edge Cases & Demonstration Scenarios

Useful to walk through live in a demo, or to have ready if asked "what if...?":

1. **A developer is on 3 projects (A, B, C), all starting at zero sends.** Project A surveys them and they respond (A=1, B=0, C=0). Two weeks later, Project B tries to survey them → **blocked by the 15-day global cooldown** (skip_reason `cooldown_active`), even though Project B has never surveyed them before. A month after that, Project A's next monthly pulse tries to reach them again → **blocked by rotation** (skip_reason `rotation_wait_for_other_projects`) because A (1) is ahead of both B (0) and C (0), so it waits. Project B then successfully sends (A=1, B=1, C=0) — now B and C are tied as the least-surveyed, so Project A must wait for C too before it's eligible again. Only once every sibling project has caught up to Project A's count does Project A become eligible again — it's a rotation, never a permanent block.

2. **A project has only 2 team members and 1 responds.** The survey closes with 1/2 response rate. AI analysis still runs (gate is `< 1` response, not any minimum), producing scores/themes/summaries from that single respondent's answers — worth noting in a demo that themes from very small samples ("1 of 1 responses...") are statistically thin even though the pipeline treats them the same as a 20-person survey.

3. **Zero developers on a brand-new project.** Sending a survey immediately fails with `no_project_developers` — a clean, explicit failure rather than silently sending to nobody.

4. **`GEMINI_API_KEY` removed mid-demo.** Question generation and response analysis both fall back to the deterministic stub — questions/scores become obviously placeholder-looking ("stub-ai-client: no real analysis performed"), which is a good way to show the system degrades predictably rather than crashing when the AI provider is unavailable.

5. **An admin closes a survey manually one minute after sending it, with zero responses yet.** It closes immediately (`close_reason: 'manual'`) rather than waiting for the deadline, and completes with `insufficient_responses:0/5` — demonstrating that closing is always available as an override, not gated by minimum wait time.

6. **All three broadcast channels (Slack/Telegram/Discord) are unconfigured or fail.** The email pass may still succeed independently (it's wrapped separately), but the overall dispatch throws because at least one broadcast channel is required — the survey ends up `failed` even if some developers did in fact receive an email, since the shared-link broadcast is treated as the primary distribution path.

7. **Two admins click "Send Survey Now" on the same draft within the same second** (double-click / race). The atomic claim (`claimSurveyForSend`) ensures only one of the two requests actually dispatches — the second is a silent no-op, not a duplicate send.

8. **A survey's deadline passes at 2:03pm.** It isn't necessarily closed at 2:03pm — the hourly sweep runs on the hour, so it could sit past-deadline-but-still-active for up to ~57 minutes before being caught and closed. Useful to mention if a demo timing looks "off" by up to an hour.
