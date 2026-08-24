import { Routes, Route, Navigate, Outlet, useNavigate, useParams, useSearchParams } from "react-router";
import { paths, resolvePortfolioPath } from "./app-paths";
import { useWorkspace } from "./context/WorkspaceContext";
import { PublicSurveyPage } from "./pages/PublicSurveyPage";
import { LoginView } from "./pages/LoginView";
import { RegisterView } from "./pages/RegisterView";
import { ForgotPasswordView } from "./pages/ForgotPasswordView";
import { ResetPasswordView } from "./pages/ResetPasswordView";
import { ProjectsView } from "./pages/ProjectsView";
import { AddProjectView } from "./pages/AddProjectView";
import { VcsWorkspaceView } from "./pages/VcsWorkspaceView";
import { CreateWorkspaceView } from "./pages/CreateWorkspaceView";
import {
  AppLayout, ProjectShell, PortfolioEntry, GlobalActionsRoute, GlobalSurveysRoute,
  DashboardRoute, ActionsTimelineRoute, ActionsLibraryRoute, SurveysRoute, SettingsRoute,
} from "./AppLayout";

// ─── Auth gates — each one just decides "redirect" vs "render the matched child routes" ──

function AuthLoadingGate() {
  const {isAuthLoading}=useWorkspace();
  if(isAuthLoading){
    return <div className="h-screen flex items-center justify-center bg-background text-muted-foreground text-sm">Loading…</div>;
  }
  return <Outlet/>;
}

function GuestOnly() {
  const {isAuthenticated,activeWorkspace}=useWorkspace();
  if(isAuthenticated) return <Navigate to={resolvePortfolioPath(activeWorkspace?.vcs)} replace/>;
  return <Outlet/>;
}

function RequireAuth() {
  const {isAuthenticated}=useWorkspace();
  if(!isAuthenticated) return <Navigate to={paths.login} replace/>;
  return <Outlet/>;
}

// ─── Thin route components — just adapt router hooks to each view's existing props ──

function PublicSurveyRoute() {
  const {token}=useParams();
  return <PublicSurveyPage token={token!}/>;
}

function LoginRoute() {
  const navigate=useNavigate();
  return <LoginView onSuccess={()=>navigate(paths.workspaces)} onNavigateToRegister={()=>navigate(paths.register)} onNavigateToForgot={()=>navigate(paths.forgotPassword)}/>;
}

function RegisterRoute() {
  const navigate=useNavigate();
  const [searchParams]=useSearchParams();
  return <RegisterView onSuccess={()=>navigate(paths.workspaces)} onNavigateToLogin={()=>navigate(paths.login)} inviteToken={searchParams.get("invite") ?? undefined}/>;
}

function ForgotPasswordRoute() {
  const navigate=useNavigate();
  return <ForgotPasswordView onBackToLogin={()=>navigate(paths.login)}/>;
}

function ResetPasswordRoute() {
  const navigate=useNavigate();
  const [searchParams]=useSearchParams();
  return <ResetPasswordView token={searchParams.get("token")} onSuccess={()=>navigate(paths.login)} onBackToLogin={()=>navigate(paths.login)}/>;
}

function WorkspacesRoute() {
  const navigate=useNavigate();
  const {user}=useWorkspace();
  return <VcsWorkspaceView onSelect={vcs=>navigate(paths.workspacePortfolio(vcs))} onAddProject={()=>navigate(paths.addProject)} isAdmin={user?.role==="admin"}/>;
}

function CreateWorkspaceRoute() {
  const navigate=useNavigate();
  return <CreateWorkspaceView onBack={()=>navigate(paths.workspaces)} onCreated={()=>navigate(paths.portfolio)}/>;
}

function ProjectsRoute() {
  const navigate=useNavigate();
  return <ProjectsView onAddProject={()=>navigate(paths.addProject)}/>;
}

function AddProjectRoute() {
  const navigate=useNavigate();
  const {user}=useWorkspace();
  // Only admins can create projects — members never reach the form.
  if(user?.role!=="admin") return <Navigate to={paths.projectsAdmin} replace/>;
  return <AddProjectView onCreated={()=>navigate(paths.portfolio)} onCancel={()=>navigate(paths.projectsAdmin)}/>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/survey/:token" element={<PublicSurveyRoute/>}/>

      <Route element={<AuthLoadingGate/>}>
        <Route element={<GuestOnly/>}>
          <Route path={paths.login} element={<LoginRoute/>}/>
          <Route path={paths.register} element={<RegisterRoute/>}/>
          <Route path={paths.forgotPassword} element={<ForgotPasswordRoute/>}/>
          <Route path={paths.resetPassword} element={<ResetPasswordRoute/>}/>
        </Route>

        <Route element={<RequireAuth/>}>
          <Route path={paths.workspaces} element={<WorkspacesRoute/>}/>
          <Route path={paths.createWorkspace} element={<CreateWorkspaceRoute/>}/>
          <Route path={paths.projectsAdmin} element={<ProjectsRoute/>}/>
          <Route path={paths.addProject} element={<AddProjectRoute/>}/>

          <Route element={<AppLayout/>}>
            <Route path="/" element={<PortfolioEntry/>}/>
            <Route path="/workspaces/:vcs" element={<PortfolioEntry/>}/>
            <Route path={paths.globalActions} element={<GlobalActionsRoute/>}/>
            <Route path={paths.globalSurveys} element={<GlobalSurveysRoute/>}/>

            <Route path="/projects/:projectId" element={<ProjectShell/>}>
              <Route index element={<DashboardRoute/>}/>
              <Route path="actions" element={<ActionsTimelineRoute/>}/>
              <Route path="actions/library" element={<ActionsLibraryRoute/>}/>
              <Route path="surveys" element={<SurveysRoute/>}/>
              <Route path="settings" element={<SettingsRoute/>}/>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to={paths.portfolio} replace/>}/>
        </Route>
      </Route>
    </Routes>
  );
}
