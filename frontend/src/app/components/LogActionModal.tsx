import { useState, useRef, useEffect, useMemo, type MouseEvent } from "react";
import { X, ChevronDown, Check, Search, Send, AlertCircle, Star, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type { Project, Action } from "../types";
import { searchActions, type ActionSearchMode } from "../api";
import { actionMatchesKeywordSearch, actionSearchModeLabel, actionSimilarityLabel, hClass } from "../format";

export function LogActionModal({onClose,preId,projects,actions,initialAction,onSubmit}:{onClose:()=>void;preId?:string;projects:Project[];actions:Action[];initialAction?:Action|null;
  onSubmit:(input:{projectIds:string[];problem:string;reason:string;actionTaken:string;timestamp:string})=>Promise<void>;
}) {
  const projectValue=(project:Project)=>project.backendProjectId??project.id;
  const preselected=preId?projects.find(project=>project.id===preId||project.backendProjectId===preId):null;
  const [problemAndCause,setProblemAndCause]=useState(initialAction?.problem??"");
  const [reason,setReason]=useState(initialAction?.reason??"");
  const [actionTaken,setActionTaken]=useState(initialAction?.actionTaken??"");
  const [date,setDate]=useState(()=>initialAction?.timestamp??new Date().toISOString().slice(0,10));
  const [sel,setSel]=useState<string[]>(()=>initialAction?.projectIds??(preselected?[projectValue(preselected)]:[]));
  const [dropOpen,setDropOpen]=useState(false);
  const [submitted,setSubmitted]=useState(false);
  const [submitting,setSubmitting]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [searchTriggered,setSearchTriggered]=useState(false);
  const [similar,setSimilar]=useState<Action[]>([]);
  const [searching,setSearching]=useState(false);
  const [searchMode,setSearchMode]=useState<ActionSearchMode|null>(null);
  const [searchError,setSearchError]=useState<string|null>(null);
  const searchController=useRef<AbortController|null>(null);
  const dRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{const h=(e:MouseEvent)=>{if(dRef.current&&!dRef.current.contains(e.target as Node))setDropOpen(false);};document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);},[]);
  useEffect(()=>()=>searchController.current?.abort(),[]);
  const clearSimilar=()=>{
    searchController.current?.abort();
    searchController.current=null;
    setSearchTriggered(false);setSimilar([]);setSearching(false);setSearchMode(null);setSearchError(null);
  };
  const keywordSimilar=useMemo(()=>{
    const query=problemAndCause.trim();
    if(query.length<3)return [];
    return actions
      .filter(action=>action.id!==initialAction?.id)
      .filter(action=>sel.length!==1||action.projectIds.includes(sel[0]!))
      .filter(action=>actionMatchesKeywordSearch(action,query))
      .slice(0,5);
  },[actions,initialAction?.id,problemAndCause,sel]);
  const visibleSimilar=searchTriggered?similar:keywordSimilar;
  const findSimilar=async()=>{
    const query=problemAndCause.trim();
    if(query.length<3||searching)return;
    searchController.current?.abort();
    const controller=new AbortController();
    searchController.current=controller;
    setSearchTriggered(true);setSearching(true);setSearchMode(null);setSearchError(null);setSimilar([]);
    try{
      const result=await searchActions(query,5,{
        deep:true,
        projectId:sel.length===1?sel[0]:undefined,
        excludeActionId:initialAction?.id,
        signal:controller.signal,
      });
      if(controller.signal.aborted)return;
      setSimilar(result.actions);
      setSearchMode(result.mode);
    }catch(err){
      if(!controller.signal.aborted)setSearchError(err instanceof Error?err.message:"Similar-action search is unavailable");
    }finally{
      if(searchController.current===controller){searchController.current=null;setSearching(false);}
    }
  };
  const toggle=(id:string)=>{setSel(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);clearSimilar();};
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
            <div className="text-xl font-bold" style={{fontFamily:"var(--font-display)"}}>{initialAction?"Edit Management Action":"Log Management Action"}</div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X size={18}/></button>
          </div>

          {submitted?(
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
              <div className="w-14 h-14 bg-emerald-500 flex items-center justify-center"><Check size={26} className="text-white"/></div>
              <div className="text-2xl font-bold" style={{fontFamily:"var(--font-display)"}}>{initialAction?"Action updated":"Action logged"}</div>
              <div className="text-base text-muted-foreground">{initialAction?"The action and its search index are up to date.":"Added to timeline and library."}</div>
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
                      {sel.length>0?projects.filter(p=>sel.includes(projectValue(p))).map(p=>p.name).join(", "):"Select one or more projects…"}
                    </span>
                    <ChevronDown size={15} className={`text-muted-foreground shrink-0 ml-2 transition-transform ${dropOpen?"rotate-180":""}`}/>
                  </button>
                  <AnimatePresence>
                    {dropOpen&&(
                      <motion.div initial={{opacity:0,y:-4}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-4}} transition={{duration:0.12}}
                        className="absolute left-0 right-0 top-full mt-1 bg-popover border border-border shadow-xl z-10 max-h-64 overflow-y-auto">
                        <div className="px-3 py-2 border-b border-border text-xs font-semibold text-muted-foreground bg-muted">Select all that apply</div>
                        {projects.map(p=>(
                          <button key={p.id} onClick={()=>toggle(projectValue(p))}
                            className={`w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted transition-colors border-b border-border/50 last:border-b-0 ${sel.includes(projectValue(p))?"bg-primary/5":""}`}>
                            <div className={`w-5 h-5 border-2 shrink-0 flex items-center justify-center transition-colors ${sel.includes(projectValue(p))?"border-primary bg-primary":"border-border"}`}>
                              {sel.includes(projectValue(p))&&<Check size={11} className="text-white"/>}
                            </div>
                            <div className="flex-1 text-left">
                              <div className={`text-[15px] font-semibold ${sel.includes(projectValue(p))?"text-primary":"text-foreground"}`}>{p.name}</div>
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
                    onClick={()=>void findSimilar()}
                    disabled={problemAndCause.trim().length<3||searching}
                    className="flex items-center gap-1.5 text-xs font-semibold text-primary border border-primary/40 px-2.5 py-1 hover:bg-primary/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Deep-search past problems with Pinecone reranking">
                    {searching?<RefreshCw size={11} className="animate-spin"/>:<Search size={11}/>} {searching?"Searching…":"Deep Search"}
                  </button>
                </div>
                <textarea
                  value={problemAndCause}
                  onChange={e=>{setProblemAndCause(e.target.value);clearSimilar();}}
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
                <Send size={14}/> {submitting?(initialAction?"Saving…":"Logging…"):(initialAction?"Save changes":"Log Action")}
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
              {searching?"Searching action history…":searchError?"Search unavailable":searchTriggered
                ?`${similar.length} match${similar.length!==1?"es":""} · ${actionSearchModeLabel(searchMode)}`
                :problemAndCause.trim().length>=3
                  ?`${keywordSimilar.length} local keyword match${keywordSimilar.length!==1?"es":""}`
                  :"Type a problem to search"}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {searching?(
              <div className="text-sm text-muted-foreground text-center pt-8 leading-relaxed px-2">
                <RefreshCw size={18} className="animate-spin mx-auto mb-3 text-primary"/>Comparing with past actions…
              </div>
            ):searchError?(
              <div className="text-sm text-amber-700 dark:text-amber-300 text-center pt-8 leading-relaxed px-2">
                <AlertCircle size={18} className="mx-auto mb-3"/>{searchError}
              </div>
            ):visibleSimilar.length===0?(
              <div className="text-sm text-muted-foreground text-center pt-8 leading-relaxed px-2">
                {searchTriggered
                  ?"No deep similarity results met the configured threshold."
                  :problemAndCause.trim().length<3
                    ?"Enter at least 3 characters to see keyword matches."
                    :"No keyword matches. Click Deep Search for semantic matches."}
              </div>
            ):(
              <div className="space-y-3">
                {visibleSimilar.map((action,idx)=>(
                  <div key={action.id} className="border border-border bg-card p-3.5">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="text-[13px] font-semibold text-foreground leading-snug">{action.problem}</div>
                      <span className="text-xs text-muted-foreground shrink-0 mt-0.5 font-mono">#{idx+1}</span>
                    </div>
                    {actionSimilarityLabel(action.similarity)&&<div className="text-xs font-semibold text-primary mb-2">{actionSimilarityLabel(action.similarity)}</div>}
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
