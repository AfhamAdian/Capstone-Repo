import { useEffect, useState } from "react";
import { ShieldCheck, GitBranch, Workflow, Check, ChevronDown, Link2, X, RefreshCw, AlertCircle, Eye, EyeOff, Mail } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type { Project } from "../types";
import { useWorkspace } from "../context/WorkspaceContext";
import { getProject, updateProjectIntegration, getIntegrationToken, inviteProjectMember, removeProjectMember, type ProjectMemberView } from "../api";
import { PageShell, PageHeader } from "../components/PageShell";
import { Switch } from "../components/Switch";

// Presentational metadata only — the editable fields/token/docs live in each connector's RealConnectorSpec.
interface ConnectorDef { id:string; name:string; icon:React.ReactNode; color:string; description:string; }

const CONNECTORS:ConnectorDef[]=[
  {
    id:"jira", name:"Jira", color:"text-link",
    icon:<svg viewBox="0 0 32 32" width={20} height={20} fill="currentColor"><path d="M15.88 0C9.8 0 4.86 4.94 4.86 11.03c0 3.33 1.5 6.32 3.88 8.3L15.88 32l7.14-12.67c2.38-1.98 3.88-4.97 3.88-8.3C26.9 4.94 21.96 0 15.88 0zm0 15.57a4.54 4.54 0 1 1 0-9.08 4.54 4.54 0 0 1 0 9.08z"/></svg>,
    description:"Pull sprint velocity, ticket closure rate, and open blockers directly from your Jira board.",
  },
  {
    id:"sonarqube", name:"SonarQube", color:"text-chart-5",
    icon:<ShieldCheck size={20}/>,
    description:"Track code quality score, code smells, coverage, and technical debt from SonarQube or SonarCloud.",
  },
  {
    id:"github", name:"GitHub", color:"text-foreground",
    icon:<GitBranch size={20}/>,
    description:"Pull commit frequency, PR cycle time, and deployment frequency from your GitHub repository.",
  },
];

// Describes a real connector: which non-token fields to show and how its token is handled.
interface RealConnectorSpec {
  toolName: string;
  fields: { key: string; label: string; placeholder: string; hint: string }[];
  tokenLabel: string;
  tokenHint: string;
  tokenPlaceholder: string;
  tokenEditable: boolean; // github: false (workspace PAT); sonarqube: true (stored in config)
  fixedConfig?: Record<string, string>; // always sent on save, e.g. sonarqube baseUrl
  docsUrl: string;
  /**
   * Transforms the raw field values into what actually gets saved - e.g. parsing one pasted
   * URL into several config keys. Defaults to a 1:1 copy of `fields` when omitted. Throwing
   * surfaces as a normal save error (caught in RealConnectorCard.save()).
   */
  parse?: (values: Record<string, string>) => Record<string, string>;
}

