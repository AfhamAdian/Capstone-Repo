import { beforeEach, describe, expect, it, vi } from 'vitest';

const getProjectIntegrationsForTools = vi.fn();
const getProjectName = vi.fn();

vi.mock('../database/project.js', () => ({
  getProjectIntegrationsForTools,
  getProjectName,
}));

const { SyncService } = await import('./sync.service.js');

describe('SyncService sync log metadata', () => {
  const enqueue = vi.fn();
  const service = new SyncService({ queueManager: { enqueue } as never });

  beforeEach(() => {
    vi.clearAllMocks();
    getProjectIntegrationsForTools.mockResolvedValue({ github: {} });
    getProjectName.mockResolvedValue('Alpha');
    enqueue.mockResolvedValue('job-id');
  });

  it('labels an interactive job as normal and resolves its project name', async () => {
    await service.enqueueSyncJob({ projectId: '1', tools: ['github'], sessionId: 'session-1' });

    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ projectName: 'Alpha', syncType: 'normal' }),
      {},
    );
  });

  it('uses periodic metadata supplied by the trusted scheduled fan-out', async () => {
    await service.enqueueSyncJob(
      { projectId: '1', tools: ['github'], sessionId: 'scheduled:1:2026-09-15T0200' },
      { projectName: 'Alpha Scheduled', syncType: 'periodic', jobId: 'scheduled-job' },
    );

    expect(getProjectName).not.toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'scheduled-job',
        projectName: 'Alpha Scheduled',
        syncType: 'periodic',
      }),
      {},
    );
  });
});
