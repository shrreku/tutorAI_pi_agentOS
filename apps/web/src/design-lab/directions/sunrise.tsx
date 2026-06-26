import { ArrowRight, Flame, Sparkles } from "lucide-react";
import { Badge, Button, Eyebrow, Meter, Ring } from "../ui/primitives.js";
import { SheetWorkspace } from "../ui/layouts/sheet.js";
import { NodePack as NodePackShowcase } from "../ui/nodes.js";
import {
  sampleMastery,
  sampleNotebooks,
  samplePlan,
  sampleWeek,
  useCredits,
  useMe,
  useNotebooks,
} from "../lib/data.js";

const MAP_NODES = [
  {
    id: "c",
    x: 24,
    y: 30,
    type: "curriculum" as const,
    size: "l" as const,
    title: "Ch. 7 · Substitution",
    meta: "3 of 8 modules",
    progress: 38,
    num: 1,
  },
  {
    id: "p",
    x: 36,
    y: 210,
    type: "plan" as const,
    size: "m" as const,
    title: "Substitution plan",
    meta: "Obj 2 of 3",
    num: 2,
  },
  {
    id: "s",
    x: 250,
    y: 56,
    type: "concept" as const,
    size: "m" as const,
    state: "selected" as const,
    title: "SN2 mechanism",
    meta: "needs practice",
    num: 3,
  },
  {
    id: "o",
    x: 268,
    y: 214,
    type: "objective" as const,
    size: "s" as const,
    state: "active" as const,
    title: "Backside attack",
    num: 4,
  },
];
const MAP_EDGES = [
  { from: [120, 70] as [number, number], to: [250, 90] as [number, number] },
  { from: [300, 100] as [number, number], to: [300, 214] as [number, number], active: true },
  { from: [110, 240] as [number, number], to: [268, 238] as [number, number] },
];

export function Workspace() {
  const nb = useNotebooks();
  const notebook = nb.data?.[0]?.title ?? sampleNotebooks[0]!.title;
  return <SheetWorkspace notebook={notebook} nodes={MAP_NODES} edges={MAP_EDGES} />;
}

export function NodePack() {
  return <NodePackShowcase directionLabel="Sunrise" numbered={false} />;
}

const SUBJECT_EMOJI = ["🧪", "📐", "🔬", "📚"];

