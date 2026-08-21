# Action Logging to Semantic Action Search

Audit date: **2026-08-22**  
Scope: current repository implementation, current live Supabase schema, and the planned SignalFlow + Supabase Postgres/pgvector implementation.

## Executive summary

The repository already has a functioning management-action data path in `new_frontend`:

1. A Manager enters a problem, root cause, action taken, affected projects, and date.
2. The frontend sends the record to the Express API.
3. The API validates it and inserts it into the live Supabase `public.actions` table.
4. Actions are fetched back into application state and displayed in portfolio, project, timeline, library, and effectiveness-review views.
5. An Executive can rate effectiveness from 1 to 5.
6. While the user types a new problem, the modal calls an endpoint intended for similar-action search.

The search contract and UI hook exist, but the search is **not semantic yet**. The backend currently performs case-insensitive substring matching (`ILIKE`) over `problem`, `reason`, and `action_taken`, then orders matches by action date. There is no embedding provider, vector column/table, vector index, similarity RPC, query embedding, relevance score, or backfill process.

The live Supabase database was inspected read-only during this audit. It currently has 9 action rows, no `vector` extension, no action-related database function, no RLS on `public.actions`, and broad table grants including `anon`. Security and tenant isolation should be fixed before exposing semantic search beyond a local/demo environment.

The recommended target is:

- SignalFlow behind a small provider-neutral embedding interface.
- A separate `public.action_embeddings` table, not an embedding column on `actions`.
- Asynchronous document embedding through a dedicated BullMQ queue/worker.
- Synchronous query embedding in the search request.
- A Supabase Postgres RPC that applies project/tenant filters before cosine ranking.
- Lexical fallback if SignalFlow or the vector path is unavailable.
- Eventually, hybrid lexical + semantic ranking rather than vector-only search.

## Terminology and repository boundaries

“Action” has two unrelated meanings in this repository:

- **Management actions** are the subject of this document: a logged response to a project problem.
- **GitHub Actions** files under `backend/libs/connectors/cicd/GithubActionsConnector/` collect CI/CD metrics. They are not part of management-action logging or semantic search.

There are also two frontend implementations:

- `new_frontend/` is the implementation connected to the management actions API and live Supabase data.
- `frontend-react/` has a separate mock-only `ActionCenter.tsx`. Its action/historical-action data stays in React state, its matching is a small string heuristic, and it does not call the management actions API.

Unless the application is intentionally keeping two products, `new_frontend` should be treated as the source of truth and the older Action Center should be retired or migrated.

## Relevant file map

| Area | File | Current responsibility |
|---|---|---|
| Database reference schema | `backend/apps/api/src/database/schema.sql` | Documents `public.actions` and its three non-vector indexes. The file warns that it is context-only, not an executable migration. |
| Database access | `backend/apps/api/src/database/actions.ts` | Insert, list, get, keyword search, and effectiveness update using the Supabase service-role client. |
| HTTP validation | `backend/apps/api/src/controllers/actions.controller.ts` | Validates action requests and translates database outcomes into HTTP responses. |
| Routes | `backend/apps/api/src/routes/actions.route.ts` | Declares five action endpoints and level gates for create/rate. |
| Route mount | `backend/apps/api/src/routes/index.ts` | Mounts actions below `/api/v1/actions`. |
| Role gate | `backend/apps/api/src/middlewares/role.middleware.ts` | Reads a client-supplied `x-user-level` header. This is placeholder authentication. |
| Supabase client | `backend/apps/api/src/config/supabase.ts` | Creates a server-side Supabase client with the service-role key. |
| Environment config | `backend/apps/api/src/config/env.ts` | Reads Supabase, Redis, database, and connector variables. No SignalFlow variables exist. |
| Frontend API adapter | `new_frontend/src/app/api.ts` | Calls the action endpoints and maps snake_case database rows to camelCase UI objects. |
| Main frontend/action UI | `new_frontend/src/app/App.tsx` | Loads actions, logs/rates actions, performs similar-action requests, and renders all connected action surfaces. |
| Mock auth state | `new_frontend/src/app/context/WorkspaceContext.tsx` | Stores the selected user level in `pulse.auth.v1` local storage. |
| Mock role picker | `new_frontend/src/app/pages/LoginView.tsx` | Lets a demo user select Viewer, Manager, or Executive. |
| Older mock UI | `frontend-react/src/app/pages/ActionCenter.tsx` | Separate in-memory actions, resolutions, upvotes, and heuristic past-action matching. |
| Existing implementation notes | `plan-action.md`, `plan-backend-implementaion.md`, `plan-frontend-implementation.md` | Historical implementation plans and manual test claims. |

