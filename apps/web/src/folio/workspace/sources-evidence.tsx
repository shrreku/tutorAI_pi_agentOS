import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  nodeEvidenceQueryOptions,
  notebookSourcesQueryOptions,
  retrySourceIngestion,
  uploadNotebookSource,
} from "@studyagent/api-client";
import type { SourceLearnerView } from "@studyagent/schemas";
import { BookOpen, ChevronDown, Upload } from "lucide-react";
import { apiClient } from "../../platform/api-client.js";
import { cn } from "../lib/utils.js";
import { Badge, Button, Dot } from "../ui/primitives.js";

function readinessTone(source: SourceLearnerView): "success" | "warning" | "neutral" {
  if (source.readiness.tutoring.status === "failed") return "warning";
  if (source.tutoringReady) return "success";
  return "neutral";
}

export function FolioSourceStrip({ notebookId, title }: { notebookId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const sourcesQuery = useQuery(notebookSourcesQueryOptions(apiClient.request, notebookId));

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadNotebookSource(apiClient.request, notebookId, file),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: notebookSourcesQueryOptions(apiClient.request, notebookId).queryKey,
      });
    },
  });

  const retryMutation = useMutation({
    mutationFn: (sourceId: string) => retrySourceIngestion(apiClient.request, sourceId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: notebookSourcesQueryOptions(apiClient.request, notebookId).queryKey,
      });
    },
  });

  const sources = sourcesQuery.data ?? [];
  const ready = sources.filter((s) => s.tutoringReady).length;
  const total = sources.length;
  const allReady = total > 0 && ready === total;

  return (
    <div className="border-b border-border bg-surface/50">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-2 text-left text-[12px] text-muted-foreground hover:bg-muted/50"
        onClick={() => setOpen((v) => !v)}
      >
        <Upload className="h-3.5 w-3.5" />
        <span className="inline-flex items-center gap-1.5">
          <Dot tone={allReady ? "success" : total === 0 ? "neutral" : "warning"} />
          {total > 0 ? `${ready} / ${total} sources ready` : "No sources yet"} · {title}
        </span>
        <ChevronDown className={cn("ml-auto h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="border-t border-border px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={uploadMutation.isPending}
              onClick={() => fileRef.current?.click()}
            >
              {uploadMutation.isPending ? "Uploading…" : "Upload source"}
            </Button>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadMutation.mutate(file);
                e.target.value = "";
              }}
            />
          </div>
          {uploadMutation.isError ? (
            <p className="mt-2 text-[12px] text-destructive">
              {uploadMutation.error instanceof Error
                ? uploadMutation.error.message
                : "Upload failed"}
            </p>
          ) : null}
          <ul className="mt-3 space-y-2">
            {sources.map((source) => (
              <li
                key={source.id}
                className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-border bg-card px-3 py-2"
              >
                <span className="min-w-0 truncate text-[13px]">{source.title}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <Badge tone={readinessTone(source)}>{source.learnerLabel}</Badge>
                  {source.readiness.tutoring.status === "failed" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={retryMutation.isPending}
                      onClick={() => void retryMutation.mutate(source.id)}
                    >
                      Retry
                    </Button>
                  ) : null}
                </span>
              </li>
            ))}
            {!sources.length && !sourcesQuery.isLoading ? (
              <li className="text-[12px] text-muted-foreground">Upload a PDF or document to begin.</li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function FolioEvidenceDrawer({
  notebookId,
  nodeId,
  open,
  onClose,
}: {
  notebookId: string;
  nodeId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const evidenceQuery = useQuery({
    ...nodeEvidenceQueryOptions(apiClient.request, notebookId, nodeId ?? ""),
    enabled: open && Boolean(nodeId),
  });

  if (!open) return null;

  const refs = evidenceQuery.data?.learnerRefs ?? [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-[1px]">
      <button type="button" className="flex-1" aria-label="Close evidence" onClick={onClose} />
      <aside className="flex h-full w-full max-w-md flex-col border-l border-border bg-elevated shadow-pop">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Evidence
            </p>
            <h2 className="font-display text-[18px] font-semibold">
              {nodeId ? "Selected concept" : "Pick a node"}
            </h2>
          </div>
          <button
            type="button"
            className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-muted"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {evidenceQuery.isLoading ? (
            <p className="text-[13px] text-muted-foreground">Loading evidence…</p>
          ) : null}
          {evidenceQuery.isError ? (
            <p className="text-[13px] text-destructive">Could not load evidence for this node.</p>
          ) : null}
          {!refs.length && !evidenceQuery.isLoading ? (
            <div className="rounded-[var(--radius)] border border-border bg-card p-3">
              <div className="flex items-center gap-2">
                <BookOpen className="h-3.5 w-3.5 text-accent" />
                <span className="font-display text-[14px] font-medium">No excerpts yet</span>
              </div>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
                Select a node on the Study Map that has source-backed claims.
              </p>
            </div>
          ) : null}
          {refs.map((ref) => (
            <article key={ref.id} className="rounded-[var(--radius)] border border-border bg-card p-3">
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {ref.label}
              </div>
              <p className="mt-2 text-[13.5px] leading-relaxed">{ref.text}</p>
              {ref.sourceTitle ? (
                <p className="mt-2 text-[12px] text-muted-foreground">Source: {ref.sourceTitle}</p>
              ) : null}
            </article>
          ))}
        </div>
      </aside>
    </div>
  );
}
