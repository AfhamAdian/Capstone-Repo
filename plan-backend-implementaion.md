# Backend Implementation — Action Logging Feature

Status: **Complete.** All 14 tests passing against the live API + Supabase.

---

## 1. What Was Built

Five REST endpoints for logging, browsing, searching, and rating management actions, backed by a new `actions` table in Supabase, with level-based access control via a placeholder header system.

| Method | Path | Gate | Purpose |
|--------|------|------|---------|
| `POST` | `/api/v1/actions` | Level 1+ | Log a new action |
| `GET` | `/api/v1/actions` | Open | List (filters: `projectId`, `from`, `to`, `pending`, `limit`) |
| `GET` | `/api/v1/actions/search` | Open | Search similar past actions (`q` ≥ 3 chars, `limit`) |
| `GET` | `/api/v1/actions/:id` | Open | Get one action |
| `PUT` | `/api/v1/actions/:id/effectiveness` | Level 2+ | Rate effectiveness 1–5 |

---

## 2. Files Created

### `backend/apps/api/src/middlewares/role.middleware.ts`
Level-gate factory. Reads `x-user-level` header, 403s if below the required minimum. Exports `ROLE_LEVELS` constants — **the single edit point for role changes** (details in §6).

### `backend/apps/api/src/database/actions.ts`
Supabase queries. Returns raw snake_case rows (no DTO — matches codebase convention).

| Function | What it does |
|----------|--------------|
| `insertAction(input)` | Insert, maps camelCase input → snake_case columns inline (same pattern as `metrics.ts`), returns inserted row |
| `listActions(filters)` | `.contains('project_ids', …)`, `.gte/.lte('action_date', …)`, `.is('effectiveness', null)`, `limit` (default 100), ordered `action_date DESC` |
| `getActionById(id)` | `.single()`, returns `null` on not-found |
| `searchActions(q, limit)` | `ILIKE '%q%'` across `problem`, `reason`, `action_taken` — **placeholder for the semantic-search blackbox** |
| `updateActionEffectiveness(id, rating)` | `.update().select().single()`, returns `null` on not-found |

Internal helpers: `UUID_RE` pre-validation, `NO_ROWS_CODE = 'PGRST116'` (PostgREST no-rows error → `null`).

### `backend/apps/api/src/controllers/actions.controller.ts`
Request handlers with inline validation (same style as `sync.controller.ts`). No service layer — handlers call the database module directly.

### `backend/apps/api/src/routes/actions.route.ts`
Route table. **Order matters: `/search` is registered before `/:id`** so "search" isn't captured as an id.

## Files Edited

- `backend/apps/api/src/routes/index.ts` — mounted `router.use('/actions', actionsRouter)`
- `backend/apps/api/src/database/schema.sql` — appended table definition (documentation only; the real table was created via `psql` using `DATABASE_URL` from `backend/.env`)

---

## 3. Database

Table `public.actions` (created directly in Supabase via `psql`, 8 seed rows matching the frontend mock data):

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
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);
-- + GIN index on project_ids, DESC index on action_date, partial index on NULL effectiveness
```

Column notes:
- `project_ids` is `text[]` holding **frontend string ids** (e.g. `onyx-mobile`) — deliberately not FK'd to `project.id` so the feature works before real project sync exists.
- `effectiveness` NULL = pending review; 1–5 once rated.
- `action_date` = "time the action was taken" (user-picked), defaults to today. `created_at` = when the row was logged (audit).

---

## 4. Design Decisions (and why)

| Decision | Rationale |
|----------|-----------|
| **No DTO/mapper layer** | Codebase convention — `project.ts`, `metrics.ts`, `risk-score.ts` all return raw Supabase rows. API speaks snake_case; the frontend `api.ts` will map to its `Action` interface in one place during the frontend phase. |
| **No service layer** | Would be five pass-through functions. Validation lives inline in controllers (exactly how `sync.controller.ts` does it); queries live in `database/actions.ts`. |
| **No `company_id` / `logged_by_user_id` columns** | YAGNI — no company concept or real auth exists yet. One-line `ALTER TABLE` when they land. |
| **UUID primary keys** | Maps cleanly to the frontend's `id: string`; `gen_random_uuid()` is built into Supabase Postgres. |
| **Header-based roles (`x-user-level`)** | Placeholder for real auth. Frontend will send it from localStorage. Swapping to JWT = change the inside of `requireLevel()` only; route declarations don't move. |
| **404 via `PGRST116` + UUID pre-check** | `.single()` errors with `PGRST116` on zero rows → mapped to `null` → controller 404. Malformed UUIDs short-circuit to `null` instead of throwing a Postgres cast error. |
| **Search sanitization** | Strips `%_,"()\` from the query — commas/quotes/parens would break PostgREST's `.or()` filter string; `%`/`_` would act as unintended wildcards. |
| **Search = ILIKE placeholder** | Stable contract (`GET /search?q=…` → `ActionRow[]`). Internals get replaced by embeddings (pgvector) later without touching routes or responses. |
| **Validation in controller, not middleware** | Matches `sync.controller.ts` precedent; keeps route file declarative. |

---

## 5. API Reference

### `POST /api/v1/actions` — Log action (Level 1+)

Request:
```json
{
  "projectIds": ["onyx-mobile"],
  "problem": "Sprint velocity dropped 40%",
  "reason": "Two senior engineers reassigned mid-sprint",
  "actionTaken": "Reduced sprint scope 30%; scheduled handoffs",
  "loggedBy": "sarah@example.com",
  "timestamp": "2025-11-15"          // optional, YYYY-MM-DD, defaults to today
}
```
→ `201` created row (snake_case).

