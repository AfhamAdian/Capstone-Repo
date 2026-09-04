import { AlertTriangle, RefreshCw } from "lucide-react";
import type { SyncRiskKey } from "../api";
import { useDashboardSync } from "../hooks/useDashboardSync";

interface DashboardSyncBarProject {
  id: string;
  backendProjectId?: string;
}

export function DashboardSyncBar({
  project,
  onSyncComplete,
}: {
  project: DashboardSyncBarProject;
  onSyncComplete: (projectId: string, riskScore?: number, riskScores?: Partial<Record<SyncRiskKey, number | null>>) => void;
}) {
  const backendProjectId = project.backendProjectId;
  const { active, start } = useDashboardSync(project, onSyncComplete);

  return (
    <div className="mb-2">
      <div className="flex items-center justify-between">
        <div className="text-base font-bold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
          Live Sync
        </div>
        <button
          onClick={start}
          disabled={active || !backendProjectId}
          title={backendProjectId ? "Sync data" : "This project isn't linked to a backend project yet"}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 border text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            active ? "border-primary text-link bg-primary/5" : "border-border text-muted-foreground hover:border-primary hover:text-link hover:bg-primary/5"
          }`}
        >
          <RefreshCw size={13} className={active ? "animate-spin" : ""} />
          <span style={{ fontFamily: "var(--font-display)" }}>{active ? "Syncing…" : "Sync"}</span>
        </button>
      </div>
      {!backendProjectId && (
        <div className="mt-2 px-4 py-2.5 text-sm border border-border bg-muted/40 text-muted-foreground flex items-center gap-2">
          <AlertTriangle size={14} className="shrink-0" />
          <span>This project isn't linked to a backend project, so it can't be synced yet.</span>
        </div>
      )}
    </div>
  );
}
