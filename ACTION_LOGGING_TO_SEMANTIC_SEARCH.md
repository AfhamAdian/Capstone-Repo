# Action Logging to Semantic Action Search

Last verified: **2026-08-22**

This is the current implementation and operations reference for management-action
logging, embedding, and semantic search. The provider name used here is
**SiliconFlow** (“Silicon Flow”); the earlier “SignalFlow” spelling referred to
SiliconFlow.

## Current status

The end-to-end code path is implemented:

- An action is stored first, so logging does not depend on the embedding provider.
- Its canonical text is recorded as a pending, versioned embedding task.
- BullMQ and Redis deliver that task to the worker.
- The worker calls SiliconFlow's OpenAI-compatible embeddings endpoint.
- The vector is stored in Supabase Postgres using pgvector.
- Search embeds the query, retrieves cosine matches, and fuses them with lexical
  matches using reciprocal-rank fusion (RRF).
- If SiliconFlow, Redis, or the vector path is unavailable, action logging still
  works and search automatically uses lexical matching.
- The Log Action modal, global Actions page, and project Actions Library all use
  the server search endpoint.

The pgvector migration has been applied to the currently configured Supabase
database. The live database currently has pgvector **0.8.0**, the
`action_embeddings` table, and both required RPC functions. It currently has
**zero ready vectors**. One pre-existing action has a failed row under the former
BGE embedding version; it was preserved and will be superseded by the Qwen version
when a successful backfill can run.

Authentication and role-based code were explicitly excluded. No authentication
middleware, role levels, route role gates, login behavior, role-based UI behavior,
or `authHeaders()` behavior was changed.

## Free-only provider policy

This implementation uses only SiliconFlow for embeddings. It does not import the
OpenAI SDK, call OpenAI, or fall back to any paid embedding provider.

Defaults:

| Setting | Default |
|---|---|
| Endpoint | `https://api.siliconflow.com/v1/embeddings` |
| Model | `Qwen/Qwen3-Embedding-0.6B` |
| Dimensions | `1024` |
| Version | `siliconflow-qwen3-embedding-0.6b-1024-v1` |

The live SiliconFlow model endpoint for the configured account exposes
`Qwen/Qwen3-Embedding-0.6B`, and a real request returned a 1,024-dimensional vector.
SiliconFlow controls model availability and may change its free-credit policy.
The application itself cannot guarantee unlimited free hosted inference; it
guarantees that it will not silently switch to a paid provider. Confirm that the
model is marked free in the account before backfilling, and use the account's
spending controls.

Official references:

