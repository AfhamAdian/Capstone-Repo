import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type UserRole = "CEO" | "CTO" | "Manager" | "Developer";

export interface Workspace {
  id: string;
  name: string;
  vcs: "github" | "gitlab" | "bitbucket" | "azure";
  projectsCount: number;
  membersCount: number;
  isNew?: boolean;
}

interface User {
  name: string;
  email: string;
  role: UserRole;
  trackedProjects: string[];
}

interface UserContextType {
  user: User;
  setUserRole: (role: UserRole) => void;
  trackProject: (projectId: string) => void;
  untrackProject: (projectId: string) => void;
  isProjectTracked: (projectId: string) => boolean;
  activeWorkspace: Workspace | null;
  setActiveWorkspace: (workspace: Workspace) => void;
  workspaces: Workspace[];
  addWorkspace: (workspace: Workspace) => void;
  logout: () => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

const DEFAULT_TRACKED_PROJECTS: string[] = [];
const TRACKED_PROJECTS_STORAGE_KEY = "pminsight.trackedProjects.v1";

function loadTrackedProjects(): string[] {
  if (typeof window === "undefined") {
    return DEFAULT_TRACKED_PROJECTS;
  }

  try {
    const raw = window.localStorage.getItem(TRACKED_PROJECTS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_TRACKED_PROJECTS;
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return DEFAULT_TRACKED_PROJECTS;
    }

    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return DEFAULT_TRACKED_PROJECTS;
  }
}

const MOCK_WORKSPACES: Workspace[] = [
  {
    id: "ws-1",
    name: "TechCorp Platform",
    vcs: "github",
    projectsCount: 12,
    membersCount: 28,
  },
  {
    id: "ws-2",
    name: "Mobile Squad",
    vcs: "gitlab",
    projectsCount: 6,
    membersCount: 15,
  },
  {
    id: "ws-3",
    name: "DataOps Team",
    vcs: "bitbucket",
    projectsCount: 8,
    membersCount: 22,
  },
  {
    id: "ws-4",
    name: "Enterprise Portal",
    vcs: "github",
    projectsCount: 15,
    membersCount: 45,
  },
];

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>({
    name: "Afham Adian",
    email: "afham.adian@company.com",
    role: "CEO",
    trackedProjects: loadTrackedProjects(),
  });

  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  // Initialize with empty workspaces for fresh users - no pre-loaded demo data
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

  const setUserRole = (role: UserRole) => {
    setUser((prev) => ({ ...prev, role }));
  };

  const trackProject = (projectId: string) => {
    setUser((prev) => {
      if (prev.trackedProjects.includes(projectId)) return prev;
      return { ...prev, trackedProjects: [...prev.trackedProjects, projectId] };
    });
  };

  const untrackProject = (projectId: string) => {
    setUser((prev) => ({
      ...prev,
      trackedProjects: prev.trackedProjects.filter((id) => id !== projectId),
    }));
  };

  const isProjectTracked = (projectId: string) => {
    return user.trackedProjects.includes(projectId);
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      TRACKED_PROJECTS_STORAGE_KEY,
      JSON.stringify(user.trackedProjects),
    );
  }, [user.trackedProjects]);

  const addWorkspace = (workspace: Workspace) => {
    setWorkspaces((prev) => [...prev, workspace]);
  };

  const logout = () => {
    // Clear all tracked projects from localStorage
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(TRACKED_PROJECTS_STORAGE_KEY);
    }
    // Reset user state to default
    setUser({
      name: "Afham Adian",
      email: "afham.adian@company.com",
      role: "CEO",
      trackedProjects: [],
    });
    setActiveWorkspace(null);
  };

  return (
    <UserContext.Provider
      value={{
        user,
        setUserRole,
        trackProject,
        untrackProject,
        isProjectTracked,
        activeWorkspace,
        setActiveWorkspace,
        workspaces,
        addWorkspace,
        logout,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
