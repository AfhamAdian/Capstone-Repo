## Prerequisites

- **Redis** — Docker (easiest). If Docker is not installed, install it first.
- **Supabase** — The backend connects to a Supabase PostgreSQL instance. Ensure `.env` is configured.
- **pnpm** (for dependencies) — If `pnpm` is not available, install via npm:

```bash
npm config set prefix ~/.npm-global
npm install -g pnpm@9
export PATH="$HOME/.npm-global/bin:$PATH"   # also add this line to ~/.bashrc
```

Or use `npm` directly — `npm install && npm run dev` works as a fallback because the package.json scripts are plain `vite`, not pnpm-specific.

---

## Start all services

**Terminal 1** — Redis
```bash
docker compose up redis -d
```

**Terminal 2** — Backend API (port 3000)
```bash
cd backend
npm run dev
```

**Terminal 3** — Backend Worker (port 4000)
```bash
cd backend
npm run dev:worker
```

**Terminal 4** — Frontend (port 5173)
```bash
cd new_frontend

# Option A: pnpm (preferred)
pnpm install
pnpm dev

# Option B: npm (fallback if pnpm is unavailable)
npm install
npm run dev
```

Then open **http://localhost:5173** in your browser.

---

## Role-based testing

The frontend login screen has a "Sign in as" picker with 3 options:

| Role | Level | Capabilities |
|------|-------|-------------|
| Viewer | 0 | View dashboards and actions. Cannot log or rate. |
| Manager | 1 | View + Log new management actions. Cannot rate. |
| Executive | 2 | View + Log + Rate action effectiveness. |

Enter any email/password, select a role, and click Sign In. The backend enforces role gates via the `x-user-level` header — switching roles on the login screen immediately changes what you see in the UI.

To test without the frontend:

```bash
# Log an action as Manager
curl -X POST localhost:3000/api/v1/actions \
  -H 'Content-Type: application/json' -H 'x-user-level: 1' \
  -d '{"projectIds":["onyx-mobile"],"problem":"...","reason":"...","actionTaken":"...","loggedBy":"name"}'

# Rate as Executive
curl -X PUT localhost:3000/api/v1/actions/<id>/effectiveness \
  -H 'Content-Type: application/json' -H 'x-user-level: 2' \
  -d '{"effectiveness":4}'
```
