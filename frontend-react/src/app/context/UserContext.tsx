import { createContext, useContext, useState, ReactNode } from "react";

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
}

const UserContext = createContext<UserContextType | undefined>(undefined);

const DEFAULT_TRACKED_PROJECTS = ["1", "2"];

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
    name: "Alex Johnson",
    email: "alex.johnson@company.com",
    role: "CEO",
    trackedProjects: DEFAULT_TRACKED_PROJECTS,
  });

  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>(MOCK_WORKSPACES);

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

  const addWorkspace = (workspace: Workspace) => {
    setWorkspaces((prev) => [...prev, workspace]);
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
