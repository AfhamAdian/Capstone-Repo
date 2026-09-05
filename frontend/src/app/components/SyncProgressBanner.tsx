import { AlertTriangle, Check, Clock3, RefreshCw, X } from "lucide-react";
import { isSyncActive, type SyncSessionSnapshot, type SyncToolUiStatus } from "../sync-session";

const STATUS_TEXT: Record<SyncToolUiStatus, string> = {
  queued: "Waiting",
  syncing: "Fetching",
  completed: "Done",
  failed: "Failed",
};

function ToolStatusIcon({ status }: { status: SyncToolUiStatus }) {
  if (status === "completed") return <Check size={13} className="text-health-good" />;
  if (status === "failed") return <X size={13} className="text-destructive" />;
  if (status === "syncing") return <RefreshCw size={13} className="animate-spin text-link" />;
  return <Clock3 size={13} className="text-muted-foreground" />;
}

export function SyncProgressBanner({ snapshot, className = "" }: { snapshot: SyncSessionSnapshot | null; className?: string }) {
  if (!snapshot?.statusDetail) return null;

  const active = isSyncActive(snapshot.status);
  const tone =
    snapshot.status === "failed"
      ? "border-destructive/40"
      : snapshot.status === "partial"
        ? "border-attention-border"
        : snapshot.status === "success"
          ? "border-health-good/40"
          : "border-primary/40";

  return (
    <div className={`mr-auto w-full max-w-md border bg-card px-4 py-3 ${tone} ${className}`} role="status" aria-live="polite" aria-atomic="false">
      <div className="flex items-start gap-2.5">
        {snapshot.status === "failed" ? (
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-destructive" />
        ) : snapshot.status === "success" ? (
          <Check size={15} className="mt-0.5 shrink-0 text-health-good" />
        ) : (
          <RefreshCw size={15} className={`mt-0.5 shrink-0 text-link ${active ? "animate-spin" : ""}`} />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
            {active ? "Sync in progress" : snapshot.status === "partial" ? "Sync finished with warnings" : snapshot.status === "success" ? "Sync complete" : "Sync update"}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{snapshot.statusDetail}</p>
        </div>
      </div>

      {snapshot.tools.length > 0 && (
        <div className="mt-3 flex flex-col items-stretch gap-2">
          {snapshot.tools.map((item) => (
            <div
              key={item.tool}
              title={item.error}
              className={`flex w-full items-center gap-2 border bg-background px-2.5 py-2 text-sm ${
                item.status === "failed" ? "border-destructive/40" : item.status === "completed" ? "border-health-good/40" : item.status === "syncing" ? "border-primary/30" : "border-border"
              }`}
            >
              <ToolStatusIcon status={item.status} />
              <span className="font-medium text-foreground">{item.label}</span>
              <span className="ml-auto text-xs text-muted-foreground">{STATUS_TEXT[item.status]}</span>
            </div>
          ))}
          {snapshot.status === "calculating-risk" && (
            <div className="flex w-full items-center gap-2 border border-primary/30 bg-background px-2.5 py-2 text-sm">
              <RefreshCw size={13} className="animate-spin text-link" />
              <span className="font-medium text-foreground">Health score</span>
              <span className="ml-auto text-xs text-muted-foreground">Calculating</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