No committed action migration, automated action test suite, SignalFlow client, embedding module, vector schema, or embedding job exists.

## Current data model

The current `public.actions` shape is:

| Column | Type | Meaning |
|---|---|---|
| `id` | `uuid` | Primary key; defaults to `gen_random_uuid()`. |
| `project_ids` | `text[]` | One or more frontend project identifiers such as `onyx-mobile`. Not foreign keys. |
| `problem` | `text` | What happened. |
| `reason` | `text` | Root cause. |
| `action_taken` | `text` | Management response/decision. |
| `action_date` | `date` | User-selected date of the action; defaults to current date. |
| `effectiveness` | `integer`, nullable | `NULL` means awaiting review; otherwise constrained to 1–5. |
| `logged_by` | `text` | Display string supplied by the client. It is not a trusted user reference. |
| `created_at` | `timestamptz` | Database insertion time. |

Current indexes:

- GIN on `project_ids` for array containment.
- Descending B-tree on `action_date`.
- Partial B-tree on `effectiveness` where it is null.

Important consequences:

- Actions are not scoped by company/workspace/tenant.
- Project references cannot enforce referential integrity.
- `logged_by` can be spoofed.
- Re-rating overwrites the previous rating; there is no `rated_by`, `rated_at`, or rating history.
- There is no `updated_at`, embedding state, model/version metadata, or content hash.

## Current API contract

All routes are mounted under `/api/v1/actions`.

| Method and path | Gate | Current behavior |
|---|---|---|
| `POST /` | Level 1 / Manager | Validates and inserts a new action; returns the raw snake_case row with `201`. |
| `GET /` | Open | Lists actions, optionally filtered by project, date range, pending rating, and limit. |
| `GET /search` | Open | Validates `q`, performs `ILIKE` search, returns raw rows. Registered before `/:id` so `search` is not interpreted as an ID. |
| `GET /:id` | Open | Returns an action or `404`. Invalid UUIDs also become `404`. |
| `PUT /:id/effectiveness` | Level 2 / Executive | Accepts an integer from 1 to 5 and overwrites the current rating. |

### Create validation

- `projectIds` must be a non-empty array whose members are non-empty strings.
- `problem`, `reason`, `actionTaken`, and `loggedBy` must be non-empty strings.
- Text is trimmed before insertion.
- `timestamp`, if present, must match `YYYY-MM-DD`; otherwise the API supplies today's date.

The regular expression checks only shape, not whether the date exists. An input such as an impossible month can reach Postgres and become a `500` rather than a client validation error. There are no maximum lengths or maximum project count.

### List behavior

`GET /api/v1/actions` supports:

- `projectId`: Supabase array containment on `project_ids`.
- `from` / `to`: inclusive comparisons against `action_date` when the string matches the date regex.
- `pending=true`: `effectiveness IS NULL`.
- `limit`: any positive parsed integer; default 100.

Invalid filters are mostly ignored rather than rejected. There is no cursor/offset pagination and no server-side upper bound on `limit`.

### Current search behavior

The current database operation is conceptually:

```sql
select *
from public.actions
where problem ilike '%query%'
   or reason ilike '%query%'
   or action_taken ilike '%query%'
order by action_date desc
limit :limit;
```

Before constructing the PostgREST `.or()` expression, `%`, `_`, commas, quotes, parentheses, and backslashes are replaced with spaces. This avoids wildcard/filter injection, but it has two edge cases:

- A query can pass the controller's three-character check and become empty after sanitization, producing a `%%` pattern that can match everything.
- Results are ordered by recency, not textual relevance.

This finds exact fragments and case variants. It will not reliably connect differently worded concepts such as “delivery capacity fell” and “sprint velocity dropped.”

## Current end-to-end flows

### 1. Log an action

```text
Manager opens LogActionModal
  -> selects one or more frontend project IDs
  -> enters problem, root cause, action taken, and date
  -> App.handleLogAction adds loggedBy from mock user state
  -> new_frontend/api.createAction
  -> POST /api/v1/actions with x-user-level
  -> requireLevel(MANAGER)
  -> actions.controller.createAction validates and trims
  -> database/actions.insertAction
  -> Supabase REST insert into public.actions using service-role client
  -> raw snake_case row returned
  -> frontend refreshes the complete action list
  -> rowToAction maps it to the UI's camelCase Action shape
  -> modal shows success and closes after 1.2 seconds
```

