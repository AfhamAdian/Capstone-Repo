import { useState, useRef, useEffect } from "react";
import {
  Activity, ChevronRight, ChevronDown, Search, Star, Building2, Moon, Sun, LogOut,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type { Project } from "../types";
import { hColor, hClass } from "../format";
import { findProjectByPath } from "../hooks/useProjectHealth";
import { useWorkspace } from "../context/WorkspaceContext";
import { FieldShell } from "./PageShell";

export function TopBar({dark,onToggle,projects,activeId,onSelect,onHome,pendingCount,onRatingOpen,onManageWorkspaces}:{
  dark:boolean;onToggle:()=>void;projects:Project[];activeId:string|null;onSelect:(id:string)=>void;onHome:()=>void;
  pendingCount:number;onRatingOpen:()=>void;onManageWorkspaces:()=>void;
}) {
  const {user,logout}=useWorkspace();
  const [open,setOpen]=useState(false);
  const [q,setQ]=useState("");
  const [userOpen,setUserOpen]=useState(false);
  const ref=useRef<HTMLDivElement>(null);
  const userRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const h=(e:MouseEvent)=>{
      if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false);
      if(userRef.current&&!userRef.current.contains(e.target as Node))setUserOpen(false);
    };
    document.addEventListener("mousedown",h); return ()=>document.removeEventListener("mousedown",h);
  },[]);
  // Escape closes whichever menu is open, so neither traps a keyboard user.
  useEffect(()=>{
    const h=(e:KeyboardEvent)=>{if(e.key==="Escape"){setOpen(false);setUserOpen(false);}};
    document.addEventListener("keydown",h); return ()=>document.removeEventListener("keydown",h);
  },[]);
  const userLabel=user?.name||user?.email||"";
  const initials=userLabel.split(/[\s@.]+/).filter(Boolean).slice(0,2).map(s=>s[0]?.toUpperCase()).join("")||"?";
  const active=findProjectByPath(projects,activeId);
  const filtered=projects.filter(p=>p.name.toLowerCase().includes(q.toLowerCase()));
  const iconBtn="p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors";
  return (
    // min-w-0 on the flexible middle section is what stops the right-hand controls
    // from being pushed off a narrow viewport, where the app shell would clip them.
    <header className="shrink-0 h-14 border-b border-border bg-card flex items-center px-4 sm:px-6 gap-3 sm:gap-5 z-30">
      <button onClick={onHome} className="flex items-center gap-2.5 hover:opacity-75 transition-opacity shrink-0">
        <div className="w-7 h-7 bg-primary flex items-center justify-center"><Activity size={14} className="text-primary-foreground"/></div>
        <span className="hidden xs:inline text-base font-bold tracking-[0.18em] uppercase" style={{fontFamily:"var(--font-display)"}}>Pulse</span>
      </button>
      {active && (
        <>
          <ChevronRight size={15} className="text-muted-foreground-subtle shrink-0 hidden sm:block"/>
          <div className="relative min-w-0 hidden sm:block" ref={ref}>
            <button
              onClick={()=>setOpen(!open)}
              aria-expanded={open}
              aria-haspopup="listbox"
              className={`flex items-center gap-2.5 px-3 py-1.5 border transition-colors max-w-full ${open?"border-primary bg-primary/5":"border-border hover:border-primary/50 hover:bg-muted/40"}`}>
              {/* coloured health dot */}
              <span className="w-2 h-2 rounded-full shrink-0" style={{backgroundColor:hColor(active.score)}}/>
              <div className="text-left min-w-0">
                <div className="text-base font-bold leading-tight truncate" style={{fontFamily:"var(--font-display)"}}>{active.name}</div>
                <div className="text-xs text-muted-foreground leading-none mt-0.5 truncate max-w-[220px]">
                  {active.owner && active.repo ? `${active.owner}/${active.repo}` : "Switch project"}
                </div>
              </div>
              <ChevronDown size={13} className={`text-muted-foreground shrink-0 transition-transform ${open?"rotate-180":""}`}/>
            </button>
            <AnimatePresence>
              {open && (
                <motion.div initial={{opacity:0,y:-6}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-6}} transition={{duration:0.13}}
                  className="absolute left-0 top-full mt-1 w-72 bg-popover border border-border shadow-overlay z-50">
                  <div className="px-3 pt-3 pb-2 border-b border-border">
                    <div className="text-xs font-semibold text-muted-foreground mb-2">Switch to project</div>
                    <FieldShell className="bg-muted border-0 px-3 py-2">
                      <Search size={13} className="text-muted-foreground shrink-0"/>
                      <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Search projects…"
                        aria-label="Search projects"
                        className="bg-transparent text-sm flex-1 min-w-0 placeholder:text-muted-foreground"/>
                    </FieldShell>
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {filtered.map(p=>(
                      <button key={p.id} onClick={()=>{onSelect(p.id);setOpen(false);setQ("");}}
                        className={`w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted transition-colors border-b border-border/50 last:border-b-0 text-left ${p.id===activeId?"bg-primary/5 border-l-2 border-l-primary":""}`}>
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{backgroundColor:hColor(p.score)}}/>
                        <div className="flex-1 min-w-0">
                          <div className={`text-base font-semibold truncate ${p.id===activeId?"text-link":"text-foreground"}`} style={{fontFamily:"var(--font-display)"}}>{p.name}</div>
                          <div className="text-sm text-muted-foreground truncate">{p.team}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className={`text-base font-bold tabular-nums ${hClass(p.score)}`} style={{fontFamily:"var(--font-mono)"}}>{p.score}</div>
                          {p.id===activeId&&<div className="text-xs text-link font-medium">current</div>}
                        </div>
                      </button>
                    ))}
                    {filtered.length===0&&(
                      <div className="px-4 py-6 text-sm text-muted-foreground text-center">No project matches “{q}”.</div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}
      <div className="ml-auto flex items-center gap-1 shrink-0">
        {/* Rating reminder icon */}
        <button onClick={onRatingOpen}
          className={`relative p-2 transition-colors ${pendingCount>0?"text-attention hover:bg-attention/10":"text-muted-foreground hover:text-foreground hover:bg-muted"}`}
          aria-label={pendingCount>0?`${pendingCount} unrated action${pendingCount===1?"":"s"} owned by you`:"Open effectiveness reviews"}
          title={pendingCount>0?`${pendingCount} action${pendingCount>1?"s":""} need your effectiveness rating`:"Effectiveness reviews"}>
          <Star size={17} className={pendingCount>0?"fill-attention text-attention":""}/>
          {pendingCount>0&&<span className="absolute top-0.5 right-0 min-w-[16px] h-4 bg-attention text-background text-xs font-bold flex items-center justify-center px-0.5 leading-none">
            {pendingCount}
          </span>}
        </button>
        <button onClick={onManageWorkspaces} title="Switch workspace" aria-label="Switch workspace" className={iconBtn}>
          <Building2 size={17}/>
        </button>
        <button onClick={onToggle} aria-label={dark?"Switch to light theme":"Switch to dark theme"} title={dark?"Switch to light theme":"Switch to dark theme"} className={iconBtn}>
          {dark?<Sun size={17}/>:<Moon size={17}/>}
        </button>
        <div className="relative ml-1" ref={userRef}>
          <button onClick={()=>setUserOpen(o=>!o)} title={userLabel||"Account"} aria-label={userLabel?`Account: ${userLabel}`:"Account"} aria-expanded={userOpen} aria-haspopup="menu"
            className="w-8 h-8 bg-primary flex items-center justify-center text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity" style={{fontFamily:"var(--font-display)"}}>
            {initials}
          </button>
          <AnimatePresence>
            {userOpen&&(
              <motion.div initial={{opacity:0,y:-6}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-6}} transition={{duration:0.13}}
                role="menu"
                className="absolute right-0 top-full mt-1 w-56 bg-popover border border-border shadow-overlay z-50">
                {userLabel&&(
                  <div className="px-4 py-3 border-b border-border">
                    {user?.name&&<div className="text-sm font-semibold text-foreground truncate">{user.name}</div>}
                    {user?.email&&<div className="text-xs text-muted-foreground truncate">{user.email}</div>}
                  </div>
                )}
                <button onClick={()=>{setUserOpen(false);logout();}} role="menuitem"
                  className="w-full flex items-center gap-2 px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors text-left">
                  <LogOut size={15}/> Log out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
