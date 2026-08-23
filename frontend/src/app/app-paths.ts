export const paths = {
  login: "/login",
  register: "/register",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  workspaces: "/workspaces",
  createWorkspace: "/workspaces/new",
  workspacePortfolio: (vcs: string) => `/workspaces/${encodeURIComponent(vcs)}`,
  portfolio: "/",
  projectsAdmin: "/projects",
  addProject: "/projects/new",
  globalActions: "/actions",
  globalSurveys: "/surveys",
  publicSurvey: (token: string) => `/survey/${encodeURIComponent(token)}`,
  project: (id: string) => `/projects/${id}`,
  projectActions: (id: string) => `/projects/${id}/actions`,
  projectActionsLibrary: (id: string) => `/projects/${id}/actions/library`,
  projectSurveys: (id: string) => `/projects/${id}/surveys`,
  projectSettings: (id: string) => `/projects/${id}/settings`,
} as const;

export type AppScreen =
  | "login"
  | "register"
  | "forgot-password"
  | "reset-password"
  | "workspaces"
  | "create-workspace"
  | "portfolio"
  | "projects"
  | "add-project"
  | "global-actions"
  | "global-surveys"
  | "dashboard"
  | "actions-timeline"
  | "actions-library"
  | "surveys"
  | "settings";

export interface ParsedPath {
  screen: AppScreen;
  projectId: string | null;
  surveyToken: string | null;
  vcs: string | null;
}

// Small helper so every branch returns the full shape with sensible defaults.
function parsed(screen: AppScreen, extra: Partial<ParsedPath> = {}): ParsedPath {
  return { screen, projectId: null, surveyToken: null, vcs: null, ...extra };
}

export function screenFromPath(pathname: string): ParsedPath {
  if (pathname === "/login" || pathname === "/login/") return parsed("login");
  if (pathname === "/register" || pathname === "/register/") return parsed("register");
  if (pathname === "/forgot-password" || pathname === "/forgot-password/") return parsed("forgot-password");
  if (pathname === "/reset-password" || pathname === "/reset-password/") return parsed("reset-password");
  if (pathname === "/workspaces" || pathname === "/workspaces/") return parsed("workspaces");
  if (pathname === "/workspaces/new" || pathname === "/workspaces/new/") return parsed("create-workspace");
  if (pathname === "/projects/new" || pathname === "/projects/new/") return parsed("add-project");
  if (pathname === "/projects" || pathname === "/projects/") return parsed("projects");
  if (pathname === "/actions" || pathname === "/actions/") return parsed("global-actions");
  if (pathname === "/surveys" || pathname === "/surveys/") return parsed("global-surveys");

  // A single segment under /workspaces (other than "new") is a workspace portfolio, scoped to that vcs.
  const workspace = pathname.match(/^\/workspaces\/([^/]+)\/?$/);
  if (workspace) return parsed("portfolio", { vcs: decodeURIComponent(workspace[1]!) });

  const publicSurvey = pathname.match(/^\/survey\/([^/]+)\/?$/);
  if (publicSurvey) return parsed("login", { surveyToken: decodeURIComponent(publicSurvey[1]!) });

  const project = pathname.match(/^\/projects\/([^/]+)(?:\/(.*))?$/);
  if (project) {
    const projectId = decodeURIComponent(project[1]!);
    const rest = (project[2] ?? "").replace(/\/$/, "");
    if (rest === "surveys") return parsed("surveys", { projectId });
    if (rest === "settings") return parsed("settings", { projectId });
    if (rest === "actions/library") return parsed("actions-library", { projectId });
    if (rest === "actions") return parsed("actions-timeline", { projectId });
    return parsed("dashboard", { projectId });
  }

  return parsed("portfolio");
}

export function pathFromScreen(screen: AppScreen, projectId?: string | null): string {
  switch (screen) {
    case "login": return paths.login;
    case "register": return paths.register;
    case "forgot-password": return paths.forgotPassword;
    case "reset-password": return paths.resetPassword;
    case "workspaces": return paths.workspaces;
    case "create-workspace": return paths.createWorkspace;
    case "portfolio": return paths.portfolio;
    case "projects": return paths.projectsAdmin;
    case "add-project": return paths.addProject;
    case "global-actions": return paths.globalActions;
    case "global-surveys": return paths.globalSurveys;
    case "dashboard": return projectId ? paths.project(projectId) : paths.portfolio;
    case "actions-timeline": return projectId ? paths.projectActions(projectId) : paths.portfolio;
    case "actions-library": return projectId ? paths.projectActionsLibrary(projectId) : paths.portfolio;
    case "surveys": return projectId ? paths.projectSurveys(projectId) : paths.globalSurveys;
    case "settings": return projectId ? paths.projectSettings(projectId) : paths.portfolio;
    default: return paths.portfolio;
  }
}