Logging does not generate or enqueue an embedding.

### 2. Find similar actions while logging

```text
User types in Problem textarea
  -> wait until trimmed text has at least 4 characters
  -> debounce 400 ms
  -> new_frontend/api.searchActions(query, 5)
  -> GET /api/v1/actions/search?q=...&limit=5
  -> controller requires at least 3 characters
  -> database performs ILIKE across three fields
  -> latest matching rows are returned
  -> frontend maps rows and displays problem, action taken, rating, and date
```

The UI silently converts search failures into an empty result. It does not show loading/error state, cancel an in-flight request, or protect against an older response arriving after a newer one.

### 3. Browse actions

After authentication, `App` calls `listActions()` once and holds all returned actions in local state. The same state is reused by:

- Portfolio/global action views.
- Project dashboard recent actions.
- Project Actions Timeline.
- Project Actions Library.
- Pending effectiveness review panels.

The global view and Actions Library each perform their own client-side lowercase substring filtering. Their visible search boxes do **not** call `/actions/search`, so they are not even using the server placeholder semantic-search path today.

The timeline associates action dates with the closest available health-series point. It stores one action per chart label, so multiple actions mapped to the same label overwrite one another as chart markers, although all actions still appear in the list below.

### 4. Rate effectiveness

```text
Executive clicks a star
  -> frontend immediately changes local state (optimistic update)
  -> PUT /api/v1/actions/:id/effectiveness
  -> requireLevel(EXECUTIVE)
  -> controller validates integer 1..5
  -> Supabase updates effectiveness
  -> on failure, frontend logs to console and refetches all actions
```

Rating does not change the text that should be embedded, so it should not trigger re-embedding. It may later be used as a ranking or display signal.

## Authorization and data security as implemented

The current role system is explicitly a demo placeholder:

1. Login accepts any email/password and a selected level.
2. The level is stored in browser local storage.
3. `authHeaders()` copies it into `x-user-level`.
4. The server trusts that header.

Any caller can therefore claim Executive by sending `x-user-level: 2`. GET endpoints do not apply even this gate.

The live database inspection found a more urgent issue:

- RLS is disabled on `public.actions`.
- `anon` and `authenticated` currently have broad table privileges.
- The backend uses a service-role client, which bypasses RLS in any case.
- `backend/test-supabase.js` is tracked and contains a hard-coded live-looking service-role credential.

Before production use:

1. Rotate the exposed service-role key.
2. Remove the hard-coded credential and read it from environment variables.
3. Revoke unnecessary direct grants from `anon` and `authenticated`.
4. Enable RLS and add explicit policies if clients will ever access Supabase directly.
5. Replace the role header with verified authentication and server-derived authorization.
6. Add `company_id`/`workspace_id` and enforce tenant membership in every list/search/get/write path.
7. Derive `logged_by` from verified identity rather than the request body.

Semantic search magnifies the tenant risk because an unscoped nearest-neighbor query can retrieve related records across every organization even when the query wording does not match exactly.

## What is complete and what is not

### Implemented

- Live `actions` table with constraints and non-vector indexes.
- Five Express endpoints.
- Create/list/get/search/rate database functions.
- Basic controller validation.
- Placeholder level gates for create and rate.
- Frontend DTO mapping.
- Live initial action fetch in `new_frontend`.
- Log Action modal with separate problem/root cause/action fields.
- Debounced similar-action API request in the modal.
- Multiple action browsing views and timeline markers.
- Optimistic effectiveness rating.
- Historical manual API test notes.

### Not implemented

- Semantic embeddings or a confirmed SignalFlow API contract.
- Supabase `vector` extension or pgvector storage.
- Similarity SQL/RPC or vector index.
- Embedding generation on create/update.
- Backfill for existing actions.
- Embedding retries, status, versioning, or observability.
- Relevance scores or semantic result ordering.
- Semantic search in the global/library search boxes.
- Hybrid search.
- Real authentication, trustworthy roles, or tenant isolation.
- Executable database migrations.
- Automated action tests.

