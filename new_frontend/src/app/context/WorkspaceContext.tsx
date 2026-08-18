import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type VcsProvider = "github" | "gitlab" | "bitbucket" | "azure";

export interface Workspace {
  id: string;
  name: string;
  vcs: VcsProvider;
  projectsCount: number;
  membersCount: number;
  isNew?: boolean;
}

export const TEMPLATE_WORKSPACES: Workspace[] = [
  { id: "template-github", name: "GitHub Example", vcs: "github", projectsCount: 0, membersCount: 0, isNew: true },
  { id: "template-gitlab", name: "GitLab Example", vcs: "gitlab", projectsCount: 0, membersCount: 0, isNew: true },
  { id: "template-bitbucket", name: "Bitbucket Example", vcs: "bitbucket", projectsCount: 0, membersCount: 0, isNew: true },
  { id: "template-azure", name: "Azure DevOps Example", vcs: "azure", projectsCount: 0, membersCount: 0, isNew: true },
];

export interface AuthUser {
  name: string;
  email: string;
}

interface WorkspaceContextType {
  isAuthenticated: boolean;
  user: AuthUser | null;
  login: (email: string) => void;
  logout: () => void;
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  setActiveWorkspace: (ws: Workspace) => void;
  addWorkspace: (ws: Workspace) => void;
}

const AUTH_STORAGE_KEY = "pulse.auth.v1";
const WORKSPACES_STORAGE_KEY = "pulse.workspaces.v1";
const ACTIVE_WORKSPACE_STORAGE_KEY = "pulse.activeWorkspaceId.v1";

interface StoredAuth {
  isAuthenticated: boolean;
  user: AuthUser | null;
}

function loadAuth(): StoredAuth {
  const fallback: StoredAuth = { isAuthenticated: false, user: null };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<StoredAuth>;
    if (typeof parsed.isAuthenticated !== "boolean") return fallback;
    return { isAuthenticated: parsed.isAuthenticated, user: parsed.user ?? null };
  } catch {
    return fallback;
  }
}

function loadWorkspaces(): Workspace[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(WORKSPACES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is Workspace =>
        typeof item === "object" && item !== null && typeof (item as Workspace).id === "string",
    );
  } catch {
    return [];
  }
}

function loadActiveWorkspaceId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY);
  } catch {
    return null;
  }
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [{ isAuthenticated, user }, setAuth] = useState<StoredAuth>(loadAuth);
  const [workspaces, setWorkspaces] = useState<Workspace[]>(loadWorkspaces);
  const [activeWorkspace, setActiveWorkspaceState] = useState<Workspace | null>(() => {
    const id = loadActiveWorkspaceId();
    if (!id) return null;
    return loadWorkspaces().find((ws) => ws.id === id)
      ?? TEMPLATE_WORKSPACES.find((ws) => ws.id === id)
      ?? null;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ isAuthenticated, user }));
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(WORKSPACES_STORAGE_KEY, JSON.stringify(workspaces));
  }, [workspaces]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (activeWorkspace) {
      window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, activeWorkspace.id);
    } else {
      window.localStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY);
    }
  }, [activeWorkspace]);

  const login = (email: string) => {
    setAuth({ isAuthenticated: true, user: { name: email.split("@")[0], email } });
  };

  const logout = () => {
    setAuth({ isAuthenticated: false, user: null });
    setActiveWorkspaceState(null);
  };

  const addWorkspace = (ws: Workspace) => {
    setWorkspaces((prev) => [...prev, ws]);
  };

  const setActiveWorkspace = (ws: Workspace) => {
    const stored = { ...ws, isNew: false };
    setWorkspaces((prev) => (prev.some((item) => item.id === stored.id) ? prev : [...prev, stored]));
    setActiveWorkspaceState(stored);
  };

  return (
    <WorkspaceContext.Provider
      value={{
        isAuthenticated,
        user,
        login,
        logout,
        workspaces,
        activeWorkspace,
        setActiveWorkspace,
        addWorkspace,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (context === undefined) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
}
