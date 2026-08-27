import { useState } from "react";
import { Activity, AlertCircle, ArrowLeft, Plus, X } from "lucide-react";
import { createProject, type CreateProjectInput, type ProjectDetail } from "../api";

// Shared input styling (mirrors LoginView).
const inputClass =
  "w-full bg-input-background border border-border px-4 py-2.5 text-[15px] placeholder:text-muted-foreground outline-none focus:border-primary transition-colors";
const labelClass = "block text-sm font-semibold text-foreground mb-1.5";

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className={labelClass} style={{ fontFamily: "var(--font-display)" }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    </div>
  );
}

// Collapsible optional-tool section with an enable toggle.
function ToolSection({
  title,
  enabled,
  onToggle,
  children,
}: {
  title: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-border">
      <label className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none">
        <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
        <span className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          {title}
        </span>
      </label>
      {enabled && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}

export function AddProjectView({
  onCreated,
  onCancel,
}: {
  onCreated: (project: ProjectDetail) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  // Version control (the workspace) — required.
  const [vcsTool, setVcsTool] = useState("github");
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [vcsToken, setVcsToken] = useState("");

  // Optional: Jira (project management).
  const [jiraOn, setJiraOn] = useState(false);
  const [jiraEmail, setJiraEmail] = useState("");
  const [jiraBaseUrl, setJiraBaseUrl] = useState("");
  const [jiraProjectKey, setJiraProjectKey] = useState("");
  const [jiraBoardId, setJiraBoardId] = useState("");
  const [jiraToken, setJiraToken] = useState("");

  // Optional: SonarQube (code quality).
  const [sonarOn, setSonarOn] = useState(false);
  const [sonarOrg, setSonarOrg] = useState("");
  const [sonarProjectKey, setSonarProjectKey] = useState("");
  const [sonarBaseUrl, setSonarBaseUrl] = useState("");
  const [sonarToken, setSonarToken] = useState("");

  // Optional: CI/CD. GitHub Actions syncs today; Jenkins is stored until its connector ships.
  const [cicdOn, setCicdOn] = useState(false);
  const [cicdProvider, setCicdProvider] = useState("github-actions");
  const [reuseVcsToken, setReuseVcsToken] = useState(true);
  const [actionsToken, setActionsToken] = useState("");
  const [jenkinsBaseUrl, setJenkinsBaseUrl] = useState("");
  const [jenkinsUser, setJenkinsUser] = useState("");
  const [jenkinsToken, setJenkinsToken] = useState("");
  const [jenkinsJob, setJenkinsJob] = useState("");

  // Invites.
  const [invites, setInvites] = useState<string[]>([""]);

  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const setInvite = (i: number, v: string) => setInvites((prev) => prev.map((e, idx) => (idx === i ? v : e)));
  const addInvite = () => setInvites((prev) => [...prev, ""]);
  const removeInvite = (i: number) => setInvites((prev) => prev.filter((_, idx) => idx !== i));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Project name is required");
    if (!owner.trim() || !repo.trim() || !vcsToken.trim()) {
      return setError("Version control needs owner, repository, and a token");
    }
    if (jiraOn && (!jiraEmail || !jiraBaseUrl || !jiraProjectKey || !jiraToken)) {
      return setError("Jira needs email, base URL, project key, and a token");
    }
    if (sonarOn && (!sonarProjectKey || !sonarToken)) {
      return setError("SonarQube needs a project key and a token");
    }
    if (cicdOn && cicdProvider === "github-actions" && !(reuseVcsToken ? vcsToken : actionsToken).trim()) {
      return setError("GitHub Actions needs a token (or reuse the version control token)");
    }
    if (cicdOn && cicdProvider === "jenkins" && (!jenkinsBaseUrl.trim() || !jenkinsJob.trim() || !jenkinsToken.trim())) {
      return setError("Jenkins needs a server URL, job name, and API token");
    }

    const input: CreateProjectInput = {
      name: name.trim(),
      description: description.trim() || undefined,
      vcs: {
        toolName: vcsTool,
        config: { token: vcsToken.trim(), owner: owner.trim(), repo: repo.trim() },
      },
      integrations: [],
      invites: invites.map((e) => e.trim()).filter(Boolean),
    };

    if (jiraOn) {
      input.integrations!.push({
        category: "projectManagement",
        toolName: "jira",
        config: {
          token: jiraToken.trim(),
          email: jiraEmail.trim(),
          baseUrl: jiraBaseUrl.trim(),
          projectKey: jiraProjectKey.trim(),
          ...(jiraBoardId.trim() ? { boardId: jiraBoardId.trim() } : {}),
        },
      });
    }
    if (sonarOn) {
      input.integrations!.push({
        category: "codeQuality",
        toolName: "sonarqube",
        config: {
          token: sonarToken.trim(),
          projectKey: sonarProjectKey.trim(),
          ...(sonarOrg.trim() ? { organization: sonarOrg.trim() } : {}),
          ...(sonarBaseUrl.trim() ? { baseUrl: sonarBaseUrl.trim() } : {}),
        },
      });
    }

    if (cicdOn) {
      if (cicdProvider === "github-actions") {
        input.integrations!.push({
          category: "cicd",
          toolName: "github-actions",
          config: {
            token: (reuseVcsToken ? vcsToken : actionsToken).trim(),
            owner: owner.trim(),
            repo: repo.trim(),
          },
        });
      } else {
        input.integrations!.push({
          category: "cicd",
          toolName: "jenkins",
          config: {
            baseUrl: jenkinsBaseUrl.trim(),
            username: jenkinsUser.trim(),
            apiToken: jenkinsToken.trim(),
            jobName: jenkinsJob.trim(),
          },
        });
      }
    }

    setIsLoading(true);
    setError("");
    try {
      const project = await createProject(input);
      onCreated(project);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-y-auto">
      <div className="w-full max-w-lg mx-auto px-6 py-10">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft size={14} />
          Back
        </button>

        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 bg-primary flex items-center justify-center">
            <Activity size={18} className="text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
            Add Project
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <Field label="Project Name" value={name} onChange={setName} placeholder="Payments Service" />
          <Field label="Description (optional)" value={description} onChange={setDescription} placeholder="What is this project?" />

          <div className="pt-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-3">Version Control</h2>
            <div className="space-y-3">
              <div>
                <label className={labelClass} style={{ fontFamily: "var(--font-display)" }}>Provider</label>
                <select value={vcsTool} onChange={(e) => setVcsTool(e.target.value)} className={inputClass}>
                  <option value="github">GitHub</option>
                  <option value="gitlab">GitLab</option>
                  <option value="bitbucket">Bitbucket</option>
                </select>
              </div>
              <Field label="Owner / Organization" value={owner} onChange={setOwner} placeholder="acme" />
              <Field label="Repository" value={repo} onChange={setRepo} placeholder="web" />
              <Field label="Access Token" value={vcsToken} onChange={setVcsToken} placeholder="ghp_…" type="password" />
            </div>
          </div>

          <div className="pt-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-3">Additional Tools (optional)</h2>
            <div className="space-y-3">
              <ToolSection title="Jira (Project Management)" enabled={jiraOn} onToggle={setJiraOn}>
                <Field label="Email" value={jiraEmail} onChange={setJiraEmail} placeholder="you@company.com" />
                <Field label="Base URL" value={jiraBaseUrl} onChange={setJiraBaseUrl} placeholder="https://acme.atlassian.net" />
                <Field label="Project Key" value={jiraProjectKey} onChange={setJiraProjectKey} placeholder="WEB" />
                <Field label="Board ID (optional)" value={jiraBoardId} onChange={setJiraBoardId} placeholder="5" />
                <Field label="API Token" value={jiraToken} onChange={setJiraToken} placeholder="•••" type="password" />
              </ToolSection>

              <ToolSection title="SonarQube (Code Quality)" enabled={sonarOn} onToggle={setSonarOn}>
                <Field label="Organization (optional)" value={sonarOrg} onChange={setSonarOrg} placeholder="acme" />
                <Field label="Project Key" value={sonarProjectKey} onChange={setSonarProjectKey} placeholder="acme_web" />
                <Field label="Base URL (optional)" value={sonarBaseUrl} onChange={setSonarBaseUrl} placeholder="https://sonarcloud.io" />
                <Field label="Token" value={sonarToken} onChange={setSonarToken} placeholder="•••" type="password" />
              </ToolSection>

              <ToolSection title="CI/CD" enabled={cicdOn} onToggle={setCicdOn}>
                <div>
                  <label className={labelClass} style={{ fontFamily: "var(--font-display)" }}>Provider</label>
                  <select value={cicdProvider} onChange={(e) => setCicdProvider(e.target.value)} className={inputClass}>
                    <option value="github-actions">GitHub Actions</option>
                    <option value="jenkins">Jenkins (sync coming soon)</option>
                  </select>
                </div>

                {cicdProvider === "github-actions" ? (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Runs on your version control repo ({owner || "owner"}/{repo || "repo"}).
                    </p>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={reuseVcsToken} onChange={(e) => setReuseVcsToken(e.target.checked)} />
                      Reuse version control token
                    </label>
                    {!reuseVcsToken && (
                      <Field label="Token" value={actionsToken} onChange={setActionsToken} placeholder="ghp_…" type="password" />
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">Stored now; syncing works once the Jenkins connector ships.</p>
                    <Field label="Server URL" value={jenkinsBaseUrl} onChange={setJenkinsBaseUrl} placeholder="https://jenkins.company.com" />
                    <Field label="Username" value={jenkinsUser} onChange={setJenkinsUser} placeholder="ci-user" />
                    <Field label="API Token" value={jenkinsToken} onChange={setJenkinsToken} placeholder="•••" type="password" />
                    <Field label="Job Name" value={jenkinsJob} onChange={setJenkinsJob} placeholder="my-pipeline" />
                  </>
                )}
              </ToolSection>
            </div>
          </div>

          <div className="pt-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-3">Invite Members (optional)</h2>
            <div className="space-y-2">
              {invites.map((email, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="email"
                    value={email}
                    placeholder="teammate@company.com"
                    onChange={(e) => setInvite(i, e.target.value)}
                    className={inputClass}
                  />
                  {invites.length > 1 && (
                    <button type="button" onClick={() => removeInvite(i)} className="text-muted-foreground hover:text-red-500 p-2">
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
              <button type="button" onClick={addInvite} className="flex items-center gap-1 text-sm text-primary font-semibold hover:underline">
                <Plus size={14} />
                Add another
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-500 flex items-center gap-1">
              <AlertCircle size={13} />
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-primary text-primary-foreground text-[15px] font-semibold py-3 hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {isLoading ? "Creating…" : "Create Project"}
          </button>
        </form>
      </div>
    </div>
  );
}
