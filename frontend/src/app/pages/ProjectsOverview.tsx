import { useState, useMemo } from "react";
import { ChevronRight, Search, Plus, Zap, MessageSquare, Bookmark, Star, RefreshCw } from "lucide-react";
import { motion } from "motion/react";
import type { SyncRiskKey } from "../api";
import type { Project, Survey } from "../types";
import { hColor, toDisplaySubscores, type DisplaySubscores } from "../format";
import { Ring, TrendIcon } from "../components/ScoreVisuals";
import { useDashboardSync } from "../hooks/useDashboardSync";

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
              {pendingReviewCount>0&&(
                <span className="inline-flex items-center justify-center w-5 h-5 bg-amber-400 text-white text-xs font-bold">{pendingReviewCount}</span>
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
              {["Project","Code Quality","CI/CD","Team Health","Eng. Process","Planning & Exec.","Health","Trend",""].map((h,i)=>(
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
            ):visible.map((p,idx)=>{
              const display=toDisplaySubscores(p.subscores);
              return (
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
                  {(Object.keys(display) as (keyof DisplaySubscores)[]).map(k=>(
                    <div
                      key={k}
                      className="flex justify-center"
                      onClick={e=>e.stopPropagation()}
                      title={k==="codeQuality"?`Security ${Math.round(p.subscores.security)} · Reliability ${Math.round(p.subscores.reliability)} · Maintainability ${Math.round(p.subscores.maintainability)}`:undefined}
                    >
                      <Ring score={display[k]} size={44}/>
                    </div>
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
              );
            })}
            {visible.length===0&&!loading&&<div className="text-center py-16 text-base text-muted-foreground">No projects match your filter.</div>}
          </div>
        </div>
      </div>

    </div>
  );
}
