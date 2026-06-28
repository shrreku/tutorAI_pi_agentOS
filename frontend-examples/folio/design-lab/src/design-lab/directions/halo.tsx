import { ArrowRight, Clock, Flame, Layers, Sparkles, TrendingUp } from "lucide-react";
import { Badge, Button, Eyebrow, Meter } from "../ui/primitives.js";
import { OverlayWorkspace } from "../ui/layouts/overlay.js";
import { NodePack as NodePackShowcase } from "../ui/nodes.js";
import {
  sampleActivity,
  sampleMastery,
  sampleNotebooks,
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
  return <OverlayWorkspace notebook={notebook} nodes={MAP_NODES} edges={MAP_EDGES} />;
}

export function NodePack() {
  return <NodePackShowcase directionLabel="Halo" numbered={false} />;
}

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Flame;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="glass rounded-[var(--radius-xl)] border border-border p-4 shadow-pop">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="grid h-8 w-8 place-items-center rounded-[var(--radius-md)] bg-accent/12 text-accent">
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em]">{label}</span>
      </div>
      <div className="mt-3 font-display text-[28px] font-semibold leading-none tracking-tight">
        {value}
      </div>
      <div className="mt-1.5 text-[12px] text-muted-foreground">{sub}</div>
    </div>
  );
}

