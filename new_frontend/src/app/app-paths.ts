export const paths = {
  login: "/login",
  register: "/register",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  workspaces: "/workspaces",
  createWorkspace: "/workspaces/new",
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

export function screenFromPath(pathname: string): { screen: AppScreen; projectId: string | null; surveyToken: string | null } {
  if (pathname === "/login" || pathname === "/login/") return { screen: "login", projectId: null, surveyToken: null };
  if (pathname === "/register" || pathname === "/register/") return { screen: "register", projectId: null, surveyToken: null };
  if (pathname === "/forgot-password" || pathname === "/forgot-password/") return { screen: "forgot-password", projectId: null, surveyToken: null };
  if (pathname === "/reset-password" || pathname === "/reset-password/") return { screen: "reset-password", projectId: null, surveyToken: null };
  if (pathname === "/workspaces" || pathname === "/workspaces/") return { screen: "workspaces", projectId: null, surveyToken: null };
  if (pathname === "/workspaces/new" || pathname === "/workspaces/new/") return { screen: "create-workspace", projectId: null, surveyToken: null };
  if (pathname === "/projects/new" || pathname === "/projects/new/") return { screen: "add-project", projectId: null, surveyToken: null };
  if (pathname === "/projects" || pathname === "/projects/") return { screen: "projects", projectId: null, surveyToken: null };
  if (pathname === "/actions" || pathname === "/actions/") return { screen: "global-actions", projectId: null, surveyToken: null };
  if (pathname === "/surveys" || pathname === "/surveys/") return { screen: "global-surveys", projectId: null, surveyToken: null };

  const publicSurvey = pathname.match(/^\/survey\/([^/]+)\/?$/);
  if (publicSurvey) return { screen: "login", projectId: null, surveyToken: decodeURIComponent(publicSurvey[1]!) };

  const project = pathname.match(/^\/projects\/([^/]+)(?:\/(.*))?$/);
  if (project) {
    const projectId = decodeURIComponent(project[1]!);
    const rest = (project[2] ?? "").replace(/\/$/, "");
    if (rest === "surveys") return { screen: "surveys", projectId, surveyToken: null };
    if (rest === "settings") return { screen: "settings", projectId, surveyToken: null };
    if (rest === "actions/library") return { screen: "actions-library", projectId, surveyToken: null };
    if (rest === "actions") return { screen: "actions-timeline", projectId, surveyToken: null };
    return { screen: "dashboard", projectId, surveyToken: null };
  }

  return { screen: "portfolio", projectId: null, surveyToken: null };
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
