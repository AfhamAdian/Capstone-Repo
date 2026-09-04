import { useState, useMemo } from "react";
import { ChevronRight, Search, Plus, Zap, MessageSquare, Bookmark, Star, RefreshCw } from "lucide-react";
import { motion } from "motion/react";
import type { SyncRiskKey } from "../api";
import type { Project, Survey } from "../types";
import { hColor, SUBSCORE_LABELS, toDisplaySubscores, type DisplaySubscores } from "../format";
import { Ring, TrendIcon } from "../components/ScoreVisuals";
import { PageShell, PageHeader, FieldShell } from "../components/PageShell";
import { btnPrimary, btnSecondary } from "../components/ui";
import { useDashboardSync } from "../hooks/useDashboardSync";

/**
 * All five subscore columns hold the same 44px ring, so they get the same track. The
 * previous 64/80/64/82/68px mix left the rings on an uneven rhythm and wrapped some
 * headers to two lines while their neighbours stayed on one.
 */
const SUBSCORE_COL = 78;
const COLS = `minmax(220px,2fr) repeat(5, ${SUBSCORE_COL}px) 84px 72px 104px`;
// Tracks above plus the row's 24px side padding, rounded up to the next round number.
const TABLE_MIN_WIDTH = 920;

const SUBSCORE_KEYS = ["codeQuality","cicdDeploymentHealth","teamHealth","engineeringProcess","planningExecution"] as const;

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
      className={`flex items-center gap-1.5 px-2.5 py-1.5 border text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${active?"border-primary text-link bg-primary/5":"border-border text-muted-foreground hover:border-primary hover:text-link"}`}>
      <RefreshCw size={13} className={active?"animate-spin":""}/>
      <span style={{fontFamily:"var(--font-display)"}}>{active?"Syncing…":"Sync"}</span>
    </button>
  );
}

