import { useState, useMemo, useEffect } from "react";
import {
  ChevronLeft, ChevronRight, Search, X, ChevronDown, Send, Sparkles, Plus, RefreshCw,
} from "lucide-react";
import {
  LineChart, Line, ResponsiveContainer, Tooltip as ReTooltip, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { motion, AnimatePresence } from "motion/react";
import { getSurveyQuota, type SurveyQuota } from "../api-survey";
import { useProjectSurveySettings } from "../hooks/useProjectSurveySettings";
import type { Project, Survey } from "../types";
import {
  fmtDate, hColor, SURVEY_CATEGORY_LABELS, SURVEY_HISTORY_COLS, surveyResponseRate, surveyDeliveryChannels,
  surveyHasResults, surveyCanExpand, surveyRowStatus, triggerColor, projectTagStyle, SURVEY_STATUS_CONFIG,
} from "../format";
import { Ring } from "../components/ScoreVisuals";
import {
  CopySurveyLinkButton, RemindSurveyButton, CloseSurveyFormButton,
  SurveyAskedQuestions, SurveyCategoryScores, SendSurveyModal, ReviewScheduledSurveyModal, SurveyRubricPanel,
} from "../components/SurveyModals";

export function GlobalSurveysView({surveys,projects,onBack,onClosed}:{surveys:Survey[];projects:Project[];onBack:()=>void;onClosed?:()=>void;}) {
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

        <div className="border border-border bg-card overflow-x-auto">
          <div className="min-w-[860px]">
          <div className="grid gap-3 px-5 py-3 border-b border-border bg-muted"
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
                  className={`w-full grid gap-3 px-5 py-4 transition-colors text-left items-center ${surveyCanExpand(s)?"hover:bg-muted/40 cursor-pointer":"cursor-default"}`}
                  style={{gridTemplateColumns:SURVEY_HISTORY_COLS}}>
                  <span className={`text-xs font-bold px-2 py-1 w-fit max-w-[140px] truncate ${sTag.bg} ${sTag.text}`}>{proj?.name??s.projectId}</span>
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
                  <div className="flex items-center justify-end gap-2" onClick={e=>e.stopPropagation()}>
                    <div className="flex items-center gap-1.5">
                      {s.status==="active"&&s.publicUrl&&<CopySurveyLinkButton url={s.publicUrl}/>}
                      {s.status==="active"&&<RemindSurveyButton surveyId={s.id} onDone={onClosed}/>}
                      {s.status==="active"&&<CloseSurveyFormButton surveyId={s.id} onClosed={onClosed}/>}
                      {s.status==="failed"&&!s.scores&&<CloseSurveyFormButton surveyId={s.id} onClosed={onClosed} mode="score"/>}
                    </div>
                    {surveyCanExpand(s)?<ChevronDown size={14} className={`shrink-0 text-muted-foreground transition-transform ${isEx?"rotate-180":""}`}/>:null}
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
    </div>
  );
}

