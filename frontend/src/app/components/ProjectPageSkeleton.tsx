import { BarChart2, Zap, MessageSquare, Settings, Plus, RefreshCw } from "lucide-react";
import { SectionHeading, CardHeading } from "./PageShell";

function PulseBar({className}:{className:string}) {
  return <div className={`bg-muted animate-pulse ${className}`}/>;
}

/**
 * Placeholder for a project page. Every measure, grid and heading here mirrors
 * Dashboard.tsx — if the two drift, the page visibly jumps when the data lands.
 */
export function ProjectPageSkeleton() {
  const nav=[{icon:<BarChart2 size={16}/>,label:"Dashboard",active:true},{icon:<Zap size={16}/>,label:"Actions"},{icon:<MessageSquare size={16}/>,label:"Surveys"},{icon:<Settings size={16}/>,label:"Settings"}];
  const cats=["Code Quality","CI/CD","Team Health","Engineering Process","Planning & Execution"];
  const metrics=["Commits","Tickets Closed","Sprint Velocity","Open Blockers","Deployments / wk","PR Cycle Time"];
  return (
    <div className="flex flex-col lg:flex-row flex-1 min-h-0">
      <aside aria-hidden="true" className="shrink-0 bg-sidebar border-b lg:border-b-0 lg:border-r border-sidebar-border flex flex-col lg:w-56 lg:h-full">
        <div className="flex-1 flex lg:flex-col overflow-x-auto lg:overflow-x-visible lg:py-3">
          {nav.map(item=>(
            <div key={item.label}
              className={`flex items-center gap-3 px-4 py-3 text-base lg:w-full ${item.active?"bg-sidebar-accent text-foreground font-semibold":"text-muted-foreground"}`}
              style={item.active?{boxShadow:"inset 3px 0 0 0 var(--primary)"}:undefined}>
              <span className={item.active?"text-link":"text-muted-foreground"}>{item.icon}</span>
              <span style={{fontFamily:"var(--font-display)"}} className="font-medium">{item.label}</span>
            </div>
          ))}
        </div>
        <div className="hidden lg:block p-4 border-t border-sidebar-border">
          <div className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground text-base font-semibold py-2.5" style={{fontFamily:"var(--font-display)"}}>
            <Plus size={14}/> Log action
          </div>
        </div>
      </aside>
      <div className="flex-1 overflow-y-auto bg-background">
        <div className="page-measure max-sm:px-4 py-8 max-sm:py-6 space-y-8">
          <div className="flex items-center justify-between gap-3">
            <CardHeading>Live sync</CardHeading>
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border text-sm font-medium text-muted-foreground">
              <RefreshCw size={13} className="animate-spin"/>
              <span style={{fontFamily:"var(--font-display)"}}>Loading…</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[290px_1fr] gap-6">
            <div className="bg-card border border-border p-6">
              <CardHeading className="mb-4">Health score</CardHeading>
              <PulseBar className="h-20 w-28 mb-5"/>
              <PulseBar className="h-12 w-full mb-5"/>
              <div className="pt-5 border-t border-border space-y-3">
                {cats.map(label=>(
                  <div key={label} className="flex items-center justify-between gap-3 px-1 py-0.5">
                    <span className="text-sm text-foreground truncate">{label}</span>
                    <PulseBar className="h-2 w-20 shrink-0"/>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-card border border-border p-6">
              <CardHeading className="mb-4">Category balance</CardHeading>
              <div className="h-[240px] flex items-center justify-center">
                <div className="w-48 h-48 rounded-full border-2 border-dashed border-border bg-muted/40 animate-pulse"/>
              </div>
            </div>
          </div>

          <section>
            <SectionHeading>Score breakdown, last 90 days</SectionHeading>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
              {cats.map(label=>(
                <div key={label} className="bg-card border border-border p-4 flex flex-col">
                  <div className="text-xs font-semibold text-foreground mb-3 leading-tight" style={{fontFamily:"var(--font-display)"}}>{label}</div>
                  <PulseBar className="h-9 w-14 mb-2"/>
                  <PulseBar className="h-[60px] w-full"/>
                </div>
              ))}
            </div>
          </section>

          <section>
            <SectionHeading>Delivery metrics</SectionHeading>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {metrics.map(label=>(
                <div key={label} className="bg-card border border-border p-4">
                  <div className="text-sm font-semibold text-foreground mb-2" style={{fontFamily:"var(--font-display)"}}>{label}</div>
                  <PulseBar className="h-9 w-16 mb-2"/>
                  <PulseBar className="h-[52px] w-full"/>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
