import { useEffect, useState } from "react";
import { LoaderCircle, Star } from "lucide-react";

const LABELS=["Made things worse","Ineffective","Mixed or unclear","Effective","Highly effective"];

/** Compact owner-aware rating control used in action rows and search results. */
export function InlineRating({effectiveness,canRate=false,onRate}:{
  effectiveness:number|null;canRate?:boolean;onRate?:(rating:number)=>Promise<void>;
}) {
  const [open,setOpen]=useState(false);
  const [hover,setHover]=useState(0);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState(false);
  const [localRating,setLocalRating]=useState(effectiveness);
  useEffect(()=>setLocalRating(effectiveness),[effectiveness]);

  if(localRating!==null) return (
    <div className="flex gap-0.5 items-center" role="img" aria-label={`${localRating} out of 5 — ${LABELS[localRating-1]}`} title={`${localRating} — ${LABELS[localRating-1]}`}>
      {Array.from({length:5}).map((_,i)=><Star key={i} size={12} className={i<localRating?"text-amber-400 fill-amber-400":"text-muted-foreground/30"}/>) }
    </div>
  );

  if(!canRate||!onRate)return <span className="text-xs text-muted-foreground">Unrated</span>;

  const save=async(rating:number)=>{
    if(busy)return;
    setBusy(true);setError(false);
    try{await onRate(rating);setLocalRating(rating);setOpen(false);}
    catch{setError(true);}
    finally{setBusy(false);}
  };

  if(!open)return <button onClick={event=>{event.stopPropagation();setOpen(true);}} className="inline-flex items-center gap-1.5 border border-amber-400/50 px-2 py-1 text-xs font-semibold text-amber-600 hover:bg-amber-400/10 dark:text-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400" title="Rate this action"><Star size={12}/>Rate</button>;

  return (
    <div className="flex items-center gap-0.5" onMouseLeave={()=>setHover(0)} onClick={event=>event.stopPropagation()}>
      {busy?<LoaderCircle size={14} className="animate-spin text-amber-500"/>:Array.from({length:5}).map((_,i)=>{
        const rating=i+1;
        return <button key={rating} onMouseEnter={()=>setHover(rating)} onFocus={()=>setHover(rating)} onBlur={()=>setHover(0)} onClick={()=>void save(rating)}
          className="p-0.5 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400" aria-label={`${rating} of 5 — ${LABELS[i]}`} title={`${rating} — ${LABELS[i]}`}>
          <Star size={14} className={rating<=hover?"text-amber-400 fill-amber-400":"text-muted-foreground/40"}/>
        </button>;
      })}
      {error&&<span className="ml-1 text-[10px] text-red-500">Retry</span>}
    </div>
  );
}
