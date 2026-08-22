import { useCallback, useEffect, useState } from "react";
import {
  listGlobalSurveys,
  getSurveyDetail,
  type GeneratedSurveyQuestion,
  type SurveyDetail,
  type SurveyHealthContext,
  type SurveySource,
  type SurveyStatus,
} from "../api-survey";

/**
 * Mirrors App.tsx's local `Survey` interface structurally (App.tsx doesn't
 * export it, and TS is structurally typed, so this is assignable wherever a
 * `Survey[]` prop is expected without a shared import).
 */
export interface FrontendSurvey {
  id: string;
  projectId: string;
  status: SurveyStatus;
  source: SurveySource;
  trigger: string;
  sentDate: string;
  responseCount: number;
  targetCount: number;
  scores?: { delivery: number; codeQuality: number; cicd: number; teamHealth: number; blockers: number };
  themes: string[];
  aiInsight: string;
  rawResponses: { question: string; answers: string[] }[];
  questions: GeneratedSurveyQuestion[];
  reviewDeadlineAt: string | null;
  scheduledSendAt: string | null;
  closedAt: string | null;
  questionsLocked: boolean;
  healthContext: SurveyHealthContext | null;
  analysisError: string | null;
  delivery: SurveyDetail["delivery"];
  publicUrl: string | null;
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

  const fetchSurveys = useCallback(async (opts?: { silent?: boolean }) => {
    const backendToFrontend = new Map(projects.filter((p) => p.backendProjectId).map((p) => [p.backendProjectId!, p.id]));
    if (backendToFrontend.size === 0) {
      setSurveys([]);
      setLoading(false);
      return;
    }

    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const items = await listGlobalSurveys();
      const relevant = items.filter((s) => backendToFrontend.has(String(s.projectId)));

      const detailById = new Map<number, SurveyDetail>();
      await Promise.all(
        relevant.map(async (s) => {
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
            status: detail?.status ?? s.status,
            source: detail?.source ?? s.source ?? "manual",
            trigger: s.trigger,
            sentDate: s.sentDate ?? s.scheduledSendAt ?? s.reviewDeadlineAt ?? "",
            responseCount: detail?.responseCount ?? s.responseCount,
            targetCount: s.targetCount,
            scores: detail?.scores ?? s.scores ?? undefined,
            themes: detail?.themes ?? s.themes ?? [],
            aiInsight: detail?.aiInsight ?? s.aiInsight ?? "",
            rawResponses: detail?.rawResponses ?? [],
            questions: detail?.questions ?? s.questions ?? [],
            reviewDeadlineAt: s.reviewDeadlineAt,
            scheduledSendAt: s.scheduledSendAt,
            closedAt: s.closedAt,
            questionsLocked: s.questionsLocked,
            healthContext: detail?.healthContext ?? null,
            analysisError: detail?.analysisError ?? null,
            delivery: detail?.delivery ?? null,
            publicUrl: detail?.publicUrl ?? s.publicUrl ?? null,
          };
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load surveys");
    } finally {
      if (!opts?.silent) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backedProjectIds]);

  useEffect(() => {
    void fetchSurveys();
  }, [fetchSurveys]);

  const waitingForBackground = surveys.some((s) => {
    if (s.status === "active") return true;
    if (s.status === "closed" && !s.scores) return true;
    if (s.status === "draft" && s.questions.length === 0) return true;
    if (s.status === "draft" && s.scheduledSendAt) {
      const sendAt = new Date(s.scheduledSendAt).getTime();
      return Number.isFinite(sendAt) && sendAt <= Date.now() + 60_000;
    }
    return false;
  });
  useEffect(() => {
    if (!waitingForBackground) return;
    const timer = window.setInterval(() => {
      void fetchSurveys({ silent: true });
    }, 3000);
    return () => window.clearInterval(timer);
  }, [waitingForBackground, fetchSurveys]);

  return { surveys, loading, error, refetch: fetchSurveys };
}
