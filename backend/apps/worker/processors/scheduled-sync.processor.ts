/**
 * Scheduled Sync Processor
 *
 * Fires on each configured SCHEDULED_SYNC_TIMES slot (see worker.ts). Fans every
 * project out into the EXISTING `sync` queue, so periodic runs reuse the whole
 * manual pipeline — connectors, metric persistence, risk scoring, survey triggers —
 * with no duplicated logic.
 *
 * Each run writes one `projectsnapshot` per project, which is what keeps the
 * dashboard graphs accumulating datapoints on a regular cadence.
 *
 * Deliberately NOT skipped when a project was synced recently: a datapoint at a
 * fixed time every day is what makes the series evenly spaced. Manual syncs just
 * add extra points in between.
 */

import { createHash } from 'node:crypto';
import { logger } from '@libs/logger.js';
import type { SupportedTool } from '@libs/sync/index.js';
import { listAllProjectsWithWorkspace } from '../../api/database/project-member.js';
import { listIntegrationsForProjects } from '../../api/database/project-tool-integration.js';
import type { SyncService } from '../../api/services/sync.service.js';
import { env } from '../../api/config/env.js';

/**
 * BullMQ treats an unset/0 priority as the HIGHEST, so interactive syncs (which never
 * set one) always jump ahead of a scheduled backlog.
 */
const SCHEDULED_SYNC_PRIORITY = 10;

/**
 * How long a completed scheduled job keeps its record. Must outlive its own slot so the
 * deterministic jobId stays reserved and a retried/restarted tick cannot double-sync.
 */
const SCHEDULED_JOB_RETENTION_SECONDS = 25 * 60 * 60;

export interface ScheduledSyncSummary {
  slot: string;
  totalProjects: number;
  eligible: number;
  enqueued: number;
  skippedNoIntegrations: number;
  failed: number;
  buckets: number;
  maxDelayMinutes: number;
}

/**
 * Projects sharing a VCS token share its rate limit, so they must be spaced apart.
 * Projects on different tokens have no reason to wait for each other.
 *
 * The token itself is hashed — this key is logged.
 */
function credentialBucket(
  projectId: number,
  workspaceId: number | null,
  configByTool: Map<string, Record<string, unknown>>,
): string {
  const vcsToken = configByTool.get('github')?.token ?? configByTool.get('gitlab')?.token;
  if (typeof vcsToken === 'string' && vcsToken.length > 0) {
    return `tok:${createHash('sha256').update(vcsToken).digest('hex').slice(0, 12)}`;
  }
  // No per-project token means getProjectIntegrationsForTools will fall back to the
  // workspace PAT, so every project in that workspace shares one rate limit.
  return workspaceId !== null ? `ws:${workspaceId}` : `proj:${projectId}`;
}

export async function processScheduledSyncTick(
  syncService: SyncService,
  slot: string,
): Promise<ScheduledSyncSummary> {
  const log = logger.child({ component: 'scheduled-sync', slot });

  const projects = await listAllProjectsWithWorkspace();
  const projectIds = projects.map((project) => project.id);
  const integrations = await listIntegrationsForProjects(projectIds);

  // Same rule the dashboard uses: sync whichever tools are actually configured for the
  // project, rather than a fixed list.
  const toolsByProject = new Map<number, SupportedTool[]>();
  const configByProject = new Map<number, Map<string, Record<string, unknown>>>();

  for (const row of integrations) {
    const tools = toolsByProject.get(row.project_id) ?? [];
    if (!tools.includes(row.tool_name)) {
      tools.push(row.tool_name);
    }
    toolsByProject.set(row.project_id, tools);

    const configs = configByProject.get(row.project_id) ?? new Map<string, Record<string, unknown>>();
    configs.set(row.tool_name, row.config ?? {});
    configByProject.set(row.project_id, configs);
  }

  const eligible = projects.filter((project) => toolsByProject.has(project.id));

  const buckets = new Map<string, number[]>();
  for (const project of eligible) {
    const bucket = credentialBucket(
      project.id,
      project.workspaceId,
      configByProject.get(project.id) ?? new Map(),
    );
    const members = buckets.get(bucket) ?? [];
    members.push(project.id);
    buckets.set(bucket, members);
  }

  // Slot date in the scheduling zone, so a run at 02:00 Asia/Dhaka gets that day's key
  // rather than the UTC calendar day it happens to fall on.
  const slotDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: env.scheduledSyncTz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const spacingMs = env.scheduledSyncPatSpacingMinutes * 60_000;
  const maxDelayMs = env.scheduledSyncMaxSpreadMinutes * 60_000;

  const summary: ScheduledSyncSummary = {
    slot,
    totalProjects: projects.length,
    eligible: eligible.length,
    enqueued: 0,
    skippedNoIntegrations: projects.length - eligible.length,
    failed: 0,
    buckets: buckets.size,
    maxDelayMinutes: 0,
  };

  for (const [bucket, memberIds] of buckets) {
    for (const [index, projectId] of memberIds.entries()) {
      const delayMs = Math.min(index * spacingMs, maxDelayMs);
      const tools = toolsByProject.get(projectId)!;

      try {
        await syncService.enqueueSyncJob(
          {
            projectId: String(projectId),
            tools,
            sessionId: `scheduled:${projectId}:${slotDate}T${slot}`,
          },
          {
            jobId: `sync_sched_${projectId}_${slotDate}T${slot}`,
            priority: SCHEDULED_SYNC_PRIORITY,
            delayMs,
            removeOnCompleteAgeSeconds: SCHEDULED_JOB_RETENTION_SECONDS,
          },
        );
        summary.enqueued += 1;
        summary.maxDelayMinutes = Math.max(summary.maxDelayMinutes, Math.round(delayMs / 60_000));
      } catch (error) {
        // getProjectIntegrationsForTools throws on a half-filled integration config.
        // One broken project must not abort the rest of the run.
        summary.failed += 1;
        log.error({ err: error, projectId, bucket, tools }, 'failed to enqueue scheduled sync for project');
      }
    }
  }

  return summary;
}