// Real connector card — loads the project's current config, reveals the token, and persists updates.
function RealConnectorCard({def,backendProjectId,spec}:{def:ConnectorDef;backendProjectId:string;spec:RealConnectorSpec;}) {
  const [open,setOpen]=useState(false);
  const [values,setValues]=useState<Record<string,string>>(Object.fromEntries(spec.fields.map(f=>[f.key,""])));
  const [token,setToken]=useState("");
  const [tokenSet,setTokenSet]=useState(false);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [status,setStatus]=useState<"idle"|"ok"|"err">("idle");
  const [msg,setMsg]=useState("");
  const [revealed,setRevealed]=useState(false);
  const [currentToken,setCurrentToken]=useState<string|null>(null);
  const [revealing,setRevealing]=useState(false);

  const toggleReveal=async()=>{
    if(revealed){ setRevealed(false); return; }
    if(currentToken===null){
      setRevealing(true);
      try{ setCurrentToken(await getIntegrationToken(Number(backendProjectId),spec.toolName)); }
      catch{ setCurrentToken(""); }
      finally{ setRevealing(false); }
    }
    setRevealed(true);
  };

  useEffect(()=>{
    let cancelled=false;
    getProject(Number(backendProjectId))
      .then(p=>{
        if(cancelled) return;
        const integ=p.integrations.find(i=>i.toolName===spec.toolName);
        const cfg=integ?.config ?? {};
        setValues(Object.fromEntries(spec.fields.map(f=>[f.key,(cfg[f.key] as string) ?? ""])));
        setTokenSet(Boolean(cfg.token)); // redacted ('***') when a token is set
      })
      .catch(()=>{})
      .finally(()=>{ if(!cancelled) setLoading(false); });
    return ()=>{cancelled=true;};
  },[backendProjectId,spec]);

  const configured=tokenSet && spec.fields.every(f=>values[f.key]?.trim());

  const save=async()=>{
    for(const f of spec.fields){ if(!values[f.key]?.trim()){ setStatus("err"); setMsg(`${f.label} is required`); return; } }
    if(spec.tokenEditable && !tokenSet && !token.trim()){ setStatus("err"); setMsg(`${spec.tokenLabel} is required`); return; }
    setSaving(true); setStatus("idle"); setMsg("");
    try{
      const config:Record<string,string>={...spec.fixedConfig};
      if(spec.parse){
        Object.assign(config, spec.parse(values));
      }else{
        for(const f of spec.fields) config[f.key]=values[f.key].trim();
      }
      if(spec.tokenEditable && token.trim()) config.token=token.trim();
      await updateProjectIntegration(Number(backendProjectId),spec.toolName,config);
      setStatus("ok"); setMsg("Saved"); setToken(""); setTokenSet(true); setRevealed(false); setCurrentToken(null);
    }catch(e){ setStatus("err"); setMsg(e instanceof Error?e.message:"Save failed"); }
    finally{ setSaving(false); }
  };

  const inputClass="w-full bg-input-background border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary transition-colors font-mono";

  return (
    <div className="border border-border bg-card">
      <button onClick={()=>setOpen(!open)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors text-left">
        <div className="flex items-center gap-4">
          <span className={`shrink-0 ${def.color}`}>{def.icon}</span>
          <div>
            <div className="text-base font-bold text-foreground" style={{fontFamily:"var(--font-display)"}}>{def.name}</div>
            <div className="text-sm text-muted-foreground mt-0.5">{def.description}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          {configured
            ? <span className="text-sm font-semibold text-health-good flex items-center gap-1.5"><Check size={13}/>Connected</span>
            : <span className="text-sm text-muted-foreground">Not configured</span>}
          <ChevronDown size={15} className={`text-muted-foreground transition-transform ${open?"rotate-180":""}`}/>
        </div>
      </button>
      <AnimatePresence>
        {open&&(
          <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} transition={{duration:0.15}} className="overflow-hidden">
            <div className="border-t border-border px-5 py-5 space-y-4">
              {loading?(
                <p className="text-sm text-muted-foreground">Loading current settings…</p>
              ):(
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-foreground mb-1.5" style={{fontFamily:"var(--font-display)"}}>{spec.tokenLabel}</label>
                      <div className="relative">
                        {spec.tokenEditable ? (
                          revealed
                            ? <input readOnly value={currentToken ?? ""} type="text" className={`${inputClass} pr-10`}/>
                            : <input type="password" value={token} onChange={e=>setToken(e.target.value)}
                                placeholder={tokenSet?"•••••••• — leave blank to keep":spec.tokenPlaceholder} className={`${inputClass} pr-10`}/>
                        ) : (
                          <input readOnly type={revealed?"text":"password"} value={revealed?(currentToken ?? ""):""}
                            placeholder={revealed?"":"•••••••• — managed by the workspace"} className={`${inputClass} pr-10`}/>
                        )}
                        {tokenSet&&(
                          <button type="button" onClick={toggleReveal} disabled={revealing}
                            title={revealed?"Hide token":"Show current token"}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40">
                            {revealing?<RefreshCw size={15} className="animate-spin"/>:revealed?<EyeOff size={15}/>:<Eye size={15}/>}
                          </button>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{spec.tokenHint}</div>
                    </div>
                    {spec.fields.map(f=>(
                      <div key={f.key}>
                        <label className="block text-sm font-semibold text-foreground mb-1.5" style={{fontFamily:"var(--font-display)"}}>{f.label}</label>
                        <input value={values[f.key]} onChange={e=>setValues(prev=>({...prev,[f.key]:e.target.value}))} placeholder={f.placeholder} className={inputClass}/>
                        <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{f.hint}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border gap-3 flex-wrap">
                    <a href={spec.docsUrl} target="_blank" rel="noreferrer" className="text-sm text-link flex items-center gap-1 hover:opacity-75 transition-opacity">
                      <Link2 size={12}/> View API docs
                    </a>
                    <div className="flex items-center gap-3">
                      {status==="ok"&&<span className="text-sm text-health-good font-medium flex items-center gap-1"><Check size={13}/>{msg}</span>}
                      {status==="err"&&<span className="text-sm text-destructive font-medium flex items-center gap-1"><AlertCircle size={13}/>{msg}</span>}
                      <button type="button" disabled title="Coming soon"
                        className="flex items-center gap-2 border border-border px-4 py-2 text-sm font-semibold text-foreground opacity-40 cursor-not-allowed"
                        style={{fontFamily:"var(--font-display)"}}>
                        <Link2 size={13}/>Test Connection
                      </button>
                      <button onClick={save} disabled={saving}
                        className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{fontFamily:"var(--font-display)"}}>
                        {saving?<><RefreshCw size={13} className="animate-spin"/>Saving…</>:"Save"}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// CI/CD is a category, not a single tool — pick a provider first. GitHub Actions is the only one
// that actually syncs today; it needs no credentials of its own (backend reuses the project's
// GitHub integration - see getProjectIntegrationsForTools in apps/api/database/project.ts).
const CICD_PROVIDERS: { value: string; label: string }[] = [
  { value: "github-actions", label: "GitHub Actions" },
];

// CI/CD connector card — a provider picker instead of RealConnectorCard's fixed fields/token,
// since the only provider available right now needs no configuration at all.
function CicdConnectorCard({backendProjectId}:{backendProjectId:string;}) {
  const [open,setOpen]=useState(false);
  const [provider,setProvider]=useState(CICD_PROVIDERS[0]!.value);
  const [configured,setConfigured]=useState(false);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [status,setStatus]=useState<"idle"|"ok"|"err">("idle");
  const [msg,setMsg]=useState("");

  useEffect(()=>{
    let cancelled=false;
    getProject(Number(backendProjectId))
      .then(p=>{
        if(cancelled) return;
        const integ=p.integrations.find(i=>i.category==="cicd");
        if(integ){ setProvider(integ.toolName); setConfigured(true); }
      })
      .catch(()=>{})
      .finally(()=>{ if(!cancelled) setLoading(false); });
    return ()=>{cancelled=true;};
  },[backendProjectId]);

  const save=async()=>{
    setSaving(true); setStatus("idle"); setMsg("");
    try{
      await updateProjectIntegration(Number(backendProjectId),provider,{});
      setStatus("ok"); setMsg("Saved"); setConfigured(true);
    }catch(e){ setStatus("err"); setMsg(e instanceof Error?e.message:"Save failed"); }
    finally{ setSaving(false); }
  };

  return (
    <div className="border border-border bg-card">
      <button onClick={()=>setOpen(!open)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors text-left">
        <div className="flex items-center gap-4">
          <span className="shrink-0 text-attention"><Workflow size={20}/></span>
          <div>
            <div className="text-base font-bold text-foreground" style={{fontFamily:"var(--font-display)"}}>CI/CD</div>
            <div className="text-sm text-muted-foreground mt-0.5">Pull pipeline success rate, deployment frequency, and test results from your CI/CD provider.</div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          {configured
            ? <span className="text-sm font-semibold text-health-good flex items-center gap-1.5"><Check size={13}/>Connected</span>
            : <span className="text-sm text-muted-foreground">Not configured</span>}
          <ChevronDown size={15} className={`text-muted-foreground transition-transform ${open?"rotate-180":""}`}/>
        </div>
      </button>
      <AnimatePresence>
        {open&&(
          <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} transition={{duration:0.15}} className="overflow-hidden">
            <div className="border-t border-border px-5 py-5 space-y-4">
              {loading?(
                <p className="text-sm text-muted-foreground">Loading current settings…</p>
              ):(
                <>
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-1.5" style={{fontFamily:"var(--font-display)"}}>Provider</label>
                    <select value={provider} onChange={e=>setProvider(e.target.value)}
                      className="w-full bg-input-background border border-border px-3 py-2.5 text-sm text-foreground focus:border-primary transition-colors">
                      {CICD_PROVIDERS.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Runs on your GitHub connector's repository — no separate credentials needed.
                  </p>
                  <div className="flex items-center justify-end pt-2 border-t border-border gap-3">
                    {status==="ok"&&<span className="text-sm text-health-good font-medium flex items-center gap-1"><Check size={13}/>{msg}</span>}
                    {status==="err"&&<span className="text-sm text-destructive font-medium flex items-center gap-1"><AlertCircle size={13}/>{msg}</span>}
                    <button onClick={save} disabled={saving}
                      className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{fontFamily:"var(--font-display)"}}>
                      {saving?<><RefreshCw size={13} className="animate-spin"/>Saving…</>:"Save"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const GITHUB_SPEC: RealConnectorSpec = {
  toolName: "github",
  fields: [{ key: "owner", label: "Organization / Owner", placeholder: "your-org", hint: "Your GitHub organization name or username" }],
  tokenLabel: "Personal Access Token",
  tokenHint: "Managed by the workspace — the workspace PAT is used to sync this repo.",
  tokenPlaceholder: "ghp_abc123…",
  tokenEditable: false,
  docsUrl: "https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token",
};

const SONARQUBE_SPEC: RealConnectorSpec = {
  toolName: "sonarqube",
  fields: [{ key: "projectKey", label: "Project Key", placeholder: "my-org_my-project", hint: "Found in SonarQube → Project → Project Information" }],
  tokenLabel: "Auth Token",
  tokenHint: "Generate in SonarQube → My Account → Security",
  tokenPlaceholder: "squ_abc123…",
  tokenEditable: true,
  fixedConfig: { baseUrl: "https://sonarcloud.io" },
  docsUrl: "https://docs.sonarsource.com/sonarcloud/",
};

// Same board-URL parsing as backend/scripts/test-jira.ts's parseBoardUrl() - one pasted URL
// yields baseUrl/projectKey/boardId, so sprint-based metrics (Planning & Execution, etc.) stop
// silently going null for lack of a board ID. Backend already reads all 3 as separate config
// keys (getProjectIntegrationsForTools), so nothing there needs to change.
// The `c/` segment is optional: team-managed boards are .../software/projects/{KEY}/boards/{id},
// company-managed ("classic") boards are .../software/c/projects/{KEY}/boards/{id} - both carry
// the same projectKey/boardId, just with that one extra path segment (see future-work.md #2).
const JIRA_BOARD_URL_PATTERN = /^(https:\/\/[^/]+)\/jira\/software\/(?:c\/)?projects\/([^/]+)\/boards\/(\d+)/;

const JIRA_SPEC: RealConnectorSpec = {
  toolName: "jira",
  fields: [
    { key: "boardUrl", label: "Board URL", placeholder: "https://yourorg.atlassian.net/jira/software/projects/PROJ/boards/1", hint: "Paste the board URL from your browser — project key and board ID are extracted automatically." },
    { key: "email", label: "API Email", placeholder: "you@company.com", hint: "The email associated with your Atlassian account" },
  ],
  parse: (values) => {
    const match = values.boardUrl?.match(JIRA_BOARD_URL_PATTERN);
    if (!match) {
      throw new Error("Board URL doesn't look like a Jira board URL — expected https://yourorg.atlassian.net/jira/software/projects/PROJ/boards/1");
    }
    return {
      boardUrl: values.boardUrl.trim(), // kept so the field can show its current value again on reload
      baseUrl: match[1]!,
      projectKey: match[2]!,
      boardId: match[3]!,
      email: values.email.trim(),
    };
  },
  tokenLabel: "API Token",
  tokenHint: "Generate at id.atlassian.com → Security → API tokens",
  tokenPlaceholder: "ATATT3xFf…",
  tokenEditable: true,
  docsUrl: "https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/",
};

// Maps each connector id to its real spec; the connectors tab renders these against the backend project.
const REAL_SPECS: Record<string, RealConnectorSpec> = {
  github: GITHUB_SPEC,
  sonarqube: SONARQUBE_SPEC,
  jira: JIRA_SPEC,
};

// Real project members backed by the projectmember table. Admins invite by email (a single-use link
// is emailed); invitees appear here once they accept (register, or log in and accept). No local state.
function TeamDirectory({backendProjectId,isAdmin}:{backendProjectId:string;isAdmin:boolean;}) {
  const pid=Number(backendProjectId);
  const [members,setMembers]=useState<ProjectMemberView[]>([]);
  const [loading,setLoading]=useState(true);
  const [email,setEmail]=useState("");
  const [inviting,setInviting]=useState(false);
  const [removingId,setRemovingId]=useState<number|null>(null);
  const [status,setStatus]=useState<"idle"|"ok"|"err">("idle");
  const [msg,setMsg]=useState("");

  useEffect(()=>{
    let cancelled=false;
    getProject(pid)
      .then(p=>{ if(!cancelled) setMembers(p.members); })
      .catch(()=>{})
      .finally(()=>{ if(!cancelled) setLoading(false); });
    return ()=>{cancelled=true;};
  },[pid]);

  const invite=async()=>{
    const addr=email.trim();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)){ setStatus("err"); setMsg("Enter a valid email address"); return; }
    setInviting(true); setStatus("idle"); setMsg("");
    try{
      await inviteProjectMember(pid,addr);
      setStatus("ok"); setMsg(`Invitation sent to ${addr}. They'll appear here once they accept.`);
      setEmail("");
    }catch(e){ setStatus("err"); setMsg(e instanceof Error?e.message:"Invite failed"); }
    finally{ setInviting(false); }
  };

  const remove=async(userId:number)=>{
    setRemovingId(userId); setStatus("idle"); setMsg("");
    try{
      const p=await removeProjectMember(pid,userId);
      setMembers(p.members);
    }catch(e){ setStatus("err"); setMsg(e instanceof Error?e.message:"Remove failed"); }
    finally{ setRemovingId(null); }
  };

  const initials=(m:ProjectMemberView)=>(m.name??m.email??"?").split(" ").map(s=>s[0]).slice(0,2).join("").toUpperCase();

  return (
    <div>
      <div className="mb-5">
        <div className="text-base font-bold text-foreground">Team directory — {members.length} member{members.length===1?"":"s"}</div>
        <p className="text-sm text-muted-foreground mt-1">{isAdmin
          ? "Invite people by email. They join once they accept the emailed link — new users register, existing users log in and accept. The public survey form stays anonymous."
          : "People assigned to this project. Only admins can invite or remove members."}</p>
      </div>
      <div className="border border-border bg-card mb-4">
        {loading?(
          <div className="px-5 py-4 text-sm text-muted-foreground">Loading members…</div>
        ):members.length===0?(
          <div className="px-5 py-4 text-sm text-muted-foreground">{isAdmin?"No members yet. Invite someone below.":"No members yet."}</div>
        ):members.map(m=>(
          <div key={m.userId} className="flex items-center justify-between px-5 py-4 border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-primary/15 text-link flex items-center justify-center text-sm font-bold" style={{fontFamily:"var(--font-display)"}}>{initials(m)}</div>
              <div className="text-base font-semibold text-foreground">{m.name??"—"}</div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-base text-muted-foreground" style={{fontFamily:"var(--font-mono)"}}>{m.email}</span>
              {isAdmin&&(
                <button onClick={()=>remove(m.userId)} disabled={removingId===m.userId} title="Remove member"
                  className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40">
                  {removingId===m.userId?<RefreshCw size={15} className="animate-spin"/>:<X size={15}/>}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {isAdmin&&(
        <>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
            <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" type="email"
              onKeyDown={e=>{if(e.key==="Enter") invite();}}
              className="bg-card border border-border px-3 py-2 text-sm focus:border-primary"/>
            <button onClick={invite} disabled={inviting}
              className="flex items-center justify-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed">
              {inviting?<><RefreshCw size={14} className="animate-spin"/>Inviting…</>:<><Mail size={14}/>Invite</>}
            </button>
          </div>
          {status==="ok"&&<p className="text-sm text-health-good font-medium mt-3 flex items-center gap-1.5"><Check size={13}/>{msg}</p>}
          {status==="err"&&<p className="text-sm text-destructive font-medium mt-3 flex items-center gap-1.5"><AlertCircle size={13}/>{msg}</p>}
        </>
      )}
    </div>
  );
}

const NOTIFICATION_RULES = [
  {id:"score-drop",     label:"Health score drops below 60",            detail:"As soon as a sync produces the new score",  on:true},
  {id:"score-swing",    label:"Score moves more than 8 points in a week", detail:"Included in the weekly digest",           on:true},
  {id:"low-response",   label:"Survey response rate stays under 50%",    detail:"48 hours after the survey goes out",       on:false},
  {id:"review-due",     label:"An action is ready for its effectiveness review", detail:"Two weeks after the action is logged", on:true},
  {id:"survey-results", label:"Survey results finish scoring",           detail:"When the AI analysis completes",           on:true},
] as const;

type NotificationPrefs = Record<string, boolean>;

function prefsKey(projectId: string) {
  return `pulse.notifications.${projectId}`;
}

function readPrefs(projectId: string): NotificationPrefs {
  const defaults = Object.fromEntries(NOTIFICATION_RULES.map(r => [r.id, r.on]));
  try {
    const raw = localStorage.getItem(prefsKey(projectId));
    return raw ? { ...defaults, ...(JSON.parse(raw) as NotificationPrefs) } : defaults;
  } catch {
    return defaults;
  }
}

/**
 * Delivery isn't wired to a backend yet, so these choices live on this device. The
 * panel says so rather than implying alerts are already going out — the previous
 * version rendered a hardcoded list whose switches did nothing at all.
 */
function NotificationSettings({projectId}:{projectId:string}) {
  const [prefs,setPrefs]=useState<NotificationPrefs>(()=>readPrefs(projectId));
  useEffect(()=>{setPrefs(readPrefs(projectId));},[projectId]);
  const set=(id:string,next:boolean)=>{
    setPrefs(current=>{
      const updated={...current,[id]:next};
      try{localStorage.setItem(prefsKey(projectId),JSON.stringify(updated));}catch{/* storage blocked */}
      return updated;
    });
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground border border-border bg-muted/30 px-5 py-3">
        Choose what you want to hear about. These preferences are saved in this browser until alert delivery is connected.
      </p>
      {NOTIFICATION_RULES.map(rule=>(
        <div key={rule.id} className="bg-card border border-border px-5 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-base font-semibold text-foreground">{rule.label}</div>
            <div id={`${rule.id}-detail`} className="text-sm text-muted-foreground mt-0.5">{rule.detail}</div>
          </div>
          <Switch
            checked={prefs[rule.id] ?? rule.on}
            onChange={next=>set(rule.id,next)}
            label={rule.label}
            describedBy={`${rule.id}-detail`}/>
        </div>
      ))}
    </div>
  );
}

export function SettingsView({project}:{project:Project;}) {
  const [tab,setTab]=useState<"team"|"notifications"|"connectors">("team");
  const {user}=useWorkspace();
  const isAdmin=user?.role==="admin"; // connector + member management are admin-only (backend enforces 403)
  return (
    <PageShell>
        <PageHeader title="Settings" description={project.name}/>
        <div className="flex items-center border-b border-border mb-8">
          {(["team","notifications","connectors"] as const).map(t=>(
            <button key={t} onClick={()=>setTab(t)}
              className={`px-6 py-3 text-base font-semibold capitalize transition-colors -mb-px ${tab===t?"border-b-2 border-primary text-link":"text-muted-foreground hover:text-foreground"}`}
              style={{fontFamily:"var(--font-display)"}}>
              {t.charAt(0).toUpperCase()+t.slice(1)}
            </button>
          ))}
        </div>
        {tab==="team"&&(
          project.backendProjectId
            ? <TeamDirectory backendProjectId={project.backendProjectId} isAdmin={isAdmin}/>
            : <p className="text-sm text-muted-foreground">This project isn't linked to a backend project yet, so members can't be managed.</p>
        )}
        {tab==="notifications"&&<NotificationSettings projectId={project.id}/>}
        {tab==="connectors"&&(
          <div>
            <div className="mb-6">
              <div className="text-base font-bold text-foreground mb-1">Data Connectors</div>
              <p className="text-base text-muted-foreground leading-relaxed">
                Connect external tools to automatically populate metrics. Once connected, Pulse pulls data on each sync — no manual entry needed.
              </p>
            </div>
            <div className="space-y-3">
              {!isAdmin
                ? <p className="text-sm text-muted-foreground border border-border bg-card px-5 py-4">Only admins can view and manage data connectors.</p>
                : project.backendProjectId
                ? <>
                    {CONNECTORS.map(def=>{
                      const spec=REAL_SPECS[def.id];
                      return spec ? <RealConnectorCard key={def.id} def={def} backendProjectId={project.backendProjectId!} spec={spec}/> : null;
                    })}
                    <CicdConnectorCard backendProjectId={project.backendProjectId}/>
                  </>
                : <p className="text-sm text-muted-foreground">This project isn't linked to a backend project yet, so connectors can't be configured.</p>}
            </div>
          </div>
        )}
    </PageShell>
  );
}