- [SiliconFlow Create Embeddings API](https://docs.siliconflow.com/en/api-reference/embeddings/create-embeddings)
- [SiliconFlow model list](https://docs.siliconflow.com/quickstart/models)
- [SiliconFlow pricing and spending limits](https://www.siliconflow.com/pricing)
- [Supabase semantic search](https://supabase.com/docs/guides/ai/semantic-search)
- [pgvector](https://github.com/pgvector/pgvector)

## Repository scope

“Action” means a management response to a project problem. The GitHub Actions
connector under `backend/libs/connectors/cicd/` is unrelated.

`new_frontend/` is connected to the live actions API. The older
`frontend-react/src/app/pages/ActionCenter.tsx` remains a separate mock-only UI and
is not part of this pipeline.

## Relevant files

| Layer | File | Responsibility |
|---|---|---|
| Migration | `supabase/migrations/20260822000000_action_semantic_search.sql` | Enables pgvector; creates embedding storage, claim RPC, and match RPC. |
| Reference schema | `backend/apps/api/src/database/schema.sql` | Documents action and embedding tables. |
| Environment | `backend/apps/api/src/config/env.ts` | Parses SiliconFlow and search configuration. |
| Environment example | `backend/.env.example` | Documents every semantic-search variable. |
| Provider contract | `backend/libs/embeddings/embedding-provider.ts` | Provider interface, safe provider error, and vector validation. |
| SiliconFlow adapter | `backend/libs/embeddings/siliconflow-embedding.provider.ts` | HTTP request, timeout, response parsing, and error classification. |
| Canonical text | `backend/libs/embeddings/embedding-text.ts` | Builds stable action text and SHA-256 content hash. |
| Action database | `backend/apps/api/src/database/actions.ts` | Insert/list/get/rate and bounded lexical search. |
| Embedding database | `backend/apps/api/src/database/action-embeddings.ts` | Pending/claim/complete/fail/retry operations and vector RPC call. |
| Creation service | `backend/apps/api/src/services/actions.service.ts` | Stores the action, prepares an embedding row, and enqueues best effort. |
| Search service | `backend/apps/api/src/services/action-search.service.ts` | Query embedding, vector retrieval, RRF, and lexical fallback. |
| Controller | `backend/apps/api/src/controllers/actions.controller.ts` | Input bounds, date validation, search mode header, and service calls. |
| Queue | `backend/libs/queue/action-embedding-queue.ts` | Dedicated BullMQ queue with deterministic job IDs and retries. |
| Worker processor | `backend/apps/worker/src/processors/action-embedding.processor.ts` | Claims tasks, embeds action text, and writes status/vector. |
| Worker entry | `backend/apps/worker/src/worker.ts` | Starts and closes sync and embedding workers. |
| Backfill | `backend/scripts/backfill-action-embeddings.ts` | Prepares, reconciles, and enqueues existing actions. |
| Frontend API | `new_frontend/src/app/api.ts` | Sends search options and maps optional similarity. |
| Frontend UI | `new_frontend/src/app/App.tsx` | Integrates all three action-search surfaces. |
| Tests | `backend/tests/embeddings.test.ts` | Canonical text, validation, provider request, and safe-error tests. |
| Tests | `backend/tests/action-search.test.ts` | Sanitization, date, and RRF tests. |

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

The vector column is dimension-agnostic. This allows a future free SiliconFlow
model to use a different dimension under a new embedding version without replacing
the table. The matching RPC checks dimensions before computing cosine distance.

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
  -> if SiliconFlow is configured:
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
  -> POST text to SiliconFlow with timeout
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

### 3. Search actions

Endpoint:

```http
GET /api/v1/actions/search?q=sprint%20capacity&limit=5&projectId=onyx-mobile
```

```text
request
  -> validate q and clamp limit
  -> start bounded lexical candidate query
  -> if SiliconFlow is configured:
       embed q synchronously
       call match_actions RPC for active embedding version
       apply project filter before ranking/limit
       keep rows above cosine threshold
       fuse semantic and lexical rankings with RRF
  -> otherwise, or on semantic failure:
       return lexical results
  -> set x-action-search-mode
```

Search modes:

| Header value | Meaning |
|---|---|
| `hybrid` | Semantic and lexical candidates were fused. |
| `semantic` | Semantic results were returned because lexical produced none. |
| `lexical` | SiliconFlow was unconfigured/unavailable, vector search failed, or normal lexical matching was the only path. |

The API response stays an array of normal action rows. Semantic rows add an
optional `similarity` number; stored vectors are never returned.

RRF lets exact names, issue identifiers, and acronyms from lexical search coexist
with paraphrases from semantic search. A row present in both candidate sets is
promoted without comparing incompatible raw lexical and cosine scores.

### 4. Frontend search

All connected surfaces now call the same endpoint:

- Log Action modal: 400 ms debounce, five results, optional single-project scope.
- Global Actions view: 300 ms debounce, optional selected-project scope, relevance
  order while a semantic-length query is active.
- Project Actions Library: 300 ms debounce and mandatory active-project scope.

Each surface aborts obsolete requests so an older response cannot replace a newer
query. Queries shorter than three characters use the existing local behavior or no
similar lookup.

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

The SiliconFlow adapter sends the OpenAI-compatible body:

```json
{
  "model": "Qwen/Qwen3-Embedding-0.6B",
  "input": ["text to embed"],
  "encoding_format": "float"
}
```

It uses `Authorization: Bearer ...` by default. Header and scheme are configurable
for compatibility, while the API key stays server-side.

The adapter:

- Uses `AbortController` for the configured timeout.
- Accepts and reorders the documented `data[].embedding` response by `index`.
- Also tolerates simple `embedding`/`embeddings` response envelopes.
- Validates one vector per input, exact configured dimensions, and finite numbers.
- Marks network, timeout, HTTP 429, and HTTP 5xx failures as retryable.
- Does not include provider response bodies, API keys, action text, or vectors in
  its thrown HTTP errors.
- Adds the `dimensions` request field only for SiliconFlow Qwen3 embedding models,
  because SiliconFlow documents it only for that family.

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
SILICONFLOW_API_KEY=your-siliconflow-key
```

Available settings and defaults:

```dotenv
SILICONFLOW_EMBEDDINGS_URL=https://api.siliconflow.com/v1/embeddings
SILICONFLOW_API_KEY=
SILICONFLOW_AUTH_HEADER=authorization
SILICONFLOW_AUTH_SCHEME=Bearer
SILICONFLOW_EMBEDDING_MODEL=Qwen/Qwen3-Embedding-0.6B
SILICONFLOW_EMBEDDING_DIMENSIONS=1024
ACTION_EMBEDDING_VERSION=siliconflow-qwen3-embedding-0.6b-1024-v1
ACTION_SEARCH_MIN_SIMILARITY=0.70
ACTION_SEARCH_MAX_RESULTS=50
ACTION_EMBEDDING_TIMEOUT_MS=10000
```

The earlier misspelled `SIGNALFLOW_*` variables remain accepted as compatibility
aliases, but new environments should use `SILICONFLOW_*`.

Changing the model or dimensions requires a new `ACTION_EMBEDDING_VERSION` and a
backfill. Do not compare vectors generated by different model configurations under
one version.

The health endpoint exposes only non-secret state:

```text
services.semanticActionSearch.status
services.semanticActionSearch.provider
services.semanticActionSearch.model
services.semanticActionSearch.dimensions
services.semanticActionSearch.embeddingVersion
```

Status is `configured` when the SiliconFlow key and provider settings exist;
otherwise it is `lexical_fallback`.

## Setup and operation

### Apply the migration

The migration is already applied to the Supabase database currently referenced by
`backend/.env`. For another environment:

```bash
set -a
. backend/.env
set +a
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260822000000_action_semantic_search.sql
```

The migration is idempotent for the extension, table, index, and functions. It does
not modify action authentication, role behavior, role grants, or RLS.

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
curl -s 'http://localhost:3000/api/v1/health'
```

After the worker finishes a backfill, search should report `hybrid` or `semantic`.
Without the key or ready vectors, `lexical` is the expected healthy behavior.

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

## Verification completed

### Automated backend tests

Command:

```bash
cd backend
npm run test:actions
```

Result: **7/7 pass**.

Covered behavior:

- Canonical text normalization and content hash stability.
- Wrong dimensions and non-finite vector rejection.
- SiliconFlow's OpenAI-compatible request and documented response mapping.
- Safe and retryable HTTP 429 handling.
- PostgREST search-query sanitization.
- Impossible date rejection.
- RRF promotion for results present in both rankings.

### TypeScript

The new semantic/action code has no reported TypeScript errors. The whole-backend
`npm run typecheck` still reports three unrelated pre-existing errors:

- `apps/api/src/database/metrics.ts:187`
- `libs/connectors/cicd/GithubActionsConnector/github-actions.connector.ts:210`
- `libs/risk-engines/risk-engine.ts:63`

The current Node 18 runtime also produces a Supabase warning; Node 20 or later is
recommended.

### Frontend

The `new_frontend` Vite production build succeeds. Vite reports only its normal
large-chunk warning.

### Live Supabase

Verified on the configured database:

- pgvector version 0.8.0 is installed.
- `public.action_embeddings` exists.
- `public.claim_action_embedding` exists.
- `public.match_actions` exists.
- A temporary 3-dimensional vector matched through the RPC inside a transaction.
- The transaction was rolled back; no test embedding remained.
- Current ready-vector count is zero; one preserved legacy BGE row is failed.

### Live API fallback

With no SiliconFlow key:

- Semantic configuration correctly remained disabled.
- Search returned HTTP 200 with `x-action-search-mode: lexical`.
- A query for `velocity` returned the matching existing action.
- A control/wildcard-only query returned HTTP 400.
- Normal action listing continued to work.

Redis integration could not be exercised live because Docker Desktop's daemon was
stopped and no local `redis-server` binary was installed. Queue behavior is covered
by code/type review, and the API's no-Redis failure path was exercised.

## Remaining steps

Only environment-dependent work remains for a real semantic result:

1. Put a SiliconFlow API key with access to
   `Qwen/Qwen3-Embedding-0.6B` in `backend/.env`.
2. Start Docker/Redis.
3. Start the API and worker.
4. Run the backfill.
5. Confirm rows transition to `ready` and the search header becomes `hybrid` or
   `semantic`.
6. Evaluate realistic paraphrase queries and tune
   `ACTION_SEARCH_MIN_SIMILARITY` from relevance results.

Future scale work, only when measurements justify it:

- Add a dimension-specific HNSW/halfvec index.
- Add pagination to very large action libraries.
- Build a labeled retrieval evaluation set and track Recall@5, MRR, no-result
  accuracy, p95 latency, provider error rate, and fallback rate.
- For a new free embedding model, increment the version, backfill alongside the
  old version, evaluate, switch the active version, then retire the old rows.

No authentication or role-based changes are included in this remaining plan.
