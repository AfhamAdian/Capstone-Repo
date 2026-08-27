import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  getMe,
  listWorkspaces,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
  type AuthUser,
  type RegisterInput,
  type WorkspaceView,
} from "../api";

export type { AuthUser };

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


interface WorkspaceContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  setActiveWorkspace: (ws: Workspace) => void;
  addWorkspace: (ws: Workspace) => void;
  // Real workspaces from the backend — drive onboarding (no workspaces → wizard).
  backendWorkspaces: WorkspaceView[];
  workspacesLoading: boolean;
  refetchWorkspaces: () => Promise<void>;
}

const WORKSPACES_STORAGE_KEY = "pulse.workspaces.v1";
const ACTIVE_WORKSPACE_STORAGE_KEY = "pulse.activeWorkspaceId.v1";

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
  // Auth is server-owned: user comes from the session, not localStorage.
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [backendWorkspaces, setBackendWorkspaces] = useState<WorkspaceView[]>([]);
  const [workspacesLoading, setWorkspacesLoading] = useState(true);

  const [workspaces, setWorkspaces] = useState<Workspace[]>(loadWorkspaces);
  const [activeWorkspace, setActiveWorkspaceState] = useState<Workspace | null>(() => {
    const id = loadActiveWorkspaceId();
    if (!id) return null;
    return loadWorkspaces().find((ws) => ws.id === id)
      ?? TEMPLATE_WORKSPACES.find((ws) => ws.id === id)
      ?? null;
  });

  // On mount, ask the backend who we are (validates the session cookie).
  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((me) => {
        if (!cancelled) setUser(me);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setIsAuthLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the company's real workspaces whenever auth changes; drives the onboarding redirect.
  const refetchWorkspaces = useCallback(async () => {
    setWorkspacesLoading(true);
    try {
      setBackendWorkspaces(await listWorkspaces());
    } catch {
      setBackendWorkspaces([]);
    } finally {
      setWorkspacesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      void refetchWorkspaces();
    } else {
      setBackendWorkspaces([]);
      setWorkspacesLoading(false);
    }
  }, [user, refetchWorkspaces]);

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

  const login = async (email: string, password: string) => {
    setUser(await apiLogin(email, password));
  };

  const register = async (input: RegisterInput) => {
    setUser(await apiRegister(input));
  };

  const logout = async () => {
    try {
      await apiLogout();
    } finally {
      setUser(null);
      setActiveWorkspaceState(null);
    }
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
        user,
        isAuthenticated: user !== null,
        isAuthLoading,
        login,
        register,
        logout,
        workspaces,
        activeWorkspace,
        setActiveWorkspace,
        addWorkspace,
        backendWorkspaces,
        workspacesLoading,
        refetchWorkspaces,
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
