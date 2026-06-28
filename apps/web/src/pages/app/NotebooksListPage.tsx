import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowRight, BookText, Clock, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { deleteWorkspace, fetchNotebooks, type NotebookSummary } from "../../routing/api.js";
import { notebookWorkspacePath } from "../../routing/routes.js";
import { Badge, Button, Eyebrow, Input, Skeleton } from "../../ui/primitives.js";
import { Reveal, Stagger, StaggerItem, Lift, motion } from "../../ui/motion.js";
import { cn } from "../../ui/cn.js";
import { HeroArt } from "../../ui/brand.js";

const STRIP_ACCENT = [
  "bg-accent",
  "bg-gold",
  "bg-primary",
  "bg-[#4a6a8c]",
  "bg-[#9a7b1f]",
  "bg-[#7a6cab]",
];

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 604800) return `${Math.round(s / 86400)}d ago`;
  return `${Math.round(s / 604800)}w ago`;
}

function ConfirmDelete({
  notebook,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  notebook: NotebookSummary;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.32, ease: [0.22, 0.61, 0.36, 1] }}
        role="dialog"
        aria-labelledby="del-title"
        className="w-full max-w-md rounded-2xl border border-border bg-card p-7 shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-destructive/12 text-destructive">
          <Trash2 className="h-5 w-5" />
        </span>
        <h2 id="del-title" className="mt-4 font-display text-[22px] font-semibold">
          Delete this notebook?
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">{notebook.title}</span> and its tutor
          history will be permanently removed. This can’t be undone.
        </p>
        {error && (
          <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2.5">
          <Button variant="ghost" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" disabled={pending} onClick={onConfirm}>
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Deleting…
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" /> Delete notebook
              </>
            )}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

export function NotebooksListPage({ navigate }: { navigate: (path: string) => void }) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<NotebookSummary | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const {
    data: notebooks = [],
    isLoading,
    error,
  } = useQuery<NotebookSummary[]>({
    queryKey: ["notebooks"],
    queryFn: fetchNotebooks,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWorkspace,
    onSuccess: async () => {
      setDeleteError(null);
      setPendingDelete(null);
      await queryClient.invalidateQueries({ queryKey: ["notebooks"] });
    },
    onError: (err) => setDeleteError(err instanceof Error ? err.message : "Failed to delete"),
  });

  const personalWorkspaces = useMemo(
    () => notebooks.filter((notebook) => notebook.workspaceType === "personal_learner"),
    [notebooks],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return personalWorkspaces;
    return personalWorkspaces.filter((n) => n.title.toLowerCase().includes(q));
  }, [personalWorkspaces, query]);

  return (
    <div>
      {pendingDelete && (
        <ConfirmDelete
          notebook={pendingDelete}
          pending={deleteMutation.isPending}
          error={deleteError}
          onCancel={() => {
            if (deleteMutation.isPending) return;
            setPendingDelete(null);
            setDeleteError(null);
          }}
          onConfirm={() => deleteMutation.mutate(pendingDelete.id)}
        />
      )}

      {/* Header */}
      <Reveal>
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
          <div>
            <Eyebrow>Library</Eyebrow>
            <h1 className="mt-2 font-display text-[clamp(26px,4vw,34px)] font-semibold leading-tight">
              Your notebooks
            </h1>
            <p className="mt-1.5 font-display text-[15px] italic text-muted-foreground">
              Every workspace you’ve opened, ready to pick back up.
            </p>
          </div>
          <Button variant="primary" onClick={() => navigate("/app/workspaces/new")}>
            <Plus className="h-4 w-4" /> New notebook
          </Button>
        </div>
      </Reveal>

      {/* Toolbar */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notebooks…"
            aria-label="Search notebooks"
            className="pl-9 pr-9"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {!isLoading && !error && personalWorkspaces.length > 0 && (
          <span className="text-[13px] text-muted-foreground">
            {filtered.length} of {personalWorkspaces.length}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="mt-6">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/8 p-6">
            <h2 className="font-display text-[18px] font-semibold text-destructive">
              Couldn’t load your notebooks
            </h2>
            <p className="mt-1.5 text-[14px] text-muted-foreground">
              {error instanceof Error ? error.message : "Something went wrong. Please try again."}
            </p>
            <Button
              className="mt-4"
              variant="outline"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["notebooks"] })}
            >
              Try again
            </Button>
          </div>
        ) : personalWorkspaces.length === 0 ? (
          <Reveal>
            <div className="overflow-hidden rounded-2xl border border-dashed border-border bg-card/60 p-10 text-center">
              <HeroArt className="mx-auto h-28 w-auto opacity-90" />
              <h2 className="mt-6 font-display text-[24px] font-semibold">No notebooks yet</h2>
              <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-muted-foreground">
                Create your first notebook, bring in a source, and meet a tutor that learns the
                material alongside you.
              </p>
              <Button
                className="mt-6"
                variant="primary"
                onClick={() => navigate("/app/workspaces/new")}
              >
                <Plus className="h-4 w-4" /> New notebook
              </Button>
            </div>
          </Reveal>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/60 p-10 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-accent/12 text-accent">
              <Search className="h-6 w-6" />
            </span>
            <h2 className="mt-4 font-display text-[20px] font-semibold">No matches</h2>
            <p className="mx-auto mt-2 max-w-sm text-[14px] text-muted-foreground">
              Nothing matches “{query.trim()}”. Try a different search.
            </p>
            <Button className="mt-5" variant="outline" onClick={() => setQuery("")}>
              Clear search
            </Button>
          </div>
        ) : (
          <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((notebook, i) => (
              <StaggerItem key={notebook.id}>
                <Lift className="h-full">
                  <div className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-soft">
                    {/* Colored top strip */}
                    <span
                      aria-hidden
                      className={cn("block h-1.5 w-full", STRIP_ACCENT[i % STRIP_ACCENT.length])}
                    />
                    <button
                      onClick={() => navigate(notebookWorkspacePath(notebook.id))}
                      className="flex flex-1 flex-col p-5 text-left"
                    >
                      <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent/12 text-accent">
                        <BookText className="h-4.5 w-4.5" />
                      </span>
                      <h3 className="mt-3.5 line-clamp-2 font-display text-[17px] font-semibold leading-snug group-hover:text-accent">
                        {notebook.title}
                      </h3>
                      <div className="mt-2 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                        <Clock className="h-3 w-3" /> Updated {timeAgo(notebook.updatedAt)}
                      </div>
                      <div className="mt-auto flex items-center gap-2 pt-4">
                        <Badge tone="neutral">Workspace</Badge>
                        <span className="ml-auto inline-flex items-center gap-1 text-[13px] font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100">
                          Open <ArrowRight className="h-3.5 w-3.5" />
                        </span>
                      </div>
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${notebook.title}`}
                      onClick={() => {
                        setDeleteError(null);
                        setPendingDelete(notebook);
                      }}
                      className="absolute right-2.5 top-3 grid h-8 w-8 place-items-center rounded-lg text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </Lift>
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </div>
    </div>
  );
}
