export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000/api/v1";

export type SyncTool = "github" | "jira";

export interface StartSyncResponse {
  message: string;
  jobId: string;
  streamKey: string;
  tools: SyncTool[];
}

export async function startSync(
  projectId: string,
  tools: SyncTool[],
  sessionId: string,
): Promise<StartSyncResponse> {
  const response = await fetch(`${API_BASE_URL}/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, tools, sessionId }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}) as { message?: string });
    throw new Error(err.message || `Sync request failed (${response.status})`);
  }
  return response.json();
}

export type SyncRiskKey =
  | "DELIVERY"
  | "CODE_QUALITY"
  | "ENGINEERING_PROCESS"
  | "CICD_RELIABILITY"
  | "TEAM_HEALTH"
  | "SECURITY_RISK";

export interface SyncProgressEvent {
  jobId: string;
  sessionId: string;
  tool: SyncTool | "risk";
  status: "queued" | "syncing" | "calculating-risk" | "completed" | "failed";
  timestamp: string;
  error?: string;
}

export interface SyncCompletionEvent {
  jobId: string;
  sessionId: string;
  status: "success" | "partial" | "failed";
  timestamp: string;
  toolsCompleted: SyncTool[];
  toolsFailed: SyncTool[];
  riskScore?: number;
  riskScores?: Partial<Record<SyncRiskKey, number | null>>;
  error?: string;
}

export interface ProgressHandlers {
  onProgress?: (event: SyncProgressEvent) => void;
  onCompletion?: (event: SyncCompletionEvent) => void;
  onError?: (error: Error) => void;
}

export function subscribeToProgress(sessionId: string, handlers: ProgressHandlers): () => void {
  const source = new EventSource(`${API_BASE_URL}/progress/${sessionId}`);

  source.onmessage = (evt) => {
    try {
      const data = JSON.parse(evt.data);
      if (data.type === "connected") return;
      if (!data.tool && (data.status === "success" || data.status === "partial" || data.status === "failed")) {
        handlers.onCompletion?.(data as SyncCompletionEvent);
        return;
      }
      handlers.onProgress?.(data as SyncProgressEvent);
    } catch {
      handlers.onError?.(new Error("Failed to parse sync progress event"));
    }
  };

  source.onerror = () => {
    handlers.onError?.(new Error("Sync stream disconnected"));
  };

  return () => source.close();
}

// ─── ACTIONS API ────────────────────────────────────────────────────────────

/** Frontend shape of a management action (camelCase). */
export interface ApiAction {
  id: string;
  projectIds: string[];
  problem: string;
  reason: string;
  actionTaken: string;
  timestamp: string;
  effectiveness: number | null;
  loggedBy: string;
}

/** Raw row shape returned by the backend (snake_case). */
interface ActionRow {
  id: string;
  project_ids: string[];
  problem: string;
  reason: string;
  action_taken: string;
  action_date: string;
  effectiveness: number | null;
  logged_by: string;
  created_at: string;
}

function rowToAction(row: ActionRow): ApiAction {
  return {
    id: row.id,
    projectIds: row.project_ids,
    problem: row.problem,
    reason: row.reason,
    actionTaken: row.action_taken,
    timestamp: row.action_date,
    effectiveness: row.effectiveness,
    loggedBy: row.logged_by,
  };
}

/** Placeholder auth: the backend reads the user's level from this header. */
function authHeaders(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem("pulse.auth.v1");
    const level = raw ? (JSON.parse(raw) as { user?: { level?: number } }).user?.level ?? 0 : 0;
    return { "x-user-level": String(level) };
  } catch {
    return { "x-user-level": "0" };
  }
}

async function parseError(response: Response, fallback: string): Promise<Error> {
  const err = await response.json().catch(() => ({}) as { message?: string });
  return new Error(err.message || `${fallback} (${response.status})`);
}

export async function listActions(): Promise<ApiAction[]> {
  const response = await fetch(`${API_BASE_URL}/actions`, { headers: authHeaders() });
  if (!response.ok) throw await parseError(response, "Failed to load actions");
  const rows = (await response.json()) as ActionRow[];
  return rows.map(rowToAction);
}

export interface CreateActionInput {
  projectIds: string[];
  problem: string;
  reason: string;
  actionTaken: string;
  loggedBy: string;
  timestamp?: string;
}

export async function createAction(input: CreateActionInput): Promise<ApiAction> {
  const response = await fetch(`${API_BASE_URL}/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await parseError(response, "Failed to log action");
  return rowToAction((await response.json()) as ActionRow);
}

export async function searchActions(query: string, limit = 5): Promise<ApiAction[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const response = await fetch(`${API_BASE_URL}/actions/search?${params}`, { headers: authHeaders() });
  if (!response.ok) throw await parseError(response, "Failed to search actions");
  const rows = (await response.json()) as ActionRow[];
  return rows.map(rowToAction);
}

export async function rateAction(id: string, effectiveness: number): Promise<ApiAction> {
  const response = await fetch(`${API_BASE_URL}/actions/${id}/effectiveness`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ effectiveness }),
  });
  if (!response.ok) throw await parseError(response, "Failed to rate action");
  return rowToAction((await response.json()) as ActionRow);
}
