# Action Logging and Explicit Deep Action Search

Last verified: **2026-09-01**

This is the current implementation and operations reference for management-action
logging, embedding, keyword search, and explicit Pinecone reranking. The historical
Gemini/pgvector embedding pipeline remains available for stored embeddings, but user-facing
deep action search now uses Pinecone's `bge-reranker-v2-m3` only when a deep-search button
is clicked. Typing in a search field never invokes a semantic provider.

## Current status

The end-to-end code path is implemented:

- An action is stored first, so logging does not depend on the embedding provider.
- Its canonical text is recorded as a pending, versioned embedding task.
- BullMQ and Redis deliver that task to the worker.
- The worker calls Google's Gemini batch embedding endpoint.
- The vector is stored in Supabase Postgres using pgvector.
- Ordinary searches use local typo-tolerant keyword matching (or the lexical API mode).
- Explicit deep search sends at most 100 scoped action documents to Pinecone's
  `bge-reranker-v2-m3`, filters by `PINECONE_RERANK_MIN_SCORE`, and returns scores.
- Deep search is triggered only by **Deep Search** in Log Action and **Deep Search**
  in the project Action Library.
- If Pinecone is unavailable, deep search reports an error; it does not mislabel
  keyword fallback results as similarity results.

The pgvector migration has been applied to the currently configured Supabase
database. The live database currently has pgvector **0.8.0**, the
`action_embeddings` table, and the required RPC functions. The Gemini backfill
produced **12 ready 768-dimensional vectors**. Two failed SiliconFlow rows are
preserved under their historical embedding versions and are never compared with
Gemini vectors.

The configured Gemini key was tested directly against both `embedContent` and
`batchEmbedContents`. Both returned HTTP 200 with correctly sized 768-dimensional
vectors. Application tests and database verification are recorded below.

The original implementation excluded authentication changes. During the later
survey/auth merge, the incoming cookie-session authentication was preserved and
all action routes were attached to its existing `requireAuth` middleware. The
temporary `x-user-level` action header is no longer used.

## Gemini provider and free-tier policy

This implementation uses only the standard Gemini API endpoint for embeddings. It
does not fall back to any paid provider. Google currently lists standard
`gemini-embedding-001` input as free of charge on the free tier; quotas and terms
remain controlled by Google. Free-tier inputs may be used to improve Google's
products, so do not send text that the organization is not permitted to process
under those terms.

Defaults:

| Setting | Default |
|---|---|
| Endpoint | `https://generativelanguage.googleapis.com/v1beta` |
| Model | `gemini-embedding-001` |
| Task type | `SEMANTIC_SIMILARITY` |
| Dimensions | `768` |
| Normalization | L2 normalization in the adapter |
| Version | `gemini-embedding-001-768-l2-v1` |

The model supports 128–3072 dimensions; Google recommends 768, 1536, or 3072. This
application uses 768 to reduce storage and cosine-search cost. Because
`gemini-embedding-001` does not automatically normalize outputs truncated below
3072 dimensions, the adapter L2-normalizes every returned vector. Model,
dimensions, task type, and normalization are part of the embedding-version
contract; changing any of them requires a new version and backfill.

The selected model and version are reflected in
`backend/apps/api/config/env.ts`, `backend/.env.example`, the local ignored
`backend/.env`, and `How-To-Run.md`, as well as this reference.

Official references:

