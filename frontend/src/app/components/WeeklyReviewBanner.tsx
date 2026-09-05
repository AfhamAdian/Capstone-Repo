import { useState } from "react";
import { Clock3, Star, X } from "lucide-react";
import type { ActionReviewQueue } from "../api";

type ReminderState={dismissed?:boolean;snoozeUntil?:number};

export function WeeklyReviewBanner({queue,userId,onReview}:{queue:ActionReviewQueue;userId:number;onReview:()=>void}) {
  const key=`pulse.action-review.${userId}.${queue.windowStart.slice(0,10)}`;
  const readState=():ReminderState=>{try{return JSON.parse(localStorage.getItem(key)??"{}") as ReminderState;}catch{return {};}};
  const [visible,setVisible]=useState(()=>{const state=readState();return !state.dismissed&&(!state.snoozeUntil||state.snoozeUntil<=Date.now());});
  if(!visible||queue.readyCount===0)return null;
  const cohort=[queue.fromLastWeek.length?`${queue.fromLastWeek.length} from last week`:"",queue.earlier.length?`${queue.earlier.length} from earlier`:""].filter(Boolean).join(" and ");
  const persist=(state:ReminderState)=>{localStorage.setItem(key,JSON.stringify(state));setVisible(false);};
  return <div role="region" aria-label="Actions ready for effectiveness review" className="shrink-0 border-b border-border bg-card px-6 py-3">
    <div className="page-measure border-y border-border border-l-[3px] border-l-attention bg-attention-surface py-3 flex items-center gap-4 flex-wrap">
      <div className="w-8 h-8 bg-attention/10 flex items-center justify-center text-attention shrink-0"><Star size={16} className="fill-attention"/></div>
      <div className="min-w-0 flex-1"><div className="text-sm font-bold" style={{fontFamily:"var(--font-display)"}}>{queue.readyCount} action{queue.readyCount===1?" is":"s are"} ready for review</div><div className="text-xs text-muted-foreground mt-0.5">{cohort}</div></div>
      <button onClick={onReview} className="text-sm font-semibold text-link flex items-center gap-1.5 whitespace-nowrap hover:opacity-75">Review actions</button>
      <button onClick={()=>persist({snoozeUntil:Date.now()+3*24*60*60*1000})} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 whitespace-nowrap"><Clock3 size={13}/>Later</button>
      <button onClick={()=>persist({dismissed:true})} aria-label="Dismiss this week's review reminder" className="text-muted-foreground hover:text-foreground p-1"><X size={15}/></button>
    </div>
  </div>;
}
