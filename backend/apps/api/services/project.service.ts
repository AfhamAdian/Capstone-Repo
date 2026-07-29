/**
 * Project Service
 * Read-side mapping from the raw project + projecthealthscore tables to the
 * shape the dashboard needs: current score, per-category subscores, and
 * history for the sparkline/timeSeries/subscoreSeries charts. Deliberately
 * scoped to health-score data only - the raw ops metrics widgets (commits,
 * tickets closed, deployments, PR cycle time) read from a different set of
 * snapshot tables and are not covered here.
 */

import { listProjects, getProject, type ProjectRow } from '../database/project.js';
import { listProjectHealthScoreHistory, type ProjectHealthScoreRow } from '../database/project-health-score.js';

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

export interface ProjectHealth {
  id: number;
  name: string;
  team: string;
  description: string;
  score: number | null;
  scoreTrend: number;
  subscores: HealthSubscores | null;
  sparkline: { v: number }[];
  timeSeries: HealthSeriesPoint[];
  subscoreSeries: Record<keyof HealthSubscores, { v: number; label: string }[]>;
  pendingSurvey: boolean;
  pendingSurveyTrigger: string | null;
  lastUpdated: string | null;
  /** True once at least one projecthealthscore row exists - lets the frontend distinguish "never synced" from "score is genuinely 0". */
  hasData: boolean;
}

function formatLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function buildProjectHealth(project: ProjectRow, history: ProjectHealthScoreRow[]): ProjectHealth {
  const latest = history[history.length - 1] ?? null;
  const previous = history.length > 1 ? history[history.length - 2] : null;

  const team = project.owner && project.repo ? `${project.owner}/${project.repo}` : (project.owner ?? '');

  const subscores: HealthSubscores | null = latest
    ? {
        delivery: latest.delivery_score ?? 0,
        codeQuality: latest.code_quality_score ?? 0,
        cicd: latest.cicd_score ?? 0,
        teamHealth: latest.team_health_score ?? 0,
        blockers: latest.blockers_score ?? 0,
      }
    : null;

  const score = latest?.overall_score ?? null;
  const scoreTrend = latest && previous && latest.overall_score !== null && previous.overall_score !== null
    ? Math.round((latest.overall_score - previous.overall_score) * 10) / 10
    : 0;

  const sparkline = history.map((h) => ({ v: Math.round(h.overall_score ?? 0) }));
  const timeSeries = history.map((h) => ({
    date: h.computed_at,
    label: formatLabel(h.computed_at),
    score: Math.round(h.overall_score ?? 0),
  }));

  const subscoreSeries: Record<keyof HealthSubscores, { v: number; label: string }[]> = {
    delivery: history.map((h) => ({ v: Math.round(h.delivery_score ?? 0), label: formatLabel(h.computed_at) })),
    codeQuality: history.map((h) => ({ v: Math.round(h.code_quality_score ?? 0), label: formatLabel(h.computed_at) })),
    cicd: history.map((h) => ({ v: Math.round(h.cicd_score ?? 0), label: formatLabel(h.computed_at) })),
    teamHealth: history.map((h) => ({ v: Math.round(h.team_health_score ?? 0), label: formatLabel(h.computed_at) })),
    blockers: history.map((h) => ({ v: Math.round(h.blockers_score ?? 0), label: formatLabel(h.computed_at) })),
  };

  return {
    id: project.id,
    name: project.name,
    team,
    description: project.description ?? '',
    score: score !== null ? Math.round(score) : null,
    scoreTrend,
    subscores,
    sparkline,
    timeSeries,
    subscoreSeries,
    pendingSurvey: project.pendingSurvey,
    pendingSurveyTrigger: project.pendingSurveyTrigger,
    lastUpdated: latest?.computed_at ?? null,
    hasData: latest !== null,
  };
}

export async function listProjectsWithHealth(): Promise<ProjectHealth[]> {
  const projects = await listProjects();
  return Promise.all(
    projects.map(async (project) => {
      const history = await listProjectHealthScoreHistory(project.id);
      return buildProjectHealth(project, history);
    }),
  );
}

export async function getProjectHealth(projectId: number): Promise<ProjectHealth | null> {
  const project = await getProject(projectId);
  if (!project) return null;
  const history = await listProjectHealthScoreHistory(projectId);
  return buildProjectHealth(project, history);
}
