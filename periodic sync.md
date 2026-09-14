# Periodic sync

## Status

Yes. Periodic project synchronization is implemented in the backend worker and is **enabled by default**.

Neither `backend/.env` nor `backend/.env.example` currently overrides the scheduled-sync settings. With the code's defaults, the intended schedule is therefore:

- enabled;
- once per day at `02:00`;
- time zone: `UTC`;
- projects sharing a VCS credential are spaced 10 minutes apart;
- that spacing is capped at a 180-minute spread.

This only runs while the backend worker is running and connected to Redis and the database. `npm run dev:worker` and `npm run start:worker` point to the current worker entrypoint. There is an important deployment caveat: `docker-compose.yml` currently starts `apps/worker/src/worker.ts`, but the file is actually `apps/worker/worker.ts`. As written, that Compose worker command cannot start the worker, so periodic sync will not run through that path until the command is corrected.

## Configuration

The settings are read in `backend/apps/api/config/env.ts`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `SCHEDULED_SYNC_ENABLED` | enabled | Only the exact value `false` disables the feature. On worker startup, disabling it also removes this feature's persisted schedules from Redis. |
| `SCHEDULED_SYNC_TIMES` | `02:00` | Comma-separated local times, such as `02:00,14:30`. Entries are deduplicated and sorted. Each entry creates a daily schedule. |
| `SCHEDULED_SYNC_TZ` | `UTC` | IANA time zone used for the schedules and for the date portion of scheduled job IDs, for example `Asia/Dhaka`. |
| `SCHEDULED_SYNC_PAT_SPACING_MINUTES` | `10` | Delay between projects grouped under the same VCS credential. Accepted range: 0–240. |
| `SCHEDULED_SYNC_MAX_SPREAD_MINUTES` | `180` | Maximum delay applied to a project in one credential group. Accepted range: 0–1440. |

Example configuration:

```dotenv
SCHEDULED_SYNC_ENABLED=true
SCHEDULED_SYNC_TIMES=02:00,14:00
SCHEDULED_SYNC_TZ=Asia/Dhaka
SCHEDULED_SYNC_PAT_SPACING_MINUTES=10
SCHEDULED_SYNC_MAX_SPREAD_MINUTES=180
```

Time entries must match `H:MM` or `HH:MM` and stay within `00:00`–`23:59`; invalid entries fail during startup. An invalid IANA time zone also prevents schedule reconciliation. An empty `SCHEDULED_SYNC_TIMES` value results in no active time slots even if the feature is enabled.

## How it works

1. When `backend/apps/worker/worker.ts` starts, it creates a `SyncScheduleQueue` backed by Redis.
2. The worker reconciles BullMQ job schedulers with the current environment configuration. It upserts desired daily cron schedules and removes obsolete `scheduled-sync-*` schedules. This matters because BullMQ schedules persist in Redis across process restarts and configuration changes.
3. At each configured time, BullMQ adds a tick to the separate `sync-schedule` queue. Tick processing has concurrency 1.
4. `processScheduledSyncTick()` loads every project and all of their configured tool integrations in bulk.
5. Projects without any integration rows are skipped. For every other project, the tool list is derived from its integration rows and deduplicated; it is not a fixed connector list.
6. Eligible projects are grouped into credential buckets to reduce VCS rate-limit bursts:
   - a GitHub token, or otherwise a GitLab token, is SHA-256 hashed and its first 12 hex characters form the bucket identifier;
   - without a project VCS token, the owning workspace ID is used because those projects may share a workspace PAT;
   - without either, the project gets its own bucket.
7. Projects within each bucket receive delays of `index × spacing`, capped at the maximum spread. Different buckets do not wait for each other.
8. A normal job is added to the existing `sync` queue for each project. The standard sync processor fetches connector data, persists metrics, calculates risk scores, and publishes progress/completion events.

In compact form:

