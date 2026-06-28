import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import {
  folioActivity,
  folioCreditPacks,
  folioCredits,
  folioMe,
  folioMonthDays,
  folioNotebooks,
  folioPlan,
  folioPractice,
  folioSources,
  folioStudyToday,
  folioTemplates,
  folioWeek,
  metaForFolioNotebook,
} from "../lib/folio-mock-data.js";
import type { NotebookSummary } from "../../routing/api.js";
import type { FolioAccountTab } from "../ui/folio-shell-nav.js";
import { Badge, Button, Eyebrow, Meter } from "../ui/primitives.js";

const TUTOR_NOTICE =
  "Stereochemistry is still at 45% — when you open Organic Chemistry, start with the five chiral-center flashcards your tutor queued.";

export function FolioPageChrome({
  title,
  lead,
  children,
  wide,
}: {
  title: string;
  lead?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={
        "mx-auto w-full px-6 pb-20 pt-10 " + (wide ? "max-w-6xl" : "max-w-3xl")
      }
    >
      <h1 className="font-display text-[32px] font-semibold leading-tight tracking-[-0.02em]">
        {title}
      </h1>
      {lead ? (
        <p className="mt-2 max-w-2xl font-display text-[15px] italic leading-relaxed text-muted-foreground">
          {lead}
        </p>
      ) : null}
      <div className="mt-8 space-y-6">{children}</div>
    </div>
  );
}

function FolioSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius)] border border-border bg-card/60 px-5 py-4">
      <h2 className="font-display text-[18px] font-semibold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function FolioField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-[var(--radius)] border border-border bg-elevated px-3 py-2 text-[14px] outline-none focus:border-accent";

