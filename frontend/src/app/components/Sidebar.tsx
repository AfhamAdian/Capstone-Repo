import { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router";
import { BarChart2, Zap, MessageSquare, Settings, ChevronDown, Plus, Star } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type { Project } from "../types";

/**
 * Project navigation. A vertical rail from `lg` up; below that the same four
 * destinations become a horizontal strip above the content, so the nav never eats
 * a fixed 224px out of a narrow viewport.
 */
export function Sidebar({project,onLogAction,pendingReviewCount,onRatingOpen}:{project:Project;onLogAction:()=>void;pendingReviewCount:number;onRatingOpen:()=>void;}) {
  const location = useLocation();
  const actionsActive = /\/actions(\/|$)/.test(location.pathname);
  const [actOpen,setActOpen]=useState(actionsActive);
  useEffect(()=>{if(actionsActive)setActOpen(true);},[actionsActive]);

  const navClass=({isActive}:{isActive:boolean})=>
    `flex items-center gap-3 px-4 py-3 text-left text-base transition-colors lg:w-full ${isActive?"bg-sidebar-accent text-foreground font-semibold":"text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50"}`;
  // The active marker runs down the left edge on the rail and along the bottom on the strip.
  const navStyle=({isActive}:{isActive:boolean})=>({
    boxShadow: isActive ? "inset 3px 0 0 0 var(--primary)" : undefined,
  });
  const subClass=({isActive}:{isActive:boolean})=>
    `block w-full text-left py-2.5 pl-11 pr-4 text-base transition-colors ${isActive?"text-link font-semibold":"text-muted-foreground hover:text-foreground"}`;

  return (
    <aside
      aria-label={`${project.name} navigation`}
      className="shrink-0 bg-sidebar border-b lg:border-b-0 lg:border-r border-sidebar-border flex flex-col lg:w-56 lg:h-full">
      <nav className="flex-1 flex lg:flex-col overflow-x-auto lg:overflow-x-visible lg:overflow-y-auto lg:py-3">
        <NavLink to="." end className={navClass} style={navStyle}>
          {({isActive}) => (<><span className={isActive?"text-link":"text-muted-foreground"}><BarChart2 size={16}/></span><span style={{fontFamily:"var(--font-display)"}} className="font-medium">Dashboard</span></>)}
        </NavLink>

        {/* On the rail this is a collapsible group; on the strip the two children sit inline. */}
        <div className="hidden lg:block">
          <button onClick={()=>setActOpen(!actOpen)} aria-expanded={actOpen}
            className="w-full flex items-center justify-between px-4 py-3 text-base text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50 transition-colors">
            <span className="flex items-center gap-3"><Zap size={16}/><span style={{fontFamily:"var(--font-display)"}} className="font-medium">Actions</span></span>
            <ChevronDown size={14} className={`transition-transform ${actOpen?"rotate-180":""}`}/>
          </button>
          <AnimatePresence initial={false}>
            {actOpen&&(
              <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} transition={{duration:0.13}} className="overflow-hidden">
                <NavLink to="actions" end className={subClass}>Timeline</NavLink>
                <NavLink to="actions/library" className={subClass}>Library</NavLink>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <NavLink to="actions" end className={s=>`${navClass(s)} lg:hidden`} style={navStyle}>
          <Zap size={16}/><span style={{fontFamily:"var(--font-display)"}} className="font-medium">Timeline</span>
        </NavLink>
        <NavLink to="actions/library" className={s=>`${navClass(s)} lg:hidden`} style={navStyle}>
          <Zap size={16}/><span style={{fontFamily:"var(--font-display)"}} className="font-medium">Library</span>
        </NavLink>

        <NavLink to="surveys" className={navClass} style={navStyle}>
          {({isActive}) => (<><span className={isActive?"text-link":"text-muted-foreground"}><MessageSquare size={16}/></span><span style={{fontFamily:"var(--font-display)"}} className="font-medium">Surveys</span></>)}
        </NavLink>
        <NavLink to="settings" className={navClass} style={navStyle}>
          {({isActive}) => (<><span className={isActive?"text-link":"text-muted-foreground"}><Settings size={16}/></span><span style={{fontFamily:"var(--font-display)"}} className="font-medium">Settings</span></>)}
        </NavLink>

        {/* On the strip the primary action rides along at the end of the nav row. */}
        <button onClick={onLogAction}
          className="lg:hidden shrink-0 ml-auto my-2 mr-3 flex items-center gap-2 bg-primary text-primary-foreground text-sm font-semibold px-4 py-2 hover:opacity-90 transition-opacity"
          style={{fontFamily:"var(--font-display)"}}>
          <Plus size={14}/> Log action
        </button>
      </nav>

      <div className="hidden lg:block p-4 border-t border-sidebar-border space-y-2">
        <button onClick={onLogAction} className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground text-base font-semibold py-2.5 hover:opacity-90 transition-opacity" style={{fontFamily:"var(--font-display)"}}>
          <Plus size={14}/> Log action
        </button>
        {pendingReviewCount>0&&(
          <button onClick={onRatingOpen} className="w-full text-sm text-attention text-center hover:underline transition-colors flex items-center justify-center gap-1.5 py-1">
            <Star size={12}/>{pendingReviewCount} action{pendingReviewCount>1?"s":""} need review
          </button>
        )}
      </div>
    </aside>
  );
}
