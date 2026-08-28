import { useState, useMemo, useEffect } from "react";
import {
  ChevronLeft, Plus, Search, RefreshCw, X, AlertCircle, ChevronDown, Star,
} from "lucide-react";
import {
  ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ReferenceLine, Brush, ResponsiveContainer,
} from "recharts";
import { motion, AnimatePresence } from "motion/react";
import { searchActions, type ActionSearchMode } from "../api";
import type { Project, Action } from "../types";
import { actionSearchModeLabel, actionSimilarityLabel, projectTagStyle, fmtDate, ttStyle } from "../format";
import { InlineRating } from "../components/InlineRating";

export function GlobalActionsView({actions,projects,onBack,onLogAction,onRateAction}:{
  actions:Action[];projects:Project[];onBack:()=>void;onLogAction:()=>void;onRateAction:(id:string,rating:number)=>void;
}) {
  const [q,setQ]=useState("");
  const [filterProject,setFilterProject]=useState("all");
  const [sortOrder,setSortOrder]=useState<"newest"|"oldest">("newest");
  const [ex,setEx]=useState<string|null>(null);
  const [searchResults,setSearchResults]=useState<Action[]|null>(null);
  const [searching,setSearching]=useState(false);
  const [searchMode,setSearchMode]=useState<ActionSearchMode|null>(null);
  const [searchError,setSearchError]=useState<string|null>(null);

  useEffect(()=>{
    const query=q.trim();
    if(query.length<3){setSearchResults(null);setSearching(false);setSearchMode(null);setSearchError(null);return;}
    const controller=new AbortController();
    setSearching(true);setSearchError(null);
    const timer=setTimeout(()=>{
      searchActions(query,50,{projectId:filterProject!=="all"?filterProject:undefined,signal:controller.signal})
        .then(result=>{setSearchResults(result.actions);setSearchMode(result.mode);})
        .catch(error=>{if((error as Error).name!=="AbortError")setSearchError("Search service unavailable. Showing local keyword matches.");})
        .finally(()=>{if(!controller.signal.aborted)setSearching(false);});
    },300);
    return()=>{clearTimeout(timer);controller.abort();};
  },[q,filterProject]);

  const filtered=useMemo(()=>{
    const semanticQuery=q.trim().length>=3;
    let list=[...(semanticQuery&&!searchError?(searchResults??[]):actions)];
    if(filterProject!=="all") list=list.filter(a=>a.projectIds.includes(filterProject));
    if(q&&(!semanticQuery||searchError)){const lq=q.toLowerCase();list=list.filter(a=>a.problem.toLowerCase().includes(lq)||a.actionTaken.toLowerCase().includes(lq)||a.reason.toLowerCase().includes(lq));}
    if(!semanticQuery||searchError)list.sort((a,b)=>{const da=new Date(a.timestamp).getTime(),db=new Date(b.timestamp).getTime();return sortOrder==="newest"?db-da:da-db;});
    return list;
  },[actions,searchResults,searchError,q,filterProject,sortOrder]);

  const COL="minmax(0,2.5fr) 150px 130px 90px 36px";

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-6xl mx-auto px-8 py-8">
        <div className="flex items-center gap-4 mb-7 flex-wrap">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors font-medium">
            <ChevronLeft size={15}/> Portfolio
          </button>
          <h1 className="text-3xl font-bold uppercase tracking-wide" style={{fontFamily:"var(--font-display)"}}>All Actions</h1>
          <span className="text-base text-muted-foreground" style={{fontFamily:"var(--font-mono)"}}>{filtered.length} records</span>
          <div className="ml-auto">
            <button onClick={onLogAction}
              className="flex items-center gap-2 bg-primary text-primary-foreground text-base font-bold px-6 py-3 hover:opacity-90 transition-opacity shadow-lg"
              style={{fontFamily:"var(--font-display)"}}>
              <Plus size={16}/> Log Action
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div className="flex items-center gap-2 bg-card border border-border px-3 py-2.5 flex-1 max-w-sm">
            <Search size={14} className="text-muted-foreground"/>
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search actions by meaning…"
              className="bg-transparent text-sm outline-none flex-1 placeholder:text-muted-foreground"/>
            {searching&&<RefreshCw size={13} className="text-primary animate-spin"/>}
            {q&&<button onClick={()=>setQ("")} className="text-muted-foreground hover:text-foreground"><X size={13}/></button>}
          </div>
          <select value={filterProject} onChange={e=>setFilterProject(e.target.value)}
            className="bg-card border border-border px-3 py-2.5 text-sm font-medium text-foreground outline-none focus:border-primary cursor-pointer">
            <option value="all">All Projects</option>
            {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {q.trim().length>=3&&<div className="border border-border bg-card px-3 py-2.5 text-sm font-semibold text-primary">{searching?"Searching…":searchError?"Local keyword results":actionSearchModeLabel(searchMode)}</div>}
          <div className="flex border border-border">
            {(["newest","oldest"] as const).map(o=>(
              <button key={o} onClick={()=>setSortOrder(o)}
                className={`px-3 py-2.5 text-sm font-semibold capitalize transition-colors ${sortOrder===o?"bg-foreground text-background":"text-muted-foreground hover:text-foreground"}`}
                style={{fontFamily:"var(--font-display)"}}>
                {o}
              </button>
            ))}
          </div>
        </div>

        {searchError&&q.trim().length>=3&&<div className="mb-4 flex items-center gap-2 border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"><AlertCircle size={14}/>{searchError}</div>}

        <div className="border border-border bg-card">
          <div className="grid px-5 py-3 border-b border-border bg-muted" style={{gridTemplateColumns:COL}}>
            {["Problem","Projects","Date","Rating",""].map(h=><div key={h} className="text-sm font-semibold text-foreground" style={{fontFamily:"var(--font-display)"}}>{h}</div>)}
          </div>
          {filtered.map(a=>{
            const projs=projects.filter(p=>a.projectIds.includes(p.id));
            return (
              <div key={a.id}>
                <button onClick={()=>setEx(ex===a.id?null:a.id)}
                  className="w-full grid px-5 py-4 border-b border-border hover:bg-muted/40 transition-colors text-left items-center"
                  style={{gridTemplateColumns:COL}}>
                  <div>
                    <div className="flex items-start gap-2"><div className="text-[15px] font-medium text-foreground leading-snug">{a.problem}</div>{actionSimilarityLabel(a.similarity)&&<span className="shrink-0 bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">{actionSimilarityLabel(a.similarity)}</span>}</div>
                    <div className="text-sm text-muted-foreground mt-0.5">{a.loggedBy}</div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {projs.map(p=>{
                      const st=projectTagStyle(p.score);
                      return <span key={p.id} className={`text-xs font-semibold px-2 py-0.5 ${st.bg} ${st.text}`}>{p.name}</span>;
                    })}
                  </div>
                  <div className="text-sm font-medium text-foreground bg-muted px-2 py-1 w-fit" style={{fontFamily:"var(--font-mono)"}}>{fmtDate(a.timestamp)}</div>
                  <InlineRating effectiveness={a.effectiveness} onRate={rating=>onRateAction(a.id,rating)}/>
                  <ChevronDown size={14} className={`text-muted-foreground transition-transform ${ex===a.id?"rotate-180":""}`}/>
                </button>
                <AnimatePresence>
                  {ex===a.id&&(
                    <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} transition={{duration:0.14}} className="overflow-hidden border-b border-border bg-muted/20">
                      <div className="px-5 py-5 grid grid-cols-2 gap-6">
                        <div><div className="text-sm font-semibold text-muted-foreground mb-2">Problem &amp; Root Cause</div><div className="text-[15px] text-foreground leading-relaxed">{a.reason}</div></div>
                        <div><div className="text-sm font-semibold text-muted-foreground mb-2">Action Taken</div><div className="text-[15px] text-foreground leading-relaxed">{a.actionTaken}</div></div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
          {filtered.length===0&&<div className="text-center py-16 text-base text-muted-foreground">No actions match your filter.</div>}
        </div>
      </div>
    </div>
  );
}

export function ActionsTimeline({project,actions}:{project:Project;actions:Action[];}) {
  const ts=project.timeSeries;
  const minDate=ts[0]?.date??"", maxDate=ts[ts.length-1]?.date??"";
  const [start,setStart]=useState(()=>{const d=new Date(maxDate);d.setDate(d.getDate()-30);return d.toISOString().split("T")[0];});
  const [end,setEnd]=useState(maxDate);
  const [sel,setSel]=useState<Action|null>(null);
  const filtered=useMemo(()=>ts.filter(d=>d.date>=start&&d.date<=end),[ts,start,end]);
  const pa=actions.filter(a=>a.projectIds.includes(project.id));
  const setPreset=(days:number|null)=>{setEnd(maxDate);if(days===null){setStart(minDate);return;}const d=new Date(maxDate);d.setDate(d.getDate()-days);setStart(d.toISOString().split("T")[0]);};
  const am=useMemo(()=>{
    const map:Record<string,Action>={};
    pa.forEach(a=>{
      if(!filtered.length)return;
      const cl=filtered.reduce((p,c)=>Math.abs(new Date(c.date).getTime()-new Date(a.timestamp).getTime())<Math.abs(new Date(p.date).getTime()-new Date(a.timestamp).getTime())?c:p,filtered[0]);
      if(cl)map[cl.label]=a;
    });return map;
  },[pa,filtered]);
  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-5xl mx-auto px-8 py-8">
        <h2 className="text-3xl font-bold uppercase tracking-wide mb-7" style={{fontFamily:"var(--font-display)"}}>Actions Timeline</h2>
        <div className="flex items-center gap-3 mb-7 flex-wrap">
          <div className="flex border border-border">
            {[{l:"7D",d:7},{l:"30D",d:30},{l:"90D",d:90},{l:"All",d:null}].map(r=>(
              <button key={r.l} onClick={()=>setPreset(r.d)}
                className="px-4 py-2.5 text-[15px] font-semibold text-foreground/70 hover:text-foreground hover:bg-muted transition-colors border-r border-border last:border-r-0"
                style={{fontFamily:"var(--font-display)"}}>
                {r.l}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 bg-card border border-border px-4 py-2.5">
            <span className="text-sm font-medium text-muted-foreground">From</span>
            <input type="date" value={start} min={minDate} max={end} onChange={e=>setStart(e.target.value)}
              className="bg-transparent text-[15px] outline-none text-foreground" style={{fontFamily:"var(--font-mono)"}}/>
          </div>
          <div className="flex items-center gap-2 bg-card border border-border px-4 py-2.5">
            <span className="text-sm font-medium text-muted-foreground">To</span>
            <input type="date" value={end} min={start} max={maxDate} onChange={e=>setEnd(e.target.value)}
              className="bg-transparent text-[15px] outline-none text-foreground" style={{fontFamily:"var(--font-mono)"}}/>
          </div>
          <div className="bg-card border border-border px-4 py-2.5 text-sm text-muted-foreground">
            {filtered.length} data points shown
          </div>
        </div>
        <div className="bg-card border border-border p-6 mb-7">
          <div className="text-base font-bold text-foreground mb-1" style={{fontFamily:"var(--font-display)"}}>Health Score Over Time</div>
          <div className="text-sm text-muted-foreground mb-5">Orange markers indicate logged actions</div>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={filtered} margin={{top:5,right:8,bottom:24,left:8}}>
              <CartesianGrid strokeDasharray="2 8" stroke="var(--border)" vertical={false}/>
              <XAxis dataKey="label" tick={{fill:"var(--foreground)",fontSize:11,fontFamily:"var(--font-mono)"}} tickLine={false} axisLine={{stroke:"var(--border)"}} interval={Math.max(1,Math.floor(filtered.length/8))}/>
              <YAxis domain={[20,100]} tick={{fill:"var(--foreground)",fontSize:11,fontFamily:"var(--font-mono)"}} tickLine={false} axisLine={false} width={30}/>
              <ReTooltip contentStyle={ttStyle} formatter={(v:number)=>[v,"Score"]}/>
              <Area type="monotone" dataKey="score" stroke="var(--primary)" strokeWidth={2} fill="var(--primary)" fillOpacity={0.07} dot={false}/>
              {Object.keys(am).map(label=><ReferenceLine key={label} x={label} stroke="var(--chart-3)" strokeDasharray="3 3" strokeWidth={2} label={{value:"▲",position:"bottom",fill:"var(--chart-3)",fontSize:10}}/>)}
              <Brush dataKey="label" height={24} travellerWidth={10} stroke="var(--border)" fill="var(--muted)" tickFormatter={()=>""}/>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div>
          <div className="text-base font-bold text-foreground mb-4" style={{fontFamily:"var(--font-display)"}}>Logged Actions ({pa.length})</div>
          <div className="space-y-2">
            {pa.map(a=>(
              <div key={a.id} className="bg-card border border-border overflow-hidden">
                <button onClick={()=>setSel(sel?.id===a.id?null:a)}
                  className="w-full px-5 py-4 flex items-start justify-between gap-4 hover:bg-muted/30 transition-colors text-left">
                  <div>
                    <div className="text-sm text-muted-foreground mb-1.5">{fmtDate(a.timestamp)} · {a.loggedBy}</div>
                    <div className="text-[15px] font-semibold text-foreground">{a.problem}</div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {a.effectiveness!==null?<div className="flex gap-0.5">{Array.from({length:5}).map((_,i)=><Star key={i} size={12} className={i<a.effectiveness!?"text-amber-400 fill-amber-400":"text-muted-foreground"}/>)}</div>:<span className="text-sm text-muted-foreground italic">pending</span>}
                    <ChevronDown size={14} className={`text-muted-foreground transition-transform ${sel?.id===a.id?"rotate-180":""}`}/>
                  </div>
                </button>
                <AnimatePresence>
                  {sel?.id===a.id&&(
                    <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} transition={{duration:0.14}} className="overflow-hidden">
                      <div className="px-5 pb-5 pt-2 border-t border-border grid grid-cols-2 gap-5">
                        <div><div className="text-sm font-semibold text-muted-foreground mb-2">Root Cause</div><div className="text-[15px] text-foreground leading-relaxed">{a.reason}</div></div>
                        <div><div className="text-sm font-semibold text-muted-foreground mb-2">Action Taken</div><div className="text-[15px] text-foreground leading-relaxed">{a.actionTaken}</div></div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ActionsLibrary({actions,projectId}:{actions:Action[];projectId?:string;}) {
  const [q,setQ]=useState(""), [ex,setEx]=useState<string|null>(null);
  const [searchResults,setSearchResults]=useState<Action[]|null>(null);
  const [searching,setSearching]=useState(false);
  const [searchMode,setSearchMode]=useState<ActionSearchMode|null>(null);
  const [searchError,setSearchError]=useState<string|null>(null);
  useEffect(()=>{
    const query=q.trim();
    if(query.length<3){setSearchResults(null);setSearching(false);setSearchMode(null);setSearchError(null);return;}
    const controller=new AbortController();
    setSearching(true);setSearchError(null);
    const timer=setTimeout(()=>{
      searchActions(query,50,{projectId,signal:controller.signal})
        .then(result=>{setSearchResults(result.actions);setSearchMode(result.mode);})
        .catch(error=>{if((error as Error).name!=="AbortError")setSearchError("Search service unavailable. Showing local keyword matches.");})
        .finally(()=>{if(!controller.signal.aborted)setSearching(false);});
    },300);
    return()=>{clearTimeout(timer);controller.abort();};
  },[q,projectId]);
  const filtered=useMemo(()=>{
    const base=actions.filter(a=>!projectId||a.projectIds.includes(projectId));
    if(q.trim().length>=3&&!searchError)return searchResults??[];
    if(!q)return base;
    const lq=q.toLowerCase();
    return base.filter(a=>a.problem.toLowerCase().includes(lq)||a.actionTaken.toLowerCase().includes(lq)||a.reason.toLowerCase().includes(lq));
  },[actions,searchResults,searchError,q,projectId]);
  const COL="minmax(0,3fr) 140px 120px 90px";
  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-5xl mx-auto px-8 py-8">
        <div className="flex items-center justify-between mb-7">
          <h2 className="text-3xl font-bold uppercase tracking-wide" style={{fontFamily:"var(--font-display)"}}>Actions Library</h2>
          <span className="text-base text-muted-foreground" style={{fontFamily:"var(--font-mono)"}}>{filtered.length} records</span>
        </div>
        <div className="flex items-center gap-2 bg-card border border-border px-4 py-3.5 mb-6">
          <Search size={16} className="text-muted-foreground shrink-0"/>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search action history by meaning…"
            className="flex-1 text-[15px] bg-transparent outline-none placeholder:text-muted-foreground"/>
          {searching&&<RefreshCw size={14} className="text-primary animate-spin"/>}
          {q&&<button onClick={()=>setQ("")} className="text-muted-foreground hover:text-foreground"><X size={15}/></button>}
        </div>
        {q.trim().length>=3&&!searching&&<div className={`mb-4 flex items-center gap-2 border px-3 py-2 text-sm ${searchError?"border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300":"border-border bg-muted/30 text-muted-foreground"}`}>
          {searchError?<AlertCircle size={14}/>:<Search size={14}/>} {searchError??actionSearchModeLabel(searchMode)}
        </div>}
        <div className="border border-border bg-card">
          <div className="grid px-5 py-3 border-b border-border bg-muted" style={{gridTemplateColumns:COL}}>
            {["Problem","Logged By","Date","Rating"].map(h=><div key={h} className="text-sm font-semibold text-foreground" style={{fontFamily:"var(--font-display)"}}>{h}</div>)}
          </div>
          {filtered.map(a=>(
            <div key={a.id}>
              <button onClick={()=>setEx(ex===a.id?null:a.id)}
                className="w-full grid px-5 py-4 border-b border-border hover:bg-muted/40 transition-colors text-left items-center"
                style={{gridTemplateColumns:COL}}>
                <div className="pr-5"><div className="text-[15px] font-medium text-foreground leading-snug">{a.problem}</div>{actionSimilarityLabel(a.similarity)&&<div className="mt-1 text-xs font-semibold text-primary">{actionSimilarityLabel(a.similarity)}</div>}</div>
                <div className="text-[15px] text-foreground/80">{a.loggedBy}</div>
                <div className="text-sm font-medium text-foreground/70 bg-muted px-2 py-1 w-fit" style={{fontFamily:"var(--font-mono)"}}>{fmtDate(a.timestamp)}</div>
                <div className="flex gap-0.5 items-center">{a.effectiveness!==null?Array.from({length:5}).map((_,i)=><Star key={i} size={12} className={i<a.effectiveness!?"text-amber-400 fill-amber-400":"text-muted-foreground"}/>):<span className="text-sm text-muted-foreground">—</span>}</div>
              </button>
              <AnimatePresence>
                {ex===a.id&&(
                  <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} transition={{duration:0.14}} className="overflow-hidden border-b border-border bg-muted/20">
                    <div className="px-5 py-5 grid grid-cols-2 gap-6">
                      <div><div className="text-sm font-semibold text-muted-foreground mb-2">Root Cause</div><div className="text-[15px] text-foreground leading-relaxed">{a.reason}</div></div>
                      <div><div className="text-sm font-semibold text-muted-foreground mb-2">Action Taken</div><div className="text-[15px] text-foreground leading-relaxed">{a.actionTaken}</div></div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
          {filtered.length===0&&<div className="text-center py-16 text-base text-muted-foreground">{searching?"Searching action history…":"No actions match your search."}</div>}
        </div>
      </div>
    </div>
  );
}
