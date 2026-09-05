import { API_BASE_URL } from "./api";

// ─── Shared shapes (mirror backend/apps/api/src/services/survey.service.ts) ──

export type SurveyStatus =
  | "draft"
  | "active"
  | "paused"
  | "closed"
  | "completed"
  | "cancelled"
  | "failed";

export type SurveySource = "manual" | "auto_pulse";

export interface SurveyScores {
  security: number;
  reliability: number;
  maintainability: number;
  cicdDeploymentHealth: number;
  teamHealth: number;
  engineeringProcess: number;
  planningExecution: number;
}

export interface SurveyListItem {
  id: number;
  projectId: number;
  projectName: string;
  status: SurveyStatus;
  source: SurveySource;
  trigger: string;
  sentDate: string | null;
  responseCount: number;
  targetCount: number;
  reviewDeadlineAt: string | null;
  scheduledSendAt: string | null;
  closedAt: string | null;
  questionVersion: number;
  questionsLocked: boolean;
  questions: Array<{ id: number; category: string; questionText: string; questionType: "text" | "scale" }>;
  scores: SurveyScores | null;
  themes: string[];
  aiInsight: string | null;
  questionSummaries: { question: string; summary: string }[];
  publicUrl: string | null;
}

export type HealthTrendLabel = "steady" | "gradual_increase" | "gradual_decrease" | "sharp_increase" | "sharp_decrease" | "unknown";

export interface CategoryTrend {
  delta: number | null;
  label: HealthTrendLabel;
}

export type SurveyCategoryKey = "security" | "reliability" | "maintainability" | "cicdDeploymentHealth" | "teamHealth" | "engineeringProcess" | "planningExecution";

export interface SurveyHealthContext {
  capturedAt: string;
  overallScore: number | null;
  scores: Record<SurveyCategoryKey, number | null>;
  metricsSnapshotId: number | null;
  source: "risk_score" | "unavailable";
  trend?: Record<"overall" | SurveyCategoryKey, CategoryTrend> & { previousCapturedAt: string | null };
  incidents?: {
    snapshotId: number | null;
    snapshotTime: string | null;
    spilloverRatio: number | null;
    consecutiveSpilloverCount: number | null;
    blockedItemsCount: number | null;
    overdueItemsCount: number | null;
    scopeChurnRatio: number | null;
    midSprintAdditions: number | null;
    deploymentsPerWeek: number | null;
    deploymentFailureRatePercent: number | null;
    pipelineSuccessRatePercent: number | null;
    stalePrCount: number | null;
    prCycleTimeHours: number | null;
    commitsPerWeek: number | null;
  } | null;
}

export interface SurveyDetail extends SurveyListItem {
  rawResponses: { question: string; answers: string[] }[];
  healthContext: SurveyHealthContext | null;
  analysisError: string | null;
  delivery: {
    notifiedAt: string | null;
    expiresAt: string;
    channels: { slackSent?: boolean; telegramSent?: boolean; discordSent?: boolean };
  } | null;
}

export interface QuestionScore {
  relevance: number;
  clarity: number;
  importance: number;
  diversity: number;
  overall: number;
  reason?: string;
}

export interface GeneratedSurveyQuestion {
  category: string;
  questionText: string;
  questionType: "text" | "scale";
}

export interface ScoredSurveyQuestion extends GeneratedSurveyQuestion {
  score: QuestionScore;
}

export interface SurveyQuota {
  used: number;
  limit: number;
  remaining: number;
}

export interface SurveySchedule {
  scheduledSendAt: string;
  status: "pending" | "questions_ready" | "sent";
  surveyId: number | null;
}

export interface PendingSurveySignal {
  pendingSurvey: boolean;
  trigger: string | null;
}

// ─── Public (anonymous) shapes ────────────────────────────────────────────

export interface PublicSurveyQuestion {
  id: number;
  category: string;
  text: string;
  type: "text" | "scale";
}

export interface PublicSurveyProject {
  projectId: number;
  projectName: string;
  questions: PublicSurveyQuestion[];
}

export interface PublicSurveyForm {
  projects: PublicSurveyProject[];
}

