import {
  getProject,
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
  tools: SyncToolProgress[];
  updatedAt?: number;
};

export type SyncToolUiStatus = "queued" | "syncing" | "completed" | "failed";

export type SyncToolProgress = {
  tool: SyncTool;
  label: string;
  status: SyncToolUiStatus;
  error?: string;
};

export type SyncCompleteHandler = (
  projectId: string,
  riskScore?: number,
  riskScores?: Partial<Record<SyncRiskKey, number | null>>,
) => void;

const TOOL_LABELS: Record<SyncTool, string> = {
  github: "GitHub",
  jira: "Jira",
  sonarqube: "SonarQube",
  "github-actions": "GitHub Actions",
};
const STORAGE_PREFIX = "pulse-sync-session:";

export function isSyncActive(status: SyncUiStatus) {
  return status === "queued" || status === "syncing" || status === "calculating-risk";
}

type StoredSession = {
  projectId: string;
  backendProjectId: string;
  sessionId: string;
  tools?: SyncToolProgress[];
};

const sessions = new Map<string, SyncSessionSnapshot>();
const listeners = new Map<string, Set<(snap: SyncSessionSnapshot | null) => void>>();
const streamCleanups = new Map<string, () => void>();
const completionHandlers = new Map<string, SyncCompleteHandler>();
const sessionListeners = new Set<(snapshots: SyncSessionSnapshot[]) => void>();

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
        tools: snap.tools,
      }),
    );
    return;
  }
  sessionStorage.removeItem(storageKey(snap.backendProjectId));
}

function emit(projectId: string) {
  const snap = sessions.get(projectId) ?? null;
  listeners.get(projectId)?.forEach((listener) => listener(snap));
  const snapshots = Array.from(sessions.values());
  sessionListeners.forEach((listener) => listener(snapshots));
}

function setSession(snap: SyncSessionSnapshot) {
  const next = { ...snap, updatedAt: Date.now() };
  sessions.set(next.projectId, next);
  persist(next);
  emit(next.projectId);
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

export function getSyncSessions(): SyncSessionSnapshot[] {
  return Array.from(sessions.values());
}

export function subscribeSyncSessions(listener: (snapshots: SyncSessionSnapshot[]) => void): () => void {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

export function registerSyncCompletionHandler(projectId: string, handler: SyncCompleteHandler) {
  completionHandlers.set(projectId, handler);
}

function applyProgress(projectId: string, event: SyncProgressEvent) {
  const current = sessions.get(projectId);
  if (!current) return;

  if (event.status === "failed") {
    const tools =
      event.tool === "risk"
        ? current.tools
        : updateToolProgress(current.tools, event.tool, "failed", event.error);
    patchSession(projectId, {
      tools,
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
      tools: updateToolProgress(current.tools, event.tool, "syncing"),
      statusDetail: `${toolLabel} connector is fetching data.`,
    });
    return;
  }
  if (event.status === "completed") {
    patchSession(projectId, {
      tools: updateToolProgress(current.tools, event.tool, "completed"),
      statusDetail: `${toolLabel} data fetched successfully.`,
    });
    return;
  }
  patchSession(projectId, {
    status: "queued",
    tools: updateToolProgress(current.tools, event.tool, "queued"),
    statusDetail: "Sync job queued. Waiting for connector updates.",
  });
}

function updateToolProgress(
  tools: SyncToolProgress[],
  tool: SyncTool,
  status: SyncToolUiStatus,
  error?: string,
): SyncToolProgress[] {
  const next: SyncToolProgress = { tool, label: TOOL_LABELS[tool] ?? tool, status, ...(error ? { error } : {}) };
  const index = tools.findIndex((item) => item.tool === tool);
  if (index === -1) return [...tools, next];
  return tools.map((item, itemIndex) => (itemIndex === index ? next : item));
}

function applyCompletion(projectId: string, event: SyncCompletionEvent) {
  streamCleanups.get(projectId)?.();
  streamCleanups.delete(projectId);

  const current = sessions.get(projectId);
  const connectorError = current?.tools.find((item) => item.status === "failed")?.error;
  let statusDetail: string;
  if (event.status === "success") {
    statusDetail =
      event.riskScore != null ? `Sync completed. Latest risk score: ${event.riskScore}.` : "Sync completed.";
  } else if (event.status === "partial") {
    statusDetail = `Sync completed with warnings — ${event.toolsCompleted.length} connector(s) synced, ${event.toolsFailed.length} failed.`;
  } else {
    statusDetail = `Sync failed: ${event.error ?? connectorError ?? "No connectors completed successfully."}`;
  }

  const completed = new Set(event.toolsCompleted);
  const failed = new Set(event.toolsFailed);
  const eventTools = [...event.toolsCompleted, ...event.toolsFailed];
  const knownTools = current?.tools.length ? current.tools.map((item) => item.tool) : eventTools;
  const tools = knownTools.map((tool) => {
    const previous = current?.tools.find((item) => item.tool === tool);
    return {
      tool,
      label: TOOL_LABELS[tool] ?? tool,
      status: (failed.has(tool) ? "failed" : completed.has(tool) ? "completed" : "failed") as SyncToolUiStatus,
      ...(previous?.error ? { error: previous.error } : {}),
    };
  });

  patchSession(projectId, { status: event.status, statusDetail, tools });

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
    tools: stored.tools ?? [],
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
    tools: [],
  });

  try {
    // Sync whichever tools are actually configured for this project, not a fixed list -
    // same pattern as ProjectsView.tsx's handleSync.
    const detail = await getProject(Number(project.backendProjectId));
    const tools = Array.from(new Set(detail.integrations.map((i) => i.toolName as SyncTool)));
    if (tools.length === 0) {
      patchSession(project.id, {
        status: "failed",
        statusDetail: "No tools are configured for this project yet.",
      });
      return;
    }
    patchSession(project.id, {
      tools: tools.map((tool) => ({ tool, label: TOOL_LABELS[tool] ?? tool, status: "queued" })),
      statusDetail: `${tools.length} connected tool${tools.length === 1 ? "" : "s"} ready to sync.`,
    });
    // Open the stream before enqueueing the job so fast connector events are not
    // missed between the POST response and EventSource setup.
    attachStream(project.id, sessionId);
    await startSync(project.backendProjectId, tools, sessionId);
  } catch (error) {
    streamCleanups.get(project.id)?.();
    streamCleanups.delete(project.id);
    patchSession(project.id, {
      status: "failed",
      statusDetail: `Failed to start sync: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
    return;
  }
}
