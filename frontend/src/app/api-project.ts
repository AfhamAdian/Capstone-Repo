import { API_BASE_URL } from "./api";

// Raw scores from the 7-score health engine (backend/libs/risk-engines). "Code Quality" is
// merged from security/reliability/maintainability on the frontend only - see
// format.ts's computeCodeQualityScore.
export interface HealthSubscores {
  security: number;
  reliability: number;
  maintainability: number;
  cicdDeploymentHealth: number;
  teamHealth: number;
  engineeringProcess: number;
  planningExecution: number;
}

export interface HealthSeriesPoint {
  date: string;
  label: string;
  score: number;
  snapshotId: number;
}

export interface OpsMetrics {
  commits: number | null;
  ticketsClosed: number | null;
  sprintVelocity: number | null;
  openBlockers: number | null;
  deployments: number | null;
  prCycleTime: number | null;
}

export type OpsMetricSeries = Record<
  "commits" | "tickets" | "velocity" | "blockers" | "deployments" | "prCycleTime",
  { v: number; label: string; date?: string }[]
>;

export interface ProjectHealth {
  id: number;
  name: string;
  owner: string | null;
  repo: string | null;
  team: string;
  description: string;
  score: number | null;
  scoreTrend: number;
  subscores: HealthSubscores | null;
  sparkline: { v: number }[];
  timeSeries: HealthSeriesPoint[];
  subscoreSeries: Record<keyof HealthSubscores, { v: number; label: string; date?: string; snapshotId: number }[]>;
  metrics: OpsMetrics | null;
  metricSeries: OpsMetricSeries;
  pendingSurvey: boolean;
  pendingSurveyTrigger: string | null;
  lastUpdated: string | null;
  /** False if this project has never been synced - score/subscores/series are all empty/zeroed, not "genuinely zero". */
  hasData: boolean;
  /** False if no snapshot metric rows exist yet - keep the mock ops cards until then. */
  hasMetrics: boolean;
  isTracked: boolean;
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { credentials: "include" });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}) as { message?: string });
    throw new Error(err.message || `Request failed (${response.status})`);
  }
  return response.json();
}

/** GET /api/v1/projects/health - every backend-tracked project with its current health score + history. */
export async function listProjectsWithHealth(): Promise<ProjectHealth[]> {
  const data = await request<{ projects: ProjectHealth[] }>("/projects/health");
  return data.projects;
}

/** GET /api/v1/projects/:projectId/health */
export async function getProjectHealth(projectId: string): Promise<ProjectHealth> {
  return request(`/projects/${projectId}/health`);
}

export interface ScoreBreakdownSignal {
  key: string;
  label: string;
  /** 0..100, or null if this snapshot had no usable value for it (excluded and renormalized around). */
  score: number | null;
  /** This signal's share of the score's total weight (0..1), after renormalizing. */
  weight: number;
  /** Raw input field name(s) this signal is derived from. */
  metricFields: string[];
  /** Raw values for metricFields, same order - undefined means that tool wasn't synced for this snapshot. */
  metricValues: Array<number | string | boolean | null | undefined>;
}

export interface ScoreBreakdown {
  type: string;
  score: number;
  level: "LOW" | "MEDIUM" | "HIGH";
  signals: ScoreBreakdownSignal[];
}

/** GET /api/v1/projects/:projectId/snapshots/:snapshotId/score-breakdown/:scoreType - which
 *  metrics made up one score for one already-synced snapshot ("click a score's graph"). */
export async function getScoreBreakdown(
  projectId: string,
  snapshotId: number,
  scoreType: string,
): Promise<ScoreBreakdown> {
  return request(`/projects/${projectId}/snapshots/${snapshotId}/score-breakdown/${scoreType}`);
}
