# Action Logging Feature — Implementation Plan

> The original implementation plan below is retained as historical context. The
> repository now has real cookie-session authentication and semantic action
> search. The next planned increment is the owner-scoped Effectiveness Review
> described here. Do not implement it until the concurrent owner/database work
> has landed and the final action ownership contract has been checked.

## Planned Follow-up: Owner Effectiveness Review

### Product rule: due for review is not the same as ready to judge

An action becoming one week old must not force its owner to rate it. Some
outcomes take several weeks to become observable. The review system therefore
needs three states:

1. **Ready for review** — unrated and `next_review_at <= now`.
2. **Waiting for outcome** — unrated, but the owner has deferred it because the
   result is not visible yet (`next_review_at > now`).
3. **Reviewed** — `effectiveness` is 1–5.

The first reminder is scheduled for seven days after the action date by default.
When prompted, the owner can either rate the action or choose **Not ready yet**
and review it again in 1, 2, or 4 weeks. A custom date can be a later enhancement;
presets keep this interaction quick and predictable.

Deferral is not a negative state and must not be labelled "overdue" or styled as
an error. It means the evidence is still developing. An action remains in the
system until it is rated; deferring or dismissing a banner never discards it.

### Review cohorts and clean visual distinction

The backend returns one owner-scoped queue, and the frontend presents it under
three short, descriptive headings:

| Group | Inclusion rule | Default presentation | Visual treatment |
|---|---|---|---|
| **From last week** | Due, unrated actions whose `action_date` falls in the previous calendar week | Expanded first | Primary/blue text label and normal card contrast |
| **Earlier** | Due, unrated actions before the previous calendar week | Expanded after last week | Muted amber text label; never alarming red |
| **Waiting for outcome** | Unrated actions with `next_review_at > now` | Collapsed summary, expandable by the owner | Muted foreground/neutral label with the next review date |

The groups use headings, spacing, and explicit text rather than colour alone.
Within a group, order actions by `next_review_at`, then `action_date`, oldest
first. Each row shows the problem, affected projects, action taken, action date,
and its short status. Keep the whole row easy to scan; reveal longer root-cause
text only when expanded.

Example review summary:

```text
Effectiveness Review                                      5 ready

From last week (3)
  [Action card]                              Rate  ☆ ☆ ☆ ☆ ☆
  [Action card]                              Rate  ☆ ☆ ☆ ☆ ☆
  [Action card]                              Not ready yet

Earlier (2)
  [Action card]                              Rate  ☆ ☆ ☆ ☆ ☆
  [Action card]                              Not ready yet

Waiting for outcome (4)                                  Show
  Next review dates are shown only when this group is expanded.
```

After a successful rating, keep the row visible briefly with a quiet "Saved"
state before removing it from the ready queue. This avoids the disorienting
effect of a card disappearing the instant a star is selected.

### Weekly reminder banner

Use an inline, low-contrast actionable banner on the portfolio/dashboard. Never
open the rating modal automatically.

Banner copy distinguishes the weekly cohort from carried-over actions:

```text
5 actions are ready for review
3 from last week · 2 from earlier

[Review actions]   [Remind me later]   [Dismiss]
```

If only one cohort has items, omit the empty part instead of showing zero. The
banner count includes only **Ready for review** actions; it excludes **Waiting
for outcome** actions until their next review date arrives.

Reminder behaviour:

- Show only after the dashboard's initial content has loaded.
- Show no more than once in a Monday–Sunday reminder period by default.
- **Review actions** opens Effectiveness Review; rating never happens inside the
  banner itself because several cards need context and accessible labels.
- **Remind me later** snoozes the banner for three days.
- **Dismiss** hides this weekly banner until the next reminder period.
- The persistent top-bar review icon/count remains available after snooze or
  dismissal, so the task is always recoverable.
- If there are no due actions, do not render the banner or an empty placeholder.
- Do not use a toast: the reminder requires a decision and must not disappear on
  a timer.

