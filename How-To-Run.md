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

## Enable semantic action search (SiliconFlow + Supabase pgvector)

The API always works: without SiliconFlow configuration it reports and uses
`lexical_fallback`. No paid provider is used as a fallback.

1. Create a SiliconFlow API key for an account with embedding allowance or free credits.
2. Add at minimum this value to `backend/.env`:

```dotenv
SILICONFLOW_API_KEY=your-key
```

The defaults in `backend/.env.example` use SiliconFlow's official OpenAI-compatible
endpoint, `Qwen/Qwen3-Embedding-0.6B`, 1024 dimensions, and a versioned embedding ID.
Override them only when the SiliconFlow account exposes a different model under
its free allowance. The currently configured test account exposes this Qwen model
but returned HTTP 402 after its allowance was exhausted; in that state the app
continues in lexical fallback mode until free allowance is available again.

3. Apply the migration to a new environment (it has already been applied to the
currently configured Supabase database):

```bash
set -a
. backend/.env
set +a
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260822000000_action_semantic_search.sql
```

4. Start Redis, the API, and the worker, then backfill existing actions:

```bash
cd backend
npm run backfill:action-embeddings
```

Safe inspection without writes:

```bash
cd backend
npm run backfill:action-embeddings -- --dry-run
```

5. Verify API mode:

```bash
curl -i 'localhost:3000/api/v1/actions/search?q=sprint+capacity&limit=5'
```

The `x-action-search-mode` response header is `hybrid`, `semantic`, or `lexical`.
The Log Action modal, global Actions view, and project Actions Library all use
this endpoint with debouncing and stale-request cancellation.

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
