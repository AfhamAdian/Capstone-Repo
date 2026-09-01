import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { getSyncSessions, isSyncActive, subscribeSyncSessions, type SyncSessionSnapshot } from "../sync-session";
import { SyncProgressBanner } from "./SyncProgressBanner";

export function SyncProgressOverlay() {
  const [sessions, setSessions] = useState<SyncSessionSnapshot[]>(getSyncSessions);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  useEffect(() => subscribeSyncSessions(setSessions), []);

  useEffect(() => {
    const timers = sessions
      .filter((session) => !isSyncActive(session.status) && !dismissed.has(session.sessionId))
      .map((session) =>
        window.setTimeout(() => {
          setDismissed((current) => new Set(current).add(session.sessionId));
        }, 8000),
      );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [dismissed, sessions]);

  const visible = useMemo(() => {
    const sorted = sessions
      .filter((session) => session.statusDetail)
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    const active = sorted.filter((session) => isSyncActive(session.status) && !dismissed.has(session.sessionId));
    const latestFinished = sorted.find((session) => !isSyncActive(session.status));
    return [...active, ...(latestFinished && !dismissed.has(latestFinished.sessionId) ? [latestFinished] : [])].slice(0, 4);
  }, [dismissed, sessions]);

  if (visible.length === 0) return null;

  return (
    <aside
      className="pointer-events-none fixed right-5 top-[70px] z-[100] flex w-[min(28rem,calc(100vw-2.5rem))] flex-col gap-3"
      aria-label="Sync progress notifications"
    >
      {visible.map((session) => (
        <div key={session.sessionId} className="pointer-events-auto relative shadow-xl">
          <button
            type="button"
            onClick={() => setDismissed((current) => new Set(current).add(session.sessionId))}
            className="absolute right-2 top-2 z-10 p-1 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Dismiss sync notification"
          >
            <X size={14} />
          </button>
          <SyncProgressBanner snapshot={session} className="pr-9" />
        </div>
      ))}
    </aside>
  );
}