For the first version, store banner display/snooze state in local storage keyed
by authenticated user ID and ISO review week. This avoids a second database
surface while the ownership schema is changing. Move it to a server-side user
preference only if cross-device reminder continuity becomes a demonstrated need.

### Effectiveness Review interaction

Effectiveness Review is the only place where ratings are editable. All Actions,
search results, timelines, and similar-action cards display the saved rating as
read-only.

For every ready card:

- Provide labelled values: **1 Made things worse**, **2 Ineffective**, **3 Mixed
  or unclear**, **4 Effective**, **5 Highly effective**.
- Support pointer, keyboard, and screen-reader operation. Star buttons need an
  accessible name containing both the number and meaning.
- Disable that card while saving, then show success feedback.
- On failure, retain the card and previous rating, show an inline error, and
  offer Retry. Do not leave an optimistic rating looking saved.
- **Not ready yet** opens a small inline/popup choice for **1 week**, **2 weeks**,
  or **4 weeks**. Confirming moves the card to Waiting for outcome and displays
  its next review date.
- Permit re-rating from the reviewed action detail only if the product still
  wants corrections; ordinary library rows remain non-interactive.

### Match the existing frontend aesthetic

Reuse the current Pulse visual language rather than introducing a new component
library:

- square cards and controls, `border-border`, `bg-card`, and the existing shadow;
- existing uppercase display-font section titles and monospace dates;
- amber filled stars for rating, with the primary colour for the main action;
- restrained `motion/react` entrance/exit transitions already used by the app;
- low-contrast banner with a narrow primary/amber left accent, not a saturated
  warning block;
- the existing Effectiveness Review panel/modal shell, opened only after explicit
  user action;
- no red treatment for old or deferred reviews—red is reserved for genuine
  failures and destructive conditions.

On narrow screens, stack banner copy above its actions and make review cards one
column. Preserve the current maximum panel height and internal scrolling so the
page beneath it does not jump.

### Backend/API contract to implement after owner work lands

Exact column names must be reconciled with the teammate's ownership migration.
The intended minimal additions are:

| Field | Purpose |
|---|---|
| `logged_by_user_id` | Authenticated owner; expected to come from the teammate's owner work |
| `next_review_at` | When an unrated action should re-enter the ready queue |
| `effectiveness_rated_by_user_id` | Audit identity for the current rating |
| `effectiveness_rated_at` | Audit timestamp for the current rating |

Creation sets `next_review_at` on the server to seven days after `action_date`.
Do not accept owner or audit IDs from the browser.