The notes in `plan-backend-implementaion.md` say 14 tests passed against a live API, but these are recorded manual outcomes. There is no committed action test suite that can reproduce them. During this audit, `npm run typecheck` did not pass because of existing errors elsewhere in the backend/worker/queue code; no error was reported in the action controller, routes, or database module.

## SignalFlow integration assumption

No public, authoritative generic embedding API contract for a product named “SignalFlow” could be confirmed during this audit. “SignalFlow” is used publicly by several unrelated products. Therefore, implementation must not scatter guessed SignalFlow request/response details through the action code.

Treat SignalFlow as an embedding provider behind this internal contract:

```ts
export interface EmbeddingProvider {
  readonly provider: "signalflow";
  readonly model: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}
```

Before writing the pgvector migration, confirm:

- Base URL and embeddings endpoint.
- Authentication header format.
- Request shape and maximum batch size.
- Response shape and whether order is guaranteed.
- Exact model identifier.
- Exact output dimension.
- Whether vectors are normalized.
- Input/token limits.
- Rate limits, timeout guidance, and retryable status codes.
- Data retention/privacy terms.

The vector dimension is a schema decision. Stored vectors and query vectors must use the same model/version and dimension; vectors from different models are not meaningfully comparable.

Recommended environment variables:

```dotenv
SIGNALFLOW_EMBEDDINGS_URL=
SIGNALFLOW_API_KEY=
SIGNALFLOW_EMBEDDING_MODEL=
SIGNALFLOW_EMBEDDING_DIMENSIONS=
ACTION_EMBEDDING_VERSION=signalflow-v1
ACTION_SEARCH_MIN_SIMILARITY=0.70
ACTION_SEARCH_MAX_RESULTS=20
ACTION_EMBEDDING_TIMEOUT_MS=10000
```

The API key must remain server-side and must never use a `VITE_` prefix.

## Recommended embedding document

Use one deterministic canonical string per action:

```text
Problem: {problem}
Root cause: {reason}
Action taken: {action_taken}
```

Normalize only line endings and surrounding whitespace. Do not lowercase or remove punctuation unless SignalFlow specifically recommends it; embedding models generally use that context.

Store a SHA-256 hash of the canonical string. A worker can skip work when the hash, provider, model, and embedding version are unchanged.

The first evaluation set should compare two variants:

- `problem + reason`, which is closely aligned with the modal's problem-only query.
- `problem + reason + action_taken`, which may better support the full Actions Library.

Choose using retrieval quality, not intuition. The returned action can always include `action_taken` even if that field is not part of the embedded text.

## Recommended pgvector design

### Why a separate table

Do not add `embedding` directly to `public.actions` while the database code uses `.select('*')`. That would return a large vector on list, get, create, rate, and search responses even though the frontend does not need it.

A separate one-to-one/versioned table provides:

- No accidental vector exposure through existing API responses.
- Smaller normal action queries.
- Explicit provider/model/version/status metadata.
- Safe re-embedding and model rollout.
- Independent vector permissions and indexes.

### Migration template

This is a design template, not executable SQL until the exact SignalFlow dimension/model/version are known. Replace `<D>` and the model/version placeholders first.

```sql
create extension if not exists vector with schema extensions;

create table public.action_embeddings (
  action_id uuid not null
    references public.actions(id) on delete cascade,
  embedding_version text not null,
  provider text not null check (provider = 'signalflow'),
  model text not null,
  content_hash text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'ready', 'failed')),
  embedding extensions.vector(<D>),
  attempt_count integer not null default 0,
  last_error text,
  embedded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (action_id, embedding_version)
);

create index idx_action_embeddings_pending
  on public.action_embeddings (status, updated_at)
  where status in ('pending', 'failed');

-- Add after the corpus/latency justifies approximate search.
create index idx_action_embeddings_hnsw_cosine
  on public.action_embeddings
  using hnsw (embedding extensions.vector_cosine_ops)
  where status = 'ready';
```

Supabase documents `vector` columns, cosine distance (`<=>`), RPC-based matching, and HNSW indexes. A normal `vector` HNSW index supports up to 2,000 dimensions on current pgvector versions; higher dimensions may require a `halfvec` expression index or a different model/storage choice. Confirm the installed pgvector version and SignalFlow dimension before selecting the type/index.

At the current corpus size, exact vector search is simpler and has perfect recall. Add HNSW after realistic load testing shows it is needed rather than tuning approximate search around nine rows.

### Similarity RPC template

