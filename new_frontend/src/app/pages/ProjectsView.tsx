import { useEffect, useState } from "react";
import { Activity, Plus, RefreshCw, LogOut, GitBranch } from "lucide-react";
import {
  listProjects,
  getProject,
  startSync,
  type ProjectListItem,
  type SyncTool,
} from "../api";
import { useWorkspace } from "../context/WorkspaceContext";

export function ProjectsView({ onAddProject }: { onAddProject: () => void }) {
  const { user, logout } = useWorkspace();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncStatus, setSyncStatus] = useState<Record<number, string>>({});

  const load = () => {
    setLoading(true);
    setError("");
    listProjects()
      .then(setProjects)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load projects"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  // Kick off a sync using the project's configured tools (progress shows on the dashboard).
  const handleSync = async (id: number) => {
    setSyncStatus((s) => ({ ...s, [id]: "Starting…" }));
    try {
      const detail = await getProject(id);
      const tools = detail.integrations.map((i) => i.toolName as SyncTool);
      if (tools.length === 0) {
        setSyncStatus((s) => ({ ...s, [id]: "No tools configured" }));
        return;
      }
      const sessionId = crypto.randomUUID();
      const res = await startSync(String(id), tools, sessionId);
      setSyncStatus((s) => ({ ...s, [id]: `Sync queued (${res.jobId.slice(0, 12)}…)` }));
    } catch (e) {
      setSyncStatus((s) => ({ ...s, [id]: e instanceof Error ? e.message : "Sync failed" }));
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary flex items-center justify-center">
            <Activity size={16} className="text-primary-foreground" />
          </div>
          <span className="font-bold tracking-widest uppercase" style={{ fontFamily: "var(--font-display)" }}>
            Pulse
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          {user && <span className="text-muted-foreground">{user.name}</span>}
          <button onClick={() => logout()} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <LogOut size={14} />
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
            Projects
          </h1>
          <button
            onClick={onAddProject}
            className="flex items-center gap-2 bg-primary text-primary-foreground text-sm font-semibold px-4 py-2.5 hover:opacity-90 transition-opacity"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <Plus size={16} />
            Add Project
          </button>
        </div>

        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}

        {!loading && !error && projects.length === 0 && (
          <div className="text-center py-16 border border-dashed border-border">
            <p className="text-muted-foreground text-sm mb-4">No projects yet.</p>
            <button onClick={onAddProject} className="text-primary font-semibold text-sm hover:underline">
              Create your first project
            </button>
          </div>
        )}

        <div className="space-y-3">
          {projects.map((p) => (
            <div key={p.id} className="border border-border p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold truncate" style={{ fontFamily: "var(--font-display)" }}>
                      {p.name}
                    </h3>
                    {p.vcs && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground border border-border px-1.5 py-0.5">
                        <GitBranch size={11} />
                        {p.vcs}
                      </span>
                    )}
                  </div>
                  {p.description && <p className="text-sm text-muted-foreground mt-1 truncate">{p.description}</p>}
                  <p className="text-xs text-muted-foreground mt-2">
                    {syncStatus[p.id] ?? "Not synced yet — no health score available"}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <div className="text-2xl font-bold text-muted-foreground">—</div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Score</div>
                  </div>
                  <button
                    onClick={() => handleSync(p.id)}
                    className="flex items-center gap-1 border border-border text-sm px-3 py-2 hover:border-primary transition-colors"
                  >
                    <RefreshCw size={13} />
                    Sync
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
