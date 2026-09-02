import type { ActionSearchMode } from "./api";
import type { SurveyStatus } from "./api-survey";
import type { Action, Project, Survey } from "./types";

export const SUBSCORE_LABELS: Record<string, string> = {
  codeQuality: "Code Quality",
  cicdDeploymentHealth: "CI/CD",
  teamHealth: "Team Health",
  engineeringProcess: "Engineering Process",
  planningExecution: "Planning & Execution",
};

/**
 * Survey scoring uses the risk engine's full 7-category rubric (no Code Quality
 * merge - the AI scores security/reliability/maintainability independently from
 * survey answers, unlike the dashboard's frontend-only display merge above).
 */
export const SURVEY_CATEGORY_KEYS = [
  "security", "reliability", "maintainability", "cicdDeploymentHealth", "teamHealth", "engineeringProcess", "planningExecution",
] as const;

export const SURVEY_CATEGORY_LABELS: Record<string, string> = {
  security: "Security",
  reliability: "Reliability",
  maintainability: "Maintainability",
  cicdDeploymentHealth: "CI/CD & Deployment",
  teamHealth: "Team Health",
  engineeringProcess: "Engineering Process",
  planningExecution: "Planning & Execution",
};

/**
 * "Code Quality" isn't a score the backend computes - it's a frontend-only display merge of
 * the 3 code-quality-adjacent scores from the 7-score health engine (Security, Reliability,
 * Maintainability), so the dashboard can show 5 categories instead of 7. Equal weights for now
 * (no stated preference among the three); the 3 raw scores stay available for a hover/detail
 * breakdown - see CodeQualityBreakdown usage in Dashboard.tsx/ProjectsOverview.tsx.
 */
export function computeCodeQualityScore(subscores: { security: number; reliability: number; maintainability: number }): number {
  return Math.round((subscores.security + subscores.reliability + subscores.maintainability) / 3);
}

export interface DisplaySubscores {
  codeQuality: number;
  cicdDeploymentHealth: number;
  teamHealth: number;
  engineeringProcess: number;
  planningExecution: number;
}

/** The 7 raw scores, collapsed to the 5 categories actually shown on the dashboard. */
export function toDisplaySubscores(subscores: {
  security: number;
  reliability: number;
  maintainability: number;
  cicdDeploymentHealth: number;
  teamHealth: number;
  engineeringProcess: number;
  planningExecution: number;
}): DisplaySubscores {
  return {
    codeQuality: computeCodeQualityScore(subscores),
    cicdDeploymentHealth: subscores.cicdDeploymentHealth,
    teamHealth: subscores.teamHealth,
    engineeringProcess: subscores.engineeringProcess,
    planningExecution: subscores.planningExecution,
  };
}

type SeriesPoint = { v: number; label: string; date?: string };

/**
 * Merges the security/reliability/maintainability trend series into one "Code Quality"
 * trend, point-by-point average - all subscore series share the same snapshot-history
 * index alignment, so this just zips and averages them.
 */
export function computeCodeQualitySeries(subscoreSeries: Record<string, SeriesPoint[]>): SeriesPoint[] {
  const sec = subscoreSeries.security ?? [];
  const rel = subscoreSeries.reliability ?? [];
  const main = subscoreSeries.maintainability ?? [];
  const len = Math.max(sec.length, rel.length, main.length);
  const out: SeriesPoint[] = [];
  for (let i = 0; i < len; i++) {
    const s = sec[i], r = rel[i], m = main[i];
    const vals = [s?.v, r?.v, m?.v].filter((v): v is number => typeof v === "number");
    if (vals.length === 0) continue;
    out.push({
      v: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
      label: s?.label ?? r?.label ?? m?.label ?? "",
      date: s?.date ?? r?.date ?? m?.date,
    });
  }
  return out;
}