Planned endpoints:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/actions/effectiveness-review` | Return the authenticated owner's counts and `from_last_week`, `earlier`, and `waiting_for_outcome` arrays |
| `PUT` | `/api/v1/actions/:id/effectiveness` | Verify ownership and save rating plus audit fields |
| `PUT` | `/api/v1/actions/:id/review-schedule` | Verify ownership and set `nextReviewAt` using an allowed defer preset |

The server, not the browser, calculates previous-calendar-week boundaries using
an agreed product timezone. Return explicit `window_start` and `window_end` in
the response so the UI copy and tests do not depend on client clock logic.

The review endpoint must include all due, unrated actions, not only last week's.
That is what prevents unrated actions from silently disappearing after their
first weekly cohort. The weekly distinction is presentation metadata, not an
eligibility cutoff.

### Ownership and concurrent-database guardrail

Do not add these columns or migrations until the teammate's owner changes are
merged. At implementation time:

1. Re-run CodeGraph and inspect the final `actions`, `User`, `project`, and
   membership schema.
2. Reuse the teammate's owner column and authorization service instead of adding
   a competing ownership model.
3. Make rating/review-schedule changes additive and put them in a new timestamped
   Supabase migration; never edit a migration that may already have been run.
4. Keep reminder presentation state out of the database in version one.
5. Confirm action list and semantic-search scoping still use the same owner,
   company, and project rules after the merge.

### Verification plan

- Date-boundary tests for Monday/Sunday, month/year rollover, leap days, and the
  agreed timezone.
- Queue tests proving that last-week, older, deferred, and rated actions enter
  exactly one group.
- Regression test proving an older unrated action continues to appear under
  Earlier until rated or deferred.
- Deferral tests for allowed presets, owner-only authorization, and re-entry when
  `next_review_at` arrives.
- Banner-policy tests for once-per-week display, three-day snooze, dismissal,
  empty queue, and counts that exclude waiting actions.
- API tests for owner-only rating, invalid rating, missing action, audit fields,
  and company/project isolation.
- Frontend build plus keyboard, focus, mobile stacking, long-text, and failed-save
  checks against the existing light and dark themes.

### UX research basis

- [Carbon notifications](https://carbondesignsystem.com/components/notification/usage/)
  recommends sparse use, low contrast for low-priority information, a persistent
  actionable notification rather than a timed toast, and an alternative place
  where the task remains available.
- [Carbon notification pattern](https://carbondesignsystem.com/patterns/notification-pattern/)
  recommends matching visual disruption to urgency and keeping optional reminder
  actions non-blocking.
- [GOV.UK notification banner](https://design-system.service.gov.uk/components/notification-banner/)
  recommends using banners sparingly, showing at most one, aligning it with page
  content, and exposing a neutral banner as an accessible labelled region.
- [GOV.UK task list](https://design-system.service.gov.uk/components/task-list/)
  supports grouping a larger set of tasks under clear headings and pairing each
  item with a short text status.
- [GOV.UK complete multiple tasks](https://design-system.service.gov.uk/patterns/complete-multiple-tasks/)
  recommends the smallest useful status vocabulary, sentence case, and drawing
  attention to work that still requires action rather than completed work.
- [Nielsen Norman Group notification guidance](https://www.nngroup.com/articles/smart-home-notifications/)
  supports meaningful event thresholds and explicit frequency control to prevent
  notification fatigue.

## Historical Original Implementation Plan

The remaining sections document the already-completed first implementation and
are not the specification for the upcoming owner-scoped review work.

### Original principles

- **No DTO/mapper layer** — codebase doesn't use it (`project.ts`, `metrics.ts`, `risk-score.ts` all return raw rows). API returns snake_case; frontend `api.ts` handles the mapping to its own `Action` interface later.
- **No service layer** — for simple CRUD the service would be pass-through functions. Validation inline in controller (matching `sync.controller.ts` style), queries in `database/actions.ts`.
- **No speculative columns** — `company_id`, `logged_by_user_id` are YAGNI. Add when real auth/orgs land.
- **4 new files total** — not 5.

---

## 1. SQL to Run in Supabase SQL Editor

```sql
CREATE TABLE public.actions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_ids text[] NOT NULL,
  problem text NOT NULL,
  reason text NOT NULL,
  action_taken text NOT NULL,
  action_date date NOT NULL DEFAULT CURRENT_DATE,
  effectiveness integer CHECK (effectiveness >= 1 AND effectiveness <= 5),
  logged_by text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE INDEX idx_actions_project_ids ON public.actions USING GIN (project_ids);
