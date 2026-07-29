import { useCallback, useEffect, useState } from "react";
import { listGlobalSurveys, getSurveyDetail, type SurveyDetail, type SurveyStatus } from "../api-survey";

/**
 * Mirrors App.tsx's local `Survey` interface structurally (App.tsx doesn't
 * export it, and TS is structurally typed, so this is assignable wherever a
 * `Survey[]` prop is expected without a shared import).
 */
export interface FrontendSurvey {
  id: string;
  projectId: string;
  status: SurveyStatus;
  trigger: string;
  sentDate: string;
  responseCount: number;
  targetCount: number;
  scores?: { delivery: number; codeQuality: number; cicd: number; teamHealth: number; blockers: number };
  themes: string[];
  aiInsight: string;
  rawResponses: { question: string; answers: string[] }[];
}

interface ProjectIdentity {
  id: string;
  backendProjectId?: string;
}

/**
 * Fetches every survey across all real (backend-synced) projects and merges
 * in full detail (scores/themes/aiInsight/rawResponses) for completed ones,
 * so the existing survey UI - which expects a fully-populated array, same
 * shape the old SURVEYS mock provided - keeps working unchanged. Projects
 * without a backendProjectId (demo-only) are simply absent from this list;
 * the caller is expected to union in their local mock surveys separately.
 */
export function useSurveys(projects: ProjectIdentity[]) {
  const [surveys, setSurveys] = useState<FrontendSurvey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const backedProjectIds = projects
    .filter((p) => p.backendProjectId)
    .map((p) => p.backendProjectId!)
    .sort()
    .join(",");

  const fetchSurveys = useCallback(async () => {
    const backendToFrontend = new Map(projects.filter((p) => p.backendProjectId).map((p) => [p.backendProjectId!, p.id]));
    if (backendToFrontend.size === 0) {
      setSurveys([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const items = await listGlobalSurveys();
      const relevant = items.filter((s) => backendToFrontend.has(String(s.projectId)));

      const detailById = new Map<number, SurveyDetail>();
      await Promise.all(
        relevant
          .filter((s) => s.status === "completed")
          .map(async (s) => {
            try {
              detailById.set(s.id, await getSurveyDetail(s.id));
            } catch {
              // Missing detail for one survey shouldn't break the whole list - it just renders without scores/insight.
            }
          }),
      );

      setSurveys(
        relevant.map((s) => {
          const detail = detailById.get(s.id);
          return {
            id: String(s.id),
            projectId: backendToFrontend.get(String(s.projectId))!,
            status: s.status,
            trigger: s.trigger,
            sentDate: s.sentDate,
            responseCount: s.responseCount,
            targetCount: s.targetCount,
            scores: detail?.scores ?? undefined,
            themes: detail?.themes ?? [],
            aiInsight: detail?.aiInsight ?? "",
            rawResponses: detail?.rawResponses ?? [],
          };
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load surveys");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backedProjectIds]);

  useEffect(() => {
    void fetchSurveys();
  }, [fetchSurveys]);

  return { surveys, loading, error, refetch: fetchSurveys };
}
