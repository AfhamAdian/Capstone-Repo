import { useState, useRef, useEffect, useMemo, type MouseEvent } from "react";
import { X, ChevronDown, Check, Search, Send, AlertCircle, Star } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type { Project, Action } from "../types";
import { hClass } from "../format";

export function LogActionModal({onClose,preId,projects,actions,onSubmit}:{onClose:()=>void;preId?:string;projects:Project[];actions:Action[];
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