CREATE INDEX idx_actions_action_date ON public.actions (action_date DESC);
CREATE INDEX idx_actions_pending ON public.actions (effectiveness) WHERE effectiveness IS NULL;
```

### Seed Data (mirrors the 8 frontend mock actions)

```sql
INSERT INTO public.actions (project_ids, problem, reason, action_taken, action_date, effectiveness, logged_by) VALUES
(ARRAY['onyx-mobile'], 'Sprint velocity collapsed after team reorganization', 'Two senior engineers moved to Helix team mid-sprint without adequate handoff', 'Capacity buffer added; sprint scope reduced 30%; knowledge transfer sessions scheduled', '2025-11-15', NULL, 'Sarah Chen'),
(ARRAY['onyx-mobile','meridian-api'], 'Blocked dependency from Backend Services unresolved for 3 weeks', 'API contract changes not communicated through standard channels', 'Weekly cross-team sync established; dependency tracking board added', '2025-10-28', 3, 'Marcus Webb'),
(ARRAY['onyx-mobile'], 'Critical bug count in checkout flow up 40% week-over-week', 'Rushed feature launch skipped full QA cycle under deadline pressure', 'Hotfix shipped; mandatory QA gate reinstated for all checkout-path changes', '2025-10-10', 4, 'Sarah Chen'),
(ARRAY['meridian-api'], 'P2 bug count in auth module rising over 4 sprints', 'Technical debt accumulated in auth layer during Q3 feature push', 'Two-sprint stabilization declared; no new feature work in auth module', '2025-11-10', NULL, 'James Okafor'),
(ARRAY['meridian-api'], 'Team morale survey flagged communication issues', 'Product direction changes communicated via Slack only, not in sprint planning', 'Weekly all-hands reinstated; roadmap shared before each sprint', '2025-10-15', 4, 'Sarah Chen'),
(ARRAY['nexus-infra'], 'CI pipeline failure rate exceeded 15% of builds', 'Flaky integration tests accumulated over 6 months', 'Reliability sprint allocated; 23 flaky tests fixed; build time reduced 18%', '2025-10-22', 5, 'Priya Nair'),
(ARRAY['forge-devtools'], 'Internal developer portal adoption stalled at 34%', 'Onboarding too complex; missing integrations with primary internal tools', 'Onboarding redesign shipped; Jira and GitHub Actions integrations added', '2025-11-01', NULL, 'Marcus Webb'),
(ARRAY['helix-platform'], 'Latency spike in tenant provisioning reported by 3 enterprise customers', 'Database query not optimized for new multi-region topology in v4.2', 'Query optimization deployed; provisioning latency reduced 65%', '2025-10-05', 5, 'James Okafor');
```

---

## 2. API Contract

API returns raw rows (snake_case). Frontend `api.ts` maps to its `Action` interface later.

```json
{
  "id": "uuid-string",
  "project_ids": ["onyx-mobile"],
  "problem": "Sprint velocity collapsed after team reorganization",
  "reason": "Two senior engineers moved...",
  "action_taken": "Capacity buffer added...",
  "action_date": "2025-11-15",
  "effectiveness": null,
  "logged_by": "Sarah Chen",
  "created_at": "2026-07-30T12:00:00+00:00"
}
```

### Endpoints

| Method | Path | Role | Body / Query | Response |
|--------|------|------|--------------|----------|
| `POST` | `/api/v1/actions` | ≥ Level 1 | `{ projectIds: [], problem, reason, actionTaken, loggedBy, timestamp? }` | `201` row |
| `GET` | `/api/v1/actions` | Open | `?projectId=&from=&to=&pending=true&limit=` | `200` row[] |
| `GET` | `/api/v1/actions/search` | Open | `?q=...&limit=` (q min 3 chars) | `200` row[] |
| `GET` | `/api/v1/actions/:id` | Open | — | `200` row / `404` `{ message }` |
| `PUT` | `/api/v1/actions/:id/effectiveness` | ≥ Level 2 | `{ effectiveness: 1..5 }` | `200` row / `404` `{ message }` |

### Validation Rules

| Endpoint | Rule | HTTP |
|----------|------|------|
| `POST` | `problem`, `reason`, `actionTaken`, `loggedBy` — non-empty string after trim | `400` |
| `POST` | `projectIds` — non-empty array of strings | `400` |
| `POST` | `timestamp` — if present, must match `^\d{4}-\d{2}-\d{2}$` | `400` |
| `POST` | `x-user-level` < 1 | `403` |
| `GET /search` | `q` — present and ≥ 3 chars | `400` |
| `PUT` | `effectiveness` — integer 1–5 | `400` |
| `PUT` | `x-user-level` < 2 | `403` |

---

## 3. Files to Create

### `backend/apps/api/src/middlewares/role.middleware.ts`

```typescript
import type { RequestHandler } from 'express';

export const ROLE_LEVELS = { VIEWER: 0, MANAGER: 1, EXECUTIVE: 2 } as const;

