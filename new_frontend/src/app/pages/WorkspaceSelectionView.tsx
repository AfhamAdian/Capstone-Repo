import { useState } from "react";
import { Activity, ChevronRight, FolderKanban, GitBranch, LogOut, Plus, Users } from "lucide-react";
import { useWorkspace, type VcsProvider, type Workspace } from "../context/WorkspaceContext";

const VCS_LABELS: Record<VcsProvider, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  bitbucket: "Bitbucket",
  azure: "Azure DevOps",
};

const TEMPLATE_WORKSPACES: Workspace[] = [
  { id: "template-github", name: "GitHub Example", vcs: "github", projectsCount: 0, membersCount: 0, isNew: true },
  { id: "template-gitlab", name: "GitLab Example", vcs: "gitlab", projectsCount: 0, membersCount: 0, isNew: true },
  { id: "template-bitbucket", name: "Bitbucket Example", vcs: "bitbucket", projectsCount: 0, membersCount: 0, isNew: true },
  { id: "template-azure", name: "Azure DevOps Example", vcs: "azure", projectsCount: 0, membersCount: 0, isNew: true },
];

function VCSIcon({ vcs, className }: { vcs: VcsProvider; className?: string }) {
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

export function WorkspaceSelectionView({
  onSelect,
  onCreateNew,
  onLogout,
}: {
  onSelect: () => void;
  onCreateNew: () => void;
  onLogout: () => void;
}) {
  const { workspaces, setActiveWorkspace } = useWorkspace();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const displayedWorkspaces = workspaces.length === 0 ? TEMPLATE_WORKSPACES : workspaces;

  const handleSelectWorkspace = (ws: Workspace) => {
    setSelectedId(ws.id);
    setTimeout(() => {
      setActiveWorkspace(ws);
      onSelect();
    }, 350);
  };

  return (
    <div className="h-screen overflow-y-auto bg-background text-foreground">
      <header className="border-b border-border bg-card flex items-center px-6" style={{ height: 54 }}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-primary flex items-center justify-center">
            <Activity size={14} className="text-primary-foreground" />
          </div>
          <span className="text-base font-bold tracking-widest uppercase" style={{ fontFamily: "var(--font-display)" }}>
            Pulse
          </span>
        </div>
        <button
          onClick={onLogout}
          className="ml-auto flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <LogOut size={14} />
          Sign out
        </button>
      </header>

      <main className="max-w-6xl mx-auto px-8 py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-bold uppercase tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
            Select a Workspace
          </h1>
          <p className="text-base text-muted-foreground mt-1">
            Choose an existing workspace to continue, or create a new one to connect a fresh version control environment.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {displayedWorkspaces.map((ws) => {
            const isSelected = selectedId === ws.id;
            return (
              <button
                key={ws.id}
                onClick={() => handleSelectWorkspace(ws)}
                className={`group relative text-left border bg-card transition-colors overflow-hidden ${
                  isSelected ? "border-primary" : "border-border hover:border-primary/50"
                }`}
              >
                <div className="h-1 w-full bg-primary" />
                <div className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="h-9 w-9 bg-foreground flex items-center justify-center text-background">
                      <VCSIcon vcs={ws.vcs} className="h-4.5 w-4.5" />
                    </div>
                    {isSelected ? (
                      <span className="text-xs font-semibold text-primary">Selected</span>
                    ) : (
                      <span className="text-xs font-medium px-2 py-0.5 border border-border text-muted-foreground">
                        {ws.isNew ? "Template" : VCS_LABELS[ws.vcs]}
                      </span>
                    )}
                  </div>

                  <h3 className="text-[15px] font-bold truncate mb-3" style={{ fontFamily: "var(--font-display)" }}>
                    {ws.name}
                  </h3>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-muted-foreground text-xs">
                      <FolderKanban size={13} />
                      <span>{ws.projectsCount} projects</span>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground text-xs">
                      <Users size={13} />
                      <span>{ws.membersCount} members</span>
                    </div>
                  </div>

                  <div
                    className={`mt-4 flex items-center gap-1 text-xs font-semibold transition-colors ${
                      isSelected ? "text-primary" : "text-muted-foreground group-hover:text-primary"
                    }`}
                  >
                    {isSelected ? "Opening…" : "Open workspace"}
                    <ChevronRight size={13} />
                  </div>
                </div>
              </button>
            );
          })}

          <button
            onClick={onCreateNew}
            className="group relative text-left border-2 border-dashed border-border hover:border-primary transition-colors"
          >
            <div className="p-5 flex flex-col h-full">
              <div className="flex items-start justify-between mb-4">
                <div className="h-9 w-9 border-2 border-dashed border-border group-hover:border-primary flex items-center justify-center transition-colors">
                  <Plus size={16} className="text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </div>
              <h3 className="text-[15px] font-bold text-muted-foreground group-hover:text-foreground mb-1 transition-colors" style={{ fontFamily: "var(--font-display)" }}>
                New Workspace
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Connect a version control system and configure a fresh workspace.
              </p>
              <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-transparent group-hover:text-primary transition-colors">
                Get started
                <ChevronRight size={13} />
              </div>
            </div>
          </button>
        </div>

        <p className="mt-8 text-sm text-muted-foreground">
          {workspaces.length === 0
            ? "Select a template below or create a new workspace to get started"
            : `${workspaces.length} workspace${workspaces.length !== 1 ? "s" : ""} available in your organization`}
        </p>
      </main>
    </div>
  );
}
