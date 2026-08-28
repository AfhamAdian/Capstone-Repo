import { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router";
import { BarChart2, Zap, MessageSquare, Settings, ChevronDown, Plus, Star } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type { Project } from "../types";

export function Sidebar({project,onLogAction}:{project:Project;onLogAction:()=>void;}) {
  const location = useLocation();
  const actionsActive = /\/actions(\/|$)/.test(location.pathname);
  const [actOpen,setActOpen]=useState(actionsActive);
  useEffect(()=>{if(actionsActive)setActOpen(true);},[actionsActive]);
  const navClass=({isActive}:{isActive:boolean})=>
    `w-full flex items-center gap-3 px-4 py-3 text-left text-[15px] transition-colors ${isActive?"bg-sidebar-accent text-foreground font-semibold":"text-foreground/70 hover:text-foreground hover:bg-sidebar-accent/50"}`;
  const navStyle=({isActive}:{isActive:boolean})=>
    isActive?{borderLeft:"3px solid var(--primary)"}:{borderLeft:"3px solid transparent"};
  const subClass=({isActive}:{isActive:boolean})=>
    `block w-full text-left py-2.5 pl-11 pr-4 text-[15px] transition-colors ${isActive?"text-primary font-semibold":"text-foreground/60 hover:text-foreground"}`;
  return (
    <aside className="w-56 shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col h-full">
      <div className="flex-1 py-3 overflow-y-auto">
        <NavLink to="." end className={navClass} style={navStyle}>
          {({isActive}) => (<><span className={isActive?"text-primary":"text-foreground/50"}><BarChart2 size={16}/></span><span style={{fontFamily:"var(--font-display)"}} className="font-medium">Dashboard</span></>)}
        </NavLink>
        <div>
          <button onClick={()=>setActOpen(!actOpen)}
            className="w-full flex items-center justify-between px-4 py-3 text-[15px] text-foreground/70 hover:text-foreground hover:bg-sidebar-accent/50 transition-colors border-l-[3px] border-transparent">
            <div className="flex items-center gap-3"><Zap size={16}/><span style={{fontFamily:"var(--font-display)"}} className="font-medium">Actions</span></div>
            <ChevronDown size={14} className={`transition-transform ${actOpen?"rotate-180":""}`}/>
          </button>
          <AnimatePresence>
            {actOpen&&(
              <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} transition={{duration:0.13}} className="overflow-hidden">
                <NavLink to="actions" end className={subClass}>Timeline</NavLink>
                <NavLink to="actions/library" className={subClass}>Library</NavLink>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <NavLink to="surveys" className={navClass} style={navStyle}>
          {({isActive}) => (<><span className={isActive?"text-primary":"text-foreground/50"}><MessageSquare size={16}/></span><span style={{fontFamily:"var(--font-display)"}} className="font-medium">Surveys</span></>)}
        </NavLink>
        <NavLink to="settings" className={navClass} style={navStyle}>
          {({isActive}) => (<><span className={isActive?"text-primary":"text-foreground/50"}><Settings size={16}/></span><span style={{fontFamily:"var(--font-display)"}} className="font-medium">Settings</span></>)}
        </NavLink>
      </div>
      <div className="p-4 border-t border-sidebar-border space-y-2">
        <button onClick={onLogAction} className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground text-[15px] font-semibold py-2.5 hover:opacity-90 transition-opacity" style={{fontFamily:"var(--font-display)"}}>
          <Plus size={14}/> Log Action
        </button>
        {project.pendingReview>0&&(
          <button className="w-full text-sm text-amber-500 text-center hover:text-amber-400 transition-colors flex items-center justify-center gap-1.5 py-1">
            <Star size={12}/>{project.pendingReview} action{project.pendingReview>1?"s":""} need review
          </button>
        )}
      </div>
    </aside>
  );
}
