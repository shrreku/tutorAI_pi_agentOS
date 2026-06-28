import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import type { SourceLearnerView } from "@studyagent/schemas";
import {
  notebookSourcesQueryKey,
  notebookSourcesQueryOptions,
  retrySourceIngestion,
} from "@studyagent/api-client";
import {
  applyWorkspaceRefreshInvalidations,
  resolveWorkspaceRefreshPolicy,
} from "../../../workspace-refresh-policy.js";
import { apiClient } from "../lib/api-client.js";
import { Badge, Button, Eyebrow, FolioErrorNotice } from "../primitives.js";

function sourceTone(source: SourceLearnerView): "accent" | "warning" | "danger" | "neutral" {
  if (source.readiness.tutoring.status === "failed") return "danger";
  if (!source.tutoringReady) return "warning";
  return "accent";
}

export function FolioSourcePanel({
  notebookId,
  onGraphProjectionUpdated,
}: {
  notebookId: string;
  onGraphProjectionUpdated: () => void;
}) {
  const queryClient = useQueryClient();
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const sourcesQuery = useQuery({
    ...notebookSourcesQueryOptions(apiClient.request, notebookId),
    enabled: Boolean(notebookId),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => apiClient.uploadNotebookSource(notebookId, file),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: notebookSourcesQueryKey(notebookId) });
      applyWorkspaceRefreshInvalidations({
        notebookId,
        policy: resolveWorkspaceRefreshPolicy("source.uploaded"),
        queryClient,
        onGraphProjectionUpdated,
      });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Upload failed");
    },
  });

  const retryMutation = useMutation({
    mutationFn: (sourceId: string) => retrySourceIngestion(apiClient.request, sourceId),
    onSuccess: async (_data, sourceId) => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: notebookSourcesQueryKey(notebookId) });
      await queryClient.invalidateQueries({ queryKey: ["source-ingestion-status", sourceId] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Retry failed");
    },
    onSettled: () => setRetryingId(null),
  });

  const sources = sourcesQuery.data ?? [];

  return (
    <section className="border-b border-border bg-card/40 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Eyebrow>Sources</Eyebrow>
        <div>
          <input
            ref={uploadInputRef}
            type="file"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) uploadMutation.mutate(file);
              event.target.value = "";
            }}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={uploadMutation.isPending}
            onClick={() => uploadInputRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            {uploadMutation.isPending ? "Uploading…" : "Upload source"}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="mt-2">
          <FolioErrorNotice title="Source action failed" message={error} />
        </div>
      ) : null}

      {sources.length > 0 ? (
        <ul className="mt-3 divide-y divide-border border-y border-border">
          {sources.map((source) => (
            <li key={source.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="min-w-0 flex-1 truncate font-display text-[14px]">{source.title}</span>
              <Badge tone={sourceTone(source)}>{source.learnerLabel}</Badge>
              {source.readiness.tutoring.status === "failed" ? (
                <Button
                  variant="ghost"
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
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[13px] text-muted-foreground">
          Upload a PDF, slide deck, or document to ground your tutor and study map.
        </p>
      )}
    </section>
  );
}
