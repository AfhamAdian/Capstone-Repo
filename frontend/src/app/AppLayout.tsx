import { useState, useEffect, useCallback, useMemo } from "react";
import { Outlet, Navigate, useNavigate, useParams, useLocation, useOutletContext } from "react-router";
import { AlertTriangle, MessageSquare } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { paths, isValidWorkspaceId, resolvePortfolioPath } from "./app-paths";
import { useWorkspace, type VcsProvider } from "./context/WorkspaceContext";
import { createAction, deferActionReview, deleteAction, listActionEffectivenessReviews, listActions, listProjects, rateAction, updateAction, type ActionReviewQueue, type SyncRiskKey } from "./api";
import { useSurveys } from "./hooks/useSurveys";
import { useBackendProjects, findProjectByPath } from "./hooks/useProjectHealth";
import { SurveyFlow } from "./components/SurveyFlow";
import { TopBar } from "./components/TopBar";
import { Sidebar } from "./components/Sidebar";
import { ProjectPageSkeleton } from "./components/ProjectPageSkeleton";
import { LogActionModal } from "./components/LogActionModal";
import { EffectivenessReview } from "./components/EffectivenessReview";
import { WeeklyReviewBanner } from "./components/WeeklyReviewBanner";
import { PortfolioView } from "./pages/ProjectsOverview";
import { Dashboard } from "./pages/Dashboard";
import { SurveysView, GlobalSurveysView } from "./pages/Surveys";
import { GlobalActionsView, ActionsTimeline, ActionsLibrary } from "./pages/GlobalActions";
import { SettingsView } from "./pages/Settings";
import type { Action, Project, Survey } from "./types";
import { actionIncludesProject } from "./format";

// ─── Shared "authenticated app" context, handed down through <Outlet context={...}/> ──

interface AppContext {
  projects: Project[];
  actions: Action[];
  reviewQueue: ActionReviewQueue | null;
  currentUserId: number | null;
  surveys: Survey[];
  trackedIds: Set<string>;
  toggleTracked: (id: string) => void;
  onLogAction: () => void;
  onRatingOpen: () => void;
  onRateAction: (id: string, rating: number) => Promise<void>;
  onEditAction: (action: Action) => void;
  onDeleteAction: (id: string) => Promise<void>;
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
  const location=useLocation();
  const {workspaceId:urlWorkspaceId,projectId}=useParams();
  const [dark,setDark]=useState(false);
  const [logOpen,setLogOpen]=useState(false);
  const [editingAction,setEditingAction]=useState<Action|null>(null);
  const [actions,setActions]=useState<Action[]>([]);
  const [reviewQueue,setReviewQueue]=useState<ActionReviewQueue|null>(null);
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
  const refreshReviews=useCallback(async()=>{
    const queue=await listActionEffectivenessReviews();setReviewQueue(queue);
  },[]);
  useEffect(()=>{
    void refreshActions().catch(()=>setActions([]));
    void refreshReviews().catch(()=>setReviewQueue(null));
  },[refreshActions,refreshReviews]);
  const handleLogAction=useCallback(async(input:{projectIds:string[];problem:string;reason:string;actionTaken:string;timestamp:string})=>{
    await createAction(input);
    await Promise.all([refreshActions(),refreshReviews()]);
  },[refreshActions,refreshReviews]);
  const handleUpdateAction=useCallback(async(input:{projectIds:string[];problem:string;reason:string;actionTaken:string;timestamp:string})=>{
    if(!editingAction)return;
    const updated=await updateAction(editingAction.id,input);
    setActions(current=>current.map(action=>action.id===updated.id?updated:action));
    await refreshReviews();
  },[editingAction,refreshReviews]);
  const handleDeleteAction=useCallback(async(id:string)=>{
    await deleteAction(id);setActions(current=>current.filter(action=>action.id!==id));await refreshReviews();
  },[refreshReviews]);
  const handleRateAction=useCallback(async(id:string,rating:number)=>{
    const updated=await rateAction(id,rating);setActions(current=>current.map(action=>action.id===id?updated:action));
    await refreshReviews();
  },[refreshReviews]);
  const handleDeferAction=useCallback(async(id:string,weeks:1|2|4)=>{
    const updated=await deferActionReview(id,weeks);setActions(current=>current.map(action=>action.id===id?updated:action));
  },[]);
  const [ratingOpen,setRatingOpen]=useState(false);
  const unratedOwnerCount=reviewQueue
    ? reviewQueue.fromLastWeek.length+reviewQueue.earlier.length+reviewQueue.waitingForOutcome.length
    : 0;

