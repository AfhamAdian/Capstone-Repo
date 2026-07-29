import { API_BASE_URL } from "./api";

// ─── Shared shapes (mirror backend/apps/api/src/services/survey.service.ts) ──

export type SurveyStatus = "active" | "sent" | "completed";

export interface SurveyScores {
  delivery: number;
  codeQuality: number;
  cicd: number;
  teamHealth: number;
  blockers: number;
}

export interface SurveyListItem {
  id: number;
  projectId: number;
  projectName: string;
  status: SurveyStatus;
  trigger: string;
  sentDate: string;
  responseCount: number;
  targetCount: number;
  firstSentAt: string | null;
  questionsModifiedAt: string | null;
  questionsLocked: boolean;
}

export interface SurveyDetail extends SurveyListItem {
  scores: SurveyScores | null;
  themes: string[];
  aiInsight: string | null;
  rawResponses: { question: string; answers: string[] }[];
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

export interface SurveyScheduleRound {
  round: 1 | 2;
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
  bundleId: number;
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}) as { message?: string });
    throw new Error(err.message || `Request failed (${response.status})`);
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
): Promise<ScoredSurveyQuestion[]> {
  const data = await request<{ questions: ScoredSurveyQuestion[] }>(
    `/projects/${projectId}/surveys/generate-questions`,
    { method: "POST", headers: requesterHeaders(ctx), body: JSON.stringify({ trigger, customGuidance }) },
  );
  return data.questions;
}

export async function sendSurvey(
  projectId: string,
  trigger: string,
  customGuidance: string | undefined,
  questions: GeneratedSurveyQuestion[],
  ctx?: RequesterContext,
): Promise<{ surveyId: number }> {
  return request(`/projects/${projectId}/surveys`, {
    method: "POST",
    headers: requesterHeaders(ctx),
    body: JSON.stringify({ trigger, customGuidance, questions }),
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

export async function getSurveyQuota(projectId: string): Promise<SurveyQuota> {
  return request(`/projects/${projectId}/surveys/quota`);
}

export async function getSurveySchedule(projectId: string): Promise<SurveyScheduleRound[]> {
  const data = await request<{ schedule: SurveyScheduleRound[] }>(`/projects/${projectId}/surveys/schedule`);
  return data.schedule;
}

export async function getPendingSurvey(projectId: string): Promise<PendingSurveySignal> {
  return request(`/projects/${projectId}/pending-survey`);
}

// ─── Public (anonymous, token-driven) endpoints ───────────────────────────

export async function getPublicSurvey(token: string): Promise<PublicSurveyForm> {
  return request(`/public/surveys/${token}`);
}

export async function submitPublicSurveyResponse(token: string, answers: SubmittedAnswer[]): Promise<void> {
  await request(`/public/surveys/${token}/responses`, { method: "POST", body: JSON.stringify({ answers }) });
}
