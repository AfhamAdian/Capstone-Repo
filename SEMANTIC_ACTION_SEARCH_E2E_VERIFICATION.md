# Semantic Action Search — End-to-End Verification and Frontend Completion

Verification date: **2026-08-22**

## Outcome

The action-search implementation was exercised from action creation through queue
processing, embedding storage, vector RPC retrieval, hybrid ranking, HTTP response,
and frontend consumption.

The application code works. The supplied SiliconFlow key is valid, but the account
currently cannot perform sustained real embeddings because SiliconFlow returns:

```text
HTTP 402: Sorry, your account balance is insufficient
```

Consequently, the production API correctly operates in `lexical` fallback mode
until the SiliconFlow account receives free allowance/credits. No paid fallback is
configured or used.

After the later survey/auth merge, action endpoints were attached to the incoming
cookie-session authentication with `requireAuth`. The incoming login, registration,
session, and admin/member authorization implementation was preserved.

## What changed in this pass

### 1. Corrected the active SiliconFlow model

The previous default, `BAAI/bge-large-en-v1.5`, returned HTTP 400 for the supplied
account:

```text
Model does not exist. Please check it carefully.
```

SiliconFlow's authenticated `/v1/models` endpoint exposed these embedding models:

- `Qwen/Qwen3-Embedding-8B`
- `Qwen/Qwen3-Embedding-4B`
- `Qwen/Qwen3-Embedding-0.6B`

The smallest model was selected:

```dotenv
SILICONFLOW_EMBEDDING_MODEL=Qwen/Qwen3-Embedding-0.6B
SILICONFLOW_EMBEDDING_DIMENSIONS=1024
ACTION_EMBEDDING_VERSION=siliconflow-qwen3-embedding-0.6b-1024-v1
```

A direct real request succeeded once and returned exactly one 1,024-dimensional
vector, proving that the endpoint, key, authorization header, request shape, model,
and vector validation are compatible. Subsequent calls returned HTTP 402 because
the account allowance was unavailable.

Updated configuration locations:

- `backend/apps/api/config/env.ts`
- `backend/.env.example`
- Local ignored `backend/.env`
- `How-To-Run.md`
- `ACTION_LOGGING_TO_SEMANTIC_SEARCH.md`

The embedding version changed with the model. This prevents Qwen vectors from being
compared with any vectors produced by the former configuration.

### 2. Prevented wasteful retries for permanent provider failures

`backend/apps/worker/processors/action-embedding.processor.ts` now converts a
non-retryable `EmbeddingProviderError` into BullMQ's `UnrecoverableError`.

Behavior now is:

| Failure | Retry? |
|---|---|
| Timeout/network interruption | Yes |
| HTTP 429 | Yes |
| HTTP 5xx | Yes |
| HTTP 400/401/402/404 | No |
| Malformed/wrong-dimension vector | No |

This was verified with a real action while SiliconFlow was returning 402:

- Action API response: HTTP 201.
- Embedding state: `failed`.
- `attempt_count`: 1.
- Action logging remained available.

An automated 402 classification test was added to
`backend/tests/embeddings.test.ts`.

### 3. Exposed search mode to browser JavaScript

The API already sent `x-action-search-mode`, but CORS did not expose that custom
header to frontend JavaScript. `backend/apps/api/server.ts` now adds:

```text
Access-Control-Expose-Headers: x-action-search-mode
```

Verified response metadata:

```text
Access-Control-Allow-Origin: *
Access-Control-Expose-Headers: x-action-search-mode
x-action-search-mode: hybrid
```

### 4. Made frontend search results mode-aware

`new_frontend/src/app/api.ts` now returns:

```ts
type ActionSearchMode = "hybrid" | "semantic" | "lexical";

interface SearchActionsResult {
  actions: ApiAction[];
  mode: ActionSearchMode;
}
```

The mode is read from the exposed HTTP header. A missing or unknown value safely
defaults to `lexical`.

### 5. Completed frontend states across every search surface

#### Global Actions

- Debounced server search and stale-request cancellation remain enabled.
- Displays the actual result mode:
  - Hybrid semantic + keyword results
  - Semantic similarity results
  - Keyword fallback results
- Displays cosine similarity percentages when available.
- Displays a loading indicator while the request is active.
- If the API is unreachable, shows a clear warning and filters the already-loaded
  actions locally instead of showing an incorrect empty state.
- Project filtering continues to be sent to the backend before vector ranking.

#### Project Actions Library

- Uses the active project ID in the search request.
- Displays search mode, loading state, similarity, and fallback state.
- Uses locally loaded project actions if the search API itself is unavailable.
- Distinguishes “no result” from “request failed.”

#### Log Action modal

- Searches after the user has entered at least four characters in Problem.
- Cancels obsolete requests when text or selected project changes.
- Shows searching, result count, search mode, no-result, and unavailable states.
- Displays similarity on semantic results.
- A failed similar-action lookup never blocks logging the new action.
- Existing actions are compared using their combined problem, root cause, and
  action-taken embedding.

The merged frontend now sends action requests with `credentials: "include"`; the
obsolete mock `x-user-level` action headers and role picker are no longer used.

## Real API and infrastructure checks