export function Dashboard() {
  const me = useMe();
  const nb = useNotebooks();
  const credits = useCredits();
  const notebooks = nb.data && nb.data.length ? nb.data : sampleNotebooks;
  const usingSample = !nb.data || nb.data.length === 0;
  const name = me.data?.user?.displayName?.split(" ")[0] ?? "Reader";
  const creditPct = Math.round(credits.data?.percentRemaining ?? 71);

  return (
    <div className="dot-grid min-h-full w-full bg-background">
      <div className="mx-auto w-full max-w-6xl px-6 pb-20 pt-10">
        {/* Hero greeting — gradient accent border glass card */}
        <div
          className="rounded-[calc(var(--radius-xl)+2px)] p-[1.5px] shadow-pop"
          style={{
            background:
              "linear-gradient(135deg, var(--primary), var(--accent) 55%, color-mix(in oklab, var(--accent) 40%, transparent))",
          }}
        >
          <div className="glass rounded-[var(--radius-xl)] px-7 py-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge tone="accent">
                    <Sparkles className="h-3 w-3" /> Good to see you
                  </Badge>
                  {usingSample && <Badge tone="outline">sample</Badge>}
                </div>
                <h1 className="mt-3 font-display text-[40px] font-semibold leading-[1.04] tracking-[-0.02em]">
                  Welcome back, {name}.
                </h1>
                <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
                  You&apos;re 60% through Organic Chemistry I · Ch. 7 Substitution. Stereochemistry
                  is the last wobble before this chapter closes.
                </p>
                <div className="mt-5 flex flex-wrap gap-2.5">
                  <Button variant="primary">
                    Continue reading <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Button variant="outline">Review stereochemistry</Button>
                </div>
              </div>
              <div className="grid shrink-0 grid-cols-2 gap-2.5">
                <div className="rounded-[var(--radius-md)] border border-border bg-card/60 px-4 py-3 text-center">
                  <div className="font-display text-[26px] font-semibold tabular-nums">14</div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    concepts
                  </div>
                </div>
                <div className="rounded-[var(--radius-md)] border border-border bg-card/60 px-4 py-3 text-center">
                  <div className="font-display text-[26px] font-semibold tabular-nums text-accent">
                    3
                  </div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    notebooks
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bento grid */}
        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Stat tiles row */}
          <StatTile icon={Flame} label="Streak" value="6 days" sub="Keep it alive — study today" />
          <StatTile icon={TrendingUp} label="Avg mastery" value="70%" sub="+8% in the last week" />
          <StatTile
            icon={Layers}
            label="Tutor credits"
            value={`${creditPct}%`}
            sub="Remaining this cycle"
          />

          {/* Mastery panel — wide */}
          <div className="glass rounded-[var(--radius-xl)] border border-border p-5 shadow-pop lg:col-span-2">
            <div className="flex items-baseline justify-between">
              <Eyebrow>Mastery</Eyebrow>
              <span className="text-[12px] text-muted-foreground">4 concepts tracked</span>
            </div>
            <ul className="mt-4 space-y-3.5">
              {sampleMastery.map((m) => (
                <li key={m.concept}>
                  <div className="flex items-baseline justify-between text-[14px]">
                    <span className={m.review ? "font-medium text-destructive" : "font-medium"}>
                      {m.concept}
                      {m.review && (
                        <span className="ml-2 text-[11px] font-normal text-destructive">
                          needs review
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
                      {m.value}%
                    </span>
                  </div>
                  <Meter
                    className="mt-1.5"
                    value={m.value}
                    thickness="sm"
                    tone={m.review ? "danger" : "success"}
                  />
                </li>
              ))}
            </ul>
          </div>

          {/* Continue tile — tall accent glass */}
          <div
            className="rounded-[calc(var(--radius-xl)+2px)] p-[1.5px] shadow-pop"
            style={{
              background:
                "linear-gradient(160deg, var(--accent), color-mix(in oklab, var(--primary) 70%, transparent))",
            }}
          >
            <div className="glass flex h-full flex-col rounded-[var(--radius-xl)] p-5">
              <Eyebrow>Continue</Eyebrow>
              <div className="mt-3 font-display text-[18px] font-semibold leading-snug">
                SN2 mechanism
              </div>
              <div className="mt-1 text-[12px] text-muted-foreground">
                Backside attack · stereochemistry
              </div>
              <div className="mt-4">
                <Meter value={45} thickness="md" tone="warning" />
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>45% · 1 objective left</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" /> 12 min
                  </span>
                </div>
              </div>
              <Button variant="accent" className="mt-auto w-full">
                Resume <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Active notebooks */}
          <div className="glass rounded-[var(--radius-xl)] border border-border p-5 shadow-pop lg:col-span-2">
            <div className="flex items-baseline justify-between">
              <Eyebrow>Active notebooks</Eyebrow>
              {usingSample && <Badge tone="outline">sample</Badge>}
            </div>
            <ul className="mt-4 space-y-2.5">
              {notebooks.slice(0, 3).map((n, i) => {
                const prog = [60, 32, 88][i % 3]!;
                return (
                  <li key={n.id}>
                    <button className="group flex w-full items-center gap-4 rounded-[var(--radius-md)] border border-border bg-card/50 px-4 py-3 text-left transition-colors hover:border-accent">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-accent/12 font-display text-[13px] font-semibold text-accent">
                        {n.title
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((p) => p[0]?.toUpperCase() ?? "")
                          .join("")}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-[15px] font-medium group-hover:text-accent">
                          {n.title}
                        </span>
                        <Meter
                          className="mt-1.5"
                          value={prog}
                          thickness="sm"
                          tone={prog < 50 ? "warning" : "primary"}
                        />
                      </span>
                      <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
                        {prog}%
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Recent activity */}
          <div className="glass rounded-[var(--radius-xl)] border border-border p-5 shadow-pop">
            <Eyebrow>Recent activity</Eyebrow>
            <ul className="mt-4 space-y-4">
              {sampleActivity.map((a) => (
                <li key={a.id} className="flex gap-3">
                  <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                    {a.kind === "quiz" ? (
                      <TrendingUp className="h-3.5 w-3.5" />
                    ) : a.kind === "source" ? (
                      <Layers className="h-3.5 w-3.5" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-medium leading-snug">{a.title}</div>
                    <div className="mt-0.5 text-[12px] text-muted-foreground">{a.meta}</div>
                    <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {a.at}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