400s: missing/empty `problem` | `reason` | `actionTaken` | `loggedBy`; `projectIds` not a non-empty string array; bad `timestamp` format.
403: `x-user-level` < 1.

### `GET /api/v1/actions` — List

Query params (all optional): `projectId`, `from=YYYY-MM-DD`, `to=YYYY-MM-DD`, `pending=true`, `limit=N` (default 100).
→ `200` row array, newest first.

### `GET /api/v1/actions/search?q=...&limit=...` — Similar past actions

`q` min 3 chars (else 400), `limit` default 5. This is the endpoint the frontend's "Find Similar" panel will poll as the user types.
→ `200` row array.

### `GET /api/v1/actions/:id` — Get one

→ `200` row, or `404 { "message": "Action not found" }` (covers both missing and malformed UUIDs).

### `PUT /api/v1/actions/:id/effectiveness` — Rate (Level 2+)

```json
{ "effectiveness": 4 }
```
→ `200` updated row. 400 if not an integer 1–5; 403 if level < 2; 404 if not found.

---

## 6. Roles — Details & How to Edit

### Current model

Defined in **`backend/apps/api/src/middlewares/role.middleware.ts`**:

```typescript
export const ROLE_LEVELS = { VIEWER: 0, MANAGER: 1, EXECUTIVE: 2 } as const;
```

| Level | Name | Can do |
|-------|------|--------|
| 0 | `VIEWER` | View actions, search, list (all GETs are open) |
| 1 | `MANAGER` | + Log actions (`POST /actions`) |
| 2 | `EXECUTIVE` | + Rate effectiveness (`PUT /:id/effectiveness`) |

### How the level reaches the backend

Request header: `x-user-level: <integer>`.
Missing/invalid header → treated as `VIEWER` (0). The frontend will send this from localStorage (where its mock auth already stores the user) during the frontend phase.

### How to edit roles

| What you want | Where to change |
|---------------|-----------------|
| **Rename levels / change what a level is called** | Edit the `ROLE_LEVELS` constant map. Route files reference names, not numbers, so they follow automatically. |
| **Change which level can log actions** | `routes/actions.route.ts` → the `requireLevel(ROLE_LEVELS.MANAGER)` on the `POST` line. Swap to any other constant or number. |
| **Change which level can rate** | Same file → `requireLevel(ROLE_LEVELS.EXECUTIVE)` on the `PUT` line. |
| **Gate the GET endpoints too** | Same file → add `requireLevel(ROLE_LEVELS.X)` between the path and the handler on the GET lines. |
| **Add a new level (e.g. ADMIN = 3)** | Add to `ROLE_LEVELS`, then use `requireLevel(ROLE_LEVELS.ADMIN)` on whichever routes need it. |
| **Per-route custom rule** | Write any middleware with the same `(req, res, next)` shape and drop it into the route's middleware chain. |
| **Move from header to real auth (JWT)** | Edit **only the inside** of `requireLevel()` in `role.middleware.ts`: decode the token, read the level claim, keep the `403` + `next()` logic. Zero route changes. |
| **Store levels in the DB** | `User.level` column was intentionally **not** added yet (YAGNI). When real auth lands: `ALTER TABLE public."User" ADD COLUMN level integer NOT NULL DEFAULT 0;` then read it inside `requireLevel()`. |

---

## 7. Test Evidence (all passing)

Verified against the live API on `localhost:3000` + Supabase:

| # | Test | Result |
|---|------|--------|
| 1 | Create action as Level 1 | `201`, UUID assigned, `action_date` defaulted to today |
| 2 | Create with missing `problem` | `400 "problem is required"` |
| 3 | Create as Level 0 | `403 "Insufficient permissions"` |
| 4 | List all | `200`, 9 rows, newest-first |
| 5 | `?projectId=onyx-mobile` | 3 rows |
| 6 | `?pending=true` | only null-effectiveness rows |
| 7 | `?from=2025-10-01&to=2025-10-31` | 5 rows, all within range |
| 8 | Get by valid id | `200` full row |
| 9 | Get by zero UUID | `404 "Action not found"` |
| 10 | Search `?q=velocity` | matched the velocity action |
| 11 | Search `?q=ab` | `400` (min 3 chars) |
| 12 | Rate as Level 2, value 4 | `200`, `effectiveness: 4` persisted |
| 13 | Rate as Level 1 | `403` |
| 14 | Rate value 7 | `400 "Effectiveness must be between 1 and 5"` |

`npm run typecheck`: zero errors in the new files (11 pre-existing errors in `worker.ts`, `queue-manager.ts`, `metrics.ts`, `github-actions.connector.ts`, `risk-engine.ts` are unrelated to this feature and predate it).

---

## 8. Known Limitations / Future Work

1. **Frontend now integrated** — `api.ts` sends the `x-user-level` header derived from localStorage `pulse.auth.v1`. The `LoginView` role picker sets the level. A single `authHeaders()` helper is spread into every action API call. See `plan-frontend-implementation.md` for details.
2. **No edit/delete endpoints** — log-only by design for now; add `PATCH/DELETE /:id` if needed later.
3. **Search is ILIKE, not semantic** — blackbox placeholder awaiting the embeddings implementation (pgvector + embedding column on `actions`; the route and response shape stay identical).
4. **Header auth is spoofable** — acceptable for local dev only; replace with JWT before anything public.
5. **No pagination cursor** — `limit` only, default 100; fine at current scale.
6. **`project_ids` are free strings** — no FK to `project` table until real project sync exists; migrating to integer FKs later will need a data mapping pass.
