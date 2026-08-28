import { useState, useEffect } from "react";
import { Activity, AlertCircle, ArrowLeft, ArrowRight, Check, Clock, Globe, Loader2, Lock, Search, Star } from "lucide-react";
import { listWorkspaceRepos, addWorkspaceProjects, type WorkspaceRepoStatus } from "../api";

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${Math.max(mins, 1)} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}

// Add Project: lists the repos reachable by the workspace's stored PAT. Already-imported repos show
// as tracked (checked + locked); the admin ticks the new ones to import them as projects.
export function AddProjectView({
  workspaceId,
  onCreated,
  onCancel,
}: {
  workspaceId: string;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [repos, setRepos] = useState<WorkspaceRepoStatus[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    listWorkspaceRepos(workspaceId)
      .then((r) => { if (!cancelled) setRepos(r); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Could not load repositories"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workspaceId]);

  const visibleRepos = repos.filter(
    (r) =>
      !search.trim() ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      (r.description ?? "").toLowerCase().includes(search.toLowerCase()),
  );
  const importedCount = repos.filter((r) => r.imported).length;

  const toggleRepo = (name: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  const add = async () => {
    if (selected.size === 0) { setError("Select at least one repository to add"); return; }
    setError("");
    setAdding(true);
    try {
      await addWorkspaceProjects(workspaceId, [...selected]);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add projects");
      setAdding(false);
    }
  };

  const labelStyle = { fontFamily: "var(--font-display)" };
  const cols = "auto minmax(200px,1fr) 120px 80px 130px";

  return (
    <div className="h-screen overflow-y-auto bg-background text-foreground">
      <header className="border-b border-border bg-card flex items-center gap-6 px-6" style={{ height: 56 }}>
        <button onClick={onCancel} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={14} /> Back
        </button>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-primary flex items-center justify-center">
            <Activity size={14} className="text-primary-foreground" />
          </div>
          <span className="text-base font-bold tracking-widest uppercase" style={labelStyle}>Pulse</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-8 py-10">
        {error && (
          <div className="mb-5 border border-red-500/30 bg-red-500/5 text-red-500 px-4 py-3 text-sm flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            {error}
          </div>
        )}

        <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold uppercase tracking-tight" style={labelStyle}>Add Project</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {loading
                ? "Loading repositories from this workspace…"
                : <>
                    <span className="font-semibold text-foreground">{selected.size}</span> selected · {importedCount} already tracked · Check the repositories you want to add
                  </>}
            </p>
          </div>
          <button
            onClick={add}
            disabled={adding || selected.size === 0}
            className="flex items-center gap-2 bg-primary text-primary-foreground text-[15px] font-semibold px-6 py-3 hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            style={labelStyle}
          >
            {adding ? <Loader2 size={16} className="animate-spin" /> : null}
            {adding ? "Adding…" : `Add ${selected.size}`}
            {!adding && <ArrowRight size={16} />}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground px-5 py-12 justify-center">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </div>
        ) : (
          <>
            {repos.length > 0 && (
              <div className="relative mb-4">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search repositories…"
                  className="w-full bg-input-background border border-border pl-9 pr-4 py-2.5 text-[15px] placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
                />
              </div>
            )}

            {repos.length === 0 ? (
              <div className="border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
                No repositories reachable with this workspace's token.
              </div>
            ) : (
              <div className="border border-border">
                <div className="grid items-center bg-muted px-5 py-3 border-b border-border" style={{ gridTemplateColumns: cols }}>
                  <span className="w-8" />
                  <span className="text-sm font-semibold" style={labelStyle}>Repository</span>
                  <span className="text-sm font-semibold" style={labelStyle}>Language</span>
                  <span className="text-sm font-semibold" style={labelStyle}>Stars</span>
                  <span className="text-sm font-semibold" style={labelStyle}>Updated</span>
                </div>
                {visibleRepos.length === 0 && (
                  <div className="px-5 py-8 text-center text-sm text-muted-foreground">No repositories match “{search}”.</div>
                )}
                {visibleRepos.map((r) => {
                  const checked = r.imported || selected.has(r.name);
                  const Row = r.imported ? "div" : "label";
                  return (
                    <Row
                      key={r.name}
                      className={`grid items-center px-5 py-3.5 border-b border-border last:border-b-0 transition-colors ${
                        r.imported ? "opacity-60" : "hover:bg-muted/40 cursor-pointer"
                      }`}
                      style={{ gridTemplateColumns: cols }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={r.imported}
                        onChange={() => !r.imported && toggleRepo(r.name)}
                        className="w-8 accent-primary disabled:cursor-not-allowed"
                      />
                      <div className="min-w-0 pr-4">
                        <div className="flex items-center gap-1.5">
                          {r.private ? <Lock size={13} className="text-muted-foreground shrink-0" /> : <Globe size={13} className="text-muted-foreground shrink-0" />}
                          <span className="font-semibold truncate" style={{ fontFamily: "var(--font-mono)" }}>{r.name}</span>
                          {r.imported && (
                            <span className="ml-1 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 shrink-0">
                              <Check size={11} /> Tracked
                            </span>
                          )}
                        </div>
                        {r.description && <p className="text-sm text-muted-foreground truncate mt-0.5 pl-[19px]">{r.description}</p>}
                      </div>
                      <div>
                        {r.language ? (
                          <span className="text-xs font-medium px-2 py-0.5 bg-muted border border-border">{r.language}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Star size={13} /> {r.stars}
                      </div>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock size={13} /> {timeAgo(r.updatedAt)}
                      </div>
                    </Row>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
