import { ArrowRight } from "lucide-react";
import { Badge, Button, Eyebrow, Meter } from "../ui/primitives.js";
import { ChatPane, MapPane, SplitWorkspace, WorkspaceHeader } from "../ui/workspace.js";
import { GraphCanvas, NodePack as NodePackShowcase } from "../ui/nodes.js";
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
          <MapPane title="Study Map · figures" meta="numbered for citation">
            <div className="absolute inset-0">
              <GraphCanvas numbered nodes={MAP_NODES} edges={MAP_EDGES} height={520} />
            </div>
          </MapPane>
        }
      />
    </>
  );
}

export function NodePack() {
  return <NodePackShowcase directionLabel="Folio" numbered />;
}

export function Dashboard() {
  const me = useMe();
  const nb = useNotebooks();
  const credits = useCredits();
  const notebooks = nb.data && nb.data.length ? nb.data : sampleNotebooks;
  const usingSample = !nb.data || nb.data.length === 0;
  const name = me.data?.user?.displayName?.split(" ")[0] ?? "Reader";

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pb-20 pt-10">
      {/* Masthead */}
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
        <p className="mt-2 max-w-2xl font-display text-[16px] italic text-muted-foreground">
          Three notebooks open, fourteen concepts under study, and one fresh recommendation from
          your tutor.
        </p>
      </div>

      <div className="mt-7 grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-[1.6fr_1fr]">
        {/* Lead column */}
        <div>
          <Eyebrow>Featured lead</Eyebrow>
          <div className="mt-3 border-l-2 border-accent pl-5">
            <h2 className="font-display text-[26px] font-semibold leading-tight">
              Organic Chemistry I · Ch. 7 Substitution
            </h2>
            <div className="mt-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              60% complete · 3 of 8 modules · last opened Thursday
            </div>
            <p className="mt-3 font-display text-[15.5px] leading-[1.7] text-foreground/85">
              The bimolecular substitution pathway is nearly within reach. Two objectives remain —
              backside-attack stereochemistry and product separation — before the chapter closes and
              elimination begins.
            </p>
            <div className="mt-4 flex gap-2.5">
              <Button variant="primary">
                Continue reading <ArrowRight className="h-4 w-4" />
              </Button>
              <Button variant="outline">Review concept</Button>
            </div>
          </div>

          <Eyebrow className="mt-9">Active notebooks</Eyebrow>
          <ul className="mt-2 divide-y divide-border border-y border-border">
            {notebooks.slice(0, 4).map((n, i) => {
              const prog = [60, 32, 88, 45][i % 4]!;
              return (
                <li key={n.id}>
                  <button className="group flex w-full items-baseline gap-4 py-3 text-left">
                    <span className="font-display text-[14px] tabular-nums text-muted-foreground">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="flex-1">
                      <span className="block font-display text-[16px] font-medium group-hover:text-accent">
                        {n.title}
                      </span>
                      <span className="mt-1 block max-w-xs">
                        <Meter
                          value={prog}
                          thickness="sm"
                          tone={prog < 50 ? "warning" : "primary"}
                        />
                      </span>
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

        {/* Tutor's letter + ledger */}
        <div className="space-y-7">
          <div>
            <Eyebrow>From your tutor</Eyebrow>
            <div className="mt-3 rounded-[var(--radius)] border border-border bg-card p-5 shadow-soft">
              <p className="font-display text-[15px] italic">Dear {name},</p>
              <p className="mt-2 font-display text-[14.5px] leading-[1.65] text-foreground/85">
                Your SN2 rate intuition is settling in nicely. Stereochemical inversion, however, is
                still wobbling at 45% — let&apos;s turn to stereocenters next.
              </p>
              <p className="mt-3 border-l-2 border-accent pl-3 font-display text-[16px] italic leading-snug text-accent">
                &ldquo;Think of an umbrella flipping inside-out in a gust — that is the Walden
                inversion.&rdquo;
              </p>
              <p className="mt-3 font-display text-[13px] italic text-muted-foreground">
                — TutorBook // Session 07
              </p>
            </div>
          </div>

          <div>
            <Eyebrow>Mastery ledger</Eyebrow>
            <ul className="mt-3 space-y-2.5">
              {sampleMastery.map((m) => (
                <li key={m.concept}>
                  <div className="flex items-baseline justify-between font-display text-[14px]">
                    <span className={m.review ? "text-destructive" : ""}>{m.concept}</span>
                    <span className="font-mono text-[12px] text-muted-foreground">{m.value}%</span>
                  </div>
                  <Meter
                    className="mt-1"
                    value={m.value}
                    thickness="sm"
                    tone={m.review ? "danger" : "success"}
                  />
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
            <div className="mt-3 flex items-center justify-between rounded-[var(--radius)] border border-border bg-card px-3 py-2">
              <span className="text-[12px] text-muted-foreground">Tutor credits</span>
              <div className="flex items-center gap-2">
                <Meter
                  className="w-24"
                  value={credits.data?.percentRemaining ?? 71}
                  tone="accent"
                />
                <Badge tone="accent">{Math.round(credits.data?.percentRemaining ?? 71)}%</Badge>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
