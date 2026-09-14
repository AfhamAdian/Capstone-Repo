import { useState } from "react";
import { Link } from "react-router";
import {
  Star, Rocket, ShieldCheck, GitBranch, Users, AlertTriangle,
} from "lucide-react";
import {
  ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  AreaChart, Area, Tooltip as ReTooltip,
} from "recharts";
import { AnimatePresence } from "motion/react";
import type { ActionReviewQueue, SyncRiskKey } from "../api";
import type { Project, Action, Survey } from "../types";
import { actionIncludesProject, scoreInt, trendLabel, hColor, hClass, SUBSCORE_LABELS, surveyResponseRate, SURVEY_STATUS_CONFIG, fmtDate, toDisplaySubscores, computeCodeQualitySeries, ttStyle, type DisplaySubscores } from "../format";
import { TrendIcon } from "../components/ScoreVisuals";
import { ScoreBreakdownModal, SCORE_BREAKDOWN_TYPES } from "../components/ScoreBreakdownModal";
import { DashboardSyncBar } from "../components/DashboardSyncBar";
import { PageShell, SectionHeading, CardHeading } from "../components/PageShell";

const SUBSCORE_ICONS: Record<keyof DisplaySubscores, React.ReactNode> = {
  codeQuality: <ShieldCheck size={13}/>,
  cicdDeploymentHealth: <GitBranch size={13}/>,
  teamHealth: <Users size={13}/>,
  engineeringProcess: <Rocket size={13}/>,
  planningExecution: <AlertTriangle size={13}/>,
};

/**
 * Code Quality is an average of three backend scores, so it's the one row that owes
 * the reader a breakdown. Defined once and anchored by the caller — the dashboard
 * previously carried two hand-synced copies of this markup.
 */
function CodeQualityBreakdown({subscores,align}:{
  subscores:Project["subscores"];
  align:"left"|"right";
}) {
  return (
    <div className={`pointer-events-none absolute ${align==="right"?"right-0":"left-2"} top-full z-10 mt-1 hidden w-52 border border-border bg-popover p-3 text-xs shadow-overlay group-hover:block group-focus-within:block`}>
      <div className="mb-1.5 font-semibold text-foreground">Code Quality is the average of</div>
      {(["security","reliability","maintainability"] as const).map(sub=>(
        <div key={sub} className="flex items-center justify-between py-0.5">
          <span className="capitalize text-muted-foreground">{sub}</span>
          <span className="font-bold tabular-nums" style={{fontFamily:"var(--font-mono)",color:hColor(subscores[sub])}}>{scoreInt(subscores[sub])}</span>
        </div>
      ))}
    </div>
  );
}

/** Latest snapshot behind a display category's trend - Code Quality has no series of its own
 *  (it's a frontend-only merge of security/reliability/maintainability, which share the same
 *  snapshot-history alignment), so it borrows security's. */
function latestSnapshotId(project: Project, k: keyof DisplaySubscores): number | undefined {
  const sourceKey = k === "codeQuality" ? "security" : k;
  const series = project.subscoreSeries[sourceKey];
  return series?.[series.length - 1]?.snapshotId;
}

