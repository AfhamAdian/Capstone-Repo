import { useState, useEffect, useCallback, useMemo } from "react";
import { Outlet, Navigate, useNavigate, useParams, useLocation, useOutletContext } from "react-router";
import { AlertTriangle, MessageSquare, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { paths, isValidWorkspaceId, resolvePortfolioPath } from "./app-paths";
import { useWorkspace, type VcsProvider } from "./context/WorkspaceContext";
import { createAction, listActions, listProjects, rateAction, type SyncRiskKey } from "./api";
import { useSurveys } from "./hooks/useSurveys";
import { useBackendProjects, findProjectByPath } from "./hooks/useProjectHealth";
import { SurveyFlow } from "./components/SurveyFlow";
import { TopBar } from "./components/TopBar";
import { Sidebar } from "./components/Sidebar";
import { ProjectPageSkeleton } from "./components/ProjectPageSkeleton";
import { LogActionModal } from "./components/LogActionModal";
import { GlobalEffRow } from "./components/InlineRating";
import { PortfolioView } from "./pages/ProjectsOverview";
import { Dashboard } from "./pages/Dashboard";
import { SurveysView, GlobalSurveysView } from "./pages/Surveys";
import { GlobalActionsView, ActionsTimeline, ActionsLibrary } from "./pages/GlobalActions";
import { SettingsView } from "./pages/Settings";
import type { Action, Project, Survey } from "./types";
import { projectTagStyle, fmtDate } from "./format";

// ─── Shared "authenticated app" context, handed down through <Outlet context={...}/> ──

interface AppContext {
  projects: Project[];
  actions: Action[];
  surveys: Survey[];
  trackedIds: Set<string>;
  toggleTracked: (id: string) => void;
  onLogAction: () => void;
  onRatingOpen: () => void;
  onRateAction: (id: string, rating: number) => Promise<void>;
  onSyncComplete: (projectId: string, riskScore?: number, riskScores?: Partial<Record<SyncRiskKey, number | null>>) => void;
  refetchSurveys: () => void;
  surveysError: string | null;
  surveysLoading: boolean;
  refetchHealth: (opts?: { silent?: boolean }) => Promise<void> | void;
  portfolioPath: string;
  workspaceById: Map<number, number>;
  isAdmin: boolean;
}

function useAppContext() {
  return useOutletContext<AppContext>();
}

// ─── The authenticated shell: TopBar + shared data-fetching + modals, wrapping every screen below it ──

export function AppLayout() {
  const {user,activeWorkspace,setActiveWorkspace,backendWorkspaces}=useWorkspace();
  const navigate=useNavigate();
  const {workspaceId:urlWorkspaceId,projectId}=useParams();
  const [dark,setDark]=useState(false);
  const [logOpen,setLogOpen]=useState(false);
  const [actions,setActions]=useState<Action[]>([]);
  const [surveyDemo,setSurveyDemo]=useState(false);
  const {projects,setProjects,loading:projectsLoading,error:projectsError,refetch:refetchHealth}=useBackendProjects();
  // workspace_id per project (company-scoped) from our own API — used to filter the portfolio by workspace.
  const [workspaceById,setWorkspaceById]=useState<Map<number,number>>(new Map());
  useEffect(()=>{
    listProjects()
      .then(rows=>setWorkspaceById(new Map(rows.filter(r=>r.workspaceId!=null).map(r=>[r.id,r.workspaceId as number]))))
      .catch(()=>{});
  },[]);
  const activeWorkspaceId=urlWorkspaceId ?? activeWorkspace?.id ?? null;
  const portfolioPath=resolvePortfolioPath(activeWorkspaceId);
  // Keep the remembered workspace in sync with the URL; look up its name/vcs from the backend list.
  useEffect(()=>{
    if(!isValidWorkspaceId(urlWorkspaceId)||activeWorkspace?.id===urlWorkspaceId) return;
    const ws=backendWorkspaces.find(w=>String(w.id)===urlWorkspaceId);
    setActiveWorkspace({
      id:urlWorkspaceId!,
      name:ws?.name??`Workspace ${urlWorkspaceId}`,
      vcs:(ws?.vcsProvider as VcsProvider)??"github",
      projectsCount:0,
      membersCount:0,
    });
  },[urlWorkspaceId,activeWorkspace,setActiveWorkspace,backendWorkspaces]);
  const [trackedIds,setTrackedIds]=useState<Set<string>>(new Set());
  useEffect(()=>{
    if(projects.length===0) return;
    setTrackedIds(prev=>{
      if(prev.size>0) return prev;
      return new Set(projects.map(p=>p.id));
    });
  },[projects]);
  const toggleTracked=(id:string)=>setTrackedIds(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});
  useEffect(()=>{document.documentElement.classList.toggle("dark",dark);},[dark]);
  const {surveys,refetch:refetchSurveys,error:surveysError,loading:surveysLoading}=useSurveys(projects);
  const updateProjectRisk=useCallback((projectId:string,riskScore?:number,riskScores?:Partial<Record<SyncRiskKey,number|null>>)=>{
    setProjects(prev=>prev.map(p=>{
      if(p.id!==projectId) return p;
      const subscores={...p.subscores};
      if(riskScores){
        if(typeof riskScores.SECURITY==="number") subscores.security=Math.round(riskScores.SECURITY);
        if(typeof riskScores.RELIABILITY==="number") subscores.reliability=Math.round(riskScores.RELIABILITY);
        if(typeof riskScores.MAINTAINABILITY==="number") subscores.maintainability=Math.round(riskScores.MAINTAINABILITY);
        if(typeof riskScores.CICD_DEPLOYMENT_HEALTH==="number") subscores.cicdDeploymentHealth=Math.round(riskScores.CICD_DEPLOYMENT_HEALTH);
        if(typeof riskScores.TEAM_HEALTH==="number") subscores.teamHealth=Math.round(riskScores.TEAM_HEALTH);
        if(typeof riskScores.ENGINEERING_PROCESS==="number") subscores.engineeringProcess=Math.round(riskScores.ENGINEERING_PROCESS);
        if(typeof riskScores.PLANNING_EXECUTION==="number") subscores.planningExecution=Math.round(riskScores.PLANNING_EXECUTION);
      }
      if(typeof riskScore!=="number") return {...p,subscores};
      return {...p,subscores,score:riskScore,scoreTrend:riskScore-p.score};
    }));
    void refetchHealth({ silent: true });
  },[refetchHealth]);
  const refreshActions=useCallback(async()=>{
    const rows=await listActions();
    setActions(rows);
  },[]);
  useEffect(()=>{void refreshActions().catch(()=>setActions([]));},[refreshActions]);
  const handleLogAction=useCallback(async(input:{projectIds:string[];problem:string;reason:string;actionTaken:string;timestamp:string})=>{
    await createAction({...input,loggedBy:user?.name??user?.email??"Unknown user"});
    await refreshActions();
  },[user,refreshActions]);
  const handleRateAction=useCallback(async(id:string,rating:number)=>{
    setActions(current=>current.map(action=>action.id===id?{...action,effectiveness:rating}:action));
    try{await rateAction(id,rating);}catch(error){await refreshActions();throw error;}
  },[refreshActions]);
  const pendingRatings=useMemo(()=>actions.filter(a=>a.effectiveness===null),[actions]);
  const [ratingOpen,setRatingOpen]=useState(false);

  let content: React.ReactNode;
  if(projectsLoading){
    content = projectId ? <ProjectPageSkeleton/> : (
      <PortfolioView
        projects={[]} actions={actions} surveys={surveys} loading
        onSelect={id=>navigate(paths.project(id))} onLogAction={()=>setLogOpen(true)}
        onViewActions={()=>navigate(paths.globalActions)}
        onViewSurveys={()=>navigate(paths.globalSurveys)}
        onRatingOpen={()=>setRatingOpen(true)}
        trackedIds={trackedIds} onToggleTracked={toggleTracked}
        onSyncComplete={updateProjectRisk}
      />
    );
  } else if(projectsError && projects.length===0){
    content = (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <AlertTriangle size={28} className="mx-auto text-amber-500 mb-3"/>
          <div className="text-lg font-bold mb-1" style={{fontFamily:"var(--font-display)"}}>Couldn’t load projects</div>
          <p className="text-sm text-muted-foreground mb-4">{projectsError}</p>
          <button onClick={()=>void refetchHealth()} className="bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold">Try again</button>
        </div>
      </div>
    );
  } else {
    const context: AppContext = {
      projects, actions, surveys, trackedIds, toggleTracked,
      onLogAction: ()=>setLogOpen(true),
      onRatingOpen: ()=>setRatingOpen(true),
      onRateAction: handleRateAction,
      onSyncComplete: updateProjectRisk,
      refetchSurveys, surveysError, surveysLoading, refetchHealth,
      portfolioPath, workspaceById,
      isAdmin: user?.role==="admin",
    };
    content = <Outlet context={context}/>;
  }

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <TopBar dark={dark} onToggle={()=>setDark(!dark)} projects={projects} activeId={projectId??null} onSelect={id=>navigate(paths.project(id))} onHome={()=>navigate(portfolioPath)}
        pendingCount={pendingRatings.length} onRatingOpen={()=>setRatingOpen(true)} onManageWorkspaces={()=>navigate(paths.workspaces)}/>
      <div className="flex-1 flex min-h-0">{content}</div>
      {!projectId&&(
        <div className="border-t border-border bg-card px-6 py-2.5 flex items-center gap-6 text-sm text-muted-foreground">
          <span className="text-xs uppercase font-bold text-foreground/40" style={{fontFamily:"var(--font-display)"}}>Demo</span>
          <button onClick={()=>setSurveyDemo(true)} className="hover:text-primary transition-colors flex items-center gap-1.5"><MessageSquare size={13}/>Preview survey flow</button>
          <button onClick={()=>{
            const critical=projects.filter(p=>p.hasData).sort((a,b)=>a.score-b.score)[0];
            if(critical) navigate(paths.project(critical.id));
          }} className="hover:text-primary transition-colors flex items-center gap-1.5"><AlertTriangle size={13}/>Open critical project</button>
        </div>
      )}
      <AnimatePresence>
        {logOpen&&<LogActionModal key="log" onClose={()=>setLogOpen(false)} preId={projectId} projects={projects} actions={actions} onSubmit={handleLogAction}/>}
      </AnimatePresence>
      <AnimatePresence>
        {surveyDemo&&<SurveyFlow key="sf" onClose={()=>setSurveyDemo(false)}/>}
      </AnimatePresence>
      {/* Global rating panel — accessible from nav icon anywhere in the app */}
      <AnimatePresence>
        {ratingOpen&&(
          <motion.div key="rating-panel" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center" onClick={()=>setRatingOpen(false)}>
            <motion.div initial={{y:32,opacity:0}} animate={{y:0,opacity:1}} exit={{y:32,opacity:0}} transition={{duration:0.18}}
              onClick={e=>e.stopPropagation()}
              className="w-full max-w-xl bg-card border border-border mb-8 mx-4 shadow-2xl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <div>
                  <div className="text-xl font-bold" style={{fontFamily:"var(--font-display)"}}>Effectiveness Review</div>
                  <div className="text-sm text-muted-foreground mt-0.5">{pendingRatings.length} action{pendingRatings.length>1?"s":""} awaiting your rating</div>
                </div>
                <button onClick={()=>setRatingOpen(false)} className="text-muted-foreground hover:text-foreground"><X size={18}/></button>
              </div>
              <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
                {pendingRatings.map(a=>{
                  const projs=projects.filter(p=>a.projectIds.includes(p.id));
                  return (
                    <div key={a.id} className="border border-border p-4">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        {projs.map(p=>{const st=projectTagStyle(p.score);return <span key={p.id} className={`text-xs font-bold px-2 py-0.5 ${st.bg} ${st.text}`}>{p.name}</span>;})}
                        <span className="text-sm text-muted-foreground" style={{fontFamily:"var(--font-mono)"}}>{fmtDate(a.timestamp)}</span>
                      </div>
                      <div className="text-[15px] font-semibold text-foreground mb-1">{a.problem}</div>
                      <div className="text-sm text-muted-foreground mb-4 leading-relaxed">{a.actionTaken}</div>
                      <GlobalEffRow action={a} onRate={rating=>void handleRateAction(a.id,rating)}/>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Top-level (non-project) screens ──

/** Handles both bare "/" and "/workspaces/:workspaceId" — invalid/missing id redirects to the remembered workspace (or the chooser). */
export function PortfolioEntry() {
  const {workspaceId:urlWorkspaceId}=useParams();
  const {activeWorkspace,backendWorkspaces}=useWorkspace();
  const navigate=useNavigate();
  const {projects,actions,surveys,trackedIds,toggleTracked,onLogAction,onRatingOpen,onSyncComplete,workspaceById,isAdmin}=useAppContext();
  if(!isValidWorkspaceId(urlWorkspaceId)){
    return <Navigate to={resolvePortfolioPath(activeWorkspace?.id)} replace/>;
  }
  const wsId=Number(urlWorkspaceId);
  const visibleProjects=projects.filter(p=>p.backendProjectId && workspaceById.get(Number(p.backendProjectId))===wsId);
  const workspaceName=backendWorkspaces.find(w=>w.id===wsId)?.name ?? `Workspace ${urlWorkspaceId}`;
  return (
    <PortfolioView
      projects={visibleProjects} actions={actions} surveys={surveys}
      onSelect={id=>navigate(paths.project(id))} onLogAction={onLogAction}
      onViewActions={()=>navigate(paths.globalActions)}
      onViewSurveys={()=>navigate(paths.globalSurveys)}
      onRatingOpen={onRatingOpen}
      trackedIds={trackedIds} onToggleTracked={toggleTracked}
      onAddProject={()=>navigate(paths.addProject)} isAdmin={isAdmin}
      workspaceName={workspaceName} onBackToWorkspaces={()=>navigate(paths.workspaces)}
      onSyncComplete={onSyncComplete}
    />
  );
}

export function GlobalActionsRoute() {
  const navigate=useNavigate();
  const {projects,actions,onLogAction,onRateAction,portfolioPath}=useAppContext();
  return (
    <GlobalActionsView actions={actions} projects={projects} onBack={()=>navigate(portfolioPath)}
      onLogAction={onLogAction} onRateAction={(id,rating)=>void onRateAction(id,rating)}/>
  );
}

export function GlobalSurveysRoute() {
  const navigate=useNavigate();
  const {projects,surveys,refetchSurveys,portfolioPath}=useAppContext();
  return <GlobalSurveysView surveys={surveys} projects={projects} onBack={()=>navigate(portfolioPath)} onClosed={refetchSurveys}/>;
}

// ─── Per-project layout: Sidebar + the project's own nested routes ──

function useProjectContext() {
  return useOutletContext<AppContext & {project: Project}>();
}

export function ProjectShell() {
  const {projectId}=useParams();
  const location=useLocation();
  const navigate=useNavigate();
  const ctx=useAppContext();
  const active=useMemo(()=>findProjectByPath(ctx.projects,projectId??null),[ctx.projects,projectId]);
  useEffect(()=>{
    if(!active||!projectId||active.id===projectId) return;
    navigate(location.pathname.replace(`/projects/${projectId}`,`/projects/${active.id}`),{replace:true});
  },[active,projectId,location.pathname,navigate]);
  if(!active) return <Navigate to={ctx.portfolioPath} replace/>;
  return (
    <div className="flex flex-1 min-h-0">
      <Sidebar project={active} onLogAction={ctx.onLogAction}/>
      <Outlet context={{...ctx,project:active}}/>
    </div>
  );
}

export function DashboardRoute() {
  const {project,actions,surveys,onSyncComplete}=useProjectContext();
  return <Dashboard project={project} actions={actions} surveys={surveys} onSyncComplete={onSyncComplete}/>;
}

export function ActionsTimelineRoute() {
  const {project,actions}=useProjectContext();
  return <ActionsTimeline project={project} actions={actions}/>;
}

export function ActionsLibraryRoute() {
  const {project,actions}=useProjectContext();
  return <ActionsLibrary actions={actions} projectId={project.id}/>;
}

export function SurveysRoute() {
  const {project,surveys,refetchSurveys,surveysError,surveysLoading}=useProjectContext();
  return <SurveysView project={project} surveys={surveys} onSurveySent={refetchSurveys} loadError={surveysError} loading={surveysLoading}/>;
}

export function SettingsRoute() {
  const {project}=useProjectContext();
  return <SettingsView project={project}/>;
}
