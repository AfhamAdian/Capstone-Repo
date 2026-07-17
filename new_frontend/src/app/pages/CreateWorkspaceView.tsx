import { useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  GitBranch,
  Loader2,
  Sparkles,
} from "lucide-react";
import { useWorkspace, type VcsProvider, type Workspace } from "../context/WorkspaceContext";

interface VCSOption {
  id: VcsProvider;
  name: string;
  description: string;
  tokenLabel: string;
  tokenPlaceholder: string;
  tokenHint: string;
  docsUrl: string;
}

const VCS_OPTIONS: VCSOption[] = [
  {
    id: "github",
    name: "GitHub",
    description: "Personal access token or fine-grained PAT",
    tokenLabel: "Personal Access Token",
    tokenPlaceholder: "ghp_xxxxxxxxxxxxxxxxxxxx",
    tokenHint:
      "Requires repo, read:org, and read:user scopes. Generate at GitHub Settings → Developer settings → Tokens.",
    docsUrl:
      "https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens",
  },
  {
    id: "gitlab",
    name: "GitLab",
    description: "Project or group access token",
    tokenLabel: "Personal Access Token",
    tokenPlaceholder: "glpat-xxxxxxxxxxxxxxxxxxxx",
    tokenHint:
      "Requires api, read_api, and read_repository scopes. Generate at GitLab → User Settings → Access Tokens.",
    docsUrl: "https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html",
  },
  {
    id: "bitbucket",
    name: "Bitbucket",
    description: "App password or repository access token",
    tokenLabel: "App Password",
    tokenPlaceholder: "username:ATBB-xxxxxxxxxxxxxxxxxxxx",
    tokenHint: "Format: username:app_password. Requires Repositories (Read) and Pull Requests (Read) permissions.",
    docsUrl: "https://support.atlassian.com/bitbucket-cloud/docs/app-passwords/",
  },
  {
    id: "azure",
    name: "Azure DevOps",
    description: "Personal access token from Azure",
    tokenLabel: "Personal Access Token",
    tokenPlaceholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    tokenHint: "Requires Code (Read) and Project and Team (Read) scopes. Generate at Azure DevOps → User Settings → PAT.",
    docsUrl:
      "https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate",
  },
];

const NEXT_STEPS = [
  { step: "1", title: "Token validated", desc: "We verify your access token has the required permissions." },
  { step: "2", title: "Projects discovered", desc: "We scan your VCS for repositories and import project metadata." },
  { step: "3", title: "Insights activated", desc: "Risk scores, metrics, and dashboards are populated automatically." },
];

function validateToken(vcs: VcsProvider, token: string): boolean {
  if (token.length < 20) return false;
  switch (vcs) {
    case "github":
      return token.startsWith("ghp_") || token.startsWith("github_pat_") || token.length >= 40;
    case "gitlab":
      return token.startsWith("glpat-") || token.length >= 26;
    case "bitbucket":
      return token.includes(":") && token.split(":")[1].length >= 20;
    case "azure":
      return token.length >= 52;
    default:
      return token.length >= 20;
  }
}

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

