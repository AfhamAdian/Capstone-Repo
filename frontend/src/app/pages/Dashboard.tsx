import { useState } from "react";
import { Link } from "react-router";
import {
  Star, ArrowRight, Check, Rocket, ShieldCheck, GitBranch, Users, AlertTriangle, X,
} from "lucide-react";
import {
  ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  AreaChart, Area, Tooltip as ReTooltip,
} from "recharts";
import { motion, AnimatePresence } from "motion/react";
import type { SyncRiskKey } from "../api";
import type { HealthCategoryKey } from "../api-project";
import type { Project, Action, Survey } from "../types";
import { scoreInt, trendLabel, hColor, hClass, SUBSCORE_LABELS, surveyHasResults, surveyResponseRate, SURVEY_STATUS_CONFIG, fmtDate, toDisplaySubscores, computeCodeQualitySeries, type DisplaySubscores } from "../format";
import { Ring, Spark, TrendIcon } from "../components/ScoreVisuals";
import { MetricModal, MMETA, MVAL } from "../components/MetricModal";
import { DashboardSyncBar } from "../components/DashboardSyncBar";
import { ScoreProvenancePanel } from "../components/ScoreProvenancePanel";

export function Dashboard({project,actions,surveys,onSyncComplete}:{project:Project;actions:Action[];surveys:Survey[];onSyncComplete:(projectId:string,riskScore?:number,riskScores?:Partial<Record<SyncRiskKey,number|null>>)=>void;}) {
  const [expanded,setExpanded]=useState<string|null>(null);
  const [reviewOpen,setReviewOpen]=useState(false);
  const [provenanceFocus,setProvenanceFocus]=useState<"overall"|HealthCategoryKey|null>(null);
  const openProvenance=(focus:"overall"|HealthCategoryKey)=>{
    if(!project.backendProjectId) return;
    setProvenanceFocus(focus);
  };
  // "Why this score" provenance is still keyed to the old 5-category survey-blend model
  // (untouched, see future-work.md #7) - only codeQuality/teamHealth still line up with it.
  const OPENABLE_CATEGORIES=new Set<keyof DisplaySubscores>(["codeQuality","teamHealth"]);
  const display=toDisplaySubscores(project.subscores);
  const displaySeries:Record<keyof DisplaySubscores,{v:number;label:string;date?:string}[]>={
    codeQuality: computeCodeQualitySeries(project.subscoreSeries),
    cicdDeploymentHealth: project.subscoreSeries.cicdDeploymentHealth??[],
    teamHealth: project.subscoreSeries.teamHealth??[],
    engineeringProcess: project.subscoreSeries.engineeringProcess??[],
    planningExecution: project.subscoreSeries.planningExecution??[],
  };
  const radarData=(Object.keys(display) as (keyof DisplaySubscores)[]).map(k=>({subject:SUBSCORE_LABELS[k],value:scoreInt(display[k])}));
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
            <div className="flex items-center justify-between mb-4">
              <div className="text-base font-bold text-foreground" style={{fontFamily:"var(--font-display)"}}>Health Score</div>
              {project.backendProjectId&&(
                <button type="button" onClick={()=>openProvenance("overall")} className="text-xs font-semibold text-primary hover:underline">
                  Why this score
                </button>
              )}
            </div>
            <button type="button" onClick={()=>openProvenance("overall")} className="flex items-end gap-4 mb-5 text-left" title="Inspect how this score was blended">
              <span className="text-8xl font-bold tabular-nums leading-none" style={{fontFamily:"var(--font-mono)",color:hColor(project.score)}}>{scoreInt(project.score)}</span>
              <div className="mb-2 flex flex-col gap-1.5">
                <TrendIcon t={project.scoreTrend} sz={18}/>
                <span className={`text-xl font-bold tabular-nums ${project.scoreTrend>0?"text-emerald-500":project.scoreTrend<0?"text-red-500":"text-muted-foreground"}`} style={{fontFamily:"var(--font-mono)"}}>
                  {trendLabel(project.scoreTrend)}
                </span>
              </div>
            </button>
            <Spark data={project.sparkline} color={hColor(project.score)} w={210} h={48}/>
            {/* Always-visible breakdown */}
            <div className="mt-5 pt-5 border-t border-border space-y-3">
              {(Object.keys(display) as (keyof DisplaySubscores)[]).map(k=>{
                const row=(
                  <div className="flex items-center justify-between w-full text-left -mx-1 px-1 py-0.5">
                    <span className="text-[15px] text-foreground/80">{SUBSCORE_LABELS[k]}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-20 h-2 bg-muted"><div className="h-full" style={{width:`${Math.min(100, Math.max(0, scoreInt(display[k])))}%`,backgroundColor:hColor(display[k])}}/></div>
                      <span className={`text-[15px] font-bold tabular-nums w-8 text-right ${hClass(display[k])}`} style={{fontFamily:"var(--font-mono)"}}>{scoreInt(display[k])}</span>
                    </div>
                  </div>
                );
                if(k==="codeQuality"){
                  return (
                    <div key={k} className="group relative hover:bg-muted/40">
                      {row}
                      <div className="pointer-events-none absolute right-0 top-full z-10 mt-1 hidden w-52 border border-border bg-popover p-3 text-xs shadow-lg group-hover:block">
                        <div className="mb-1.5 font-semibold text-foreground/80">Code Quality breakdown</div>
                        {(["security","reliability","maintainability"] as const).map(sub=>(
                          <div key={sub} className="flex items-center justify-between py-0.5">
                            <span className="capitalize text-muted-foreground">{sub}</span>
                            <span className="font-bold tabular-nums" style={{fontFamily:"var(--font-mono)",color:hColor(project.subscores[sub])}}>{scoreInt(project.subscores[sub])}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }
                return (
                  <button type="button" key={k} disabled={!OPENABLE_CATEGORIES.has(k)} onClick={()=>OPENABLE_CATEGORIES.has(k)&&openProvenance(k as HealthCategoryKey)} className="block w-full hover:bg-muted/40 disabled:cursor-default">
                    {row}
                  </button>
                );
              })}
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
            {(Object.keys(display) as (keyof DisplaySubscores)[]).map(k=>{
              const val = scoreInt(display[k]);
              const series = displaySeries[k];
              const strokeColor = hColor(val);
              const gradId = `ss-${project.id}-${k}`;
              const last = scoreInt(series[series.length-1]?.v ?? val);
              const prev = scoreInt(series[series.length-2]?.v ?? last);
              const delta = last - prev;
              const trendGood = delta >= 0; // higher = better for all subscores
              const minV = scoreInt(series.length?Math.min(...series.map(d=>d.v)):val);
              const maxV = scoreInt(series.length?Math.max(...series.map(d=>d.v)):val);
              const SUBSCORE_ICONS: Record<keyof DisplaySubscores, React.ReactNode> = {
                codeQuality: <ShieldCheck size={13}/>,
                cicdDeploymentHealth: <GitBranch size={13}/>,
                teamHealth: <Users size={13}/>,
                engineeringProcess: <Rocket size={13}/>,
                planningExecution: <AlertTriangle size={13}/>,
              };
              const openable=OPENABLE_CATEGORIES.has(k);
              return (
                <button type="button" key={k} disabled={!openable} onClick={()=>openable&&openProvenance(k as HealthCategoryKey)}
                  className={`group relative bg-card border border-border p-4 flex flex-col text-left transition-colors disabled:cursor-default ${openable?"hover:border-primary/50":""}`}>
                  {/* label + icon */}
                  <div className="flex items-center gap-1.5 mb-3">
                    <span style={{color:strokeColor}}>{SUBSCORE_ICONS[k]}</span>
                    <span className="text-xs font-semibold text-foreground leading-tight" style={{fontFamily:"var(--font-display)"}}>{SUBSCORE_LABELS[k]}</span>
                  </div>
                  {k==="codeQuality"&&(
                    <div className="pointer-events-none absolute left-2 top-full z-10 mt-1 hidden w-52 border border-border bg-popover p-3 text-xs shadow-lg group-hover:block">
                      <div className="mb-1.5 font-semibold text-foreground/80">Code Quality breakdown</div>
                      {(["security","reliability","maintainability"] as const).map(sub=>(
                        <div key={sub} className="flex items-center justify-between py-0.5">
                          <span className="capitalize text-muted-foreground">{sub}</span>
                          <span className="font-bold tabular-nums" style={{fontFamily:"var(--font-mono)",color:hColor(project.subscores[sub])}}>{scoreInt(project.subscores[sub])}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* big score */}
                  <div className="flex items-baseline gap-1.5 mb-1">
                    <span className="text-4xl font-bold tabular-nums leading-none" style={{fontFamily:"var(--font-mono)",color:strokeColor}}>{val}</span>
                    <span className="text-xs font-semibold" style={{color:trendGood?"var(--health-good)":"var(--health-crit)"}}>
                      {trendLabel(delta)}
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
                </button>
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
              <Link to="actions" className="text-sm text-primary flex items-center gap-1 hover:opacity-75 transition-opacity font-medium">
                All actions <ArrowRight size={12}/>
              </Link>
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
              <Link to="surveys" className="text-sm text-primary flex items-center gap-1 hover:opacity-75 transition-opacity font-medium">
                All surveys <ArrowRight size={12}/>
              </Link>
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
        {provenanceFocus&&project.backendProjectId&&(
          <ScoreProvenancePanel
            key="provenance"
            projectId={project.backendProjectId}
            focus={provenanceFocus}
            onClose={()=>setProvenanceFocus(null)}
          />
        )}
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
