# Frontend Implementation — Action Logging Feature

> Authentication update (2026-08-22): a later merge replaced the temporary local
> role picker and `x-user-level` headers described below with the application's real
> cookie-session login and admin/member authorization. Action API calls now use
> `credentials: "include"`; the incoming authentication implementation is authoritative.

Status: **Complete.** All changes wired to the live backend API. Roles gated, similar-problems search debounced, `LogActionModal` split into separate Problem/Reason fields.

---

## 1. What Was Built

- Replaced the 8 hardcoded `ACTIONS` mock entries with live data from the backend `/api/v1/actions` endpoint.
- Added a **role picker** to the login screen so you can sign in as Viewer, Manager, or Executive.
- **Level-gated buttons**: "Log Action" only visible at Level 1+, pending-review badges and rating UI only at Level 2+.
- **LogActionModal** split into separate Problem / Root Cause fields, date input bound to state, similar-past-problems fetched from `/api/v1/actions/search` with a 400ms debounce as the user types.
- **Effectiveness rating** wired: `InlineRating`, `EffRow`, and `GlobalEffRow` call `PUT /:id/effectiveness` on click with optimistic state updates.

---

## 2. Files Changed

| File | Changes |
|------|---------|
| `src/app/api.ts` | Added `listActions()`, `createAction()`, `searchActions()`, `rateAction()` + `authHeaders()` helper + `rowToAction()` mapper. `authHeaders()` reads `level` from localStorage `pulse.auth.v1` and sends `x-user-level` header (the backend's role gate). |
| `src/app/context/WorkspaceContext.tsx` | Added `level: number` to `AuthUser`. `login(email, level)` signature updated. Old stored sessions without `level` are normalized to Level 1 on load. |
| `src/app/pages/LoginView.tsx` | Added a 3-option role picker (Viewer/Manager/Executive) between password and submit. Passes `level` to `login()`. |
| `src/app/App.tsx` | Deleted `ACTIONS` mock. Added `actions` state + `useEffect` fetch. Added `handleLogAction()` and `handleRateAction()` handlers. Replaced all `ACTIONS` references with `actions`. Passed new props (`onRateAction`, `onSubmit`). Level-gated TopBar badge, Sidebar buttons, PortfolioView buttons, Dashboard review banner. Replaced `problemAndCause` → separate `problem` + `reason` in `LogActionModal`. Wired similar search to API. Bound date input. Added error display on submit failure. |

---

## 3. Role System (Frontend Side)

### How it works

```
LoginView role picker → WorkspaceContext.login(email, level) → localStorage ("pulse.auth.v1")
    → api.ts authHeaders() reads level → x-user-level header on every fetch
    → backend requireLevel() middleware enforces
    → UI components read useWorkspace().user.level to hide/show buttons
```

### Level definitions

| Level | Name | In frontend |
|-------|------|-------------|
| 0 | Viewer | See everything; *cannot* log actions or rate |
| 1 | Manager | See everything + Log Action button visible everywhere + can submit the LogActionModal |
| 2 | Executive | Everything Manager can do + pending-review badges visible + rating stars are interactive + effectiveness review panels available |

### How to edit roles

| What you want | Where to change |
|---------------|-----------------|
| Change role labels/descriptions in the login picker | `LoginView.tsx` → `ROLE_OPTIONS` array |
| Change which level is the default on login | `LoginView.tsx` → `useState<number>(1)` initializer (currently defaults to Manager) |
| Change what level means in the backend | `backend/.../middlewares/role.middleware.ts` → `ROLE_LEVELS` |
| Old sessions (pre-role feature) auto-upgrade | `WorkspaceContext.tsx` → `loadAuth()` normalizes missing `level` to 1 |

---

## 4. Decision Log

| Decision | Why |
|----------|-----|
| `rowToAction()` mapper in `api.ts` | Backend returns snake_case; a single mapper keeps the shape conversion in one place. The `Action` interface in App.tsx is structurally identical to `ApiAction` from api.ts — no type imports needed. |
| `authHeaders()` as a shared helper | Every action API call needs `x-user-level`. One function, spread into every fetch. When auth moves to JWT, change this one function — all callers follow. |
| Optimistic rating update | `handleRateAction` updates `actions` state immediately, then fires `rateAction(id, rating)`. On failure, refetches. Users see instant feedback. |
| LogActionModal refetches after create | Full list refresh (`refreshActions()`) after `createAction()` rather than appending the DTO. Simpler, always consistent with the DB. |
| Debounce 400ms on similar search in modal | Prevents hammering the API on every keystroke; fires once the user pauses. Search only triggers when `problem` ≥ 4 chars. |
| Level gates inside components via `useWorkspace()` | No prop drilling for "can this user see the Log Action button?" — each component reads its own context. Cleaner given the existing monolithic structure. Props are used only for event handlers (callbacks from App's state). |
| No loading skeleton | Data appears instantly from the API (8 seed rows, local network). Previous mock data was also instant. |
| No error toasts | Errors log to console and show inline in the modal. Toast library not worth the setup cost for this feature. |
| Rollback on rate failure calls `refreshActions()` | If the PUT fails (network error), the full list is refetched to restore server truth. Simple and always correct. |

---

## 5. Component Changes (Detailed)

### `InlineRating`
- Now accepts `onRate?: (n:number)=>void`. 
- Uses `useWorkspace()` internally — if `level < 2`, renders static stars without click handlers. 
- If `level >= 2`, clicking a star calls `onRate()` (for both initial rating and re-rating). 
- Syncs internal `saved` state to the `effectiveness` prop via `useEffect`.

### `LogActionModal`
- Props changed from `{onClose, preId, projects, actions}` → `{onClose, preId, projects, onSubmit}`. 
- `onSubmit` is `async(input) => void`. 
- Two textareas: "Problem" and "Root Cause". 
- Date input is a controlled `<input type="date" value={date} onChange={...}>`. 
- Similar past problems panel: `useEffect` debounces `searchActions(problem, 5)` every 400ms when `problem` ≥ 4 chars. Results render in the same card design as before. 
- Submit: calls `onSubmit(input)`, shows success animation, auto-closes after 1200ms. On error, shows inline red error message.

### `GlobalActionsView`
- New prop `onRateAction`. Passed to `InlineRating` per row. 
- "Log Action" button wrapped in `{canLog&&(...)}`.

### `PortfolioView`
- Reads `useWorkspace()` for `canLog`/`canRate`. 
- "Log Action" button gated. 
- "All Actions" pending badge gated to `canRate`.

### `Sidebar`
- "Log Action" button gated with `canLog`. 
- "X actions need review" indicator gated with `canRate`.

### `Dashboard`
- New prop `onRateAction` (passed to `EffRow`). 
- Pending review banner gated with `canRate`. 
- `EffRow` calls `onRate(id, rating)` on star click.

### `TopBar`
- Star badge (pending count) gated with `canRate`.

---

## 6. How to Run

```bash
# Backend (already running via tsx watch)
cd backend && npm run dev          # port 3000
cd backend && npm run dev:worker   # port 4000
docker compose up redis -d          # required by API

# Frontend (uses pnpm)
cd new_frontend && pnpm dev         # typically port 5173
```

The frontend expects the backend at `http://localhost:3000/api/v1` (default; override with `VITE_API_BASE_URL` in `new_frontend/.env`).

### Verifying role gating

1. Open `http://localhost:5173`
2. Login as **Viewer** (Level 0) → No "Log Action" button on Portfolio/Sidebar. Rating stars are static/unclickable. No pending-review badge in TopBar.
3. Login as **Manager** (Level 1) → "Log Action" button visible. Can submit the modal. Rating stars are static. No pending-review badge.
4. Login as **Executive** (Level 2) → Everything Manager can do + pending-review badge with count in TopBar + rating stars are clickable (calls PUT /effectiveness).

---

## 7. Known Limitations

1. **Node 18 incompatibility with Vite 8** — The Vite dev server requires Node ≥ 20. The user was running `pnpm dev` successfully with a newer Node via a version manager. If the host system only has Node 18, the build command fails but the existing dev server (started with a working Node version) works fine.
2. **pagination is zero-first-load** — While fetching actions, the UI shows empty tables briefly. Adding a loading skeleton is a minor enhancement.
3. **No error toasts** — API failures log to console; only the LogActionModal shows an inline error. Toast notifications would improve UX for rating failures.
4. **`handleRateAction` refetch-on-error** — The full list is re-fetched if a rating call fails, which may cause a brief flicker. Sufficient for a demo.
