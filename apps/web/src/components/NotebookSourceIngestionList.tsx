import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { IngestionStatusBadge } from "./IngestionStatusBadge.js";
import {
  fetchSourceIngestionStatus,
  retrySourceIngestion,
  type IngestionStatusView,
} from "../routing/api.js";
import { notebookSourcesQueryKey } from "../notebook-queries.js";
import { Badge, Button, Eyebrow } from "../ui/primitives.js";

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
    <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
      <div className="border-b border-border pb-2">
        <Eyebrow>Sources</Eyebrow>
      </div>
      <ul className="mt-3 divide-y divide-border">
        {sources.map((source, index) => {
          const status = statusQueries[index]?.data as IngestionStatusView | undefined;
          const statusLoading = statusQueries[index]?.isLoading;
          return (
            <li
              key={source.id}
              className="flex items-center justify-between gap-3 py-2.5 first:pt-0"
            >
              <span className="min-w-0 truncate font-display text-[14px] font-medium text-foreground">
                {source.title}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {statusLoading || !status ? (
                  <Badge tone="neutral">Checking…</Badge>
                ) : (
                  <IngestionStatusBadge status={status} />
                )}
                {status?.retryNeeded ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={retryingId === source.id}
                    onClick={() => {
                      setRetryingId(source.id);
                      retryMutation.mutate(source.id);
                    }}
                  >
                    {retryingId === source.id ? "Retrying…" : "Retry"}
                  </Button>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
      {error && (
        <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