Filters must be inside the function before ordering/limiting. Applying a project/tenant filter after an RPC has already selected top-K neighbors can return too few results and can create an isolation bug.

```sql
create or replace function public.match_actions(
  query_embedding extensions.vector(<D>),
  target_embedding_version text,
  match_threshold double precision default 0.70,
  match_count integer default 5,
  filter_project_id text default null
)
returns table (
  id uuid,
  project_ids text[],
  problem text,
  reason text,
  action_taken text,
  action_date date,
  effectiveness integer,
  logged_by text,
  created_at timestamptz,
  similarity double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    a.id,
    a.project_ids,
    a.problem,
    a.reason,
    a.action_taken,
    a.action_date,
    a.effectiveness,
    a.logged_by,
    a.created_at,
    1 - (ae.embedding <=> query_embedding) as similarity
  from public.action_embeddings ae
  join public.actions a on a.id = ae.action_id
  where ae.status = 'ready'
    and ae.embedding_version = target_embedding_version
    and ae.embedding is not null
    and (filter_project_id is null or a.project_ids @> array[filter_project_id])
    and 1 - (ae.embedding <=> query_embedding) >= match_threshold
  order by ae.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 50);
$$;
```

Add tenant/workspace input and authorization before production. Project filtering alone is not a tenant boundary.

Revoke this function from `public`, `anon`, and `authenticated` if only the backend service role should call it. Never return the embedding itself.

## Target flows

### Action creation and document embedding

```text
POST /actions
  -> authenticate real user and authorize Manager capability
  -> validate tenant-visible project IDs and body limits
  -> insert action
  -> create durable action_embeddings row with status=pending
  -> enqueue action-embedding job (best effort)
  -> return 201 immediately

Embedding worker
  -> claim action/version idempotently
  -> load action source fields
  -> build canonical text and content hash
  -> call SignalFlow with timeout/retry
  -> validate one finite vector of exactly configured dimensions
  -> update embedding/status/model/hash/embedded_at
  -> on terminal failure store a sanitized error and leave action searchable lexically
```

Action logging must succeed even when SignalFlow is down. The durable pending row allows reconciliation if Redis enqueueing fails.

### Semantic search

```text
GET /actions/search?q=...&limit=...&projectId=...
  -> authenticate and resolve tenant/project scope
  -> validate query and clamp limit
  -> generate one query embedding synchronously through SignalFlow
  -> validate dimension
  -> Supabase rpc('match_actions', ...)
  -> return actions ordered by similarity (optional additive similarity field)
  -> if provider/vector path is unavailable, run bounded lexical fallback
```

Keep the route and core action shape stable. `similarity` can be an optional additive field; the existing frontend mapper can ignore it until the UI is ready.

### Re-embedding

Re-embed only when `problem`, `reason`, or `action_taken` changes, or when the configured embedding version/model changes. Effectiveness changes must not re-embed.

There is no action edit endpoint today. If one is added, it must mark the active embedding version pending in the same durable workflow.

## Queue/worker plan

The repository already uses BullMQ and Redis for sync work, but the queue implementation is currently hard-coded to the `sync` queue and `SyncJobData`. It also contributes existing TypeScript failures: the processor type is declared as data while BullMQ supplies a `Job`, the worker caller then uses `job.data`, and `job.progress()` is called although progress is a property in the installed type.

Do not put embedding jobs into the existing `sync` queue unchanged. First either:

1. Refactor the queue wrapper into a correctly typed generic queue, or
2. Add a dedicated, correctly typed `ActionEmbeddingQueue`.

Recommended queue data:

```ts
interface ActionEmbeddingJobData {
  actionId: string;
  embeddingVersion: string;
}
```

Recommended behavior:

- Queue name: `action-embeddings`.
- Deterministic job ID: `${actionId}:${embeddingVersion}` for deduplication.
- Three to five attempts with exponential backoff and jitter.
- Moderate concurrency based on SignalFlow rate limits.
- Keep failed jobs long enough for diagnosis; remove successful jobs.
- A reconciliation command periodically scans `pending`/retryable `failed` rows and re-enqueues them.
- Graceful worker shutdown must close both sync and embedding workers/queues.

## Backend file-level implementation plan

### Phase 0 — security and foundations

