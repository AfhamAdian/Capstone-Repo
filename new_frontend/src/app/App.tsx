import { useState, useMemo, useRef, useEffect, useCallback, type MouseEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { paths, pathFromScreen, screenFromPath, type AppScreen } from "./app-paths";
import {
  TrendingUp, TrendingDown, Minus, Search, Plus, Moon, Sun,
  BarChart2, Activity, AlertTriangle, Users,
  MessageSquare, X, ChevronRight, ChevronDown, Send,
  GitCommit, ArrowRight, Check, Settings,
  ChevronLeft, Bell, Zap, Star, RefreshCw, CheckSquare,
  Rocket, GitBranch, Bookmark, Link2, ShieldCheck, Building2, Sparkles, AlertCircle
} from "lucide-react";
import {
  LineChart, Line, AreaChart, Area, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, ResponsiveContainer, Tooltip as ReTooltip,
  Brush, XAxis, YAxis, ComposedChart, CartesianGrid, ReferenceLine
} from "recharts";
import { motion, AnimatePresence } from "motion/react";
import { useWorkspace, type VcsProvider } from "./context/WorkspaceContext";
import {
  createAction, listActions, listProjects, rateAction, searchActions,
  type ActionSearchMode, type SyncRiskKey,
} from "./api";
import { useSurveys } from "./hooks/useSurveys";
import { useProjectSurveySettings } from "./hooks/useProjectSurveySettings";
import { useBackendProjects, findProjectByPath } from "./hooks/useProjectHealth";
import { PublicSurveyPage } from "./pages/PublicSurveyPage";
import { SurveyFlow } from "./components/SurveyFlow";
import {
  changeSurveyLifecycle, generateSurveyQuestions, getSurveyQuota,
  updateSurveyQuestions, closeSurvey, sendSurvey, remindSurvey,
  type GeneratedSurveyQuestion, type SurveyHealthContext, type SurveyQuota,
  type QuestionScore, type SurveyStatus,
} from "./api-survey";
import { LoginView } from "./pages/LoginView";
import { RegisterView } from "./pages/RegisterView";
import { ForgotPasswordView } from "./pages/ForgotPasswordView";
import { ResetPasswordView } from "./pages/ResetPasswordView";
import { ProjectsView } from "./pages/ProjectsView";
import { AddProjectView } from "./pages/AddProjectView";
import { WorkspaceSelectionView } from "./pages/WorkspaceSelectionView";
import { CreateWorkspaceView } from "./pages/CreateWorkspaceView";
import { VcsWorkspaceView } from "./pages/VcsWorkspaceView";
import { DashboardSyncBar } from "./components/DashboardSyncBar";
import { useDashboardSync } from "./hooks/useDashboardSync";

// ─── TYPES ─────────────────────────────────────────────────────────────────

interface Project {
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

interface Action {
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

interface Survey {
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

const SURVEY_STATUS_CONFIG:Record<SurveyStatus,{c:string;l:string}>={
  draft:{c:"text-slate-500",l:"Draft"},
  active:{c:"text-amber-500",l:"Active"},
  paused:{c:"text-orange-500",l:"Paused"},
  closed:{c:"text-slate-500",l:"Closed"},
  completed:{c:"text-emerald-600 dark:text-emerald-400",l:"Completed"},
  cancelled:{c:"text-slate-400",l:"Cancelled"},
  failed:{c:"text-red-500",l:"Failed"},
};
const surveyResponseRate=(survey:Pick<Survey,"responseCount"|"targetCount">)=>
  survey.targetCount>0?Math.min(100,Math.round((survey.responseCount/survey.targetCount)*100)):0;
const surveyDeliveryChannels=(survey:Survey)=>
  Object.entries(survey.delivery?.channels??{}).filter(([,sent])=>sent).map(([channel])=>channel.replace("Sent","")).join(", ");

function CloseSurveyFormButton({surveyId,onClosed,mode}:{surveyId:string;onClosed?:()=>void;mode?:"close"|"score";}) {
  const [busy,setBusy]=useState(false);
  const closeForm=async(event:MouseEvent)=>{
    event.stopPropagation();
    setBusy(true);
    try{
      await closeSurvey(Number(surveyId));
      onClosed?.();
    }catch(error){
      window.alert(error instanceof Error?error.message:"Failed to close survey");
    }finally{
      setBusy(false);
    }
  };
  const idleLabel=mode==="score"?"Retry scoring":"Close form";
  return (
    <button type="button" disabled={busy} onClick={event=>{void closeForm(event);}}
      className="shrink-0 whitespace-nowrap text-xs font-semibold border border-amber-500/50 text-amber-700 dark:text-amber-400 px-2 py-1 hover:bg-amber-50 dark:hover:bg-amber-950/30 disabled:opacity-50">
      {busy?"Closing…":idleLabel}
    </button>
  );
}

function CopySurveyLinkButton({url}:{url:string}) {
  const [copied,setCopied]=useState(false);
  const copy=async(event:MouseEvent)=>{
    event.stopPropagation();
    try{
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(()=>setCopied(false),1600);
    }catch{
      window.alert("Could not copy the survey link");
    }
  };
  return (
    <button type="button" title={copied?"Copied":"Copy survey link"} onClick={event=>{void copy(event);}}
      className="shrink-0 border border-border px-1.5 py-1 text-muted-foreground hover:text-primary hover:border-primary">
      {copied?<Check size={13}/>:<Link2 size={13}/>}
    </button>
  );
}

function RemindSurveyButton({surveyId,onDone}:{surveyId:string;onDone?:()=>void;}) {
  const [busy,setBusy]=useState(false);
  const remind=async(event:MouseEvent)=>{
    event.stopPropagation();
    setBusy(true);
    try{
      await remindSurvey(Number(surveyId));
      onDone?.();
    }catch(error){
      window.alert(error instanceof Error?error.message:"Failed to send reminder");
    }finally{
      setBusy(false);
    }
  };
  return (
    <button type="button" disabled={busy} title="Post an anonymous reminder to team channels" onClick={event=>{void remind(event);}}
      className="shrink-0 whitespace-nowrap text-xs font-semibold border border-border px-2 py-1 text-foreground hover:border-primary hover:text-primary disabled:opacity-50">
      {busy?"Sending…":"Remind"}
    </button>
  );
}

type Screen = AppScreen;

function actionSearchModeLabel(mode:ActionSearchMode|null):string {
  if(mode==="hybrid")return "Hybrid semantic + keyword results";
  if(mode==="semantic")return "Semantic similarity results";
  if(mode==="lexical")return "Keyword fallback results";
  return "Searching by relevance";
}

function actionSimilarityLabel(similarity:number|undefined):string|null {
  if(similarity===undefined||!Number.isFinite(similarity))return null;
  return `${Math.round(Math.max(0,Math.min(1,similarity))*100)}% similar`;
}

function surveyHasResults(s: Survey) {
  return Boolean(s.scores || s.aiInsight || s.themes.length > 0 || s.status === "completed");
}

function surveyCanExpand(s: Survey) {
  return surveyHasResults(s) || (s.questions?.length ?? 0) > 0;
}

function surveyRowStatus(s: Survey) {
  if (s.status === "closed" && !s.scores) return { c: "text-amber-500", l: "Scoring" };
  if (s.status === "draft" && (s.questions?.length ?? 0) === 0) return { c: "text-slate-500", l: "Generating" };
  return SURVEY_STATUS_CONFIG[s.status];
}

const SURVEY_HISTORY_COLS = "110px 120px minmax(0,1fr) 120px 88px 56px minmax(220px,max-content)";

function SurveyAskedQuestions({questions}:{questions?:GeneratedSurveyQuestion[]}) {
  if (!questions?.length) return null;
  return (
    <div className="mb-4">
      <div className="text-sm font-bold text-muted-foreground mb-3">Questions asked</div>
      <div className="border border-border divide-y divide-border">
        {questions.map((q,i)=>(
          <div key={`${q.questionText}-${i}`} className="flex gap-3 px-4 py-3 items-start">
            <span className="shrink-0 w-5 h-5 flex items-center justify-center bg-muted text-xs font-bold mt-0.5">{i+1}</span>
            <div className="min-w-0">
              <div className="text-[14px] font-semibold text-foreground">{q.questionText}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{q.category} · {q.questionType==="scale"?"Scale 1–5":"Text"}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SurveyCategoryScores({scores}:{scores:NonNullable<Survey["scores"]>}) {
  const keys = ["delivery","codeQuality","cicd","teamHealth","blockers"] as const;
  return (
    <div className="grid grid-cols-5 gap-2 mb-4">
      {keys.map((k)=>(
        <div key={k} className="border border-border px-2 py-2 text-center">
          <div className="text-[10px] font-semibold text-muted-foreground mb-1 leading-tight">{SUBSCORE_LABELS[k]}</div>
          <div className="text-lg font-bold tabular-nums" style={{fontFamily:"var(--font-mono)",color:hColor(scores[k])}}>{scores[k]}</div>
        </div>
      ))}
    </div>
  );
}

// ─── MOCK DATA ──────────────────────────────────────────────────────────────

function isoDay(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function formatDayLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function interpolateSeries(vals: number[], days: number): number[] {
  if (vals.length === 0) return [];
  if (days <= 1) return [vals[vals.length - 1]!];
  const out: number[] = [];
  for (let i = 0; i < days; i++) {
    const t = i / (days - 1);
    const src = t * (vals.length - 1);
    const lo = Math.floor(src);
    const hi = Math.min(vals.length - 1, lo + 1);
    const frac = src - lo;
    out.push(Math.round(vals[lo]! * (1 - frac) + vals[hi]! * frac));
  }
  return out;
}
function daysEndingToday(count: number): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (count - 1 - i));
    return d;
  });
}

/** Daily series ending today so 7D / 30D / All filters match the calendar. */
const sp = (vals: number[], days = 90): { v: number; label: string; date: string }[] => {
  const points = interpolateSeries(vals, days);
  const dates = daysEndingToday(points.length);
  return points.map((v, i) => ({ v, label: formatDayLabel(dates[i]!), date: isoDay(dates[i]!) }));
};

const mkTS = (scores: number[], days = 90): { date: string; label: string; score: number }[] => {
  const points = interpolateSeries(scores, days);
  const dates = daysEndingToday(points.length);
  return points.map((score, i) => ({ date: isoDay(dates[i]!), label: formatDayLabel(dates[i]!), score }));
};

function seriesInRange<T extends { date?: string }>(series: T[], days: number | null): T[] {
  if (days == null || series.length === 0) return series;
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const cutoffIso = isoDay(cutoff);
  const dated = series.filter((p) => p.date && p.date >= cutoffIso);
  if (dated.length > 0) return dated;
  return series.slice(-Math.min(series.length, days));
}

const PROJECTS: Project[] = [
  {
    id: "onyx-mobile", backendProjectId: "1", name: "Capstone-Repo", team: "mahmud1628/Discord-Messaging", status: "active", tracked: true,
    score: 45, scoreTrend: -8, description: "Real backend project #1 — synced from GitHub repo mahmud1628/Discord-Messaging",
    sparkline: [62,60,58,55,53,52,54,50,48,47,49,46,44,46,45].map(v=>({v})),
    timeSeries: mkTS([62,61,60,59,57,55,54,52,53,52,51,50,50,52,49,48,47,46,49,47,45,46,45,44,46,45,44,43,45,45]),
    subscores: { delivery: 38, codeQuality: 52, cicd: 42, teamHealth: 65, blockers: 25 },
    subscoreSeries: {
      delivery:    sp([58,56,54,52,50,48,47,46,44,43,42,41,40,38,38]),
      codeQuality: sp([65,64,63,62,61,60,59,58,57,56,55,54,53,52,52]),
      cicd:        sp([55,54,53,51,50,49,48,47,46,45,44,43,43,42,42]),
      teamHealth:  sp([75,74,73,72,71,70,69,68,67,66,66,66,65,65,65]),
      blockers:    sp([55,52,48,45,42,38,35,32,30,28,28,27,26,25,25]),
    },
    metrics: { commits: 12, ticketsClosed: 8, sprintVelocity: 34, openBlockers: 7, deployments: 3, prCycleTime: 48 },
    metricSeries: {
      commits: sp([18,20,16,14,15,13,12,14,11,12,10,12,11,12,12]),
      tickets: sp([15,14,13,12,11,10,9,10,8,9,8,9,8,8,8]),
      velocity: sp([52,50,48,46,44,42,40,38,37,36,35,34,34,35,34]),
      blockers: sp([2,2,3,3,4,5,5,6,6,6,7,7,7,7,7]),
      deployments: sp([7,6,6,5,5,4,4,4,3,3,3,3,3,3,3]),
      prCycleTime: sp([22,24,26,28,30,32,34,36,38,40,42,44,46,48,48]),
    },
    pendingSurvey: true, pendingReview: 2, lastUpdated: "2h ago",
  },
  {
    id: "meridian-api", backendProjectId: "2", name: "NiramoyAI", team: "AfhamAdian/NiramoyAI", status: "active", tracked: true,
    score: 62, scoreTrend: -5, description: "Real backend project #2 — synced from GitHub repo AfhamAdian/NiramoyAI",
    sparkline: [75,74,72,70,69,68,67,66,65,64,64,63,63,62,62].map(v=>({v})),
    timeSeries: mkTS([75,74,73,72,71,70,70,69,68,67,66,65,65,64,64,63,63,62,62,62,63,62,61,62,62,61,62,62,62,62]),
    subscores: { delivery: 68, codeQuality: 72, cicd: 58, teamHealth: 63, blockers: 45 },
    subscoreSeries: {
      delivery:    sp([78,77,76,75,74,74,73,72,72,71,71,70,69,68,68]),
      codeQuality: sp([80,80,79,78,78,77,77,76,76,75,75,74,74,72,72]),
      cicd:        sp([68,67,67,66,65,65,64,63,62,62,61,61,60,58,58]),
      teamHealth:  sp([70,70,69,69,68,68,67,67,66,66,65,65,64,63,63]),
      blockers:    sp([60,58,56,54,52,51,50,50,49,48,47,47,46,45,45]),
    },
    metrics: { commits: 28, ticketsClosed: 21, sprintVelocity: 62, openBlockers: 4, deployments: 8, prCycleTime: 26 },
    metricSeries: {
      commits: sp([36,34,33,32,31,30,30,29,28,29,28,27,28,28,28]),
      tickets: sp([28,27,26,25,24,23,22,22,21,22,21,21,21,21,21]),
      velocity: sp([72,71,70,68,67,66,65,64,63,62,62,62,62,62,62]),
      blockers: sp([1,1,2,2,3,3,4,4,4,4,4,4,4,4,4]),
      deployments: sp([12,12,11,11,10,10,9,9,8,8,8,8,8,8,8]),
      prCycleTime: sp([18,19,20,21,22,23,24,25,26,26,26,26,26,26,26]),
    },
    pendingSurvey: false, pendingReview: 1, lastUpdated: "4h ago",
  },
  {
    id: "nexus-infra", name: "Nexus Infrastructure", team: "Platform Engineering", status: "maintenance", tracked: false,
    score: 68, scoreTrend: 3, description: "Cloud infrastructure, CI/CD, and observability stack",
    sparkline: [62,63,64,65,64,65,66,66,67,67,68,67,68,68,68].map(v=>({v})),
    timeSeries: mkTS([62,63,63,64,64,65,65,65,65,66,66,66,67,67,67,67,68,68,67,68,68,67,68,68,68,68,68,68,68,68]),
    subscores: { delivery: 55, codeQuality: 78, cicd: 70, teamHealth: 79, blockers: 60 },
    subscoreSeries: {
      delivery:    sp([45,46,47,47,48,49,49,50,51,51,52,53,54,54,55]),
      codeQuality: sp([72,73,73,74,74,75,75,76,76,77,77,77,78,78,78]),
      cicd:        sp([62,63,63,64,65,65,66,67,67,68,68,69,69,70,70]),
      teamHealth:  sp([74,74,75,75,76,76,77,77,77,78,78,78,79,79,79]),
      blockers:    sp([52,53,54,54,55,55,56,56,57,57,58,58,59,60,60]),
    },
    metrics: { commits: 9, ticketsClosed: 15, sprintVelocity: 48, openBlockers: 2, deployments: 5, prCycleTime: 18 },
    metricSeries: {
      commits: sp([7,8,8,9,9,9,9,9,9,9,9,9,9,9,9]),
      tickets: sp([11,12,12,13,13,14,14,14,15,15,15,15,15,15,15]),
      velocity: sp([42,44,44,45,46,46,47,47,48,48,48,48,48,48,48]),
      blockers: sp([4,4,3,3,3,3,2,2,2,2,2,2,2,2,2]),
      deployments: sp([4,4,4,5,5,5,5,5,5,5,5,5,5,5,5]),
      prCycleTime: sp([22,22,21,20,20,19,19,19,18,18,18,18,18,18,18]),
    },
    pendingSurvey: false, pendingReview: 0, lastUpdated: "1d ago",
  },
  {
    id: "forge-devtools", name: "Forge DevTools", team: "Developer Experience", status: "active", tracked: true,
    score: 78, scoreTrend: 4, description: "Internal developer portal, CLIs, and tooling ecosystem",
    sparkline: [70,71,72,72,73,73,74,75,74,75,76,76,77,77,78].map(v=>({v})),
    timeSeries: mkTS([70,70,71,71,72,72,72,73,73,73,74,74,74,75,75,75,75,76,76,76,76,77,77,77,77,78,78,78,78,78]),
    subscores: { delivery: 82, codeQuality: 85, cicd: 75, teamHealth: 75, blockers: 70 },
    subscoreSeries: {
      delivery:    sp([75,76,76,77,77,78,78,79,79,80,80,81,81,82,82]),
      codeQuality: sp([78,79,79,80,80,81,82,82,83,83,84,84,84,85,85]),
      cicd:        sp([68,69,69,70,70,71,71,72,73,73,74,74,75,75,75]),
      teamHealth:  sp([69,69,70,70,71,71,72,72,73,73,74,74,74,75,75]),
      blockers:    sp([62,63,64,64,65,65,66,66,67,67,68,69,69,70,70]),
    },
    metrics: { commits: 34, ticketsClosed: 29, sprintVelocity: 78, openBlockers: 1, deployments: 12, prCycleTime: 14 },
    metricSeries: {
      commits: sp([28,29,30,30,31,31,32,33,33,33,34,34,34,34,34]),
      tickets: sp([23,24,24,25,25,26,26,27,27,27,28,28,29,29,29]),
      velocity: sp([70,71,72,72,73,74,74,75,76,76,77,77,78,78,78]),
      blockers: sp([3,3,2,2,2,2,2,1,1,1,1,1,1,1,1]),
      deployments: sp([9,9,10,10,10,11,11,11,12,12,12,12,12,12,12]),
      prCycleTime: sp([18,17,17,16,16,16,15,15,15,14,14,14,14,14,14]),
    },
    pendingSurvey: false, pendingReview: 1, lastUpdated: "6h ago",
  },
  {
    id: "helix-platform", name: "Helix Platform", team: "Core Platform", status: "active", tracked: true,
    score: 87, scoreTrend: 2, description: "Multi-tenant SaaS platform core and orchestration layer",
    sparkline: [82,83,83,84,84,85,85,85,86,86,86,87,86,87,87].map(v=>({v})),
    timeSeries: mkTS([82,82,83,83,83,84,84,84,85,85,85,85,86,86,86,86,86,87,87,87,87,87,87,87,87,87,87,87,87,87]),
    subscores: { delivery: 88, codeQuality: 84, cicd: 88, teamHealth: 86, blockers: 90 },
    subscoreSeries: {
      delivery:    sp([84,84,85,85,85,86,86,86,87,87,87,87,88,88,88]),
      codeQuality: sp([80,81,81,81,82,82,82,83,83,83,84,84,84,84,84]),
      cicd:        sp([84,84,85,85,85,86,86,87,87,87,88,88,88,88,88]),
      teamHealth:  sp([82,82,83,83,83,84,84,84,85,85,85,85,86,86,86]),
      blockers:    sp([86,86,87,87,87,88,88,88,89,89,89,89,90,90,90]),
    },
    metrics: { commits: 52, ticketsClosed: 41, sprintVelocity: 94, openBlockers: 1, deployments: 18, prCycleTime: 10 },
    metricSeries: {
      commits: sp([46,47,48,48,49,49,50,50,51,51,52,52,52,52,52]),
      tickets: sp([36,37,37,38,38,39,39,40,40,41,41,41,41,41,41]),
      velocity: sp([88,89,89,90,91,91,92,92,93,93,93,94,94,94,94]),
      blockers: sp([2,2,2,1,1,1,1,1,1,1,1,1,1,1,1]),
      deployments: sp([14,15,15,15,16,16,17,17,17,18,18,18,18,18,18]),
      prCycleTime: sp([14,13,13,12,12,12,11,11,11,10,10,10,10,10,10]),
    },
    pendingSurvey: true, pendingReview: 0, lastUpdated: "30m ago",
  },
  {
    id: "compass-analytics", name: "Compass Analytics", team: "Data Products", status: "maintenance", tracked: false,
    score: 91, scoreTrend: 1, description: "Business intelligence, reporting, and data warehouse tooling",
    sparkline: [89,90,90,91,90,91,91,91,91,92,91,91,91,91,91].map(v=>({v})),
    timeSeries: mkTS([88,89,89,89,90,90,90,91,91,91,91,91,91,91,91,91,91,91,91,91,91,91,91,91,91,91,91,91,91,91]),
    subscores: { delivery: 90, codeQuality: 95, cicd: 87, teamHealth: 91, blockers: 88 },
    subscoreSeries: {
      delivery:    sp([88,88,88,89,89,89,89,89,90,90,90,90,90,90,90]),
      codeQuality: sp([93,93,93,93,94,94,94,94,95,95,95,95,95,95,95]),
      cicd:        sp([85,85,85,85,86,86,86,86,87,87,87,87,87,87,87]),
      teamHealth:  sp([89,89,90,90,90,90,91,91,91,91,91,91,91,91,91]),
      blockers:    sp([86,86,86,87,87,87,87,87,88,88,88,88,88,88,88]),
    },
    metrics: { commits: 18, ticketsClosed: 22, sprintVelocity: 86, openBlockers: 0, deployments: 6, prCycleTime: 12 },
    metricSeries: {
      commits: sp([17,17,18,18,18,18,18,18,18,18,18,18,18,18,18]),
      tickets: sp([20,21,21,21,22,22,22,22,22,22,22,22,22,22,22]),
      velocity: sp([84,85,85,85,86,86,86,86,86,86,86,86,86,86,86]),
      blockers: sp([1,1,1,0,0,0,0,0,0,0,0,0,0,0,0]),
      deployments: sp([5,5,6,6,6,6,6,6,6,6,6,6,6,6,6]),
      prCycleTime: sp([14,13,13,12,12,12,12,12,12,12,12,12,12,12,12]),
    },
    pendingSurvey: false, pendingReview: 0, lastUpdated: "3h ago",
  },
];

const ACTIONS: Action[] = [
  { id:"a1", projectIds:["onyx-mobile"], problem:"Sprint velocity collapsed after team reorganization", reason:"Two senior engineers moved to Helix team mid-sprint without adequate handoff", actionTaken:"Capacity buffer added; sprint scope reduced 30%; knowledge transfer sessions scheduled", timestamp:"2025-11-15", effectiveness:null, loggedBy:"Sarah Chen" },
  { id:"a2", projectIds:["onyx-mobile","meridian-api"], problem:"Blocked dependency from Backend Services unresolved for 3 weeks", reason:"API contract changes not communicated through standard channels", actionTaken:"Weekly cross-team sync established; dependency tracking board added", timestamp:"2025-10-28", effectiveness:3, loggedBy:"Marcus Webb" },
  { id:"a3", projectIds:["onyx-mobile"], problem:"Critical bug count in checkout flow up 40% week-over-week", reason:"Rushed feature launch skipped full QA cycle under deadline pressure", actionTaken:"Hotfix shipped; mandatory QA gate reinstated for all checkout-path changes", timestamp:"2025-10-10", effectiveness:4, loggedBy:"Sarah Chen" },
  { id:"a4", projectIds:["meridian-api"], problem:"P2 bug count in auth module rising over 4 sprints", reason:"Technical debt accumulated in auth layer during Q3 feature push", actionTaken:"Two-sprint stabilization declared; no new feature work in auth module", timestamp:"2025-11-10", effectiveness:null, loggedBy:"James Okafor" },
  { id:"a5", projectIds:["meridian-api"], problem:"Team morale survey flagged communication issues", reason:"Product direction changes communicated via Slack only, not in sprint planning", actionTaken:"Weekly all-hands reinstated; roadmap shared before each sprint", timestamp:"2025-10-15", effectiveness:4, loggedBy:"Sarah Chen" },
  { id:"a6", projectIds:["nexus-infra"], problem:"CI pipeline failure rate exceeded 15% of builds", reason:"Flaky integration tests accumulated over 6 months", actionTaken:"Reliability sprint allocated; 23 flaky tests fixed; build time reduced 18%", timestamp:"2025-10-22", effectiveness:5, loggedBy:"Priya Nair" },
  { id:"a7", projectIds:["forge-devtools"], problem:"Internal developer portal adoption stalled at 34%", reason:"Onboarding too complex; missing integrations with primary internal tools", actionTaken:"Onboarding redesign shipped; Jira and GitHub Actions integrations added", timestamp:"2025-11-01", effectiveness:null, loggedBy:"Marcus Webb" },
  { id:"a8", projectIds:["helix-platform"], problem:"Latency spike in tenant provisioning reported by 3 enterprise customers", reason:"Database query not optimized for new multi-region topology in v4.2", actionTaken:"Query optimization deployed; provisioning latency reduced 65%", timestamp:"2025-10-05", effectiveness:5, loggedBy:"James Okafor" },
];

const SURVEYS: Survey[] = [
  {
    id:"s1", projectId:"onyx-mobile", status:"completed",
    trigger:"Open blockers exceeded threshold (7)", sentDate:"2025-11-12",
    responseCount:5, targetCount:7,
    scores:{ delivery:35, codeQuality:50, cicd:40, teamHealth:62, blockers:22 },
    aiInsight:"Cross-team dependency on Backend Services is the primary drag. 4 of 5 respondents flagged the Meridian API contract as the root cause of stalled velocity.",
    themes:[
      "4 of 5 responses cite blocked dependency from Backend Services as the primary velocity killer.",
      "3 respondents report unclear sprint scope changes mid-cycle — expectations reset without notice.",
      "2 responses mention insufficient onboarding support for engineers new to the iOS codebase.",
    ],
    rawResponses:[
      {question:"What is your biggest blocker right now?",answers:["Waiting on Meridian API contract update","No clear owner for the auth SDK issue","Backend isn't responding to our tickets","Unclear requirements on the new checkout flow","The API dependency — it's been 3 weeks"]},
      {question:"How confident are you in this sprint's outcome? (1=low, 5=high)",answers:["2 — too much uncertainty right now","3","1 honestly, too much unresolved","3 if the dependency resolves this week","2"]},
      {question:"How clear were sprint goals at kickoff?",answers:["Not clear — scope changed twice after planning","Somewhat clear but shifted mid-sprint","Goals were fine, blockers killed execution","Clear enough at start, then things changed","Unclear from the beginning"]},
      {question:"What would most improve your team's velocity next sprint?",answers:["Resolve the Backend Services dependency first","Reduce interruptions from other teams","Clearer acceptance criteria before sprint starts","Dedicated time to pay down auth module debt","Stable requirements — no mid-sprint changes"]},
      {question:"Is there anything leadership should know?",answers:["The iOS auth rewrite has no clear owner since the reorg","Team morale is lower than it looks on paper","We need better tooling for async collaboration","The onboarding docs for new engineers are badly outdated","We're doing our best but the dependency issue is demoralizing"]},
    ],
  },
  {
    id:"s2", projectId:"onyx-mobile", status:"active",
    trigger:"Score declined >8 points in 30 days", sentDate:"2025-11-18",
    responseCount:2, targetCount:7, aiInsight:"", themes:[], rawResponses:[],
    publicUrl:"http://localhost:5173/survey/demo-link",
  },
  {
    id:"s3", projectId:"onyx-mobile", status:"completed",
    trigger:"Quarterly pulse (manual)", sentDate:"2025-10-01",
    responseCount:7, targetCount:7,
    scores:{ delivery:55, codeQuality:60, cicd:52, teamHealth:72, blockers:45 },
    aiInsight:"Team was stable in October but flagged early signs of capacity strain. Sprint goals were mostly clear; main concern was growing technical debt in the auth module.",
    themes:[
      "Most respondents felt October sprint goals were realistic and achievable.",
      "3 of 7 flagged growing technical debt as a future risk, not yet critical.",
      "Communication rated positively — weekly syncs were seen as effective.",
    ],
    rawResponses:[
      {question:"How is team morale this sprint?",answers:["Good","Pretty good","Fine, a bit tired","Good","Very good","OK","Good"]},
    ],
  },
  {
    id:"s4", projectId:"meridian-api", status:"completed",
    trigger:"Morale subscore dropped below 65", sentDate:"2025-10-14",
    responseCount:6, targetCount:8,
    scores:{ delivery:65, codeQuality:70, cicd:55, teamHealth:58, blockers:42 },
    aiInsight:"Communication gaps around product direction are causing morale issues. 5 of 6 respondents attributed low confidence to last-minute scope changes and lack of roadmap visibility.",
    themes:[
      "5 of 6 responses point to communication gaps around product direction as the root cause.",
      "3 respondents feel sprint goals are unclear at kickoff.",
      "2 responses express concern about the pace of technical debt accumulation.",
    ],
    rawResponses:[
      {question:"What would improve team effectiveness most?",answers:["Better upfront requirements before sprints","Clearer product priorities — the roadmap keeps shifting","Less context switching between features","Dedicated time for refactoring","Fewer last-minute scope changes","Regular 1:1s with leadership"]},
      {question:"How well is product direction being communicated?",answers:["Poorly — we hear about changes after decisions are made","OK within team, but cross-team context is missing","Async announcements don't work, we need sync discussions","Better than before but still reactive","Direction exists but isn't shared proactively","Could be much better — I feel like I'm guessing"]},
      {question:"Rate your current workload (1=manageable, 5=unsustainable)",answers:["4 — too many parallel streams","3","4","2 — fine for now","3 — depends on the week","4 — the auth stabilization adds a lot"]},
      {question:"What one thing would you change about how we work?",answers:["Agree on requirements before coding starts","Have a single prioritized backlog everyone can see","Weekly written update from product on direction","Pair programming more — knowledge is too siloed","Fix the CI flakiness — it kills momentum","Reserve 20% of each sprint for tech debt"]},
    ],
  },
  {
    id:"s5", projectId:"helix-platform", status:"draft",
    trigger:"Quarterly pulse (manual)", sentDate:"2025-11-17",
    responseCount:4, targetCount:10, aiInsight:"", themes:[], rawResponses:[],
  },
];

// ─── UTILITIES ──────────────────────────────────────────────────────────────

const SUBSCORE_LABELS: Record<string,string> = {
  delivery:"Delivery", codeQuality:"Code Quality", cicd:"CI/CD", teamHealth:"Team Health", blockers:"Blockers",
};

function hColor(s: number) {
  if (s >= 80) return "var(--health-good)";
  if (s >= 60) return "var(--health-warn)";
  return "var(--health-crit)";
}
function hClass(s: number) {
  if (s >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (s >= 60) return "text-amber-500 dark:text-amber-400";
  return "text-red-500 dark:text-red-400";
}
function TrendIcon({ t, sz=15 }: {t:number;sz?:number}) {
  if (t > 0) return <TrendingUp size={sz} className="text-emerald-500"/>;
  if (t < 0) return <TrendingDown size={sz} className="text-red-500"/>;
  return <Minus size={sz} className="text-muted-foreground"/>;
}

const ttStyle = {
  backgroundColor:"var(--card)", border:"1px solid var(--border)", borderRadius:0,
  fontSize:12, color:"var(--foreground)", fontFamily:"var(--font-mono)",
  boxShadow:"0 4px 20px rgba(0,0,0,0.15)",
};

// ─── CIRCLE SCORE ────────────────────────────────────────────────────────────

function Ring({ score, size=48 }: {score:number;size?:number}) {
  const sw=4.5, r=(size-sw)/2, circ=2*Math.PI*r, fill=(score/100)*circ;
  const cx=size/2, cy=size/2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--muted)" strokeWidth={sw}/>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={hColor(score)} strokeWidth={sw}
        strokeDasharray={`${fill} ${circ-fill}`} strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}/>
      <text x={cx} y={cy+4} textAnchor="middle"
        style={{fontFamily:"var(--font-mono)", fontSize:size*0.27, fontWeight:600, fill:hColor(score)}}>
        {score}
      </text>
    </svg>
  );
}

// ─── SPARK ──────────────────────────────────────────────────────────────────

function Spark({ data, color, w=80, h=32 }: {data:{v:number}[];color:string;w?:number;h?:number}) {
  if (data.length < 2) return null;
  const vals=data.map(d=>d.v), mx=Math.max(...vals), mn=Math.min(...vals), rng=mx-mn||1, p=2;
  const pts=vals.map((v,i)=>[p+(i/(vals.length-1))*(w-p*2), p+(1-(v-mn)/rng)*(h-p*2)]);
  const path=pts.map((pt,i)=>`${i===0?"M":"L"}${pt[0].toFixed(1)},${pt[1].toFixed(1)}`).join(" ");
  return <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{overflow:"visible"}}><path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

// ─── TOP BAR ─────────────────────────────────────────────────────────────────

function TopBar({dark,onToggle,projects,activeId,onSelect,onHome,pendingCount,onRatingOpen,onManageWorkspaces}:{
  dark:boolean;onToggle:()=>void;projects:Project[];activeId:string|null;onSelect:(id:string)=>void;onHome:()=>void;
  pendingCount:number;onRatingOpen:()=>void;onManageWorkspaces:()=>void;
}) {
  const [open,setOpen]=useState(false);
  const [q,setQ]=useState("");
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const h=(e:MouseEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false);};
    document.addEventListener("mousedown",h); return ()=>document.removeEventListener("mousedown",h);
  },[]);
  const active=findProjectByPath(projects,activeId);
  const filtered=projects.filter(p=>p.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <header className="shrink-0 border-b border-border bg-card flex items-center px-6 gap-5 z-30" style={{height:54}}>
      <button onClick={onHome} className="flex items-center gap-2.5 hover:opacity-75 transition-opacity">
        <div className="w-7 h-7 bg-primary flex items-center justify-center"><Activity size={14} className="text-primary-foreground"/></div>
        <span className="text-base font-bold tracking-widest uppercase" style={{fontFamily:"var(--font-display)"}}>Pulse</span>
      </button>
      {active && (
        <>
          <ChevronRight size={15} className="text-border"/>
          <div className="relative" ref={ref}>
            <button
              onClick={()=>setOpen(!open)}
              className={`flex items-center gap-2.5 px-3 py-1.5 border transition-colors ${open?"border-primary bg-primary/5":"border-border hover:border-primary/50 hover:bg-muted/40"}`}>
              {/* coloured health dot */}
              <span className="w-2 h-2 rounded-full shrink-0" style={{backgroundColor:hColor(active.score)}}/>
              <div className="text-left">
                <div className="text-[15px] font-bold leading-tight" style={{fontFamily:"var(--font-display)"}}>{active.name}</div>
                <div className="text-xs text-muted-foreground leading-none mt-0.5 truncate max-w-[220px]">
                  {active.owner && active.repo ? `${active.owner}/${active.repo}` : "Switch project"}
                </div>
              </div>
              <ChevronDown size={13} className={`text-muted-foreground transition-transform ${open?"rotate-180":""}`}/>
            </button>
            <AnimatePresence>
              {open && (
                <motion.div initial={{opacity:0,y:-6}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-6}} transition={{duration:0.13}}
                  className="absolute left-0 top-full mt-1 w-72 bg-popover border border-border shadow-2xl z-50">
                  <div className="px-3 pt-3 pb-2 border-b border-border">
                    <div className="text-xs font-semibold text-muted-foreground mb-2">Switch to project</div>
                    <div className="flex items-center gap-2 bg-muted px-3 py-2">
                      <Search size={13} className="text-muted-foreground shrink-0"/>
                      <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Search projects…"
                        className="bg-transparent text-sm outline-none flex-1 placeholder:text-muted-foreground"/>
                    </div>
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {filtered.map(p=>(
                      <button key={p.id} onClick={()=>{onSelect(p.id);setOpen(false);setQ("");}}
                        className={`w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted transition-colors border-b border-border/50 last:border-b-0 text-left ${p.id===activeId?"bg-primary/5 border-l-2 border-l-primary":""}`}>
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{backgroundColor:hColor(p.score)}}/>
                        <div className="flex-1 min-w-0">
                          <div className={`text-[15px] font-semibold truncate ${p.id===activeId?"text-primary":"text-foreground"}`} style={{fontFamily:"var(--font-display)"}}>{p.name}</div>
                          <div className="text-sm text-muted-foreground truncate">{p.team}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className={`text-base font-bold tabular-nums ${hClass(p.score)}`} style={{fontFamily:"var(--font-mono)"}}>{p.score}</div>
                          {p.id===activeId&&<div className="text-xs text-primary font-medium">current</div>}
                        </div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}
      <div className="ml-auto flex items-center gap-1">
        {/* Rating reminder icon */}
        {pendingCount>0&&(
          <button onClick={onRatingOpen}
            className="relative p-2 text-amber-500 hover:text-amber-400 transition-colors"
            title={`${pendingCount} action${pendingCount>1?"s":""} need your effectiveness rating`}>
            <Star size={17} className="fill-amber-400 text-amber-400"/>
            <span className="absolute top-1 right-0.5 min-w-[16px] h-4 bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center px-0.5 leading-none">
              {pendingCount}
            </span>
          </button>
        )}
        <button className="relative p-2 text-muted-foreground hover:text-foreground transition-colors">
          <Bell size={17}/>
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"/>
        </button>
        <button onClick={onManageWorkspaces} title="Switch workspace" className="p-2 text-muted-foreground hover:text-foreground transition-colors">
          <Building2 size={17}/>
        </button>
        <button onClick={onToggle} className="p-2 text-muted-foreground hover:text-foreground transition-colors">
          {dark?<Sun size={17}/>:<Moon size={17}/>}
        </button>
        <div className="w-8 h-8 bg-primary flex items-center justify-center text-sm font-bold text-primary-foreground ml-1" style={{fontFamily:"var(--font-display)"}}>SC</div>
      </div>
    </header>
  );
}

// ─── INLINE RATING ────────────────────────────────────────────────────────────

function InlineRating({effectiveness,onRate}:{effectiveness:number|null;onRate?:(rating:number)=>void}) {
  const [hover,setHover]=useState(0);
  const [saved,setSaved]=useState(effectiveness);
  const [flash,setFlash]=useState(false);
  useEffect(()=>{setSaved(effectiveness);},[effectiveness]);
  const rate=(n:number)=>{setSaved(n);setFlash(true);setTimeout(()=>setFlash(false),800);onRate?.(n);};
  if(saved!==null) return (
    <div className={`flex gap-0.5 items-center transition-opacity ${flash?"opacity-60":""}`}>
      {Array.from({length:5}).map((_,i)=>(
        <button key={i} onClick={e=>{e.stopPropagation();rate(i+1);}}
          className="transition-transform hover:scale-110" title="Click to re-rate">
          <Star size={13} className={i<saved?"text-amber-400 fill-amber-400":"text-muted-foreground"}/>
        </button>
      ))}
    </div>
  );
  return (
    <div className="flex gap-0.5 items-center" onMouseLeave={()=>setHover(0)} onClick={e=>e.stopPropagation()}>
      {Array.from({length:5}).map((_,i)=>(
        <button key={i}
          onMouseEnter={()=>setHover(i+1)}
          onClick={()=>rate(i+1)}
          className="transition-transform hover:scale-125">
          <Star size={14} className={i<hover?"text-amber-400 fill-amber-400":"text-muted-foreground/50"}/>
        </button>
      ))}
    </div>
  );
}

// ─── GLOBAL ACTIONS VIEW ─────────────────────────────────────────────────────

function GlobalActionsView({actions,projects,onBack,onLogAction,onRateAction}:{
  actions:Action[];projects:Project[];onBack:()=>void;onLogAction:()=>void;onRateAction:(id:string,rating:number)=>void;
}) {
  const [q,setQ]=useState("");
  const [filterProject,setFilterProject]=useState("all");
  const [sortOrder,setSortOrder]=useState<"newest"|"oldest">("newest");
  const [ex,setEx]=useState<string|null>(null);
  const [searchResults,setSearchResults]=useState<Action[]|null>(null);
  const [searching,setSearching]=useState(false);
  const [searchMode,setSearchMode]=useState<ActionSearchMode|null>(null);
  const [searchError,setSearchError]=useState<string|null>(null);

  useEffect(()=>{
    const query=q.trim();
    if(query.length<3){setSearchResults(null);setSearching(false);setSearchMode(null);setSearchError(null);return;}
    const controller=new AbortController();
    setSearching(true);setSearchError(null);
    const timer=setTimeout(()=>{
      searchActions(query,50,{projectId:filterProject!=="all"?filterProject:undefined,signal:controller.signal})
        .then(result=>{setSearchResults(result.actions);setSearchMode(result.mode);})
        .catch(error=>{if((error as Error).name!=="AbortError")setSearchError("Search service unavailable. Showing local keyword matches.");})
        .finally(()=>{if(!controller.signal.aborted)setSearching(false);});
    },300);
    return()=>{clearTimeout(timer);controller.abort();};
  },[q,filterProject]);

  const filtered=useMemo(()=>{
    const semanticQuery=q.trim().length>=3;
    let list=[...(semanticQuery&&!searchError?(searchResults??[]):actions)];
    if(filterProject!=="all") list=list.filter(a=>a.projectIds.includes(filterProject));
    if(q&&(!semanticQuery||searchError)){const lq=q.toLowerCase();list=list.filter(a=>a.problem.toLowerCase().includes(lq)||a.actionTaken.toLowerCase().includes(lq)||a.reason.toLowerCase().includes(lq));}
    if(!semanticQuery||searchError)list.sort((a,b)=>{const da=new Date(a.timestamp).getTime(),db=new Date(b.timestamp).getTime();return sortOrder==="newest"?db-da:da-db;});
    return list;
  },[actions,searchResults,searchError,q,filterProject,sortOrder]);

  const COL="minmax(0,2.5fr) 150px 130px 90px 36px";

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-6xl mx-auto px-8 py-8">
        <div className="flex items-center gap-4 mb-7 flex-wrap">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors font-medium">
            <ChevronLeft size={15}/> Portfolio
          </button>
          <h1 className="text-3xl font-bold uppercase tracking-wide" style={{fontFamily:"var(--font-display)"}}>All Actions</h1>
          <span className="text-base text-muted-foreground" style={{fontFamily:"var(--font-mono)"}}>{filtered.length} records</span>
          <div className="ml-auto">
            <button onClick={onLogAction}
              className="flex items-center gap-2 bg-primary text-primary-foreground text-base font-bold px-6 py-3 hover:opacity-90 transition-opacity shadow-lg"
              style={{fontFamily:"var(--font-display)"}}>
              <Plus size={16}/> Log Action
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div className="flex items-center gap-2 bg-card border border-border px-3 py-2.5 flex-1 max-w-sm">
            <Search size={14} className="text-muted-foreground"/>
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search actions by meaning…"
              className="bg-transparent text-sm outline-none flex-1 placeholder:text-muted-foreground"/>
            {searching&&<RefreshCw size={13} className="text-primary animate-spin"/>}
            {q&&<button onClick={()=>setQ("")} className="text-muted-foreground hover:text-foreground"><X size={13}/></button>}
          </div>
          <select value={filterProject} onChange={e=>setFilterProject(e.target.value)}
            className="bg-card border border-border px-3 py-2.5 text-sm font-medium text-foreground outline-none focus:border-primary cursor-pointer">
            <option value="all">All Projects</option>
            {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {q.trim().length>=3&&<div className="border border-border bg-card px-3 py-2.5 text-sm font-semibold text-primary">{searching?"Searching…":searchError?"Local keyword results":actionSearchModeLabel(searchMode)}</div>}
          <div className="flex border border-border">
            {(["newest","oldest"] as const).map(o=>(
              <button key={o} onClick={()=>setSortOrder(o)}
                className={`px-3 py-2.5 text-sm font-semibold capitalize transition-colors ${sortOrder===o?"bg-foreground text-background":"text-muted-foreground hover:text-foreground"}`}
                style={{fontFamily:"var(--font-display)"}}>
                {o}
              </button>
            ))}
          </div>
        </div>

        {searchError&&q.trim().length>=3&&<div className="mb-4 flex items-center gap-2 border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"><AlertCircle size={14}/>{searchError}</div>}

        <div className="border border-border bg-card">
          <div className="grid px-5 py-3 border-b border-border bg-muted" style={{gridTemplateColumns:COL}}>
            {["Problem","Projects","Date","Rating",""].map(h=><div key={h} className="text-sm font-semibold text-foreground" style={{fontFamily:"var(--font-display)"}}>{h}</div>)}
          </div>
          {filtered.map(a=>{
            const projs=projects.filter(p=>a.projectIds.includes(p.id));
            return (
              <div key={a.id}>
                <button onClick={()=>setEx(ex===a.id?null:a.id)}
                  className="w-full grid px-5 py-4 border-b border-border hover:bg-muted/40 transition-colors text-left items-center"
                  style={{gridTemplateColumns:COL}}>
                  <div>
                    <div className="flex items-start gap-2"><div className="text-[15px] font-medium text-foreground leading-snug">{a.problem}</div>{actionSimilarityLabel(a.similarity)&&<span className="shrink-0 bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">{actionSimilarityLabel(a.similarity)}</span>}</div>
                    <div className="text-sm text-muted-foreground mt-0.5">{a.loggedBy}</div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {projs.map(p=>{
                      const st=projectTagStyle(p.score);
                      return <span key={p.id} className={`text-xs font-semibold px-2 py-0.5 ${st.bg} ${st.text}`}>{p.name}</span>;
                    })}
                  </div>
                  <div className="text-sm font-medium text-foreground bg-muted px-2 py-1 w-fit" style={{fontFamily:"var(--font-mono)"}}>{fmtDate(a.timestamp)}</div>
                  <InlineRating effectiveness={a.effectiveness} onRate={rating=>onRateAction(a.id,rating)}/>
                  <ChevronDown size={14} className={`text-muted-foreground transition-transform ${ex===a.id?"rotate-180":""}`}/>
                </button>
                <AnimatePresence>
                  {ex===a.id&&(
                    <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} transition={{duration:0.14}} className="overflow-hidden border-b border-border bg-muted/20">
                      <div className="px-5 py-5 grid grid-cols-2 gap-6">
                        <div><div className="text-sm font-semibold text-muted-foreground mb-2">Problem &amp; Root Cause</div><div className="text-[15px] text-foreground leading-relaxed">{a.reason}</div></div>
                        <div><div className="text-sm font-semibold text-muted-foreground mb-2">Action Taken</div><div className="text-[15px] text-foreground leading-relaxed">{a.actionTaken}</div></div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
          {filtered.length===0&&<div className="text-center py-16 text-base text-muted-foreground">No actions match your filter.</div>}
        </div>
      </div>
    </div>
  );
}

// ─── GLOBAL SURVEYS VIEW ──────────────────────────────────────────────────────

function GlobalSurveysView({surveys,projects,onBack,onClosed}:{surveys:Survey[];projects:Project[];onBack:()=>void;onClosed?:()=>void;}) {
  const [q,setQ]=useState("");
  const [filterProject,setFilterProject]=useState("all");
  const [filterStatus,setFilterStatus]=useState("all");
  const [sortOrder,setSortOrder]=useState<"newest"|"oldest">("newest");
  const [exId,setExId]=useState<string|null>(null);
  const [rawId,setRawId]=useState<string|null>(null);

  const filtered=useMemo(()=>{
    let list=[...surveys];
    if(filterProject!=="all") list=list.filter(s=>s.projectId===filterProject);
    if(filterStatus!=="all") list=list.filter(s=>s.status===filterStatus);
    if(q){const lq=q.toLowerCase();list=list.filter(s=>s.trigger.toLowerCase().includes(lq)||fmtDate(s.sentDate).toLowerCase().includes(lq));}
    list.sort((a,b)=>{const da=new Date(a.sentDate).getTime(),db=new Date(b.sentDate).getTime();return sortOrder==="newest"?db-da:da-db;});
    return list;
  },[surveys,q,filterProject,filterStatus,sortOrder]);

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-6xl mx-auto px-8 py-8">
        <div className="flex items-center gap-4 mb-7 flex-wrap">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors font-medium">
            <ChevronLeft size={15}/> Portfolio
          </button>
          <h1 className="text-3xl font-bold uppercase tracking-wide" style={{fontFamily:"var(--font-display)"}}>All Surveys</h1>
          <span className="text-base text-muted-foreground" style={{fontFamily:"var(--font-mono)"}}>{filtered.length} surveys</span>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div className="flex items-center gap-2 bg-card border border-border px-3 py-2.5 flex-1 max-w-sm">
            <Search size={14} className="text-muted-foreground"/>
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search surveys…"
              className="bg-transparent text-sm outline-none flex-1 placeholder:text-muted-foreground"/>
            {q&&<button onClick={()=>setQ("")} className="text-muted-foreground hover:text-foreground"><X size={13}/></button>}
          </div>
          <select value={filterProject} onChange={e=>setFilterProject(e.target.value)}
            className="bg-card border border-border px-3 py-2.5 text-sm font-medium text-foreground outline-none focus:border-primary cursor-pointer">
            <option value="all">All Projects</option>
            {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
            className="bg-card border border-border px-3 py-2.5 text-sm font-medium text-foreground outline-none focus:border-primary cursor-pointer">
            <option value="all">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="paused">Paused</option>
            <option value="active">Active</option>
            <option value="closed">Closed</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="failed">Failed</option>
          </select>
          <div className="flex border border-border">
            {(["newest","oldest"] as const).map(o=>(
              <button key={o} onClick={()=>setSortOrder(o)}
                className={`px-3 py-2.5 text-sm font-semibold capitalize transition-colors ${sortOrder===o?"bg-foreground text-background":"text-muted-foreground hover:text-foreground"}`}
                style={{fontFamily:"var(--font-display)"}}>
                {o}
              </button>
            ))}
          </div>
        </div>

        <div className="border border-border bg-card">
          <div className="grid px-5 py-3 border-b border-border bg-muted"
            style={{gridTemplateColumns:SURVEY_HISTORY_COLS}}>
            {["Project","Issue Date","Trigger","Response","Status","Score",""].map(h=>(
              <div key={h} className="text-sm font-semibold text-foreground" style={{fontFamily:"var(--font-display)"}}>{h}</div>
            ))}
          </div>
          {filtered.map(s=>{
            const proj=projects.find(p=>p.id===s.projectId);
            const cfg=surveyRowStatus(s);
            const pct=surveyResponseRate(s);
            const isEx=exId===s.id;
            const avgScore=s.scores?Math.round(Object.values(s.scores).reduce((a,b)=>a+b,0)/5):null;
            const sTag=proj?projectTagStyle(proj.score):{bg:"bg-muted",text:"text-foreground"};
            return (
              <div key={s.id} className="border-b border-border last:border-b-0">
                <div role={surveyCanExpand(s)?"button":undefined} onClick={()=>{if(surveyCanExpand(s)){setExId(isEx?null:s.id);setRawId(null);}}}
                  className={`w-full grid px-5 py-4 transition-colors text-left items-center gap-2 ${surveyCanExpand(s)?"hover:bg-muted/40 cursor-pointer":"cursor-default"}`}
                  style={{gridTemplateColumns:SURVEY_HISTORY_COLS}}>
                  <span className={`text-xs font-bold px-2 py-1 w-fit max-w-[102px] truncate ${sTag.bg} ${sTag.text}`}>{proj?.name??s.projectId}</span>
                  <span className="text-sm font-semibold text-foreground" style={{fontFamily:"var(--font-mono)"}}>{fmtDate(s.sentDate)}</span>
                  <span className={`text-[14px] font-medium truncate pr-3 ${triggerColor(s.trigger)}`}>{s.trigger}</span>
                  <div className="min-w-0">
                    <div className="h-1.5 bg-muted mb-1">
                      <div className="h-full transition-all" style={{width:`${pct}%`,backgroundColor:pct>=70?"var(--health-good)":pct>=40?"var(--health-warn)":"var(--health-crit)"}}/>
                    </div>
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-sm font-bold tabular-nums" style={{fontFamily:"var(--font-mono)",color:pct>=70?"var(--health-good)":pct>=40?"var(--health-warn)":"var(--health-crit)"}}>{pct}%</span>
                      <span className="text-xs text-muted-foreground truncate">{s.responseCount}/{s.targetCount}</span>
                    </div>
                  </div>
                  <span className={`text-sm font-bold ${cfg.c}`} style={{fontFamily:"var(--font-display)"}}>{cfg.l}</span>
                  {avgScore!=null
                    ?<span className="text-base font-bold tabular-nums" style={{fontFamily:"var(--font-mono)",color:hColor(avgScore)}}>{avgScore}</span>
                    :s.status==="closed"?<span className="text-xs text-amber-500">…</span>
                    :<span className="text-sm text-muted-foreground">—</span>}
                  <div className="flex items-center justify-end gap-1" onClick={e=>e.stopPropagation()}>
                    {s.status==="active"&&s.publicUrl&&<CopySurveyLinkButton url={s.publicUrl}/>}
                    {s.status==="active"&&<RemindSurveyButton surveyId={s.id} onDone={onClosed}/>}
                    {s.status==="active"&&<CloseSurveyFormButton surveyId={s.id} onClosed={onClosed}/>}
                    {s.status==="failed"&&!s.scores&&<CloseSurveyFormButton surveyId={s.id} onClosed={onClosed} mode="score"/>}
                    {surveyCanExpand(s)?<ChevronDown size={14} className={`text-muted-foreground transition-transform ${isEx?"rotate-180":""}`}/>:null}
                  </div>
                </div>

                <AnimatePresence>
                  {isEx&&surveyCanExpand(s)&&(
                    <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} transition={{duration:0.18}} className="overflow-hidden">
                      <div className="border-t border-border px-5 py-4">
                        <SurveyAskedQuestions questions={s.questions}/>
                        {surveyHasResults(s)&&(
                          <>
                        <div className="text-sm font-bold text-muted-foreground mb-3">AI Summary</div>
                        {surveyDeliveryChannels(s)&&<div className="text-xs text-muted-foreground mb-3">Delivered via {surveyDeliveryChannels(s)} · closed {s.closedAt?fmtDate(s.closedAt):`by ${fmtDate(s.delivery?.expiresAt||"")}`}</div>}
                        {s.scores&&<SurveyCategoryScores scores={s.scores}/>}
                        {s.analysisError?.startsWith("insufficient_responses")
                          ?<div className="border border-amber-400/40 bg-amber-50 dark:bg-amber-950/20 p-4 text-sm text-amber-700 dark:text-amber-300 mb-4">Results are hidden because no responses were collected.</div>
                          :s.aiInsight&&<p className="text-[14px] text-foreground leading-relaxed mb-4">{s.aiInsight}</p>}
                        {s.analysisError?.startsWith("raw_responses_hidden")&&<div className="text-xs text-muted-foreground mb-3">Individual answers stay hidden until the anonymous minimum is reached. Category scores above are from AI analysis.</div>}
                        {s.themes.length>0&&<div className="border border-border divide-y divide-border mb-4">
                          {s.themes.map((t,i)=>(
                            <div key={i} className="flex gap-3 px-4 py-3 items-start">
                              <span className="shrink-0 w-5 h-5 flex items-center justify-center bg-primary text-primary-foreground text-xs font-bold mt-0.5">{i+1}</span>
                              <span className="text-[14px] text-foreground leading-relaxed">{t}</span>
                            </div>
                          ))}
                        </div>}
                        {s.rawResponses.length>0&&(
                          <button onClick={()=>setRawId(rawId===s.id?null:s.id)}
                            className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:opacity-75 transition-opacity">
                            <ChevronDown size={13} className={`transition-transform ${rawId===s.id?"rotate-180":""}`}/>
                            {rawId===s.id?"Hide":"Show"} raw responses ({s.rawResponses.length} questions)
                          </button>
                        )}
                        <AnimatePresence>
                          {rawId===s.id&&s.rawResponses.length>0&&(
                            <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} transition={{duration:0.14}} className="overflow-hidden mt-4">
                              <div className="space-y-3">
                                {s.rawResponses.map((qr,qi)=>(
                                  <div key={qi} className="border border-border">
                                    <div className="bg-muted px-4 py-2 border-b border-border flex items-center gap-2">
                                      <span className="text-xs font-bold text-muted-foreground">Q{qi+1}</span>
                                      <span className="text-[14px] font-semibold text-foreground">{qr.question}</span>
                                    </div>
                                    <div className="grid grid-cols-2 divide-x divide-border">
                                      {qr.answers.map((ans,ai)=>(
                                        <div key={ai} className={`flex gap-2.5 px-4 py-2.5 items-start ${ai>=2?"border-t border-border":""}`}>
                                          <span className="text-xs font-bold text-muted-foreground shrink-0 mt-0.5 w-5" style={{fontFamily:"var(--font-mono)"}}>R{ai+1}</span>
                                          <span className="text-[13px] text-foreground leading-snug">{ans}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                          </>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
          {filtered.length===0&&<div className="text-center py-16 text-base text-muted-foreground">No surveys match your filter.</div>}
        </div>
      </div>
    </div>
  );
}

function PulseBar({className}:{className:string}) {
  return <div className={`bg-muted animate-pulse ${className}`}/>;
}

function ProjectPageSkeleton() {
  const nav=[{icon:<BarChart2 size={16}/>,label:"Dashboard",active:true},{icon:<Zap size={16}/>,label:"Actions"},{icon:<MessageSquare size={16}/>,label:"Surveys"},{icon:<Settings size={16}/>,label:"Settings"}];
  const cats=["Delivery","Code Quality","CI/CD","Team Health","Blockers"];
  const metrics=["Commits","Tickets Closed","Sprint Velocity","Open Blockers","Deployments / wk","PR Cycle Time"];
  return (
    <div className="flex flex-1 min-h-0">
      <aside className="w-56 shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col h-full">
        <div className="flex-1 py-3 overflow-y-auto">
          {nav.map(item=>(
            <div key={item.label}
              className={`w-full flex items-center gap-3 px-4 py-3 text-[15px] ${item.active?"bg-sidebar-accent text-foreground font-semibold":"text-foreground/70"}`}
              style={item.active?{borderLeft:"3px solid var(--primary)"}:{borderLeft:"3px solid transparent"}}>
              <span className={item.active?"text-primary":"text-foreground/50"}>{item.icon}</span>
              <span style={{fontFamily:"var(--font-display)"}} className="font-medium">{item.label}</span>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-sidebar-border">
          <div className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground text-[15px] font-semibold py-2.5" style={{fontFamily:"var(--font-display)"}}>
            <Plus size={14}/> Log Action
          </div>
        </div>
      </aside>
      <div className="flex-1 overflow-y-auto bg-background">
        <div className="max-w-5xl mx-auto px-8 py-8 space-y-8">
          <div className="mb-2">
            <div className="flex items-center justify-between">
              <div className="text-base font-bold text-foreground" style={{fontFamily:"var(--font-display)"}}>Live Sync</div>
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border text-sm font-medium text-muted-foreground">
                <RefreshCw size={13} className="animate-spin"/>
                <span style={{fontFamily:"var(--font-display)"}}>Loading…</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-[290px_1fr] gap-6">
            <div className="bg-card border border-border p-6">
              <div className="text-base font-bold text-foreground mb-4" style={{fontFamily:"var(--font-display)"}}>Health Score</div>
              <PulseBar className="h-20 w-28 mb-5"/>
              <PulseBar className="h-12 w-full mb-5"/>
              <div className="pt-5 border-t border-border space-y-3">
                {cats.map(label=>(
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-[15px] text-foreground/80">{label}</span>
                    <PulseBar className="h-2 w-20"/>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-card border border-border p-6">
              <div className="text-base font-bold text-foreground mb-4" style={{fontFamily:"var(--font-display)"}}>Category Balance</div>
              <div className="h-[240px] flex items-center justify-center">
                <div className="w-48 h-48 rounded-full border-2 border-dashed border-border bg-muted/40 animate-pulse"/>
              </div>
            </div>
          </div>

          <div>
            <div className="text-base font-bold text-foreground mb-4" style={{fontFamily:"var(--font-display)"}}>Health Score Breakdown — 90-day trend</div>
            <div className="grid grid-cols-5 gap-3">
              {cats.map(label=>(
                <div key={label} className="bg-card border border-border p-4 flex flex-col">
                  <div className="text-xs font-semibold text-foreground mb-3" style={{fontFamily:"var(--font-display)"}}>{label}</div>
                  <PulseBar className="h-9 w-14 mb-2"/>
                  <PulseBar className="h-[60px] w-full"/>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-base font-bold text-foreground mb-4" style={{fontFamily:"var(--font-display)"}}>Metrics — click any card to expand</div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {metrics.map(label=>(
                <div key={label} className="bg-card border border-border p-4">
                  <div className="text-sm font-semibold text-foreground mb-2" style={{fontFamily:"var(--font-display)"}}>{label}</div>
                  <PulseBar className="h-9 w-16 mb-2"/>
                  <PulseBar className="h-[52px] w-full"/>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PORTFOLIO ───────────────────────────────────────────────────────────────

function SyncBtn({project,onSyncComplete}:{
  project:Project;
  onSyncComplete:(projectId:string,riskScore?:number,riskScores?:Partial<Record<SyncRiskKey,number|null>>)=>void;
}) {
  const backendProjectId=project.backendProjectId;
  const {active,start}=useDashboardSync(project,onSyncComplete);
  return (
    <button
      onClick={e=>{e.stopPropagation();start();}}
      disabled={active||!backendProjectId}
      title={backendProjectId?"Sync data":"This project isn't linked to a backend project yet"}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 border text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${active?"border-primary text-primary bg-primary/5":"border-border text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5"}`}>
      <RefreshCw size={13} className={active?"animate-spin":""}/>
      <span style={{fontFamily:"var(--font-display)"}}>{active?"Syncing…":"Sync"}</span>
    </button>
  );
}

function PortfolioView({projects,actions,surveys,onSelect,onLogAction,onViewActions,onViewSurveys,onRatingOpen,trackedIds,onToggleTracked,loading,onAddProject,isAdmin,workspaceName,onBackToWorkspaces,onSyncComplete}:{
  projects:Project[];actions:Action[];surveys:Survey[];
  onSelect:(id:string)=>void;onLogAction:()=>void;
  onViewActions:()=>void;onViewSurveys:()=>void;onRatingOpen:()=>void;
  trackedIds:Set<string>;onToggleTracked:(id:string)=>void;
  loading?:boolean;
  onAddProject?:()=>void;isAdmin?:boolean;
  workspaceName?:string;onBackToWorkspaces?:()=>void;
  onSyncComplete:(projectId:string,riskScore?:number,riskScores?:Partial<Record<SyncRiskKey,number|null>>)=>void;
}) {
  const [tab,setTab]=useState<"all"|"tracked">("all");
  const [q,setQ]=useState("");
  const pendingRatings=useMemo(()=>actions.filter(a=>a.effectiveness===null),[actions]);

  const visible=useMemo(()=>{
    let list=tab==="tracked"?projects.filter(p=>trackedIds.has(p.id)):projects;
    if(q)list=list.filter(p=>p.name.toLowerCase().includes(q.toLowerCase())||p.team.toLowerCase().includes(q.toLowerCase())||(p.owner??"").toLowerCase().includes(q.toLowerCase()));
    return [...list].sort((a,b)=>a.score-b.score);
  },[projects,tab,q,trackedIds]);

  const cols="minmax(200px,2fr) 64px 80px 64px 82px 68px 76px 60px 90px";
  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-7xl mx-auto px-8 py-8">


        {/* ── Header ── */}
        <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
          <div>
            {workspaceName&&(
              <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
                <button onClick={onBackToWorkspaces} className="font-medium hover:text-foreground transition-colors">Workspaces</button>
                <ChevronRight size={13} className="text-border"/>
                <span className="font-semibold text-foreground">{workspaceName}</span>
              </nav>
            )}
            <h1 className="text-4xl font-bold uppercase tracking-tight" style={{fontFamily:"var(--font-display)"}}>Portfolio</h1>
            <p className="text-base text-muted-foreground mt-1">
              {loading?"Loading projects from your workspace…":(()=>{
                const attention=projects.filter(p=>p.score<60).length;
                return `${projects.length} project${projects.length!==1?"s":""} · ${attention} need${attention===1?"s":""} attention · ${surveys.length} total survey${surveys.length!==1?"s":""}`;
              })()}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Global nav buttons */}
            <button onClick={onViewActions}
              className="flex items-center gap-2 border border-border bg-card text-[15px] font-semibold px-4 py-2.5 text-foreground hover:border-primary hover:text-primary transition-colors"
              style={{fontFamily:"var(--font-display)"}}>
              <Zap size={14}/> All Actions
              {pendingRatings.length>0&&(
                <span className="inline-flex items-center justify-center w-5 h-5 bg-amber-400 text-white text-xs font-bold">{pendingRatings.length}</span>
              )}
            </button>
            <button onClick={onViewSurveys}
              className="flex items-center gap-2 border border-border bg-card text-[15px] font-semibold px-4 py-2.5 text-foreground hover:border-primary hover:text-primary transition-colors"
              style={{fontFamily:"var(--font-display)"}}>
              <MessageSquare size={14}/> All Surveys
            </button>
            {/* Log Action — primary, large */}
            <button onClick={onLogAction}
              className="flex items-center gap-2.5 bg-primary text-primary-foreground text-[15px] font-bold px-7 py-3 hover:opacity-90 transition-opacity shadow-lg"
              style={{fontFamily:"var(--font-display)"}}>
              <Plus size={17}/> Log Action
            </button>
            {isAdmin&&onAddProject&&(
              <button onClick={onAddProject}
                className="flex items-center gap-2.5 border border-primary text-primary text-[15px] font-bold px-7 py-3 hover:bg-primary hover:text-primary-foreground transition-colors"
                style={{fontFamily:"var(--font-display)"}}>
                <Plus size={17}/> Add Project
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 mb-6">
          <div className="flex border border-border">
            {(["all","tracked"] as const).map(t=>(
              <button key={t} onClick={()=>setTab(t)}
                className={`px-5 py-2.5 text-[15px] font-semibold transition-colors ${tab===t?"bg-foreground text-background":"text-foreground/70 hover:text-foreground"}`}
                style={{fontFamily:"var(--font-display)"}}>
                {t==="tracked"?"Tracked":"All Projects"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 bg-card border border-border px-4 py-2.5 flex-1 max-w-sm">
            <Search size={15} className="text-muted-foreground"/>
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search projects or teams…"
              className="bg-transparent text-[15px] outline-none flex-1 placeholder:text-muted-foreground"/>
          </div>
        </div>

        <div className="border border-border bg-card overflow-x-auto">
          <div style={{minWidth:900}}>
            <div className="grid items-center border-b border-border bg-muted px-6 py-3" style={{gridTemplateColumns:cols}}>
              {["Project","Delivery","Code Quality","CI/CD","Team Health","Blockers","Health","Trend",""].map((h,i)=>(
                <div key={i} className={`text-sm font-semibold text-foreground ${i>=1&&i<=6?"text-center":""}`} style={{fontFamily:"var(--font-display)"}}>{h}</div>
              ))}
            </div>
            {loading?(
              Array.from({length:4}).map((_,i)=>(
                <div key={i} className="grid items-center px-6 py-5 border-b border-border last:border-b-0" style={{gridTemplateColumns:cols}}>
                  <div className="space-y-2">
                    <div className="h-4 w-40 bg-muted animate-pulse"/>
                    <div className="h-3 w-56 bg-muted animate-pulse"/>
                  </div>
                  {Array.from({length:7}).map((__,j)=><div key={j} className="mx-auto h-10 w-10 rounded-full bg-muted animate-pulse"/>)}
                  <div className="h-8 w-16 bg-muted animate-pulse ml-auto"/>
                </div>
              ))
            ):visible.map((p,idx)=>(
              <motion.div key={p.id} initial={{opacity:0}} animate={{opacity:1}} transition={{delay:idx*0.03,duration:0.2}}>
                <div onClick={()=>onSelect(p.id)}
                  className="grid items-center px-6 py-4 border-b border-border hover:bg-muted/40 cursor-pointer group transition-colors"
                  style={{gridTemplateColumns:cols, borderLeft:`3px solid ${hColor(p.score)}`}}>
                  <div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={e=>{e.stopPropagation();onToggleTracked(p.id);}}
                        title={trackedIds.has(p.id)?"Untrack project":"Track project"}
                        className={`shrink-0 p-0.5 transition-colors ${trackedIds.has(p.id)?"text-primary hover:text-primary/70":"text-muted-foreground/40 hover:text-primary"}`}>
                        <Bookmark size={14} className={trackedIds.has(p.id)?"fill-primary":""} strokeWidth={2}/>
                      </button>
                      <span className="text-[15px] font-bold group-hover:text-primary transition-colors" style={{fontFamily:"var(--font-display)"}}>{p.name}</span>
                    </div>
                    <div className="text-sm text-muted-foreground mt-0.5 pl-5">
                      {p.owner && p.repo ? `${p.owner}/${p.repo}` : p.owner || p.team || "No owner linked"}
                    </div>
                    {(p.pendingSurvey||p.pendingReview>0)&&(
                      <div className="flex gap-3 mt-1 pl-5">
                        {p.pendingSurvey&&<span className="text-sm text-amber-500 flex items-center gap-1"><MessageSquare size={12}/>survey</span>}
                        {p.pendingReview>0&&<span className="text-sm text-blue-500 flex items-center gap-1"><Star size={12}/>{p.pendingReview} review{p.pendingReview>1?"s":""}</span>}
                      </div>
                    )}
                  </div>
                  {(["delivery","codeQuality","cicd","teamHealth","blockers"] as const).map(k=>(
                    <div key={k} className="flex justify-center" onClick={e=>e.stopPropagation()}><Ring score={p.subscores[k]} size={44}/></div>
                  ))}
                  <div className="flex justify-center" onClick={e=>e.stopPropagation()}><Ring score={p.score} size={56}/></div>
                  <div className="flex items-center justify-center gap-1.5">
                    <TrendIcon t={p.scoreTrend}/>
                    <span className={`text-sm font-bold tabular-nums ${p.scoreTrend>0?"text-emerald-500":p.scoreTrend<0?"text-red-500":"text-muted-foreground"}`} style={{fontFamily:"var(--font-mono)"}}>
                      {p.scoreTrend>0?"+":""}{p.scoreTrend}
                    </span>
                  </div>
                  <div className="flex justify-center" onClick={e=>e.stopPropagation()}><SyncBtn project={p} onSyncComplete={onSyncComplete}/></div>
                </div>
              </motion.div>
            ))}
            {visible.length===0&&!loading&&<div className="text-center py-16 text-base text-muted-foreground">No projects match your filter.</div>}
          </div>
        </div>
      </div>

    </div>
  );
}

function GlobalEffRow({action,onRate}:{action:Action;onRate?:(rating:number)=>void}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground">Rate:</span>
      <InlineRating effectiveness={action.effectiveness} onRate={onRate}/>
    </div>
  );
}

// ─── SIDEBAR ─────────────────────────────────────────────────────────────────

function Sidebar({screen,onNavigate,project,onLogAction}:{screen:Screen;onNavigate:(s:Screen)=>void;project:Project;onLogAction:()=>void;}) {
  const [actOpen,setActOpen]=useState(screen.startsWith("actions"));
  useEffect(()=>{if(screen.startsWith("actions"))setActOpen(true);},[screen]);
  const item=(s:Screen,icon:React.ReactNode,label:string)=>{
    const a=screen===s;
    return <button onClick={()=>onNavigate(s)}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left text-[15px] transition-colors ${a?"bg-sidebar-accent text-foreground font-semibold":"text-foreground/70 hover:text-foreground hover:bg-sidebar-accent/50"}`}
      style={a?{borderLeft:"3px solid var(--primary)"}:{borderLeft:"3px solid transparent"}}>
      <span className={a?"text-primary":"text-foreground/50"}>{icon}</span>
      <span style={{fontFamily:"var(--font-display)"}} className="font-medium">{label}</span>
    </button>;
  };
  const sub=(s:Screen,label:string)=>{
    const a=screen===s;
    return <button onClick={()=>onNavigate(s)}
      className={`w-full text-left py-2.5 pl-11 pr-4 text-[15px] transition-colors ${a?"text-primary font-semibold":"text-foreground/60 hover:text-foreground"}`}>
      {label}
    </button>;
  };
  return (
    <aside className="w-56 shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col h-full">
      <div className="flex-1 py-3 overflow-y-auto">
        {item("dashboard",<BarChart2 size={16}/>,"Dashboard")}
        <div>
          <button onClick={()=>setActOpen(!actOpen)}
            className="w-full flex items-center justify-between px-4 py-3 text-[15px] text-foreground/70 hover:text-foreground hover:bg-sidebar-accent/50 transition-colors border-l-[3px] border-transparent">
            <div className="flex items-center gap-3"><Zap size={16}/><span style={{fontFamily:"var(--font-display)"}} className="font-medium">Actions</span></div>
            <ChevronDown size={14} className={`transition-transform ${actOpen?"rotate-180":""}`}/>
          </button>
          <AnimatePresence>
            {actOpen&&(
              <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} transition={{duration:0.13}} className="overflow-hidden">
                {sub("actions-timeline","Timeline")}
                {sub("actions-library","Library")}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {item("surveys",<MessageSquare size={16}/>,"Surveys")}
        {item("settings",<Settings size={16}/>,"Settings")}
      </div>
      <div className="p-4 border-t border-sidebar-border space-y-2">
        <button onClick={onLogAction} className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground text-[15px] font-semibold py-2.5 hover:opacity-90 transition-opacity" style={{fontFamily:"var(--font-display)"}}>
          <Plus size={14}/> Log Action
        </button>
        {project.pendingReview>0&&(
          <button className="w-full text-sm text-amber-500 text-center hover:text-amber-400 transition-colors flex items-center justify-center gap-1.5 py-1">
            <Star size={12}/>{project.pendingReview} action{project.pendingReview>1?"s":""} need review
          </button>
        )}
      </div>
    </aside>
  );
}

// ─── METRIC MODAL ────────────────────────────────────────────────────────────

const MMETA: Record<string,{label:string;unit?:string;icon:React.ReactNode;color:string;invertBad?:boolean}> = {
  commits:     {label:"Commits",          icon:<GitCommit size={16}/>,    color:"var(--chart-1)"},
  tickets:     {label:"Tickets Closed",   icon:<CheckSquare size={16}/>,  color:"var(--chart-2)"},
  velocity:    {label:"Sprint Velocity",  unit:"pts", icon:<Activity size={16}/>, color:"var(--chart-1)"},
  blockers:    {label:"Open Blockers",    icon:<AlertTriangle size={16}/>,color:"var(--chart-4)", invertBad:true},
  deployments: {label:"Deployments / wk",icon:<Rocket size={16}/>,       color:"var(--chart-2)"},
  prCycleTime: {label:"PR Cycle Time",    unit:"h",   icon:<GitBranch size={16}/>,color:"var(--chart-3)", invertBad:true},
};
const MVAL:{[k:string]:(m:Project["metrics"])=>number}={
  commits:m=>m.commits, tickets:m=>m.ticketsClosed, velocity:m=>m.sprintVelocity,
  blockers:m=>m.openBlockers, deployments:m=>m.deployments, prCycleTime:m=>m.prCycleTime,
};

function MetricModal({mk,series,val,onClose}:{mk:string;series:{v:number;label:string;date?:string}[];val:number;onClose:()=>void;}) {
  const meta=MMETA[mk];
  const [ri,setRi]=useState(1);
  const ranges=[{l:"7D",d:7 as number|null},{l:"30D",d:30},{l:"All",d:null}];
  const data=seriesInRange(series,ranges[ri].d);
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <motion.div initial={{scale:0.96,opacity:0,y:8}} animate={{scale:1,opacity:1,y:0}} exit={{scale:0.96,opacity:0,y:8}} transition={{duration:0.16}}
        onClick={e=>e.stopPropagation()} className="w-full max-w-3xl bg-card border border-border shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <div className="flex items-center gap-3">
            <span style={{color:meta.color}}>{meta.icon}</span>
            <div>
              <div className="text-xl font-bold" style={{fontFamily:"var(--font-display)"}}>{meta.label}</div>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-3xl font-bold tabular-nums" style={{fontFamily:"var(--font-mono)",color:meta.color}}>{val}</span>
                {meta.unit&&<span className="text-base text-muted-foreground">{meta.unit}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex border border-border">
              {ranges.map((r,i)=>(
                <button key={r.l} onClick={()=>setRi(i)}
                  className={`px-4 py-2 text-sm font-semibold transition-colors ${ri===i?"bg-foreground text-background":"text-muted-foreground hover:text-foreground"}`}
                  style={{fontFamily:"var(--font-display)"}}>
                  {r.l}
                </button>
              ))}
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X size={18}/></button>
          </div>
        </div>
        <div className="p-6">
          {data.length===0?(
            <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">No data points in this range.</div>
          ):(
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data} margin={{top:8,right:8,bottom:8,left:8}}>
              <CartesianGrid strokeDasharray="2 8" stroke="var(--border)" vertical={false}/>
              <XAxis dataKey="label" tick={{fill:"var(--foreground)",fontSize:12,fontFamily:"var(--font-mono)"}} tickLine={false} axisLine={{stroke:"var(--border)"}} interval={Math.max(0,Math.ceil(data.length/8)-1)}/>
              <YAxis tick={{fill:"var(--foreground)",fontSize:12,fontFamily:"var(--font-mono)"}} tickLine={false} axisLine={false} width={36}/>
              <ReTooltip contentStyle={ttStyle} formatter={(v:number)=>[`${v}${meta.unit||""}`,meta.label]}/>
              <Line type="monotone" dataKey="v" stroke={meta.color} strokeWidth={2.5} dot={data.length<=14?{fill:meta.color,r:3}:false} activeDot={{r:5}}/>
            </LineChart>
          </ResponsiveContainer>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────

function Dashboard({project,actions,surveys,onNavigate,onSyncComplete}:{project:Project;actions:Action[];surveys:Survey[];onNavigate:(s:Screen)=>void;onSyncComplete:(projectId:string,riskScore?:number,riskScores?:Partial<Record<SyncRiskKey,number|null>>)=>void;}) {
  const [expanded,setExpanded]=useState<string|null>(null);
  const [reviewOpen,setReviewOpen]=useState(false);
  const radarData=(Object.keys(SUBSCORE_LABELS) as (keyof typeof project.subscores)[]).map(k=>({subject:SUBSCORE_LABELS[k],value:project.subscores[k]}));
  const pending=actions.filter(a=>a.projectIds.includes(project.id)&&a.effectiveness===null);
  const completed=surveys.filter(s=>s.projectId===project.id&&surveyHasResults(s));
  const mkeys=["commits","tickets","velocity","blockers","deployments","prCycleTime"];
  const mseries:Record<string,string>={commits:"commits",tickets:"tickets",velocity:"velocity",blockers:"blockers",deployments:"deployments",prCycleTime:"prCycleTime"};
  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-5xl mx-auto px-8 py-8 space-y-8">
        <DashboardSyncBar project={project} onSyncComplete={onSyncComplete}/>
        {project.hasData===false&&(
          <div className="border border-border bg-muted/30 px-5 py-3 text-sm text-muted-foreground">
            No health snapshot yet for {project.name}. Run <span className="font-semibold text-foreground">Sync</span> to pull GitHub/Jira metrics.
          </div>
        )}
        {pending.length>0&&(
          <button onClick={()=>setReviewOpen(true)}
            className="w-full flex items-center justify-between bg-amber-50 dark:bg-amber-950/30 border border-amber-300/50 px-5 py-4 hover:bg-amber-100/50 dark:hover:bg-amber-950/50 transition-colors">
            <span className="text-base font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-2.5">
              <Star size={16}/>{pending.length} action{pending.length>1?"s":""} pending your effectiveness review
            </span>
            <span className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-1.5 font-semibold">Review now <ArrowRight size={13}/></span>
          </button>
        )}

        {/* Score + Radar */}
        <div className="grid grid-cols-[290px_1fr] gap-6">
          <div className="bg-card border border-border p-6">
            <div className="text-base font-bold text-foreground mb-4" style={{fontFamily:"var(--font-display)"}}>Health Score</div>
            <div className="flex items-end gap-4 mb-5">
              <span className="text-8xl font-bold tabular-nums leading-none" style={{fontFamily:"var(--font-mono)",color:hColor(project.score)}}>{project.score}</span>
              <div className="mb-2 flex flex-col gap-1.5">
                <TrendIcon t={project.scoreTrend} sz={18}/>
                <span className={`text-xl font-bold tabular-nums ${project.scoreTrend>0?"text-emerald-500":project.scoreTrend<0?"text-red-500":"text-muted-foreground"}`} style={{fontFamily:"var(--font-mono)"}}>
                  {project.scoreTrend>0?"+":""}{project.scoreTrend}
                </span>
              </div>
            </div>
            <Spark data={project.sparkline} color={hColor(project.score)} w={210} h={48}/>
            {/* Always-visible breakdown */}
            <div className="mt-5 pt-5 border-t border-border space-y-3">
              {(Object.keys(project.subscores) as (keyof typeof project.subscores)[]).map(k=>(
                <div key={k} className="flex items-center justify-between">
                  <span className="text-[15px] text-foreground/80">{SUBSCORE_LABELS[k]}</span>
                  <div className="flex items-center gap-3">
                    <div className="w-20 h-2 bg-muted"><div className="h-full" style={{width:`${project.subscores[k]}%`,backgroundColor:hColor(project.subscores[k])}}/></div>
                    <span className={`text-[15px] font-bold tabular-nums w-6 text-right ${hClass(project.subscores[k])}`} style={{fontFamily:"var(--font-mono)"}}>{project.subscores[k]}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-card border border-border p-6">
            <div className="text-base font-bold text-foreground mb-4" style={{fontFamily:"var(--font-display)"}}>Category Balance</div>
            <ResponsiveContainer width="100%" height={240}>
              <RadarChart data={radarData} margin={{top:4,right:28,bottom:4,left:28}}>
                <PolarGrid stroke="var(--border)"/>
                <PolarAngleAxis dataKey="subject" tick={{fill:"var(--foreground)",fontSize:12,fontFamily:"var(--font-display)",fontWeight:600}}/>
                <PolarRadiusAxis angle={30} domain={[0,100]} tick={false} axisLine={false}/>
                <Radar dataKey="value" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.12} strokeWidth={2}/>
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 6 metric cards */}
        {/* 5 subscore area chart cards */}
        <div>
          <div className="text-base font-bold text-foreground mb-4" style={{fontFamily:"var(--font-display)"}}>Health Score Breakdown — 90-day trend</div>
          <div className="grid grid-cols-5 gap-3">
            {(Object.keys(project.subscores) as (keyof typeof project.subscores)[]).map(k=>{
              const val = project.subscores[k];
              const series = project.subscoreSeries[k] ?? [];
              const strokeColor = hColor(val);
              const gradId = `ss-${project.id}-${k}`;
              const last = series[series.length-1]?.v ?? val;
              const prev = series[series.length-2]?.v ?? last;
              const delta = last - prev;
              const trendGood = delta >= 0; // higher = better for all subscores
              const minV = series.length?Math.min(...series.map(d=>d.v)):val;
              const maxV = series.length?Math.max(...series.map(d=>d.v)):val;
              const SUBSCORE_ICONS: Record<string, React.ReactNode> = {
                delivery: <Rocket size={13}/>,
                codeQuality: <ShieldCheck size={13}/>,
                cicd: <GitBranch size={13}/>,
                teamHealth: <Users size={13}/>,
                blockers: <AlertTriangle size={13}/>,
              };
              return (
                <div key={k} className="bg-card border border-border p-4 flex flex-col">
                  {/* label + icon */}
                  <div className="flex items-center gap-1.5 mb-3">
                    <span style={{color:strokeColor}}>{SUBSCORE_ICONS[k]}</span>
                    <span className="text-xs font-semibold text-foreground leading-tight" style={{fontFamily:"var(--font-display)"}}>{SUBSCORE_LABELS[k]}</span>
                  </div>
                  {/* big score */}
                  <div className="flex items-baseline gap-1.5 mb-1">
                    <span className="text-4xl font-bold tabular-nums leading-none" style={{fontFamily:"var(--font-mono)",color:strokeColor}}>{val}</span>
                    <span className="text-xs font-semibold" style={{color:trendGood?"var(--health-good)":"var(--health-crit)"}}>
                      {delta>0?"+":""}{delta}
                    </span>
                  </div>
                  {/* min/max range */}
                  <div className="flex justify-between text-[10px] text-muted-foreground mb-2 tabular-nums" style={{fontFamily:"var(--font-mono)"}}>
                    <span>{minV}</span><span>{maxV}</span>
                  </div>
                  {/* area chart */}
                  <ResponsiveContainer width="100%" height={60}>
                    <AreaChart data={series} margin={{top:2,right:0,bottom:0,left:0}}>
                      <defs>
                        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={strokeColor} stopOpacity={0.3}/>
                          <stop offset="100%" stopColor={strokeColor} stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <ReTooltip
                        contentStyle={{background:"var(--popover)",border:"1px solid var(--border)",borderRadius:"2px",padding:"4px 8px",fontSize:"11px",fontFamily:"var(--font-mono)"}}
                        itemStyle={{color:"var(--foreground)"}}
                        labelStyle={{color:"var(--muted-foreground)",fontSize:"10px"}}
                        formatter={(v:number)=>[v,"Score"]}
                        labelFormatter={(_:unknown,pl:unknown[])=>(pl as {payload:{label:string}}[])[0]?.payload?.label}
                      />
                      <Area
                        type="monotone"
                        dataKey="v"
                        stroke={strokeColor}
                        strokeWidth={2}
                        fill={`url(#${gradId})`}
                        dot={false}
                        activeDot={{r:3,fill:strokeColor,stroke:"var(--card)",strokeWidth:2}}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              );
            })}
          </div>
        </div>

        {/* 6 metric cards (compact, below subscores) */}
        <div>
          <div className="text-base font-bold text-foreground mb-4" style={{fontFamily:"var(--font-display)"}}>Metrics — click any card to expand</div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {mkeys.map(mk=>{
              const meta=MMETA[mk];
              const val=MVAL[mk](project.metrics);
              const series=project.metricSeries[mseries[mk]]??[];
              const isBad=meta.invertBad&&val>(mk==="blockers"?3:36);
              const strokeColor=isBad?"var(--health-crit)":meta.color;
              const gradId=`mg-${mk}-${project.id}`;
              const last=series[series.length-1]?.v??val;
              const prev=series[series.length-2]?.v??last;
              const trendUp=last>=prev;
              return (
                <button key={mk} onClick={()=>setExpanded(mk)}
                  className="bg-card border border-border p-4 text-left hover:border-primary/50 hover:shadow-md transition-all cursor-pointer group overflow-hidden">
                  <div className="flex items-center gap-2 mb-2">
                    <span style={{color:strokeColor}}>{meta.icon}</span>
                    <span className="text-sm font-semibold text-foreground" style={{fontFamily:"var(--font-display)"}}>{meta.label}</span>
                    <span className="ml-auto text-xs font-medium" style={{color:trendUp===!meta.invertBad?"var(--health-good)":"var(--health-crit)"}}>
                      {trendUp?"↑":"↓"}{Math.abs(last-prev).toFixed(meta.unit==="hrs"?1:0)}{meta.unit??""}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1 mb-1">
                    <span className="text-4xl font-bold tabular-nums leading-none" style={{fontFamily:"var(--font-mono)",color:isBad?"var(--health-crit)":"var(--foreground)"}}>{val}</span>
                    {meta.unit&&<span className="text-sm text-muted-foreground">{meta.unit}</span>}
                  </div>
                  <ResponsiveContainer width="100%" height={52}>
                    <AreaChart data={series} margin={{top:2,right:0,bottom:0,left:0}}>
                      <defs>
                        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={strokeColor} stopOpacity={0.2}/>
                          <stop offset="100%" stopColor={strokeColor} stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="v" stroke={strokeColor} strokeWidth={1.5} fill={`url(#${gradId})`} dot={false} activeDot={{r:3,fill:strokeColor,stroke:"var(--card)",strokeWidth:2}} isAnimationActive={false}/>
                    </AreaChart>
                  </ResponsiveContainer>
                  <div className="mt-1 text-[10px] text-muted-foreground/40 group-hover:text-primary/60 transition-colors text-right">expand ↗</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Recent actions + all-surveys shortcuts */}
        <div className="grid grid-cols-2 gap-4">
          {/* Actions */}
          <div className="bg-card border border-border">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <div className="text-base font-bold text-foreground" style={{fontFamily:"var(--font-display)"}}>Recent Actions</div>
              <button onClick={()=>onNavigate("actions-timeline")} className="text-sm text-primary flex items-center gap-1 hover:opacity-75 transition-opacity font-medium">
                All actions <ArrowRight size={12}/>
              </button>
            </div>
            <div className="divide-y divide-border">
              {actions.filter(a=>a.projectIds.includes(project.id)).slice(0,4).map(a=>(
                <div key={a.id} className="px-5 py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[14px] font-medium text-foreground leading-snug truncate">{a.problem}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{fmtDate(a.timestamp)}</div>
                  </div>
                  <div className="shrink-0 flex gap-0.5 mt-0.5">
                    {a.effectiveness!==null
                      ?Array.from({length:5}).map((_,i)=><Star key={i} size={11} className={i<a.effectiveness!?"text-amber-400 fill-amber-400":"text-muted-foreground"}/>)
                      :<span className="text-xs text-muted-foreground">unrated</span>}
                  </div>
                </div>
              ))}
              {actions.filter(a=>a.projectIds.includes(project.id)).length===0&&(
                <div className="px-5 py-6 text-sm text-muted-foreground text-center">No actions logged yet.</div>
              )}
            </div>
          </div>

          {/* Surveys */}
          <div className="bg-card border border-border">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <div className="text-base font-bold text-foreground" style={{fontFamily:"var(--font-display)"}}>Surveys</div>
              <button onClick={()=>onNavigate("surveys")} className="text-sm text-primary flex items-center gap-1 hover:opacity-75 transition-opacity font-medium">
                All surveys <ArrowRight size={12}/>
              </button>
            </div>
            <div className="divide-y divide-border">
              {surveys.filter(s=>s.projectId===project.id).slice(0,4).map(s=>{
                const pct=surveyResponseRate(s);
                const cfg=SURVEY_STATUS_CONFIG[s.status];
                return (
                  <div key={s.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-medium text-foreground leading-snug truncate">{s.trigger}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs font-bold ${cfg.c}`}>{cfg.l}</span>
                        <span className="text-xs text-muted-foreground">{fmtDate(s.sentDate)}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      {s.scores
                        ?<div className="text-sm font-bold tabular-nums" style={{fontFamily:"var(--font-mono)",color:hColor(Math.round(Object.values(s.scores).reduce((a,b)=>a+b,0)/5))}}>{Math.round(Object.values(s.scores).reduce((a,b)=>a+b,0)/5)}</div>
                        :<div className="text-sm font-bold tabular-nums" style={{fontFamily:"var(--font-mono)",color:pct>=70?"var(--health-good)":pct>=40?"var(--health-warn)":"var(--health-crit)"}}>{pct}%</div>}
                      <div className="text-xs text-muted-foreground">{s.scores?"AI score":`${s.responseCount}/${s.targetCount}`}</div>
                    </div>
                  </div>
                );
              })}
              {surveys.filter(s=>s.projectId===project.id).length===0&&(
                <div className="px-5 py-6 text-sm text-muted-foreground text-center">No surveys yet.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {expanded&&<MetricModal key="mm" mk={expanded} series={project.metricSeries[mseries[expanded]]??[]} val={MVAL[expanded](project.metrics)} onClose={()=>setExpanded(null)}/>}
      </AnimatePresence>
      <AnimatePresence>
        {reviewOpen&&(
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center" onClick={()=>setReviewOpen(false)}>
            <motion.div initial={{y:32,opacity:0}} animate={{y:0,opacity:1}} exit={{y:32,opacity:0}} onClick={e=>e.stopPropagation()} className="w-full max-w-lg bg-card border border-border mb-8 mx-4 shadow-2xl">
              <div className="flex items-center justify-between px-6 py-5 border-b border-border">
                <div className="text-xl font-bold" style={{fontFamily:"var(--font-display)"}}>Effectiveness Review</div>
                <button onClick={()=>setReviewOpen(false)} className="text-muted-foreground hover:text-foreground"><X size={18}/></button>
              </div>
              <div className="p-5 space-y-4">{pending.map(a=><EffRow key={a.id} action={a}/>)}</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function EffRow({action}:{action:Action}) {
  const [r,setR]=useState(0), [done,setDone]=useState(false);
  return (
    <div className={`border border-border p-4 transition-opacity ${done?"opacity-40":""}`}>
      <div className="text-[15px] font-semibold text-foreground mb-1">{action.problem}</div>
      <div className="text-sm text-muted-foreground mb-4">{action.actionTaken}</div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {Array.from({length:5}).map((_,i)=>(
            <button key={i} onMouseEnter={()=>!done&&setR(i+1)} onClick={()=>{setR(i+1);setTimeout(()=>setDone(true),300)}} className="transition-transform hover:scale-110">
              <Star size={22} className={i<r?"text-amber-400 fill-amber-400":"text-muted-foreground"}/>
            </button>
          ))}
        </div>
        {done&&<span className="text-[15px] text-emerald-500 flex items-center gap-1.5"><Check size={14}/>Saved</span>}
      </div>
    </div>
  );
}

// ─── ACTIONS TIMELINE ────────────────────────────────────────────────────────

function ActionsTimeline({project,actions}:{project:Project;actions:Action[];}) {
  const ts=project.timeSeries;
  const minDate=ts[0]?.date??"", maxDate=ts[ts.length-1]?.date??"";
  const [start,setStart]=useState(()=>{const d=new Date(maxDate);d.setDate(d.getDate()-30);return d.toISOString().split("T")[0];});
  const [end,setEnd]=useState(maxDate);
  const [sel,setSel]=useState<Action|null>(null);
  const filtered=useMemo(()=>ts.filter(d=>d.date>=start&&d.date<=end),[ts,start,end]);
  const pa=actions.filter(a=>a.projectIds.includes(project.id));
  const setPreset=(days:number|null)=>{setEnd(maxDate);if(days===null){setStart(minDate);return;}const d=new Date(maxDate);d.setDate(d.getDate()-days);setStart(d.toISOString().split("T")[0]);};
  const am=useMemo(()=>{
    const map:Record<string,Action>={};
    pa.forEach(a=>{
      if(!filtered.length)return;
      const cl=filtered.reduce((p,c)=>Math.abs(new Date(c.date).getTime()-new Date(a.timestamp).getTime())<Math.abs(new Date(p.date).getTime()-new Date(a.timestamp).getTime())?c:p,filtered[0]);
      if(cl)map[cl.label]=a;
    });return map;
  },[pa,filtered]);
  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-5xl mx-auto px-8 py-8">
        <h2 className="text-3xl font-bold uppercase tracking-wide mb-7" style={{fontFamily:"var(--font-display)"}}>Actions Timeline</h2>
        <div className="flex items-center gap-3 mb-7 flex-wrap">
          <div className="flex border border-border">
            {[{l:"7D",d:7},{l:"30D",d:30},{l:"90D",d:90},{l:"All",d:null}].map(r=>(
              <button key={r.l} onClick={()=>setPreset(r.d)}
                className="px-4 py-2.5 text-[15px] font-semibold text-foreground/70 hover:text-foreground hover:bg-muted transition-colors border-r border-border last:border-r-0"
                style={{fontFamily:"var(--font-display)"}}>
                {r.l}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 bg-card border border-border px-4 py-2.5">
            <span className="text-sm font-medium text-muted-foreground">From</span>
            <input type="date" value={start} min={minDate} max={end} onChange={e=>setStart(e.target.value)}
              className="bg-transparent text-[15px] outline-none text-foreground" style={{fontFamily:"var(--font-mono)"}}/>
          </div>
          <div className="flex items-center gap-2 bg-card border border-border px-4 py-2.5">
            <span className="text-sm font-medium text-muted-foreground">To</span>
            <input type="date" value={end} min={start} max={maxDate} onChange={e=>setEnd(e.target.value)}
              className="bg-transparent text-[15px] outline-none text-foreground" style={{fontFamily:"var(--font-mono)"}}/>
          </div>
          <div className="bg-card border border-border px-4 py-2.5 text-sm text-muted-foreground">
            {filtered.length} data points shown
          </div>
        </div>
        <div className="bg-card border border-border p-6 mb-7">
          <div className="text-base font-bold text-foreground mb-1" style={{fontFamily:"var(--font-display)"}}>Health Score Over Time</div>
          <div className="text-sm text-muted-foreground mb-5">Orange markers indicate logged actions</div>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={filtered} margin={{top:5,right:8,bottom:24,left:8}}>
              <CartesianGrid strokeDasharray="2 8" stroke="var(--border)" vertical={false}/>
              <XAxis dataKey="label" tick={{fill:"var(--foreground)",fontSize:11,fontFamily:"var(--font-mono)"}} tickLine={false} axisLine={{stroke:"var(--border)"}} interval={Math.max(1,Math.floor(filtered.length/8))}/>
              <YAxis domain={[20,100]} tick={{fill:"var(--foreground)",fontSize:11,fontFamily:"var(--font-mono)"}} tickLine={false} axisLine={false} width={30}/>
              <ReTooltip contentStyle={ttStyle} formatter={(v:number)=>[v,"Score"]}/>
              <Area type="monotone" dataKey="score" stroke="var(--primary)" strokeWidth={2} fill="var(--primary)" fillOpacity={0.07} dot={false}/>
              {Object.keys(am).map(label=><ReferenceLine key={label} x={label} stroke="var(--chart-3)" strokeDasharray="3 3" strokeWidth={2} label={{value:"▲",position:"bottom",fill:"var(--chart-3)",fontSize:10}}/>)}
              <Brush dataKey="label" height={24} travellerWidth={10} stroke="var(--border)" fill="var(--muted)" tickFormatter={()=>""}/>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div>
          <div className="text-base font-bold text-foreground mb-4" style={{fontFamily:"var(--font-display)"}}>Logged Actions ({pa.length})</div>
          <div className="space-y-2">
            {pa.map(a=>(
              <div key={a.id} className="bg-card border border-border overflow-hidden">
                <button onClick={()=>setSel(sel?.id===a.id?null:a)}
                  className="w-full px-5 py-4 flex items-start justify-between gap-4 hover:bg-muted/30 transition-colors text-left">
                  <div>
                    <div className="text-sm text-muted-foreground mb-1.5">{fmtDate(a.timestamp)} · {a.loggedBy}</div>
                    <div className="text-[15px] font-semibold text-foreground">{a.problem}</div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {a.effectiveness!==null?<div className="flex gap-0.5">{Array.from({length:5}).map((_,i)=><Star key={i} size={12} className={i<a.effectiveness!?"text-amber-400 fill-amber-400":"text-muted-foreground"}/>)}</div>:<span className="text-sm text-muted-foreground italic">pending</span>}
                    <ChevronDown size={14} className={`text-muted-foreground transition-transform ${sel?.id===a.id?"rotate-180":""}`}/>
                  </div>
                </button>
                <AnimatePresence>
                  {sel?.id===a.id&&(
                    <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} transition={{duration:0.14}} className="overflow-hidden">
                      <div className="px-5 pb-5 pt-2 border-t border-border grid grid-cols-2 gap-5">
                        <div><div className="text-sm font-semibold text-muted-foreground mb-2">Root Cause</div><div className="text-[15px] text-foreground leading-relaxed">{a.reason}</div></div>
                        <div><div className="text-sm font-semibold text-muted-foreground mb-2">Action Taken</div><div className="text-[15px] text-foreground leading-relaxed">{a.actionTaken}</div></div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ACTIONS LIBRARY ─────────────────────────────────────────────────────────

function fmtDate(d:string){
  if(!d) return "Not sent";
  const dt=new Date(d.length===10?`${d}T00:00:00`:d);
  if(Number.isNaN(dt.getTime())) return "Not scheduled";
  return dt.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
}

function ActionsLibrary({actions,projectId}:{actions:Action[];projectId?:string;}) {
  const [q,setQ]=useState(""), [ex,setEx]=useState<string|null>(null);
  const [searchResults,setSearchResults]=useState<Action[]|null>(null);
  const [searching,setSearching]=useState(false);
  const [searchMode,setSearchMode]=useState<ActionSearchMode|null>(null);
  const [searchError,setSearchError]=useState<string|null>(null);
  useEffect(()=>{
    const query=q.trim();
    if(query.length<3){setSearchResults(null);setSearching(false);setSearchMode(null);setSearchError(null);return;}
    const controller=new AbortController();
    setSearching(true);setSearchError(null);
    const timer=setTimeout(()=>{
      searchActions(query,50,{projectId,signal:controller.signal})
        .then(result=>{setSearchResults(result.actions);setSearchMode(result.mode);})
        .catch(error=>{if((error as Error).name!=="AbortError")setSearchError("Search service unavailable. Showing local keyword matches.");})
        .finally(()=>{if(!controller.signal.aborted)setSearching(false);});
    },300);
    return()=>{clearTimeout(timer);controller.abort();};
  },[q,projectId]);
  const filtered=useMemo(()=>{
    const base=actions.filter(a=>!projectId||a.projectIds.includes(projectId));
    if(q.trim().length>=3&&!searchError)return searchResults??[];
    if(!q)return base;
    const lq=q.toLowerCase();
    return base.filter(a=>a.problem.toLowerCase().includes(lq)||a.actionTaken.toLowerCase().includes(lq)||a.reason.toLowerCase().includes(lq));
  },[actions,searchResults,searchError,q,projectId]);
  const COL="minmax(0,3fr) 140px 120px 90px";
  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-5xl mx-auto px-8 py-8">
        <div className="flex items-center justify-between mb-7">
          <h2 className="text-3xl font-bold uppercase tracking-wide" style={{fontFamily:"var(--font-display)"}}>Actions Library</h2>
          <span className="text-base text-muted-foreground" style={{fontFamily:"var(--font-mono)"}}>{filtered.length} records</span>
        </div>
        <div className="flex items-center gap-2 bg-card border border-border px-4 py-3.5 mb-6">
          <Search size={16} className="text-muted-foreground shrink-0"/>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search action history by meaning…"
            className="flex-1 text-[15px] bg-transparent outline-none placeholder:text-muted-foreground"/>
          {searching&&<RefreshCw size={14} className="text-primary animate-spin"/>}
          {q&&<button onClick={()=>setQ("")} className="text-muted-foreground hover:text-foreground"><X size={15}/></button>}
        </div>
        {q.trim().length>=3&&!searching&&<div className={`mb-4 flex items-center gap-2 border px-3 py-2 text-sm ${searchError?"border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300":"border-border bg-muted/30 text-muted-foreground"}`}>
          {searchError?<AlertCircle size={14}/>:<Search size={14}/>} {searchError??actionSearchModeLabel(searchMode)}
        </div>}
        <div className="border border-border bg-card">
          <div className="grid px-5 py-3 border-b border-border bg-muted" style={{gridTemplateColumns:COL}}>
            {["Problem","Logged By","Date","Rating"].map(h=><div key={h} className="text-sm font-semibold text-foreground" style={{fontFamily:"var(--font-display)"}}>{h}</div>)}
          </div>
          {filtered.map(a=>(
            <div key={a.id}>
              <button onClick={()=>setEx(ex===a.id?null:a.id)}
                className="w-full grid px-5 py-4 border-b border-border hover:bg-muted/40 transition-colors text-left items-center"
                style={{gridTemplateColumns:COL}}>
                <div className="pr-5"><div className="text-[15px] font-medium text-foreground leading-snug">{a.problem}</div>{actionSimilarityLabel(a.similarity)&&<div className="mt-1 text-xs font-semibold text-primary">{actionSimilarityLabel(a.similarity)}</div>}</div>
                <div className="text-[15px] text-foreground/80">{a.loggedBy}</div>
                <div className="text-sm font-medium text-foreground/70 bg-muted px-2 py-1 w-fit" style={{fontFamily:"var(--font-mono)"}}>{fmtDate(a.timestamp)}</div>
                <div className="flex gap-0.5 items-center">{a.effectiveness!==null?Array.from({length:5}).map((_,i)=><Star key={i} size={12} className={i<a.effectiveness!?"text-amber-400 fill-amber-400":"text-muted-foreground"}/>):<span className="text-sm text-muted-foreground">—</span>}</div>
              </button>
              <AnimatePresence>
                {ex===a.id&&(
                  <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} transition={{duration:0.14}} className="overflow-hidden border-b border-border bg-muted/20">
                    <div className="px-5 py-5 grid grid-cols-2 gap-6">
                      <div><div className="text-sm font-semibold text-muted-foreground mb-2">Root Cause</div><div className="text-[15px] text-foreground leading-relaxed">{a.reason}</div></div>
                      <div><div className="text-sm font-semibold text-muted-foreground mb-2">Action Taken</div><div className="text-[15px] text-foreground leading-relaxed">{a.actionTaken}</div></div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
          {filtered.length===0&&<div className="text-center py-16 text-base text-muted-foreground">{searching?"Searching action history…":"No actions match your search."}</div>}
        </div>
      </div>
    </div>
  );
}

// ─── LOG ACTION MODAL ─────────────────────────────────────────────────────────

function LogActionModal({onClose,preId,projects,actions,onSubmit}:{onClose:()=>void;preId?:string;projects:Project[];actions:Action[];
  onSubmit:(input:{projectIds:string[];problem:string;reason:string;actionTaken:string;timestamp:string})=>Promise<void>;
}) {
  const [problemAndCause,setProblemAndCause]=useState("");
  const [reason,setReason]=useState("");
  const [actionTaken,setActionTaken]=useState("");
  const [date,setDate]=useState(()=>new Date().toISOString().slice(0,10));
  const [sel,setSel]=useState<string[]>(preId?[preId]:[]);
  const [dropOpen,setDropOpen]=useState(false);
  const [submitted,setSubmitted]=useState(false);
  const [submitting,setSubmitting]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [searchTriggered,setSearchTriggered]=useState(false);
  const dRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{const h=(e:MouseEvent)=>{if(dRef.current&&!dRef.current.contains(e.target as Node))setDropOpen(false);};document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);},[]);
  const similar=useMemo(()=>{
    if(problemAndCause.length<4)return[];
    const words=problemAndCause.toLowerCase().split(/\s+/).filter(w=>w.length>3);
    return actions.map(a=>({action:a,score:words.filter(w=>a.problem.toLowerCase().includes(w)||a.reason.toLowerCase().includes(w)).length})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,5);
  },[problemAndCause,actions]);
  const toggle=(id:string)=>setSel(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
  const canSubmit=sel.length>0&&problemAndCause.trim().length>0&&reason.trim().length>0&&actionTaken.trim().length>0;
  const submit=async()=>{
    if(!canSubmit||submitting)return;
    setSubmitting(true);setError(null);
    try{
      await onSubmit({projectIds:sel,problem:problemAndCause.trim(),reason:reason.trim(),actionTaken:actionTaken.trim(),timestamp:date});
      setSubmitted(true);setTimeout(onClose,1200);
    }catch(err){setError(err instanceof Error?err.message:"Failed to log action");setSubmitting(false);}
  };
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{scale:0.97,opacity:0,y:8}} animate={{scale:1,opacity:1,y:0}} exit={{scale:0.97,opacity:0,y:8}} transition={{duration:0.16}}
        onClick={e=>e.stopPropagation()} className="w-full max-w-4xl bg-card border border-border shadow-2xl flex max-h-[90vh]">

        {/* ── LEFT: form ── */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between px-6 py-5 border-b border-border">
            <div className="text-xl font-bold" style={{fontFamily:"var(--font-display)"}}>Log Management Action</div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X size={18}/></button>
          </div>

          {submitted?(
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
              <div className="w-14 h-14 bg-emerald-500 flex items-center justify-center"><Check size={26} className="text-white"/></div>
              <div className="text-2xl font-bold" style={{fontFamily:"var(--font-display)"}}>Action logged</div>
              <div className="text-base text-muted-foreground">Added to timeline and library.</div>
            </div>
          ):(
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {/* Affects Projects */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2" style={{fontFamily:"var(--font-display)"}}>Affects Projects</label>
                <div className="relative" ref={dRef}>
                  <button onClick={()=>setDropOpen(!dropOpen)}
                    className={`w-full flex items-center justify-between bg-input-background border px-4 py-3 text-[15px] text-left transition-colors ${dropOpen?"border-primary":"border-border hover:border-primary/50"}`}>
                    <span className={sel.length>0?"text-foreground font-medium":"text-muted-foreground"}>
                      {sel.length>0?projects.filter(p=>sel.includes(p.id)).map(p=>p.name).join(", "):"Select one or more projects…"}
                    </span>
                    <ChevronDown size={15} className={`text-muted-foreground shrink-0 ml-2 transition-transform ${dropOpen?"rotate-180":""}`}/>
                  </button>
                  <AnimatePresence>
                    {dropOpen&&(
                      <motion.div initial={{opacity:0,y:-4}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-4}} transition={{duration:0.12}}
                        className="absolute left-0 right-0 top-full mt-1 bg-popover border border-border shadow-xl z-10 max-h-64 overflow-y-auto">
                        <div className="px-3 py-2 border-b border-border text-xs font-semibold text-muted-foreground bg-muted">Select all that apply</div>
                        {projects.map(p=>(
                          <button key={p.id} onClick={()=>toggle(p.id)}
                            className={`w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted transition-colors border-b border-border/50 last:border-b-0 ${sel.includes(p.id)?"bg-primary/5":""}`}>
                            <div className={`w-5 h-5 border-2 shrink-0 flex items-center justify-center transition-colors ${sel.includes(p.id)?"border-primary bg-primary":"border-border"}`}>
                              {sel.includes(p.id)&&<Check size={11} className="text-white"/>}
                            </div>
                            <div className="flex-1 text-left">
                              <div className={`text-[15px] font-semibold ${sel.includes(p.id)?"text-primary":"text-foreground"}`}>{p.name}</div>
                              <div className="text-sm text-muted-foreground">{p.team}</div>
                            </div>
                            <span className={`text-base font-bold tabular-nums ${hClass(p.score)}`} style={{fontFamily:"var(--font-mono)"}}>{p.score}</span>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Problem */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-foreground" style={{fontFamily:"var(--font-display)"}}>
                    Problem
                  </label>
                  <button
                    onClick={()=>setSearchTriggered(true)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-primary border border-primary/40 px-2.5 py-1 hover:bg-primary/10 transition-colors"
                    title="Search for similar past problems">
                    <Search size={11}/> Find Similar
                  </button>
                </div>
                <textarea
                  value={problemAndCause}
                  onChange={e=>{setProblemAndCause(e.target.value);setSearchTriggered(false);}}
                  rows={4}
                  placeholder="What happened? Be specific."
                  className="w-full bg-input-background border border-border px-4 py-3 text-[15px] placeholder:text-muted-foreground outline-none focus:border-primary resize-none transition-colors leading-relaxed"
                />
                <div className="text-xs text-muted-foreground mt-1.5">This text is used when finding similar past actions.</div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-foreground mb-2" style={{fontFamily:"var(--font-display)"}}>Root Cause</label>
                <textarea value={reason} onChange={e=>setReason(e.target.value)} rows={3}
                  placeholder="Why did it happen?"
                  className="w-full bg-input-background border border-border px-4 py-3 text-[15px] placeholder:text-muted-foreground outline-none focus:border-primary resize-none transition-colors"/>
              </div>

              {/* Action Taken */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2" style={{fontFamily:"var(--font-display)"}}>Action Taken</label>
                <textarea value={actionTaken} onChange={e=>setActionTaken(e.target.value)} rows={3}
                  placeholder="What specific decision or action did you take to address this?…"
                  className="w-full bg-input-background border border-border px-4 py-3 text-[15px] placeholder:text-muted-foreground outline-none focus:border-primary resize-none transition-colors"/>
              </div>

              {/* Date */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2" style={{fontFamily:"var(--font-display)"}}>Date</label>
                <input type="date" value={date} onChange={e=>setDate(e.target.value)}
                  className="bg-input-background border border-border px-4 py-3 text-[15px] outline-none focus:border-primary transition-colors" style={{fontFamily:"var(--font-mono)"}}/>
              </div>
            </div>
          )}

          {!submitted&&(
            <div className="px-6 py-4 border-t border-border">
              {error&&<div className="mb-3 flex items-center gap-2 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-950/30"><AlertCircle size={13}/>{error}</div>}
              <div className="flex items-center justify-between">
              <button onClick={onClose} className="text-[15px] text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
              <button onClick={()=>void submit()}
                disabled={!canSubmit||submitting}
                className="flex items-center gap-2 bg-primary text-primary-foreground text-base font-semibold px-6 py-2.5 hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                style={{fontFamily:"var(--font-display)"}}>
                <Send size={14}/> {submitting?"Logging…":"Log Action"}
              </button>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: similar problems ── */}
        <div className="w-72 border-l border-border bg-muted/20 flex flex-col shrink-0">
          <div className="px-5 py-4 border-b border-border">
            <div className="text-base font-bold text-foreground" style={{fontFamily:"var(--font-display)"}}>Similar Past Problems</div>
            <div className="text-sm text-muted-foreground mt-0.5">
              {similar.length>0?`${similar.length} match${similar.length>1?"es":""} found`:"Type above to search"}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {similar.length===0?(
              <div className="text-sm text-muted-foreground text-center pt-8 leading-relaxed px-2">
                {problemAndCause.length<4
                  ?"Start describing the problem to find related past actions."
                  :"No similar problems found in the library."}
              </div>
            ):(
              <div className="space-y-3">
                {similar.map(({action},idx)=>(
                  <div key={action.id} className="border border-border bg-card p-3.5">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="text-[13px] font-semibold text-foreground leading-snug">{action.problem}</div>
                      <span className="text-xs text-muted-foreground shrink-0 mt-0.5 font-mono">#{idx+1}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mb-2.5 leading-relaxed">{action.actionTaken}</div>
                    <div className="flex items-center justify-between">
                      <div className="flex gap-0.5">
                        {action.effectiveness!==null
                          ?Array.from({length:5}).map((_,i)=><Star key={i} size={10} className={i<action.effectiveness!?"text-amber-400 fill-amber-400":"text-muted-foreground"}/>)
                          :<span className="text-xs text-muted-foreground">unrated</span>}
                      </div>
                      <span className="text-xs text-muted-foreground" style={{fontFamily:"var(--font-mono)"}}>{action.timestamp}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── SURVEY HELPERS ───────────────────────────────────────────────────────────

function triggerColor(trigger:string):string {
  if(/threshold|exceeded|dropped|declined/i.test(trigger)) return "text-amber-600 dark:text-amber-500";
  if(/manual|quarterly|pulse/i.test(trigger)) return "text-blue-600 dark:text-blue-400";
  return "text-muted-foreground";
}

function projectTagStyle(score:number):{bg:string,text:string} {
  if(score>=80) return {bg:"bg-emerald-100 dark:bg-emerald-900/30",text:"text-emerald-700 dark:text-emerald-400"};
  if(score>=60) return {bg:"bg-amber-100 dark:bg-amber-900/30",text:"text-amber-700 dark:text-amber-400"};
  return {bg:"bg-red-100 dark:bg-red-900/30",text:"text-red-700 dark:text-red-400"};
}

// ─── SEND SURVEY MODAL ────────────────────────────────────────────────────────

const DEFAULT_QUESTIONS=[
  "What is your biggest blocker or obstacle this sprint?",
  "How confident are you in the team's ability to meet this sprint's goals? (1–5)",
  "How clear and consistent is communication from product and leadership?",
  "Are there any cross-team dependencies slowing you down?",
  "What would most improve your team's velocity in the next two weeks?",
];

interface EditableQuestion {
  id:string;
  text:string;
  category?:string;
  questionType:"text"|"scale";
  score?:QuestionScore;
}

function ReviewScheduledSurveyModal({survey,onClose,onChanged}:{
  survey:Survey;onClose:()=>void;onChanged?:()=>void;
}) {
  const [questions,setQuestions]=useState<EditableQuestion[]>(
    (survey.questions??[]).map((question,index)=>({
      id:String(index),
      text:question.questionText,
      category:question.category,
      questionType:question.questionType,
    })),
  );
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const surveyId=Number(survey.id);
  const canEdit=!survey.questionsLocked&&survey.status!=="cancelled";

  const persist=async()=>{
    if(!canEdit) return;
    const payload=questions.filter(q=>q.text.trim()).map(q=>({
      category:q.category||"delivery",questionText:q.text.trim(),questionType:q.questionType,
    }));
    if(payload.length===0) return;
    await updateSurveyQuestions(surveyId,payload);
  };

  const save=async()=>{
    setSaving(true);setError(null);
    try{
      await persist();
      onChanged?.();onClose();
    }catch(err){setError(err instanceof Error?err.message:"Failed to save questions");}
    finally{setSaving(false);}
  };
  const closeReview=async()=>{
    try{if(canEdit) await persist();}catch{/* still close */}
    onChanged?.();
    onClose();
  };
  const transition=async(action:"pause"|"resume"|"retry"|"cancel")=>{
    setSaving(true);setError(null);
    try{await changeSurveyLifecycle(surveyId,action);onChanged?.();onClose();}
    catch(err){setError(err instanceof Error?err.message:`Failed to ${action} survey`);}
    finally{setSaving(false);}
  };
  const health=survey.healthContext;

  return (
    <motion.div role="dialog" aria-modal="true" aria-labelledby="review-survey-title" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={()=>{void closeReview();}}>
      <motion.div initial={{scale:0.97,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.97,opacity:0}}
        onClick={event=>event.stopPropagation()} className="w-full max-w-2xl max-h-[88vh] flex flex-col bg-card border border-border shadow-2xl">
        <div className="flex items-start justify-between px-6 py-5 border-b border-border">
          <div>
            <h2 id="review-survey-title" className="text-xl font-bold" style={{fontFamily:"var(--font-display)"}}>Review Scheduled Survey</h2>
            <p className="text-sm text-muted-foreground mt-1">Auto-sends {fmtDate(survey.reviewDeadlineAt||survey.scheduledSendAt||"")} unless paused.</p>
          </div>
          <button aria-label="Close review" onClick={()=>{void closeReview();}} className="text-muted-foreground hover:text-foreground"><X size={18}/></button>
        </div>
        <div className="overflow-y-auto p-6 space-y-5">
          {health&&(
            <div className="border border-border bg-muted/30 p-4">
              <div className="text-sm font-bold mb-1">AI health context</div>
              <p className="text-sm text-muted-foreground">
                Captured {fmtDate(health.capturedAt)} · Overall {health.overallScore==null?"unavailable":Math.round(health.overallScore)}
                {health.trendDelta==null?"":` · Trend ${health.trendDelta>0?"+":""}${health.trendDelta.toFixed(1)}`}
              </p>
              <p className="text-xs text-muted-foreground mt-2">Gemini uses this snapshot to focus questions, but scores responses independently.</p>
            </div>
          )}
          {error&&<div className="border border-red-400/50 bg-red-50 dark:bg-red-950/20 p-3 text-sm text-red-600">{error}</div>}
          <div className="space-y-3">
            {questions.map((question,index)=>(
              <div key={question.id} className="border border-border p-3">
                <div className="flex gap-2 mb-2">
                  <select aria-label={`Category for question ${index+1}`} disabled={!canEdit} value={question.category||"delivery"}
                    onChange={e=>setQuestions(current=>current.map(q=>q.id===question.id?{...q,category:e.target.value}:q))}
                    className="bg-card border border-border px-2 py-1.5 text-sm">
                    {["delivery","codeQuality","cicd","teamHealth","blockers"].map(category=><option key={category} value={category}>{category}</option>)}
                  </select>
                  <select aria-label={`Type for question ${index+1}`} disabled={!canEdit} value={question.questionType}
                    onChange={e=>setQuestions(current=>current.map(q=>q.id===question.id?{...q,questionType:e.target.value as "text"|"scale"}:q))}
                    className="bg-card border border-border px-2 py-1.5 text-sm">
                    <option value="text">Text</option><option value="scale">Scale 1–5</option>
                  </select>
                </div>
                <textarea aria-label={`Question ${index+1}`} disabled={!canEdit} rows={2} value={question.text}
                  onChange={e=>setQuestions(current=>current.map(q=>q.id===question.id?{...q,text:e.target.value}:q))}
                  className="w-full bg-card border border-border px-3 py-2 text-sm resize-none disabled:opacity-60"/>
              </div>
            ))}
          </div>
        </div>
        <div className="border-t border-border p-4 flex items-center justify-between gap-3">
          <div className="flex gap-2">
            {survey.status==="failed"
              ?<button disabled={saving} onClick={()=>void transition("retry")} className="border border-border px-3 py-2 text-sm font-semibold">{survey.questionsLocked?"Retry analysis":"Retry delivery"}</button>
              :survey.status==="paused"
              ?<button disabled={saving} onClick={()=>void transition("resume")} className="border border-border px-3 py-2 text-sm font-semibold">Resume</button>
              :<button disabled={saving||!canEdit} onClick={()=>void transition("pause")} className="border border-border px-3 py-2 text-sm font-semibold">Pause</button>}
            <button disabled={saving||!canEdit} onClick={()=>void transition("cancel")} className="border border-red-400/50 text-red-600 px-3 py-2 text-sm font-semibold">Cancel</button>
          </div>
          <button disabled={saving||!canEdit||questions.every(q=>!q.text.trim())} onClick={()=>void save()}
            className="bg-primary text-primary-foreground px-5 py-2 text-sm font-semibold disabled:opacity-40">{saving?"Saving…":"Save questions"}</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function SendSurveyModal({onClose,project,customGuidance,onSent,audienceSize,demoOnly,draftSurvey}:{onClose:()=>void;project:Project;customGuidance?:string;onSent?:()=>void;audienceSize?:number;demoOnly?:boolean;draftSurvey?:Survey|null;}) {
  const backendProjectId=project.backendProjectId;
  const isReal=Boolean(backendProjectId);
  const hasDraft=Boolean(draftSurvey&&(draftSurvey.questions?.length??0)>0);

  const [surveyId,setSurveyId]=useState<number|null>(hasDraft?Number(draftSurvey!.id):null);
  const [scheduledSendAt,setScheduledSendAt]=useState<string|null>(draftSurvey?.scheduledSendAt??draftSurvey?.reviewDeadlineAt??null);
  const [trigger,setTrigger]=useState(draftSurvey?.trigger||"Manual team pulse check");
  const [questions,setQuestions]=useState<EditableQuestion[]>(
    hasDraft
      ?(draftSurvey!.questions??[]).map((q,i)=>({id:`q${i}`,text:q.questionText,category:q.category,questionType:q.questionType}))
      :isReal?[]:DEFAULT_QUESTIONS.map((q,i)=>({id:`q${i}`,text:q,questionType:"text"})),
  );
  const [step,setStep]=useState<"generating"|"edit"|"preview"|"sending"|"sent"|"error">(isReal&&!hasDraft?"generating":"edit");
  const [errorMessage,setErrorMessage]=useState<string|null>(null);
  const [quota,setQuota]=useState<SurveyQuota|null>(null);
  const [sentResult,setSentResult]=useState<{queued?:boolean;questionCount?:number;url?:string;expiresAt?:string;delivery?:{slackSent?:boolean;telegramSent?:boolean;discordSent?:boolean}}|null>(null);

  const questionPayload=()=>questions.filter(q=>q.text.trim()).map(q=>({
    category:q.category||"delivery",
    questionText:q.text.trim(),
    questionType:q.questionType,
  }));

  const persistEdits=async()=>{
    if(!surveyId||questionPayload().length===0) return;
    await updateSurveyQuestions(surveyId,questionPayload());
  };

  const closeModal=async()=>{
    try{
      if(surveyId&&(step==="edit"||step==="preview")) await persistEdits();
    }catch{
      // Closing should still dismiss the window; edits can be retried from history.
    }
    onSent?.();
    onClose();
  };

  const generate=async(force=false)=>{
    if(!backendProjectId) return;
    setStep("generating");
    setErrorMessage(null);
    try{
      const [generated,q]=await Promise.all([
        generateSurveyQuestions(backendProjectId,trigger,customGuidance,undefined,force),
        getSurveyQuota(backendProjectId),
      ]);
      setSurveyId(generated.surveyId);
      setScheduledSendAt(generated.scheduledSendAt);
      setQuestions(generated.questions.map((s,i)=>({id:`q${i}`,text:s.questionText,category:s.category,questionType:s.questionType,score:s.score})));
      setQuota(q);
      onSent?.();
      setStep("edit");
    }catch(err){
      setErrorMessage(err instanceof Error?err.message:"Failed to generate questions");
      setStep("error");
    }
  };

  const sendReviewed=async()=>{
    if(!backendProjectId) return;
    setStep("sending");
    setErrorMessage(null);
    try{
      const payload=questionPayload();
      await sendSurvey(backendProjectId,trigger,customGuidance,payload,undefined,undefined,surveyId??undefined);
      setSentResult({queued:true,questionCount:payload.length});
      onSent?.();
      setStep("sent");
    }catch(err){
      setErrorMessage(err instanceof Error?err.message:"Failed to send survey");
      setStep("error");
    }
  };
  useEffect(()=>{
    if(!isReal||!backendProjectId) return;
    if(hasDraft){
      void getSurveyQuota(backendProjectId).then(setQuota).catch(()=>{});
      return;
    }
    void generate();
  },[]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateQ=(id:string,val:string)=>setQuestions(prev=>prev.map(q=>q.id===id?{...q,text:val}:q));
  const removeQ=(id:string)=>setQuestions(prev=>prev.filter(q=>q.id!==id));
  const addQ=()=>setQuestions(prev=>[...prev,{id:`q${Date.now()}`,text:"",questionType:"text"}]);

  const send=async()=>{
    if(demoOnly){
      try{
        if(surveyId) await persistEdits();
        onSent?.();
        setStep("sent");
      }catch(err){
        setErrorMessage(err instanceof Error?err.message:"Failed to save questions");
        setStep("error");
      }
      return;
    }
    if(!isReal||!backendProjectId){setStep("sent");return;}
    await sendReviewed();
  };

  const remaining=quota?quota.remaining:1;

  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={()=>{void closeModal();}}>
      <motion.div initial={{scale:0.97,y:8,opacity:0}} animate={{scale:1,y:0,opacity:1}} exit={{scale:0.97,y:8,opacity:0}} transition={{duration:0.16}}
        onClick={e=>e.stopPropagation()} className="w-full max-w-2xl bg-card border border-border shadow-2xl flex flex-col max-h-[88vh]">

        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <div>
            <div className="text-xl font-bold" style={{fontFamily:"var(--font-display)"}}>
              {step==="generating"?"Generating Questions":step==="edit"?(demoOnly?"Review generated questions":"Review & Edit Survey"):step==="preview"?"Survey Preview":step==="sending"?"Sending Survey…":step==="error"?"Something Went Wrong":demoOnly?"Generation test complete":"Survey Sent"}
            </div>
            <div className="text-sm text-muted-foreground mt-0.5">
              {project.name}
              {scheduledSendAt&&step!=="sent"?` · Auto-sends ${fmtDate(scheduledSendAt)} unless you send now`:""}
            </div>
          </div>
          <button onClick={()=>{void closeModal();}} className="text-muted-foreground hover:text-foreground transition-colors"><X size={18}/></button>
        </div>

        {step==="generating"||step==="sending"?(
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-10">
            <RefreshCw size={24} className="animate-spin text-primary"/>
            <div className="text-base text-muted-foreground text-center max-w-sm">{step==="generating"?"AI is drafting and scoring questions for this survey…":"Queuing delivery of your reviewed questions…"}</div>
          </div>
        ):step==="error"?(
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-10">
            <AlertTriangle size={28} className="text-red-500"/>
            <div className="text-base text-foreground text-center max-w-sm">{errorMessage}</div>
            <button onClick={()=>{if(isReal) void generate(true); else setStep("edit");}} className="bg-primary text-primary-foreground px-6 py-2.5 text-base font-semibold hover:opacity-90 transition-opacity" style={{fontFamily:"var(--font-display)"}}>Try again</button>
          </div>
        ):step==="sent"?(
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-10">
            <div className="w-14 h-14 bg-emerald-500 flex items-center justify-center"><Check size={26} className="text-white"/></div>
            <div className="text-2xl font-bold text-center" style={{fontFamily:"var(--font-display)"}}>{demoOnly?"Draft saved — nothing sent":isReal?"Survey queued":"Survey sent successfully"}</div>
            <div className="text-base text-muted-foreground text-center max-w-md">
              {demoOnly
                ? `${questions.filter(q=>q.text.trim()).length} questions stored. You can keep editing until ${scheduledSendAt?fmtDate(scheduledSendAt):"the auto-send window"}, or use Send Survey Now to broadcast now.`
                : isReal
                ? `${sentResult?.questionCount??questions.length} reviewed questions will be posted to team channels in the background. Watch Survey History for Active status.`
                :`Sent to ${project.name} team · ${questions.length} questions · responses due in 48h`}
            </div>
            <button onClick={()=>{void closeModal();}} className="mt-2 bg-primary text-primary-foreground px-8 py-2.5 text-base font-semibold hover:opacity-90 transition-opacity" style={{fontFamily:"var(--font-display)"}}>Done</button>
          </div>
        ):step==="preview"?(
          <div className="flex-1 overflow-y-auto">
            {/* Preview banner */}
            <div className="bg-muted px-6 py-3 border-b border-border flex items-center justify-between">
              <span className="text-sm font-semibold text-muted-foreground">Preview — how recipients will see this survey</span>
              <button onClick={()=>setStep("edit")} className="text-sm text-primary font-semibold hover:opacity-75">← Edit questions</button>
            </div>
            <div className="px-8 py-8 space-y-6">
              <div>
                <div className="text-2xl font-bold mb-1" style={{fontFamily:"var(--font-display)"}}>Team Pulse — {project.name}</div>
                <div className="text-sm text-muted-foreground">{questions.length} questions · ~3 minutes · Anonymous</div>
              </div>
              {questions.filter(q=>q.text.trim()).map((q,i)=>(
                <div key={q.id} className="border border-border bg-muted/20 p-5">
                  <div className="text-sm font-bold text-muted-foreground mb-2">Q{i+1}</div>
                  <div className="text-[15px] font-semibold text-foreground">{q.text}</div>
                  {q.questionType==="scale"?(
                    <div className="flex gap-2 mt-3">{[1,2,3,4,5].map(n=>(
                      <div key={n} className="w-10 h-10 border-2 border-border flex items-center justify-center text-sm font-bold text-muted-foreground" style={{fontFamily:"var(--font-mono)"}}>{n}</div>
                    ))}</div>
                  ):(
                    <div className="mt-3 h-16 border border-border bg-background/50"/>
                  )}
                </div>
              ))}
            </div>
          </div>
        ):(
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {errorMessage&&(
              <div className="flex items-start gap-3 px-4 py-3.5 border border-red-400/50 bg-red-50 dark:bg-red-950/20">
                <AlertTriangle size={16} className="shrink-0 mt-0.5 text-red-500"/>
                <div className="text-sm font-semibold text-foreground">{errorMessage}</div>
              </div>
            )}

            {/* Trigger */}
            {isReal&&(
              <div>
                <label className="text-sm font-semibold text-foreground mb-1 block" style={{fontFamily:"var(--font-display)"}}>Reason for sending</label>
                <div className="flex items-center gap-2">
                  <input value={trigger} onChange={e=>setTrigger(e.target.value)} placeholder="e.g. Sprint retro follow-up"
                    className="flex-1 bg-card border border-border px-3 py-2 text-[14px] outline-none focus:border-primary transition-colors"/>
                  <button onClick={()=>{void generate(true);}} className="shrink-0 flex items-center gap-1.5 text-sm font-semibold text-primary hover:opacity-75 transition-opacity px-2">
                    <RefreshCw size={13}/> Regenerate
                  </button>
                </div>
              </div>
            )}

            {/* Quota warning */}
            {demoOnly?(
              <div className="flex items-start gap-3 px-4 py-3.5 border border-border bg-muted/30">
                <Sparkles size={16} className="shrink-0 mt-0.5 text-primary"/>
                <div className="text-sm text-muted-foreground">
                  Questions are saved as a draft{scheduledSendAt?` and auto-send ${fmtDate(scheduledSendAt)}`:""}. Edit until this window closes, then use Send Survey Now if you want to broadcast immediately.
                </div>
              </div>
            ):quota&&(
              <div className={`flex items-start gap-3 px-4 py-3.5 border ${remaining<=1?"border-amber-400/50 bg-amber-50 dark:bg-amber-950/20":"border-border bg-muted/30"}`}>
                <AlertTriangle size={16} className={`shrink-0 mt-0.5 ${remaining<=1?"text-amber-500":"text-muted-foreground"}`}/>
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    Sending this uses 1 of your {remaining} remaining survey{remaining!==1?"s":""} this month
                  </div>
                  <div className="text-sm text-muted-foreground mt-0.5">
                    Quota: {quota.used} used / {quota.limit} per month
                    {audienceSize?` · Settings team is ${audienceSize}. Response rate uses developers in projectmember.`:""}
                  </div>
                </div>
              </div>
            )}

            {/* Questions */}
            <div className="text-sm font-semibold text-foreground mb-1" style={{fontFamily:"var(--font-display)"}}>Questions ({questions.length})</div>
            <div className="space-y-2">
              {questions.map((q,i)=>(
                <div key={q.id} className="flex items-start gap-3 bg-muted/30 border border-border p-3">
                  <span className="shrink-0 w-6 h-6 flex items-center justify-center bg-primary text-primary-foreground text-xs font-bold mt-1">{i+1}</span>
                  <div className="flex-1 space-y-1.5">
                    {q.category&&(
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase text-muted-foreground tracking-wide">{q.category}</span>
                        <select aria-label={`Type for question ${i+1}`} value={q.questionType}
                          onChange={e=>setQuestions(prev=>prev.map(item=>item.id===q.id?{...item,questionType:e.target.value as "text"|"scale"}:item))}
                          className="text-xs bg-card border border-border px-1.5 py-1">
                          <option value="text">Text</option><option value="scale">Scale 1–5</option>
                        </select>
                        {q.score&&q.score.overall>0&&<span className="text-xs font-semibold text-primary" title="AI quality score">score {Math.round(q.score.overall)}</span>}
                      </div>
                    )}
                    <textarea value={q.text} rows={2} onChange={e=>updateQ(q.id,e.target.value)} placeholder="Enter question…"
                      className="w-full bg-card border border-border px-3 py-2 text-[14px] outline-none focus:border-primary resize-none transition-colors"/>
                  </div>
                  <button onClick={()=>removeQ(q.id)} className="text-muted-foreground hover:text-red-500 transition-colors mt-1 shrink-0"><X size={14}/></button>
                </div>
              ))}
              <button onClick={addQ} className="flex items-center gap-1.5 text-sm text-primary font-semibold hover:opacity-75 transition-opacity mt-1">
                <Plus size={13}/> Add question
              </button>
            </div>
          </div>
        )}

        {(step==="edit"||step==="preview")&&(
          <div className="px-6 py-4 border-t border-border flex items-center justify-between">
            {step==="edit"?(
              <>
                <button onClick={()=>setStep("preview")} className="text-[15px] font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
                  <ChevronRight size={14}/> Preview
                </button>
                <button onClick={send} disabled={questions.filter(q=>q.text.trim()).length===0}
                  className="flex items-center gap-2 bg-primary text-primary-foreground text-base font-semibold px-6 py-2.5 hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{fontFamily:"var(--font-display)"}}>
                  {demoOnly?<><Sparkles size={14}/> Save draft</>:<><Send size={14}/> Send to Team</>}
                </button>
              </>
            ):(
              <>
                <button onClick={()=>setStep("edit")} className="text-[15px] text-muted-foreground hover:text-foreground transition-colors">← Edit</button>
                <button onClick={send}
                  className="flex items-center gap-2 bg-primary text-primary-foreground text-base font-semibold px-6 py-2.5 hover:opacity-90 transition-opacity"
                  style={{fontFamily:"var(--font-display)"}}>
                  {demoOnly?<><Sparkles size={14}/> Save draft</>:<><Send size={14}/> Confirm &amp; Send</>}
                </button>
              </>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─── SURVEY RUBRIC ────────────────────────────────────────────────────────────

const RUBRIC_ROWS=[
  {cat:"Delivery",icon:<Activity size={14}/>,color:"text-blue-600 dark:text-blue-400",what:"Sprint velocity, ticket closure rate, story point completion",how:"Survey sentiment + metric trend (velocity, tickets closed)"},
  {cat:"Code Quality",icon:<CheckSquare size={14}/>,color:"text-emerald-600 dark:text-emerald-400",what:"Bug counts, PR quality, test coverage, tech debt perception",how:"Blocker count + PR cycle time + team feedback"},
  {cat:"CI/CD",icon:<Zap size={14}/>,color:"text-violet-600 dark:text-violet-400",what:"Build reliability, deployment frequency, pipeline failures",how:"Deployment frequency metric + survey confidence scores"},
  {cat:"Team Health",icon:<Users size={14}/>,color:"text-amber-600 dark:text-amber-400",what:"Morale, communication quality, work-life balance, psychological safety",how:"Survey-only: aggregated from team responses on wellbeing"},
  {cat:"Blockers",icon:<AlertTriangle size={14}/>,color:"text-red-600 dark:text-red-400",what:"Open blockers, cross-team dependencies, unresolved waiting items",how:"Open blockers metric + survey answers on impediments"},
];

function SurveyRubricPanel({onClose}:{onClose:()=>void}) {
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{scale:0.97,y:8,opacity:0}} animate={{scale:1,y:0,opacity:1}} exit={{scale:0.97,y:8,opacity:0}} transition={{duration:0.16}}
        onClick={e=>e.stopPropagation()} className="w-full max-w-3xl bg-card border border-border shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <div>
            <div className="text-xl font-bold" style={{fontFamily:"var(--font-display)"}}>Survey Scoring Rubric</div>
            <div className="text-sm text-muted-foreground mt-0.5">How each category is evaluated — scores range 0–100</div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X size={18}/></button>
        </div>
        <div className="p-6">
          <div className="border border-border divide-y divide-border">
            <div className="grid grid-cols-[140px_1fr_1fr] gap-0 px-4 py-3 bg-muted">
              {["Category","What we measure","How it's scored"].map(h=>(
                <div key={h} className="text-sm font-bold text-foreground" style={{fontFamily:"var(--font-display)"}}>{h}</div>
              ))}
            </div>
            {RUBRIC_ROWS.map(r=>(
              <div key={r.cat} className="grid grid-cols-[140px_1fr_1fr] gap-0 px-4 py-4 items-start hover:bg-muted/30 transition-colors">
                <div className={`flex items-center gap-2 font-semibold text-[15px] ${r.color}`}>
                  {r.icon}{r.cat}
                </div>
                <div className="text-[14px] text-foreground leading-relaxed pr-4">{r.what}</div>
                <div className="text-[14px] text-muted-foreground leading-relaxed">{r.how}</div>
              </div>
            ))}
          </div>
          <div className="mt-5 bg-muted/40 border border-border px-5 py-4">
            <div className="text-sm font-bold text-foreground mb-2">Scoring method</div>
            <div className="text-[14px] text-muted-foreground leading-relaxed">
              Each category score is calculated from a weighted combination of metric data (60%) and survey response sentiment (40%).
              The overall health score is a weighted average of all five category scores:
              Delivery 25% · Code Quality 20% · CI/CD 20% · Team Health 20% · Blockers 15%.
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── SURVEYS VIEW ─────────────────────────────────────────────────────────────

function SurveysView({project,surveys,onSurveySent,loadError,loading}:{project:Project;surveys:Survey[];onSurveySent?:()=>void;loadError?:string|null;loading?:boolean;}) {
  const ps=surveys.filter(s=>s.projectId===project.id);
  const completed=ps.filter(s=>surveyHasResults(s)&&(s.themes.length>0||Boolean(s.scores)||Boolean(s.aiInsight)));
  const {settings,update,customGuidance,audienceSize}=useProjectSurveySettings(project.id);
  const guidance=settings.guidance;
  const [iIdx,setIIdx]=useState(0);
  const [exId,setExId]=useState<string|null>(null);
  const [rawId,setRawId]=useState<string|null>(null);
  const [showRubric,setShowRubric]=useState(false);
  const [showSend,setShowSend]=useState(false);
  const [showGenerateDemo,setShowGenerateDemo]=useState(false);
  const [reviewSurvey,setReviewSurvey]=useState<Survey|null>(null);
  const [showGuidance,setShowGuidance]=useState(false);
  const [surveySearch,setSurveySearch]=useState("");
  const [surveySort,setSurveySort]=useState<"newest"|"oldest">("newest");
  const [quota,setQuotaState]=useState<SurveyQuota|null>(null);
  useEffect(()=>{
    if(!project.backendProjectId){setQuotaState(null);return;}
    let cancelled=false;
    getSurveyQuota(project.backendProjectId).then(q=>{if(!cancelled) setQuotaState(q);}).catch(()=>{});
    return ()=>{cancelled=true;};
  },[project.backendProjectId,ps.length]);
  const latest=completed[0];
  const scoreHistory=useMemo(()=>[...ps]
    .filter(s=>s.scores)
    .sort((a,b)=>new Date(a.sentDate).getTime()-new Date(b.sentDate).getTime())
    .slice(-6)
    .map(s=>({
      label:fmtDate(s.sentDate),
      overall:Math.round(Object.values(s.scores!).reduce((a,b)=>a+b,0)/5),
      delivery:s.scores!.delivery,
      codeQuality:s.scores!.codeQuality,
      cicd:s.scores!.cicd,
      teamHealth:s.scores!.teamHealth,
      blockers:s.scores!.blockers,
    })),[ps]);
  const upcomingAuto=ps.find(s=>s.source==="auto_pulse"&&["draft","paused","failed"].includes(s.status)&&(s.questions?.length??0)>0);
  const manualDraft=ps.find(s=>s.source!=="auto_pulse"&&["draft","paused","failed"].includes(s.status)&&(s.questions?.length??0)>0&&!s.questionsLocked);
  const reviewBanners=[manualDraft,upcomingAuto].filter((s,i,arr):s is Survey=>Boolean(s)&&arr.findIndex(x=>x?.id===s.id)===i);
  const skeys=["delivery","codeQuality","cicd","teamHealth","blockers"] as const;
  const quotaUsed=quota?quota.used:ps.filter(s=>{const d=new Date(s.sentDate);const now=new Date();return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();}).length;
  const quotaLimit=quota?quota.limit:2;

  const tagStyle=projectTagStyle(project.score);

  const filteredPs=useMemo(()=>{
    let list=[...ps];
    if(surveySearch){
      const lq=surveySearch.toLowerCase();
      list=list.filter(s=>s.trigger.toLowerCase().includes(lq)||s.status.includes(lq)||fmtDate(s.sentDate).toLowerCase().includes(lq));
    }
    list.sort((a,b)=>{
      const da=new Date(a.sentDate).getTime(), db=new Date(b.sentDate).getTime();
      return surveySort==="newest"?db-da:da-db;
    });
    return list;
  },[ps,surveySearch,surveySort]);
  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-4xl mx-auto px-8 py-8 space-y-7">

        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-3xl font-bold uppercase tracking-wide" style={{fontFamily:"var(--font-display)"}}>Surveys</h2>
            <div className="flex items-center gap-3 mt-1.5">
              {/* Quota - org-wide monthly cap, read-only (server-configured) */}
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground border border-border bg-card px-3 py-1.5">
                <span className="font-medium text-foreground">Quota:</span>
                <span className="font-bold text-foreground" style={{fontFamily:"var(--font-mono)"}}>{quotaLimit}</span>
                <span className="text-muted-foreground">surveys/month</span>
                <span className="text-muted-foreground">·</span>
                <span className={quotaUsed>=quotaLimit?"text-red-500 font-semibold":"text-foreground"}>{quotaUsed} used</span>
              </div>
              <button onClick={()=>setShowRubric(true)} className="text-sm font-semibold text-primary hover:opacity-75 transition-opacity flex items-center gap-1">
                Scoring rubric →
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={()=>setShowGenerateDemo(true)}
              className="flex items-center gap-2 border border-border px-4 py-2.5 text-base font-semibold text-foreground hover:border-primary hover:text-primary transition-colors"
              style={{fontFamily:"var(--font-display)"}}>
              <Sparkles size={14}/> Test generate
            </button>
            <button onClick={()=>setShowSend(true)}
              className="flex items-center gap-2 bg-primary text-primary-foreground text-base font-semibold px-5 py-2.5 hover:opacity-90 transition-opacity"
              style={{fontFamily:"var(--font-display)"}}>
              <Send size={14}/> Send Survey Now
            </button>
          </div>
        </div>

        {reviewBanners.map(upcoming=>(
          project.backendProjectId&&Number.isFinite(Number(upcoming.id))?(
          <div key={upcoming.id} className="bg-card border border-violet-400/40">
            <div className="flex items-center justify-between gap-4 px-5 py-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-bold ${SURVEY_STATUS_CONFIG[upcoming.status].c}`}>{SURVEY_STATUS_CONFIG[upcoming.status].l}</span>
                  <span className="text-base font-bold" style={{fontFamily:"var(--font-display)"}}>{upcoming.status==="failed"?"Survey needs attention":upcoming.source==="auto_pulse"?"Monthly survey review":"Draft questions ready"}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {upcoming.status==="paused"
                    ?"Auto-send is paused."
                    :upcoming.status==="failed"
                      ?`Delivery failed: ${upcoming.analysisError||"retry available"}.`
                      :`Auto-sends ${fmtDate(upcoming.reviewDeadlineAt||upcoming.scheduledSendAt||"")}.`}
                  {" "}{upcoming.questions?.length??0} questions · edit until then
                </p>
              </div>
              <button onClick={()=>setReviewSurvey(upcoming)}
                className="bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-90">
                Review survey
              </button>
            </div>
          </div>
          ):null
        ))}

        {/* ── Score summary ── */}
        {latest?.scores&&(
          <div className="bg-card border border-border">
            <div className="flex items-center gap-4 px-5 py-3.5 border-b border-border flex-wrap">
              <div className="text-base font-bold text-foreground" style={{fontFamily:"var(--font-display)"}}>Latest Survey Scores</div>
              <span className="text-sm font-semibold px-2.5 py-1 bg-primary/10 text-primary" style={{fontFamily:"var(--font-mono)"}}>
                Issue date: {fmtDate(latest.sentDate)}
              </span>
              <span className="text-sm text-muted-foreground">{latest.responseCount} of {latest.targetCount} responded</span>
            </div>
            <div className="grid grid-cols-6 gap-0">
              <div className="flex flex-col items-center justify-center px-4 py-5 border-r border-border bg-muted/30">
                <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Overall</div>
                <span className="text-5xl font-bold tabular-nums leading-none" style={{fontFamily:"var(--font-mono)",color:hColor(project.score)}}>{project.score}</span>
              </div>
              {skeys.map((k,i)=>(
                <div key={k} className={`flex flex-col items-center justify-between px-2 py-4 ${i<4?"border-r border-border":""}`}>
                  <div className="text-xs font-semibold text-muted-foreground text-center mb-2 leading-tight px-1">{SUBSCORE_LABELS[k]}</div>
                  <Ring score={latest.scores![k]} size={52}/>
                </div>
              ))}
            </div>
          </div>
        )}

        {scoreHistory.length>1&&(
          <div className="bg-card border border-border">
            <div className="px-5 py-3.5 border-b border-border">
              <div className="text-base font-bold text-foreground" style={{fontFamily:"var(--font-display)"}}>Survey score over time</div>
              <div className="text-sm text-muted-foreground mt-0.5">Last {scoreHistory.length} scored pulses</div>
            </div>
            <div className="px-3 py-4">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={scoreHistory} margin={{top:8,right:12,bottom:0,left:0}}>
                  <CartesianGrid strokeDasharray="2 8" stroke="var(--border)" vertical={false}/>
                  <XAxis dataKey="label" tick={{fill:"var(--foreground)",fontSize:11,fontFamily:"var(--font-mono)"}} tickLine={false} axisLine={{stroke:"var(--border)"}}/>
                  <YAxis domain={[0,100]} tick={{fill:"var(--foreground)",fontSize:11,fontFamily:"var(--font-mono)"}} tickLine={false} axisLine={false} width={32}/>
                  <ReTooltip contentStyle={{background:"var(--popover)",border:"1px solid var(--border)",fontSize:12}}/>
                  <Line type="monotone" dataKey="overall" name="Overall" stroke="var(--primary)" strokeWidth={2.5} dot={{r:3}}/>
                  <Line type="monotone" dataKey="delivery" name="Delivery" stroke="#3b82f6" strokeWidth={1.5} dot={false}/>
                  <Line type="monotone" dataKey="codeQuality" name="Code Quality" stroke="#10b981" strokeWidth={1.5} dot={false}/>
                  <Line type="monotone" dataKey="cicd" name="CI/CD" stroke="#8b5cf6" strokeWidth={1.5} dot={false}/>
                  <Line type="monotone" dataKey="teamHealth" name="Team Health" stroke="#f59e0b" strokeWidth={1.5} dot={false}/>
                  <Line type="monotone" dataKey="blockers" name="Blockers" stroke="#ef4444" strokeWidth={1.5} dot={false}/>
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        {completed.length>0&&(
          <div className="bg-card border border-border">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-muted/30">
              <div className="text-base font-bold text-foreground" style={{fontFamily:"var(--font-display)"}}>
                AI Insights — {completed.length} survey{completed.length>1?"s":""} analysed
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{iIdx+1} of {completed.length}</span>
                <button onClick={()=>setIIdx(i=>Math.max(0,i-1))} disabled={iIdx===0}
                  className="w-8 h-8 flex items-center justify-center border border-border hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                  <ChevronLeft size={15}/>
                </button>
                <button onClick={()=>setIIdx(i=>Math.min(completed.length-1,i+1))} disabled={iIdx===completed.length-1}
                  className="w-8 h-8 flex items-center justify-center border border-border hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                  <ChevronRight size={15}/>
                </button>
              </div>
            </div>
            <AnimatePresence mode="wait">
              <motion.div key={iIdx} initial={{opacity:0,x:16}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-16}} transition={{duration:0.18}} className="p-5">
                {/* Metadata row */}
                <div className="flex items-center gap-2.5 mb-4 flex-wrap">
                  {/* Project tag — colored */}
                  <span className={`text-sm font-bold px-2.5 py-1 ${tagStyle.bg} ${tagStyle.text}`}>{project.name}</span>
                  {/* Issue date — clearly labeled */}
                  <span className="text-sm font-semibold px-2.5 py-1 border border-border bg-muted" style={{fontFamily:"var(--font-mono)"}}>
                    Issued {fmtDate(completed[iIdx].sentDate)}
                  </span>
                  {/* Response count */}
                  <span className="text-sm font-semibold text-foreground">
                    {completed[iIdx].responseCount}/{completed[iIdx].targetCount} responses
                  </span>
                  {/* Response % bar inline */}
                  <div className="flex items-center gap-1.5">
                    <div className="w-20 h-2 bg-muted">
                      <div className="h-full bg-primary" style={{width:`${surveyResponseRate(completed[iIdx])}%`}}/>
                    </div>
                    <span className="text-sm font-bold" style={{fontFamily:"var(--font-mono)",color:hColor(surveyResponseRate(completed[iIdx]))}}>{surveyResponseRate(completed[iIdx])}%</span>
                  </div>
                </div>

                {/* Trigger — colored by type */}
                <div className={`text-sm font-semibold mb-4 ${triggerColor(completed[iIdx].trigger)}`}>
                  Trigger: {completed[iIdx].trigger}
                </div>

                {/* Survey scores (if available) */}
                {completed[iIdx].scores&&(
                  <div className="flex items-center gap-3 mb-4 flex-wrap">
                    {skeys.map(k=>(
                      <div key={k} className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">{SUBSCORE_LABELS[k]}</span>
                        <span className="text-sm font-bold tabular-nums" style={{fontFamily:"var(--font-mono)",color:hColor(completed[iIdx].scores![k])}}>{completed[iIdx].scores![k]}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* AI summary */}
                <div className="text-[15px] text-foreground leading-relaxed mb-4 font-medium">
                  {completed[iIdx].aiInsight}
                </div>

                <SurveyAskedQuestions questions={completed[iIdx].questions}/>

                {/* Themes */}
                {completed[iIdx].themes.length>0&&(
                  <div className="border border-border divide-y divide-border">
                    {completed[iIdx].themes.map((t,i)=>(
                      <div key={i} className="flex gap-3 px-4 py-3 items-start">
                        <span className="shrink-0 w-5 h-5 flex items-center justify-center bg-primary text-primary-foreground text-xs font-bold mt-0.5">{i+1}</span>
                        <span className="text-[15px] text-foreground leading-relaxed">{t}</span>
                      </div>
                    ))}
                  </div>
                )}

                {completed.length>1&&(
                  <div className="flex items-center gap-2 mt-4">
                    {completed.map((_,i)=>(
                      <button key={i} onClick={()=>setIIdx(i)}
                        className={`h-2 transition-all ${i===iIdx?"w-8 bg-primary":"w-2 bg-muted-foreground/30 hover:bg-muted-foreground/60"}`}/>
                    ))}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        )}

        {/* ── Question Guidance ── */}
        <div className="bg-card border border-border">
          <button onClick={()=>setShowGuidance(!showGuidance)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors text-left">
            <div>
              <div className="text-base font-bold text-foreground" style={{fontFamily:"var(--font-display)"}}>Question Guidance</div>
              <div className="text-sm text-muted-foreground mt-0.5">
                Instructions that steer the AI when generating survey questions — {guidance.length} active
              </div>
            </div>
            <ChevronDown size={15} className={`text-muted-foreground transition-transform ${showGuidance?"rotate-180":""}`}/>
          </button>
          <AnimatePresence>
            {showGuidance&&(
              <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} transition={{duration:0.15}} className="overflow-hidden">
                <div className="px-5 pb-5 pt-1 border-t border-border space-y-2">
                  <div className="text-sm text-muted-foreground py-2">
                    Each instruction guides the AI on what to probe. Be specific — vague instructions produce generic questions.
                  </div>
                  {guidance.map((g,idx)=>(
                    <div key={g.id} className="flex items-start gap-3">
                      <div className="shrink-0 w-6 h-6 flex items-center justify-center border border-border text-xs font-bold text-muted-foreground mt-2" style={{fontFamily:"var(--font-mono)"}}>{idx+1}</div>
                      <textarea value={g.text} rows={2} placeholder="Describe what the AI should ask about…"
                        onChange={e=>update(prev=>({...prev,guidance:prev.guidance.map(x=>x.id===g.id?{...x,text:e.target.value}:x)}))}
                        className="flex-1 bg-input-background border border-border px-3 py-2.5 text-[14px] placeholder:text-muted-foreground outline-none focus:border-primary resize-none transition-colors"/>
                      <button onClick={()=>update(prev=>({...prev,guidance:prev.guidance.filter(x=>x.id!==g.id)}))} className="mt-2 text-muted-foreground hover:text-red-500 transition-colors shrink-0"><X size={14}/></button>
                    </div>
                  ))}
                  <button onClick={()=>update(prev=>({...prev,guidance:[...prev.guidance,{id:`g${Date.now()}`,text:""}]}))}
                    className="flex items-center gap-1.5 text-sm text-primary font-semibold hover:opacity-75 transition-opacity mt-1">
                    <Plus size={13}/> Add instruction
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Survey History ── */}
        <div>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
            <div className="text-base font-bold text-foreground" style={{fontFamily:"var(--font-display)"}}>
              Survey History <span className="text-muted-foreground font-normal text-sm">({filteredPs.length})</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 bg-card border border-border px-3 py-2">
                <Search size={13} className="text-muted-foreground"/>
                <input value={surveySearch} onChange={e=>setSurveySearch(e.target.value)} placeholder="Search…"
                  className="bg-transparent text-sm outline-none w-36 placeholder:text-muted-foreground"/>
                {surveySearch&&<button onClick={()=>setSurveySearch("")} className="text-muted-foreground hover:text-foreground"><X size={12}/></button>}
              </div>
              <div className="flex border border-border">
                {(["newest","oldest"] as const).map(o=>(
                  <button key={o} onClick={()=>setSurveySort(o)}
                    className={`px-3 py-2 text-sm font-semibold capitalize transition-colors ${surveySort===o?"bg-foreground text-background":"text-muted-foreground hover:text-foreground"}`}
                    style={{fontFamily:"var(--font-display)"}}>
                    {o}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="border border-border bg-card">
            {/* Header */}
            <div className="grid items-center border-b border-border bg-muted px-4 py-2.5"
              style={{gridTemplateColumns:SURVEY_HISTORY_COLS}}>
              {["Project","Issue Date","Trigger","Response","Status","Score",""].map(h=>(
                <div key={h} className="text-sm font-semibold text-foreground" style={{fontFamily:"var(--font-display)"}}>{h}</div>
              ))}
            </div>

            {filteredPs.length===0&&<div className="text-center py-12 text-base text-muted-foreground">{loadError?loadError:loading?"Loading surveys…":surveySearch?"No surveys match your search.":"No surveys yet."}</div>}

            {filteredPs.map(s=>{
              const cfg=surveyRowStatus(s);
              const pct=surveyResponseRate(s);
              const isEx=exId===s.id;
              const sTag=projectTagStyle(project.score);
              return (
                <div key={s.id} className="border-b border-border last:border-b-0">
                  {/* Row */}
                  <div role={surveyCanExpand(s)?"button":undefined} onClick={()=>{if(surveyCanExpand(s)){setExId(isEx?null:s.id);setRawId(null);}}}
                    className={`w-full grid items-center px-4 py-3.5 transition-colors text-left gap-2 ${surveyCanExpand(s)?"hover:bg-muted/40 cursor-pointer":"cursor-default"}`}
                    style={{gridTemplateColumns:SURVEY_HISTORY_COLS}}>

                    {/* Project */}
                    <div className={`text-xs font-bold px-2 py-1 w-fit max-w-[102px] truncate ${sTag.bg} ${sTag.text}`}>{project.name}</div>

                    {/* Issue date */}
                    <div className="text-sm font-semibold text-foreground" style={{fontFamily:"var(--font-mono)"}}>{fmtDate(s.sentDate)}</div>

                    {/* Trigger */}
                    <div className={`text-[14px] font-medium truncate pr-3 ${triggerColor(s.trigger)}`}>{s.trigger}</div>

                    {/* Response bar */}
                    <div className="min-w-0">
                      <div className="h-1.5 bg-muted mb-1">
                        <div className="h-full transition-all" style={{width:`${pct}%`,backgroundColor:pct>=70?"var(--health-good)":pct>=40?"var(--health-warn)":"var(--health-crit)"}}/>
                      </div>
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="text-sm font-bold" style={{fontFamily:"var(--font-mono)",color:pct>=70?"var(--health-good)":pct>=40?"var(--health-warn)":"var(--health-crit)"}}>{pct}%</span>
                        <span className="text-xs text-muted-foreground">{s.responseCount}/{s.targetCount}</span>
                      </div>
                    </div>

                    {/* Status */}
                    <div className={`text-sm font-bold ${cfg.c}`} style={{fontFamily:"var(--font-display)"}}>{cfg.l}</div>

                    {/* Score */}
                    <div>
                      {s.scores?(
                        <span className="text-base font-bold tabular-nums" style={{fontFamily:"var(--font-mono)",color:hColor(Math.round((Object.values(s.scores).reduce((a,b)=>a+b,0))/5))}}>
                          {Math.round((Object.values(s.scores).reduce((a,b)=>a+b,0))/5)}
                        </span>
                      ):s.status==="closed"?<span className="text-xs text-amber-500">…</span>
                      :surveyHasResults(s)?<span className="text-sm text-muted-foreground">—</span>:<span className="text-sm text-muted-foreground">—</span>}
                    </div>

                    <div className="flex items-center justify-end gap-1" onClick={e=>e.stopPropagation()}>
                      {s.status==="active"&&s.publicUrl&&<CopySurveyLinkButton url={s.publicUrl}/>}
                      {s.status==="active"&&<RemindSurveyButton surveyId={s.id} onDone={onSurveySent}/>}
                      {s.status==="active"&&<CloseSurveyFormButton surveyId={s.id} onClosed={onSurveySent}/>}
                      {s.status==="failed"&&!s.scores&&<CloseSurveyFormButton surveyId={s.id} onClosed={onSurveySent} mode="score"/>}
                      {!s.questionsLocked&&["draft","paused","failed"].includes(s.status)&&(s.questions?.length??0)>0&&(
                        <button type="button" onClick={()=>setReviewSurvey(s)}
                          className="shrink-0 whitespace-nowrap text-xs font-semibold border border-border px-2 py-1 text-foreground hover:border-primary hover:text-primary">
                          Review
                        </button>
                      )}
                      {surveyCanExpand(s)?<ChevronDown size={14} className={`text-muted-foreground transition-transform ${isEx?"rotate-180":""}`}/>:null}
                    </div>
                  </div>

                  {/* Expanded */}
                  <AnimatePresence>
                    {isEx&&surveyCanExpand(s)&&(
                      <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} transition={{duration:0.18}} className="overflow-hidden">
                        <div className="border-t border-border">
                          <div className="px-5 py-4 border-b border-border">
                            <SurveyAskedQuestions questions={s.questions}/>
                            {surveyHasResults(s)&&(
                              <>
                            <div className="text-sm font-bold text-muted-foreground mb-3">AI Summary</div>
                            {surveyDeliveryChannels(s)&&<div className="text-xs text-muted-foreground mb-3">Delivered via {surveyDeliveryChannels(s)} · closed {s.closedAt?fmtDate(s.closedAt):`by ${fmtDate(s.delivery?.expiresAt||"")}`}</div>}
                            {s.scores&&<SurveyCategoryScores scores={s.scores}/>}
                            {s.analysisError?.startsWith("insufficient_responses")
                              ?<div className="border border-amber-400/40 bg-amber-50 dark:bg-amber-950/20 p-4 text-sm text-amber-700 dark:text-amber-300 mb-4">Results are hidden because no responses were collected.</div>
                              :s.aiInsight&&<p className="text-[14px] text-foreground leading-relaxed mb-4">{s.aiInsight}</p>}
                            {s.analysisError?.startsWith("raw_responses_hidden")&&<div className="text-xs text-muted-foreground mb-3">Individual answers stay hidden until the anonymous minimum is reached. Category scores above are from AI analysis.</div>}
                            {s.themes.length>0&&<div className="border border-border divide-y divide-border">
                              {s.themes.map((t,i)=>(
                                <div key={i} className="flex gap-3 px-4 py-3 items-start">
                                  <span className="shrink-0 w-5 h-5 flex items-center justify-center bg-primary text-primary-foreground text-xs font-bold mt-0.5">{i+1}</span>
                                  <span className="text-[14px] text-foreground leading-relaxed">{t}</span>
                                </div>
                              ))}
                            </div>}
                              </>
                            )}
                          </div>
                          {/* Raw responses */}
                          {s.rawResponses.length>0&&(
                            <div className="px-5 py-3.5">
                              <button onClick={()=>setRawId(rawId===s.id?null:s.id)}
                                className="flex items-center gap-2 text-sm font-semibold text-primary hover:opacity-75 transition-opacity">
                                <ChevronDown size={13} className={`transition-transform ${rawId===s.id?"rotate-180":""}`}/>
                                {rawId===s.id?"Hide":"Show"} raw responses ({s.rawResponses.length} questions · {s.responseCount} respondents)
                              </button>
                              <AnimatePresence>
                                {rawId===s.id&&(
                                  <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} transition={{duration:0.14}} className="overflow-hidden mt-4">
                                    <div className="space-y-4">
                                      {s.rawResponses.map((qr,qi)=>(
                                        <div key={qi} className="border border-border">
                                          <div className="bg-muted px-4 py-2.5 border-b border-border flex items-center gap-2">
                                            <span className="text-xs font-bold text-muted-foreground">Q{qi+1}</span>
                                            <span className="text-[14px] font-semibold text-foreground">{qr.question}</span>
                                          </div>
                                          <div className="grid grid-cols-2 divide-x divide-border">
                                            {qr.answers.map((ans,ai)=>(
                                              <div key={ai} className={`flex items-start gap-2.5 px-4 py-2.5 ${ai>=2?"border-t border-border":""}`}>
                                                <span className="shrink-0 text-xs font-bold text-muted-foreground mt-0.5 w-5" style={{fontFamily:"var(--font-mono)"}}>R{ai+1}</span>
                                                <span className="text-[13px] text-foreground leading-snug">{ans}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showRubric&&<SurveyRubricPanel key="rubric" onClose={()=>setShowRubric(false)}/>}
      </AnimatePresence>
      <AnimatePresence>
        {showGenerateDemo&&<SendSurveyModal key="gen-demo" onClose={()=>setShowGenerateDemo(false)} project={project}
          customGuidance={customGuidance}
          draftSurvey={manualDraft}
          onSent={onSurveySent}
          demoOnly/>}
      </AnimatePresence>
      <AnimatePresence>
        {showSend&&<SendSurveyModal key="send" onClose={()=>setShowSend(false)} project={project}
          customGuidance={customGuidance}
          audienceSize={audienceSize}
          draftSurvey={manualDraft}
          onSent={onSurveySent}/>}
      </AnimatePresence>
      <AnimatePresence>
        {reviewSurvey&&<ReviewScheduledSurveyModal key="review" survey={reviewSurvey}
          onClose={()=>setReviewSurvey(null)} onChanged={onSurveySent}/>}
      </AnimatePresence>
    </div>
  );
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────

interface ConnectorField { label:string; key:string; placeholder:string; type?:"text"|"password"; hint?:string; }
interface ConnectorDef { id:string; name:string; icon:React.ReactNode; color:string; description:string; fields:ConnectorField[]; docsUrl:string; }

const CONNECTORS:ConnectorDef[]=[
  {
    id:"jira", name:"Jira", color:"text-blue-600", docsUrl:"https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/",
    icon:<svg viewBox="0 0 32 32" width={20} height={20} fill="currentColor"><path d="M15.88 0C9.8 0 4.86 4.94 4.86 11.03c0 3.33 1.5 6.32 3.88 8.3L15.88 32l7.14-12.67c2.38-1.98 3.88-4.97 3.88-8.3C26.9 4.94 21.96 0 15.88 0zm0 15.57a4.54 4.54 0 1 1 0-9.08 4.54 4.54 0 0 1 0 9.08z"/></svg>,
    description:"Pull sprint velocity, ticket closure rate, and open blockers directly from your Jira board.",
    fields:[
      {label:"Jira URL",key:"url",placeholder:"https://yourorg.atlassian.net",hint:"Your Atlassian domain URL"},
      {label:"API Email",key:"email",placeholder:"you@company.com",hint:"The email associated with your Atlassian account"},
      {label:"API Token",key:"token",placeholder:"ATATT3xFf…",type:"password",hint:"Generate at id.atlassian.com → Security → API tokens"},
      {label:"Project Key",key:"projectKey",placeholder:"PROJ",hint:"The short key shown in your Jira board URL (e.g. PROJ for PROJ-123)"},
    ],
  },
  {
    id:"sonarqube", name:"SonarQube", color:"text-violet-600", docsUrl:"https://docs.sonarqube.org/latest/user-guide/user-account/generating-and-using-tokens/",
    icon:<ShieldCheck size={20}/>,
    description:"Track code quality score, code smells, coverage, and technical debt from SonarQube or SonarCloud.",
    fields:[
      {label:"Server URL",key:"url",placeholder:"https://sonarcloud.io  or  http://localhost:9000",hint:"SonarCloud or self-hosted SonarQube URL"},
      {label:"Auth Token",key:"token",placeholder:"squ_abc123…",type:"password",hint:"Generate in SonarQube → My Account → Security"},
      {label:"Project Key",key:"projectKey",placeholder:"my-org_my-project",hint:"Found in SonarQube → Project → Project Information"},
    ],
  },
  {
    id:"github", name:"GitHub", color:"text-foreground", docsUrl:"https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token",
    icon:<GitBranch size={20}/>,
    description:"Pull commit frequency, PR cycle time, and deployment frequency from your GitHub repository.",
    fields:[
      {label:"Personal Access Token",key:"token",placeholder:"ghp_abc123…",type:"password",hint:"Create at github.com → Settings → Developer settings → Personal access tokens. Scopes needed: repo"},
      {label:"Organization / Owner",key:"org",placeholder:"your-org",hint:"Your GitHub organization name or username"},
      {label:"Repository",key:"repo",placeholder:"my-repo",hint:"Repository name (without the org prefix)"},
    ],
  },
];

function ConnectorCard({def}:{def:ConnectorDef}) {
  const [open,setOpen]=useState(false);
  const [vals,setVals]=useState<Record<string,string>>(Object.fromEntries(def.fields.map(f=>[f.key,""])));
  const [testing,setTesting]=useState(false);
  const [status,setStatus]=useState<"idle"|"ok"|"err">("idle");
  const connected=Object.values(vals).every(v=>v.trim().length>0);
  const test=()=>{setTesting(true);setTimeout(()=>{setTesting(false);setStatus(connected?"ok":"err");},1400);};
  return (
    <div className="border border-border bg-card">
      <button onClick={()=>setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors text-left">
        <div className="flex items-center gap-4">
          <span className={`shrink-0 ${def.color}`}>{def.icon}</span>
          <div>
            <div className="text-[15px] font-bold text-foreground" style={{fontFamily:"var(--font-display)"}}>{def.name}</div>
            <div className="text-sm text-muted-foreground mt-0.5">{def.description}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          {status==="ok"&&<span className="text-sm font-semibold text-emerald-500 flex items-center gap-1.5"><Check size={13}/>Connected</span>}
          {status==="err"&&<span className="text-sm font-semibold text-red-500">Connection failed</span>}
          {status==="idle"&&!connected&&<span className="text-sm text-muted-foreground">Not configured</span>}
          {status==="idle"&&connected&&<span className="text-sm font-medium text-amber-500">Configured — test it</span>}
          <ChevronDown size={15} className={`text-muted-foreground transition-transform ${open?"rotate-180":""}`}/>
        </div>
      </button>
      <AnimatePresence>
        {open&&(
          <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} transition={{duration:0.15}} className="overflow-hidden">
            <div className="border-t border-border px-5 py-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {def.fields.map(f=>(
                  <div key={f.key}>
                    <label className="block text-sm font-semibold text-foreground mb-1.5" style={{fontFamily:"var(--font-display)"}}>{f.label}</label>
                    <input
                      type={f.type||"text"}
                      value={vals[f.key]}
                      onChange={e=>setVals(prev=>({...prev,[f.key]:e.target.value}))}
                      placeholder={f.placeholder}
                      className="w-full bg-input-background border border-border px-3 py-2.5 text-[14px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors font-mono"
                    />
                    {f.hint&&<div className="text-xs text-muted-foreground mt-1 leading-relaxed">{f.hint}</div>}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <a href={def.docsUrl} target="_blank" rel="noreferrer"
                  className="text-sm text-primary flex items-center gap-1 hover:opacity-75 transition-opacity">
                  <Link2 size={12}/> View API docs
                </a>
                <div className="flex items-center gap-3">
                  {status==="ok"&&<span className="text-sm text-emerald-500 font-medium flex items-center gap-1"><Check size={13}/>Connection verified</span>}
                  {status==="err"&&<span className="text-sm text-red-500 font-medium">Check your credentials and try again</span>}
                  <button onClick={test} disabled={!Object.values(vals).some(v=>v.trim())||testing}
                    className="flex items-center gap-2 border border-border px-4 py-2 text-sm font-semibold text-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{fontFamily:"var(--font-display)"}}>
                    {testing?<><RefreshCw size={13} className="animate-spin"/>Testing…</>:<><Link2 size={13}/>Test Connection</>}
                  </button>
                  <button onClick={()=>{setStatus("idle");}}
                    className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity"
                    style={{fontFamily:"var(--font-display)"}}>
                    Save
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SettingsView({project}:{project:Project;}) {
  const [tab,setTab]=useState<"team"|"questions"|"notifications"|"connectors">("team");
  const {settings,update}=useProjectSurveySettings(project.id);
  const [draftMember,setDraftMember]=useState({n:"",r:"",e:""});
  const team=settings.team;
  const qi=settings.guidance;
  const addMember=()=>{
    if(!draftMember.n.trim()||!draftMember.e.trim()) return;
    update(prev=>({...prev,team:[...prev.team,{n:draftMember.n.trim(),r:draftMember.r.trim()||"Team member",e:draftMember.e.trim()}]}));
    setDraftMember({n:"",r:"",e:""});
  };
  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-4xl mx-auto px-8 py-8">
        <h2 className="text-3xl font-bold uppercase tracking-wide mb-7" style={{fontFamily:"var(--font-display)"}}>Settings — {project.name}</h2>
        <div className="flex items-center border-b border-border mb-8">
          {(["team","questions","notifications","connectors"] as const).map(t=>(
            <button key={t} onClick={()=>setTab(t)}
              className={`px-6 py-3 text-[15px] font-semibold capitalize transition-colors -mb-px ${tab===t?"border-b-2 border-primary text-primary":"text-foreground/70 hover:text-foreground"}`}
              style={{fontFamily:"var(--font-display)"}}>
              {t==="questions"?"Question Guidance":t.charAt(0).toUpperCase()+t.slice(1)}
            </button>
          ))}
        </div>
        {tab==="team"&&(
          <div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="text-[15px] font-bold text-foreground">Team directory — {team.length} members</div>
                <p className="text-sm text-muted-foreground mt-1">This list is local notes only. Survey response rate (`1 of N`) uses how many `projectmember` rows have role DEVELOPER. The public form stays anonymous.</p>
              </div>
            </div>
            <div className="border border-border bg-card mb-4">
              {team.map((m,i)=>(
                <div key={`${m.e}-${i}`} className="flex items-center justify-between px-5 py-4 border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-primary/15 text-primary flex items-center justify-center text-sm font-bold" style={{fontFamily:"var(--font-display)"}}>{m.n.split(" ").map(n=>n[0]).join("")}</div>
                    <div><div className="text-[15px] font-semibold text-foreground">{m.n}</div><div className="text-sm text-muted-foreground">{m.r}</div></div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-[15px] text-muted-foreground" style={{fontFamily:"var(--font-mono)"}}>{m.e}</span>
                    <button onClick={()=>update(prev=>({...prev,team:prev.team.filter((_,idx)=>idx!==i)}))} className="text-muted-foreground hover:text-red-500 transition-colors"><X size={15}/></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2">
              <input value={draftMember.n} onChange={e=>setDraftMember(m=>({...m,n:e.target.value}))} placeholder="Name"
                className="bg-card border border-border px-3 py-2 text-sm outline-none focus:border-primary"/>
              <input value={draftMember.r} onChange={e=>setDraftMember(m=>({...m,r:e.target.value}))} placeholder="Role"
                className="bg-card border border-border px-3 py-2 text-sm outline-none focus:border-primary"/>
              <input value={draftMember.e} onChange={e=>setDraftMember(m=>({...m,e:e.target.value}))} placeholder="Email"
                className="bg-card border border-border px-3 py-2 text-sm outline-none focus:border-primary"/>
              <button onClick={addMember} className="flex items-center justify-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-90">
                <Plus size={14}/>Add
              </button>
            </div>
          </div>
        )}
        {tab==="questions"&&(
          <div>
            <div className="mb-6">
              <div className="text-[15px] font-bold text-foreground mb-1">Question Generation Instructions</div>
              <p className="text-[15px] text-muted-foreground leading-relaxed">These instructions are sent to Gemini when you generate a survey. Be specific about what topics, concerns, or dynamics you want surfaced.</p>
            </div>
            <div className="space-y-3">
              {qi.map((inst,idx)=>(
                <div key={inst.id} className="bg-card border border-border p-4 flex items-start gap-3">
                  <div className="shrink-0 w-7 h-7 flex items-center justify-center text-sm font-bold text-muted-foreground border border-border mt-2" style={{fontFamily:"var(--font-mono)"}}>{idx+1}</div>
                  <textarea value={inst.text} rows={2} placeholder="Describe what the AI should ask about…"
                    onChange={e=>update(prev=>({...prev,guidance:prev.guidance.map(i=>i.id===inst.id?{...i,text:e.target.value}:i)}))}
                    className="flex-1 bg-input-background border border-border px-4 py-3 text-[15px] placeholder:text-muted-foreground outline-none focus:border-primary resize-none transition-colors"/>
                  <button onClick={()=>update(prev=>({...prev,guidance:prev.guidance.filter(i=>i.id!==inst.id)}))} className="shrink-0 mt-3 text-muted-foreground hover:text-red-500 transition-colors"><X size={15}/></button>
                </div>
              ))}
            </div>
            <button onClick={()=>update(prev=>({...prev,guidance:[...prev.guidance,{id:`qi${Date.now()}`,text:""}]}))} className="mt-4 flex items-center gap-2 text-[15px] text-primary font-semibold hover:opacity-75 transition-opacity"><Plus size={15}/>Add instruction</button>
          </div>
        )}
        {tab==="notifications"&&(
          <div className="space-y-3">
            {[{l:"Health score drops below 60",s:"Immediate alert via email",on:true},{l:"Score change exceeds 8 points in 7 days",s:"Weekly digest email",on:true},{l:"Survey response rate below 50%",s:"Alert at 48h after send",on:false},{l:"Action effectiveness review due",s:"Reminder after 2 weeks",on:true},{l:"New survey results available",s:"In-app notification",on:true}].map((n,i)=>(
              <div key={i} className="bg-card border border-border px-5 py-4 flex items-center justify-between">
                <div><div className="text-[15px] font-semibold text-foreground">{n.l}</div><div className="text-sm text-muted-foreground mt-0.5">{n.s}</div></div>
                <div className={`w-12 h-6 relative cursor-pointer border transition-colors ${n.on?"bg-primary border-primary":"bg-muted border-border"}`}>
                  <div className={`absolute top-0.5 w-5 h-5 bg-white transition-transform ${n.on?"translate-x-6":"translate-x-0.5"}`}/>
                </div>
              </div>
            ))}
          </div>
        )}
        {tab==="connectors"&&(
          <div>
            <div className="mb-6">
              <div className="text-[15px] font-bold text-foreground mb-1">Data Connectors</div>
              <p className="text-[15px] text-muted-foreground leading-relaxed">
                Connect external tools to automatically populate metrics. Once connected, Pulse pulls data on each sync — no manual entry needed.
              </p>
            </div>
            <div className="space-y-3">
              {CONNECTORS.map(def=><ConnectorCard key={def.id} def={def}/>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SURVEY TAKE FLOW ─────────────────────────────────────────────────────────

// ─── APP ──────────────────────────────────────────────────────────────────────

const VCS_PROVIDERS:VcsProvider[]=["github","gitlab","bitbucket"];
const VCS_LABELS:Record<string,string>={github:"GitHub",gitlab:"GitLab",bitbucket:"Bitbucket"};

export default function App() {
  const {user,isAuthenticated,isAuthLoading,activeWorkspace,setActiveWorkspace,logout}=useWorkspace();
  const location=useLocation();
  const navigate=useNavigate();
  const parsed=useMemo(()=>screenFromPath(location.pathname),[location.pathname]);
  const screen=parsed.screen;
  const activeId=parsed.projectId;
  // Links carry tokens: /reset-password?token=... and /register?invite=... — read them off the URL.
  const searchParams=useMemo(()=>new URLSearchParams(location.search),[location.search]);
  const resetToken=screen==="reset-password" ? searchParams.get("token") : null;
  const inviteToken=screen==="register" ? searchParams.get("invite") : null;
  const [dark,setDark]=useState(false);
  const [logOpen,setLogOpen]=useState(false);
  const [actions,setActions]=useState<Action[]>([]);
  const [surveyDemo,setSurveyDemo]=useState(false);
  const {projects,setProjects,loading:projectsLoading,error:projectsError,refetch:refetchHealth}=useBackendProjects();
  // Real vcs per project (company-scoped) from our own API — used to group workspaces and filter the portfolio.
  const [vcsById,setVcsById]=useState<Map<number,string>>(new Map());
  useEffect(()=>{
    if(!isAuthenticated) return;
    listProjects()
      .then(rows=>setVcsById(new Map(rows.filter(r=>r.vcs).map(r=>[r.id,r.vcs as string]))))
      .catch(()=>{});
  },[isAuthenticated]);
  // The URL is the source of truth for the active workspace; the context value is a remembered fallback (used on project pages, which carry no vcs in the path).
  const urlVcs=parsed.vcs;
  const activeVcs=urlVcs ?? activeWorkspace?.vcs ?? null;
  const isValidVcs=(v:string|null|undefined):v is VcsProvider=>v!=null&&VCS_PROVIDERS.includes(v as VcsProvider);
  const workspaceLabel=activeVcs?(VCS_LABELS[activeVcs]??activeVcs):undefined;
  const portfolioPath=isValidVcs(activeVcs)?paths.workspacePortfolio(activeVcs):paths.portfolio;
  // Keep the context/localStorage preference in sync with whatever workspace the URL currently points at.
  useEffect(()=>{
    if(!isValidVcs(urlVcs)||activeWorkspace?.vcs===urlVcs) return;
    setActiveWorkspace({id:`ws-${urlVcs}`,name:urlVcs,vcs:urlVcs,projectsCount:0,membersCount:0});
  },[urlVcs,activeWorkspace,setActiveWorkspace]);
  // Portfolio is scoped to the chosen vcs workspace (and, via our company-scoped map, the user's company).
  const visibleProjects=useMemo(()=>
    activeVcs
      ? projects.filter(p=>p.backendProjectId && vcsById.get(Number(p.backendProjectId))===activeVcs)
      : projects
  ,[projects,activeVcs,vcsById]);
  // Selecting a vcs workspace navigates to its portfolio URL — the route drives the rest.
  const selectVcsWorkspace=useCallback((vcs:string)=>{
    navigate(paths.workspacePortfolio(vcs));
  },[navigate]);
  const [trackedIds,setTrackedIds]=useState<Set<string>>(new Set());
  useEffect(()=>{
    if(projects.length===0) return;
    setTrackedIds(prev=>{
      if(prev.size>0) return prev;
      return new Set(projects.map(p=>p.id));
    });
  },[projects]);
  const toggleTracked=(id:string)=>setTrackedIds(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});
  useEffect(()=>{document.documentElement.classList.toggle("dark",dark);},[dark]);
  const active=useMemo(()=>findProjectByPath(projects,activeId),[activeId,projects]);
  const go=useCallback((next:Screen)=>{
    // "portfolio" is workspace-scoped, so route it to the active workspace's url rather than bare "/".
    if(next==="portfolio"){navigate(portfolioPath);return;}
    navigate(pathFromScreen(next, active?.id ?? activeId));
  },[navigate,active?.id,activeId,portfolioPath]);
  useEffect(()=>{
    if(!active || !activeId || active.id===activeId) return;
    navigate(pathFromScreen(screen, active.id), { replace: true });
  },[active,activeId,screen,navigate]);
  // Real survey data for backend-synced projects; demo-only projects (no backendProjectId) keep their static mock surveys.
  const {surveys:realSurveys,refetch:refetchSurveys,error:surveysError,loading:surveysLoading}=useSurveys(projects);
  const surveys=useMemo(()=>{
    const mockOnly=SURVEYS.filter(s=>projects.some(p=>p.id===s.projectId&&!p.backendProjectId));
    return [...mockOnly,...realSurveys];
  },[realSurveys,projects]);
  const updateProjectRisk=useCallback((projectId:string,riskScore?:number,riskScores?:Partial<Record<SyncRiskKey,number|null>>)=>{
    setProjects(prev=>prev.map(p=>{
      if(p.id!==projectId) return p;
      const subscores={...p.subscores};
      if(riskScores){
        if(typeof riskScores.DELIVERY==="number") subscores.delivery=riskScores.DELIVERY;
        if(typeof riskScores.CODE_QUALITY==="number") subscores.codeQuality=riskScores.CODE_QUALITY;
        if(typeof riskScores.CICD_RELIABILITY==="number") subscores.cicd=riskScores.CICD_RELIABILITY;
        if(typeof riskScores.TEAM_HEALTH==="number") subscores.teamHealth=riskScores.TEAM_HEALTH;
      }
      if(typeof riskScore!=="number") return {...p,subscores};
      return {...p,subscores,score:riskScore,scoreTrend:riskScore-p.score};
    }));
    void refetchHealth({ silent: true });
  },[refetchHealth]);
  const refreshActions=useCallback(async()=>{
    if(!isAuthenticated){setActions([]);return;}
    const rows=await listActions();
    setActions(rows);
  },[isAuthenticated]);
  useEffect(()=>{void refreshActions().catch(()=>setActions([]));},[refreshActions]);
  const handleLogAction=useCallback(async(input:{projectIds:string[];problem:string;reason:string;actionTaken:string;timestamp:string})=>{
    await createAction({...input,loggedBy:user?.name??user?.email??"Unknown user"});
    await refreshActions();
  },[user,refreshActions]);
  const handleRateAction=useCallback(async(id:string,rating:number)=>{
    setActions(current=>current.map(action=>action.id===id?{...action,effectiveness:rating}:action));
    try{await rateAction(id,rating);}catch(error){await refreshActions();throw error;}
  },[refreshActions]);
  const pendingRatings=useMemo(()=>actions.filter(a=>a.effectiveness===null),[actions]);
  const [ratingOpen,setRatingOpen]=useState(false);
  const sel=(id:string)=>{navigate(pathFromScreen("dashboard", id));};
  const home=()=>{navigate(portfolioPath);};
  const renderContent=()=>{
    if(projectsLoading){
      if(parsed.projectId) return <ProjectPageSkeleton/>;
      return <PortfolioView
        projects={[]} actions={actions} surveys={surveys} loading
        onSelect={sel} onLogAction={()=>setLogOpen(true)}
        onViewActions={()=>go("global-actions")}
        onViewSurveys={()=>go("global-surveys")}
        onRatingOpen={()=>setRatingOpen(true)}
        trackedIds={trackedIds} onToggleTracked={toggleTracked}
        onSyncComplete={updateProjectRisk}
      />;
    }
    if(projectsError && projects.length===0){
      return (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <AlertTriangle size={28} className="mx-auto text-amber-500 mb-3"/>
            <div className="text-lg font-bold mb-1" style={{fontFamily:"var(--font-display)"}}>Couldn’t load projects</div>
            <p className="text-sm text-muted-foreground mb-4">{projectsError}</p>
            <button onClick={()=>void refetchHealth()} className="bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold">Try again</button>
          </div>
        </div>
      );
    }
    if(screen==="global-actions")
      return <GlobalActionsView actions={actions} projects={projects} onBack={home} onLogAction={()=>setLogOpen(true)} onRateAction={(id,rating)=>void handleRateAction(id,rating)}/>;
    if(screen==="global-surveys")
      return <GlobalSurveysView surveys={surveys} projects={projects} onBack={home} onClosed={refetchSurveys}/>;
    if(screen==="portfolio"||!active)
      return <PortfolioView
        projects={visibleProjects} actions={actions} surveys={surveys}
        onSelect={sel} onLogAction={()=>setLogOpen(true)}
        onViewActions={()=>go("global-actions")}
        onViewSurveys={()=>go("global-surveys")}
        onRatingOpen={()=>setRatingOpen(true)}
        trackedIds={trackedIds} onToggleTracked={toggleTracked}
        onAddProject={()=>go("add-project")} isAdmin={user?.role==="admin"}
        workspaceName={workspaceLabel} onBackToWorkspaces={()=>go("workspaces")}
        onSyncComplete={updateProjectRisk}
      />;
    const view=()=>{switch(screen){
      case"dashboard": return <Dashboard project={active} actions={actions} surveys={surveys} onNavigate={go} onSyncComplete={updateProjectRisk}/>;
      case"actions-timeline": return <ActionsTimeline project={active} actions={actions}/>;
      case"actions-library": return <ActionsLibrary actions={actions} projectId={active.id}/>;
      case"surveys": return <SurveysView project={active} surveys={surveys} onSurveySent={refetchSurveys} loadError={surveysError} loading={surveysLoading}/>;
      case"settings": return <SettingsView project={active}/>;
      default: return null;
    }};
    return <div className="flex flex-1 min-h-0"><Sidebar screen={screen} onNavigate={go} project={active} onLogAction={()=>setLogOpen(true)}/>{view()}</div>;
  };
  if(parsed.surveyToken){
    return <PublicSurveyPage token={parsed.surveyToken}/>;
  }
  if(isAuthLoading){
    return <div className="h-screen flex items-center justify-center bg-background text-muted-foreground text-sm">Loading…</div>;
  }
  if(!isAuthenticated){
    if(screen==="register"){
      return <RegisterView onSuccess={()=>navigate("/workspaces")} onNavigateToLogin={()=>navigate("/login")} inviteToken={inviteToken ?? undefined}/>;
    }
    if(screen==="forgot-password"){
      return <ForgotPasswordView onBackToLogin={()=>navigate("/login")}/>;
    }
    if(screen==="reset-password"){
      return <ResetPasswordView token={resetToken} onSuccess={()=>navigate("/login")} onBackToLogin={()=>navigate("/login")}/>;
    }
    return <LoginView onSuccess={()=>navigate("/workspaces")} onNavigateToRegister={()=>navigate("/register")} onNavigateToForgot={()=>navigate("/forgot-password")}/>;
  }
  if(screen==="login"||screen==="register"||screen==="forgot-password"||screen==="reset-password"){
    return <Navigate to={portfolioPath} replace/>;
  }
  // Bare "/" (or an unknown workspace) resolves to the remembered workspace, else the chooser — the url stays the source of truth.
  if(screen==="portfolio" && !isValidVcs(urlVcs)){
    const remembered=activeWorkspace?.vcs;
    return <Navigate to={isValidVcs(remembered)?paths.workspacePortfolio(remembered):paths.workspaces} replace/>;
  }
  if(screen==="projects"){
    return <ProjectsView onAddProject={()=>go("add-project")}/>;
  }
  if(screen==="add-project"){
    // Only admins can create projects — members never reach the form.
    if(user?.role!=="admin") return <ProjectsView onAddProject={()=>go("add-project")}/>;
    return <AddProjectView onCreated={()=>{void refetchHealth();go("portfolio");}} onCancel={()=>go("portfolio")}/>;
  }
  if(screen==="workspaces"){
    return (
      <VcsWorkspaceView
        onSelect={selectVcsWorkspace}
        onAddProject={()=>navigate("/projects/new")}
        isAdmin={user?.role==="admin"}
      />
    );
  }
  if(screen==="create-workspace"){
    return (
      <CreateWorkspaceView
        onBack={()=>navigate("/workspaces")}
        onCreated={()=>navigate("/")}
      />
    );
  }
  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <TopBar dark={dark} onToggle={()=>setDark(!dark)} projects={projects} activeId={activeId} onSelect={sel} onHome={home}
        pendingCount={pendingRatings.length} onRatingOpen={()=>setRatingOpen(true)} onManageWorkspaces={()=>go("workspaces")}/>
      <div className="flex-1 flex min-h-0">{renderContent()}</div>
      {(screen==="portfolio"||screen==="global-actions"||screen==="global-surveys")&&(
        <div className="border-t border-border bg-card px-6 py-2.5 flex items-center gap-6 text-sm text-muted-foreground">
          <span className="text-xs uppercase font-bold text-foreground/40" style={{fontFamily:"var(--font-display)"}}>Demo</span>
          <button onClick={()=>setSurveyDemo(true)} className="hover:text-primary transition-colors flex items-center gap-1.5"><MessageSquare size={13}/>Preview survey flow</button>
          <button onClick={()=>{
            const critical=projects.filter(p=>p.hasData).sort((a,b)=>a.score-b.score)[0];
            if(critical) sel(critical.id);
          }} className="hover:text-primary transition-colors flex items-center gap-1.5"><AlertTriangle size={13}/>Open critical project</button>
        </div>
      )}
      <AnimatePresence>
        {logOpen&&<LogActionModal key="log" onClose={()=>setLogOpen(false)} preId={activeId??undefined} projects={projects} actions={actions} onSubmit={handleLogAction}/>}
      </AnimatePresence>
      <AnimatePresence>
        {surveyDemo&&<SurveyFlow key="sf" onClose={()=>setSurveyDemo(false)}/>}
      </AnimatePresence>
      {/* Global rating panel — accessible from nav icon anywhere in the app */}
      <AnimatePresence>
        {ratingOpen&&(
          <motion.div key="rating-panel" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center" onClick={()=>setRatingOpen(false)}>
            <motion.div initial={{y:32,opacity:0}} animate={{y:0,opacity:1}} exit={{y:32,opacity:0}} transition={{duration:0.18}}
              onClick={e=>e.stopPropagation()}
              className="w-full max-w-xl bg-card border border-border mb-8 mx-4 shadow-2xl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <div>
                  <div className="text-xl font-bold" style={{fontFamily:"var(--font-display)"}}>Effectiveness Review</div>
                  <div className="text-sm text-muted-foreground mt-0.5">{pendingRatings.length} action{pendingRatings.length>1?"s":""} awaiting your rating</div>
                </div>
                <button onClick={()=>setRatingOpen(false)} className="text-muted-foreground hover:text-foreground"><X size={18}/></button>
              </div>
              <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
                {pendingRatings.map(a=>{
                  const projs=projects.filter(p=>a.projectIds.includes(p.id));
                  return (
                    <div key={a.id} className="border border-border p-4">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        {projs.map(p=>{const st=projectTagStyle(p.score);return <span key={p.id} className={`text-xs font-bold px-2 py-0.5 ${st.bg} ${st.text}`}>{p.name}</span>;})}
                        <span className="text-sm text-muted-foreground" style={{fontFamily:"var(--font-mono)"}}>{fmtDate(a.timestamp)}</span>
                      </div>
                      <div className="text-[15px] font-semibold text-foreground mb-1">{a.problem}</div>
                      <div className="text-sm text-muted-foreground mb-4 leading-relaxed">{a.actionTaken}</div>
                      <GlobalEffRow action={a} onRate={rating=>void handleRateAction(a.id,rating)}/>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