export function CreateWorkspaceView({ onBack, onCreated }: { onBack: () => void; onCreated: () => void }) {
  const { addWorkspace, setActiveWorkspace } = useWorkspace();

  const [step, setStep] = useState<"form" | "validating" | "success">("form");
  const [workspaceName, setWorkspaceName] = useState("");
  const [selectedVCS, setSelectedVCS] = useState<VcsProvider | null>(null);
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const selectedVCSOption = VCS_OPTIONS.find((v) => v.id === selectedVCS);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!workspaceName.trim()) errs.name = "Workspace name is required";
    else if (workspaceName.trim().length < 3) errs.name = "Name must be at least 3 characters";
    if (!selectedVCS) errs.vcs = "Please select a version control system";
    if (!token.trim()) errs.token = "Access token is required";
    else if (selectedVCS && !validateToken(selectedVCS, token.trim()))
      errs.token = "Invalid token format — please check the token and try again.";
    return errs;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setStep("validating");
    setTimeout(() => {
      const newWs: Workspace = {
        id: `ws-${Date.now()}`,
        name: workspaceName.trim(),
        vcs: selectedVCS!,
        projectsCount: 0,
        membersCount: 1,
        isNew: true,
      };
      addWorkspace(newWs);
      setActiveWorkspace(newWs);
      setStep("success");
      setTimeout(onCreated, 1500);
    }, 2000);
  };

  if (step === "success") {
    return (
      <div className="h-screen flex items-center justify-center bg-background text-foreground">
        <div className="text-center">
          <div className="h-16 w-16 border-2 flex items-center justify-center mx-auto mb-5" style={{ borderColor: "var(--health-good)" }}>
            <Check size={28} style={{ color: "var(--health-good)" }} />
          </div>
          <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: "var(--font-display)" }}>
            Workspace Created!
          </h2>
          <p className="text-sm text-muted-foreground">
            Redirecting you to <span className="text-primary font-medium">{workspaceName}</span>…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-y-auto bg-background text-foreground">
      <header className="border-b border-border bg-card flex items-center px-6" style={{ height: 54 }}>
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={14} />
          Back to workspaces
        </button>
      </header>

      <main className="max-w-6xl mx-auto px-8 py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-bold uppercase tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
            Create a New Workspace
          </h1>
          <p className="text-base text-muted-foreground mt-1">
            Connect your version control system to start monitoring projects and gaining intelligence insights.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          <div className="lg:col-span-2 bg-card border border-border">
            <div className="px-6 py-4 border-b border-border">
              <div className="text-base font-bold" style={{ fontFamily: "var(--font-display)" }}>
                Workspace Configuration
              </div>
              <div className="text-sm text-muted-foreground mt-0.5">Fill in the details below to set up your new workspace.</div>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div>
                <label htmlFor="wsname" className="block text-sm font-semibold text-foreground mb-1.5" style={{ fontFamily: "var(--font-display)" }}>
                  Workspace Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="wsname"
                  type="text"
                  placeholder="e.g. Frontend Team, Platform Squad, DataOps"
                  value={workspaceName}
                  onChange={(e) => {
                    setWorkspaceName(e.target.value);
                    if (errors.name) setErrors({ ...errors, name: "" });
                  }}
                  className={`w-full bg-input-background border px-4 py-3 text-[15px] placeholder:text-muted-foreground outline-none focus:border-primary transition-colors ${
                    errors.name ? "border-red-500" : "border-border"
                  }`}
                />
                {errors.name && (
                  <p className="text-sm text-red-500 flex items-center gap-1.5 mt-1.5">
                    <AlertCircle size={13} />
                    {errors.name}
                  </p>
                )}
              </div>

              <div>
                <div className="block text-sm font-semibold text-foreground mb-2" style={{ fontFamily: "var(--font-display)" }}>
                  Version Control System <span className="text-red-500">*</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {VCS_OPTIONS.map((vcs) => {
                    const isActive = selectedVCS === vcs.id;
                    return (
                      <button
                        key={vcs.id}
                        type="button"
                        onClick={() => {
                          setSelectedVCS(vcs.id);
                          setToken("");
                          setErrors({ ...errors, vcs: "", token: "" });
                        }}
                        className={`relative group border p-4 flex flex-col items-center gap-2.5 transition-colors ${
                          isActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/40"
                        }`}
                      >
                        {isActive && (
                          <div className="absolute top-2 right-2">
                            <CheckCircle2 size={14} className="text-primary" />
                          </div>
                        )}
                        <div className="h-9 w-9 bg-foreground flex items-center justify-center text-background">
                          <VCSIcon vcs={vcs.id} className="h-4.5 w-4.5" />
                        </div>
                        <span className={`text-xs font-semibold transition-colors ${isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`}>
                          {vcs.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {errors.vcs && (
                  <p className="text-sm text-red-500 flex items-center gap-1.5 mt-1.5">
                    <AlertCircle size={13} />
                    {errors.vcs}
                  </p>
                )}
              </div>

              {selectedVCSOption && (
                <div className="space-y-3" key={selectedVCS}>
                  <div className="border border-border bg-muted/40 p-4 flex gap-3">
                    <div className="h-8 w-8 shrink-0 bg-foreground flex items-center justify-center text-background">
                      <VCSIcon vcs={selectedVCS!} className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[15px] font-medium mb-0.5">
                        {selectedVCSOption.name} — {selectedVCSOption.tokenLabel}
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{selectedVCSOption.tokenHint}</p>
                      <a
                        href={selectedVCSOption.docsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:opacity-75 text-xs mt-1.5 font-medium transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                      >
                        View documentation
                        <ExternalLink size={11} />
                      </a>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-1.5" style={{ fontFamily: "var(--font-display)" }}>
                      {selectedVCSOption.tokenLabel} <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showToken ? "text" : "password"}
                        placeholder={selectedVCSOption.tokenPlaceholder}
                        value={token}
                        onChange={(e) => {
                          setToken(e.target.value);
                          if (errors.token) setErrors({ ...errors, token: "" });
                        }}
                        className={`w-full bg-input-background border px-4 py-3 pr-12 text-[15px] placeholder:text-muted-foreground outline-none focus:border-primary transition-colors ${
                          errors.token ? "border-red-500" : "border-border"
                        }`}
                        style={{ fontFamily: "var(--font-mono)" }}
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => setShowToken((v) => !v)}
                      >
                        {showToken ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                    {errors.token && (
                      <p className="text-sm text-red-500 flex items-center gap-1.5 mt-1.5">
                        <AlertCircle size={13} />
                        {errors.token}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Your token is encrypted and stored securely. It will never be visible in the UI.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={onBack}
                  className="border border-border text-muted-foreground hover:bg-muted/40 px-5 py-3 text-[15px] font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={step === "validating"}
                  className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground text-[15px] font-semibold py-3 hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {step === "validating" ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      Validating &amp; creating workspace…
                    </>
                  ) : (
                    <>
                      <Sparkles size={15} />
                      Create Workspace
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          <div className="space-y-4">
            <div className="bg-card border border-border p-5">
              <div className="text-sm font-bold mb-4" style={{ fontFamily: "var(--font-display)" }}>
                What happens next?
              </div>
              <div className="space-y-4">
                {NEXT_STEPS.map((item) => (
                  <div key={item.step} className="flex gap-3">
                    <span className="shrink-0 w-5 h-5 flex items-center justify-center bg-primary text-primary-foreground text-xs font-bold mt-0.5">
                      {item.step}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.title}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-card border border-border p-5">
              <div className="text-sm font-bold mb-3" style={{ fontFamily: "var(--font-display)" }}>
                Supported platforms
              </div>
              <div className="space-y-2">
                {VCS_OPTIONS.map((vcs) => (
                  <div key={vcs.id} className="flex items-center gap-2.5 py-1">
                    <div className="h-6 w-6 bg-foreground flex items-center justify-center text-background">
                      <VCSIcon vcs={vcs.id} className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-foreground">{vcs.name}</p>
                      <p className="text-xs text-muted-foreground">{vcs.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
