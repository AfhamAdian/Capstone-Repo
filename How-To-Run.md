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
cd frontend

# Option A: pnpm (preferred)
pnpm install
pnpm dev

# Option B: npm (fallback if pnpm is unavailable)
npm install
npm run dev
```

Then open **http://localhost:5173** in your browser.

---

## Enable deep action search (Pinecone reranker)

Add a Pinecone API key to the ignored `backend/.env`:

```dotenv
PINECONE_API_KEY=your-key
PINECONE_RERANK_MODEL=bge-reranker-v2-m3
PINECONE_RERANK_MIN_SCORE=0.10
PINECONE_RERANK_CANDIDATE_LIMIT=100
```

Start the API, then use **Deep Search** in Log Action or **Deep Search** in the
project Action Library. Only these buttons call Pinecone. Typing Problem in Log
Action and all other search-as-you-type fields use local typo-tolerant keyword matching.

The deep endpoint is explicit:

```bash
curl -i 'localhost:3000/api/v1/actions/search?q=sprint+capacity&limit=5&mode=deep'
```

Successful deep results include `x-action-search-mode: rerank` and a normalized
`similarity` score. Results below `PINECONE_RERANK_MIN_SCORE` are omitted. If
Pinecone is unavailable, the deep request reports an error while action logging
and keyword search remain usable.

## Optional action embedding pipeline (Gemini + Supabase pgvector)

The existing Gemini worker can still store versioned action embeddings, but the
current user-facing deep search does not query those vectors.

1. Create a Gemini API key in Google AI Studio. Standard
   `gemini-embedding-001` requests are available on the Gemini API free tier,
   subject to Google's current quotas and data-use terms.
2. Add this value to `backend/.env` (the same key is used by the survey AI):

```dotenv
GEMINI_API_KEY=your-key
```

The defaults use Google's Gemini API, `gemini-embedding-001`, 768 dimensions,
`SEMANTIC_SIMILARITY`, L2 normalization, and the version
`gemini-embedding-001-768-l2-v1`. Google recommends 768 as one of the model's
supported reduced sizes. Changing the model, dimensions, task type, or
normalization requires a new embedding version and a full backfill.

3. Apply the migration to a new environment (it has already been applied to the
currently configured Supabase database):

```bash
set -a
. backend/.env
set +a
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260822000000_action_semantic_search.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260831010000_action_embeddings_gemini_provider.sql
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
