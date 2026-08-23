import {
  startSync,
  subscribeToProgress,
  type SyncCompletionEvent,
  type SyncProgressEvent,
  type SyncRiskKey,
  type SyncTool,
} from "./api";

/**
 * Dashboard unmounts whenever the user leaves that screen, so sync UI state
 * cannot live in the bar itself. This module keeps the EventSource and the
 * latest status alive for the whole SPA session, and also writes the session
 * id to sessionStorage so a refresh can reconnect to an in-flight job.
 */

export type SyncUiStatus =
  | "idle"
  | "queued"
  | "syncing"
  | "calculating-risk"
  | "success"
  | "partial"
  | "failed";

export type SyncSessionSnapshot = {
  projectId: string;
  backendProjectId: string;
  sessionId: string;
  status: SyncUiStatus;
  statusDetail: string | null;
};

export type SyncCompleteHandler = (
  projectId: string,
  riskScore?: number,
  riskScores?: Partial<Record<SyncRiskKey, number | null>>,
) => void;

const TOOL_LABELS: Record<SyncTool, string> = { github: "GitHub", jira: "Jira" };
const STORAGE_PREFIX = "pulse-sync-session:";

export function isSyncActive(status: SyncUiStatus) {
  return status === "queued" || status === "syncing" || status === "calculating-risk";
}

type StoredSession = {
  projectId: string;
  backendProjectId: string;
  sessionId: string;
};

const sessions = new Map<string, SyncSessionSnapshot>();
const listeners = new Map<string, Set<(snap: SyncSessionSnapshot | null) => void>>();
const streamCleanups = new Map<string, () => void>();
const completionHandlers = new Map<string, SyncCompleteHandler>();

function storageKey(backendProjectId: string) {
  return `${STORAGE_PREFIX}${backendProjectId}`;
}

function readStored(backendProjectId: string): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(storageKey(backendProjectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed.sessionId || !parsed.projectId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function persist(snap: SyncSessionSnapshot) {
  if (isSyncActive(snap.status)) {
    sessionStorage.setItem(
      storageKey(snap.backendProjectId),
      JSON.stringify({
        projectId: snap.projectId,
        backendProjectId: snap.backendProjectId,
        sessionId: snap.sessionId,
      }),
    );
    return;
  }
  sessionStorage.removeItem(storageKey(snap.backendProjectId));
}

function emit(projectId: string) {
  const snap = sessions.get(projectId) ?? null;
  listeners.get(projectId)?.forEach((listener) => listener(snap));
}

function setSession(snap: SyncSessionSnapshot) {
  sessions.set(snap.projectId, snap);
  persist(snap);
  emit(snap.projectId);
}

function patchSession(projectId: string, patch: Partial<SyncSessionSnapshot>) {
  const current = sessions.get(projectId);
  if (!current) return;
  setSession({ ...current, ...patch });
}

export function getSyncSession(projectId: string): SyncSessionSnapshot | null {
  return sessions.get(projectId) ?? null;
}

export function subscribeSyncSession(
  projectId: string,
  listener: (snap: SyncSessionSnapshot | null) => void,
): () => void {
  let set = listeners.get(projectId);
  if (!set) {
    set = new Set();
    listeners.set(projectId, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) listeners.delete(projectId);
  };
}

export function registerSyncCompletionHandler(projectId: string, handler: SyncCompleteHandler) {
  completionHandlers.set(projectId, handler);
}

function applyProgress(projectId: string, event: SyncProgressEvent) {
  if (event.status === "failed") {
    patchSession(projectId, {
      statusDetail:
        event.tool === "risk"
          ? `Risk calculation failed: ${event.error ?? "Unknown error"}. Waiting for sync to finish…`
          : `${TOOL_LABELS[event.tool as SyncTool] ?? event.tool} connector failed: ${event.error ?? "Unknown error"}. Waiting for other connectors…`,
    });
    return;
  }
  if (event.tool === "risk") {
    patchSession(projectId, {
      status: "calculating-risk",
      statusDetail: "Connector data fetched. Calculating the latest risk scores.",
    });
    return;
  }
  const toolLabel = TOOL_LABELS[event.tool as SyncTool] ?? event.tool;
  if (event.status === "syncing") {
    patchSession(projectId, {
      status: "syncing",
      statusDetail: `${toolLabel} connector is fetching data.`,
    });
    return;
  }
  if (event.status === "completed") {
    patchSession(projectId, { statusDetail: `${toolLabel} data fetched successfully.` });
    return;
  }
  patchSession(projectId, {
    status: "queued",
    statusDetail: "Sync job queued. Waiting for connector updates.",
  });
}

function applyCompletion(projectId: string, event: SyncCompletionEvent) {
  streamCleanups.get(projectId)?.();
  streamCleanups.delete(projectId);

  let statusDetail: string;
  if (event.status === "success") {
    statusDetail =
      event.riskScore != null ? `Sync completed. Latest risk score: ${event.riskScore}.` : "Sync completed.";
  } else if (event.status === "partial") {
    statusDetail = `Sync completed with warnings — ${event.toolsCompleted.length} connector(s) synced, ${event.toolsFailed.length} failed.`;
  } else {
    statusDetail = `Sync failed: ${event.error ?? "Unknown error"}`;
  }

  patchSession(projectId, { status: event.status, statusDetail });

  if (event.status !== "failed") {
    completionHandlers.get(projectId)?.(projectId, event.riskScore, event.riskScores);
  }
}

function attachStream(projectId: string, sessionId: string) {
  streamCleanups.get(projectId)?.();
  let settled = false;

  const cleanup = subscribeToProgress(sessionId, {
    onProgress: (event) => {
      if (settled) return;
      applyProgress(projectId, event);
    },
    onCompletion: (event) => {
      if (settled) return;
      settled = true;
      applyCompletion(projectId, event);
    },
    onError: (err) => {
      if (settled) return;
      settled = true;
      streamCleanups.delete(projectId);
      patchSession(projectId, {
        status: "failed",
        statusDetail: err.message || "Connection lost — the live sync stream disconnected before completion.",
      });
    },
  });

  streamCleanups.set(projectId, cleanup);
}

export function resumeSyncIfNeeded(project: { id: string; backendProjectId?: string }) {
  if (!project.backendProjectId) return;

  const existing = sessions.get(project.id);
  if (existing && streamCleanups.has(project.id)) return;
  if (existing && !isSyncActive(existing.status)) return;

  if (existing && isSyncActive(existing.status)) {
    attachStream(project.id, existing.sessionId);
    return;
  }

  const stored = readStored(project.backendProjectId);
  if (!stored) return;

  setSession({
    projectId: project.id,
    backendProjectId: project.backendProjectId,
    sessionId: stored.sessionId,
    status: "syncing",
    statusDetail: "Reconnecting to the in-progress sync…",
  });
  attachStream(project.id, stored.sessionId);
}

export async function startProjectSync(project: { id: string; backendProjectId?: string }): Promise<void> {
  if (!project.backendProjectId) return;
  const current = sessions.get(project.id);
  if (current && isSyncActive(current.status)) return;

  const sessionId = `session_${project.backendProjectId}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  setSession({
    projectId: project.id,
    backendProjectId: project.backendProjectId,
    sessionId,
    status: "queued",
    statusDetail: "Sync job queued. Waiting for connector updates.",
  });

  try {
    await startSync(project.backendProjectId, ["github", "jira"], sessionId);
  } catch (error) {
    patchSession(project.id, {
      status: "failed",
      statusDetail: `Failed to start sync: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
    return;
  }

  attachStream(project.id, sessionId);
}