- [Gemini embeddings guide](https://ai.google.dev/gemini-api/docs/embeddings)
- [Gemini embeddings API](https://ai.google.dev/api/embeddings)
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Supabase semantic search](https://supabase.com/docs/guides/ai/semantic-search)
- [pgvector](https://github.com/pgvector/pgvector)

## Repository scope

“Action” means a management response to a project problem. The GitHub Actions
connector under `backend/libs/connectors/cicd/` is unrelated.

`frontend/` is connected to the live actions API.

## Relevant files

| Layer | File | Responsibility |
|---|---|---|
| Migration | `supabase/migrations/20260822000000_action_semantic_search.sql` | Enables pgvector; creates embedding storage, claim RPC, and match RPC. |
| Reference schema | `backend/apps/api/database/schema.sql` | Documents action and embedding tables. |
| Provider migration | `supabase/migrations/20260831010000_action_embeddings_gemini_provider.sql` | Allows Gemini rows while preserving legacy provider metadata. |
| Environment | `backend/apps/api/config/env.ts` | Parses Gemini, keyword-search, and Pinecone reranker configuration. |
| Environment example | `backend/.env.example` | Documents embedding and reranker variables. |
| Provider contract | `backend/libs/embeddings/embedding-provider.ts` | Provider interface, safe provider error, and vector validation. |
| Gemini adapter | `backend/libs/embeddings/gemini-embedding.provider.ts` | Batch requests, timeout, response validation, L2 normalization, and error classification. |
| Canonical text | `backend/libs/embeddings/embedding-text.ts` | Builds stable action text and SHA-256 content hash. |
| Action database | `backend/apps/api/database/actions.ts` | Insert/list/get/rate and bounded lexical search. |
| Embedding database | `backend/apps/api/database/action-embeddings.ts` | Pending/claim/complete/fail/retry operations and vector RPC call. |
| Creation service | `backend/apps/api/services/actions.service.ts` | Stores the action, prepares an embedding row, and enqueues best effort. |
| Reranker adapter | `backend/libs/reranking/pinecone-reranker.ts` | Pinecone HTTP request, timeout, and response validation. |
| Search service | `backend/apps/api/services/action-search.service.ts` | Keyword mode plus explicit scoped Pinecone reranking and threshold filtering. |
| Controller | `backend/apps/api/controllers/actions.controller.ts` | Input bounds, date validation, search mode header, and service calls. |
| Queue | `backend/libs/queue/action-embedding-queue.ts` | Dedicated BullMQ queue with deterministic job IDs and retries. |
| Worker processor | `backend/apps/worker/processors/action-embedding.processor.ts` | Claims tasks, embeds action text, and writes status/vector. |
| Worker entry | `backend/apps/worker/worker.ts` | Starts and closes sync, survey, and embedding workers. |
| Backfill | `backend/scripts/backfill-action-embeddings.ts` | Prepares, reconciles, and enqueues existing actions. |
| Frontend API | `frontend/src/app/api.ts` | Sends search options and maps optional similarity. |
| Frontend UI | `frontend/src/app/` | Integrates the action-search surfaces. |
| Tests | `backend/tests/embeddings.test.ts` | Canonical text, validation, provider request, and safe-error tests. |
| Tests | `backend/tests/action-search.test.ts` | Sanitization, date, scope, and effectiveness tests. |
| Tests | `backend/tests/pinecone-reranker.test.ts` | Pinecone request mapping and response validation. |

## Action data model

The existing `public.actions` table remains the source of truth:

| Column | Type | Meaning |
|---|---|---|
| `id` | `uuid` | Action primary key. |
| `project_ids` | `text[]` | Associated project IDs. |
| `problem` | `text` | What happened. |
| `reason` | `text` | Root cause. |
| `action_taken` | `text` | Management response. |
| `action_date` | `date` | Date supplied for the action. |
| `effectiveness` | `integer`, nullable | Unrated or a value from 1 to 5. |
| `logged_by` | `text` | Existing display value. |
| `created_at` | `timestamptz` | Database creation time. |

Vectors are deliberately stored separately in `public.action_embeddings`:

| Column | Purpose |
|---|---|
| `action_id`, `embedding_version` | Composite key; permits versioned model rollouts. |
| `provider`, `model`, `dimensions` | Prevents incompatible-vector ambiguity. |
| `content_hash` | Detects unchanged action text during backfill. |
| `status` | `pending`, `processing`, `ready`, or `failed`. |
| `embedding` | pgvector value; never included in normal action responses. |
| `attempt_count`, `last_error` | Retry and diagnosis state. |
| `embedded_at`, timestamps | Processing history. |

The table cascades when an action is deleted. A ready row must have a vector.

The vector column is dimension-agnostic. Gemini's 768-dimensional vectors therefore
require no column rewrite, and a future model can use a different dimension under
a new embedding version. The matching RPC checks dimensions before computing
cosine distance.

There is no HNSW index yet. Exact cosine search has perfect recall and is the
appropriate choice for the current nine-action corpus. Add a dimension-specific
HNSW or `halfvec` expression index only after the corpus and measured latency make
approximate search necessary.

## Canonical embedding document

Each action becomes this deterministic text:

```text
Problem: {problem}
Root cause: {reason}
Action taken: {action_taken}
```

Line endings and surrounding whitespace are normalized. Text is not lowercased or
stripped of useful punctuation. A SHA-256 hash of this exact text supports
idempotent backfill and future re-embedding decisions.

Effectiveness changes do not affect the canonical text and do not enqueue a new
embedding.

## Runtime flows

### 1. Log a new action

```text
LogActionModal
  -> POST /api/v1/actions
  -> controller validates and bounds the existing fields
  -> actions.service inserts public.actions
  -> response-critical action data is now durable
  -> if Gemini is configured:
       upsert action_embeddings as pending
       enqueue deterministic BullMQ job, best effort
  -> return 201 with the normal action row
```

Provider or Redis failure cannot undo the action insert. If pending-row creation or
enqueueing fails, the service logs a sanitized warning and returns the stored action.
The backfill command can reconcile it later.

### 2. Generate an action embedding

```text
action-embeddings BullMQ worker
  -> atomically claim pending/failed row
  -> status=processing and attempt_count += 1
  -> load the action
  -> build canonical text and hash
  -> POST text to Gemini with timeout
  -> validate vector count, dimension, and finite numeric values
  -> status=ready; save vector/model/hash/embedded_at
  -> on error: status=failed; save a bounded sanitized message; rethrow for retry
```

Queue behavior:

- Queue: `action-embeddings`.
- Job identity: action ID plus sanitized embedding version.
- Duplicate pending/active jobs are reused.
- Completed or terminal failed jobs can be replaced for reconciliation.
- Five attempts with exponential backoff starting at two seconds.
- Default worker concurrency is four.
- Completed and failed job retention is bounded.

The processor converts a non-retryable `EmbeddingProviderError` into BullMQ's
`UnrecoverableError`, preventing wasteful retries:

| Failure | Retry? |
|---|---|
| Timeout or network interruption | Yes |
| HTTP 429 | Yes |
| HTTP 5xx | Yes |
| HTTP 400, 401, 402, or 404 | No |
| Malformed or wrong-dimension vector | No |

With a real action and a live HTTP 402 response, action creation still returned
HTTP 201, the embedding row became `failed`, and `attempt_count` remained 1.

### 3. Search actions

Endpoint:

```http
GET /api/v1/actions/search?q=sprint%20capacity&limit=5&projectId=42&mode=deep
```

```text
request
  -> validate q and clamp limit
  -> without mode=deep: run bounded database keyword search
  -> with mode=deep:
       load at most PINECONE_RERANK_CANDIDATE_LIMIT scoped actions
       build labeled Problem / Root cause / Action taken documents
       call Pinecone Inference with bge-reranker-v2-m3
       keep scores at or above PINECONE_RERANK_MIN_SCORE
       return the requested top results in reranker order
  -> set x-action-search-mode
  -> expose x-action-search-mode through CORS
```

Search modes:

| Header value | Meaning |
|---|---|
| `rerank` | Pinecone reranker results, ordered and thresholded by relevance score. |
| `lexical` | Keyword-only API results; no semantic provider was called. |

The API includes `Access-Control-Expose-Headers: x-action-search-mode`, allowing
browser JavaScript to read the result mode. The frontend maps the header to
`rerank` or `lexical`; a missing or unknown value safely defaults to
`lexical`.

The API response stays an array of normal action rows. Reranked rows add an
optional `similarity` number; stored vectors are never returned.

### 4. Frontend search

Search behavior by surface:

- Log Action modal: typing Problem shows up to five local typo-tolerant keyword
  matches. Explicit **Deep Search** replaces them with Pinecone reranking results,
  excludes the edited action, and optionally scopes to one project.
- Global Actions view: typing performs local typo-tolerant keyword matching only.
- Project Actions Library: typing performs local typo-tolerant keyword matching;
  **Deep Search** explicitly invokes Pinecone reranking within the active project.

Deep-search surfaces abort obsolete requests so an older response cannot replace a newer
query. Both deep-search buttons require at least three trimmed characters.

The Global Actions view never calls the search endpoint while typing. The Project
Actions Library supplies the active project ID only when its Deep Search button is
clicked and displays loading, reranker scores, no-result, and error states.

The Log Action modal clears results and cancels an active request when Problem text
or the project selection changes, requiring another explicit click. It displays
searching, count, mode, no-result, unavailable, and similarity states, and excludes
the action currently being edited. A failed lookup never prevents logging.
Similarity compares the new Problem text with existing actions' combined problem,
root cause, and action-taken text. When exactly one project is selected, the server
filters to it; with zero or multiple selections, the search uses the authenticated
user/company scope without a single-project filter.

The merged frontend sends action requests with `credentials: "include"`; the
obsolete mock `x-user-level` headers and role picker are not used.

### 5. Backfill and reconciliation

The backfill command:

1. Loads existing actions in bounded order.
2. Builds the current canonical text/hash.
3. Skips a ready row when hash, model, and dimensions already match.
4. Upserts everything else as pending.
5. Enqueues deterministic jobs.
6. Resets stale processing rows to failed.
7. Re-enqueues pending and failed rows that may have missed Redis delivery.

This same command supports recovery after Redis downtime and migration to a new
embedding version.

## Provider behavior

The Gemini adapter calls:

```text
POST https://generativelanguage.googleapis.com/v1beta/
     models/gemini-embedding-001:batchEmbedContents
```

It authenticates with `x-goog-api-key` and sends one request entry per text:

```json
{
  "requests": [{
    "model": "models/gemini-embedding-001",
    "content": { "parts": [{ "text": "text to embed" }] },
    "taskType": "SEMANTIC_SIMILARITY",
    "outputDimensionality": 768
  }]
}
```

The adapter:

- Uses `AbortController` for the configured timeout.
- Reads the documented `embeddings[].values` response in request order.
- Validates one vector per input, exact configured dimensions, and finite numbers.
- L2-normalizes validated vectors, as required for reduced-dimension
  `gemini-embedding-001` output.
- Marks network, timeout, HTTP 408, HTTP 429, and HTTP 5xx failures as retryable.
- Does not include provider response bodies, API keys, action text, or vectors in
  its thrown HTTP errors.
- Treats authentication, malformed responses, dimension mismatches, and other
  request errors as non-retryable.

## Validation and bounds added

Outside authentication/roles, the action controller now:

- Rejects impossible calendar dates, not just malformed date strings.
- Limits an action to 50 project IDs.
- Limits project IDs to 200 characters.
- Limits problem, reason, and action text to 5,000 characters each.
- Limits `loggedBy` to 320 characters.
- Caps list results at 200.
- Caps search results at `ACTION_SEARCH_MAX_RESULTS`.
- Rejects a query that contains no searchable text after PostgREST control
  characters are removed.
- Uses explicit action projections rather than `.select('*')` so vectors can never
  leak through normal action queries.

## Environment configuration

Add the key to `backend/.env`:

```dotenv
GEMINI_API_KEY=your-gemini-api-key
```

Available settings and defaults:

```dotenv
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
GEMINI_EMBEDDINGS_URL=https://generativelanguage.googleapis.com/v1beta
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
GEMINI_EMBEDDING_DIMENSIONS=768
ACTION_EMBEDDING_VERSION=gemini-embedding-001-768-l2-v1
ACTION_SEARCH_MIN_SIMILARITY=0.70
ACTION_SEARCH_MAX_RESULTS=50
ACTION_EMBEDDING_TIMEOUT_MS=10000
PINECONE_API_KEY=
PINECONE_RERANK_URL=https://api.pinecone.io/rerank
PINECONE_RERANK_MODEL=bge-reranker-v2-m3
PINECONE_RERANK_MIN_SCORE=0.10
PINECONE_RERANK_CANDIDATE_LIMIT=100
PINECONE_RERANK_TIMEOUT_MS=10000
```

`GEMINI_API_KEY` is shared with the survey feature; `GEMINI_MODEL` controls survey
generation and is independent of `GEMINI_EMBEDDING_MODEL`.

Changing the embedding model, dimensions, task type, or normalization requires a
new `ACTION_EMBEDDING_VERSION` and a backfill. Never compare vectors from different
configurations under one version.

The health endpoint exposes only non-secret state:

```text
services.semanticActionSearch.status
services.semanticActionSearch.provider
services.semanticActionSearch.model
services.semanticActionSearch.dimensions
services.semanticActionSearch.embeddingVersion
services.actionReranking.status
services.actionReranking.provider
services.actionReranking.model
services.actionReranking.minScore
services.actionReranking.candidateLimit
```

`semanticActionSearch` describes the embedding worker. `actionReranking` is
`configured` when `PINECONE_API_KEY` exists and otherwise `not_configured`.

## Setup and operation

### Apply the migration

Apply the semantic-search migration and the Gemini provider migration. Existing
SiliconFlow rows remain labeled as historical data; all new rows use `gemini`:

```bash
set -a
. backend/.env
set +a
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260822000000_action_semantic_search.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260831010000_action_embeddings_gemini_provider.sql
```

The base migration is idempotent for the extension, table, index, and functions.
The provider migration changes only the provider check constraint and table
comment; it does not relabel or delete legacy vectors.

### Start the pipeline

```bash
docker compose up redis -d

cd backend
npm run dev
```

In another terminal:

```bash
cd backend
npm run dev:worker
```

### Preview and run backfill

```bash
cd backend
npm run backfill:action-embeddings -- --dry-run
npm run backfill:action-embeddings
```

Optional arguments:

```bash
npm run backfill:action-embeddings -- --limit=500 --stale-minutes=15
```

### Verify search

```bash
curl -i 'http://localhost:3000/api/v1/actions/search?q=sprint+capacity&limit=5'
curl -i 'http://localhost:3000/api/v1/actions/search?q=sprint+capacity&limit=5&mode=deep'
curl -s 'http://localhost:3000/api/v1/health'
```

The first request reports `lexical`; the second reports `rerank` when Pinecone is
configured. The embedding worker and ready vectors are not required for reranking.

Useful database checks:

```sql
select extversion from pg_extension where extname = 'vector';

select status, count(*)
from public.action_embeddings
group by status
order by status;

select action_id, embedding_version, model, dimensions,
       status, attempt_count, last_error, embedded_at
from public.action_embeddings
order by updated_at desc;
```

## Pinecone reranker verification

Verification date: **2026-09-01**

- A live `bge-reranker-v2-m3` request returned HTTP 200.
- A relevant deployment-delay document scored `0.9284088`; an unrelated office
  furniture document scored `0.000016187581`.
- `npm run test:actions` passed all **11/11** focused tests, including the new
  reranker request mapping and malformed-score validation.
- The frontend production build succeeded; only the existing large-chunk warning remains.
- Repository-wide TypeScript checking still reports the eight pre-existing
  health-score property errors listed in the historical verification below.

## Historical Gemini migration verification

Verification date: **2026-08-31**

- Google's live `embedContent` endpoint returned HTTP 200 and one 768D vector.
- Google's live `batchEmbedContents` endpoint returned HTTP 200, two vectors in
  request order, and 768 dimensions for each.
- The configured API and worker report provider `gemini`, model
  `gemini-embedding-001`, dimensions `768`, and version
  `gemini-embedding-001-768-l2-v1`.
- The provider-constraint migration was applied to the configured Supabase
  database. Its check accepts `gemini` and historical `siliconflow` metadata.
- A real backfill scanned and queued 12 actions; all 12 reached `ready`.
- Every ready Gemini row records provider `gemini`, the expected model and version,
  declared dimensions 768, and an actual pgvector dimension of 768.
- Every stored Gemini vector passed a unit-length check after L2 normalization.
- A live service-level search returned `hybrid`, ranked the expected action first,
  and returned cosine similarity `0.90232264995575`.
- `npm run test:actions` passed all **10/10** tests, including request mapping,
  normalization, safe errors, scope behavior, validation, and hybrid RRF.
- The current `frontend/` production build succeeded with 2,667 transformed
  modules; only the existing large-chunk warning remains.
- Repository-wide TypeScript checking reports eight existing health-score property
  errors in `health-provenance.service.ts` and `health-score-blend.service.ts`; it
  reports no Gemini integration error.

## Historical SiliconFlow end-to-end verification

Verification date: **2026-08-22**

Before the Gemini migration, the SiliconFlow implementation was exercised from action creation through queue processing,
embedding storage, vector RPC retrieval, hybrid ranking, HTTP response, and
frontend consumption.

### Live API and infrastructure

| Check | Result |
|---|---|
| API health | Pass — HTTP 200 |
| Supabase connection | Pass |
| Semantic configuration detection | Pass |
| Redis | Listening on port 6379 |
| API | Running on port 3000 |
| Worker | Running on port 4000 |
| Frontend development server | Running on port 5173 |
| Supabase pgvector | Installed, version 0.8.0 |
| Embedding table and RPCs | Present |
| SiliconFlow key authentication | Valid |
| Former BGE model | Unavailable to this account |
| Qwen3 0.6B response contract | Pass — one real 1,024D vector |
| Sustained real embeddings | Externally blocked by SiliconFlow HTTP 402 |
| Lexical fallback during HTTP 402 | Pass |

An earlier fallback-only check was also performed before the key and Redis were
available. Semantic configuration remained disabled, normal action listing worked,
search returned HTTP 200 with `x-action-search-mode: lexical`, a query for
`velocity` found the expected existing action, and a control/wildcard-only query
returned HTTP 400. Docker Desktop was stopped and no local `redis-server` binary
was installed during that earlier check, so it also verified the API's no-Redis
failure path. The later live check above supersedes only that infrastructure state:
Redis and real queue delivery were subsequently exercised.

Verified response metadata included:

```text
Access-Control-Allow-Origin: *
Access-Control-Expose-Headers: x-action-search-mode
x-action-search-mode: hybrid
```

### Live Supabase

- `public.action_embeddings` exists.
- `public.claim_action_embedding` exists.
- `public.match_actions` exists.
- A temporary three-dimensional vector matched through the RPC inside a
  transaction; the transaction was rolled back and left no test embedding.
- At the final live-provider check, the database had zero ready real vectors and
  one preserved failed row under the legacy BGE version.

### Temporary action test set

Five actions were created through `POST /api/v1/actions` with
`logged_by = 'Semantic E2E Verification'`:

1. Flaky deployment pipeline and nondeterministic integration tests.
2. Customer onboarding abandonment and an overly long signup form.
3. Slow analytics dashboards caused by missing database indexes.
4. Engineer fatigue caused by an uneven overnight on-call rotation.
5. Provider-outage resilience for action logging.

The first four proved action creation and real queue delivery. The worker claimed
them and recorded SiliconFlow's HTTP 402 failure. The fifth proved specifically
that a permanent embedding failure does not affect the HTTP 201 action response
and is attempted only once.

### Semantic integration under provider-account blockage

Because the account could not sustainably generate action and query vectors, the
production SiliconFlow adapter was temporarily pointed at a local deterministic,
OpenAI-compatible embedding fixture. The fixture was used only for integration
verification and was never committed or configured in production.

It exercised this path:

```text
action source text
  -> SiliconFlow adapter request/response code
  -> 1024D validation
  -> public.action_embeddings
  -> public.match_actions cosine RPC
  -> project filter
  -> lexical candidate retrieval
  -> RRF
  -> Express API
  -> CORS-exposed mode header
```

| Case | Query | Expected result | Mode | Result |
|---|---|---|---|---|
| Paraphrase only | “releases keep getting blocked by flaky automated checks” | Deployment-pipeline action first | `semantic` | Pass |
| Exact plus meaning | “database scans” | Database-index action first | `hybrid` | Pass |
| Wellbeing paraphrase | “developer burnout after overnight incident duty” | On-call-fatigue action first | `semantic` | Pass |
| Project exclusion | Deployment query restricted to `meridian-api` | No cross-project deployment action | `lexical`, empty | Pass |
| Real provider unavailable | “database scans” through the normal API | Exact database action | `lexical` | Pass |

Semantic responses included `similarity`; the expected leading matches had a
similarity of 1.0 with the deterministic fixture. This proves the application
integration and ranking behavior, but is not a real Qwen retrieval-quality
evaluation. That requires provider allowance and real model-generated vectors.

### Validation and maintenance checks

| Check | Result |
|---|---|
| Query containing only stripped wildcard/control characters | HTTP 400 — Pass |
| Impossible date `2026-02-30` | HTTP 400 — Pass |
| Lexical project filter | Pass |
| Dry-run backfill | Pass |
| Dry-run rows scanned | 15 before dummy cleanup |
| Dry-run rows skipped as current/ready | 4 temporary fixture rows |
| Dry-run writes or queue operations | 0 |

### Automated backend tests

```bash
cd backend
npm run test:actions
```

Final result: **8 tests passed, 0 failed**. The earlier 7/7 result preceded the
account/request-error classification test and is superseded by this run.

Coverage includes:

- Canonical text normalization and stable content hashing.
- Wrong dimensions and non-finite vector rejection.
- SiliconFlow request mapping and documented response handling.
- Retryable HTTP 429 classification.
- Non-retryable HTTP 400/401/402/404 classification, including the automated 402
  case.
- PostgREST search-query sanitization.
- Impossible-date rejection.
- Hybrid reciprocal-rank fusion.

### TypeScript and frontend build

No new semantic-search TypeScript error was reported. The repository-wide backend
typecheck still reports only these unrelated pre-existing errors:

- `backend/apps/api/src/database/metrics.ts:187`
- `backend/libs/connectors/cicd/GithubActionsConnector/github-actions.connector.ts:210`
- `backend/libs/risk-engines/risk-engine.ts:63`

Node 20 or later remains recommended because Node 18 emits a Supabase SDK warning.

The frontend production build succeeded:

```text
pnpm exec vite build --outDir /tmp/capstone-semantic-frontend-e2e-build
2626 modules transformed
Build succeeded
```

The only frontend build notice was the existing large-chunk warning. The in-app
browser connection was unavailable, so a visual click-through was not performed;
the production build, frontend/API type contract, CORS header, and backend requests
were verified directly.

### Cleanup

All five dummy actions were deleted after testing, and their embedding rows were
removed by foreign-key cascade:

```text
dummy actions remaining: 0
orphaned dummy embeddings: 0
```

The temporary embedding fixture and temporary port-3100 API were stopped. No fake
embedding remains in Supabase or repository configuration.

## Using Pinecone deep action search

To obtain reranked results:

1. Set `PINECONE_API_KEY` in the ignored `backend/.env`.
2. Start the API. Redis, the embedding worker, and a vector backfill are not required
   for reranking because the API sends bounded action text directly to Pinecone.
3. Click **Deep Search** in Log Action or **Deep Search** in Action Library.
4. Evaluate realistic queries and tune `PINECONE_RERANK_MIN_SCORE`.

If Pinecone is unconfigured or reaches a quota/provider error, action logging and
keyword search remain fully usable. Deep search reports that it is unavailable.

Future scale work, only when measurements justify it:

- Add a dimension-specific HNSW or `halfvec` expression index.
- Add pagination to very large action libraries.
- Build a labeled retrieval evaluation set and track Recall@5, MRR, no-result
  accuracy, p95 latency, provider error rate, and fallback rate.
- For a new free embedding model, increment the version, backfill alongside the
  old version, evaluate, switch the active version, and then retire old rows.

No authentication or role-based changes are required by this remaining work.
