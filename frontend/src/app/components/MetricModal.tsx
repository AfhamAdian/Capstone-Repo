import { useState } from "react";
import {
  X, GitCommit, CheckSquare, Activity, AlertTriangle, Rocket, GitBranch,
} from "lucide-react";
import {
  LineChart, Line, ResponsiveContainer, Tooltip as ReTooltip, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { motion } from "motion/react";
import type { Project } from "../types";
import { seriesInRange, ttStyle } from "../format";

export const MMETA: Record<string,{label:string;unit?:string;icon:React.ReactNode;color:string;invertBad?:boolean}> = {
  commits:     {label:"Commits",          icon:<GitCommit size={16}/>,    color:"var(--chart-1)"},
  tickets:     {label:"Tickets Closed",   icon:<CheckSquare size={16}/>,  color:"var(--chart-2)"},
  velocity:    {label:"Sprint Velocity",  unit:"pts", icon:<Activity size={16}/>, color:"var(--chart-1)"},
  blockers:    {label:"Open Blockers",    icon:<AlertTriangle size={16}/>,color:"var(--chart-4)", invertBad:true},
  deployments: {label:"Deployments / wk",icon:<Rocket size={16}/>,       color:"var(--chart-2)"},
  prCycleTime: {label:"PR Cycle Time",    unit:"h",   icon:<GitBranch size={16}/>,color:"var(--chart-3)", invertBad:true},
};
export const MVAL:{[k:string]:(m:Project["metrics"])=>number}={
  commits:m=>m.commits, tickets:m=>m.ticketsClosed, velocity:m=>m.sprintVelocity,
  blockers:m=>m.openBlockers, deployments:m=>m.deployments, prCycleTime:m=>m.prCycleTime,
};

export function MetricModal({mk,series,val,onClose}:{mk:string;series:{v:number;label:string;date?:string}[];val:number;onClose:()=>void;}) {
  const meta=MMETA[mk];
  const [ri,setRi]=useState(1);
  const ranges=[{l:"7D",d:7 as number|null},{l:"30D",d:30},{l:"All",d:null}];
  const data=seriesInRange(series,ranges[ri].d);
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <motion.div initial={{scale:0.96,opacity:0,y:8}} animate={{scale:1,opacity:1,y:0}} exit={{scale:0.96,opacity:0,y:8}} transition={{duration:0.16}}
        onClick={e=>e.stopPropagation()} className="w-full max-w-3xl bg-card border border-border shadow-overlay">
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <div className="flex items-center gap-3">
            <span style={{color:meta.color}}>{meta.icon}</span>
            <div>
              <div className="text-xl font-bold" style={{fontFamily:"var(--font-display)"}}>{meta.label}</div>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-3xl font-bold tabular-nums" style={{fontFamily:"var(--font-mono)",color:meta.color}}>{val}</span>
                {meta.unit&&<span className="text-base text-muted-foreground">{meta.unit}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex border border-border">
              {ranges.map((r,i)=>(
                <button key={r.l} onClick={()=>setRi(i)}
                  className={`px-4 py-2 text-sm font-semibold transition-colors ${ri===i?"bg-foreground text-background":"text-muted-foreground hover:text-foreground"}`}
                  style={{fontFamily:"var(--font-display)"}}>
                  {r.l}
                </button>
              ))}
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X size={18}/></button>
          </div>
        </div>
        <div className="p-6">
          {data.length===0?(
            <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">No data points in this range.</div>
          ):(
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data} margin={{top:8,right:8,bottom:8,left:8}}>
              <CartesianGrid strokeDasharray="2 8" stroke="var(--border)" vertical={false}/>
              <XAxis dataKey="label" tick={{fill:"var(--foreground)",fontSize:12,fontFamily:"var(--font-mono)"}} tickLine={false} axisLine={{stroke:"var(--border)"}} interval={Math.max(0,Math.ceil(data.length/8)-1)}/>
              <YAxis tick={{fill:"var(--foreground)",fontSize:12,fontFamily:"var(--font-mono)"}} tickLine={false} axisLine={false} width={36}/>
              <ReTooltip contentStyle={ttStyle} formatter={(v:number)=>[`${v}${meta.unit||""}`,meta.label]}/>
              <Line type="monotone" dataKey="v" stroke={meta.color} strokeWidth={2.5} dot={data.length<=14?{fill:meta.color,r:3}:false} activeDot={{r:5}}/>
            </LineChart>
          </ResponsiveContainer>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