  let content: React.ReactNode;
  if(projectsLoading){
    content = projectId ? <ProjectPageSkeleton/> : (
      <PortfolioView
        projects={[]} surveys={surveys} pendingReviewCount={reviewQueue?.readyCount??0} loading
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
      projects, actions, reviewQueue, currentUserId:user?.id??null, surveys, trackedIds, toggleTracked,
      onLogAction: ()=>setLogOpen(true),
      onRatingOpen: ()=>setRatingOpen(true),
      onRateAction: handleRateAction,
      onEditAction: setEditingAction,
      onDeleteAction: handleDeleteAction,
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
        pendingCount={unratedOwnerCount} onRatingOpen={()=>setRatingOpen(true)} onManageWorkspaces={()=>navigate(paths.workspaces)}/>
      {!projectId&&(/^\/workspaces\/\d+\/?$/.test(location.pathname)||location.pathname==="/")&&user&&reviewQueue&&<WeeklyReviewBanner queue={reviewQueue} userId={user.id} onReview={()=>setRatingOpen(true)}/>}
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
        {editingAction&&<LogActionModal key={`edit-${editingAction.id}`} onClose={()=>setEditingAction(null)} projects={projects} actions={actions} initialAction={editingAction} onSubmit={handleUpdateAction}/>}
      </AnimatePresence>
      <AnimatePresence>
        {surveyDemo&&<SurveyFlow key="sf" onClose={()=>setSurveyDemo(false)}/>}
      </AnimatePresence>
      <AnimatePresence>
        {ratingOpen&&reviewQueue&&<EffectivenessReview key="rating-panel" queue={reviewQueue} projects={projects} onClose={()=>setRatingOpen(false)} onRate={handleRateAction} onDefer={handleDeferAction} onRefresh={refreshReviews}/>}
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
  const {projects,reviewQueue,surveys,trackedIds,toggleTracked,onLogAction,onRatingOpen,onSyncComplete,workspaceById,isAdmin}=useAppContext();
  if(!isValidWorkspaceId(urlWorkspaceId)){
    return <Navigate to={resolvePortfolioPath(activeWorkspace?.id)} replace/>;
  }
  const wsId=Number(urlWorkspaceId);
  const visibleProjects=projects.filter(p=>p.backendProjectId && workspaceById.get(Number(p.backendProjectId))===wsId);
  const workspaceName=backendWorkspaces.find(w=>w.id===wsId)?.name ?? `Workspace ${urlWorkspaceId}`;
  return (
    <PortfolioView
      projects={visibleProjects} surveys={surveys} pendingReviewCount={reviewQueue?.readyCount??0}
      onSelect={id=>navigate(paths.project(id))} onLogAction={onLogAction}
      onViewActions={()=>navigate(paths.globalActions)}
      onViewSurveys={()=>navigate(paths.globalSurveys)}
      onRatingOpen={onRatingOpen}
      trackedIds={trackedIds} onToggleTracked={toggleTracked}
      onAddProject={()=>navigate(paths.addProject(wsId))} isAdmin={isAdmin}
      workspaceName={workspaceName} onBackToWorkspaces={()=>navigate(paths.workspaces)}
      onSyncComplete={onSyncComplete}
    />
  );
}

export function GlobalActionsRoute() {
  const navigate=useNavigate();
  const {projects,actions,currentUserId,onLogAction,onEditAction,onDeleteAction,onRateAction,portfolioPath}=useAppContext();
  return (
    <GlobalActionsView actions={actions} projects={projects} onBack={()=>navigate(portfolioPath)}
      currentUserId={currentUserId} onLogAction={onLogAction} onEditAction={onEditAction} onDeleteAction={onDeleteAction} onRateAction={onRateAction}/>
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
  const pendingReviewCount=[...(ctx.reviewQueue?.fromLastWeek??[]),...(ctx.reviewQueue?.earlier??[])].filter(action=>actionIncludesProject(action,active)).length;
  return (
    <div className="flex flex-1 min-h-0">
      <Sidebar project={active} onLogAction={ctx.onLogAction} pendingReviewCount={pendingReviewCount} onRatingOpen={ctx.onRatingOpen}/>
      <Outlet context={{...ctx,project:active}}/>
    </div>
  );
}

export function DashboardRoute() {
  const {project,actions,reviewQueue,surveys,onSyncComplete,onRatingOpen}=useProjectContext();
  return <Dashboard project={project} actions={actions} reviewQueue={reviewQueue} surveys={surveys} onSyncComplete={onSyncComplete} onRatingOpen={onRatingOpen}/>;
}

export function ActionsTimelineRoute() {
  const {project,actions,currentUserId,onRateAction}=useProjectContext();
  return <ActionsTimeline project={project} actions={actions} currentUserId={currentUserId} onRateAction={onRateAction}/>;
}

export function ActionsLibraryRoute() {
  const {project,actions,currentUserId,onRateAction}=useProjectContext();
  return <ActionsLibrary actions={actions} project={project} currentUserId={currentUserId} onRateAction={onRateAction}/>;
}

export function SurveysRoute() {
  const {project,surveys,refetchSurveys,surveysError,surveysLoading}=useProjectContext();
  return <SurveysView project={project} surveys={surveys} onSurveySent={refetchSurveys} loadError={surveysError} loading={surveysLoading}/>;
}

export function SettingsRoute() {
  const {project}=useProjectContext();
  return <SettingsView project={project}/>;
}
