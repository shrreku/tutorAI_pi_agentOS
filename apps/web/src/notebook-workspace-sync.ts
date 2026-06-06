import { useEffect, useRef } from "react";
import type { QueryClient } from "@tanstack/react-query";
import {
  WORKSPACE_REFRESH_EVENT_TYPES,
  applyWorkspaceRefreshInvalidations,
  resolveWorkspaceRefreshPolicy,
  type WorkspaceRefreshHint,
} from "./workspace-refresh-policy.js";

export function useNotebookWorkspaceSync(input: {
  notebookId: string | null;
  queryClient: QueryClient;
  onGraphProjectionUpdated: () => void;
}): void {
  const lastSeenSequenceRef = useRef(0);

  useEffect(() => {
    if (!input.notebookId) return;

    let es: EventSource | null = null;
    lastSeenSequenceRef.current = 0;

    const handleNotebookEvent = (ev: Event): WorkspaceRefreshHint | undefined => {
      const rawData = (ev as MessageEvent).data;
      let sequenceNo: number | undefined;
      let refreshHint: WorkspaceRefreshHint | undefined;

      try {
        const parsed = JSON.parse(rawData) as { sequenceNo?: unknown; refreshHint?: WorkspaceRefreshHint };
        sequenceNo = typeof parsed.sequenceNo === "number" ? parsed.sequenceNo : undefined;
        refreshHint = parsed.refreshHint;
      } catch {
        sequenceNo = undefined;
        refreshHint = undefined;
      }

      if (sequenceNo !== undefined) {
        if (sequenceNo <= lastSeenSequenceRef.current) {
          return undefined;
        }
        lastSeenSequenceRef.current = sequenceNo;
      }

      return refreshHint;
    };

    try {
      es = new EventSource(
        `/api/v1/notebooks/${encodeURIComponent(input.notebookId)}/events/stream?after=0`,
      );
      const applyRefreshPolicy = (eventType: string, ev: Event) => {
        const hint = handleNotebookEvent(ev);
        const policy = resolveWorkspaceRefreshPolicy(eventType, hint);
        if (policy.targets.length === 0) return;
        applyWorkspaceRefreshInvalidations({
          notebookId: input.notebookId!,
          policy,
          queryClient: input.queryClient,
          onGraphProjectionUpdated: input.onGraphProjectionUpdated,
        });
      };
      for (const eventType of WORKSPACE_REFRESH_EVENT_TYPES) {
        es.addEventListener(eventType, (ev) => {
          applyRefreshPolicy(eventType, ev);
        });
      }
    } catch {
      // EventSource unavailable in this environment.
    }

    return () => es?.close();
  }, [input.notebookId, input.onGraphProjectionUpdated, input.queryClient]);
}
