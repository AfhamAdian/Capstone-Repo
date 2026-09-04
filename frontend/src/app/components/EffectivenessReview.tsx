import { useState } from "react";
import { AlertCircle, Check, ChevronDown, Clock3, Star, X } from "lucide-react";
import { motion } from "motion/react";
import type { ActionReviewQueue } from "../api";
import type { Action, Project } from "../types";
import { actionIncludesProject, fmtDate, projectTagStyle } from "../format";

const RATING_LABELS=["Made things worse","Ineffective","Mixed or unclear","Effective","Highly effective"];

export function EffectivenessReview({queue,projects,onClose,onRate,onDefer,onRefresh}:{
  queue:ActionReviewQueue;projects:Project[];onClose:()=>void;
  onRate:(id:string,rating:number)=>Promise<void>;
  onDefer:(id:string,weeks:1|2|4)=>Promise<void>;
  onRefresh:()=>Promise<void>;
}) {
  const [busy,setBusy]=useState<string|null>(null);
  const [saved,setSaved]=useState<string|null>(null);
  const [error,setError]=useState<{id:string;message:string}|null>(null);
  const [deferId,setDeferId]=useState<string|null>(null);
  const [waitingOpen,setWaitingOpen]=useState(queue.readyCount===0);
  const [ratingPreview,setRatingPreview]=useState<{id:string;rating:number}|null>(null);
  const totalUnrated=queue.fromLastWeek.length+queue.earlier.length+queue.waitingForOutcome.length;

  const finish=async(id:string,operation:()=>Promise<void>)=>{
    if(busy)return;
    setBusy(id);setError(null);
    try{
      await operation();setSaved(id);
      window.setTimeout(()=>{setSaved(null);void onRefresh();},650);
    }catch(err){setError({id,message:err instanceof Error?err.message:"Could not save this review"});}
    finally{setBusy(null);setDeferId(null);}
  };

  const card=(action:Action)=>(
    <div key={action.id} className={`border border-border bg-card p-4 transition-opacity ${saved===action.id?"opacity-55":""}`}>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {projects.filter(project=>actionIncludesProject(action,project)).map(project=>{const style=projectTagStyle(project.score);return <span key={project.id} className={`text-xs font-bold px-2 py-0.5 ${style.bg} ${style.text}`}>{project.name}</span>;})}
        <span className="text-xs text-muted-foreground" style={{fontFamily:"var(--font-mono)"}}>{fmtDate(action.timestamp)}</span>
      </div>
      <div className="text-base font-semibold text-foreground mb-1">{action.problem}</div>
      <div className="text-sm text-muted-foreground leading-relaxed mb-4">{action.actionTaken}</div>
      {saved===action.id?(
        <div className="h-9 flex items-center gap-2 text-sm font-semibold text-health-good"><Check size={15}/>Saved</div>
      ):(
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1" role="group" aria-label={`Rate effectiveness of ${action.problem}`} onMouseLeave={()=>setRatingPreview(null)}>
            {RATING_LABELS.map((label,index)=>{const rating=index+1;const highlighted=ratingPreview?.id===action.id&&rating<=ratingPreview.rating;return <button key={label} disabled={busy===action.id} onClick={()=>void finish(action.id,()=>onRate(action.id,rating))}
              onMouseEnter={()=>setRatingPreview({id:action.id,rating})} onFocus={()=>setRatingPreview({id:action.id,rating})} onBlur={()=>setRatingPreview(null)}
              className="group p-1 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={`${index+1} of 5 — ${label}`} title={`${index+1} — ${label}`}>
              <Star size={20} className={`${highlighted?"text-attention fill-attention":"text-muted-foreground-subtle"} transition-colors`}/>
            </button>})}
          </div>
          <span className="text-xs text-muted-foreground min-w-28">{ratingPreview?.id===action.id?RATING_LABELS[ratingPreview.rating-1]:"Choose 1–5"}</span>
          </div>
          <button disabled={busy===action.id} onClick={()=>setDeferId(deferId===action.id?null:action.id)} className="text-sm font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1.5 disabled:opacity-40">
            <Clock3 size={14}/>Not ready yet
          </button>
        </div>
      )}
      {deferId===action.id&&saved!==action.id&&(
        <div className="mt-3 border-t border-border pt-3 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs text-muted-foreground">Review again in</span>
          <div className="flex border border-border">
            {([1,2,4] as const).map(weeks=><button key={weeks} disabled={busy===action.id} onClick={()=>void finish(action.id,()=>onDefer(action.id,weeks))} className="px-3 py-1.5 text-xs font-semibold border-r border-border last:border-r-0 hover:bg-muted disabled:opacity-40">{weeks} week{weeks>1?"s":""}</button>)}
          </div>
        </div>
      )}
      {error?.id===action.id&&<div className="mt-3 flex items-center gap-2 text-xs text-destructive"><AlertCircle size={13}/>{error.message}</div>}
    </div>
  );

  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.section initial={{y:16,opacity:0}} animate={{y:0,opacity:1}} exit={{y:16,opacity:0}} transition={{duration:0.18}}
        onClick={event=>event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="effectiveness-review-title" className="w-full max-w-2xl bg-card border border-border shadow-overlay max-h-[calc(100vh-2rem)] md:max-h-[86vh] flex flex-col overflow-hidden">
        <header className="shrink-0 flex items-start justify-between px-6 py-5 border-b border-border">
          <div>
            <div className="text-xs font-semibold text-attention mb-1" style={{fontFamily:"var(--font-display)"}}>Decision ledger</div>
            <h2 id="effectiveness-review-title" className="text-xl font-bold" style={{fontFamily:"var(--font-display)"}}>Effectiveness Review</h2>
            <div className="text-sm text-muted-foreground mt-1">{totalUnrated} unrated, of which {queue.readyCount} are ready now and {queue.waitingForOutcome.length} are still waiting for evidence</div>
          </div>
          <button onClick={onClose} aria-label="Close effectiveness review" className="text-muted-foreground hover:text-foreground p-1"><X size={18}/></button>
        </header>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-5 space-y-6">
          {queue.fromLastWeek.length>0&&<section><div className="flex items-center justify-between mb-2"><h3 className="text-sm font-bold text-link" style={{fontFamily:"var(--font-display)"}}>From last week</h3><span className="text-xs text-muted-foreground">{queue.fromLastWeek.length}</span></div><div className="space-y-3">{queue.fromLastWeek.map(card)}</div></section>}
          {queue.earlier.length>0&&<section><div className="flex items-center justify-between mb-2"><h3 className="text-sm font-bold text-attention" style={{fontFamily:"var(--font-display)"}}>Earlier</h3><span className="text-xs text-muted-foreground">{queue.earlier.length}</span></div><div className="space-y-3">{queue.earlier.map(card)}</div></section>}
          {queue.waitingForOutcome.length>0&&<section className="border-t border-border pt-4"><button onClick={()=>setWaitingOpen(!waitingOpen)} className="w-full flex items-center justify-between text-left"><div><h3 className="text-sm font-bold" style={{fontFamily:"var(--font-display)"}}>Waiting for outcome</h3><p className="text-xs text-muted-foreground mt-0.5">Not included in reminders until the next review date</p></div><div className="flex items-center gap-2 text-xs text-muted-foreground"><span>{queue.waitingForOutcome.length}</span><ChevronDown size={14} className={`transition-transform ${waitingOpen?"rotate-180":""}`}/></div></button>
            {waitingOpen&&<div className="mt-3 space-y-3">{queue.waitingForOutcome.map(card)}</div>}
          </section>}
        </div>
      </motion.section>
    </motion.div>
  );
}
