import { API_BASE_URL } from "./api";

export interface HealthSubscores {
  delivery: number;
  codeQuality: number;
  cicd: number;
  teamHealth: number;
  blockers: number;
}

export interface HealthSeriesPoint {
  date: string;
  label: string;
  score: number;
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
  subscoreSeries: Record<keyof HealthSubscores, { v: number; label: string; date?: string }[]>;
  metrics: OpsMetrics | null;
  metricSeries: OpsMetricSeries;
  pendingSurvey: boolean;
  pendingSurveyTrigger: string | null;
  lastUpdated: string | null;
  /** False if this project has never been synced - score/subscores/series are all empty/zeroed, not "genuinely zero". */
  hasData: boolean;
  /** False if no snapshot metric rows exist yet - keep the mock ops cards until then. */
  hasMetrics: boolean;
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}) as { message?: string });
    throw new Error(err.message || `Request failed (${response.status})`);
  }
  return response.json();
}

/** GET /api/v1/projects - every backend-tracked project with its current health score + history. */
export async function listProjectsWithHealth(): Promise<ProjectHealth[]> {
  const data = await request<{ projects: ProjectHealth[] }>("/projects");
  return data.projects;
}

/** GET /api/v1/projects/:projectId/health */
export async function getProjectHealth(projectId: string): Promise<ProjectHealth> {
  return request(`/projects/${projectId}/health`);
}
