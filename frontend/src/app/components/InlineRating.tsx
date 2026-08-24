import { useState, useEffect } from "react";
import { Star } from "lucide-react";
import type { Action } from "../types";

export function InlineRating({effectiveness,onRate}:{effectiveness:number|null;onRate?:(rating:number)=>void}) {
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

export function GlobalEffRow({action,onRate}:{action:Action;onRate?:(rating:number)=>void}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground">Rate:</span>
      <InlineRating effectiveness={action.effectiveness} onRate={onRate}/>
    </div>
  );
}