- Rotate and remove the hard-coded service-role credential in `backend/test-supabase.js`.
- Add a real migration directory, preferably the Supabase CLI convention `supabase/migrations/`.
- Capture the existing `actions` table in a baseline migration or make the new migration safely conditional.
- Revoke broad direct table access and define RLS/tenant strategy.
- Add trusted auth and tenant/workspace identity to action records and requests.
- Fix the existing queue/worker TypeScript contract before relying on it.

### Phase 1 — embedding provider

Add under `backend/libs/embeddings/`:

- `embedding-provider.ts`: provider interface and validation helpers.
- `signalflow-embedding.provider.ts`: the only file aware of SignalFlow HTTP/auth/response details.
- `embedding-text.ts`: canonical action text and hash generation.
- `index.ts`: public exports.

Update:

- `backend/apps/api/src/config/env.ts` and `backend/.env.example` with SignalFlow/search settings.
- Startup validation so an enabled semantic-search mode cannot start with a missing model/dimension/key.

Provider requirements:

- Use an explicit timeout/abort signal.
- Retry only retryable network/429/5xx failures.
- Do not log API keys, full provider responses, embeddings, or sensitive action text.
- Validate batch length, vector count, exact dimension, numeric finiteness, and empty input.
- Emit provider/model/version and duration metrics.

### Phase 2 — pgvector schema and repository

- Enable `vector` in an executable migration.
- Create `action_embeddings`, constraints, status index, and matching RPC.
- Add RLS/grants in the same migration.
- Add `backend/apps/api/src/database/action-embeddings.ts` for pending-row management, claim/update/failure operations, and RPC calls.
- Keep the existing `ActionRow` query projections explicit rather than `.select('*')` where possible.

### Phase 3 — asynchronous embedding

- Add the dedicated queue and `ActionEmbeddingJobData`.
- Add `backend/apps/worker/src/processors/action-embedding.processor.ts`.
- Start the embedding worker from the worker entrypoint.
- Introduce `actions.service.ts` so create orchestration is not embedded in the controller.
- After an action insert, ensure the pending row exists and enqueue it without making provider availability part of the `POST` response.
- Add a backfill/reconciliation script with batch size, resume behavior, and dry-run mode.

For stronger durability, create the pending embedding row with a database trigger or a single transactional RPC when an action is inserted. Redis enqueue remains best effort because the reconciliation scan can recover missed jobs.

### Phase 4 — semantic search endpoint

- Replace `database/actions.searchActions` internals with a service flow: embed query, call `match_actions`, return ranked rows.
- Preserve the existing URL and minimum-query contract.
- Clamp `limit` to a small configured maximum.
- Reject a query that becomes empty after normalization.
- Add optional `projectId` immediately; add mandatory tenant scope before production.
- Keep the current bounded lexical query as fallback.
- Return/log which mode served the request (`semantic`, `hybrid`, or `lexical-fallback`) without exposing provider errors to the client.

### Phase 5 — frontend adoption

- Keep the Log Action modal's 400 ms debounce, but add `AbortController` or a monotonically increasing request ID.
- Show separate loading, no-result, and unavailable/fallback states.
- Wire `GlobalActionsView` and `ActionsLibrary` search boxes to the server semantic endpoint instead of local substring filtering.
- Pass project scope from project-specific views.
- Optionally show a rounded similarity percentage only after relevance calibration proves it is meaningful.
- Keep rating and timeline flows independent of embedding generation.

### Phase 6 — hybrid relevance and rollout

Vector-only retrieval can miss exact identifiers such as issue keys, service names, and acronyms. After the semantic path works, add Postgres full-text or trigram ranking and fuse it with vector results, for example with reciprocal rank fusion.

Use effectiveness carefully as a secondary signal. A highly effective but unrelated action must never outrank a clearly relevant action. A safe ordering is semantic/lexical relevance first, then a small effectiveness and recency tie-breaker.

Roll out with:

1. Shadow mode: compute semantic results but continue returning lexical results; compare rankings in logs without recording raw query text.
2. Internal users only.
3. Semantic with lexical fallback.
4. Hybrid search after evaluation.

## Backfill plan for existing actions

The live table currently has 9 rows, so backfill is operationally small, but it should use the same production mechanism:

1. Insert/upsert a pending embedding record for every action and active embedding version.
2. Enqueue deterministic jobs in small batches.
3. Skip rows whose content hash/model/version already match a ready vector.
4. Record ready/failed counts and sanitized failure reasons.
5. Verify vector dimensions and null counts in SQL.
6. Run a fixed semantic query set and manually inspect top results.
7. Keep lexical fallback until every eligible action is ready.

