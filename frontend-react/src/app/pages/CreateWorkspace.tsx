import { useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  GitBranch,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { useUser, Workspace } from "../context/UserContext";

type VCSType = "github" | "gitlab" | "bitbucket" | "azure";

interface VCSOption {
  id: VCSType;
  name: string;
  description: string;
  tokenLabel: string;
  tokenPlaceholder: string;
  tokenHint: string;
  docsUrl: string;
  iconBg: string;
  accentColor: string;
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
    iconBg: "bg-slate-800",
    accentColor: "border-slate-300 bg-slate-50",
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
    iconBg: "bg-orange-500",
    accentColor: "border-orange-200 bg-orange-50",
  },
  {
    id: "bitbucket",
    name: "Bitbucket",
    description: "App password or repository access token",
    tokenLabel: "App Password",
    tokenPlaceholder: "username:ATBB-xxxxxxxxxxxxxxxxxxxx",
    tokenHint:
      "Format: username:app_password. Requires Repositories (Read) and Pull Requests (Read) permissions.",
    docsUrl: "https://support.atlassian.com/bitbucket-cloud/docs/app-passwords/",
    iconBg: "bg-blue-600",
    accentColor: "border-blue-200 bg-blue-50",
  },
  {
    id: "azure",
    name: "Azure DevOps",
    description: "Personal access token from Azure",
    tokenLabel: "Personal Access Token",
    tokenPlaceholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    tokenHint:
      "Requires Code (Read) and Project and Team (Read) scopes. Generate at Azure DevOps → User Settings → PAT.",
    docsUrl:
      "https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate",
    iconBg: "bg-sky-500",
    accentColor: "border-sky-200 bg-sky-50",
  },
];

