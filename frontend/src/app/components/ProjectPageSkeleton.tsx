import { BarChart2, Zap, MessageSquare, Settings, Plus, RefreshCw } from "lucide-react";

function PulseBar({className}:{className:string}) {
  return <div className={`bg-muted animate-pulse ${className}`}/>;
}

export function ProjectPageSkeleton() {
  const nav=[{icon:<BarChart2 size={16}/>,label:"Dashboard",active:true},{icon:<Zap size={16}/>,label:"Actions"},{icon:<MessageSquare size={16}/>,label:"Surveys"},{icon:<Settings size={16}/>,label:"Settings"}];
  const cats=["Delivery","Code Quality","CI/CD","Team Health","Blockers"];
  const metrics=["Commits","Tickets Closed","Sprint Velocity","Open Blockers","Deployments / wk","PR Cycle Time"];
  return (
    <div className="flex flex-1 min-h-0">
      <aside className="w-56 shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col h-full">
        <div className="flex-1 py-3 overflow-y-auto">
          {nav.map(item=>(
            <div key={item.label}
              className={`w-full flex items-center gap-3 px-4 py-3 text-[15px] ${item.active?"bg-sidebar-accent text-foreground font-semibold":"text-foreground/70"}`}
              style={item.active?{borderLeft:"3px solid var(--primary)"}:{borderLeft:"3px solid transparent"}}>
              <span className={item.active?"text-primary":"text-foreground/50"}>{item.icon}</span>
              <span style={{fontFamily:"var(--font-display)"}} className="font-medium">{item.label}</span>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-sidebar-border">
          <div className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground text-[15px] font-semibold py-2.5" style={{fontFamily:"var(--font-display)"}}>
            <Plus size={14}/> Log Action
          </div>
        </div>
      </aside>
      <div className="flex-1 overflow-y-auto bg-background">
        <div className="max-w-5xl mx-auto px-8 py-8 space-y-8">
          <div className="mb-2">
            <div className="flex items-center justify-between">
              <div className="text-base font-bold text-foreground" style={{fontFamily:"var(--font-display)"}}>Live Sync</div>
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border text-sm font-medium text-muted-foreground">
                <RefreshCw size={13} className="animate-spin"/>
                <span style={{fontFamily:"var(--font-display)"}}>Loading…</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-[290px_1fr] gap-6">
            <div className="bg-card border border-border p-6">
              <div className="text-base font-bold text-foreground mb-4" style={{fontFamily:"var(--font-display)"}}>Health Score</div>
              <PulseBar className="h-20 w-28 mb-5"/>
              <PulseBar className="h-12 w-full mb-5"/>
              <div className="pt-5 border-t border-border space-y-3">
                {cats.map(label=>(
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-[15px] text-foreground/80">{label}</span>
                    <PulseBar className="h-2 w-20"/>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-card border border-border p-6">
              <div className="text-base font-bold text-foreground mb-4" style={{fontFamily:"var(--font-display)"}}>Category Balance</div>
              <div className="h-[240px] flex items-center justify-center">
                <div className="w-48 h-48 rounded-full border-2 border-dashed border-border bg-muted/40 animate-pulse"/>
              </div>
            </div>
          </div>

          <div>
            <div className="text-base font-bold text-foreground mb-4" style={{fontFamily:"var(--font-display)"}}>Health Score Breakdown — 90-day trend</div>
            <div className="grid grid-cols-5 gap-3">
              {cats.map(label=>(
                <div key={label} className="bg-card border border-border p-4 flex flex-col">
                  <div className="text-xs font-semibold text-foreground mb-3" style={{fontFamily:"var(--font-display)"}}>{label}</div>
                  <PulseBar className="h-9 w-14 mb-2"/>
                  <PulseBar className="h-[60px] w-full"/>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-base font-bold text-foreground mb-4" style={{fontFamily:"var(--font-display)"}}>Metrics — click any card to expand</div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {metrics.map(label=>(
                <div key={label} className="bg-card border border-border p-4">
                  <div className="text-sm font-semibold text-foreground mb-2" style={{fontFamily:"var(--font-display)"}}>{label}</div>
                  <PulseBar className="h-9 w-16 mb-2"/>
                  <PulseBar className="h-[52px] w-full"/>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