export function requireLevel(minLevel: number): RequestHandler {
  return (req, res, next) => {
    const raw = req.headers['x-user-level'];
    const level = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number.NaN;
    const effectiveLevel = Number.isFinite(level) ? level : ROLE_LEVELS.VIEWER;

    if (effectiveLevel < minLevel) {
      res.status(403).json({ message: 'Insufficient permissions' });
      return;
    }
    next();
  };
}
```

- Reads `x-user-level` header. Defaults to `VIEWER` (0) if absent/invalid.
- To edit roles later: change the constants in `ROLE_LEVELS`, or swap header-reading to JWT decode inside this one function.

### `backend/apps/api/src/database/actions.ts`

Pure query functions using `assertSupabaseClient()`. No mapping — raw rows returned.

| Function | Signature | Notes |
|----------|-----------|-------|
| `insertAction` | `(input) => Promise<ActionRow>` | Inline camelCase→snake_case in `.insert([{ project_ids, problem, reason, action_taken, action_date, logged_by }]).select().single()` |
| `listActions` | `(filters) => Promise<ActionRow[]>` | Optional `.contains('project_ids', [projectId])`, `.gte/.lte('action_date')`, `.is('effectiveness', null)`, `.limit(limit \|\| 100)`. Order by `action_date` desc. |
| `getActionById` | `(id: string) => Promise<ActionRow \| null>` | `.eq('id', id).single()` |
| `searchActions` | `(q: string, limit: number) => Promise<ActionRow[]>` | `.or('problem.ilike.%q%,reason.ilike.%q%,action_taken.ilike.%q%')`. Order by `action_date` desc. |
| `updateActionEffectiveness` | `(id, rating) => Promise<ActionRow \| null>` | `.update({ effectiveness: rating }).eq('id', id).select().single()` |

### `backend/apps/api/src/controllers/actions.controller.ts`

All handlers use `asyncHandler` wrapper. Inline validation (matching `sync.controller.ts` pattern). Calls database functions directly — no service layer.

| Handler | Validation | Response |
|---------|-----------|----------|
| `createAction` | 400: missing/empty fields, invalid projectIds/timestamp | `201` row |
| `listActions` | Parses `projectId`, `from`, `to`, `pending`, `limit` from query | `200` row[] |
| `getAction` | — | `200` row / `404` |
| `searchActions` | 400: `q` absent or < 3 chars | `200` row[] |
| `updateEffectiveness` | 400: `effectiveness` not integer 1–5; 404: id not found | `200` row |

### `backend/apps/api/src/routes/actions.route.ts`

```typescript
import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import { requireLevel, ROLE_LEVELS } from '../middlewares/role.middleware.js';
import {
  createAction,
  listActions,
  getAction,
  searchActions,
  updateEffectiveness,
} from '../controllers/actions.controller.js';

export const actionsRouter = Router();

actionsRouter.post('/',       requireLevel(ROLE_LEVELS.MANAGER),    asyncHandler(createAction));
actionsRouter.get('/search',                                          asyncHandler(searchActions));  // BEFORE /:id
actionsRouter.get('/',                                                asyncHandler(listActions));
actionsRouter.get('/:id',                                             asyncHandler(getAction));
actionsRouter.put('/:id/effectiveness', requireLevel(ROLE_LEVELS.EXECUTIVE), asyncHandler(updateEffectiveness));
```

---

## 4. Files to Edit

### `backend/apps/api/src/routes/index.ts`

```typescript
import { actionsRouter } from './actions.route.js';
router.use('/actions', actionsRouter);
```

### `backend/apps/api/src/database/schema.sql`

Append the `CREATE TABLE` + `CREATE INDEX` statements (same as Supabase SQL above, documentation only).

---

## 5. Search Endpoint (Blackbox Placeholder)

API contract is stable — internals will be replaced with embeddings later:

```
GET /api/v1/actions/search?q=sprint+velocity+dropped&limit=3
→ 200 [ { id, project_ids, problem, reason, action_taken, action_date, effectiveness, logged_by, created_at }, ... ]
```

Placeholder: `ILIKE '%q%'` across `problem`, `reason`, `action_taken`, ordered by `action_date DESC`. Later swap to `pgvector` + `text-embedding-3-small` — route and response stay identical.

---

## 6. Implementation Order

```
Run SQL in Supabase
  → Create role.middleware.ts
  → Create database/actions.ts
  → Create controllers/actions.controller.ts
  → Create routes/actions.route.ts
  → Edit routes/index.ts + schema.sql
  → npm run typecheck
  → curl test suite
