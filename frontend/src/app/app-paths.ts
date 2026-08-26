import type { VcsProvider } from "./context/WorkspaceContext";

export const paths = {
  login: "/login",
  register: "/register",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  workspaces: "/workspaces",
  createWorkspace: "/workspaces/new",
  workspacePortfolio: (workspaceId: string | number) => `/workspaces/${encodeURIComponent(String(workspaceId))}`,
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

export const VCS_PROVIDERS: VcsProvider[] = ["github", "gitlab", "bitbucket"];
export const VCS_LABELS: Record<string, string> = { github: "GitHub", gitlab: "GitLab", bitbucket: "Bitbucket" };

export function isValidVcs(v: string | null | undefined): v is VcsProvider {
  return v != null && VCS_PROVIDERS.includes(v as VcsProvider);
}

// A workspace id in the URL is a positive integer.
export function isValidWorkspaceId(v: string | null | undefined): boolean {
  if (v == null) return false;
  const n = Number(v);
  return Number.isInteger(n) && n > 0;
}

/** Where "go back to the portfolio" should land, given the active workspace id (or the chooser if none). */
export function resolvePortfolioPath(workspaceId: string | number | null | undefined): string {
  return isValidWorkspaceId(workspaceId != null ? String(workspaceId) : null)
    ? paths.workspacePortfolio(workspaceId!)
    : paths.workspaces;
}
