import { useState } from "react";
import { Activity, AlertCircle, ArrowLeft, ArrowRight, Check, Clock, GitBranch, Globe, Loader2, Lock, Search, Star } from "lucide-react";
import { useWorkspace, type VcsProvider } from "../context/WorkspaceContext";
import { previewWorkspaceRepos, createWorkspace, type WorkspaceRepo } from "../api";

const VCS_OPTIONS: { id: string; name: string }[] = [
  { id: "github", name: "GitHub" },
  { id: "gitlab", name: "GitLab" },
  { id: "bitbucket", name: "Bitbucket" },
];

const TOKEN_HINT: Record<string, string> = {
  github: "Create at github.com → Settings → Developer settings → Personal access tokens. Scopes: repo",
  gitlab: "Create at GitLab → User Settings → Access Tokens. Scopes: api, read_api, read_repository",
  bitbucket: "Bitbucket → Personal settings → App passwords. Permissions: Repositories (Read)",
};

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

type Stage = "form" | "connecting" | "projects";

function StepDot({ n, label, state }: { n: number; label: string; state: "done" | "active" | "todo" }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`w-6 h-6 flex items-center justify-center text-xs font-bold ${
          state === "active" ? "bg-primary text-primary-foreground" : state === "done" ? "bg-foreground text-background" : "border border-border text-muted-foreground"
        }`}
      >
        {state === "done" ? <Check size={13} /> : n}
      </span>
      <span className={`text-sm font-medium ${state === "todo" ? "text-muted-foreground" : "text-foreground"}`}>{label}</span>
    </div>
  );
}