export function SurveysView({project,surveys,onSurveySent,onRefresh,loadError,loading}:{project:Project;surveys:Survey[];onSurveySent?:()=>void;onRefresh?:()=>void;loadError?:string|null;loading?:boolean;}) {
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
      overall:Math.round(Object.values(s.scores!).reduce((a,b)=>a+b,0)/7),
      security:s.scores!.security,
      reliability:s.scores!.reliability,
      maintainability:s.scores!.maintainability,
      cicdDeploymentHealth:s.scores!.cicdDeploymentHealth,
      teamHealth:s.scores!.teamHealth,
      engineeringProcess:s.scores!.engineeringProcess,
      planningExecution:s.scores!.planningExecution,
    })),[ps]);
  const upcomingAuto=ps.find(s=>s.source==="auto_pulse"&&["draft","paused","failed"].includes(s.status)&&(s.questions?.length??0)>0);
  const manualDraft=ps.find(s=>s.source!=="auto_pulse"&&["draft","paused","failed"].includes(s.status)&&(s.questions?.length??0)>0&&!s.questionsLocked);
  const reviewBanners=[manualDraft,upcomingAuto].filter((s,i,arr):s is Survey=>s!=null&&arr.findIndex(x=>x?.id===s.id)===i);
  const skeys=["security","reliability","maintainability","cicdDeploymentHealth","teamHealth","engineeringProcess","planningExecution"] as const;
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
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-7">

        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-3xl font-bold uppercase tracking-wide" style={{fontFamily:"var(--font-display)"}}>Surveys</h2>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
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
          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
            <button onClick={()=>onRefresh?.()} disabled={loading} title="Refresh surveys"
              className="flex items-center gap-2 border border-border px-3 py-2.5 text-base font-semibold text-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
              style={{fontFamily:"var(--font-display)"}}>
              <RefreshCw size={14} className={loading?"animate-spin":""}/>
            </button>
            <button onClick={()=>setShowGenerateDemo(true)}
              className="flex flex-1 sm:flex-none items-center justify-center gap-2 border border-border px-4 py-2.5 text-base font-semibold text-foreground hover:border-primary hover:text-primary transition-colors whitespace-nowrap"
              style={{fontFamily:"var(--font-display)"}}>
              <Sparkles size={14}/> Test generate
            </button>
            <button onClick={()=>setShowSend(true)}
              className="flex flex-1 sm:flex-none items-center justify-center gap-2 bg-primary text-primary-foreground text-base font-semibold px-5 py-2.5 hover:opacity-90 transition-opacity whitespace-nowrap"
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
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-0">
              <div className="flex flex-col items-center justify-center px-4 py-5 border-r border-border bg-muted/30">
                <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Overall</div>
                <span className="text-5xl font-bold tabular-nums leading-none" style={{fontFamily:"var(--font-mono)",color:hColor(project.score)}}>{project.score}</span>
              </div>
              {skeys.map((k,i)=>(
                <div key={k} className={`flex flex-col items-center justify-between px-2 py-4 ${i<skeys.length-1?"border-r border-border":""}`}>
                  <div className="text-xs font-semibold text-muted-foreground text-center mb-2 leading-tight px-1">{SURVEY_CATEGORY_LABELS[k]}</div>
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
                  <Line type="monotone" dataKey="security" name="Security" stroke="#ef4444" strokeWidth={1.5} dot={false}/>
                  <Line type="monotone" dataKey="reliability" name="Reliability" stroke="#3b82f6" strokeWidth={1.5} dot={false}/>
                  <Line type="monotone" dataKey="maintainability" name="Maintainability" stroke="#10b981" strokeWidth={1.5} dot={false}/>
                  <Line type="monotone" dataKey="cicdDeploymentHealth" name="CI/CD & Deployment" stroke="#8b5cf6" strokeWidth={1.5} dot={false}/>
                  <Line type="monotone" dataKey="teamHealth" name="Team Health" stroke="#f59e0b" strokeWidth={1.5} dot={false}/>
                  <Line type="monotone" dataKey="engineeringProcess" name="Engineering Process" stroke="#06b6d4" strokeWidth={1.5} dot={false}/>
                  <Line type="monotone" dataKey="planningExecution" name="Planning & Execution" stroke="#f97316" strokeWidth={1.5} dot={false}/>
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
                        <span className="text-xs text-muted-foreground">{SURVEY_CATEGORY_LABELS[k]}</span>
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
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="flex flex-1 sm:flex-none items-center gap-2 bg-card border border-border px-3 py-2 min-w-0">
                <Search size={13} className="text-muted-foreground"/>
                <input value={surveySearch} onChange={e=>setSurveySearch(e.target.value)} placeholder="Search…"
                  className="bg-transparent text-sm outline-none min-w-0 w-full sm:w-36 placeholder:text-muted-foreground"/>
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
          <div className="border border-border bg-card overflow-x-auto">
            <div className="min-w-[860px]">
            {/* Header */}
            <div className="grid gap-3 items-center border-b border-border bg-muted px-4 py-2.5"
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
                    className={`w-full grid gap-3 items-center px-4 py-3.5 transition-colors text-left ${surveyCanExpand(s)?"hover:bg-muted/40 cursor-pointer":"cursor-default"}`}
                    style={{gridTemplateColumns:SURVEY_HISTORY_COLS}}>

                    {/* Project */}
                    <div className={`text-xs font-bold px-2 py-1 w-fit max-w-[140px] truncate ${sTag.bg} ${sTag.text}`}>{project.name}</div>

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

                    <div className="flex items-center justify-end gap-2" onClick={e=>e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
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
                      </div>
                      {surveyCanExpand(s)?<ChevronDown size={14} className={`shrink-0 text-muted-foreground transition-transform ${isEx?"rotate-180":""}`}/>:null}
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
