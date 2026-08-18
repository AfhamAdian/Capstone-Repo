/**
 * Project Service
 * Read-side mapping from project + projecthealthscore + snapshot metric
 * tables to the dashboard shape: health scores and the six ops-metric cards.
 */

import { listProjects, getProject, type ProjectRow } from '../database/project.js';
import { listProjectHealthScoreHistory, type ProjectHealthScoreRow } from '../database/project-health-score.js';
import {
  listProjectOpsMetricsHistory,
  type SnapshotOpsMetricsRow,
} from '../database/project-ops-metrics.js';

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
  'commits' | 'tickets' | 'velocity' | 'blockers' | 'deployments' | 'prCycleTime',
  { v: number; label: string; date: string }[]
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
  subscoreSeries: Record<keyof HealthSubscores, { v: number; label: string; date: string }[]>;
  metrics: OpsMetrics | null;
  metricSeries: OpsMetricSeries;
  pendingSurvey: boolean;
  pendingSurveyTrigger: string | null;
  lastUpdated: string | null;
  /** True once at least one projecthealthscore row exists - lets the frontend distinguish "never synced" from "score is genuinely 0". */
  hasData: boolean;
  /** True once at least one snapshot metric value exists for the ops cards. */
  hasMetrics: boolean;
}

function formatLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function roundMetric(value: number, decimals = 0): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function lastKnown(rows: SnapshotOpsMetricsRow[], pick: (row: SnapshotOpsMetricsRow) => number | null): number | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const value = pick(rows[index]!);
    if (value !== null) return value;
  }
  return null;
}

function isoDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function carryForwardSeries(
  rows: SnapshotOpsMetricsRow[],
  pick: (row: SnapshotOpsMetricsRow) => number | null,
  decimals = 0,
): { v: number; label: string; date: string }[] {
  let last: number | null = null;
  const series: { v: number; label: string; date: string }[] = [];
  for (const row of rows) {
    const value = pick(row);
    if (value !== null) last = value;
    if (last !== null) {
      series.push({
        v: roundMetric(last, decimals),
        label: formatLabel(row.snapshotTime),
        date: isoDate(row.snapshotTime),
      });
    }
  }
  return series;
}

function buildOpsMetrics(rows: SnapshotOpsMetricsRow[]): { metrics: OpsMetrics | null; metricSeries: OpsMetricSeries; hasMetrics: boolean } {
  const emptySeries: OpsMetricSeries = {
    commits: [],
    tickets: [],
    velocity: [],
    blockers: [],
    deployments: [],
    prCycleTime: [],
  };

  const commits = lastKnown(rows, (row) => row.commits);
  const ticketsClosed = lastKnown(rows, (row) => row.ticketsClosed);
  const sprintVelocity = lastKnown(rows, (row) => row.sprintVelocity);
  const openBlockers = lastKnown(rows, (row) => row.openBlockers);
  const deployments = lastKnown(rows, (row) => row.deployments);
  const prCycleTime = lastKnown(rows, (row) => row.prCycleTime);

  const hasMetrics = [commits, ticketsClosed, sprintVelocity, openBlockers, deployments, prCycleTime].some((value) => value !== null);
  if (!hasMetrics) {
    return { metrics: null, metricSeries: emptySeries, hasMetrics: false };
  }

  return {
    hasMetrics: true,
    metrics: {
      commits: commits === null ? null : roundMetric(commits),
      ticketsClosed: ticketsClosed === null ? null : roundMetric(ticketsClosed),
      sprintVelocity: sprintVelocity === null ? null : roundMetric(sprintVelocity),
      openBlockers: openBlockers === null ? null : roundMetric(openBlockers),
      deployments: deployments === null ? null : roundMetric(deployments),
      prCycleTime: prCycleTime === null ? null : roundMetric(prCycleTime, 1),
    },
    metricSeries: {
      commits: carryForwardSeries(rows, (row) => row.commits),
      tickets: carryForwardSeries(rows, (row) => row.ticketsClosed),
      velocity: carryForwardSeries(rows, (row) => row.sprintVelocity),
      blockers: carryForwardSeries(rows, (row) => row.openBlockers),
      deployments: carryForwardSeries(rows, (row) => row.deployments),
      prCycleTime: carryForwardSeries(rows, (row) => row.prCycleTime, 1),
    },
  };
}

function buildProjectHealth(
  project: ProjectRow,
  history: ProjectHealthScoreRow[],
  opsHistory: SnapshotOpsMetricsRow[],
): ProjectHealth {
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
    date: isoDate(h.computed_at),
    label: formatLabel(h.computed_at),
    score: Math.round(h.overall_score ?? 0),
  }));

  const subscoreSeries: Record<keyof HealthSubscores, { v: number; label: string; date: string }[]> = {
    delivery: history.map((h) => ({ v: Math.round(h.delivery_score ?? 0), label: formatLabel(h.computed_at), date: isoDate(h.computed_at) })),
    codeQuality: history.map((h) => ({ v: Math.round(h.code_quality_score ?? 0), label: formatLabel(h.computed_at), date: isoDate(h.computed_at) })),
    cicd: history.map((h) => ({ v: Math.round(h.cicd_score ?? 0), label: formatLabel(h.computed_at), date: isoDate(h.computed_at) })),
    teamHealth: history.map((h) => ({ v: Math.round(h.team_health_score ?? 0), label: formatLabel(h.computed_at), date: isoDate(h.computed_at) })),
    blockers: history.map((h) => ({ v: Math.round(h.blockers_score ?? 0), label: formatLabel(h.computed_at), date: isoDate(h.computed_at) })),
  };

  const ops = buildOpsMetrics(opsHistory);

  return {
    id: project.id,
    name: project.name,
    owner: project.owner,
    repo: project.repo,
    team,
    description: project.description ?? '',
    score: score !== null ? Math.round(score) : null,
    scoreTrend,
    subscores,
    sparkline,
    timeSeries,
    subscoreSeries,
    metrics: ops.metrics,
    metricSeries: ops.metricSeries,
    pendingSurvey: project.pendingSurvey,
    pendingSurveyTrigger: project.pendingSurveyTrigger,
    lastUpdated: latest?.computed_at ?? opsHistory[opsHistory.length - 1]?.snapshotTime ?? null,
    hasData: latest !== null,
    hasMetrics: ops.hasMetrics,
  };
}

export async function listProjectsWithHealth(): Promise<ProjectHealth[]> {
  const projects = await listProjects();
  return Promise.all(
    projects.map(async (project) => {
      const [history, opsHistory] = await Promise.all([
        listProjectHealthScoreHistory(project.id),
        listProjectOpsMetricsHistory(project.id),
      ]);
      return buildProjectHealth(project, history, opsHistory);
    }),
  );
}

export async function getProjectHealth(projectId: number): Promise<ProjectHealth | null> {
  const project = await getProject(projectId);
  if (!project) return null;
  const [history, opsHistory] = await Promise.all([
    listProjectHealthScoreHistory(projectId),
    listProjectOpsMetricsHistory(projectId),
  ]);
  return buildProjectHealth(project, history, opsHistory);
}
