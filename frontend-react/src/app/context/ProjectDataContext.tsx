import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { mockProjects, type Project } from "../data/mockData";

const STORAGE_KEY = "pminsight.projects.v1";

type UpdateProjectInput = Partial<Project> | ((project: Project) => Project);

interface ProjectDataContextType {
  projects: Project[];
  getProjectById: (projectId: string) => Project | undefined;
  updateProject: (projectId: string, update: UpdateProjectInput) => void;
  replaceProjects: (projects: Project[]) => void;
}

const ProjectDataContext = createContext<ProjectDataContextType | undefined>(undefined);

function readStoredProjects(): Project[] {
  if (typeof window === "undefined") {
    return mockProjects;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return mockProjects;
    }

    const parsed = JSON.parse(raw) as Project[];
    if (!Array.isArray(parsed)) {
      return mockProjects;
    }

    return parsed;
  } catch {
    return mockProjects;
  }
}

export function ProjectDataProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>(() => readStoredProjects());

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  }, [projects]);

  const value = useMemo<ProjectDataContextType>(() => {
    return {
      projects,
      getProjectById: (projectId: string) => projects.find((project) => project.id === projectId),
      updateProject: (projectId: string, update: UpdateProjectInput) => {
        setProjects((current) =>
          current.map((project) => {
            if (project.id !== projectId) {
              return project;
            }

            return typeof update === "function" ? update(project) : { ...project, ...update };
          }),
        );
      },
      replaceProjects: (nextProjects: Project[]) => {
        setProjects(nextProjects);
      },
    };
  }, [projects]);

  return <ProjectDataContext.Provider value={value}>{children}</ProjectDataContext.Provider>;
}

export function useProjects() {
  const context = useContext(ProjectDataContext);

  if (context === undefined) {
    throw new Error("useProjects must be used within a ProjectDataProvider");
  }

  return context;
}