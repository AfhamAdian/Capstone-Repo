import { useCallback, useEffect, useState } from "react";
import {
  listProjectSurveys,
  getSurveyDetail,
  type SurveyDetail,
} from "../api-survey";
import type { FrontendSurvey } from "./useSurveys";

interface ProjectIdentity {
  id: string;
  backendProjectId?: string;
}

/**
 * Same shape as useSurveys, but scoped to a single project via the
 * project-level list endpoint instead of fetching every project's surveys
 * and filtering client-side. Use this for the per-project Surveys page;
 * useSurveys (global) is still what the portfolio-wide views need.
 */
export function useProjectSurveys(project: ProjectIdentity) {
  const [surveys, setSurveys] = useState<FrontendSurvey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const backendProjectId = project.backendProjectId;

  const fetchSurveys = useCallback(async (opts?: { silent?: boolean }) => {
    if (!backendProjectId) {
      setSurveys([]);
      setLoading(false);
      return;
    }

    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const items = await listProjectSurveys(backendProjectId);

      const detailById = new Map<number, SurveyDetail>();
      await Promise.all(
        items.map(async (s) => {
          try {
            detailById.set(s.id, await getSurveyDetail(s.id));
          } catch {
            // Missing detail for one survey shouldn't break the whole list - it just renders without scores/insight.
          }
        }),
      );

      setSurveys(
        items.map((s) => {
          const detail = detailById.get(s.id);
          return {
            id: String(s.id),
            projectId: project.id,
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
  }, [backendProjectId, project.id]);

  useEffect(() => {
    void fetchSurveys();
  }, [fetchSurveys]);

  // Same rationale as useSurveys: "active" is long-lived (up to 15 days), not a
  // short background job, so it's excluded from the fast poll - use the Refresh
  // button for that. Only the genuinely transient states below auto-poll.
  const waitingForBackground = surveys.some((s) => {
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
