import { useState, useRef, useEffect, type MouseEvent } from "react";
import {
  Activity, ChevronRight, ChevronDown, Search, Star, Bell, Building2, Moon, Sun,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type { Project } from "../types";
import { hColor, hClass } from "../format";
import { findProjectByPath } from "../hooks/useProjectHealth";

export function TopBar({dark,onToggle,projects,activeId,onSelect,onHome,pendingCount,onRatingOpen,onManageWorkspaces}:{
  dark:boolean;onToggle:()=>void;projects:Project[];activeId:string|null;onSelect:(id:string)=>void;onHome:()=>void;
  pendingCount:number;onRatingOpen:()=>void;onManageWorkspaces:()=>void;
}) {
  const [open,setOpen]=useState(false);
  const [q,setQ]=useState("");
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const h=(e:MouseEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false);};
    document.addEventListener("mousedown",h); return ()=>document.removeEventListener("mousedown",h);
  },[]);
  const active=findProjectByPath(projects,activeId);
  const filtered=projects.filter(p=>p.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <header className="shrink-0 border-b border-border bg-card flex items-center px-6 gap-5 z-30" style={{height:54}}>
      <button onClick={onHome} className="flex items-center gap-2.5 hover:opacity-75 transition-opacity">
        <div className="w-7 h-7 bg-primary flex items-center justify-center"><Activity size={14} className="text-primary-foreground"/></div>
        <span className="text-base font-bold tracking-widest uppercase" style={{fontFamily:"var(--font-display)"}}>Pulse</span>
      </button>
      {active && (
        <>
          <ChevronRight size={15} className="text-border"/>
          <div className="relative" ref={ref}>
            <button
              onClick={()=>setOpen(!open)}
              className={`flex items-center gap-2.5 px-3 py-1.5 border transition-colors ${open?"border-primary bg-primary/5":"border-border hover:border-primary/50 hover:bg-muted/40"}`}>
              {/* coloured health dot */}
              <span className="w-2 h-2 rounded-full shrink-0" style={{backgroundColor:hColor(active.score)}}/>
              <div className="text-left">
                <div className="text-[15px] font-bold leading-tight" style={{fontFamily:"var(--font-display)"}}>{active.name}</div>
                <div className="text-xs text-muted-foreground leading-none mt-0.5 truncate max-w-[220px]">
                  {active.owner && active.repo ? `${active.owner}/${active.repo}` : "Switch project"}
                </div>
              </div>
              <ChevronDown size={13} className={`text-muted-foreground transition-transform ${open?"rotate-180":""}`}/>
            </button>
            <AnimatePresence>
              {open && (
                <motion.div initial={{opacity:0,y:-6}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-6}} transition={{duration:0.13}}
                  className="absolute left-0 top-full mt-1 w-72 bg-popover border border-border shadow-2xl z-50">
                  <div className="px-3 pt-3 pb-2 border-b border-border">
                    <div className="text-xs font-semibold text-muted-foreground mb-2">Switch to project</div>
                    <div className="flex items-center gap-2 bg-muted px-3 py-2">
                      <Search size={13} className="text-muted-foreground shrink-0"/>
                      <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Search projects…"
                        className="bg-transparent text-sm outline-none flex-1 placeholder:text-muted-foreground"/>
                    </div>
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {filtered.map(p=>(
                      <button key={p.id} onClick={()=>{onSelect(p.id);setOpen(false);setQ("");}}
                        className={`w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted transition-colors border-b border-border/50 last:border-b-0 text-left ${p.id===activeId?"bg-primary/5 border-l-2 border-l-primary":""}`}>
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{backgroundColor:hColor(p.score)}}/>
                        <div className="flex-1 min-w-0">
                          <div className={`text-[15px] font-semibold truncate ${p.id===activeId?"text-primary":"text-foreground"}`} style={{fontFamily:"var(--font-display)"}}>{p.name}</div>
                          <div className="text-sm text-muted-foreground truncate">{p.team}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className={`text-base font-bold tabular-nums ${hClass(p.score)}`} style={{fontFamily:"var(--font-mono)"}}>{p.score}</div>
                          {p.id===activeId&&<div className="text-xs text-primary font-medium">current</div>}
                        </div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}
      <div className="ml-auto flex items-center gap-1">
        {/* Rating reminder icon */}
        {pendingCount>0&&(
          <button onClick={onRatingOpen}
            className="relative p-2 text-amber-500 hover:text-amber-400 transition-colors"
            title={`${pendingCount} action${pendingCount>1?"s":""} need your effectiveness rating`}>
            <Star size={17} className="fill-amber-400 text-amber-400"/>
            <span className="absolute top-1 right-0.5 min-w-[16px] h-4 bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center px-0.5 leading-none">
              {pendingCount}
            </span>
          </button>
        )}
        <button className="relative p-2 text-muted-foreground hover:text-foreground transition-colors">
          <Bell size={17}/>
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"/>
        </button>
        <button onClick={onManageWorkspaces} title="Switch workspace" className="p-2 text-muted-foreground hover:text-foreground transition-colors">
          <Building2 size={17}/>
        </button>
        <button onClick={onToggle} className="p-2 text-muted-foreground hover:text-foreground transition-colors">
          {dark?<Sun size={17}/>:<Moon size={17}/>}
        </button>
        <div className="w-8 h-8 bg-primary flex items-center justify-center text-sm font-bold text-primary-foreground ml-1" style={{fontFamily:"var(--font-display)"}}>SC</div>
      </div>
    </header>
  );
}
