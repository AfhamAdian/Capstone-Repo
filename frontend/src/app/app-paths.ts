import type { VcsProvider } from "./context/WorkspaceContext";

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

export const VCS_PROVIDERS: VcsProvider[] = ["github", "gitlab", "bitbucket"];
export const VCS_LABELS: Record<string, string> = { github: "GitHub", gitlab: "GitLab", bitbucket: "Bitbucket" };

export function isValidVcs(v: string | null | undefined): v is VcsProvider {
  return v != null && VCS_PROVIDERS.includes(v as VcsProvider);
}

/** Where "go back to the portfolio" should land, given whatever vcs (workspace) is currently in play. */
export function resolvePortfolioPath(vcs: string | null | undefined): string {
  return isValidVcs(vcs) ? paths.workspacePortfolio(vcs) : paths.portfolio;
}