| Check | Result |
|---|---|
| API health | Pass — HTTP 200 |
| Supabase connection | Pass |
| Semantic config detection | Pass |
| Redis port | Listening on 6379 |
| API process | Running on 3000 |
| Worker process | Running on 4000 |
| Frontend dev server | Running on 5173 |
| Supabase pgvector | Installed, version 0.8.0 |
| Embedding table and RPCs | Present |
| SiliconFlow key authentication | Valid |
| Former BGE model | Not available to this account |
| Qwen3 0.6B response contract | Pass — one real 1024D vector |
| Sustained real embeddings | Blocked externally by SiliconFlow HTTP 402 |
| Lexical fallback during 402 | Pass |

## Dummy action test set

Five actions were created through `POST /api/v1/actions` with the marker
`logged_by = 'Semantic E2E Verification'`:

1. Flaky deployment pipeline and nondeterministic integration tests.
2. Customer onboarding abandonment and an overly long signup form.
3. Slow analytics dashboards caused by missing database indexes.
4. Engineer fatigue caused by an uneven overnight on-call rotation.
5. Provider-outage resilience for action logging.

The first four proved action creation and real queue delivery. The real worker
claimed them and recorded SiliconFlow's 402 failure. The fifth specifically verified
that a permanent embedding failure does not affect the HTTP 201 action response and
is attempted only once.

## Semantic integration test under provider-account blockage

Because the supplied account could not generate the action/query vectors, the same
production SiliconFlow adapter was temporarily pointed at a local deterministic
OpenAI-compatible embedding fixture. This fixture was used only for integration
verification and was never committed or configured in the production environment.

It allowed the rest of the real stack to be exercised:

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

Passing cases:

| Case | Query | Expected result | Mode | Result |
|---|---|---|---|---|
| Paraphrase only | “releases keep getting blocked by flaky automated checks” | Deployment-pipeline action first | `semantic` | Pass |
| Exact + meaning | “database scans” | Database-index action first | `hybrid` | Pass |
| Wellbeing paraphrase | “developer burnout after overnight incident duty” | On-call-fatigue action first | `semantic` | Pass |
| Project exclusion | Deployment query restricted to `meridian-api` | No cross-project deployment action | `lexical`, empty | Pass |
| Real provider unavailable | “database scans” through normal API | Exact database action | `lexical` | Pass |

Returned semantic matches included `similarity`, and the expected top results had a
similarity of 1.0 in the deterministic fixture.

This proves application integration and ranking behavior, but it is not claimed as
a real Qwen retrieval-quality evaluation. That requires usable SiliconFlow allowance
and real model-generated action vectors.

## Validation and maintenance checks

| Test | Result |
|---|---|
| Query containing only stripped wildcard/control characters | HTTP 400 — Pass |
| Impossible date `2026-02-30` | HTTP 400 — Pass |
| Lexical project filter | Pass |
| Dry-run backfill | Pass |
| Dry-run rows scanned | 15 before dummy cleanup |
| Dry-run rows skipped as current/ready | 4 temporary fixture rows |
| Dry-run writes/queues | 0 |

## Automated verification

Backend focused suite:

```text
npm run test:actions
8 tests passed, 0 failed
```

Coverage includes canonical text, hashes, vector validation, SiliconFlow request
mapping, rate-limit classification, account/request error classification, query
sanitization, date validation, and hybrid RRF.

Frontend production build:

```text
pnpm exec vite build --outDir /tmp/capstone-semantic-frontend-e2e-build
2626 modules transformed
Build succeeded
```

The only frontend build notice is the existing large-chunk warning.

Repository-wide backend typecheck still reports only these unrelated pre-existing
errors:

- `backend/apps/api/src/database/metrics.ts:187`
- `backend/libs/connectors/cicd/GithubActionsConnector/github-actions.connector.ts:210`
- `backend/libs/risk-engines/risk-engine.ts:63`

No new semantic-search TypeScript error was reported. Node 20 or later remains
recommended because the current Node 18 runtime emits a Supabase SDK warning.

The in-app browser connection was unavailable, so a visual click-through could not
be performed. The production build, frontend/API type contract, CORS header, and all
backend requests were verified directly.

## Cleanup

All five dummy actions were deleted after testing. Their embedding rows were removed
by the foreign-key cascade.

Verified after cleanup:

```text
dummy actions remaining: 0
orphaned dummy embeddings: 0
```

The temporary embedding fixture and temporary port-3100 API were stopped. No fake
embedding remains in Supabase or repository configuration.

## What is required for real frontend semantic results

The frontend is ready and will automatically show the correct mode. The remaining
blocker is the SiliconFlow account, not application code.

To obtain real hybrid/semantic results:

1. Make sure `Qwen/Qwen3-Embedding-0.6B` has free allowance/credits in the
   SiliconFlow account. The supplied account currently returns HTTP 402.
2. Keep API, Redis, and worker running.
3. Run:

```bash
cd backend
npm run backfill:action-embeddings
```

4. Wait until existing rows are `ready`:

```sql
select status, count(*)
from public.action_embeddings
group by status;
```

5. Search in the Global Actions page, a project's Actions Library, or the Log Action
   modal. The UI will label results as hybrid, semantic, or keyword fallback.

If SiliconFlow continues returning 402, the application remains fully usable for
action logging and keyword search, but real provider-backed semantic results cannot
be produced without provider allowance. The code will not silently use a paid or
different provider.
