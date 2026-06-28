import type {
  DashboardDuePracticeItem,
  DashboardDuePracticeSection,
  DashboardRecommendation,
  DashboardRecommendationsSection,
} from "@studyagent/schemas";
import { Eyebrow } from "../primitives.js";

export function DuePracticePanel({
  section,
  onOpenItem,
}: {
  section: DashboardDuePracticeSection;
  onOpenItem: (item: DashboardDuePracticeItem) => void;
}) {
  return (
    <div>
      <Eyebrow>Practice</Eyebrow>
      {section.status === "unavailable" ? (
        <p className="mt-3 text-[13px] text-muted-foreground">Practice queue is unavailable.</p>
      ) : null}
      {section.status === "empty" ? (
        <p className="mt-3 text-[13px] text-muted-foreground">
          No practice items are due right now.
        </p>
      ) : null}
      {section.status === "ready" ? (
        <ul className="mt-3 divide-y divide-border border-y border-border">
          {section.items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="flex w-full items-start gap-3 py-2.5 text-left hover:bg-muted/40"
                onClick={() => onOpenItem(item)}
              >
                <span className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-accent">
                  {item.status === "overdue" ? "Due" : item.status === "ready" ? "Ready" : "Suggested"}
                </span>
                <span className="flex-1">
                  <span className="block font-display text-[14px] font-medium">{item.label}</span>
                  <span className="text-[12px] text-muted-foreground">
                    {item.notebookTitle}
                    {item.detail ? ` · ${item.detail}` : ""}
                  </span>
                </span>
                {item.minutesEstimate ? (
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {item.minutesEstimate}m
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function RecommendationsPanel({
  section,
  onOpenItem,
}: {
  section: DashboardRecommendationsSection;
  onOpenItem: (item: DashboardRecommendation) => void;
}) {
  return (
    <div>
      <Eyebrow>Recommended plan</Eyebrow>
      {section.status === "unavailable" ? (
        <p className="mt-3 text-[13px] text-muted-foreground">Recommendations are unavailable.</p>
      ) : null}
      {section.status === "empty" ? (
        <p className="mt-3 text-[13px] text-muted-foreground">
          Recommendations will appear as your study map builds.
        </p>
      ) : null}
      {section.status === "ready" ? (
        <ul className="mt-3 space-y-1">
          {section.items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2.5 py-1 text-left hover:bg-muted/40"
                onClick={() => onOpenItem(item)}
              >
                <span
                  className={
                    "grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px] " +
                    (item.status === "done"
                      ? "border-success bg-success text-white"
                      : item.status === "active"
                        ? "border-accent text-accent"
                        : "border-border text-muted-foreground")
                  }
                >
                  {item.status === "done" ? "✓" : item.status === "active" ? "›" : ""}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[14px]">{item.label}</span>
                  <span className="text-[12px] text-muted-foreground">{item.reason}</span>
                </span>
                {item.minutesEstimate ? (
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {item.minutesEstimate}m
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
