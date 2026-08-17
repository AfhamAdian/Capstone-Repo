import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { listProjectsWithHealth, type ProjectHealth } from "../api-project";

interface ProjectIdentity {
  id: string;
  backendProjectId?: string;
}

/**
 * Mirrors the subset of App.tsx's local `Project` interface that real health
 * data can fill in. Structural typing makes this assignable wherever a
 * `Project` is expected without a shared import.
 */
interface ProjectHealthFields {
  name: string;
  team: string;
  description: string;
  score: number;
  scoreTrend: number;
  subscores: { delivery: number; codeQuality: number; cicd: number; teamHealth: number; blockers: number };
  sparkline: { v: number }[];
  timeSeries: { date: string; label: string; score: number }[];
  subscoreSeries: Record<string, { v: number; label: string }[]>;
  metrics: { commits: number; ticketsClosed: number; sprintVelocity: number; openBlockers: number; deployments: number; prCycleTime: number };
  metricSeries: Record<string, { v: number; label: string }[]>;
  pendingSurvey: boolean;
  lastUpdated: string;
}

function toFields(health: ProjectHealth): Partial<ProjectHealthFields> {
  const base: Partial<ProjectHealthFields> = {
    name: health.name,
    team: health.team,
    description: health.description,
    pendingSurvey: health.pendingSurvey,
  };
  if (health.hasMetrics && health.metrics) {
    const metrics: Partial<ProjectHealthFields["metrics"]> = {};
    if (health.metrics.commits != null) metrics.commits = health.metrics.commits;
    if (health.metrics.ticketsClosed != null) metrics.ticketsClosed = health.metrics.ticketsClosed;
    if (health.metrics.sprintVelocity != null) metrics.sprintVelocity = health.metrics.sprintVelocity;
    if (health.metrics.openBlockers != null) metrics.openBlockers = health.metrics.openBlockers;
    if (health.metrics.deployments != null) metrics.deployments = health.metrics.deployments;
    if (health.metrics.prCycleTime != null) metrics.prCycleTime = health.metrics.prCycleTime;
    if (Object.keys(metrics).length > 0) base.metrics = metrics as ProjectHealthFields["metrics"];

    const metricSeries: Record<string, { v: number; label: string }[]> = {};
    for (const [key, series] of Object.entries(health.metricSeries ?? {})) {
      if (series.length > 0) metricSeries[key] = series;
    }
    if (Object.keys(metricSeries).length > 0) base.metricSeries = metricSeries;
  }
  // Only overlay score/history once this project has actually been synced at least
  // once - otherwise every value is 0/empty and would replace a perfectly good demo
  // chart with a flat line. Keep the mock's score/subscores/series until real data exists.
  if (!health.hasData || health.score === null || !health.subscores) return base;
  return {
    ...base,
    score: health.score,
    scoreTrend: health.scoreTrend,
    subscores: health.subscores,
    sparkline: health.sparkline,
    timeSeries: health.timeSeries,
    subscoreSeries: health.subscoreSeries,
    lastUpdated: health.lastUpdated ?? undefined,
  };
}

/**
 * Fetches real health scores and snapshot ops metrics for every backend-synced
 * project (matched via backendProjectId) and merges them into `projects` in
 * place. Demo-only projects (no backendProjectId) are left untouched. After a
 * live sync, App.tsx calls `refetch` so the metric cards update from Supabase.
 */
export function useProjectHealthSync<T extends ProjectIdentity>(
  projects: T[],
  setProjects: Dispatch<SetStateAction<T[]>>,
) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const backedProjectIds = projects
    .filter((p) => p.backendProjectId)
    .map((p) => p.backendProjectId!)
    .sort()
    .join(",");

  const applyHealth = useCallback(async () => {
    if (!backedProjectIds) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const healthList = await listProjectsWithHealth();
      const healthByBackendId = new Map(healthList.map((h) => [String(h.id), h]));

      setProjects((prev) =>
        prev.map((p) => {
          if (!p.backendProjectId) return p;
          const health = healthByBackendId.get(p.backendProjectId);
          if (!health) return p;
          const fields = toFields(health);
          const current = p as T & Partial<ProjectHealthFields>;
          return {
            ...current,
            ...fields,
            metrics: fields.metrics ? { ...current.metrics, ...fields.metrics } : current.metrics,
            metricSeries: fields.metricSeries ? { ...current.metricSeries, ...fields.metricSeries } : current.metricSeries,
          } as T;
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load project health");
    } finally {
      setLoading(false);
    }
  }, [backedProjectIds, setProjects]);

  useEffect(() => {
    if (!backedProjectIds) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void applyHealth().then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [applyHealth, backedProjectIds]);

  return { loading, error, refetch: applyHealth };
}