function NotebookShelf({
  notebooks,
  onOpen,
}: {
  notebooks: NotebookSummary[];
  onOpen: (id: string) => void;
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

  return (
    <div onMouseLeave={commitHover}>
      <Eyebrow>Your notebooks</Eyebrow>
      <ul
        className="mt-3 max-h-[min(52vh,420px)] divide-y divide-border overflow-y-auto border-y border-border overscroll-contain"
        role="listbox"
        aria-label="Notebooks"
      >
        {notebooks.map((n, i) => {
          const meta = metaForFolioNotebook(n.id, i);
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
                      <Button variant="primary" onClick={(e) => { e.stopPropagation(); onOpen(n.id); }}>
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

function WeekActivityBars() {
  const max = Math.max(...folioWeek.map((b) => b.v), 1);
  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height: 88 }}>
        {folioWeek.map((b, i) => (
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

function MonthActivityTiles() {
  const max = Math.max(...folioMonthDays.map((d) => d.v), 1);
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
        {folioMonthDays.map((day) => {
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
              title={`Day ${day.day}: ${day.v} min`}
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
      {mode === "week" ? <WeekActivityBars /> : <MonthActivityTiles />}
    </div>
  );
}

export function FolioDashboardPage({ navigate }: { navigate: (path: string) => void }) {
  const name = folioMe.user.displayName.split(" ")[0] ?? "Reader";
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
            {" · mock"}
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
          <NotebookShelf
            notebooks={folioNotebooks}
            onOpen={(id) => navigate(`/notebooks/${encodeURIComponent(id)}`)}
          />

          <div>
            <Eyebrow>Recent activity</Eyebrow>
            <ul className="mt-2 divide-y divide-border border-y border-border">
              {folioActivity.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className="flex w-full gap-3 py-2.5 text-left hover:bg-muted/40"
                    onClick={() =>
                      navigate(`/notebooks/${encodeURIComponent(a.notebookId)}`)
                    }
                  >
                    <span className="w-14 shrink-0 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                      {a.at}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-[14px] leading-snug">{a.title}</span>
                      <span className="text-[12px] text-muted-foreground">{a.meta}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="space-y-7">
          <div>
            <Eyebrow>Practice</Eyebrow>
            <ul className="mt-3 divide-y divide-border border-y border-border">
              {folioPractice.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="flex w-full items-start gap-3 py-2.5 text-left hover:bg-muted/40"
                    onClick={() =>
                      navigate(`/notebooks/${encodeURIComponent(p.notebookId)}`)
                    }
                  >
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
              {folioPlan.map((p) => (
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
              <Meter className="w-24" value={folioCredits.percentRemaining} tone="accent" />
              <Badge tone="accent">{folioCredits.percentRemaining}%</Badge>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FolioNotebooksPage({ navigate }: { navigate: (path: string) => void }) {
  return (
    <FolioPageChrome
      title="Notebooks"
      lead="Open a workspace or browse published study templates."
      wide
    >
      <FolioSection title="Your workspaces">
        <ul className="divide-y divide-border">
          {folioNotebooks.map((notebook) => (
            <li
              key={notebook.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div>
                <p className="font-display text-[16px] font-medium">{notebook.title}</p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Personal workspace · Updated{" "}
                  {new Date(notebook.updatedAt).toLocaleDateString()}
                </p>
              </div>
              <Button
                variant="accent"
                size="sm"
                onClick={() => navigate(`/notebooks/${encodeURIComponent(notebook.id)}`)}
              >
                Open
              </Button>
            </li>
          ))}
        </ul>
      </FolioSection>

      <FolioSection title="Published study templates">
        <div className="grid gap-4 sm:grid-cols-2">
          {folioTemplates.map((template) => (
            <div
              key={template.id}
              className="rounded-[var(--radius)] border border-border bg-elevated p-4"
            >
              <h3 className="font-display text-[17px] font-semibold">{template.title}</h3>
              <div className="mt-2 space-y-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <p>Topic: {template.topic}</p>
                <p>Source level: {template.sourceLevel}</p>
                <p>Estimated time: {template.estimatedMinutes} min</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/templates/${encodeURIComponent(template.id)}`)}
                >
                  Details
                </Button>
                <Button
                  variant="accent"
                  size="sm"
                  onClick={() =>
                    navigate(
                      `/workspaces/new?template=${encodeURIComponent(template.id)}`,
                    )
                  }
                >
                  Start studying
                </Button>
              </div>
            </div>
          ))}
        </div>
      </FolioSection>
    </FolioPageChrome>
  );
}

function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

const ACCOUNT_TABS: Array<{ id: FolioAccountTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "credits", label: "Credits" },
  { id: "access-code", label: "Access code" },
  { id: "support", label: "Support" },
  { id: "data", label: "Data" },
];

function AccountTabBar({
  active,
  onChange,
}: {
  active: FolioAccountTab;
  onChange: (tab: FolioAccountTab) => void;
}) {
  return (
    <div className="folio-account-tabs" role="tablist" aria-label="Account sections">
      {ACCOUNT_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          className="folio-account-tab"
          data-active={active === tab.id}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function FolioAccountPage({
  activeTab = "overview",
  onTabChange,
  navigate,
}: {
  activeTab?: FolioAccountTab;
  onTabChange: (tab: FolioAccountTab) => void;
  navigate: (path: string) => void;
}) {
  const [deletionNotes, setDeletionNotes] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codeSuccess, setCodeSuccess] = useState<string | null>(null);
  const [supportCategory, setSupportCategory] = useState(SUPPORT_CATEGORIES[0]);
  const [supportMessage, setSupportMessage] = useState("");
  const [supportSubmitted, setSupportSubmitted] = useState(false);

  const percent = folioCredits.percentRemaining;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 pb-20 pt-10">
      <div className="border-b-2 border-foreground/80 pb-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Account
        </p>
        <h1 className="mt-2 font-display text-[36px] font-semibold leading-tight tracking-[-0.02em]">
          {folioMe.user.displayName}
        </h1>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">{folioMe.user.email}</p>
      </div>

      <AccountTabBar active={activeTab} onChange={onTabChange} />

      <div className="mt-8 space-y-6">
        {status ? (
          <div className="rounded-[var(--radius)] border border-success/30 bg-success/10 px-4 py-3 text-[13px]">
            {status}
          </div>
        ) : null}

        {activeTab === "overview" ? (
          <>
            <FolioSection title="Study today">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[var(--radius)] border border-border bg-elevated px-4 py-3">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    Minutes studied
                  </p>
                  <p className="mt-1 font-display text-[28px] font-semibold tabular-nums">
                    {folioStudyToday.minutes}
                    <span className="text-[14px] font-normal text-muted-foreground">
                      / {folioStudyToday.goal}m
                    </span>
                  </p>
                </div>
                <div className="rounded-[var(--radius)] border border-border bg-elevated px-4 py-3">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    Tutor credits
                  </p>
                  <p className="mt-1 font-display text-[28px] font-semibold tabular-nums">
                    {percent}%
                  </p>
                  <Meter className="mt-2" value={percent} tone="accent" thickness="sm" />
                </div>
              </div>
            </FolioSection>

            <FolioSection title="Quick links">
              <ul className="divide-y divide-border">
                {[
                  { tab: "credits" as const, label: "Manage tutor credits", meta: `${percent}% remaining` },
                  { tab: "access-code" as const, label: "Redeem access code", meta: "Beta & pilot access" },
                  { tab: "support" as const, label: "Support & feedback", meta: "Report an issue" },
                  { tab: "data" as const, label: "Data & deletion", meta: "Workspaces & sources" },
                ].map((item) => (
                  <li key={item.tab}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 py-3 text-left first:pt-0 last:pb-0 hover:text-accent"
                      onClick={() => onTabChange(item.tab)}
                    >
                      <span className="font-display text-[15px] font-medium">{item.label}</span>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        {item.meta}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </FolioSection>
          </>
        ) : null}

        {activeTab === "credits" ? (
          <>
            <FolioSection title={`${percent}% remaining`}>
              <Meter value={percent} tone="accent" thickness="lg" />
              <p className="mt-3 font-display text-[14px] leading-relaxed text-muted-foreground">
                Credits are consumed as you chat with the tutor. Upload and review your study
                materials anytime.
              </p>
            </FolioSection>
            <FolioSection title="Buy more credits">
              <ul className="divide-y divide-border">
                {folioCreditPacks.map((pack) => (
                  <li
                    key={pack.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div>
                      <p className="font-display text-[15px] font-medium">{pack.label}</p>
                      <p className="text-[13px] text-muted-foreground">{pack.description}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[13px]">{formatUsd(pack.priceCents)}</span>
                      <Button variant="accent" size="sm">
                        Buy
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </FolioSection>
          </>
        ) : null}

        {activeTab === "access-code" ? (
          <FolioSection title="Redeem code">
            <p className="font-display text-[14px] italic text-muted-foreground">
              Redeem a code for additional study privileges, credits, or pilot access.
            </p>
            <FolioField label="Access code">
              <input
                className={inputClass}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="TB-XXXXXXXXXX"
              />
            </FolioField>
            <div className="mt-4">
              <Button
                variant="accent"
                onClick={() => {
                  if (!code.trim()) return;
                  setCodeSuccess("Redeemed: study access, 500 tutor credits.");
                  setCode("");
                }}
              >
                Redeem code
              </Button>
            </div>
            {codeSuccess ? <p className="mt-3 text-[13px] text-success">{codeSuccess}</p> : null}
          </FolioSection>
        ) : null}

        {activeTab === "support" ? (
          <>
            <FolioSection title="Learning feedback">
              <p className="font-display text-[14px] italic text-muted-foreground">
                How is TutorBook helping your study rhythm?
              </p>
              <FolioField label="What worked well?">
                <textarea className={inputClass} rows={3} placeholder="Optional reflection…" />
              </FolioField>
            </FolioSection>
            <FolioSection title="Support report">
              {supportSubmitted ? (
                <p className="font-display text-[14px]">
                  Support report recorded locally. In the live app this routes to the admin console.
                </p>
              ) : (
                <>
                  <FolioField label="Category">
                    <select
                      className={inputClass}
                      value={supportCategory}
                      onChange={(e) => setSupportCategory(e.target.value)}
                    >
                      {SUPPORT_CATEGORIES.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </FolioField>
                  <FolioField label="What happened?">
                    <textarea
                      className={inputClass}
                      rows={5}
                      value={supportMessage}
                      onChange={(e) => setSupportMessage(e.target.value)}
                    />
                  </FolioField>
                  <div className="mt-4">
                    <Button
                      variant="accent"
                      onClick={() => {
                        if (!supportMessage.trim()) return;
                        setSupportSubmitted(true);
                      }}
                    >
                      Submit support report
                    </Button>
                  </div>
                </>
              )}
            </FolioSection>
          </>
        ) : null}

        {activeTab === "data" ? (
          <>
            <FolioSection title="Your workspaces">
              <ul className="divide-y divide-border">
                {folioNotebooks.map((workspace) => (
                  <li
                    key={workspace.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div>
                      <p className="font-display text-[15px] font-medium">{workspace.title}</p>
                      <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        Updated {new Date(workspace.updatedAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          navigate(`/notebooks/${encodeURIComponent(workspace.id)}`)
                        }
                      >
                        Open
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setStatus(`Workspace "${workspace.title}" would be deleted.`)
                        }
                      >
                        Delete
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </FolioSection>

            <FolioSection title="Uploaded sources">
              <ul className="divide-y divide-border">
                {folioSources.map((source) => (
                  <li
                    key={source.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div>
                      <p className="font-display text-[15px] font-medium">{source.title}</p>
                      <p className="mt-1 text-[12px] text-muted-foreground">
                        {source.notebookTitle}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setStatus(`Source "${source.title}" would be deleted.`)}
                    >
                      Delete
                    </Button>
                  </li>
                ))}
              </ul>
            </FolioSection>

            <FolioSection title="Request account deletion">
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Full account deletion spans identity, database records, uploaded files, and analytics
                systems. Submit a request and we will process it manually during beta.
              </p>
              <FolioField label="Notes (optional)">
                <textarea
                  className={inputClass}
                  rows={4}
                  value={deletionNotes}
                  onChange={(e) => setDeletionNotes(e.target.value)}
                  placeholder="Tell us anything we should know before deleting your account."
                />
              </FolioField>
              <div className="mt-4">
                <Button
                  variant="accent"
                  onClick={() => {
                    setStatus(
                      "Account deletion request submitted. Our team will follow up by email.",
                    );
                    setDeletionNotes("");
                  }}
                >
                  Request account deletion
                </Button>
              </div>
            </FolioSection>
          </>
        ) : null}
      </div>
    </div>
  );
}
const SUPPORT_CATEGORIES = [
  "Wrong or confusing tutor answer",
  "Upload or ingestion problem",
  "Credits or access problem",
  "Privacy or delete request",
  "Bug or UX issue",
  "General learning feedback",
];

export function FolioTemplateDetailPage({
  templateId,
  navigate,
}: {
  templateId: string;
  navigate: (path: string) => void;
}) {
  const template = folioTemplates.find((t) => t.id === templateId);

  if (!template) {
    return (
      <FolioPageChrome title="Template unavailable">
        <FolioSection title="Not found">
          <p className="text-[13px] text-muted-foreground">This template could not be loaded.</p>
          <Button variant="outline" className="mt-3" onClick={() => navigate("/dashboard")}>
            Back to dashboard
          </Button>
        </FolioSection>
      </FolioPageChrome>
    );
  }

  return (
    <FolioPageChrome title={template.title}>
      <Button variant="ghost" size="sm" className="-mt-4" onClick={() => navigate("/notebooks")}>
        ← Back to notebooks
      </Button>
      <FolioSection title="Overview">
        <p className="font-display text-[15px] leading-relaxed">{template.description}</p>
        <div className="mt-4 space-y-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <p>Topic: {template.topic}</p>
          <p>Source level: {template.sourceLevel}</p>
          <p>Estimated time: {template.estimatedMinutes} minutes</p>
          <p>Study mode: {template.studyMode}</p>
          <p>Expected outcome: {template.expectedOutcome}</p>
        </div>
        <div className="mt-4">
          <Button
            variant="accent"
            onClick={() =>
              navigate(`/workspaces/new?template=${encodeURIComponent(templateId)}`)
            }
          >
            Start studying
          </Button>
        </div>
      </FolioSection>
    </FolioPageChrome>
  );
}

export function FolioWorkspaceCreatePage({
  templateId,
  navigate,
}: {
  templateId: string | null;
  navigate: (path: string) => void;
}) {
  const [phase, setPhase] = useState<"creating" | "done" | "error">(
    templateId ? "creating" : "error",
  );

  useEffect(() => {
    if (!templateId) return;
    const timer = window.setTimeout(() => {
      setPhase("done");
      navigate("/notebooks/demo-orgchem");
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [templateId, navigate]);

  if (!templateId || phase === "error") {
    return (
      <FolioPageChrome title="Could not create workspace">
        <FolioSection title="Missing template">
          <p className="text-[13px] text-muted-foreground">No study template was selected.</p>
          <Button variant="outline" className="mt-3" onClick={() => navigate("/dashboard")}>
            Back to dashboard
          </Button>
        </FolioSection>
      </FolioPageChrome>
    );
  }

  return (
    <FolioPageChrome title="Creating your workspace…">
      <FolioSection title="Setting up">
        <p className="font-display text-[14px] italic text-muted-foreground">
          Cloning curriculum graph and tutor context from the template…
        </p>
      </FolioSection>
    </FolioPageChrome>
  );
}
