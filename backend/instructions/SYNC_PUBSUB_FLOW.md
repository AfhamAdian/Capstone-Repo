# Sync Flow with Redis Pub/Sub (UI -> API -> Worker -> UI)

This document explains how the sync feature currently works end-to-end, including Redis Pub/Sub details and what happens when the user clicks **Start Sync**.

## 1) What happens when user clicks Sync in UI

File: `frontend/index.html`

1. User clicks **Start Sync** (`startSync()`).
2. Frontend sends:
   - `POST /api/v1/sync`
   - Body:
     ```json
     {
       "projectId": "project-123",
       "tools": ["github", "jira"],
       "sessionId": "session_<timestamp>_<random>"
     }
     ```
3. If API returns `202`, frontend opens SSE connection:
   - `GET /api/v1/progress/:sessionId`
4. Frontend now waits for SSE events and shows only the **final completion banner** (`success`, `partial`, or `failed`).

---

## 2) API enqueue path

Files:
- `backend/apps/api/src/controllers/sync.controller.ts`
- `backend/apps/api/src/services/sync.service.ts`
- `backend/libs/queue/queue-manager.ts`

Flow:
1. API validates request (`projectId`, `tools`, `sessionId`).
2. `SyncService` generates a `jobId`.
3. `QueueManager.enqueue()` pushes BullMQ job to queue `sync` (job name `sync-request`).
4. API returns:
   - `jobId`
   - `streamKey` (same as `sessionId`)

Redis used here:
- BullMQ queue transport uses `REDIS_URL`.

---

## 3) Worker processing + event publishing

Files:
- `backend/apps/worker/src/worker.ts`
- `backend/apps/worker/src/processors/sync-processor.ts`
- `backend/libs/queue/event-store.ts`

Flow:
1. Worker process consumes BullMQ jobs from queue `sync`.
2. For each tool in job:
   - publish progress `syncing`
   - run tool work
   - publish progress `completed` (or `failed`)
3. After all tools finish, worker publishes one completion event:
   - `status: success | partial | failed`
   - `toolsCompleted`, `toolsFailed`

All progress/completion events include both:
- `jobId`
- `sessionId`

---

## 4) Redis Pub/Sub design (current implementation)

File: `backend/libs/queue/event-store.ts`

### Redis connections
- Uses `ioredis`.
- Creates two clients:
  - `publisher`
  - `subscriber`

### Channel naming
- Per-session Pub/Sub channel:
  - `sync:session:{sessionId}`

### Completion replay key
- Last completion cache key:
  - `sync:last:{sessionId}`
- TTL:
  - `3600` seconds (1 hour)

### Behavior
- `emitProgress(event)`:
  - `PUBLISH sync:session:{sessionId} <event-json>`
- `emitCompletion(event)`:
  - `PUBLISH sync:session:{sessionId} <event-json>`
  - `SET sync:last:{sessionId} <event-json> EX 3600`
- `subscribe(sessionId, callback)`:
  - subscribes to `sync:session:{sessionId}`
  - dispatches messages to in-process callbacks
- `getLastCompletion(sessionId)`:
  - reads `sync:last:{sessionId}` for quick reconnect recovery

---

## 5) SSE stream behavior in API

File: `backend/apps/api/src/controllers/progress.controller.ts`

Flow for `GET /api/v1/progress/:sessionId`:
1. API sets SSE headers.
2. API sends initial connected event:
   ```json
   { "type": "connected", "sessionId": "..." }
   ```
3. API checks Redis last completion (`sync:last:{sessionId}`):
   - if found, sends it immediately and closes stream.
4. If not found, API subscribes to `sync:session:{sessionId}`.
5. API forwards each pub/sub message as SSE data.
6. On terminal status (`success|partial|failed`), API closes stream after short delay.
7. On disconnect/error, API unsubscribes and cleans up.

---

## 6) What frontend currently renders

File: `frontend/index.html`

- Frontend receives all SSE events.
- It ignores intermediate per-tool events for rendering.
- It renders only final completion banner when status is:
  - `success`
  - `partial`
  - `failed`

This keeps UI simple while backend still emits detailed per-tool progress.

---

## 7) Required environment

- `REDIS_URL` must be set for both API and Worker processes.
- Same Redis instance can be shared by:
  - BullMQ queue
  - Redis Pub/Sub progress events
  - completion replay cache key

---

## 8) Why this design works

- Decouples API and worker process communication.
- Works with separate processes/containers.
- Uses session-based routing so one browser session receives its own stream.
- Provides reconnect support via last completion cache (1-hour TTL).
- Keeps frontend UX minimal (completion-only banner).