export interface SubmittedAnswer {
  questionId: number;
  answerText?: string;
  answerScale?: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

interface RequesterContext {
  role?: string | null;
  userId?: number | null;
}

/**
 * TEMPORARY: there's no login/session system in this frontend yet, so there's
 * no real role or user id to send. The backend's project-scoped checks accept
 * a "level1" role as a bypass (see backend/apps/api/src/services/authorization.service.ts),
 * so every call defaults to that until real auth exists. Replace this - and
 * only this - once a session is available.
 */
const DEMO_REQUESTER_ROLE = "level1";

function requesterHeaders(ctx?: RequesterContext): Record<string, string> {
  const headers: Record<string, string> = { "x-user-role": ctx?.role ?? DEMO_REQUESTER_ROLE };
  if (ctx?.userId != null) headers["x-user-id"] = String(ctx.userId);
  return headers;
}

function readApiError(body: unknown, status: number): string {
  if (!body || typeof body !== "object") return `Request failed (${status})`;
  const record = body as Record<string, unknown>;
  const top = typeof record.message === "string" ? record.message.trim() : "";
  if (top) {
    try {
      const nested = JSON.parse(top) as { error?: { message?: string; status?: string } };
      const inner = nested.error?.message?.trim() || nested.error?.status;
      if (inner) return inner;
    } catch {
      return top;
    }
    return top;
  }
  const nested = record.error;
  if (nested && typeof nested === "object") {
    const inner = nested as Record<string, unknown>;
    if (typeof inner.message === "string" && inner.message.trim()) return inner.message;
    if (typeof inner.status === "string" && inner.status.trim()) return inner.status;
  }
  return `Request failed (${status})`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...requesterHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => null);
    throw new Error(readApiError(err, response.status));
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

// ─── Admin endpoints ───────────────────────────────────────────────────────

export async function generateSurveyQuestions(
  projectId: string,
  trigger: string,
  customGuidance: string | undefined,
  ctx?: RequesterContext,
  force = false,
): Promise<{ surveyId: number; questions: ScoredSurveyQuestion[]; scheduledSendAt: string }> {
  return request(
    `/projects/${projectId}/surveys/generate-questions`,
    { method: "POST", headers: requesterHeaders(ctx), body: JSON.stringify({ trigger, customGuidance, force }) },
  );
}

export async function sendSurvey(
  projectId: string,
  trigger: string,
  customGuidance: string | undefined,
  questions: GeneratedSurveyQuestion[],
  ctx?: RequesterContext,
  targetCount?: number,
  surveyId?: number,
): Promise<{ surveyId: number }> {
  return request(`/projects/${projectId}/surveys`, {
    method: "POST",
    headers: requesterHeaders(ctx),
    body: JSON.stringify({ trigger, customGuidance, questions, targetCount, surveyId }),
  });
}

export interface SendSurveyNowResult {
  surveyId: number;
  queued?: boolean;
  url?: string;
  questionCount?: number;
  targetCount?: number;
  expiresAt?: string;
  delivery?: { slackSent: boolean; telegramSent: boolean; discordSent: boolean };
}

/** Queues background question generation and delivery. */
export async function sendSurveyNow(
  projectId: string,
  trigger?: string,
  customGuidance?: string,
  ctx?: RequesterContext,
): Promise<SendSurveyNowResult> {
  return request(`/projects/${projectId}/surveys/send-now`, {
    method: "POST",
    headers: requesterHeaders(ctx),
    body: JSON.stringify({ trigger, customGuidance }),
  });
}

export async function listProjectSurveys(projectId: string): Promise<SurveyListItem[]> {
  const data = await request<{ surveys: SurveyListItem[] }>(`/projects/${projectId}/surveys`);
  return data.surveys;
}

export async function listGlobalSurveys(filters?: { projectId?: string; status?: SurveyStatus; q?: string }): Promise<SurveyListItem[]> {
  const params = new URLSearchParams();
  if (filters?.projectId) params.set("projectId", filters.projectId);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.q) params.set("q", filters.q);
  const qs = params.toString();
  const data = await request<{ surveys: SurveyListItem[] }>(`/surveys${qs ? `?${qs}` : ""}`);
  return data.surveys;
}

export async function getSurveyDetail(surveyId: number): Promise<SurveyDetail> {
  return request(`/surveys/${surveyId}`);
}

export async function updateSurveyQuestions(
  surveyId: number,
  questions: GeneratedSurveyQuestion[],
  ctx?: RequesterContext,
): Promise<void> {
  await request(`/surveys/${surveyId}/questions`, {
    method: "PATCH",
    headers: requesterHeaders(ctx),
    body: JSON.stringify({ questions }),
  });
}

export async function completeSurvey(surveyId: number, ctx?: RequesterContext): Promise<void> {
  await request(`/surveys/${surveyId}/complete`, { method: "PATCH", headers: requesterHeaders(ctx) });
}

/** Closes an active public form and queues background AI scoring. */
export async function closeSurvey(surveyId: number, ctx?: RequesterContext): Promise<void> {
  await request(`/surveys/${surveyId}/close`, { method: "POST", headers: requesterHeaders(ctx) });
}

export async function remindSurvey(surveyId: number, ctx?: RequesterContext): Promise<void> {
  await request(`/surveys/${surveyId}/remind`, { method: "POST", headers: requesterHeaders(ctx) });
}

export async function getSurveyQuota(projectId: string): Promise<SurveyQuota> {
  return request(`/projects/${projectId}/surveys/quota`);
}

export async function getSurveySchedule(projectId: string): Promise<SurveySchedule[]> {
  const data = await request<{ schedule: SurveySchedule[] }>(`/projects/${projectId}/surveys/schedule`);
  return data.schedule;
}

export async function getPendingSurvey(projectId: string): Promise<PendingSurveySignal> {
  return request(`/projects/${projectId}/pending-survey`);
}

export async function changeSurveyLifecycle(
  surveyId: number,
  action: "pause" | "resume" | "retry" | "cancel" | "close",
  ctx?: RequesterContext,
): Promise<void> {
  await request(`/surveys/${surveyId}/lifecycle`, {
    method: "PATCH",
    headers: requesterHeaders(ctx),
    body: JSON.stringify({ action }),
  });
}

// ─── Public (anonymous, token-driven) endpoints ───────────────────────────

export async function getPublicSurvey(token: string): Promise<PublicSurveyForm> {
  return request(`/public/surveys/${token}`);
}

export async function submitPublicSurveyResponse(
  token: string,
  submissionId: string,
  answers: SubmittedAnswer[],
): Promise<void> {
  await request(`/public/surveys/${token}/responses`, {
    method: "POST",
    body: JSON.stringify({ submissionId, answers }),
  });
}
