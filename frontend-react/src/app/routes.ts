import { createBrowserRouter } from "react-router";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { WorkspaceSelection } from "./pages/WorkspaceSelection";
import { CreateWorkspace } from "./pages/CreateWorkspace";
import { DashboardLayout } from "./components/DashboardLayout";
import { Dashboard } from "./pages/Dashboard";
import { AllProjects } from "./pages/AllProjects";
import { TrackedProjects } from "./pages/TrackedProjects";
import { ProjectInsights } from "./pages/ProjectInsights";
import { Issues } from "./pages/Issues";
import { Tools } from "./pages/Tools";
import { ProjectDetail } from "./pages/ProjectDetail";
import { TrendsAnalytics } from "./pages/TrendsAnalytics";
import { Settings } from "./pages/Settings";
import { ActionCenter } from "./pages/ActionCenter";
import { OrganizationInsights } from "./pages/OrganizationInsights";
import { NotFound } from "./pages/NotFound";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Login,
  },
  {
    path: "/login",
    Component: Login,
  },
  {
    path: "/register",
    Component: Register,
  },
  {
    path: "/workspaces",
    Component: WorkspaceSelection,
  },
  {
    path: "/workspace/new",
    Component: CreateWorkspace,
  },
  {
    path: "/dashboard",
    Component: DashboardLayout,
    ErrorBoundary: NotFound,
    children: [
      { index: true, Component: Dashboard },
      { path: "projects", Component: AllProjects },
      { path: "tracked", Component: TrackedProjects },
      { path: "insights", Component: ProjectInsights },
      { path: "issues", Component: Issues },
      { path: "actions", Component: ActionCenter },
      { path: "organization", Component: OrganizationInsights },
      { path: "tools", Component: Tools },
      { path: "trends", Component: TrendsAnalytics },
      { path: "settings", Component: Settings },
      { path: "project/:id", Component: ProjectDetail },
      { path: "*", Component: NotFound },
    ],
  },
  {
    path: "*",
    Component: NotFound,
  },
]);
