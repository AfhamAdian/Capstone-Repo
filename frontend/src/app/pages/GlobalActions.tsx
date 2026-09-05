import { useState, useMemo, useEffect, useRef } from "react";
import {
  ChevronLeft, Plus, Search, RefreshCw, X, AlertCircle, ChevronDown, Pencil, Trash2,
} from "lucide-react";
import {
  ComposedChart, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ReferenceLine, Brush, ResponsiveContainer,
} from "recharts";
import { motion, AnimatePresence } from "motion/react";
import { listAllProjectActions, searchActions, type ActionSearchMode } from "../api";
import type { Project, Action } from "../types";
import { actionIncludesProject, actionMatchesKeywordSearch, actionSearchModeLabel, actionSimilarityLabel, projectTagStyle, fmtDate, ttStyle } from "../format";
import { InlineRating } from "../components/InlineRating";
import { PageShell, PageHeader, FieldShell } from "../components/PageShell";
import { btnPrimary, btnSecondary } from "../components/ui";

export function GlobalActionsView({actions,projects,currentUserId,onBack,onLogAction,onEditAction,onDeleteAction,onRateAction}:{
  actions:Action[];projects:Project[];onBack:()=>void;onLogAction:()=>void;
  currentUserId:number|null;onEditAction:(action:Action)=>void;onDeleteAction:(id:string)=>Promise<void>;
  onRateAction:(id:string,rating:number)=>Promise<void>;
}) {
  const [q,setQ]=useState("");
  const [filterProject,setFilterProject]=useState("all");
  const [sortOrder,setSortOrder]=useState<"newest"|"oldest">("newest");
  const [ex,setEx]=useState<string|null>(null);
  const [confirmDelete,setConfirmDelete]=useState<string|null>(null);
  const [deleting,setDeleting]=useState<string|null>(null);
  const [mutationError,setMutationError]=useState<string|null>(null);
  const [searchResults,setSearchResults]=useState<Action[]|null>(null);
  const [searching,setSearching]=useState(false);
  const [searchMode,setSearchMode]=useState<ActionSearchMode|null>(null);
  const [searchError,setSearchError]=useState<string|null>(null);
  const searchController=useRef<AbortController|null>(null);

  useEffect(()=>()=>searchController.current?.abort(),[]);

  const clearDeepSearch=()=>{
    searchController.current?.abort();searchController.current=null;
    setSearchResults(null);setSearching(false);setSearchMode(null);setSearchError(null);
  };
  const updateQuery=(query:string)=>{setQ(query);clearDeepSearch();};
  const updateProjectFilter=(projectId:string)=>{setFilterProject(projectId);clearDeepSearch();};
  const deepSearch=async()=>{
    const query=q.trim();
    if(query.length<3||searching)return;
    searchController.current?.abort();
    const controller=new AbortController();
    searchController.current=controller;
    setSearching(true);setSearchResults(null);setSearchMode(null);setSearchError(null);
    try{
      const result=await searchActions(query,50,{deep:true,projectId:filterProject==="all"?undefined:filterProject,signal:controller.signal});
      if(controller.signal.aborted)return;
      setSearchResults(result.actions);setSearchMode(result.mode);
    }catch(error){
      if(!controller.signal.aborted)setSearchError(error instanceof Error?error.message:"Deep search is unavailable");
    }finally{
      if(searchController.current===controller){searchController.current=null;setSearching(false);}
    }
  };

  const filtered=useMemo(()=>{
    let list=searchResults?[...searchResults]:[...actions];
    if(filterProject!=="all") list=list.filter(a=>a.projectIds.includes(filterProject));
    if(q&&!searchResults)list=list.filter(a=>actionMatchesKeywordSearch(a,q));
    if(!searchResults)list.sort((a,b)=>{const da=new Date(a.timestamp).getTime(),db=new Date(b.timestamp).getTime();return sortOrder==="newest"?db-da:da-db;});
    return list;
  },[actions,q,filterProject,sortOrder,searchResults]);

  const COL="minmax(0,2.5fr) 150px 130px 120px 104px";
  const ROW_COL="minmax(0,2.5fr) 150px 130px";

  const removeAction=async(id:string)=>{
    if(deleting)return;
    setDeleting(id);setMutationError(null);
    try{await onDeleteAction(id);setConfirmDelete(null);setEx(null);}
    catch(error){setMutationError(error instanceof Error?error.message:"Could not delete this action");}
    finally{setDeleting(null);}
  };

  return (
    <PageShell>
        <PageHeader
          title="All actions"
          breadcrumb={
            <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors font-medium mb-2">
              <ChevronLeft size={15}/> Portfolio
            </button>
          }
          description={`${filtered.length} action${filtered.length===1?"":"s"}`}
          actions={<>
            <button onClick={()=>void deepSearch()} disabled={q.trim().length<3||searching}
              className={btnSecondary}
              title="Rerank all actions by deep similarity">
              {searching?<RefreshCw size={16} className="animate-spin"/>:<Search size={16}/>} {searching?"Searching…":"Search by meaning"}
            </button>
            <button onClick={onLogAction} className={btnPrimary} style={{fontFamily:"var(--font-display)"}}>
              <Plus size={16}/> Log action
            </button>
          </>}
        />

        {/* Filters */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <FieldShell className="flex-1 min-w-[200px] max-w-sm">
            <Search size={14} className="text-muted-foreground shrink-0"/>
            <input value={q} onChange={e=>updateQuery(e.target.value)} placeholder="Search actions by keyword…"
              aria-label="Search actions by keyword"
              className="bg-transparent text-sm flex-1 min-w-0 placeholder:text-muted-foreground"/>
            {q&&<button onClick={()=>updateQuery("")} aria-label="Clear search" className="text-muted-foreground hover:text-foreground"><X size={13}/></button>}
          </FieldShell>
          <select value={filterProject} onChange={e=>updateProjectFilter(e.target.value)}
            className="bg-card border border-border px-3 py-2.5 text-sm font-medium text-foreground focus:border-primary cursor-pointer">
            <option value="all">All Projects</option>
            {projects.map(p=><option key={p.id} value={String(p.backendProjectId??p.id)}>{p.name}</option>)}
          </select>
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

        {(searchError||searchMode)&&!searching&&<div className={`mb-4 flex items-center gap-2 border px-3 py-2 text-sm ${searchError?"border-attention-border bg-attention-surface text-attention dark:border-attention-border dark:bg-attention-surface dark:text-attention":"border-border bg-muted/30 text-muted-foreground"}`}>
          {searchError?<AlertCircle size={14}/>:<Search size={14}/>} {searchError??actionSearchModeLabel(searchMode)}
        </div>}

        <div className="border border-border bg-card overflow-x-auto">
          <div style={{minWidth:820}}>
          <div className="grid px-5 py-3 border-b border-border bg-muted" style={{gridTemplateColumns:COL}}>
            {["Problem","Projects","Date","Rating","Manage"].map(h=><div key={h} className="text-sm font-semibold text-foreground" style={{fontFamily:"var(--font-display)"}}>{h}</div>)}
          </div>
          {filtered.map(a=>{
            const projs=projects.filter(p=>actionIncludesProject(a,p));
            return (
              <div key={a.id}>
                <div className="grid border-b border-border hover:bg-muted/40 transition-colors items-center" style={{gridTemplateColumns:COL}}>
                <button onClick={()=>setEx(ex===a.id?null:a.id)}
                  className="grid px-5 py-4 text-left items-center min-w-0"
                  style={{gridTemplateColumns:ROW_COL,gridColumn:"1 / 4"}}>
                  <div>
                    <div className="flex items-start gap-2"><div className="text-base font-medium text-foreground leading-snug">{a.problem}</div>{actionSimilarityLabel(a.similarity)&&<span className="shrink-0 bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-link">{actionSimilarityLabel(a.similarity)}</span>}</div>
                    <div className="text-sm text-muted-foreground mt-0.5">{a.loggedBy}</div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {projs.map(p=>{
                      const st=projectTagStyle(p.score);
                      return <span key={p.id} className={`text-xs font-semibold px-2 py-0.5 ${st.bg} ${st.text}`}>{p.name}</span>;
                    })}
                  </div>
                  <div className="text-sm font-medium text-foreground bg-muted px-2 py-1 w-fit" style={{fontFamily:"var(--font-mono)"}}>{fmtDate(a.timestamp)}</div>
                </button>
                <div className="px-2"><InlineRating effectiveness={a.effectiveness} canRate={a.loggedByUserId===currentUserId} onRate={rating=>onRateAction(a.id,rating)}/></div>
                <div className="flex items-center justify-end gap-1 pr-4">
                  <button onClick={()=>onEditAction(a)} aria-label={`Edit ${a.problem}`} title="Edit action" className="p-2 text-muted-foreground hover:text-link hover:bg-primary/10 transition-colors"><Pencil size={14}/></button>
                  <button onClick={()=>{setConfirmDelete(confirmDelete===a.id?null:a.id);setMutationError(null);setEx(a.id);}} aria-label={`Delete ${a.problem}`} title="Delete action" className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"><Trash2 size={14}/></button>
                  <button onClick={()=>setEx(ex===a.id?null:a.id)} aria-label={ex===a.id?"Collapse action details":"Expand action details"} className="p-2 text-muted-foreground hover:text-foreground"><ChevronDown size={14} className={`transition-transform ${ex===a.id?"rotate-180":""}`}/></button>
                </div>
                </div>
                <AnimatePresence>
                  {ex===a.id&&(
                    <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} transition={{duration:0.14}} className="overflow-hidden border-b border-border bg-muted/20">
                      <div className="px-5 py-5 grid grid-cols-2 gap-6">
                        <div><div className="text-sm font-semibold text-muted-foreground mb-2">Problem &amp; Root Cause</div><div className="text-base text-foreground leading-relaxed">{a.reason}</div></div>
                        <div><div className="text-sm font-semibold text-muted-foreground mb-2">Action Taken</div><div className="text-base text-foreground leading-relaxed">{a.actionTaken}</div></div>
                      </div>
                      {confirmDelete===a.id&&<div className="mx-5 mb-5 border border-destructive/40 bg-destructive/10 px-4 py-3 flex items-center gap-3 flex-wrap">
                        <div className="flex-1 min-w-52"><div className="text-sm font-semibold text-foreground">Delete this action?</div><div className="text-xs text-muted-foreground mt-0.5">This permanently removes its details, rating, and search index.</div></div>
                        <button disabled={deleting===a.id} onClick={()=>setConfirmDelete(null)} className="px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50">Cancel</button>
                        <button disabled={deleting===a.id} onClick={()=>void removeAction(a.id)} className="px-3 py-2 text-sm font-semibold bg-destructive text-white hover:bg-destructive/15 disabled:opacity-50">{deleting===a.id?"Deleting…":"Delete action"}</button>
                        {mutationError&&<div className="basis-full text-xs text-destructive">{mutationError}</div>}
                      </div>}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
          {filtered.length===0&&<div className="text-center py-16 text-base text-muted-foreground">No actions match your filter.</div>}
          </div>
        </div>
    </PageShell>
  );
}

export function ActionsTimeline({project,actions,currentUserId,onRateAction}:{project:Project;actions:Action[];currentUserId:number|null;onRateAction:(id:string,rating:number)=>Promise<void>;}) {
  const ts=project.timeSeries;
  const projectId=String(project.backendProjectId??project.id);
  const fallbackActions=useMemo(()=>actions.filter(a=>actionIncludesProject(a,project)),[actions,project]);
  const [databaseActions,setDatabaseActions]=useState<Action[]|null>(null);
  const [actionsLoading,setActionsLoading]=useState(true);
  const [actionsError,setActionsError]=useState<string|null>(null);
  useEffect(()=>{
    let current=true;
    setDatabaseActions(null);setActionsLoading(true);setActionsError(null);
    listAllProjectActions(projectId)
      .then(rows=>{if(current)setDatabaseActions(rows);})
      .catch(error=>{if(current){setDatabaseActions(null);setActionsError(error instanceof Error?error.message:"Could not load action history");}})
      .finally(()=>{if(current)setActionsLoading(false);});
    return()=>{current=false;};
  },[projectId]);
  const pa=useMemo(()=>{
    if(!databaseActions)return fallbackActions;
    const merged=new Map(databaseActions.map(action=>[action.id,action]));
    fallbackActions.forEach(action=>merged.set(action.id,action));
    return [...merged.values()];
  },[databaseActions,fallbackActions]);
  const allDates=useMemo(()=>[...ts.map(point=>point.date),...pa.map(action=>action.timestamp)].filter(Boolean).sort(),[ts,pa]);
  const today=new Date().toISOString().slice(0,10);
  const minDate=allDates[0]??today, maxDate=allDates[allDates.length-1]??today;
  const [start,setStart]=useState(minDate);
  const [end,setEnd]=useState(maxDate);
  const [chartSelection,setChartSelection]=useState<Action|null>(null);
  const [listSelection,setListSelection]=useState<Action|null>(null);
  const [hoveredGroup,setHoveredGroup]=useState<{date:string;items:Action[]}|null>(null);
  useEffect(()=>{
    const date=new Date(`${maxDate}T00:00:00.000Z`);date.setUTCDate(date.getUTCDate()-30);
    setStart(date.toISOString().slice(0,10)<minDate?minDate:date.toISOString().slice(0,10));
    setEnd(maxDate);setChartSelection(null);setListSelection(null);
  },[projectId,minDate,maxDate]);
  const filtered=useMemo(()=>ts.filter(d=>d.date>=start&&d.date<=end),[ts,start,end]);
  const visibleActions=useMemo(()=>pa.filter(a=>a.timestamp>=start&&a.timestamp<=end).sort((a,b)=>b.timestamp.localeCompare(a.timestamp)),[pa,start,end]);
  const toTime=(date:string)=>new Date(`${date}T12:00:00.000Z`).getTime();
  const rangeStart=new Date(`${start}T00:00:00.000Z`).getTime();
  const rangeEnd=new Date(`${end}T00:00:00.000Z`).getTime()+86_400_000;
  const chartData=useMemo(()=>filtered.map(point=>({...point,time:toTime(point.date)})),[filtered]);
  const actionGroups=useMemo(()=>{
    const groups=new Map<string,Action[]>();
    visibleActions.forEach(action=>groups.set(action.timestamp,[...(groups.get(action.timestamp)??[]),action]));
    return [...groups.entries()].map(([date,items])=>({date,time:toTime(date),items}));
  },[visibleActions]);
  const setPreset=(days:number|null)=>{
    setEnd(maxDate);
    if(days===null){setStart(minDate);return;}
    const date=new Date(`${maxDate}T00:00:00.000Z`);date.setUTCDate(date.getUTCDate()-(days-1));
    const next=date.toISOString().slice(0,10);setStart(next<minDate?minDate:next);
  };
  const brushRange=useMemo(()=>{
    if(!ts.length)return {startIndex:0,endIndex:0};
    const first=ts.findIndex(point=>point.date>=start);
    let last=ts.findIndex(point=>point.date>end);
    if(last<0)last=ts.length;
    return {startIndex:first<0?0:first,endIndex:Math.max(first<0?0:first,last-1)};
  },[ts,start,end]);
  const formatTick=(time:number)=>new Intl.DateTimeFormat(undefined,{month:"short",day:"numeric",timeZone:"UTC"}).format(new Date(time));
  const selectedVisible=chartSelection&&visibleActions.some(action=>action.id===chartSelection.id)?chartSelection:null;
  return (
    <PageShell>
        <PageHeader title="Actions timeline"/>
        <div className="flex items-center gap-3 mb-7 flex-wrap">
          <div className="flex border border-border">
            {[{l:"7D",d:7},{l:"30D",d:30},{l:"90D",d:90},{l:"All",d:null}].map(r=>(
              <button key={r.l} onClick={()=>setPreset(r.d)}
                className={`px-4 py-2.5 text-base font-semibold hover:text-foreground hover:bg-muted transition-colors border-r border-border last:border-r-0 ${r.d===null&&start===minDate&&end===maxDate?"bg-foreground text-background":"text-muted-foreground"}`}
                style={{fontFamily:"var(--font-display)"}}>
                {r.l}
              </button>
            ))}
          </div>
          <FieldShell className="px-4">
            <span className="text-sm font-medium text-muted-foreground">From</span>
            <input type="date" value={start} min={minDate} max={end} onChange={e=>setStart(e.target.value)}
              aria-label="Range start date"
              className="bg-transparent text-sm text-foreground" style={{fontFamily:"var(--font-mono)"}}/>
          </FieldShell>
          <FieldShell className="px-4">
            <span className="text-sm font-medium text-muted-foreground">To</span>
            <input type="date" value={end} min={start} max={maxDate} onChange={e=>setEnd(e.target.value)}
              aria-label="Range end date"
              className="bg-transparent text-sm text-foreground" style={{fontFamily:"var(--font-mono)"}}/>
          </FieldShell>
          <div className="bg-card border border-border px-4 py-2.5 text-sm text-muted-foreground">
            {filtered.length} score points, {visibleActions.length} actions
          </div>
        </div>
        {actionsError&&<div className="mb-5 flex items-center gap-2 border border-attention-border bg-attention-surface px-4 py-3 text-sm text-attention"><AlertCircle size={15}/>The database request failed. Showing the actions already loaded in this session. {actionsError}</div>}
        <div className="bg-card border border-border p-6 mb-7">
          <div className="text-base font-bold text-foreground mb-1" style={{fontFamily:"var(--font-display)"}}>Health Score Over Time</div>
          <div className="text-sm text-muted-foreground mb-5">Each orange vertical bar sits on the exact date an action was taken. Select a bar to inspect it.</div>
          <div className="relative">
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={chartData} margin={{top:5,right:8,bottom:24,left:8}}>
                <CartesianGrid strokeDasharray="2 8" stroke="var(--border)" vertical={false}/>
                <XAxis dataKey="time" type="number" scale="time" domain={[rangeStart,rangeEnd]} tickFormatter={formatTick} tick={{fill:"var(--foreground)",fontSize:11,fontFamily:"var(--font-mono)"}} tickLine={false} axisLine={{stroke:"var(--border)"}} minTickGap={42}/>
                <YAxis domain={[0,100]} tick={{fill:"var(--foreground)",fontSize:11,fontFamily:"var(--font-mono)"}} tickLine={false} axisLine={false} width={30}/>
                <ReTooltip contentStyle={ttStyle} formatter={(v:number)=>[v,"Score"]} labelFormatter={(value)=>formatTick(Number(value))}/>
                <Area type="monotone" dataKey="score" stroke="var(--primary)" strokeWidth={2} fill="var(--primary)" fillOpacity={0.07} dot={false}/>
                {actionGroups.flatMap(group=>[
                  <ReferenceLine key={`${group.date}-hit`} x={group.time} stroke="transparent" strokeWidth={16} onMouseEnter={()=>setHoveredGroup(group)} onMouseLeave={()=>setHoveredGroup(null)} onClick={()=>{setChartSelection(group.items[0]);setListSelection(null);}} className="cursor-pointer"/>,
                  <ReferenceLine key={group.date} x={group.time} stroke="var(--chart-3)" strokeWidth={selectedVisible?.timestamp===group.date?5:3} strokeOpacity={selectedVisible?.timestamp===group.date?1:.78} className="pointer-events-none" label={{value:group.items.length>1?String(group.items.length):"",position:"insideTop",fill:"var(--chart-3)",fontSize:11,fontWeight:700}}/>,
                ])}
              </ComposedChart>
            </ResponsiveContainer>
            <AnimatePresence>
              {hoveredGroup&&<motion.div initial={{opacity:0,y:4}} animate={{opacity:1,y:0}} exit={{opacity:0,y:4}} transition={{duration:.1}} className="pointer-events-none absolute right-3 top-3 z-10 w-64 border border-[var(--chart-3)] bg-card/95 px-4 py-3 shadow-overlay backdrop-blur-sm">
                <div className="text-xs font-semibold text-[var(--chart-3)] mb-1" style={{fontFamily:"var(--font-mono)"}}>{fmtDate(hoveredGroup.date)}</div>
                <div className="text-sm font-semibold text-foreground leading-snug line-clamp-2">{hoveredGroup.items[0].problem}</div>
                <div className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{hoveredGroup.items[0].actionTaken}</div>
                <div className="text-xs font-medium text-muted-foreground mt-2">{hoveredGroup.items[0].loggedBy}{hoveredGroup.items.length>1?`, plus ${hoveredGroup.items.length-1} more on this date`:""}</div>
                <div className="text-xs text-muted-foreground mt-2">Click for full details</div>
              </motion.div>}
            </AnimatePresence>
          </div>
          {ts.length>1&&<div className="mt-2 border-t border-border pt-3">
            <div className="text-xs text-muted-foreground mb-2">Drag to change the visible window</div>
            <ResponsiveContainer width="100%" height={54}>
              <AreaChart data={ts} margin={{top:0,right:8,bottom:0,left:8}}>
                <Area type="monotone" dataKey="score" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.12} dot={false}/>
                <Brush dataKey="date" height={28} travellerWidth={10} stroke="var(--primary)" fill="var(--muted)" tickFormatter={()=>""} startIndex={brushRange.startIndex} endIndex={brushRange.endIndex} onChange={range=>{if(range.startIndex===undefined||range.endIndex===undefined)return;setStart(ts[range.startIndex]?.date??start);setEnd(ts[range.endIndex]?.date??end);}}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>}
          {selectedVisible&&<div className="mt-4 border-l-4 border-[var(--chart-3)] bg-muted/40 px-5 py-4">
            <div className="flex items-start gap-4 mb-4">
              <div className="min-w-0 flex-1"><div className="text-sm font-semibold text-foreground mb-1" style={{fontFamily:"var(--font-display)"}}>Full action details</div><div className="text-xs font-semibold text-muted-foreground" style={{fontFamily:"var(--font-mono)"}}>{fmtDate(selectedVisible.timestamp)}, logged by {selectedVisible.loggedBy}, {selectedVisible.effectiveness===null?"not yet rated":`rated ${selectedVisible.effectiveness} of 5`}</div></div>
              <button onClick={()=>setChartSelection(null)} aria-label="Close selected action" className="p-1 text-muted-foreground hover:text-foreground"><X size={15}/></button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2"><div className="text-xs font-semibold text-muted-foreground mb-1">Problem</div><div className="text-sm font-semibold text-foreground leading-relaxed">{selectedVisible.problem}</div></div>
              <div><div className="text-xs font-semibold text-muted-foreground mb-1">Root cause</div><div className="text-sm text-foreground leading-relaxed">{selectedVisible.reason}</div></div>
              <div><div className="text-xs font-semibold text-muted-foreground mb-1">Action taken</div><div className="text-sm text-foreground leading-relaxed">{selectedVisible.actionTaken}</div></div>
              {(selectedVisible.nextReviewAt||selectedVisible.effectivenessRatedAt)&&<div className="md:col-span-2 border-t border-border pt-3 text-xs text-muted-foreground" style={{fontFamily:"var(--font-mono)"}}>{selectedVisible.effectivenessRatedAt?`Rated ${fmtDate(selectedVisible.effectivenessRatedAt)}`:`Next review ${fmtDate(selectedVisible.nextReviewAt!)}`}</div>}
            </div>
          </div>}
        </div>
        <div>
          <div className="flex items-center gap-2 mb-4"><div className="text-base font-bold text-foreground" style={{fontFamily:"var(--font-display)"}}>Actions in this window ({visibleActions.length})</div>{actionsLoading&&<RefreshCw size={13} className="text-link animate-spin"/>}</div>
          <div className="space-y-2">
            {visibleActions.map(a=>(
              <div key={a.id} className={`bg-card border overflow-hidden ${listSelection?.id===a.id?"border-[var(--chart-3)]":"border-border"}`}>
                <div className="flex items-center hover:bg-muted/30 transition-colors">
                <button onClick={()=>{setListSelection(listSelection?.id===a.id?null:a);setChartSelection(null);}}
                  className="flex-1 min-w-0 px-5 py-4 flex items-start justify-between gap-4 text-left">
                  <div>
                    <div className="text-sm text-muted-foreground mb-1.5">{fmtDate(a.timestamp)}, logged by {a.loggedBy}</div>
                    <div className="text-base font-semibold text-foreground">{a.problem}</div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <ChevronDown size={14} className={`text-muted-foreground transition-transform ${listSelection?.id===a.id?"rotate-180":""}`}/>
                  </div>
                </button>
                <div className="pr-5 shrink-0"><InlineRating effectiveness={a.effectiveness} canRate={a.loggedByUserId===currentUserId} onRate={rating=>onRateAction(a.id,rating)}/></div>
                </div>
                <AnimatePresence>
                  {listSelection?.id===a.id&&(
                    <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} transition={{duration:0.14}} className="overflow-hidden">
                      <div className="px-5 pb-5 pt-2 border-t border-border grid grid-cols-2 gap-5">
                        <div><div className="text-sm font-semibold text-muted-foreground mb-2">Root Cause</div><div className="text-base text-foreground leading-relaxed">{a.reason}</div></div>
                        <div><div className="text-sm font-semibold text-muted-foreground mb-2">Action Taken</div><div className="text-base text-foreground leading-relaxed">{a.actionTaken}</div></div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
            {!actionsLoading&&visibleActions.length===0&&<div className="border border-dashed border-border bg-card py-12 text-center text-sm text-muted-foreground">No actions were logged in this date range.</div>}
          </div>
        </div>
    </PageShell>
  );
}

export function ActionsLibrary({actions,project,currentUserId,onRateAction}:{actions:Action[];project?:Project;currentUserId:number|null;onRateAction:(id:string,rating:number)=>Promise<void>;}) {
  const projectId=project?String(project.backendProjectId??project.id):undefined;
  const [q,setQ]=useState(""), [ex,setEx]=useState<string|null>(null);
  const [searchResults,setSearchResults]=useState<Action[]|null>(null);
  const [searching,setSearching]=useState(false);
  const [searchMode,setSearchMode]=useState<ActionSearchMode|null>(null);
  const [searchError,setSearchError]=useState<string|null>(null);
  const searchController=useRef<AbortController|null>(null);
  useEffect(()=>()=>searchController.current?.abort(),[]);
  const updateQuery=(query:string)=>{
    searchController.current?.abort();searchController.current=null;
    setQ(query);setSearchResults(null);setSearching(false);setSearchMode(null);setSearchError(null);
  };
  const deepSearch=async()=>{
    const query=q.trim();
    if(query.length<3||searching)return;
    searchController.current?.abort();
    const controller=new AbortController();
    searchController.current=controller;
    setSearching(true);setSearchResults(null);setSearchMode(null);setSearchError(null);
    try{
      const result=await searchActions(query,50,{deep:true,projectId,signal:controller.signal});
      if(controller.signal.aborted)return;
      setSearchResults(result.actions);setSearchMode(result.mode);
    }catch(error){
      if(!controller.signal.aborted)setSearchError(error instanceof Error?error.message:"Deep search is unavailable");
    }finally{
      if(searchController.current===controller){searchController.current=null;setSearching(false);}
    }
  };
  const filtered=useMemo(()=>{
    const base=actions.filter(a=>!project||actionIncludesProject(a,project));
    if(searchResults)return searchResults;
    if(!q)return base;
    return base.filter(a=>actionMatchesKeywordSearch(a,q));
  },[actions,searchResults,q,project]);
  const COL="minmax(0,3fr) 140px 120px 120px";
  // 380px of fixed tracks plus 40px of row padding, leaving the Problem column ~400px.
  const LIBRARY_MIN_WIDTH=820;
  return (
    <PageShell>
        <PageHeader title="Actions library" description={`${filtered.length} action${filtered.length===1?"":"s"}`}/>
        <div className="flex items-stretch gap-2 mb-6">
          <FieldShell className="flex-1 px-4 py-3">
            <Search size={16} className="text-muted-foreground shrink-0"/>
            <input value={q} onChange={e=>updateQuery(e.target.value)} placeholder="Search action history by keyword…"
              aria-label="Search action history by keyword"
              className="flex-1 min-w-0 text-base bg-transparent placeholder:text-muted-foreground"/>
            {q&&<button onClick={()=>updateQuery("")} aria-label="Clear search" className="text-muted-foreground hover:text-foreground"><X size={15}/></button>}
          </FieldShell>
          <button onClick={()=>void deepSearch()} disabled={q.trim().length<3||searching}
            className="flex items-center gap-2 bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            title="Rank results by meaning rather than exact keywords">
            {searching?<RefreshCw size={14} className="animate-spin"/>:<Search size={14}/>} {searching?"Searching…":"Search by meaning"}
          </button>
        </div>
        {(searchError||searchMode)&&!searching&&<div className={`mb-4 flex items-center gap-2 border px-3 py-2 text-sm ${searchError?"border-attention-border bg-attention-surface text-attention dark:border-attention-border dark:bg-attention-surface dark:text-attention":"border-border bg-muted/30 text-muted-foreground"}`}>
          {searchError?<AlertCircle size={14}/>:<Search size={14}/>} {searchError??actionSearchModeLabel(searchMode)}
        </div>}
        <div className="border border-border bg-card overflow-x-auto">
          <div style={{minWidth:LIBRARY_MIN_WIDTH}}>
          <div className="grid px-5 py-3 border-b border-border bg-muted" style={{gridTemplateColumns:COL}}>
            {["Problem","Logged by","Date","Rating"].map(h=><div key={h} className="text-sm font-semibold text-foreground" style={{fontFamily:"var(--font-display)"}}>{h}</div>)}
          </div>
          {filtered.map(a=>(
            <div key={a.id}>
              <div className="grid border-b border-border hover:bg-muted/40 transition-colors items-center" style={{gridTemplateColumns:COL}}>
              <button onClick={()=>setEx(ex===a.id?null:a.id)}
                className="grid px-5 py-4 text-left items-center"
                style={{gridTemplateColumns:"minmax(0,3fr) 140px 120px",gridColumn:"1 / 4"}}>
                <div className="pr-5"><div className="text-base font-medium text-foreground leading-snug">{a.problem}</div>{actionSimilarityLabel(a.similarity)&&<div className="mt-1 text-xs font-semibold text-link">{actionSimilarityLabel(a.similarity)}</div>}</div>
                <div className="text-base text-foreground">{a.loggedBy}</div>
                <div className="text-sm font-medium text-muted-foreground bg-muted px-2 py-1 w-fit" style={{fontFamily:"var(--font-mono)"}}>{fmtDate(a.timestamp)}</div>
              </button>
              <div className="px-3"><InlineRating effectiveness={a.effectiveness} canRate={a.loggedByUserId===currentUserId} onRate={rating=>onRateAction(a.id,rating)}/></div>
              </div>
              <AnimatePresence>
                {ex===a.id&&(
                  <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} transition={{duration:0.14}} className="overflow-hidden border-b border-border bg-muted/20">
                    <div className="px-5 py-5 grid grid-cols-2 gap-6">
                      <div><div className="text-sm font-semibold text-muted-foreground mb-2">Root Cause</div><div className="text-base text-foreground leading-relaxed">{a.reason}</div></div>
                      <div><div className="text-sm font-semibold text-muted-foreground mb-2">Action Taken</div><div className="text-base text-foreground leading-relaxed">{a.actionTaken}</div></div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
          {filtered.length===0&&<p className="text-center py-16 text-sm text-muted-foreground">{searching?"Reranking action history…":"No actions match your search."}</p>}
          </div>
        </div>
    </PageShell>
  );
}
