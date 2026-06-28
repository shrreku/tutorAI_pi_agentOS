import { ArrowRight, Check } from "lucide-react";
import { Badge, Button, Eyebrow, Meter } from "../ui/primitives.js";
import { ChatPane, SplitWorkspace, WorkspaceHeader } from "../ui/workspace.js";
import { NodePack as NodePackShowcase } from "../ui/nodes.js";
import { SurfaceViewer } from "../ui/surfaces.js";
import {
  sampleMastery,
  sampleNotebooks,
  samplePlan,
  useCredits,
  useMe,
  useNotebooks,
} from "../lib/data.js";

const MAP_NODES = [
  {
    id: "c",
    x: 28,
    y: 36,
    type: "curriculum" as const,
    size: "l" as const,
    title: "Ch. 7 · Substitution",
    meta: "3 of 8 modules",
    progress: 38,
  },
  {
    id: "p",
    x: 44,
    y: 214,
    type: "plan" as const,
    size: "m" as const,
    title: "Substitution plan",
    meta: "Obj 2 of 3",
  },
  {
    id: "s",
    x: 256,
    y: 60,
    type: "concept" as const,
    size: "m" as const,
    state: "selected" as const,
    title: "SN2 mechanism",
    meta: "needs practice",
  },
  {
    id: "o",
    x: 272,
    y: 216,
    type: "objective" as const,
    size: "s" as const,
    state: "active" as const,
    title: "Backside attack",
  },
];
const MAP_EDGES = [
  { from: [128, 74] as [number, number], to: [256, 92] as [number, number] },
  { from: [306, 104] as [number, number], to: [306, 216] as [number, number], active: true },
  { from: [118, 244] as [number, number], to: [272, 240] as [number, number] },
];

export function Workspace() {
  const nb = useNotebooks();
  const notebook = nb.data?.[0]?.title ?? sampleNotebooks[0]!.title;
  return (
    <>
      <WorkspaceHeader
        notebook={notebook}
        right={
          <Button size="sm" variant="outline">
            Open full map
          </Button>
        }
      />
      <SplitWorkspace
        chatRatio={1.5}
        chat={<ChatPane context="SN2 mechanism" />}
        map={
          <SurfaceViewer nodes={MAP_NODES} edges={MAP_EDGES} defaultType="map" className="h-full" />
        }
      />
    </>
  );
}

export function NodePack() {
  return <NodePackShowcase directionLabel="Focus" numbered={false} />;
}