export function scoreInt(n: number): number {
  return Math.round(Number.isFinite(n) ? n : 0);
}
export function trendLabel(n: number): string {
  const v = Math.round(n * 10) / 10;
  return `${v > 0 ? "+" : ""}${v}`;
}
export function hColor(s: number) {
  if (s >= 80) return "var(--health-good)";
  if (s >= 60) return "var(--health-warn)";
  return "var(--health-crit)";
}
export function hClass(s: number) {
  if (s >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (s >= 60) return "text-amber-500 dark:text-amber-400";
  return "text-red-500 dark:text-red-400";
}

export const ttStyle = {
  backgroundColor:"var(--card)", border:"1px solid var(--border)", borderRadius:0,
  fontSize:12, color:"var(--foreground)", fontFamily:"var(--font-mono)",
  boxShadow:"0 4px 20px rgba(0,0,0,0.15)",
};

/** Formats a date to YYYY-MM-DD in local time — used to key/compare series data by calendar day. */
export function isoDay(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Filters a date-keyed series down to the trailing N days (or returns it all when days is null). */
export function seriesInRange<T extends { date?: string }>(series: T[], days: number | null): T[] {
  if (days == null || series.length === 0) return series;
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const cutoffIso = isoDay(cutoff);
  const dated = series.filter((p) => p.date && p.date >= cutoffIso);
  if (dated.length > 0) return dated;
  return series.slice(-Math.min(series.length, days));
}

export function fmtDate(d: string) {
  if (!d) return "Not sent";
  const dt = new Date(d.length === 10 ? `${d}T00:00:00` : d);
  if (Number.isNaN(dt.getTime())) return "Not scheduled";
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Actions persist stable backend project ids; legacy rows may still contain the display slug. */
export function actionIncludesProject(action: Pick<Action, "projectIds">, project: Pick<Project, "id" | "backendProjectId">): boolean {
  return action.projectIds.includes(project.backendProjectId ?? project.id) || action.projectIds.includes(project.id);
}

export function triggerColor(trigger: string): string {
  if (/threshold|exceeded|dropped|declined/i.test(trigger)) return "text-amber-600 dark:text-amber-500";
  if (/manual|quarterly|pulse/i.test(trigger)) return "text-blue-600 dark:text-blue-400";
  return "text-muted-foreground";
}

export function projectTagStyle(score: number): { bg: string; text: string } {
  if (score >= 80) return { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-400" };
  if (score >= 60) return { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400" };
  return { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400" };
}

export function actionSearchModeLabel(mode: ActionSearchMode | null): string {
  if (mode === "rerank") return "Pinecone deep similarity results";
  if (mode === "lexical") return "Keyword results";
  return "Searching by relevance";
}

export function actionSimilarityLabel(similarity: number | undefined): string | null {
  if (similarity === undefined || !Number.isFinite(similarity)) return null;
  return `${Math.round(Math.max(0, Math.min(1, similarity)) * 100)}% similar`;
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1]! + 1,
        previous[rightIndex]! + 1,
        previous[rightIndex - 1]! + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length]!;
}

/** Lightweight local keyword matching with typo tolerance; it never invokes semantic search. */
export function actionMatchesKeywordSearch(
  action: Pick<Action, "problem" | "reason" | "actionTaken">,
  query: string,
): boolean {
  const normalizedQuery = query.toLocaleLowerCase().trim().replace(/\s+/g, " ");
  if (!normalizedQuery) return true;
  const text = `${action.problem} ${action.reason} ${action.actionTaken}`.toLocaleLowerCase();
  if (text.includes(normalizedQuery)) return true;
  const words = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  const tokens = normalizedQuery.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (tokens.length === 0) return false;
  return tokens.every(token => words.some(word => {
    if (word.includes(token) || (word.length >= 3 && token.includes(word))) return true;
    const tolerance = token.length >= 8 ? 2 : token.length >= 4 ? 1 : 0;
    return tolerance > 0 && Math.abs(word.length - token.length) <= tolerance && editDistance(word, token) <= tolerance;
  }));
}

export const SURVEY_STATUS_CONFIG: Record<SurveyStatus, { c: string; l: string }> = {
  draft:{c:"text-slate-500",l:"Draft"},
  active:{c:"text-amber-500",l:"Active"},
  paused:{c:"text-orange-500",l:"Paused"},
  closed:{c:"text-slate-500",l:"Closed"},
  completed:{c:"text-emerald-600 dark:text-emerald-400",l:"Completed"},
  cancelled:{c:"text-slate-400",l:"Cancelled"},
  failed:{c:"text-red-500",l:"Failed"},
};

// Keep data and row actions in stable tracks. The table shell supplies horizontal
// scrolling below this width instead of letting Grid collapse labels into each other.
export const SURVEY_HISTORY_COLS = "110px 112px minmax(100px,1fr) 104px 88px 48px minmax(210px,max-content)";

export const surveyResponseRate = (survey: Pick<Survey, "responseCount" | "targetCount">) =>
  survey.targetCount > 0 ? Math.min(100, Math.round((survey.responseCount / survey.targetCount) * 100)) : 0;

export const surveyDeliveryChannels = (survey: Survey) =>
  Object.entries(survey.delivery?.channels ?? {}).filter(([, sent]) => sent).map(([channel]) => channel.replace("Sent", "")).join(", ");

export function surveyHasResults(s: Survey) {
  return Boolean(s.scores || s.aiInsight || s.themes.length > 0 || s.status === "completed");
}

export function surveyCanExpand(s: Survey) {
  return surveyHasResults(s) || (s.questions?.length ?? 0) > 0;
}

export function surveyRowStatus(s: Survey) {
  if (s.status === "closed" && !s.scores) return { c: "text-amber-500", l: "Scoring" };
  if (s.status === "draft" && (s.questions?.length ?? 0) === 0) return { c: "text-slate-500", l: "Generating" };
  return SURVEY_STATUS_CONFIG[s.status];
}
