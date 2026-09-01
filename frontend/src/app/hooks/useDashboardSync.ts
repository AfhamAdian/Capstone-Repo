import { useEffect, useState } from "react";
import {
  getSyncSession,
  isSyncActive,
  registerSyncCompletionHandler,
  resumeSyncIfNeeded,
  startProjectSync,
  subscribeSyncSession,
  type SyncCompleteHandler,
  type SyncSessionSnapshot,
  type SyncUiStatus,
} from "../sync-session";

interface SyncProject {
  id: string;
  backendProjectId?: string;
}

export function useDashboardSync(project: SyncProject, onSyncComplete: SyncCompleteHandler) {
  const [snapshot, setSnapshot] = useState<SyncSessionSnapshot | null>(() => getSyncSession(project.id));

  useEffect(() => {
    registerSyncCompletionHandler(project.id, onSyncComplete);
  }, [project.id, onSyncComplete]);

  useEffect(() => {
    resumeSyncIfNeeded(project);
    setSnapshot(getSyncSession(project.id));
    return subscribeSyncSession(project.id, setSnapshot);
    // project.backendProjectId is the only identity field resume needs besides id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, project.backendProjectId]);

  const status: SyncUiStatus = snapshot?.status ?? "idle";
  return {
    snapshot,
    status,
    statusDetail: snapshot?.statusDetail ?? null,
    active: isSyncActive(status),
    start: () => {
      void startProjectSync(project);
    },
  };
}
