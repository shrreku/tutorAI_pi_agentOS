import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { nodeEvidenceQueryOptions } from "@studyagent/api-client";
import { learnerFacingNodeTypeLabel } from "@studyagent/schemas";
import { apiClient } from "../lib/api-client.js";
import { Eyebrow, FolioErrorNotice, FolioSkeleton } from "../primitives.js";

function isLearnerChunk(ref: { kind: string; visibility: string }) {
  return ref.kind === "chunk" && ref.visibility === "learner";
}

function isLearnerClaim(ref: {
  kind: string;
  visibility: string;
  statementKind?: string | undefined;
}) {
  return (
    ref.kind === "claim" &&
    ref.visibility === "learner" &&
    (ref.statementKind === undefined || ref.statementKind === "source_backed")
  );
}

export function FolioEvidenceDrawer({
  open,
  notebookId,
  nodeId,
  nodeTitle,
  nodeType,
  onClose,
}: {
  open: boolean;
  notebookId: string;
  nodeId: string | null;
  nodeTitle: string | null;
  nodeType: string | null;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const evidenceQuery = useQuery({
    ...nodeEvidenceQueryOptions(apiClient.request, notebookId, nodeId ?? ""),
    enabled: open && Boolean(notebookId && nodeId),
  });

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !nodeId) return null;

  const evidence = evidenceQuery.data;
  const learnerRefs = evidence?.learnerRefs.filter((ref) => isLearnerChunk(ref) || isLearnerClaim(ref)) ?? [];

  return (
    <>
      <button
        type="button"
        className="folio-evidence-backdrop"
        aria-label="Close evidence drawer"
        onClick={onClose}
      />
      <aside
        className="folio-evidence-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="folio-evidence-title"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <Eyebrow>Evidence</Eyebrow>
            <h2 id="folio-evidence-title" className="mt-1 font-display text-[20px] font-semibold">
              {nodeTitle ?? "Selected node"}
            </h2>
            {nodeType ? (
              <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {learnerFacingNodeTypeLabel(nodeType)}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            ref={closeButtonRef}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {evidenceQuery.isLoading ? (
            <div className="space-y-3">
              <FolioSkeleton className="h-16 w-full" />
              <FolioSkeleton className="h-16 w-full" />
            </div>
          ) : null}

          {evidenceQuery.isError ? (
            <FolioErrorNotice
              title="Evidence unavailable"
              message={
                evidenceQuery.error instanceof Error
                  ? evidenceQuery.error.message
                  : "We could not load supporting evidence."
              }
              onRetry={() => void evidenceQuery.refetch()}
            />
          ) : null}

          {evidence && learnerRefs.length === 0 ? (
            <p className="text-[14px] text-muted-foreground">
              No learner-visible evidence is attached to this node yet.
            </p>
          ) : null}

          {learnerRefs.length > 0 ? (
            <ul className="space-y-3">
              {learnerRefs.map((ref) => (
                <li
                  key={ref.id}
                  className="rounded-[var(--radius)] border border-border bg-card px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-accent">
                      {ref.kind === "chunk" ? "Source excerpt" : "Claim"}
                    </span>
                    {ref.sourceTitle ? (
                      <span className="truncate text-[11px] text-muted-foreground">
                        {ref.sourceTitle}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 font-display text-[14px] leading-relaxed">{ref.text}</p>
                  {ref.pageStart != null ? (
                    <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                      Page {ref.pageStart}
                      {ref.pageEnd != null && ref.pageEnd !== ref.pageStart
                        ? `–${ref.pageEnd}`
                        : ""}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </aside>
    </>
  );
}
