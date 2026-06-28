import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Plus } from "lucide-react";
import { notebooksQueryOptions } from "@studyagent/api-client";
import type { NotebookRecord } from "@studyagent/schemas";
import { apiClient } from "../../platform/api-client.js";
import { timeAgo } from "../lib/utils.js";
import { Button, Eyebrow, Skeleton } from "../ui/primitives.js";

function updatedLabel(value: string | Date): string {
  return timeAgo(typeof value === "string" ? value : value.toISOString());
}

export function NotebooksPage() {
  const navigate = useNavigate();
  const query = useQuery(notebooksQueryOptions(apiClient.request));
  const notebooks: NotebookRecord[] = query.data ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl px-6 pb-20 pt-10">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-foreground/80 pb-5">
        <div>
          <Eyebrow>The Library</Eyebrow>
          <h1 className="mt-2 font-display text-[clamp(1.9rem,4vw,2.5rem)] font-semibold leading-tight tracking-[-0.02em]">
            Your notebooks
          </h1>
        </div>
        <Button onClick={() => navigate({ to: "/app/workspaces/new" })}>
          <Plus className="h-4 w-4" /> New notebook
        </Button>
      </div>

      {query.isLoading ? (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : notebooks.length === 0 ? (
        <div className="mt-6 rounded-[var(--radius)] border border-dashed border-border bg-card/40 px-6 py-16 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-accent" />
          <h2 className="mt-3 font-display text-[20px] font-semibold">No notebooks yet</h2>
          <p className="mx-auto mt-1.5 max-w-sm text-[14px] text-muted-foreground">
            Create your first notebook, add a source, and start studying with a grounded tutor.
          </p>
          <Button className="mt-4" onClick={() => navigate({ to: "/app/workspaces/new" })}>
            New notebook <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-border border-y border-border">
          {notebooks.map((n, i) => (
            <li key={n.id} className="group">
              <Link
                to="/notebooks/$notebookId"
                params={{ notebookId: n.id }}
                className="flex items-baseline gap-4 py-4 pl-1 pr-2 transition-colors hover:bg-accent/5"
              >
                <span className="w-7 shrink-0 font-display text-[14px] tabular-nums text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-[19px] font-semibold leading-tight group-hover:text-accent">
                    {n.title}
                  </h3>
                  {n.description ? (
                    <p className="mt-0.5 line-clamp-1 text-[13.5px] text-foreground/70">
                      {n.description}
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 self-center font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  {updatedLabel(n.updatedAt)}
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 self-center text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