export function Dashboard() {
  const me = useMe();
  const nb = useNotebooks();
  const credits = useCredits();
  const notebooks = nb.data && nb.data.length ? nb.data : sampleNotebooks;
  const usingSample = !nb.data || nb.data.length === 0;
  const name = me.data?.user?.displayName?.split(" ")[0] ?? "Reader";

  return (
    <div className="mx-auto w-full max-w-3xl px-6 pb-28 pt-16">
      {/* Date eyebrow */}
      <div className="flex items-center gap-2 text-[12px] uppercase tracking-[0.16em] text-muted-foreground">
        <span>
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </span>
        {usingSample && <Badge tone="outline">sample</Badge>}
      </div>

      {/* Greeting */}
      <h1 className="mt-4 font-display text-[40px] font-semibold leading-[1.05] tracking-[-0.02em]">
        Good to see you, {name}.
      </h1>
      <p className="mt-3 text-[16px] leading-relaxed text-muted-foreground">
        One thing at a time. Here is where you left off, and a short plan for today.
      </p>

      {/* Continue where you left off — hero */}
      <div className="mt-12">
        <Eyebrow>Continue where you left off</Eyebrow>
        <div className="mt-4 rounded-[var(--radius)] border border-border bg-card p-7 shadow-soft">
          <div className="text-[12px] uppercase tracking-[0.14em] text-accent">
            Organic Chemistry I · Ch. 7
          </div>
          <h2 className="mt-2 font-display text-[24px] font-semibold leading-tight">
            Practice 5 stereocenter cards
          </h2>
          <p className="mt-3 text-[15px] leading-[1.7] text-foreground/80">
            You are mid-way through the substitution plan. Backside-attack stereochemistry is the
            one objective still wobbling — a few cards will steady it before the chapter closes.
          </p>
          <div className="mt-5 flex items-center gap-4">
            <Meter className="flex-1" value={60} tone="accent" />
            <span className="text-[13px] tabular-nums text-muted-foreground">60% of chapter</span>
          </div>
          <div className="mt-6 flex items-center gap-2.5">
            <Button variant="accent">
              Resume now <ArrowRight className="h-4 w-4" />
            </Button>
            <Button variant="outline">Open notebook</Button>
            <span className="ml-auto text-[12px] text-muted-foreground">about 5 min</span>
          </div>
        </div>
      </div>

      {/* Quiet two-column: notebooks + (today / mastery) */}
      <div className="mt-14 grid grid-cols-1 gap-x-12 gap-y-12 sm:grid-cols-2">
        {/* Active notebooks — editorial list with thin underline meters */}
        <div>
          <Eyebrow>Active notebooks</Eyebrow>
          <ul className="mt-4 space-y-5">
            {notebooks.slice(0, 3).map((n, i) => {
              const prog = [60, 32, 88][i % 3]!;
              return (
                <li key={n.id}>
                  <button className="group block w-full text-left">
                    <div className="flex items-baseline justify-between">
                      <span className="font-display text-[15.5px] font-medium group-hover:text-accent">
                        {n.title}
                      </span>
                      <span className="text-[12px] tabular-nums text-muted-foreground">
                        {prog}%
                      </span>
                    </div>
                    <Meter
                      className="mt-2"
                      value={prog}
                      thickness="sm"
                      tone={prog < 50 ? "warning" : "accent"}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Today agenda + Mastery */}
        <div className="space-y-12">
          <div>
            <Eyebrow>Today</Eyebrow>
            <ul className="mt-4 space-y-3">
              {samplePlan.map((p) => {
                const done = p.status === "done";
                const active = p.status === "active";
                return (
                  <li key={p.id} className="flex items-center gap-3">
                    <span
                      className={
                        "grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border transition-colors " +
                        (done
                          ? "border-success bg-success text-white"
                          : active
                            ? "border-accent text-accent"
                            : "border-border text-transparent")
                      }
                    >
                      <Check className="h-2.5 w-2.5" strokeWidth={3} />
                    </span>
                    <span
                      className={
                        "flex-1 text-[14px] " +
                        (done
                          ? "text-muted-foreground line-through"
                          : active
                            ? "font-medium text-foreground"
                            : "text-foreground/80")
                      }
                    >
                      {p.label}
                    </span>
                    <span className="text-[12px] tabular-nums text-muted-foreground">
                      {p.minutes}m
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <Eyebrow>Mastery</Eyebrow>
            <ul className="mt-4 space-y-3.5">
              {sampleMastery.map((m) => (
                <li key={m.concept}>
                  <div className="flex items-baseline justify-between text-[14px]">
                    <span className={m.review ? "text-destructive" : "text-foreground/85"}>
                      {m.concept}
                      {m.review && (
                        <span className="ml-2 text-[11px] uppercase tracking-wide text-destructive">
                          review
                        </span>
                      )}
                    </span>
                    <span className="text-[12px] tabular-nums text-muted-foreground">
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
        </div>
      </div>

      {/* Quiet footer — credits */}
      <div className="mt-14 flex items-center justify-between border-t border-border pt-5">
        <span className="text-[13px] text-muted-foreground">Tutor credits remaining</span>
        <div className="flex items-center gap-3">
          <Meter className="w-32" value={credits.data?.percentRemaining ?? 71} tone="accent" />
          <span className="text-[13px] tabular-nums text-muted-foreground">
            {Math.round(credits.data?.percentRemaining ?? 71)}%
          </span>
        </div>
      </div>
    </div>
  );
}
