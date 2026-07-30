import { useState } from "react";
import { useNavigate } from "react-router";
import { Plus, Users, FolderKanban, GitBranch, CheckCircle2, LogOut, ChevronRight } from "lucide-react";
import { Button } from "../components/ui/button";
import { useUser, Workspace } from "../context/UserContext";

const VCS_LABELS: Record<string, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  bitbucket: "Bitbucket",
  azure: "Azure DevOps",
};

const VCS_ICON_BG: Record<string, string> = {
  github: "bg-slate-800",
  gitlab: "bg-orange-500",
  bitbucket: "bg-blue-600",
  azure: "bg-sky-500",
};

const VCS_BADGE: Record<string, string> = {
  github: "bg-slate-100 text-slate-600 border-slate-200",
  gitlab: "bg-orange-50 text-orange-600 border-orange-200",
  bitbucket: "bg-blue-50 text-blue-600 border-blue-200",
  azure: "bg-sky-50 text-sky-600 border-sky-200",
};

// Template workspaces showing VCS tool options for new users
const TEMPLATE_WORKSPACES: Workspace[] = [
  {
    id: "template-github",
    name: "GitHub Example",
    vcs: "github",
    projectsCount: 0,
    membersCount: 0,
    isNew: true,
  },
  {
    id: "template-gitlab",
    name: "GitLab Example",
    vcs: "gitlab",
    projectsCount: 0,
    membersCount: 0,
    isNew: true,
  },
  {
    id: "template-bitbucket",
    name: "Bitbucket Example",
    vcs: "bitbucket",
    projectsCount: 0,
    membersCount: 0,
    isNew: true,
  },
  {
    id: "template-azure",
    name: "Azure DevOps Example",
    vcs: "azure",
    projectsCount: 0,
    membersCount: 0,
    isNew: true,
  },
];

function VCSIcon({ vcs, className }: { vcs: string; className?: string }) {
  switch (vcs) {
    case "github":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
        </svg>
      );
    case "gitlab":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z" />
        </svg>
      );
    case "bitbucket":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <path d="M.778 1.213a.768.768 0 0 0-.768.892l3.263 19.81c.084.5.515.868 1.022.873H19.95a.772.772 0 0 0 .77-.646l3.27-20.03a.768.768 0 0 0-.768-.891zM14.52 15.53H9.522L8.17 8.466h7.561z" />
        </svg>
      );
    case "azure":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <path d="M0 13.955L7.455 2.045l4.886 1.182L6.773 11.5l5.114 5.773L0 13.955zm8.727-11.91L24 5.591l-7.364 12.182H9.682L5.045 11.5l3.682-9.455z" />
        </svg>
      );
    default:
      return <GitBranch className={className} />;
  }
}

