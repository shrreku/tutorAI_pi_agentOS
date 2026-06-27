import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Badge, Button, Eyebrow, Meter } from "../ui/primitives.js";
import { FolioMarginWorkspace } from "../ui/layouts/folio-margin.js";
import { FolioNodePack } from "../ui/folio-nodes.js";
import {
  metaForNotebook,
  sampleActivity,
  sampleMonthDays,
  sampleNotebooks,
  samplePlan,
  samplePractice,
  sampleWeek,
  useCredits,
  useMe,
  useNotebooks,
} from "../lib/data.js";
import type { NotebookSummary } from "../../routing/api.js";

const TUTOR_NOTICE =
  "Stereochemistry is still at 45% — when you open Organic Chemistry, start with the five chiral-center flashcards your tutor queued.";

function NotebookShelf({ notebooks }: { notebooks: NotebookSummary[] }) {
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

  return (
    <div onMouseLeave={commitHover}>
      <Eyebrow>Your notebooks</Eyebrow>
      <ul
        className="mt-3 max-h-[min(52vh,420px)] divide-y divide-border overflow-y-auto border-y border-border overscroll-contain"
        role="listbox"
        aria-label="Notebooks"
      >
        {notebooks.map((n, i) => {
          const meta = metaForNotebook(n.id, i);
          const isExpanded = n.id === displayedId;
          return (
            <li key={n.id}>
              <button
                type="button"
                role="option"
                aria-selected={isExpanded}
                aria-expanded={isExpanded}
                className={
                  "w-full px-1 text-left transition-colors " +
                  (isExpanded ? "bg-accent/6 py-4" : "py-2.5 hover:bg-muted/60")
                }
                onMouseEnter={() => setHoverId(n.id)}
                onFocus={() => setHoverId(n.id)}
                onBlur={commitHover}
                onClick={() => {
                  setActiveId(n.id);
                  setHoverId(null);
                }}
              >
                {isExpanded ? (
                  <div className="border-l-2 border-accent pl-5">
                    <h2 className="font-display text-[26px] font-semibold leading-tight">
                      {n.title}
                      {meta.chapter ? ` · ${meta.chapter}` : ""}
                    </h2>
                    <div className="mt-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                      {meta.progress}% complete · {meta.modules} · last opened {meta.lastOpened}
                    </div>
                    <p className="mt-3 font-display text-[15.5px] leading-[1.7] text-foreground/85">
                      {meta.blurb}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2.5">
                      <Button variant="primary" onClick={(e) => e.stopPropagation()}>
                        Continue reading <ArrowRight className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" onClick={(e) => e.stopPropagation()}>
                        Review concept
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-baseline gap-3">
                    <span className="w-6 font-display text-[13px] tabular-nums text-muted-foreground">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-[15px] font-medium">
                        {n.title}
                      </span>
                      <span className="mt-1 block max-w-[240px]">
                        <Meter
                          value={meta.progress}
                          thickness="sm"
                          tone={meta.progress < 50 ? "warning" : "primary"}
                        />
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                      {meta.progress}%
                    </span>
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function WeekActivityBars({ week }: { week: typeof sampleWeek }) {
  const max = Math.max(...week.map((b) => b.v), 1);
  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height: 88 }}>
        {week.map((b, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-t-sm bg-accent transition-all"
              style={{ height: `${(b.v / max) * 100}%`, minHeight: 4 }}
            />
            <span className="font-mono text-[10px] text-muted-foreground">{b.d}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 font-mono text-[11px] text-muted-foreground">
        4h 20m studied · peak Thursday
      </p>
    </div>
  );
}

function MonthActivityTiles({ days }: { days: typeof sampleMonthDays }) {
  const max = Math.max(...days.map((d) => d.v), 1);
  const weekdayLabels = ["M", "T", "W", "T", "F", "S", "S"] as const;
  const monthLabel = new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div>
      <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {monthLabel}
      </p>
      <div className="grid grid-cols-7 gap-1">
        {weekdayLabels.map((label, i) => (
          <span
            key={`${label}-${i}`}
            className="pb-0.5 text-center font-mono text-[9px] uppercase text-muted-foreground"
          >
            {label}
          </span>
        ))}
        {days.map((day) => {
          const shade = day.v === 0 ? 0 : 18 + (day.v / max) * 62;
          return (
            <div
              key={day.day}
              className="aspect-square rounded-[3px] border border-border/60"
              style={{
                background:
                  day.v === 0
                    ? "color-mix(in oklab, var(--muted) 40%, var(--card))"
                    : `color-mix(in oklab, var(--accent) ${shade}%, var(--card))`,
              }}
              title={`Jun ${day.day}: ${day.v} min`}
            >
              <span className="flex h-full items-end justify-end p-0.5 font-mono text-[8px] tabular-nums text-foreground/50">
                {day.day}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 font-mono text-[11px] text-muted-foreground">
        18h 40m this month · best day Jun 19
      </p>
    </div>
  );
}

function StudyActivityPanel({
  mode,
  onModeChange,
}: {
  mode: "week" | "month";
  onModeChange: (m: "week" | "month") => void;
}) {
  return (
    <div className="border border-border bg-card/50 px-4 py-3">
      <div className="mb-3 flex gap-4 border-b border-border pb-2">
        {(["week", "month"] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={
              "font-mono text-[11px] uppercase tracking-wider " +
              (mode === m
                ? "font-semibold text-accent"
                : "text-muted-foreground hover:text-foreground")
            }
            onClick={() => onModeChange(m)}
          >
            {m === "week" ? "This week" : "This month"}
          </button>
        ))}
      </div>
      {mode === "week" ? (
        <WeekActivityBars week={sampleWeek} />
      ) : (
        <MonthActivityTiles days={sampleMonthDays} />
      )}
    </div>
  );
}

function RecentActivity() {
  return (
    <ul className="mt-2 divide-y divide-border border-y border-border">
      {sampleActivity.map((a) => (
        <li key={a.id} className="flex gap-3 py-2.5">
          <span className="w-14 shrink-0 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            {a.at}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[14px] leading-snug">{a.title}</span>
            <span className="text-[12px] text-muted-foreground">{a.meta}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Workspace() {
  const nb = useNotebooks();
  const notebook = nb.data?.[0]?.title ?? sampleNotebooks[0]!.title;
  return <FolioMarginWorkspace notebook={notebook} />;
}

export function NodePack() {
  return <FolioNodePack />;
}

export function Dashboard() {
  const me = useMe();
  const nb = useNotebooks();
  const credits = useCredits();
  const notebooks = nb.data && nb.data.length ? nb.data : sampleNotebooks;
  const usingSample = !nb.data || nb.data.length === 0;
  const name = me.data?.user?.displayName?.split(" ")[0] ?? "Reader";
  const [activityMode, setActivityMode] = useState<"week" | "month">("week");

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pb-20 pt-10">
      <div className="border-b-2 border-foreground/80 pb-5">
        <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          <span>The Study Journal</span>
          <span>
            {new Date().toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
            {usingSample ? " · sample" : ""}
          </span>
        </div>
        <h1 className="mt-3 font-display text-[44px] font-semibold leading-[1.02] tracking-[-0.02em]">
          Welcome back, {name}.
        </h1>
        <p className="mt-3 max-w-2xl border-l-2 border-accent/70 pl-3 font-display text-[14.5px] leading-[1.55] text-foreground/80">
          <span className="mr-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-accent not-italic">
            Tutor
          </span>
          <span className="italic text-muted-foreground">{TUTOR_NOTICE}</span>
        </p>
      </div>

      <div className="mt-7 grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-8">
          <NotebookShelf notebooks={notebooks} />

          <div>
            <Eyebrow>Recent activity</Eyebrow>
            <RecentActivity />
          </div>
        </div>

        <div className="space-y-7">
          <div>
            <Eyebrow>Practice</Eyebrow>
            <ul className="mt-3 divide-y divide-border border-y border-border">
              {samplePractice.map((p) => (
                <li key={p.id}>
                  <button type="button" className="flex w-full items-start gap-3 py-2.5 text-left">
                    <span className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-accent">
                      {p.status === "ready" ? "Ready" : "Suggested"}
                    </span>
                    <span className="flex-1">
                      <span className="block font-display text-[14px] font-medium">{p.label}</span>
                      <span className="text-[12px] text-muted-foreground">{p.meta}</span>
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">{p.minutes}m</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <Eyebrow>Recommended plan</Eyebrow>
            <ul className="mt-3 space-y-1">
              {samplePlan.map((p) => (
                <li key={p.id} className="flex items-center gap-2.5 py-1">
                  <span
                    className={
                      "grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px] " +
                      (p.status === "done"
                        ? "border-success bg-success text-white"
                        : p.status === "active"
                          ? "border-accent text-accent"
                          : "border-border text-muted-foreground")
                    }
                  >
                    {p.status === "done" ? "✓" : p.status === "active" ? "›" : ""}
                  </span>
                  <span
                    className={
                      "flex-1 font-display text-[14px] " +
                      (p.status === "done" ? "text-muted-foreground line-through" : "")
                    }
                  >
                    {p.label}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">{p.minutes}m</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <Eyebrow>Study activity</Eyebrow>
            <div className="mt-3">
              <StudyActivityPanel mode={activityMode} onModeChange={setActivityMode} />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-[var(--radius)] border border-border bg-card px-3 py-2">
            <span className="text-[12px] text-muted-foreground">Tutor credits</span>
            <div className="flex items-center gap-2">
              <Meter className="w-24" value={credits.data?.percentRemaining ?? 71} tone="accent" />
              <Badge tone="accent">{Math.round(credits.data?.percentRemaining ?? 71)}%</Badge>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
