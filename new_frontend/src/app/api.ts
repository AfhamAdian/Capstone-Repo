// Relative by default so requests go through the Vite proxy (same-origin -> cookies work).
export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api/v1";

// credentials:"include" makes the browser send/receive the session cookie.
async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    ...options,
  });
  const data = (await response.json().catch(() => ({}))) as { message?: string } & T;
  if (!response.ok) {
    throw new Error(data.message || `Request failed (${response.status})`);
  }
  return data;
}

export interface AuthUser {
  id: number;
  companyId: number;
  name: string;
  email: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  companyName?: string;
  inviteToken?: string;
}

export async function register(input: RegisterInput): Promise<AuthUser> {
  const { user } = await apiRequest<{ user: AuthUser }>("/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return user;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const { user } = await apiRequest<{ user: AuthUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return user;
}

export async function logout(): Promise<void> {
  await apiRequest("/auth/logout", { method: "POST" });
}

// Always resolves with a generic message (backend never reveals whether the email exists).
export async function forgotPassword(email: string): Promise<string> {
  const { message } = await apiRequest<{ message: string }>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  return message;
}

// Throws on invalid/expired token or weak password; the backend revokes all sessions on success.
export async function resetPassword(token: string, password: string): Promise<string> {
  const { message } = await apiRequest<{ message: string }>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, password }),
  });
  return message;
}

// ---- Projects & invites ----

export type ToolCategory = "vcs" | "projectManagement" | "cicd" | "codeQuality";

export interface ProjectListItem {
  id: number;
  name: string;
  description: string | null;
  createdAt: string | null;
  vcs: string | null;
}

export interface ToolIntegrationView {
  category: ToolCategory;
  toolName: string;
  externalProjectId: string;
  config: Record<string, unknown>;
  isActive: boolean | null;
}

export interface ProjectMemberView {
  userId: number;
  name: string | null;
  email: string | null;
  role: string;
}

export interface ProjectDetail extends ProjectListItem {
  integrations: ToolIntegrationView[];
  members: ProjectMemberView[];
  pendingInvites?: string[];
}

export interface IntegrationInput {
  category: ToolCategory;
  toolName: string;
  externalProjectId: string;
  config: Record<string, string>;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  vcs: { toolName: string; externalProjectId: string; config: Record<string, string> };
  integrations?: IntegrationInput[];
  invites?: string[];
}

// Company projects, optionally filtered by version-control tool (the "workspace").
export async function listProjects(vcs?: string): Promise<ProjectListItem[]> {
  const query = vcs ? `?vcs=${encodeURIComponent(vcs)}` : "";
  const { projects } = await apiRequest<{ projects: ProjectListItem[] }>(`/projects${query}`);
  return projects;
}

// Admin-only; returns the full project (integrations + members + which invites were emailed).
export async function createProject(input: CreateProjectInput): Promise<ProjectDetail> {
  const { project } = await apiRequest<{ project: ProjectDetail }>("/projects", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return project;
}

export async function getProject(id: number): Promise<ProjectDetail> {
  const { project } = await apiRequest<{ project: ProjectDetail }>(`/projects/${id}`);
  return project;
}

export interface InvitePreview {
  email: string;
  projectId: number;
}

// Resolves an invite token for prefilling the registration form; null when not found/expired.
export async function getInvite(token: string): Promise<InvitePreview | null> {
  const response = await fetch(`${API_BASE_URL}/auth/invite/${token}`, { credentials: "include" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Failed to load invite (${response.status})`);
  const { invite } = (await response.json()) as { invite: InvitePreview };
  return invite;
}

// Returns null when not authenticated (401), instead of throwing.
export async function getMe(): Promise<AuthUser | null> {
  const response = await fetch(`${API_BASE_URL}/auth/me`, { credentials: "include" });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`Failed to fetch current user (${response.status})`);
  const { user } = (await response.json()) as { user: AuthUser };
  return user;
}

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
    credentials: "include",
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
  const source = new EventSource(`${API_BASE_URL}/progress/${sessionId}`, { withCredentials: true });

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