```text
daily BullMQ scheduler
  -> sync-schedule tick (concurrency 1)
  -> enumerate projects and integrations
  -> group/delay projects by shared VCS credential
  -> existing sync queue (concurrency 2)
  -> connector sync, metric persistence, and risk calculation
```

## Queue behavior and duplicate prevention

Scheduled project jobs use priority `10`. Interactive jobs do not set a priority, which BullMQ treats as higher priority, so a scheduled backlog should not crowd out user-triggered syncs.

Each scheduled job receives identifiers scoped to the project, scheduling-zone date, and configured slot:

```text
job ID:     sync_sched_<projectId>_<YYYY-MM-DD>T<HHMM>
session ID: scheduled:<projectId>:<YYYY-MM-DD>T<HHMM>
```

The deterministic job ID makes reprocessing the same tick idempotent. Completed scheduled job records remain in Redis for 25 hours so that ID stays reserved beyond its daily slot. The underlying sync queue gives every job up to three attempts with exponential backoff starting at two seconds.

## Failure handling and logs

- A project whose integration configuration cannot be loaded/enqueued is logged and counted as failed without stopping the other projects in that tick.
- A failure while listing all projects or integrations fails the entire tick. The failure is logged by the scheduled-sync worker; a later scheduled tick can run normally.
- Actual per-project sync failures use the existing sync queue retry and failure behavior.
- Schedule startup logs include whether the feature is enabled, time zone, configured times, spacing, maximum spread, active scheduler IDs, and removed scheduler IDs.
- Tick completion logs include total projects, eligible/enqueued/skipped/failed counts, credential-bucket count, and the maximum applied delay.
- Every queued periodic project has an INFO entry marked `PERIODIC SYNC` with its name, ID, tools, slot, delay, and credential bucket. Its worker start/completion entries retain the same indicator and project details.
- Interactive worker start/completion entries are marked `NORMAL SYNC` and show only the project name as sync-specific context.
- `SIGINT` and `SIGTERM` handlers close both the scheduled-sync worker and its Redis queue.

Useful log messages include:

```text
scheduled sync is armed
scheduled sync is disabled; schedules removed
processing scheduled sync tick
completed scheduled sync tick
PERIODIC SYNC | project queued
PERIODIC SYNC | started
PERIODIC SYNC | completed
NORMAL SYNC | started
NORMAL SYNC | completed
PERIODIC SYNC | failed to queue project
scheduled sync tick failed
```

## Relevant implementation files

- `backend/apps/api/config/env.ts` — configuration parsing and defaults.
- `backend/libs/queue/sync-schedule-queue.ts` — BullMQ scheduler reconciliation and tick worker.
- `backend/apps/worker/worker.ts` — worker startup, logging, and shutdown wiring.
- `backend/apps/worker/processors/scheduled-sync.processor.ts` — project discovery, credential grouping, staggering, and fan-out.
- `backend/apps/api/services/sync.service.ts` — integration lookup and deterministic job-ID support.
- `backend/libs/queue/queue-manager.ts` — per-project queue priority, delay, retries, and retention.
- `backend/apps/worker/processors/scheduled-sync.processor.test.ts` — processor tests.

## Test coverage and known caveats

The processor tests cover skipping unconfigured projects, deriving/deduplicating tools, shared-credential spacing and maximum-spread clamping, independent credential buckets, scheduled priority and deterministic IDs, and continuing after one project's enqueue failure.

Known caveats:

- There are no focused tests for `SyncScheduleQueue.reconcileSchedules()` itself.
- `backend/.env.example` does not currently advertise the five scheduled-sync variables.
- `docker-compose.yml` references the obsolete/nonexistent `apps/worker/src/worker.ts` path.
- Older material in `backend/instructions/SYNC_SETUP.md` still lists scheduled sync as future work and is stale relative to the implementation.
- Once the maximum spread is reached, additional projects in the same bucket receive the same capped delay and can start together.
- Credential grouping chooses the GitHub token first when both GitHub and GitLab are configured; it does not independently stagger both providers.
