/**
 * BullMQ queue for the periodic (scheduled) sync tick.
 *
 * Kept separate from the `sync` queue it feeds: this queue only carries the
 * low-frequency "fan out every project" tick, while the actual per-project work
 * still runs through the existing sync pipeline.
 */

import { Queue, Worker, type Processor } from 'bullmq';

export interface ScheduledSyncTickData {
  /** The scheduler slot this tick belongs to, e.g. "0200". */
  slot: string;
  triggeredAt: string;
}

export interface SyncScheduleQueueConfig {
  redisUrl: string;
}

export interface ScheduledSyncTime {
  hour: number;
  minute: number;
}

const SYNC_SCHEDULE_QUEUE = 'sync-schedule';
const SCHEDULER_ID_PREFIX = 'scheduled-sync-';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function schedulerIdFor(time: ScheduledSyncTime): string {
  return `${SCHEDULER_ID_PREFIX}${pad(time.hour)}${pad(time.minute)}`;
}

export class SyncScheduleQueue {
  private readonly connection: { url: string };
  private readonly queue: Queue<ScheduledSyncTickData>;

  constructor(config: SyncScheduleQueueConfig) {
    this.connection = { url: config.redisUrl };
    this.queue = new Queue<ScheduledSyncTickData>(SYNC_SCHEDULE_QUEUE, { connection: this.connection });
  }

  /**
   * Reconciles Redis against the configured schedule and returns the active scheduler ids.
   *
   * Job schedulers live in Redis, not in code: a schedule registered on a previous boot
   * keeps firing until it is explicitly removed. So turning the feature off, or dropping a
   * time from SCHEDULED_SYNC_TIMES, has to DELETE the stale entry — it is not enough to
   * skip registering it. Safe to run on every boot and from every worker replica.
   */
  async reconcileSchedules(
    times: readonly ScheduledSyncTime[],
    tz: string,
    enabled: boolean,
  ): Promise<{ active: string[]; removed: string[] }> {
    // cron-parser rejects an unknown zone with "CronDate: unhandled timestamp: null",
    // which says nothing about the real cause. Fail with something actionable instead.
    // Checked here rather than in validateEnv() because nothing currently calls that.
    if (enabled) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz });
      } catch {
        throw new Error(`SCHEDULED_SYNC_TZ is not a valid IANA time zone: "${tz}"`);
      }
    }

    const desired = new Map<string, string>(
      enabled ? times.map((time) => [schedulerIdFor(time), `${time.minute} ${time.hour} * * *`]) : [],
    );

    const removed: string[] = [];
    for (const existing of await this.queue.getJobSchedulers()) {
      const id = existing.key;
      // Only touch entries this feature owns, so an unrelated scheduler on this
      // queue could never be swept away.
      if (!id?.startsWith(SCHEDULER_ID_PREFIX)) continue;
      if (!desired.has(id)) {
        await this.queue.removeJobScheduler(id);
        removed.push(id);
      }
    }

    for (const [id, pattern] of desired) {
      // `tz` is an IANA zone handed to cron-parser, so the pattern fires at that
      // local time regardless of the server's own clock or TZ env var.
      await this.queue.upsertJobScheduler(
        id,
        { pattern, tz },
        {
          name: 'scheduled-sync',
          data: { slot: id.slice(SCHEDULER_ID_PREFIX.length), triggeredAt: new Date().toISOString() },
          opts: { removeOnComplete: true, removeOnFail: 50 },
        },
      );
    }

    return { active: [...desired.keys()], removed };
  }

  createWorker(processor: Processor<ScheduledSyncTickData>): Worker<ScheduledSyncTickData> {
    return new Worker<ScheduledSyncTickData>(SYNC_SCHEDULE_QUEUE, processor, {
      connection: this.connection,
      // One tick at a time: a tick only enqueues work, and overlapping ticks would
      // just fight over the same projects.
      concurrency: 1,
    });
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}