export function WorkspaceSelection() {
  const navigate = useNavigate();
  const { workspaces, setActiveWorkspace } = useUser();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Show template workspaces if user has no existing workspaces (new user)
  const displayedWorkspaces = workspaces.length === 0 ? TEMPLATE_WORKSPACES : workspaces;

  const handleSelectWorkspace = (ws: Workspace) => {
    setSelectedId(ws.id);
    setTimeout(() => {
      setActiveWorkspace(ws);
      navigate("/dashboard/projects");
    }, 350);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200/60 shadow-sm">
        <div className="max-w-6xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
              <span className="text-xl font-bold text-white">PM</span>
            </div>
            <div>
              <h1 className="text-lg font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
                PMInsight
              </h1>
              <p className="text-xs text-slate-500">Intelligence Platform</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-500 hover:text-slate-900 hover:bg-slate-100 gap-2"
            onClick={() => navigate("/login")}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-6xl mx-auto px-8 py-12">
        {/* Page heading */}
        <div className="mb-10">
          <h2 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-slate-900 bg-clip-text text-transparent mb-2">
            Select a Workspace
          </h2>
          <p className="text-slate-600 mt-1">
            Choose an existing workspace to continue, or create a new one to connect a fresh version control environment.
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {displayedWorkspaces.map((ws) => {
            const isSelected = selectedId === ws.id;
            return (
              <button
                key={ws.id}
                onClick={() => handleSelectWorkspace(ws)}
                className={`group relative text-left rounded-xl border transition-all duration-200 bg-white focus:outline-none overflow-hidden cursor-pointer ${
                  isSelected
                    ? "border-blue-400 shadow-lg shadow-blue-500/15 scale-[1.02]"
                    : "border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md hover:shadow-blue-500/10 hover:scale-[1.01]"
                }`}
              >
                {/* Top accent bar */}
                <div className={`h-1 w-full bg-gradient-to-r ${
                  ws.vcs === "github" ? "from-slate-600 to-slate-800" :
                  ws.vcs === "gitlab" ? "from-orange-400 to-red-500" :
                  ws.vcs === "bitbucket" ? "from-blue-500 to-blue-700" :
                  "from-sky-400 to-blue-600"
                }`} />

                <div className="p-5">
                  {/* VCS icon + badge */}
                  <div className="flex items-start justify-between mb-4">
                    <div className={`h-10 w-10 rounded-xl ${VCS_ICON_BG[ws.vcs]} flex items-center justify-center text-white shadow-sm`}>
                      <VCSIcon vcs={ws.vcs} className="h-5 w-5" />
                    </div>
                    {isSelected ? (
                      <CheckCircle2 className="h-5 w-5 text-blue-500" />
                    ) : (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-md border ${VCS_BADGE[ws.vcs]}`}>
                        {ws.isNew ? "Template" : VCS_LABELS[ws.vcs]}
                      </span>
                    )}
                  </div>

                  {/* Name */}
                  <h3 className="font-semibold text-slate-900 text-sm truncate mb-3">
                    {ws.name}
                  </h3>

                  {/* Stats */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-slate-500 text-xs">
                      <FolderKanban className="h-3.5 w-3.5" />
                      <span>{ws.projectsCount} projects</span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-500 text-xs">
                      <Users className="h-3.5 w-3.5" />
                      <span>{ws.membersCount} members</span>
                    </div>
                  </div>

                  {/* Open row */}
                  <div className={`mt-4 flex items-center gap-1 text-xs font-medium transition-colors duration-150 ${
                    isSelected ? "text-blue-500" : "text-slate-400 group-hover:text-blue-500"
                  }`}>
                    {isSelected ? "Opening…" : "Open workspace"}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </div>
                </div>
              </button>
            );
          })}

          {/* Create New card */}
          <button
            onClick={() => navigate("/workspace/new")}
            className="group relative text-left rounded-xl border-2 border-dashed border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50/40 transition-all duration-200 focus:outline-none cursor-pointer hover:shadow-md hover:shadow-blue-500/10 hover:scale-[1.01]"
          >
            <div className="p-5 flex flex-col h-full">
              <div className="flex items-start justify-between mb-4">
                <div className="h-10 w-10 rounded-xl border-2 border-dashed border-slate-300 group-hover:border-blue-400 flex items-center justify-center transition-colors">
                  <Plus className="h-5 w-5 text-slate-400 group-hover:text-blue-500 transition-colors" />
                </div>
              </div>
              <h3 className="font-semibold text-slate-500 group-hover:text-slate-900 text-sm mb-1 transition-colors">
                New Workspace
              </h3>
              <p className="text-slate-400 text-xs group-hover:text-slate-500 transition-colors leading-relaxed">
                Connect a version control system and configure a fresh workspace.
              </p>
              <div className="mt-4 flex items-center gap-1 text-xs font-medium text-transparent group-hover:text-blue-500 transition-colors">
                Get started
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </div>
          </button>
        </div>

        {/* Footer note */}
        <p className="mt-8 text-slate-400 text-sm">
          {workspaces.length === 0 
            ? "Select a template below or create a new workspace to get started" 
            : `${workspaces.length} workspace${workspaces.length !== 1 ? "s" : ""} available in your organization`}
        </p>
      </main>
    </div>
  );
}
