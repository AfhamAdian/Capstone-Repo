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