```

---

## 7. Test Plan

### Prerequisites
- SQL table + seed data executed in Supabase SQL Editor
- Redis running: `docker compose up redis -d`
- Backend running: `cd backend && npm run dev`

### curl Suite

```bash
# 1. Create — success (Level 1)
curl -s -X POST localhost:3000/api/v1/actions \
  -H 'Content-Type: application/json' -H 'x-user-level: 1' \
  -d '{"projectIds":["test-proj"],"problem":"Test problem","reason":"Test reason","actionTaken":"Test action","loggedBy":"test@example.com"}'
# → 201, row with id, snake_case fields, default today action_date

# 2. Create — missing field (400)
curl -s -X POST localhost:3000/api/v1/actions \
  -H 'Content-Type: application/json' -H 'x-user-level: 1' \
  -d '{"projectIds":["test-proj"],"reason":"test","actionTaken":"test","loggedBy":"test@example.com"}'
# → 400 { "message": "problem is required" }

# 3. Create — access denied (Level 0) → 403
curl -s -X POST localhost:3000/api/v1/actions \
  -H 'Content-Type: application/json' -H 'x-user-level: 0' \
  -d '{"projectIds":["test-proj"],"problem":"test","reason":"test","actionTaken":"test","loggedBy":"test"}'
# → 403 { "message": "Insufficient permissions" }

# 4. List — all seeded rows
curl -s localhost:3000/api/v1/actions | python3 -m json.tool
# → 200, array of 9 (8 seed + 1 created)

# 5. List — filter by project
curl -s 'localhost:3000/api/v1/actions?projectId=onyx-mobile' | python3 -c "import sys,json; print(len(json.load(sys.stdin)))"
# → 3

# 6. List — pending only
curl -s 'localhost:3000/api/v1/actions?pending=true' | python3 -c "import sys,json; print(len(json.load(sys.stdin)))"
# → 3+ (null effectiveness)

# 7. List — date range
curl -s 'localhost:3000/api/v1/actions?from=2025-10-01&to=2025-10-31' | python3 -c "import sys,json; print(len(json.load(sys.stdin)))"
# → ~3

# 8. Get by id
ID=$(curl -s localhost:3000/api/v1/actions | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
curl -s localhost:3000/api/v1/actions/$ID
# → 200, full row

# 9. Get — not found
curl -s localhost:3000/api/v1/actions/00000000-0000-0000-0000-000000000000
# → 404 { "message": "Action not found" }

# 10. Search
curl -s 'localhost:3000/api/v1/actions/search?q=velocity'
# → 200, array with 1+ matches

# 11. Search — query too short
curl -s 'localhost:3000/api/v1/actions/search?q=ab'
# → 400 { "message": "Search query must be at least 3 characters" }

# 12. Rate effectiveness — success (Level 2)
ID=$(curl -s 'localhost:3000/api/v1/actions?pending=true' | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
curl -s -X PUT localhost:3000/api/v1/actions/$ID/effectiveness \
  -H 'Content-Type: application/json' -H 'x-user-level: 2' \
  -d '{"effectiveness":4}'
# → 200, row with effectiveness=4

# 13. Rate — access denied (Level 1)
ID=$(curl -s 'localhost:3000/api/v1/actions?pending=true' | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
curl -s -X PUT localhost:3000/api/v1/actions/$ID/effectiveness \
  -H 'Content-Type: application/json' -H 'x-user-level: 1' \
  -d '{"effectiveness":3}'
# → 403

# 14. Rate — invalid value
curl -s -X PUT localhost:3000/api/v1/actions/$ID/effectiveness \
  -H 'Content-Type: application/json' -H 'x-user-level: 2' \
  -d '{"effectiveness":7}'
# → 400 { "message": "Effectiveness must be between 1 and 5" }
```
