import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import type { DashboardNotebookSummary } from "@studyagent/schemas";
import { Button, Eyebrow, Meter } from "../primitives.js";

export function NotebookShelf({
  notebooks,
  onOpenNotebook,
}: {
  notebooks: DashboardNotebookSummary[];
  onOpenNotebook: (notebook: DashboardNotebookSummary, action: "primary" | "secondary") => void;
}) {
  const [activeId, setActiveId] = useState(notebooks[0]?.id ?? "");
  const [hoverId, setHoverId] = useState<string | null>(null);

  useEffect(() => {
    if (!notebooks.some((n) => n.id === activeId) && notebooks[0]) {
      setActiveId(notebooks[0].id);
    }
  }, [notebooks, activeId]);

  const displayedId = hoverId ?? activeId;

  const commitHover = () => {
    if (hoverId) {
      setActiveId(hoverId);
      setHoverId(null);
    }
  };

  if (notebooks.length === 0) {
    return null;
  }

  return (
    <div onMouseLeave={commitHover}>
      <Eyebrow>Your notebooks</Eyebrow>
      <ul
        className="mt-3 max-h-[min(52vh,420px)] divide-y divide-border overflow-y-auto border-y border-border overscroll-contain"
        role="listbox"
        aria-label="Notebooks"
      >
        {notebooks.map((notebook, index) => {
          const isExpanded = notebook.id === displayedId;
          const secondaryLabel =
            notebook.resumeAction.label.toLowerCase() === "open study map"
              ? "Review concept"
              : "Open study map";

          return (
            <li key={notebook.id}>
              <div
                role="option"
                aria-selected={isExpanded}
                aria-expanded={isExpanded}
                tabIndex={0}
                className={
                  "w-full cursor-pointer px-1 text-left transition-colors " +
                  (isExpanded ? "bg-accent/6 py-4" : "py-2.5 hover:bg-muted/60")
                }
                onMouseEnter={() => setHoverId(notebook.id)}
                onFocus={() => setHoverId(notebook.id)}
                onBlur={commitHover}
                onClick={() => {
                  setActiveId(notebook.id);
                  setHoverId(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setActiveId(notebook.id);
                    setHoverId(null);
                  }
                }}
              >
                {isExpanded ? (
                  <div className="border-l-2 border-accent pl-5">
                    <h2 className="font-display text-[26px] font-semibold leading-tight">
                      {notebook.title}
                    </h2>
                    <div className="mt-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                      {notebook.progressPercent}% complete · {notebook.modulesLabel} ·{" "}
                      {notebook.lastActivityLabel}
                    </div>
                    {notebook.description ? (
                      <p className="mt-3 font-display text-[15.5px] leading-[1.7] text-foreground/85">
                        {notebook.description}
                      </p>
                    ) : null}
                    <div className="mt-4 flex flex-wrap gap-2.5">
                      <Button
                        variant="accent"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenNotebook(notebook, "primary");
                        }}
                      >
                        {notebook.resumeAction.label} <ArrowRight className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenNotebook(notebook, "secondary");
                        }}
                      >
                        {secondaryLabel}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-baseline gap-3">
                    <span className="w-6 font-display text-[13px] tabular-nums text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-[15px] font-medium">
                        {notebook.title}
                      </span>
                      <span className="mt-1 block max-w-[240px]">
                        <Meter
                          value={notebook.progressPercent}
                          thickness="sm"
                          tone={notebook.progressPercent < 50 ? "warning" : "accent"}
                        />
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                      {notebook.progressPercent}%
                    </span>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
