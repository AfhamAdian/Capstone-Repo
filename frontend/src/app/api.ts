// Relative by default so requests go through the Vite proxy (same-origin -> cookies work).
export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api/v1";

// credentials:"include" makes the browser send/receive the session cookie.
// Carries the HTTP status so callers can branch on it (e.g. 409 = account already exists) without
// matching on the error message text.
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    ...options,
  });
  const data = (await response.json().catch(() => ({}))) as { message?: string } & T;
  if (!response.ok) {
    throw new ApiError(data.message || `Request failed (${response.status})`, response.status);
  }
  return data;
}

export interface AuthUser {
  id: number;
  companyId: number;
  name: string;
  email: string;
  role: "admin" | "member";
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

// Emails a 6-digit verification code for self-signup; throws if the email is already registered.
export async function sendVerificationCode(email: string): Promise<string> {
  const { message } = await apiRequest<{ message: string }>("/auth/send-verification-code", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  return message;
}

// Confirms the code so registration can proceed; throws on an invalid/expired code.
export async function verifyEmailCode(email: string, code: string): Promise<string> {
  const { message } = await apiRequest<{ message: string }>("/auth/verify-email-code", {
    method: "POST",
    body: JSON.stringify({ email, code }),
  });
  return message;
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

export interface ProjectRiskScore {
  snapshotId: number;
  snapshotTime: string | null;
  overall: number | null;
  subscores: {
    security: number | null;
    reliability: number | null;
    maintainability: number | null;
    cicdDeploymentHealth: number | null;
    teamHealth: number | null;
    engineeringProcess: number | null;
    planningExecution: number | null;
  };
}

export interface ProjectListItem {
  id: number;
  name: string;
  description: string | null;
  createdAt: string | null;
  vcs: string | null;
  workspaceId: number | null;
  score: ProjectRiskScore | null;
}

export interface ToolIntegrationView {
  category: ToolCategory;
  toolName: string;
  config: Record<string, unknown>;
}

export interface ProjectMemberView {
  userId: number;
  name: string | null;
  email: string | null;
}

export interface ProjectDetail extends ProjectListItem {
  integrations: ToolIntegrationView[];
  members: ProjectMemberView[];
}

// Company projects, optionally filtered by version-control tool (the "workspace").
export async function listProjects(vcs?: string): Promise<ProjectListItem[]> {
  const query = vcs ? `?vcs=${encodeURIComponent(vcs)}` : "";
  const { projects } = await apiRequest<{ projects: ProjectListItem[] }>(`/projects${query}`);
  return projects;
}

export async function getProject(id: number): Promise<ProjectDetail> {
  const { project } = await apiRequest<{ project: ProjectDetail }>(`/projects/${id}`);
  return project;
}

// Admin-only: toggle whether a project is tracked in the portfolio.
export async function setProjectTracked(projectId: number, tracked: boolean): Promise<void> {
  await apiRequest(`/projects/${projectId}/tracked`, {
    method: "PATCH",
    body: JSON.stringify({ tracked }),
  });
}

// Admin-only: reveal the effective token for a connector (config token, else the workspace PAT).
export async function getIntegrationToken(projectId: number, toolName: string): Promise<string | null> {
  const { token } = await apiRequest<{ token: string | null }>(`/projects/${projectId}/integrations/${toolName}/token`);
  return token;
}

// Admin-only: update a connector's config (blank fields keep the current value). Returns the refreshed project.
export async function updateProjectIntegration(
  projectId: number,
  toolName: string,
  config: Record<string, string>,
): Promise<ProjectDetail> {
  const { project } = await apiRequest<{ project: ProjectDetail }>(`/projects/${projectId}/integrations`, {
    method: "PATCH",
    body: JSON.stringify({ toolName, config }),
  });
  return project;
}

// ---- Workspaces ----

export interface WorkspaceRepo {
  name: string;
  fullName: string;
  description: string | null;
  language: string | null;
  stars: number;
  updatedAt: string | null;
  private: boolean;
}

export interface WorkspaceView {
  id: number;
  name: string;
  vcsProvider: string;
  organization: string;
  createdAt: string | null;
}

// A repo reachable by a workspace's PAT, plus whether it's already tracked as a project here.
export interface WorkspaceRepoStatus extends WorkspaceRepo {
  imported: boolean;
}

// "Add Project": repos this workspace's stored PAT can reach, flagging already-imported ones (admin only).
export async function listWorkspaceRepos(workspaceId: string | number): Promise<WorkspaceRepoStatus[]> {
  const { repos } = await apiRequest<{ repos: WorkspaceRepoStatus[] }>(`/workspaces/${workspaceId}/repos`);
  return repos;
}

// Import the selected repos as projects under an existing workspace (admin only).
export async function addWorkspaceProjects(
  workspaceId: string | number,
  repos: string[],
): Promise<{ projects: Array<{ id: number; name: string }> }> {
  return apiRequest<{ projects: Array<{ id: number; name: string }> }>(`/workspaces/${workspaceId}/projects`, {
    method: "POST",
    body: JSON.stringify({ repos }),
  });
}

// Step 2 of the wizard: validate the PAT and list the repos it can access (nothing is saved).
export async function previewWorkspaceRepos(input: {
  vcs: string;
  organization: string;
  token: string;
}): Promise<WorkspaceRepo[]> {
  const { repos } = await apiRequest<{ repos: WorkspaceRepo[] }>("/workspaces/preview-repos", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return repos;
}

// Step 3: create the workspace and import the selected repos as projects (admin only).
export async function createWorkspace(input: {
  name: string;
  vcs: string;
  organization: string;
  token: string;
  repos: string[];
}): Promise<{ workspace: WorkspaceView; projects: Array<{ id: number; name: string }> }> {
  return apiRequest("/workspaces", { method: "POST", body: JSON.stringify(input) });
}

export async function listWorkspaces(): Promise<WorkspaceView[]> {
  const { workspaces } = await apiRequest<{ workspaces: WorkspaceView[] }>("/workspaces");
  return workspaces;
}

export interface InvitePreview {
  email: string;
  projectId: number;
  hasAccount: boolean; // true → the invited email already has an account; client routes them to login
}

// Resolves an invite token for prefilling the registration form; null when not found/expired.
export async function getInvite(token: string): Promise<InvitePreview | null> {
  const response = await fetch(`${API_BASE_URL}/auth/invite/${token}`, { credentials: "include" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Failed to load invite (${response.status})`);
  const { invite } = (await response.json()) as { invite: InvitePreview };
  return invite;
}

// Logged-in user accepts a project invite (the existing-account path). Returns the joined project id.
export async function acceptInvite(token: string): Promise<{ projectId: number }> {
  return apiRequest<{ projectId: number }>("/auth/accept-invite", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

// Admin-only: email a project invite to someone. Returns the refreshed project.
export async function inviteProjectMember(projectId: number, email: string): Promise<ProjectDetail> {
  const { project } = await apiRequest<{ project: ProjectDetail }>(`/projects/${projectId}/invites`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  return project;
}

// Admin-only: remove an assigned member from a project. Returns the refreshed project.
export async function removeProjectMember(projectId: number, userId: number): Promise<ProjectDetail> {
  const { project } = await apiRequest<{ project: ProjectDetail }>(`/projects/${projectId}/members/${userId}`, {
    method: "DELETE",
  });
  return project;
}

// Returns null when not authenticated (401), instead of throwing.
export async function getMe(): Promise<AuthUser | null> {
  const response = await fetch(`${API_BASE_URL}/auth/me`, { credentials: "include" });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`Failed to fetch current user (${response.status})`);
  const { user } = (await response.json()) as { user: AuthUser };
  return user;
}

export type SyncTool = "github" | "jira" | "sonarqube" | "github-actions";

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
  | "SECURITY"
  | "RELIABILITY"
  | "MAINTAINABILITY"
  | "CICD_DEPLOYMENT_HEALTH"
  | "TEAM_HEALTH"
  | "ENGINEERING_PROCESS"
  | "PLANNING_EXECUTION";

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
  companyId: number | null;
  loggedByUserId: number | null;
  nextReviewAt: string | null;
  effectivenessRatedByUserId: number | null;
  effectivenessRatedAt: string | null;
  similarity?: number;
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
  company_id: number | null;
  logged_by_user_id: number | null;
  next_review_at: string | null;
  effectiveness_rated_by_user_id: number | null;
  effectiveness_rated_at: string | null;
  updated_at: string;
  similarity?: number;
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
    companyId: row.company_id,
    loggedByUserId: row.logged_by_user_id,
    nextReviewAt: row.next_review_at,
    effectivenessRatedByUserId: row.effectiveness_rated_by_user_id,
    effectivenessRatedAt: row.effectiveness_rated_at,
    similarity: row.similarity,
  };
}

async function parseError(response: Response, fallback: string): Promise<Error> {
  const err = await response.json().catch(() => ({}) as { message?: string });
  return new Error(err.message || `${fallback} (${response.status})`);
}

export interface ListActionsOptions {
  projectId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export async function listActions(options: ListActionsOptions = {}): Promise<ApiAction[]> {
  const params = new URLSearchParams();
  if (options.projectId) params.set("projectId", options.projectId);
  if (options.from) params.set("from", options.from);
  if (options.to) params.set("to", options.to);
  if (options.limit !== undefined) params.set("limit", String(options.limit));
  if (options.offset !== undefined) params.set("offset", String(options.offset));
  const query = params.size ? `?${params.toString()}` : "";
  const rows = await apiRequest<ActionRow[]>(`/actions${query}`);
  return rows.map(rowToAction);
}

/** Loads the complete project action history from the database in bounded pages. */
export async function listAllProjectActions(projectId: string): Promise<ApiAction[]> {
  const pageSize = 200;
  const actions: ApiAction[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await listActions({ projectId, limit: pageSize, offset });
    actions.push(...page);
    if (page.length < pageSize) return actions;
  }
}

export interface CreateActionInput {
  projectIds: string[];
  problem: string;
  reason: string;
  actionTaken: string;
  timestamp?: string;
}

export async function createAction(input: CreateActionInput): Promise<ApiAction> {
  const row = await apiRequest<ActionRow>("/actions", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return rowToAction(row);
}

export interface SearchActionsOptions {
  projectId?: string;
  deep?: boolean;
  excludeActionId?: string;
  signal?: AbortSignal;
}

export type ActionSearchMode = "rerank" | "lexical";

export interface SearchActionsResult {
  actions: ApiAction[];
  mode: ActionSearchMode;
}

export async function searchActions(
  query: string,
  limit = 5,
  options: SearchActionsOptions = {},
): Promise<SearchActionsResult> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  if (options.projectId) params.set("projectId", options.projectId);
  if (options.deep) params.set("mode", "deep");
  if (options.excludeActionId) params.set("excludeActionId", options.excludeActionId);
  const response = await fetch(`${API_BASE_URL}/actions/search?${params}`, {
    credentials: "include",
    signal: options.signal,
  });
  if (!response.ok) throw await parseError(response, "Failed to search actions");
  const rows = (await response.json()) as ActionRow[];
  const modeHeader = response.headers.get("x-action-search-mode");
  const mode: ActionSearchMode = modeHeader === "rerank" ? "rerank" : "lexical";
  return { actions: rows.map(rowToAction), mode };
}

export async function rateAction(id: string, effectiveness: number): Promise<ApiAction> {
  const row = await apiRequest<ActionRow>(`/actions/${id}/effectiveness`, {
    method: "PUT",
    body: JSON.stringify({ effectiveness }),
  });
  return rowToAction(row);
}

export async function updateAction(id: string, input: CreateActionInput): Promise<ApiAction> {
  const row = await apiRequest<ActionRow>(`/actions/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
  return rowToAction(row);
}

export async function deleteAction(id: string): Promise<void> {
  await apiRequest(`/actions/${id}`, { method: "DELETE" });
}

export async function deferActionReview(id: string, weeks: 1 | 2 | 4): Promise<ApiAction> {
  const row = await apiRequest<ActionRow>(`/actions/${id}/review-schedule`, {
    method: "PUT",
    body: JSON.stringify({ weeks }),
  });
  return rowToAction(row);
}

interface ActionReviewQueueRow {
  window_start: string;
  window_end: string;
  ready_count: number;
  from_last_week: ActionRow[];
  earlier: ActionRow[];
  waiting_for_outcome: ActionRow[];
}

export interface ActionReviewQueue {
  windowStart: string;
  windowEnd: string;
  readyCount: number;
  fromLastWeek: ApiAction[];
  earlier: ApiAction[];
  waitingForOutcome: ApiAction[];
}

export async function listActionEffectivenessReviews(): Promise<ActionReviewQueue> {
  const queue = await apiRequest<ActionReviewQueueRow>("/actions/effectiveness-review");
  return {
    windowStart: queue.window_start,
    windowEnd: queue.window_end,
    readyCount: queue.ready_count,
    fromLastWeek: queue.from_last_week.map(rowToAction),
    earlier: queue.earlier.map(rowToAction),
    waitingForOutcome: queue.waiting_for_outcome.map(rowToAction),
  };
}
