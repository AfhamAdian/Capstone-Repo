import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
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
 * Fetches real health scores for every backend-synced project (matched via
 * backendProjectId) and merges them into the existing `projects` state in
 * place - the same `setProjects` mutation pattern App.tsx's SSE-driven
 * `updateProjectRisk` already uses, so a later live sync update naturally
 * continues from this baseline instead of the two fighting each other.
 * Demo-only projects (no backendProjectId) are left untouched.
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

  useEffect(() => {
    if (!backedProjectIds) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const healthList = await listProjectsWithHealth();
        if (cancelled) return;
        const healthByBackendId = new Map(healthList.map((h) => [String(h.id), h]));

        setProjects((prev) =>
          prev.map((p) => {
            if (!p.backendProjectId) return p;
            const health = healthByBackendId.get(p.backendProjectId);
            if (!health) return p;
            return { ...p, ...toFields(health) };
          }),
        );
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load project health");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backedProjectIds]);

  return { loading, error };
}
