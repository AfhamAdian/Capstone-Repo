import { useCallback, useEffect, useState } from "react";
import { listProjectsWithHealth, type ProjectHealth } from "../api-project";

export interface BackendProject {
  id: string;
  backendProjectId: string;
  name: string;
  owner: string | null;
  repo: string | null;
  team: string;
  description: string;
  status: "active" | "maintenance";
  tracked: boolean;
  score: number;
  scoreTrend: number;
  sparkline: { v: number }[];
  timeSeries: { date: string; label: string; score: number }[];
  subscores: {
    security: number;
    reliability: number;
    maintainability: number;
    cicdDeploymentHealth: number;
    teamHealth: number;
    engineeringProcess: number;
    planningExecution: number;
  };
  subscoreSeries: Record<string, { v: number; label: string; date?: string }[]>;
  metrics: { commits: number; ticketsClosed: number; sprintVelocity: number; openBlockers: number; deployments: number; prCycleTime: number };
  metricSeries: Record<string, { v: number; label: string; date?: string }[]>;
  pendingSurvey: boolean;
  pendingReview: number;
  lastUpdated: string;
  hasData: boolean;
  hasMetrics: boolean;
}

const EMPTY_SUBSCORES = {
  security: 0,
  reliability: 0,
  maintainability: 0,
  cicdDeploymentHealth: 0,
  teamHealth: 0,
  engineeringProcess: 0,
  planningExecution: 0,
};
const EMPTY_METRICS = { commits: 0, ticketsClosed: 0, sprintVelocity: 0, openBlockers: 0, deployments: 0, prCycleTime: 0 };
const EMPTY_METRIC_SERIES = {
  commits: [],
  tickets: [],
  velocity: [],
  blockers: [],
  deployments: [],
  prCycleTime: [],
};
const EMPTY_SUBSCORE_SERIES = {
  security: [],
  reliability: [],
  maintainability: [],
  cicdDeploymentHealth: [],
  teamHealth: [],
  engineeringProcess: [],
  planningExecution: [],
};

export function projectSlug(name: string, id: number): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `project-${id}`;
}

const LEGACY_PROJECT_SLUGS: Record<string, string> = {
  "onyx-mobile": "1",
  "meridian-api": "2",
};

export function findProjectByPath<T extends { id: string; backendProjectId?: string; name: string; repo?: string | null }>(
  projects: T[],
  pathId: string | null,
): T | null {
  if (!pathId) return null;
  const q = decodeURIComponent(pathId).toLowerCase();
  const legacyBackendId = LEGACY_PROJECT_SLUGS[q];
  return (
    projects.find(
      (p) =>
        p.id === pathId ||
        p.backendProjectId === pathId ||
        (legacyBackendId && p.backendProjectId === legacyBackendId) ||
        p.name.toLowerCase() === q ||
        (p.repo && p.repo.toLowerCase() === q),
    ) ?? null
  );
}

function formatLastUpdated(iso: string | null): string {
  if (!iso) return "Never synced";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const min = Math.round(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

function uniqueSlug(name: string, id: number, used: Set<string>): string {
  let slug = projectSlug(name, id);
  if (used.has(slug)) slug = `${slug}-${id}`;
  used.add(slug);
  return slug;
}

export function mapHealthToProject(health: ProjectHealth, slug: string): BackendProject {
  return {
    id: slug,
    backendProjectId: String(health.id),
    name: health.name,
    owner: health.owner,
    repo: health.repo,
    team: health.team || (health.owner && health.repo ? `${health.owner}/${health.repo}` : health.owner || ""),
    description: health.description || "",
    status: "active",
    tracked: health.isTracked,
    score: health.hasData && health.score !== null ? Math.round(health.score) : 0,
    scoreTrend: health.hasData ? Math.round(health.scoreTrend * 10) / 10 : 0,
    sparkline: health.hasData ? health.sparkline : [],
    timeSeries: health.hasData ? health.timeSeries : [],
    subscores: health.hasData && health.subscores
      ? {
          security: Math.round(health.subscores.security),
          reliability: Math.round(health.subscores.reliability),
          maintainability: Math.round(health.subscores.maintainability),
          cicdDeploymentHealth: Math.round(health.subscores.cicdDeploymentHealth),
          teamHealth: Math.round(health.subscores.teamHealth),
          engineeringProcess: Math.round(health.subscores.engineeringProcess),
          planningExecution: Math.round(health.subscores.planningExecution),
        }
      : EMPTY_SUBSCORES,
    subscoreSeries: health.hasData ? health.subscoreSeries : EMPTY_SUBSCORE_SERIES,
    metrics: health.hasMetrics && health.metrics
      ? {
          commits: health.metrics.commits ?? 0,
          ticketsClosed: health.metrics.ticketsClosed ?? 0,
          sprintVelocity: health.metrics.sprintVelocity ?? 0,
          openBlockers: health.metrics.openBlockers ?? 0,
          deployments: health.metrics.deployments ?? 0,
          prCycleTime: health.metrics.prCycleTime ?? 0,
        }
      : EMPTY_METRICS,
    metricSeries: health.hasMetrics ? health.metricSeries : EMPTY_METRIC_SERIES,
    pendingSurvey: health.pendingSurvey,
    pendingReview: 0,
    lastUpdated: formatLastUpdated(health.lastUpdated),
    hasData: health.hasData,
    hasMetrics: health.hasMetrics,
  };
}

/**
 * Loads the live project list from GET /projects. Names, owners, scores, and
 * metric series all come from Supabase — the UI stays on a skeleton until the
 * first response so dummy rows never flash.
 */
export function useBackendProjects() {
  const [projects, setProjects] = useState<BackendProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const healthList = await listProjectsWithHealth();
      setProjects((prev) => {
        const used = new Set<string>();
        const previousByBackend = new Map(prev.map((p) => [p.backendProjectId, p.id]));
        return healthList.map((health) => {
          const existing = previousByBackend.get(String(health.id));
          if (existing) used.add(existing);
          const slug = existing ?? uniqueSlug(health.name, health.id, used);
          return mapHealthToProject(health, slug);
        });
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { projects, setProjects, loading, error, refetch };
}
