import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, RefreshCw } from "lucide-react";
import { startSync, subscribeToProgress, type SyncTool } from "../api";

interface DashboardSyncBarProject {
  id: string;
}

type SyncStatus = "idle" | "queued" | "syncing" | "calculating-risk" | "success" | "partial" | "failed";

const TOOL_LABELS: Record<SyncTool, string> = { github: "GitHub", jira: "Jira" };

function isActiveStatus(status: SyncStatus) {
  return status === "queued" || status === "syncing" || status === "calculating-risk";
}

export function DashboardSyncBar({ project }: { project: DashboardSyncBarProject }) {
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  const handleSync = async () => {
    if (isActiveStatus(status)) return;

    cleanupRef.current?.();
    cleanupRef.current = null;

    const sessionId = `session_${project.id}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    setStatus("queued");
    setStatusDetail("Sync job queued. Waiting for connector updates.");

    try {
      await startSync(project.id, ["github", "jira"], sessionId);
    } catch (e) {
      setStatus("failed");
      setStatusDetail(`Failed to start sync: ${e instanceof Error ? e.message : "Unknown error"}`);
      return;
    }

    cleanupRef.current = subscribeToProgress(sessionId, {
      onProgress: (event) => {
        if (event.status === "failed") {
          setStatus("failed");
          setStatusDetail(
            event.tool === "risk"
              ? `Risk calculation failed: ${event.error ?? "Unknown error"}`
              : `${TOOL_LABELS[event.tool as SyncTool] ?? event.tool} connector failed: ${event.error ?? "Unknown error"}`,
          );
          cleanupRef.current?.();
          return;
        }
        if (event.tool === "risk") {
          setStatus("calculating-risk");
          setStatusDetail("Connector data fetched. Calculating the latest risk scores.");
          return;
        }
        const toolLabel = TOOL_LABELS[event.tool as SyncTool] ?? event.tool;
        if (event.status === "syncing") {
          setStatus("syncing");
          setStatusDetail(`${toolLabel} connector is fetching data.`);
        } else if (event.status === "completed") {
          setStatusDetail(`${toolLabel} data fetched successfully.`);
        } else {
          setStatus("queued");
          setStatusDetail("Sync job queued. Waiting for connector updates.");
        }
      },
      onCompletion: (event) => {
        setStatus(event.status);
        if (event.status === "success") {
          setStatusDetail(
            event.riskScore != null ? `Sync completed. Latest risk score: ${event.riskScore}.` : "Sync completed.",
          );
        } else if (event.status === "partial") {
          setStatusDetail(
            `Sync completed with warnings — ${event.toolsCompleted.length} connector(s) synced, ${event.toolsFailed.length} failed.`,
          );
        } else {
          setStatusDetail(`Sync failed: ${event.error ?? "Unknown error"}`);
        }
        cleanupRef.current?.();
      },
      onError: (err) => {
        setStatus("failed");
        setStatusDetail(err.message || "Connection lost — the live sync stream disconnected before completion.");
        cleanupRef.current?.();
      },
    });
  };

  const active = isActiveStatus(status);

  return (
    <div className="mb-2">
      <div className="flex items-center justify-between">
        <div className="text-base font-bold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
          Live Sync
        </div>
        <button
          onClick={handleSync}
          disabled={active}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 border text-sm font-medium transition-colors disabled:cursor-not-allowed ${
            active ? "border-primary text-primary bg-primary/5" : "border-border text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5"
          }`}
          title="Sync data"
        >
          <RefreshCw size={13} className={active ? "animate-spin" : ""} />
          <span style={{ fontFamily: "var(--font-display)" }}>{active ? "Syncing…" : "Sync"}</span>
        </button>
      </div>
      {statusDetail && (
        <div
          className={`mt-2 px-4 py-2.5 text-sm border flex items-center gap-2 ${
            status === "failed"
              ? "border-red-500/30 bg-red-500/5 text-red-500"
              : status === "success"
                ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-500"
                : status === "partial"
                  ? "border-amber-500/30 bg-amber-500/5 text-amber-500"
                  : "border-border bg-muted/40 text-muted-foreground"
          }`}
        >
          {status === "failed" && <AlertTriangle size={14} className="shrink-0" />}
          {status === "success" && <Check size={14} className="shrink-0" />}
          <span>{statusDetail}</span>
        </div>
      )}
    </div>
  );
}