function validateToken(vcs: VCSType, token: string): boolean {
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

function VCSIcon({ vcs, className }: { vcs: VCSType; className?: string }) {
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

export function CreateWorkspace() {
  const navigate = useNavigate();
  const { addWorkspace, setActiveWorkspace } = useUser();

  const [step, setStep] = useState<"form" | "validating" | "success">("form");
  const [workspaceName, setWorkspaceName] = useState("");
  const [selectedVCS, setSelectedVCS] = useState<VCSType | null>(null);
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
      setTimeout(() => navigate("/dashboard/projects"), 1500);
    }, 2000);
  };

  if (step === "success") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="h-20 w-20 rounded-full bg-green-100 border-2 border-green-300 flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="h-10 w-10 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-1">Workspace Created!</h2>
          <p className="text-slate-500 text-sm">
            Redirecting you to{" "}
            <span className="text-blue-600 font-medium">{workspaceName}</span>…
          </p>
        </div>
      </div>
    );
  }

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
            onClick={() => navigate("/workspaces")}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to workspaces
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-8 py-12">
        {/* Page heading */}
        <div className="mb-8">
          <h2 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-slate-900 bg-clip-text text-transparent mb-2">
            Create a New Workspace
          </h2>
          <p className="text-slate-600">
            Connect your version control system to start monitoring projects and gaining intelligence insights.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Form card */}
          <div className="lg:col-span-2">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-4 border-b border-slate-100">
                <CardTitle className="text-lg text-slate-900">Workspace Configuration</CardTitle>
                <CardDescription>Fill in the details below to set up your new workspace.</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <form onSubmit={handleSubmit} className="space-y-7">
                  {/* Workspace Name */}
                  <div className="space-y-2">
                    <Label htmlFor="wsname" className="text-slate-700 font-medium text-sm">
                      Workspace Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="wsname"
                      type="text"
                      placeholder="e.g. Frontend Team, Platform Squad, DataOps"
                      value={workspaceName}
                      onChange={(e) => {
                        setWorkspaceName(e.target.value);
                        if (errors.name) setErrors({ ...errors, name: "" });
                      }}
                      className={`h-11 border-slate-200 ${errors.name ? "border-red-400" : ""}`}
                    />
                    {errors.name && (
                      <p className="text-sm text-red-600 flex items-center gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5" />
                        {errors.name}
                      </p>
                    )}
                  </div>

                  {/* VCS Selection */}
                  <div className="space-y-3">
                    <Label className="text-slate-700 font-medium text-sm">
                      Version Control System <span className="text-red-500">*</span>
                    </Label>
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
                            className={`relative group rounded-xl border p-4 flex flex-col items-center gap-2.5 transition-all duration-200 cursor-pointer focus:outline-none ${
                              isActive
                                ? "border-blue-400 bg-blue-50 shadow-sm shadow-blue-500/15"
                                : "border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50 hover:shadow-sm"
                            }`}
                          >
                            {isActive && (
                              <div className="absolute top-2 right-2">
                                <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />
                              </div>
                            )}
                            <div className={`h-9 w-9 rounded-lg ${vcs.iconBg} flex items-center justify-center text-white`}>
                              <VCSIcon vcs={vcs.id} className="h-5 w-5" />
                            </div>
                            <span className={`text-xs font-semibold transition-colors ${
                              isActive ? "text-blue-700" : "text-slate-600 group-hover:text-slate-900"
                            }`}>
                              {vcs.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {errors.vcs && (
                      <p className="text-sm text-red-600 flex items-center gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5" />
                        {errors.vcs}
                      </p>
                    )}
                  </div>

                  {/* Token input — shown after VCS is selected */}
                  {selectedVCSOption && (
                    <div className="space-y-3 animate-in slide-in-from-bottom-2 duration-200" key={selectedVCS}>
                      {/* Hint card */}
                      <div className={`rounded-xl border p-4 flex gap-3 ${selectedVCSOption.accentColor}`}>
                        <div className={`h-8 w-8 flex-shrink-0 rounded-lg ${selectedVCSOption.iconBg} flex items-center justify-center text-white`}>
                          <VCSIcon vcs={selectedVCS!} className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-slate-800 text-sm font-medium mb-0.5">
                            {selectedVCSOption.name} — {selectedVCSOption.tokenLabel}
                          </p>
                          <p className="text-slate-500 text-xs leading-relaxed">
                            {selectedVCSOption.tokenHint}
                          </p>
                          <a
                            href={selectedVCSOption.docsUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 text-xs mt-1.5 font-medium transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            View documentation
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-slate-700 font-medium text-sm">
                          {selectedVCSOption.tokenLabel} <span className="text-red-500">*</span>
                        </Label>
                        <div className="relative">
                          <Input
                            type={showToken ? "text" : "password"}
                            placeholder={selectedVCSOption.tokenPlaceholder}
                            value={token}
                            onChange={(e) => {
                              setToken(e.target.value);
                              if (errors.token) setErrors({ ...errors, token: "" });
                            }}
                            className={`h-11 border-slate-200 pr-12 font-mono text-sm ${
                              errors.token ? "border-red-400" : ""
                            }`}
                          />
                          <button
                            type="button"
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
                            onClick={() => setShowToken((v) => !v)}
                          >
                            {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        {errors.token && (
                          <p className="text-sm text-red-600 flex items-center gap-1.5">
                            <AlertCircle className="h-3.5 w-3.5" />
                            {errors.token}
                          </p>
                        )}
                        <p className="text-slate-400 text-xs">
                          Your token is encrypted and stored securely. It will never be visible in the UI.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-3 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      className="border-slate-200 text-slate-600 hover:bg-slate-50 h-11 px-5"
                      onClick={() => navigate("/workspaces")}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={step === "validating"}
                      className="flex-1 h-11 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium shadow-lg shadow-blue-500/30 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {step === "validating" ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Validating &amp; creating workspace…
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4" />
                          Create Workspace
                        </span>
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Side info panel */}
          <div className="space-y-4">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-slate-900">What happens next?</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                {[
                  {
                    step: "1",
                    title: "Token validated",
                    desc: "We verify your access token has the required permissions.",
                    color: "bg-blue-100 text-blue-700",
                  },
                  {
                    step: "2",
                    title: "Projects discovered",
                    desc: "We scan your VCS for repositories and import project metadata.",
                    color: "bg-indigo-100 text-indigo-700",
                  },
                  {
                    step: "3",
                    title: "Insights activated",
                    desc: "Risk scores, metrics, and dashboards are populated automatically.",
                    color: "bg-violet-100 text-violet-700",
                  },
                ].map((item) => (
                  <div key={item.step} className="flex gap-3">
                    <div className={`h-6 w-6 rounded-full ${item.color} flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5`}>
                      {item.step}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{item.title}</p>
                      <p className="text-xs text-slate-500 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-slate-900">Supported platforms</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {VCS_OPTIONS.map((vcs) => (
                  <div key={vcs.id} className="flex items-center gap-2.5 py-1">
                    <div className={`h-6 w-6 rounded-md ${vcs.iconBg} flex items-center justify-center text-white`}>
                      <VCSIcon vcs={vcs.id} className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-700">{vcs.name}</p>
                      <p className="text-xs text-slate-400">{vcs.description}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
