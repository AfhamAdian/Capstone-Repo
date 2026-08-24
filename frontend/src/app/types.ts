import type { GeneratedSurveyQuestion, SurveyHealthContext, SurveyStatus } from "./api-survey";

export interface Project {
  id: string;
  backendProjectId?: string;
  name: string;
  owner?: string | null;
  repo?: string | null;
  team: string;
  status: "active" | "maintenance";
  tracked: boolean;
  score: number;
  scoreTrend: number;
  sparkline: { v: number }[];
  timeSeries: { date: string; label: string; score: number }[];
  subscores: { delivery: number; codeQuality: number; cicd: number; teamHealth: number; blockers: number };
  metrics: { commits: number; ticketsClosed: number; sprintVelocity: number; openBlockers: number; deployments: number; prCycleTime: number };
  metricSeries: Record<string, { v: number; label: string; date?: string }[]>;
  subscoreSeries: Record<string, { v: number; label: string; date?: string }[]>;
  pendingSurvey: boolean;
  pendingReview: number;
  lastUpdated: string;
  description: string;
  hasData?: boolean;
  hasMetrics?: boolean;
}

export interface Action {
  id: string;
  projectIds: string[];
  problem: string;
  reason: string;
  actionTaken: string;
  timestamp: string;
  effectiveness: number | null;
  loggedBy: string;
  similarity?: number;
}

export interface Survey {
  id: string;
  projectId: string;
  status: SurveyStatus;
  source?: "manual" | "auto_pulse";
  trigger: string;
  sentDate: string;
  responseCount: number;
  targetCount: number;
  scores?: { delivery: number; codeQuality: number; cicd: number; teamHealth: number; blockers: number };
  themes: string[];
  aiInsight: string;
  rawResponses: { question: string; answers: string[] }[];
  questions?: GeneratedSurveyQuestion[];
  reviewDeadlineAt?: string | null;
  scheduledSendAt?: string | null;
  closedAt?: string | null;
  questionsLocked?: boolean;
  healthContext?: SurveyHealthContext | null;
  analysisError?: string | null;
  publicUrl?: string | null;
  delivery?: {
    notifiedAt: string | null;
    expiresAt: string;
    channels: { slackSent?: boolean; telegramSent?: boolean; discordSent?: boolean };
  } | null;
}
