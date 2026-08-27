import { useEffect, useState } from "react";
import { ShieldCheck, GitBranch, Check, ChevronDown, Link2, X, Plus, RefreshCw, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type { Project } from "../types";
import { useProjectSurveySettings } from "../hooks/useProjectSurveySettings";
import { getProject, updateProjectIntegration, previewWorkspaceRepos } from "../api";

interface ConnectorField { label:string; key:string; placeholder:string; type?:"text"|"password"; hint?:string; }
interface ConnectorDef { id:string; name:string; icon:React.ReactNode; color:string; description:string; fields:ConnectorField[]; docsUrl:string; }

const CONNECTORS:ConnectorDef[]=[
  {
    id:"jira", name:"Jira", color:"text-blue-600", docsUrl:"https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/",
    icon:<svg viewBox="0 0 32 32" width={20} height={20} fill="currentColor"><path d="M15.88 0C9.8 0 4.86 4.94 4.86 11.03c0 3.33 1.5 6.32 3.88 8.3L15.88 32l7.14-12.67c2.38-1.98 3.88-4.97 3.88-8.3C26.9 4.94 21.96 0 15.88 0zm0 15.57a4.54 4.54 0 1 1 0-9.08 4.54 4.54 0 0 1 0 9.08z"/></svg>,
    description:"Pull sprint velocity, ticket closure rate, and open blockers directly from your Jira board.",
    fields:[
      {label:"Jira URL",key:"url",placeholder:"https://yourorg.atlassian.net",hint:"Your Atlassian domain URL"},
      {label:"API Email",key:"email",placeholder:"you@company.com",hint:"The email associated with your Atlassian account"},
      {label:"API Token",key:"token",placeholder:"ATATT3xFf…",type:"password",hint:"Generate at id.atlassian.com → Security → API tokens"},
      {label:"Project Key",key:"projectKey",placeholder:"PROJ",hint:"The short key shown in your Jira board URL (e.g. PROJ for PROJ-123)"},
    ],
  },
  {
    id:"sonarqube", name:"SonarQube", color:"text-violet-600", docsUrl:"https://docs.sonarqube.org/latest/user-guide/user-account/generating-and-using-tokens/",
    icon:<ShieldCheck size={20}/>,
    description:"Track code quality score, code smells, coverage, and technical debt from SonarQube or SonarCloud.",
    fields:[
      {label:"Server URL",key:"url",placeholder:"https://sonarcloud.io  or  http://localhost:9000",hint:"SonarCloud or self-hosted SonarQube URL"},
      {label:"Auth Token",key:"token",placeholder:"squ_abc123…",type:"password",hint:"Generate in SonarQube → My Account → Security"},
      {label:"Project Key",key:"projectKey",placeholder:"my-org_my-project",hint:"Found in SonarQube → Project → Project Information"},
    ],
  },
  {
    id:"github", name:"GitHub", color:"text-foreground", docsUrl:"https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token",
    icon:<GitBranch size={20}/>,
    description:"Pull commit frequency, PR cycle time, and deployment frequency from your GitHub repository.",
    fields:[
      {label:"Personal Access Token",key:"token",placeholder:"ghp_abc123…",type:"password",hint:"Create at github.com → Settings → Developer settings → Personal access tokens. Scopes needed: repo"},
      {label:"Organization / Owner",key:"org",placeholder:"your-org",hint:"Your GitHub organization name or username"},
    ],
  },
];

function ConnectorCard({def}:{def:ConnectorDef}) {
  const [open,setOpen]=useState(false);
  const [vals,setVals]=useState<Record<string,string>>(Object.fromEntries(def.fields.map(f=>[f.key,""])));
  const [testing,setTesting]=useState(false);
  const [status,setStatus]=useState<"idle"|"ok"|"err">("idle");
  const connected=Object.values(vals).every(v=>v.trim().length>0);
  const test=()=>{setTesting(true);setTimeout(()=>{setTesting(false);setStatus(connected?"ok":"err");},1400);};
  return (
    <div className="border border-border bg-card">
      <button onClick={()=>setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors text-left">
        <div className="flex items-center gap-4">
          <span className={`shrink-0 ${def.color}`}>{def.icon}</span>
          <div>
            <div className="text-[15px] font-bold text-foreground" style={{fontFamily:"var(--font-display)"}}>{def.name}</div>
            <div className="text-sm text-muted-foreground mt-0.5">{def.description}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          {status==="ok"&&<span className="text-sm font-semibold text-emerald-500 flex items-center gap-1.5"><Check size={13}/>Connected</span>}
          {status==="err"&&<span className="text-sm font-semibold text-red-500">Connection failed</span>}
          {status==="idle"&&!connected&&<span className="text-sm text-muted-foreground">Not configured</span>}
          {status==="idle"&&connected&&<span className="text-sm font-medium text-amber-500">Configured — test it</span>}
          <ChevronDown size={15} className={`text-muted-foreground transition-transform ${open?"rotate-180":""}`}/>
        </div>
      </button>
      <AnimatePresence>
        {open&&(
          <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} transition={{duration:0.15}} className="overflow-hidden">
            <div className="border-t border-border px-5 py-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {def.fields.map(f=>(
                  <div key={f.key}>
                    <label className="block text-sm font-semibold text-foreground mb-1.5" style={{fontFamily:"var(--font-display)"}}>{f.label}</label>
                    <input
                      type={f.type||"text"}
                      value={vals[f.key]}
                      onChange={e=>setVals(prev=>({...prev,[f.key]:e.target.value}))}
                      placeholder={f.placeholder}
                      className="w-full bg-input-background border border-border px-3 py-2.5 text-[14px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors font-mono"
                    />
                    {f.hint&&<div className="text-xs text-muted-foreground mt-1 leading-relaxed">{f.hint}</div>}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <a href={def.docsUrl} target="_blank" rel="noreferrer"
                  className="text-sm text-primary flex items-center gap-1 hover:opacity-75 transition-opacity">
                  <Link2 size={12}/> View API docs
                </a>
                <div className="flex items-center gap-3">
                  {status==="ok"&&<span className="text-sm text-emerald-500 font-medium flex items-center gap-1"><Check size={13}/>Connection verified</span>}
                  {status==="err"&&<span className="text-sm text-red-500 font-medium">Check your credentials and try again</span>}
                  <button onClick={test} disabled={!Object.values(vals).some(v=>v.trim())||testing}
                    className="flex items-center gap-2 border border-border px-4 py-2 text-sm font-semibold text-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{fontFamily:"var(--font-display)"}}>
                    {testing?<><RefreshCw size={13} className="animate-spin"/>Testing…</>:<><Link2 size={13}/>Test Connection</>}
                  </button>
                  <button onClick={()=>{setStatus("idle");}}
                    className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity"
                    style={{fontFamily:"var(--font-display)"}}>
                    Save
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Real GitHub connector — loads the project's current owner/token state and persists updates.
function GithubConnectorCard({def,backendProjectId}:{def:ConnectorDef;backendProjectId:string;}) {
  const [open,setOpen]=useState(false);
  const [token,setToken]=useState("");
  const [org,setOrg]=useState("");
  const [tokenSet,setTokenSet]=useState(false);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [testing,setTesting]=useState(false);
  const [status,setStatus]=useState<"idle"|"ok"|"err">("idle");
  const [msg,setMsg]=useState("");

  useEffect(()=>{
    let cancelled=false;
    getProject(Number(backendProjectId))
      .then(p=>{
        if(cancelled) return;
        const gh=p.integrations.find(i=>i.category==="vcs" && i.toolName==="github");
        setOrg((gh?.config?.owner as string) ?? "");
        setTokenSet(Boolean(gh?.config?.token)); // config is redacted ('***') when a token is set
      })
      .catch(()=>{})
      .finally(()=>{ if(!cancelled) setLoading(false); });
    return ()=>{cancelled=true;};
  },[backendProjectId]);

  const configured=tokenSet && org.trim().length>0;

  const save=async()=>{
    if(!org.trim()){ setStatus("err"); setMsg("Organization / owner is required"); return; }
    setSaving(true); setStatus("idle"); setMsg("");
    try{
      const config:Record<string,string>={owner:org.trim()};
      if(token.trim()) config.token=token.trim();
      await updateProjectIntegration(Number(backendProjectId),"github",config);
      setStatus("ok"); setMsg("Saved"); setToken(""); setTokenSet(true);
    }catch(e){ setStatus("err"); setMsg(e instanceof Error?e.message:"Save failed"); }
    finally{ setSaving(false); }
  };

  const test=async()=>{
    if(!token.trim()){ setStatus("err"); setMsg("Enter a token to test the connection"); return; }
    setTesting(true); setStatus("idle"); setMsg("");
    try{
      await previewWorkspaceRepos({vcs:"github",organization:org.trim(),token:token.trim()});
      setStatus("ok"); setMsg("Connection verified");
    }catch(e){ setStatus("err"); setMsg(e instanceof Error?e.message:"Connection failed"); }
    finally{ setTesting(false); }
  };

  const inputClass="w-full bg-input-background border border-border px-3 py-2.5 text-[14px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors font-mono";

  return (
    <div className="border border-border bg-card">
      <button onClick={()=>setOpen(!open)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors text-left">
        <div className="flex items-center gap-4">
          <span className={`shrink-0 ${def.color}`}>{def.icon}</span>
          <div>
            <div className="text-[15px] font-bold text-foreground" style={{fontFamily:"var(--font-display)"}}>{def.name}</div>
            <div className="text-sm text-muted-foreground mt-0.5">{def.description}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          {configured
            ? <span className="text-sm font-semibold text-emerald-500 flex items-center gap-1.5"><Check size={13}/>Connected</span>
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
                      <label className="block text-sm font-semibold text-foreground mb-1.5" style={{fontFamily:"var(--font-display)"}}>Personal Access Token</label>
                      <input type="password" value={token} onChange={e=>setToken(e.target.value)}
                        placeholder={tokenSet?"•••••••• — leave blank to keep":"ghp_abc123…"} className={inputClass}/>
                      <div className="text-xs text-muted-foreground mt-1 leading-relaxed">Create at github.com → Settings → Developer settings → Personal access tokens. Scopes: repo</div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-foreground mb-1.5" style={{fontFamily:"var(--font-display)"}}>Organization / Owner</label>
                      <input value={org} onChange={e=>setOrg(e.target.value)} placeholder="your-org" className={inputClass}/>
                      <div className="text-xs text-muted-foreground mt-1 leading-relaxed">Your GitHub organization name or username</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border gap-3 flex-wrap">
                    <a href={def.docsUrl} target="_blank" rel="noreferrer" className="text-sm text-primary flex items-center gap-1 hover:opacity-75 transition-opacity">
                      <Link2 size={12}/> View API docs
                    </a>
                    <div className="flex items-center gap-3">
                      {status==="ok"&&<span className="text-sm text-emerald-500 font-medium flex items-center gap-1"><Check size={13}/>{msg}</span>}
                      {status==="err"&&<span className="text-sm text-red-500 font-medium flex items-center gap-1"><AlertCircle size={13}/>{msg}</span>}
                      <button onClick={test} disabled={testing||saving}
                        className="flex items-center gap-2 border border-border px-4 py-2 text-sm font-semibold text-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{fontFamily:"var(--font-display)"}}>
                        {testing?<><RefreshCw size={13} className="animate-spin"/>Testing…</>:<><Link2 size={13}/>Test Connection</>}
                      </button>
                      <button onClick={save} disabled={saving||testing}
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

export function SettingsView({project}:{project:Project;}) {
  const [tab,setTab]=useState<"team"|"questions"|"notifications"|"connectors">("team");
  const {settings,update}=useProjectSurveySettings(project.id);
  const [draftMember,setDraftMember]=useState({n:"",r:"",e:""});
  const team=settings.team;
  const qi=settings.guidance;
  const addMember=()=>{
    if(!draftMember.n.trim()||!draftMember.e.trim()) return;
    update(prev=>({...prev,team:[...prev.team,{n:draftMember.n.trim(),r:draftMember.r.trim()||"Team member",e:draftMember.e.trim()}]}));
    setDraftMember({n:"",r:"",e:""});
  };
  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-4xl mx-auto px-8 py-8">
        <h2 className="text-3xl font-bold uppercase tracking-wide mb-7" style={{fontFamily:"var(--font-display)"}}>Settings — {project.name}</h2>
        <div className="flex items-center border-b border-border mb-8">
          {(["team","questions","notifications","connectors"] as const).map(t=>(
            <button key={t} onClick={()=>setTab(t)}
              className={`px-6 py-3 text-[15px] font-semibold capitalize transition-colors -mb-px ${tab===t?"border-b-2 border-primary text-primary":"text-foreground/70 hover:text-foreground"}`}
              style={{fontFamily:"var(--font-display)"}}>
              {t==="questions"?"Question Guidance":t.charAt(0).toUpperCase()+t.slice(1)}
            </button>
          ))}
        </div>
        {tab==="team"&&(
          <div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="text-[15px] font-bold text-foreground">Team directory — {team.length} members</div>
                <p className="text-sm text-muted-foreground mt-1">This list is local notes only. Survey response rate (`1 of N`) uses how many `projectmember` rows have role DEVELOPER. The public form stays anonymous.</p>
              </div>
            </div>
            <div className="border border-border bg-card mb-4">
              {team.map((m,i)=>(
                <div key={`${m.e}-${i}`} className="flex items-center justify-between px-5 py-4 border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-primary/15 text-primary flex items-center justify-center text-sm font-bold" style={{fontFamily:"var(--font-display)"}}>{m.n.split(" ").map(n=>n[0]).join("")}</div>
                    <div><div className="text-[15px] font-semibold text-foreground">{m.n}</div><div className="text-sm text-muted-foreground">{m.r}</div></div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-[15px] text-muted-foreground" style={{fontFamily:"var(--font-mono)"}}>{m.e}</span>
                    <button onClick={()=>update(prev=>({...prev,team:prev.team.filter((_,idx)=>idx!==i)}))} className="text-muted-foreground hover:text-red-500 transition-colors"><X size={15}/></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2">
              <input value={draftMember.n} onChange={e=>setDraftMember(m=>({...m,n:e.target.value}))} placeholder="Name"
                className="bg-card border border-border px-3 py-2 text-sm outline-none focus:border-primary"/>
              <input value={draftMember.r} onChange={e=>setDraftMember(m=>({...m,r:e.target.value}))} placeholder="Role"
                className="bg-card border border-border px-3 py-2 text-sm outline-none focus:border-primary"/>
              <input value={draftMember.e} onChange={e=>setDraftMember(m=>({...m,e:e.target.value}))} placeholder="Email"
                className="bg-card border border-border px-3 py-2 text-sm outline-none focus:border-primary"/>
              <button onClick={addMember} className="flex items-center justify-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-90">
                <Plus size={14}/>Add
              </button>
            </div>
          </div>
        )}
        {tab==="questions"&&(
          <div>
            <div className="mb-6">
              <div className="text-[15px] font-bold text-foreground mb-1">Question Generation Instructions</div>
              <p className="text-[15px] text-muted-foreground leading-relaxed">These instructions are sent to Gemini when you generate a survey. Be specific about what topics, concerns, or dynamics you want surfaced.</p>
            </div>
            <div className="space-y-3">
              {qi.map((inst,idx)=>(
                <div key={inst.id} className="bg-card border border-border p-4 flex items-start gap-3">
                  <div className="shrink-0 w-7 h-7 flex items-center justify-center text-sm font-bold text-muted-foreground border border-border mt-2" style={{fontFamily:"var(--font-mono)"}}>{idx+1}</div>
                  <textarea value={inst.text} rows={2} placeholder="Describe what the AI should ask about…"
                    onChange={e=>update(prev=>({...prev,guidance:prev.guidance.map(i=>i.id===inst.id?{...i,text:e.target.value}:i)}))}
                    className="flex-1 bg-input-background border border-border px-4 py-3 text-[15px] placeholder:text-muted-foreground outline-none focus:border-primary resize-none transition-colors"/>
                  <button onClick={()=>update(prev=>({...prev,guidance:prev.guidance.filter(i=>i.id!==inst.id)}))} className="shrink-0 mt-3 text-muted-foreground hover:text-red-500 transition-colors"><X size={15}/></button>
                </div>
              ))}
            </div>
            <button onClick={()=>update(prev=>({...prev,guidance:[...prev.guidance,{id:`qi${Date.now()}`,text:""}]}))} className="mt-4 flex items-center gap-2 text-[15px] text-primary font-semibold hover:opacity-75 transition-opacity"><Plus size={15}/>Add instruction</button>
          </div>
        )}
        {tab==="notifications"&&(
          <div className="space-y-3">
            {[{l:"Health score drops below 60",s:"Immediate alert via email",on:true},{l:"Score change exceeds 8 points in 7 days",s:"Weekly digest email",on:true},{l:"Survey response rate below 50%",s:"Alert at 48h after send",on:false},{l:"Action effectiveness review due",s:"Reminder after 2 weeks",on:true},{l:"New survey results available",s:"In-app notification",on:true}].map((n,i)=>(
              <div key={i} className="bg-card border border-border px-5 py-4 flex items-center justify-between">
                <div><div className="text-[15px] font-semibold text-foreground">{n.l}</div><div className="text-sm text-muted-foreground mt-0.5">{n.s}</div></div>
                <div className={`w-12 h-6 relative cursor-pointer border transition-colors ${n.on?"bg-primary border-primary":"bg-muted border-border"}`}>
                  <div className={`absolute top-0.5 w-5 h-5 bg-white transition-transform ${n.on?"translate-x-6":"translate-x-0.5"}`}/>
                </div>
              </div>
            ))}
          </div>
        )}
        {tab==="connectors"&&(
          <div>
            <div className="mb-6">
              <div className="text-[15px] font-bold text-foreground mb-1">Data Connectors</div>
              <p className="text-[15px] text-muted-foreground leading-relaxed">
                Connect external tools to automatically populate metrics. Once connected, Pulse pulls data on each sync — no manual entry needed.
              </p>
            </div>
            <div className="space-y-3">
              {CONNECTORS.map(def=>(
                def.id==="github" && project.backendProjectId
                  ? <GithubConnectorCard key={def.id} def={def} backendProjectId={project.backendProjectId}/>
                  : <ConnectorCard key={def.id} def={def}/>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
