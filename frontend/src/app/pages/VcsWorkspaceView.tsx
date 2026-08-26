import { useEffect, useState } from "react";
import { Activity, ChevronRight, FolderKanban, GitBranch, LogOut, Plus } from "lucide-react";
import { listProjects, type ProjectListItem } from "../api";
import { useWorkspace } from "../context/WorkspaceContext";

const VCS_LABELS: Record<string, string> = { github: "GitHub", gitlab: "GitLab", bitbucket: "Bitbucket" };
// Every version-control workspace the platform supports — always shown, even with 0 projects.
const PROVIDERS = ["github", "gitlab", "bitbucket"] as const;

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
    default:
      return <GitBranch className={className} />;
  }
}

export function VcsWorkspaceView({
  onSelect,
  onAddProject,
  isAdmin,
}: {
  onSelect: (vcs: string) => void;
  onAddProject: () => void;
  isAdmin: boolean;
}) {
  const { user, logout } = useWorkspace();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listProjects()
      .then(setProjects)
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  // Count real projects per version-control tool — that's the "workspace".
  const counts = projects.reduce<Record<string, number>>((m, p) => {
    if (p.vcs) m[p.vcs] = (m[p.vcs] ?? 0) + 1;
    return m;
  }, {});

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
        <div className="ml-auto flex items-center gap-4 text-sm">
          {user && <span className="text-muted-foreground">{user.name}</span>}
          <button onClick={() => logout()} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-8 py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-bold uppercase tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
            Select a Workspace
          </h1>
          <p className="text-base text-muted-foreground mt-1">
            Choose a version control workspace to see the projects tracked in it.
          </p>
        </div>

        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {!loading && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {PROVIDERS.map((vcs) => {
                const count = counts[vcs] ?? 0;
                return (
                  <button
                    key={vcs}
                    onClick={() => onSelect(vcs)}
                    className="group relative text-left border border-border bg-card hover:border-primary/50 transition-colors overflow-hidden"
                  >
                    <div className="h-1 w-full bg-primary" />
                    <div className="p-5">
                      <div className="flex items-start justify-between mb-4">
                        <div className="h-9 w-9 bg-foreground flex items-center justify-center text-background">
                          <VCSIcon vcs={vcs} className="h-4.5 w-4.5" />
                        </div>
                        <span className="text-xs font-medium px-2 py-0.5 border border-border text-muted-foreground">
                          {VCS_LABELS[vcs]}
                        </span>
                      </div>
                      <h3 className="text-[15px] font-bold truncate mb-3" style={{ fontFamily: "var(--font-display)" }}>
                        {VCS_LABELS[vcs]}
                      </h3>
                      <div className="flex items-center gap-1 text-muted-foreground text-xs">
                        <FolderKanban size={13} />
                        <span>{count} project{count !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-muted-foreground group-hover:text-primary transition-colors">
                        Open workspace
                        <ChevronRight size={13} />
                      </div>
                    </div>
                  </button>
                );
              })}

              {isAdmin && (
                <button
                  onClick={onAddProject}
                  className="group relative text-left border-2 border-dashed border-border hover:border-primary transition-colors"
                >
                  <div className="p-5 flex flex-col h-full">
                    <div className="flex items-start justify-between mb-4">
                      <div className="h-9 w-9 border-2 border-dashed border-border group-hover:border-primary flex items-center justify-center transition-colors">
                        <Plus size={16} className="text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                    </div>
                    <h3 className="text-[15px] font-bold text-muted-foreground group-hover:text-foreground mb-1 transition-colors" style={{ fontFamily: "var(--font-display)" }}>
                      Create Workspace
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Connect a version control provider and import repositories as projects.
                    </p>
                    <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-transparent group-hover:text-primary transition-colors">
                      Get started
                      <ChevronRight size={13} />
                    </div>
                  </div>
                </button>
              )}
            </div>

            <p className="mt-8 text-sm text-muted-foreground">
              {projects.length} project{projects.length !== 1 ? "s" : ""} tracked across your workspaces
            </p>
          </>
        )}
      </main>
    </div>
  );
}