export function PortfolioView({projects,surveys,pendingReviewCount,onSelect,onLogAction,onViewActions,onViewSurveys,onRatingOpen,trackedIds,onToggleTracked,loading,onAddProject,isAdmin,workspaceName,onBackToWorkspaces,onSyncComplete}:{
  projects:Project[];surveys:Survey[];pendingReviewCount:number;
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
  const visible=useMemo(()=>{
    let list=tab==="tracked"?projects.filter(p=>trackedIds.has(p.id)):projects;
    if(q)list=list.filter(p=>p.name.toLowerCase().includes(q.toLowerCase())||p.team.toLowerCase().includes(q.toLowerCase())||(p.owner??"").toLowerCase().includes(q.toLowerCase()));
    return [...list].sort((a,b)=>a.score-b.score);
  },[projects,tab,q,trackedIds]);

  const needsAttention=projects.filter(p=>p.score<60).length;

  return (
    <PageShell>
      <PageHeader
        title="Portfolio"
        breadcrumb={workspaceName&&(
          <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted-foreground mb-2">
            <button onClick={onBackToWorkspaces} className="font-medium hover:text-foreground transition-colors">Workspaces</button>
            <ChevronRight size={13} className="text-muted-foreground-subtle"/>
            <span className="font-semibold text-foreground">{workspaceName}</span>
          </nav>
        )}
        description={loading
          ? "Loading projects from your workspace…"
          : `${projects.length} project${projects.length!==1?"s":""}, ${needsAttention} scoring below 60. ${surveys.length} survey${surveys.length!==1?"s":""} sent.`}
        actions={<>
          {pendingReviewCount>0&&(
            <button onClick={onRatingOpen} className={btnSecondary} style={{fontFamily:"var(--font-display)"}}>
              <Star size={14} className="text-attention fill-attention"/> Review {pendingReviewCount} action{pendingReviewCount>1?"s":""}
            </button>
          )}
          <button onClick={onViewActions} className={btnSecondary} style={{fontFamily:"var(--font-display)"}}>
            <Zap size={14}/> All actions
          </button>
          <button onClick={onViewSurveys} className={btnSecondary} style={{fontFamily:"var(--font-display)"}}>
            <MessageSquare size={14}/> All surveys
          </button>
          <button onClick={onLogAction} className={btnPrimary} style={{fontFamily:"var(--font-display)"}}>
            <Plus size={16}/> Log action
          </button>
        </>}
      />

      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="flex border border-border" role="tablist" aria-label="Filter projects">
          {(["all","tracked"] as const).map(t=>(
            <button key={t} role="tab" aria-selected={tab===t} onClick={()=>setTab(t)}
              className={`px-5 py-2.5 text-sm font-semibold transition-colors ${tab===t?"bg-foreground text-background":"text-muted-foreground hover:text-foreground"}`}
              style={{fontFamily:"var(--font-display)"}}>
              {t==="tracked"?"Tracked":"All projects"}
            </button>
          ))}
        </div>
        <FieldShell className="flex-1 min-w-[200px] max-w-sm">
          <Search size={15} className="text-muted-foreground shrink-0"/>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search projects or teams…"
            aria-label="Search projects or teams"
            className="bg-transparent text-sm flex-1 min-w-0 placeholder:text-muted-foreground"/>
        </FieldShell>
        {isAdmin&&onAddProject&&(
          <button onClick={onAddProject} className={`${btnPrimary} shrink-0`} style={{fontFamily:"var(--font-display)"}}>
            <Plus size={16}/> Add project
          </button>
        )}
      </div>

      <div className="border border-border bg-card overflow-x-auto">
        <div style={{minWidth:TABLE_MIN_WIDTH}}>
          <div className="grid items-end border-b border-border bg-muted px-6 py-3" style={{gridTemplateColumns:COLS}}>
            {["Project",...SUBSCORE_KEYS.map(k=>SUBSCORE_LABELS[k]),"Health","Trend",""].map((h,i)=>(
              <div key={i} className={`text-xs font-semibold text-foreground leading-tight ${i>=1&&i<=6?"text-center":""}`} style={{fontFamily:"var(--font-display)"}}>{h}</div>
            ))}
          </div>
          {loading?(
            // Same padding as a real row, so nothing shifts when the data lands.
            Array.from({length:4}).map((_,i)=>(
              <div key={i} className="grid items-center px-6 py-4 border-b border-border last:border-b-0" style={{gridTemplateColumns:COLS}}>
                <div className="space-y-2">
                  <div className="h-4 w-40 bg-muted animate-pulse"/>
                  <div className="h-3 w-56 bg-muted animate-pulse"/>
                </div>
                {Array.from({length:6}).map((__,j)=><div key={j} className="mx-auto h-11 w-11 rounded-full bg-muted animate-pulse"/>)}
                <div className="h-4 w-10 bg-muted animate-pulse mx-auto"/>
                <div className="h-8 w-20 bg-muted animate-pulse mx-auto"/>
              </div>
            ))
          ):visible.map((p,idx)=>{
            const display=toDisplaySubscores(p.subscores);
            return (
            <motion.div key={p.id} initial={{opacity:0}} animate={{opacity:1}} transition={{delay:Math.min(idx,8)*0.03,duration:0.2}}>
              <div onClick={()=>onSelect(p.id)}
                role="button" tabIndex={0}
                onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onSelect(p.id);}}}
                aria-label={`Open ${p.name}, health ${Math.round(p.score)}`}
                className="grid items-center px-6 py-4 border-b border-border hover:bg-muted/40 cursor-pointer group transition-colors"
                style={{gridTemplateColumns:COLS, borderLeft:`3px solid ${hColor(p.score)}`}}>
                <div className="min-w-0 pr-4">
                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={e=>{e.stopPropagation();onToggleTracked(p.id);}}
                      title={trackedIds.has(p.id)?"Untrack project":"Track project"}
                      aria-label={trackedIds.has(p.id)?`Untrack ${p.name}`:`Track ${p.name}`}
                      aria-pressed={trackedIds.has(p.id)}
                      className={`shrink-0 flex items-center justify-center w-7 h-7 border transition-colors ${trackedIds.has(p.id)?"bg-primary border-primary text-primary-foreground":"border-border text-muted-foreground hover:border-primary hover:text-link"}`}>
                      <Bookmark size={14} className={trackedIds.has(p.id)?"fill-current":""} strokeWidth={2}/>
                    </button>
                    <span className="text-base font-bold truncate group-hover:text-link transition-colors" style={{fontFamily:"var(--font-display)"}}>{p.name}</span>
                  </div>
                  <div className="text-sm text-muted-foreground mt-0.5 pl-[38px] truncate">
                    {p.owner && p.repo ? `${p.owner}/${p.repo}` : p.owner || p.team || "No owner linked"}
                  </div>
                  {p.pendingReview>0&&(
                    <div className="mt-1 pl-[38px]">
                      <span className="text-sm text-link flex items-center gap-1"><Star size={12}/>{p.pendingReview} review{p.pendingReview>1?"s":""}</span>
                    </div>
                  )}
                </div>
                {SUBSCORE_KEYS.map(k=>(
                  <div
                    key={k}
                    className="flex justify-center"
                    onClick={e=>e.stopPropagation()}
                    title={k==="codeQuality"?`Security ${Math.round(p.subscores.security)}, Reliability ${Math.round(p.subscores.reliability)}, Maintainability ${Math.round(p.subscores.maintainability)}`:undefined}
                  >
                    <Ring score={display[k as keyof DisplaySubscores]} size={44} label={SUBSCORE_LABELS[k]}/>
                  </div>
                ))}
                <div className="flex justify-center" onClick={e=>e.stopPropagation()}><Ring score={p.score} size={56} label="Health"/></div>
                <div className="flex items-center justify-center gap-1.5">
                  <TrendIcon t={p.scoreTrend}/>
                  <span className={`text-sm font-bold tabular-nums ${p.scoreTrend>0?"text-health-good":p.scoreTrend<0?"text-destructive":"text-muted-foreground"}`} style={{fontFamily:"var(--font-mono)"}}>
                    {p.scoreTrend>0?"+":""}{p.scoreTrend}
                  </span>
                </div>
                <div className="flex justify-center" onClick={e=>e.stopPropagation()}><SyncBtn project={p} onSyncComplete={onSyncComplete}/></div>
              </div>
            </motion.div>
            );
          })}
          {visible.length===0&&!loading&&(
            <p className="text-center py-16 text-sm text-muted-foreground">
              {q||tab==="tracked" ? "No projects match this filter." : "No projects yet. Add one to start tracking its health."}
            </p>
          )}
        </div>
      </div>
    </PageShell>
  );
}
