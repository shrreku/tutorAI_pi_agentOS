import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { IngestionStatusBadge } from "./IngestionStatusBadge.js";
import {
  fetchSourceIngestionStatus,
  retrySourceIngestion,
  type IngestionStatusView,
} from "../routing/api.js";
import { notebookSourcesQueryKey } from "../notebook-queries.js";

type SourceRow = {
  id: string;
  title: string;
};

export function NotebookSourceIngestionList({
  notebookId,
  sources,
}: {
  notebookId: string;
  sources: SourceRow[];
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const statusQueries = useQueries({
    queries: sources.map((source) => ({
      queryKey: ["source-ingestion-status", source.id],
      queryFn: () => fetchSourceIngestionStatus(source.id),
      enabled: Boolean(source.id),
    })),
  });

  const retryMutation = useMutation({
    mutationFn: retrySourceIngestion,
    onSuccess: async (_data, sourceId) => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["source-ingestion-status", sourceId] });
      await queryClient.invalidateQueries({ queryKey: notebookSourcesQueryKey(notebookId) });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Retry failed");
    },
    onSettled: () => {
      setRetryingId(null);
    },
  });

  if (!sources.length) {
    return null;
  }

  return (
    <div className="study-sources-panel">
      <h2 className="study-sources-title">Sources</h2>
      <ul className="study-sources-list">
        {sources.map((source, index) => {
          const status = statusQueries[index]?.data as IngestionStatusView | undefined;
          const statusLoading = statusQueries[index]?.isLoading;
          return (
            <li key={source.id} className="study-source-item">
              <span className="study-source-name">{source.title}</span>
              <span className="study-source-status">
                {statusLoading || !status ? (
                  <span className="tb-ingestion-badge" data-tone="neutral">
                    Checking…
                  </span>
                ) : (
                  <IngestionStatusBadge status={status} />
                )}
              </span>
              {status?.retryNeeded ? (
                <button
                  type="button"
                  className="study-secondary-button"
                  disabled={retryingId === source.id}
                  onClick={() => {
                    setRetryingId(source.id);
                    retryMutation.mutate(source.id);
                  }}
                >
                  {retryingId === source.id ? "Retrying…" : "Retry"}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {error && <pre className="study-error">{error}</pre>}
    </div>
  );
}