export function Dashboard({project,actions,surveys,reviewQueue,onSyncComplete,onRatingOpen}:{project:Project;actions:Action[];surveys:Survey[];reviewQueue:ActionReviewQueue|null;onSyncComplete:(projectId:string,riskScore?:number,riskScores?:Partial<Record<SyncRiskKey,number|null>>)=>void;onRatingOpen:()=>void;}) {
  const [breakdownKey,setBreakdownKey]=useState<keyof DisplaySubscores|null>(null);
  const display=toDisplaySubscores(project.subscores);
  const displaySeries:Record<keyof DisplaySubscores,{v:number;label:string;date?:string}[]>={
    codeQuality: computeCodeQualitySeries(project.subscoreSeries),
    cicdDeploymentHealth: project.subscoreSeries.cicdDeploymentHealth??[],
    teamHealth: project.subscoreSeries.teamHealth??[],
    engineeringProcess: project.subscoreSeries.engineeringProcess??[],
    planningExecution: project.subscoreSeries.planningExecution??[],
  };
  const radarData=(Object.keys(display) as (keyof DisplaySubscores)[]).map(k=>({subject:SUBSCORE_LABELS[k],value:scoreInt(display[k])}));
  const pending=[...(reviewQueue?.fromLastWeek??[]),...(reviewQueue?.earlier??[])].filter(action=>actionIncludesProject(action,project));
  const projectActions=actions.filter(a=>actionIncludesProject(a,project));
  const projectSurveys=surveys.filter(s=>s.projectId===project.id);

  return (
    <PageShell className="space-y-8">
      <h1 className="sr-only">{project.name} dashboard</h1>
      <DashboardSyncBar project={project} onSyncComplete={onSyncComplete}/>
      {project.hasData===false&&(
        <div className="border border-border bg-muted/30 px-5 py-3 text-sm text-muted-foreground">
          No health snapshot yet for {project.name}. Run <span className="font-semibold text-foreground">Sync</span> to pull GitHub and Jira metrics.
        </div>
      )}
      {pending.length>0&&(
        <button onClick={onRatingOpen}
          className="w-full flex items-center justify-between gap-4 flex-wrap bg-attention-surface border border-attention-border px-5 py-4 hover:bg-attention/10 transition-colors text-left">
          <span className="text-base font-semibold text-attention flex items-center gap-2.5">
            <Star size={16} className="shrink-0"/>{pending.length} action{pending.length>1?"s":""} pending your effectiveness review
          </span>
          <span className="text-sm text-attention font-semibold underline underline-offset-2">Review now</span>
        </button>
      )}

      {/* Score summary row: overall score, category scores, and the (minimized) radar chart
          side by side; below lg they stack. */}
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_260px] gap-6">
        <section className="bg-card border border-border p-6">
          <CardHeading className="mb-4">Health score</CardHeading>
          <div className="flex items-end gap-4">
            <span className="text-7xl font-bold tabular-nums leading-none" style={{fontFamily:"var(--font-mono)",color:hColor(project.score)}}>{scoreInt(project.score)}</span>
            <div className="mb-2 flex flex-col gap-1.5">
              <TrendIcon t={project.scoreTrend} sz={18}/>
              <span className={`text-xl font-bold tabular-nums ${project.scoreTrend>0?"text-health-good":project.scoreTrend<0?"text-destructive":"text-muted-foreground"}`} style={{fontFamily:"var(--font-mono)"}}>
                {trendLabel(project.scoreTrend)}
              </span>
            </div>
          </div>
        </section>
        <section className="bg-card border border-border p-6">
          <CardHeading className="mb-4">Category scores</CardHeading>
          <div className="space-y-3">
            {(Object.keys(display) as (keyof DisplaySubscores)[]).map(k=>{
              const row=(
                <div className="flex items-center justify-between w-full text-left gap-3 px-1 py-0.5">
                  <span className="text-sm text-foreground truncate">{SUBSCORE_LABELS[k]}</span>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="w-20 h-2 bg-muted"><div className="h-full" style={{width:`${Math.min(100, Math.max(0, scoreInt(display[k])))}%`,backgroundColor:hColor(display[k])}}/></div>
                    <span className={`text-sm font-bold tabular-nums w-8 text-right ${hClass(display[k])}`} style={{fontFamily:"var(--font-mono)"}}>{scoreInt(display[k])}</span>
                  </div>
                </div>
              );
              if(k==="codeQuality"){
                return (
                  <div key={k} className="group relative hover:bg-muted/40" tabIndex={0}>
                    {row}
                    <CodeQualityBreakdown subscores={project.subscores} align="right"/>
                  </div>
                );
              }
              return <div key={k} className="hover:bg-muted/40">{row}</div>;
            })}
          </div>
        </section>
        <section className="bg-card border border-border p-6">
          <CardHeading className="mb-4">Category balance</CardHeading>
          <ResponsiveContainer width="100%" height={180}>
            <RadarChart data={radarData} margin={{top:4,right:8,bottom:4,left:8}}>
              <PolarGrid stroke="var(--border)"/>
              <PolarAngleAxis dataKey="subject" tick={{fill:"var(--foreground)",fontSize:9,fontFamily:"var(--font-display)",fontWeight:600}}/>
              <PolarRadiusAxis angle={30} domain={[0,100]} tick={false} axisLine={false}/>
              <Radar dataKey="value" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.12} strokeWidth={2}/>
            </RadarChart>
          </ResponsiveContainer>
        </section>
      </div>

      {/* Health score over time, full width. Hover/scrub across the line the same way the
          Category scores' mini trend charts work - the tooltip tracks the cursor and shows
          the score + date at that point instead of a fixed drag handle. */}
      <section className="bg-card border border-border p-6">
        <CardHeading className="mb-4">Health score over time</CardHeading>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={project.timeSeries} margin={{top:8,right:8,bottom:0,left:8}}>
            <defs>
              <linearGradient id={`hs-${project.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={hColor(project.score)} stopOpacity={0.25}/>
                <stop offset="100%" stopColor={hColor(project.score)} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <ReTooltip
              contentStyle={ttStyle}
              itemStyle={{color:"var(--foreground)"}}
              labelStyle={{color:"var(--muted-foreground)",fontSize:"11px"}}
              formatter={(v:number)=>[v,"Score"]}
              labelFormatter={(_:unknown,pl:unknown[])=>(pl as {payload:{label:string}}[])[0]?.payload?.label}
            />
            <Area
              type="monotone"
              dataKey="score"
              stroke={hColor(project.score)}
              strokeWidth={2}
              fill={`url(#hs-${project.id})`}
              dot={false}
              activeDot={{r:4,fill:hColor(project.score),stroke:"var(--card)",strokeWidth:2}}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </section>

      {/* Five subscore trends. Steps 2 -> 3 -> 5 across so the labels never crush. */}
      <section>
        <SectionHeading>Score breakdown, last 90 days</SectionHeading>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
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
            const snapshotId = latestSnapshotId(project, k);
            return (
              <div key={k} role="button" tabIndex={0}
                onClick={()=>snapshotId&&setBreakdownKey(k)}
                onKeyDown={e=>{if(snapshotId&&(e.key==="Enter"||e.key===" ")){e.preventDefault();setBreakdownKey(k);}}}
                title={snapshotId?"See which metrics made up this score":undefined}
                className={`group relative bg-card border border-border p-4 flex flex-col text-left ${snapshotId?"cursor-pointer hover:border-primary transition-colors":""}`}>
                <div className="flex items-center gap-1.5 mb-3">
                  <span style={{color:strokeColor}} className="shrink-0">{SUBSCORE_ICONS[k]}</span>
                  <span className="text-xs font-semibold text-foreground leading-tight" style={{fontFamily:"var(--font-display)"}}>{SUBSCORE_LABELS[k]}</span>
                </div>
                {k==="codeQuality"&&<CodeQualityBreakdown subscores={project.subscores} align="left"/>}
                <div className="flex items-baseline gap-1.5 mb-1">
                  <span className="text-4xl font-bold tabular-nums leading-none" style={{fontFamily:"var(--font-mono)",color:strokeColor}}>{val}</span>
                  <span className="text-xs font-semibold" style={{color:trendGood?"var(--health-good)":"var(--health-crit)"}}>
                    {trendLabel(delta)}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mb-2 tabular-nums" style={{fontFamily:"var(--font-mono)"}}>
                  <span>{minV}</span><span>{maxV}</span>
                </div>
                <ResponsiveContainer width="100%" height={60}>
                  <AreaChart data={series} margin={{top:2,right:0,bottom:0,left:0}}>
                    <defs>
                      <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={strokeColor} stopOpacity={0.3}/>
                        <stop offset="100%" stopColor={strokeColor} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <ReTooltip
                      contentStyle={ttStyle}
                      itemStyle={{color:"var(--foreground)"}}
                      labelStyle={{color:"var(--muted-foreground)",fontSize:"11px"}}
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
      </section>

      {/* Recent actions + surveys */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-card border border-border">
          <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-border">
            <CardHeading>Recent actions</CardHeading>
            <Link to="actions" className="text-sm text-link flex items-center gap-1 hover:underline font-medium shrink-0">
              All actions
            </Link>
          </div>
          <div className="divide-y divide-border">
            {projectActions.slice(0,4).map(a=>(
              <div key={a.id} className="px-5 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground leading-snug truncate">{a.problem}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{fmtDate(a.timestamp)}</div>
                </div>
                <div className="shrink-0 flex gap-0.5 mt-0.5">
                  {a.effectiveness!==null
                    ?<span className="flex gap-0.5" aria-label={`Rated ${a.effectiveness} out of 5`}>
                       {Array.from({length:5}).map((_,i)=><Star key={i} size={11} className={i<a.effectiveness!?"text-attention fill-attention":"text-muted-foreground-subtle"}/>)}
                     </span>
                    :<span className="text-xs text-muted-foreground">Not rated</span>}
                </div>
              </div>
            ))}
            {projectActions.length===0&&(
              <p className="px-5 py-6 text-sm text-muted-foreground text-center">No actions logged yet. Log one to start tracking what you tried.</p>
            )}
          </div>
        </section>

        <section className="bg-card border border-border">
          <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-border">
            <CardHeading>Surveys</CardHeading>
            <Link to="surveys" className="text-sm text-link flex items-center gap-1 hover:underline font-medium shrink-0">
              All surveys
            </Link>
          </div>
          <div className="divide-y divide-border">
            {projectSurveys.slice(0,4).map(s=>{
              const pct=surveyResponseRate(s);
              const cfg=SURVEY_STATUS_CONFIG[s.status];
              const avg=s.scores?Math.round(Object.values(s.scores).reduce((a,b)=>a+b,0)/5):null;
              return (
                <div key={s.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground leading-snug truncate">{s.trigger}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs font-bold ${cfg.c}`}>{cfg.l}</span>
                      <span className="text-xs text-muted-foreground">{fmtDate(s.sentDate)}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    {avg!=null
                      ?<div className="text-sm font-bold tabular-nums" style={{fontFamily:"var(--font-mono)",color:hColor(avg)}}>{avg}</div>
                      :<div className="text-sm font-bold tabular-nums" style={{fontFamily:"var(--font-mono)",color:pct>=70?"var(--health-good)":pct>=40?"var(--health-warn)":"var(--health-crit)"}}>{pct}%</div>}
                    <div className="text-xs text-muted-foreground">{avg!=null?"AI score":`${s.responseCount}/${s.targetCount}`}</div>
                  </div>
                </div>
              );
            })}
            {projectSurveys.length===0&&(
              <p className="px-5 py-6 text-sm text-muted-foreground text-center">No surveys yet. Send one to hear from the team.</p>
            )}
          </div>
        </section>
      </div>

      <AnimatePresence>
        {breakdownKey&&(()=>{
          const snapshotId=latestSnapshotId(project,breakdownKey);
          if(!snapshotId) return null;
          return (
            <ScoreBreakdownModal key="sb" cardLabel={SUBSCORE_LABELS[breakdownKey]} projectId={project.backendProjectId??project.id}
              snapshotId={snapshotId} scoreTypes={SCORE_BREAKDOWN_TYPES[breakdownKey]}
              onClose={()=>setBreakdownKey(null)}/>
          );
        })()}
      </AnimatePresence>
    </PageShell>
  );
}