Never mix embeddings from different models under one active search version. For a model upgrade, dual-write/backfill a new version, validate it, switch the active version, then remove the old version later.

## Testing plan

### Unit tests

- Canonical text generation and hash stability.
- SignalFlow request mapping and response validation using mocked HTTP.
- Timeout, 429, 5xx, malformed vector, wrong dimension, NaN/infinity, and partial-batch behavior.
- Controller validation including impossible dates, all-sanitized queries, body size, and limit clamping.
- Role/tenant authorization using server-derived identity.
- Frontend debounce cancellation and stale-response protection.

### Database tests

- Migration applies to an empty database and an existing actions database.
- Cascade deletion removes embeddings.
- Only ready vectors in the active version are matched.
- Threshold, limit cap, project filter, and tenant filter work before ranking/limit.
- RPC does not return the embedding.
- RLS/grants prevent cross-tenant and anonymous access.
- Exact and indexed queries produce acceptable recall after HNSW is enabled.

### Integration tests

- Create action returns `201` when SignalFlow is healthy, slow, or unavailable.
- A created action transitions pending -> processing -> ready.
- Failed jobs retry and reconciliation recovers a missed enqueue.
- Search produces a query embedding and returns meaning-based results in descending similarity.
- Provider failure produces lexical fallback, not a blank UI or action logging failure.
- Effectiveness updates do not enqueue re-embedding.
- Model-version switch never compares incompatible vectors.

### Retrieval evaluation

Create a small labeled dataset of realistic queries with expected relevant action IDs, including:

- Synonyms and paraphrases.
- Exact service/project/issue identifiers.
- Similar problems with different causes.
- Similar causes with different problems.
- Unrelated queries that should return nothing above threshold.
- Cross-project and cross-tenant isolation cases.

Track Recall@5, Mean Reciprocal Rank, no-result accuracy, p50/p95 latency, provider error rate, fallback rate, and cost per embedded action/query. Tune threshold only from this dataset.

## Operational and product gaps to resolve

Priority order:

1. **Credential exposure and database grants/RLS.** Rotate the tracked service key and close direct anonymous access.
2. **Tenant model.** Add workspace/company ownership before semantic search can be safely global.
3. **SignalFlow contract.** Confirm endpoint, model, dimension, normalization, and limits before writing vector SQL.
4. **Migration discipline.** `schema.sql` is reference-only; production changes need executable, versioned migrations.
5. **Queue correctness.** Fix existing BullMQ typing/runtime assumptions before reusing the worker for embeddings.
6. **Automated tests.** Convert the manual action test notes into a reproducible suite.
7. **Search scope.** Decide whether “similar” means similar problem, similar root cause, useful action taken, or a weighted combination.
8. **Frontend consolidation.** Decide whether to retire or migrate `frontend-react`'s separate mock action model.
9. **Auditability.** Add trusted actor IDs and rating history if action logging is intended as an audit record.
10. **Pagination and bounds.** Add cursor pagination, maximum input lengths, maximum limits, and rate limiting.

## Definition of done for semantic action search

The feature is complete when:

- A versioned migration enables pgvector and creates secure embedding storage/RPC.
- The SignalFlow adapter is based on a confirmed contract and validates vector dimensions.
- Existing and newly logged actions reach a visible/observable embedding state.
- Logging remains available during embedding-provider outages.
- Search ranks paraphrased problems by meaning and falls back predictably.
- All search paths enforce tenant/project scope before ranking.
- The modal, global action view, and Actions Library use the server search path.
- No endpoint returns stored vectors or provider secrets.
- Re-embedding is idempotent and model-version safe.
- Security, database, integration, frontend, and retrieval-evaluation tests pass in CI.
- p95 latency, fallback rate, relevance quality, and provider cost are measured.

## External technical references

- [Supabase semantic search guide](https://supabase.com/docs/guides/ai/semantic-search)
- [Supabase HNSW index guide](https://supabase.com/docs/guides/ai/vector-indexes/hnsw-indexes)
- [Supabase hybrid search guide](https://supabase.com/docs/guides/ai/hybrid-search)
- [Supabase automatic embeddings architecture](https://supabase.com/docs/guides/ai/automatic-embeddings)
- [pgvector project documentation](https://github.com/pgvector/pgvector)

