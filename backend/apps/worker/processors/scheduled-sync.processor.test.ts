import { beforeEach, describe, expect, it, vi } from 'vitest';

const listAllProjectsWithWorkspace = vi.fn();
const listIntegrationsForProjects = vi.fn();

vi.mock('../../api/database/project-member.js', () => ({
  listAllProjectsWithWorkspace: () => listAllProjectsWithWorkspace(),
}));
vi.mock('../../api/database/project-tool-integration.js', () => ({
  listIntegrationsForProjects: (ids: number[]) => listIntegrationsForProjects(ids),
}));
vi.mock('../../api/config/env.js', () => ({
  env: {
    scheduledSyncTz: 'Asia/Dhaka',
    scheduledSyncPatSpacingMinutes: 10,
    scheduledSyncMaxSpreadMinutes: 25,
  },
}));

const { processScheduledSyncTick } = await import('./scheduled-sync.processor.js');

type EnqueueCall = [payload: any, options: any];

function makeSyncService(failFor: number[] = []) {
  const calls: EnqueueCall[] = [];
  const service = {
    enqueueSyncJob: vi.fn(async (payload: any, options: any) => {
      if (failFor.includes(Number(payload.projectId))) {
        throw new Error('Missing GitHub integration fields (need token, owner, repo)');
      }
      calls.push([payload, options]);
      return { jobId: options.jobId, streamKey: payload.sessionId };
    }),
  };
  return { service: service as never, calls };
}

const integration = (projectId: number, toolName: string, config: Record<string, unknown> = {}) =>
  ({ id: projectId * 10, project_id: projectId, tool_category: 'vcs', tool_name: toolName, config, last_synced_at: null });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('processScheduledSyncTick', () => {
  it('skips projects with no configured integrations', async () => {
    listAllProjectsWithWorkspace.mockResolvedValue([
      { id: 1, workspaceId: 7 },
      { id: 2, workspaceId: 7 },
    ]);
    listIntegrationsForProjects.mockResolvedValue([integration(1, 'github')]);

    const { service, calls } = makeSyncService();
    const summary = await processScheduledSyncTick(service, '0200');

    expect(summary.totalProjects).toBe(2);
    expect(summary.eligible).toBe(1);
    expect(summary.skippedNoIntegrations).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]![0].projectId).toBe('1');
  });

  it('derives the tool list from the configured integrations, deduped', async () => {
    listAllProjectsWithWorkspace.mockResolvedValue([{ id: 1, workspaceId: null }]);
    listIntegrationsForProjects.mockResolvedValue([
      integration(1, 'github'),
      integration(1, 'jira'),
      integration(1, 'github'),
    ]);

    const { service, calls } = makeSyncService();
    await processScheduledSyncTick(service, '0200');

    expect(calls[0]![0].tools).toEqual(['github', 'jira']);
  });

  it('spaces projects sharing a workspace PAT, and clamps the spread', async () => {
    listAllProjectsWithWorkspace.mockResolvedValue(
      [1, 2, 3, 4].map((id) => ({ id, workspaceId: 7 })),
    );
    // No per-project token -> all four fall back to the same workspace PAT.
    listIntegrationsForProjects.mockResolvedValue([1, 2, 3, 4].map((id) => integration(id, 'github')));

    const { service, calls } = makeSyncService();
    const summary = await processScheduledSyncTick(service, '0200');

    expect(summary.buckets).toBe(1);
    // 0, 10, 20 then clamped at maxSpread=25 rather than 30.
    expect(calls.map((c) => c[1].delayMs)).toEqual([0, 600_000, 1_200_000, 1_500_000]);
  });

  it('does not make different tokens wait for each other', async () => {
    listAllProjectsWithWorkspace.mockResolvedValue([
      { id: 1, workspaceId: 7 },
      { id: 2, workspaceId: 7 },
    ]);
    listIntegrationsForProjects.mockResolvedValue([
      integration(1, 'github', { token: 'tok-aaa' }),
      integration(2, 'github', { token: 'tok-bbb' }),
    ]);

    const { service, calls } = makeSyncService();
    const summary = await processScheduledSyncTick(service, '0200');

    expect(summary.buckets).toBe(2);
    expect(calls.map((c) => c[1].delayMs)).toEqual([0, 0]);
  });

  it('enqueues below interactive priority with a deterministic, slot-scoped job id', async () => {
    listAllProjectsWithWorkspace.mockResolvedValue([{ id: 42, workspaceId: 7 }]);
    listIntegrationsForProjects.mockResolvedValue([integration(42, 'github')]);

    const { service, calls } = makeSyncService();
    await processScheduledSyncTick(service, '0200');

    const [payload, options] = calls[0]!;
    // Interactive syncs never set a priority; BullMQ treats unset as highest.
    expect(options.priority).toBe(10);
    expect(options.removeOnCompleteAgeSeconds).toBe(25 * 60 * 60);
    expect(options.jobId).toMatch(/^sync_sched_42_\d{4}-\d{2}-\d{2}T0200$/);
    expect(payload.sessionId).toMatch(/^scheduled:42:\d{4}-\d{2}-\d{2}T0200$/);
  });

  it('keeps going when one project has a broken integration config', async () => {
    listAllProjectsWithWorkspace.mockResolvedValue(
      [1, 2, 3].map((id) => ({ id, workspaceId: null })),
    );
    listIntegrationsForProjects.mockResolvedValue(
      [1, 2, 3].map((id) => integration(id, 'github', { token: `tok-${id}` })),
    );

    const { service, calls } = makeSyncService([2]);
    const summary = await processScheduledSyncTick(service, '0200');

    expect(summary.failed).toBe(1);
    expect(summary.enqueued).toBe(2);
    expect(calls.map((c) => c[0].projectId)).toEqual(['1', '3']);
  });
});