export function Dashboard() {
  const me = useMe();
  const nb = useNotebooks();
  const credits = useCredits();
  const notebooks = nb.data && nb.data.length ? nb.data : sampleNotebooks;
  const usingSample = !nb.data || nb.data.length === 0;
  const name = me.data?.user?.displayName?.split(" ")[0] ?? "friend";
  const creditPct = Math.round(credits.data?.percentRemaining ?? 71);
  const weekMax = Math.max(...sampleWeek.map((d) => d.v));

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pb-20 pt-8">
      {/* Warm hero greeting strip */}
      <div className="flex flex-col gap-4 rounded-[var(--radius)] bg-gradient-to-br from-primary to-accent p-6 text-primary-foreground shadow-pop sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-[30px] font-bold leading-tight tracking-tight">
            Good morning, {name} ☀️
          </h1>
          <p className="mt-1.5 max-w-xl font-display text-[15px] leading-relaxed text-primary-foreground/90">
            You&apos;re so close on Chapter 7 — just two little objectives left. Let&apos;s make
            today count!
          </p>
        </div>
        <div className="flex items-center gap-2.5 self-start rounded-full bg-white/20 px-4 py-2.5 backdrop-blur-sm sm:self-auto">
          <Flame className="h-5 w-5" />
          <div className="leading-none">
            <div className="font-display text-[18px] font-bold tabular-nums">6 days</div>
            <div className="mt-0.5 text-[11px] text-primary-foreground/80">study streak 🔥</div>
          </div>
        </div>
      </div>

      {usingSample && (
        <div className="mt-3 flex justify-end">
          <Badge tone="warning">sample data</Badge>
        </div>
      )}

      {/* Friendly bento grid */}
      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Large "Continue learning" hero tile */}
        <div className="md:col-span-2 md:row-span-2 flex flex-col justify-between rounded-[var(--radius)] border border-border bg-card p-6 shadow-soft">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[22px]">🧪</span>
              <Eyebrow>Pick up where you left off</Eyebrow>
            </div>
            <h2 className="mt-3 font-display text-[24px] font-bold leading-tight">
              Organic Chemistry I
            </h2>
            <p className="mt-1 font-display text-[14px] text-muted-foreground">
              Ch. 7 · Substitution — backside-attack stereochemistry is up next.
            </p>
            <div className="mt-4">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] font-medium text-muted-foreground">
                  60% through the chapter
                </span>
                <span className="font-display text-[15px] font-bold text-primary tabular-nums">
                  3 / 8 modules
                </span>
              </div>
              <Meter className="mt-2" value={60} thickness="lg" tone="primary" />
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <Button variant="primary" size="lg">
              Continue learning <ArrowRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="lg">
              Review SN2
            </Button>
          </div>
        </div>

        {/* Mastery rings tile */}
        <div className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-soft">
          <Eyebrow>How you&apos;re doing</Eyebrow>
          <div className="mt-4 grid grid-cols-2 gap-y-4 place-items-center">
            {sampleMastery.map((m) => (
              <div key={m.concept} className="flex flex-col items-center gap-1.5 text-center">
                <Ring value={m.value} size={64} label={`${m.value}%`} />
                <span
                  className={
                    "max-w-[88px] text-[11px] font-medium leading-tight " +
                    (m.review ? "text-destructive" : "text-muted-foreground")
                  }
                >
                  {m.concept}
                  {m.review ? " ⚠️" : ""}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Today's plan checklist tile */}
        <div className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-soft">
          <div className="flex items-center gap-2">
            <span className="text-[18px]">📋</span>
            <Eyebrow>Today&apos;s plan</Eyebrow>
          </div>
          <ul className="mt-3 space-y-1.5">
            {samplePlan.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-2.5 rounded-[var(--radius-md)] px-2 py-1.5"
              >
                <span
                  className={
                    "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] " +
                    (p.status === "done"
                      ? "bg-success text-white"
                      : p.status === "active"
                        ? "bg-primary/15 text-primary"
                        : "border border-border text-muted-foreground")
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
                <span className="font-display text-[12px] font-medium text-muted-foreground tabular-nums">
                  {p.minutes}m
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Second bento row: notebooks + weekly bars */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        {/* Big rounded notebook tiles */}
        <div>
          <Eyebrow className="mb-3">Your notebooks 📓</Eyebrow>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {notebooks.slice(0, 3).map((n, i) => {
              const prog = [60, 32, 88][i % 3]!;
              return (
                <button
                  key={n.id}
                  className="group flex flex-col items-start gap-3 rounded-[var(--radius)] border border-border bg-card p-5 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-pop"
                >
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-accent/15 text-[22px]">
                    {SUBJECT_EMOJI[i % SUBJECT_EMOJI.length]}
                  </span>
                  <span className="font-display text-[15px] font-bold leading-tight group-hover:text-primary">
                    {n.title}
                  </span>
                  <div className="w-full">
                    <Meter value={prog} thickness="md" tone={prog < 50 ? "warning" : "primary"} />
                    <span className="mt-1.5 block font-display text-[12px] font-medium text-muted-foreground tabular-nums">
                      {prog}% done
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Cheerful weekly bars */}
        <div className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-soft">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" />
              <Eyebrow>This week</Eyebrow>
            </div>
            <Badge tone="success">on a roll!</Badge>
          </div>
          <div className="mt-5 flex h-32 items-end justify-between gap-2">
            {sampleWeek.map((d, i) => {
              const h = Math.max(8, Math.round((d.v / weekMax) * 100));
              const best = d.v === weekMax;
              return (
                <div key={i} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex h-full w-full items-end">
                    <div
                      className={
                        "w-full rounded-full transition-all " +
                        (best ? "bg-accent" : "bg-primary/35")
                      }
                      style={{ height: `${h}%` }}
                    />
                  </div>
                  <span className="font-display text-[11px] font-medium text-muted-foreground">
                    {d.d}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex items-center justify-between rounded-[var(--radius-md)] bg-muted px-3 py-2.5">
            <span className="text-[12px] text-muted-foreground">Tutor credits left</span>
            <div className="flex items-center gap-2">
              <Meter className="w-20" value={creditPct} tone="accent" />
              <Badge tone="accent">{creditPct}%</Badge>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