export function CreateWorkspaceView({ onBack, onCreated }: { onBack: () => void; onCreated: () => void }) {
  const { setActiveWorkspace, refetchWorkspaces } = useWorkspace();

  const [stage, setStage] = useState<Stage>("form");
  const [name, setName] = useState("");
  const [vcs, setVcs] = useState("github");
  const [token, setToken] = useState("");
  const [org, setOrg] = useState("");
  const [repos, setRepos] = useState<WorkspaceRepo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const visibleRepos = repos.filter(
    (r) =>
      !search.trim() ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      (r.description ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  const providerName = VCS_OPTIONS.find((v) => v.id === vcs)?.name ?? vcs;

  const loadProjects = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Workspace name is required");
    if (!token.trim()) return setError("An access token is required");
    if (!org.trim()) return setError("Organization / owner is required");
    setError("");
    setStage("connecting");
    try {
      const found = await previewWorkspaceRepos({ vcs, organization: org.trim(), token: token.trim() });
      setRepos(found);
      setSelected(new Set()); // start empty — the user picks which repos to track
      setStage("projects");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load repositories");
      setStage("form");
    }
  };

  const toggleRepo = (repoName: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(repoName) ? next.delete(repoName) : next.add(repoName);
      return next;
    });

  const continueToApp = async () => {
    if (selected.size === 0) return setError("Select at least one repository to track");
    setError("");
    setCreating(true);
    try {
      const res = await createWorkspace({
        name: name.trim(),
        vcs,
        organization: org.trim(),
        token: token.trim(),
        repos: [...selected],
      });
      // Land on this workspace's own portfolio (filtered by its workspace id).
      setActiveWorkspace({
        id: String(res.workspace.id),
        name: res.workspace.name,
        vcs: vcs as VcsProvider,
        projectsCount: res.projects.length,
        membersCount: 1,
      });
      // Refresh the real workspace list so the onboarding gate lets us through to the app.
      await refetchWorkspaces();
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the workspace");
      setCreating(false);
    }
  };

  const inputClass =
    "w-full bg-input-background border border-border px-4 py-3 text-[15px] placeholder:text-muted-foreground outline-none focus:border-primary transition-colors";
  const labelClass = "block text-sm font-semibold text-foreground mb-1.5";
  const labelStyle = { fontFamily: "var(--font-display)" };

  return (
    <div className="h-screen overflow-y-auto bg-background text-foreground">
      {/* Progress header */}
      <header className="border-b border-border bg-card flex items-center gap-6 px-6" style={{ height: 56 }}>
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={14} />
        </button>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-primary flex items-center justify-center">
            <Activity size={14} className="text-primary-foreground" />
          </div>
          <span className="text-base font-bold tracking-widest uppercase" style={labelStyle}>Pulse</span>
        </div>
        <div className="flex items-center gap-4 ml-4">
          <StepDot n={1} label="Workspace" state={stage === "form" ? "active" : "done"} />
          <span className="w-6 h-px bg-border" />
          <StepDot n={2} label="Connecting" state={stage === "connecting" ? "active" : stage === "projects" ? "done" : "todo"} />
          <span className="w-6 h-px bg-border" />
          <StepDot n={3} label="Projects" state={stage === "projects" ? "active" : "todo"} />
        </div>
      </header>

      <main>
        {/* ── Step 1: Workspace ── */}
        {stage === "form" && (
          <div className="flex items-center justify-center px-6 py-12" style={{ minHeight: "calc(100vh - 56px)" }}>
            <div className="w-full max-w-md">
              {error && (
                <div className="mb-5 border border-red-500/30 bg-red-500/5 text-red-500 px-4 py-3 text-sm flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  {error}
                </div>
              )}
              <h1 className="text-3xl font-bold uppercase tracking-tight mb-1" style={labelStyle}>Create Workspace</h1>
              <p className="text-base text-muted-foreground mb-8">Connect your version control to load projects automatically.</p>

              <form onSubmit={loadProjects} className="space-y-5">
              <div>
                <label className={labelClass} style={labelStyle}>Workspace Name</label>
                <input className={inputClass} placeholder="e.g. Acme Engineering" value={name} onChange={(e) => setName(e.target.value)} />
              </div>

              <div>
                <label className={labelClass} style={labelStyle}>Version Control Provider</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground pointer-events-none">
                    <VCSIcon vcs={vcs} className="h-4 w-4" />
                  </span>
                  <select value={vcs} onChange={(e) => setVcs(e.target.value)} className={`${inputClass} pl-10 appearance-none cursor-pointer`}>
                    {VCS_OPTIONS.map((v) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className={labelClass} style={labelStyle}>Personal Access Token</label>
                <input type="password" className={inputClass} style={{ fontFamily: "var(--font-mono)" }} placeholder="ghp_abc123…" value={token} onChange={(e) => setToken(e.target.value)} />
                <p className="text-xs text-muted-foreground mt-1.5">{TOKEN_HINT[vcs]}</p>
              </div>

              <div>
                <label className={labelClass} style={labelStyle}>Organization / Owner</label>
                <input className={inputClass} placeholder="your-org" value={org} onChange={(e) => setOrg(e.target.value)} />
                <p className="text-xs text-muted-foreground mt-1.5">Your {providerName} organization name or username</p>
              </div>

              <button type="submit" className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground text-[15px] font-semibold py-3 hover:opacity-90 transition-opacity" style={labelStyle}>
                Load Projects <ArrowRight size={16} />
              </button>
              </form>
            </div>
          </div>
        )}

        {/* ── Step 2: Connecting ── */}
        {stage === "connecting" && (
          <div className="flex flex-col items-center justify-center text-center px-6" style={{ minHeight: "calc(100vh - 56px)" }}>
            <Loader2 size={32} className="animate-spin text-primary mb-4" />
            <h2 className="text-xl font-bold mb-1" style={labelStyle}>Connecting to {providerName}…</h2>
            <p className="text-sm text-muted-foreground">Validating your token and discovering repositories.</p>
          </div>
        )}

        {/* ── Step 3: Projects ── */}
        {stage === "projects" && (
          <div className="max-w-5xl mx-auto px-8 py-10">
            {error && (
              <div className="mb-5 border border-red-500/30 bg-red-500/5 text-red-500 px-4 py-3 text-sm flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                {error}
              </div>
            )}
            <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
              <div>
                <h1 className="text-3xl font-bold uppercase tracking-tight" style={labelStyle}>
                  {repos.length} Repositor{repos.length === 1 ? "y" : "ies"} Found
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  <span className="font-semibold text-foreground">{selected.size}</span> selected via {providerName} · Check the repositories you want to track
                </p>
              </div>
              <button
                onClick={continueToApp}
                disabled={creating || selected.size === 0}
                className="flex items-center gap-2 bg-primary text-primary-foreground text-[15px] font-semibold px-6 py-3 hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                style={labelStyle}
              >
                {creating ? <Loader2 size={16} className="animate-spin" /> : null}
                {creating ? "Creating…" : `Continue with ${selected.size}`}
                {!creating && <ArrowRight size={16} />}
              </button>
            </div>

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
                No repositories found for <span className="font-semibold text-foreground">{org}</span> with this token.
              </div>
            ) : (
              <div className="border border-border">
                <div className="grid items-center bg-muted px-5 py-3 border-b border-border" style={{ gridTemplateColumns: "auto minmax(200px,1fr) 120px 80px 130px" }}>
                  <span className="w-8" />
                  <span className="text-sm font-semibold" style={labelStyle}>Repository</span>
                  <span className="text-sm font-semibold" style={labelStyle}>Language</span>
                  <span className="text-sm font-semibold" style={labelStyle}>Stars</span>
                  <span className="text-sm font-semibold" style={labelStyle}>Updated</span>
                </div>
                {visibleRepos.length === 0 && (
                  <div className="px-5 py-8 text-center text-sm text-muted-foreground">No repositories match “{search}”.</div>
                )}
                {visibleRepos.map((r) => (
                  <label
                    key={r.name}
                    className="grid items-center px-5 py-3.5 border-b border-border last:border-b-0 hover:bg-muted/40 cursor-pointer transition-colors"
                    style={{ gridTemplateColumns: "auto minmax(200px,1fr) 120px 80px 130px" }}
                  >
                    <input type="checkbox" checked={selected.has(r.name)} onChange={() => toggleRepo(r.name)} className="w-8 accent-primary" />
                    <div className="min-w-0 pr-4">
                      <div className="flex items-center gap-1.5">
                        {r.private ? <Lock size={13} className="text-muted-foreground shrink-0" /> : <Globe size={13} className="text-muted-foreground shrink-0" />}
                        <span className="font-semibold truncate" style={{ fontFamily: "var(--font-mono)" }}>{r.name}</span>
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
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
