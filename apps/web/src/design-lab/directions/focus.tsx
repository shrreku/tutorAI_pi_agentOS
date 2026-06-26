import type { ReactNode } from "react";
import {
  ArrowRight,
  BookOpen,
  Compass,
  FileText,
  GraduationCap,
  LayoutGrid,
  PanelRightClose,
  Search,
  Sparkles,
  User,
} from "lucide-react";
import { Badge, Button, Dot, Eyebrow, Meter } from "../ui/primitives.js";
import { cn, timeAgo } from "../lib/utils.js";
import {
  sampleActivity,
  sampleMastery,
  sampleNotebooks,
  samplePlan,
  useCredits,
  useMe,
  useNotebooks,
} from "../lib/data.js";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function Dock({ active }: { active: "dashboard" | "map" | "notebook" | "sources" | "account" }) {
  const credits = useCredits();
  const items = [
    { key: "dashboard", label: "Today", icon: LayoutGrid },
    { key: "map", label: "Study Map", icon: Compass },
    { key: "notebook", label: "Notebook", icon: BookOpen },
    { key: "sources", label: "Sources", icon: FileText },
  ] as const;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-elevated/85 p-1.5 shadow-pop backdrop-blur">
        {items.map((it) => {
          const Icon = it.icon;
          const on = it.key === active;
          return (
            <button
              key={it.key}
              className={cn(
                "flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors",
                on
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{it.label}</span>
            </button>
          );
        })}
        <div className="mx-1 h-6 w-px bg-border" />
        <div className="flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          {credits.data ? `${Math.round(credits.data.percentRemaining)}% credits` : "credits"}
        </div>
        <button className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
          <User className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function Reading({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-3xl px-6", className)}>{children}</div>;
}

export function Dashboard() {
  const me = useMe();
  const nb = useNotebooks();
  const notebooks = nb.data && nb.data.length ? nb.data : sampleNotebooks;
  const usingSample = !nb.data || nb.data.length === 0;
  const name = me.data?.user?.displayName?.split(" ")[0] ?? "there";
  const active = samplePlan.find((p) => p.status === "active") ?? samplePlan[0]!;

  return (
    <div className="pb-32 pt-14">
      <Reading>
        <div className="flex items-center justify-between">
          <Eyebrow>
            {new Date().toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </Eyebrow>
          {usingSample && <Badge tone="outline">sample data</Badge>}
        </div>
        <h1 className="mt-3 font-serif text-[40px] leading-[1.05] tracking-[-0.02em]">
          {greeting()}, {name}.
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
          One focused session moves you forward. Pick up where you left off — everything else can
          wait.
        </p>
      </Reading>

      {/* The one thing to do now */}
      <Reading className="mt-9">
        <button className="group block w-full rounded-xl border border-border bg-card p-7 text-left shadow-soft transition-shadow hover:shadow-pop">
          <div className="flex items-center gap-2 text-[12px] font-medium text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" /> CONTINUE WHERE YOU LEFT OFF
          </div>
          <div className="mt-3 font-serif text-[26px] leading-tight">{active.label}</div>
          <p className="mt-2 text-[14px] text-muted-foreground">
            Organic Chemistry I · Live Plan · about {active.minutes} minutes left in this step.
          </p>
          <div className="mt-5 flex items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
              Resume{" "}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
            <span className="text-[13px] text-muted-foreground">or browse the plan below</span>
          </div>
        </button>
      </Reading>

      {/* Quiet two-column: notebooks (editorial list) + today */}
      <Reading className="mt-12 grid grid-cols-1 gap-x-14 gap-y-10 md:grid-cols-[1.3fr_1fr]">
        <section>
          <div className="mb-4 flex items-baseline justify-between border-b border-border pb-2">
            <h2 className="font-serif text-[19px]">Your notebooks</h2>
            <button className="text-[12px] font-medium text-accent hover:underline">
              All notebooks
            </button>
          </div>
          <ul>
            {notebooks.slice(0, 5).map((n, i) => {
              const progress = [60, 32, 88, 12, 45][i % 5]!;
              return (
                <li key={n.id}>
                  <button className="group flex w-full items-center gap-4 py-3.5 text-left">
                    <span className="font-serif text-[15px] tabular-nums text-muted-foreground">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium group-hover:text-accent">
                        {n.title}
                      </span>
                      <span className="mt-1 block">
                        <Meter
                          value={progress}
                          thickness="sm"
                          tone={progress < 50 ? "warning" : "primary"}
                        />
                      </span>
                    </span>
                    <span className="w-16 text-right text-[12px] tabular-nums text-muted-foreground">
                      {progress}%
                    </span>
                    <span className="hidden w-20 text-right text-[11px] text-muted-foreground sm:block">
                      {timeAgo(n.updatedAt)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <div className="mb-4 flex items-baseline justify-between border-b border-border pb-2">
            <h2 className="font-serif text-[19px]">Today</h2>
            <span className="text-[12px] text-muted-foreground">
              {samplePlan.filter((p) => p.status === "done").length}/{samplePlan.length}
            </span>
          </div>
          <ul className="space-y-1">
            {samplePlan.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-1.5">
                <span
                  className={cn(
                    "grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px]",
                    p.status === "done" && "border-success bg-success text-white",
                    p.status === "active" && "border-accent text-accent",
                    p.status === "todo" && "border-border text-muted-foreground",
                  )}
                >
                  {p.status === "done" ? "✓" : p.status === "active" ? "›" : ""}
                </span>
                <span
                  className={cn(
                    "flex-1 text-[14px]",
                    p.status === "done" && "text-muted-foreground line-through",
                  )}
                >
                  {p.label}
                </span>
                <span className="text-[11px] tabular-nums text-muted-foreground">{p.minutes}m</span>
              </li>
            ))}
          </ul>

          <h3 className="mb-3 mt-8 font-serif text-[16px]">Mastery</h3>
          <ul className="space-y-3">
            {sampleMastery.map((m) => (
              <li key={m.concept}>
                <div className="flex items-baseline justify-between text-[13px]">
                  <span className={cn(m.review && "text-destructive")}>{m.concept}</span>
                  <span className="tabular-nums text-muted-foreground">{m.value}%</span>
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
        </section>
      </Reading>

      <Dock active="dashboard" />
    </div>
  );
}

export function Workspace() {
  const nb = useNotebooks();
  const notebook = nb.data?.[0] ?? sampleNotebooks[0]!;

  return (
    <div className="flex min-h-[calc(100dvh-49px)] flex-col pb-28">
      {/* Slim context header */}
      <header className="flex items-center gap-4 border-b border-border px-6 py-3">
        <BookOpen className="h-4 w-4 text-muted-foreground" />
        <span className="text-[14px] font-medium">{notebook.title}</span>
        <span className="text-border">/</span>
        <span className="text-[13px] text-muted-foreground">SN2 mechanism</span>
        <div className="ml-auto flex items-center gap-2">
          <button className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted">
            <Search className="h-4 w-4" />
          </button>
          <Button size="sm" variant="outline">
            <PanelRightClose className="h-4 w-4" /> Map
          </Button>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[1fr_300px]">
        {/* Tutor as reading-first dialogue */}
        <main className="overflow-y-auto px-6 py-10">
          <div className="mx-auto max-w-2xl">
            <Eyebrow>Tutor · grounded in your sources</Eyebrow>
            <div className="mt-5 space-y-6">
              <p className="text-right">
                <span className="inline-block rounded-2xl rounded-br-sm bg-secondary px-4 py-2.5 text-[14px] text-secondary-foreground">
                  Walk me through the backside attack and why configuration inverts.
                </span>
              </p>
              <div>
                <div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                  <GraduationCap className="h-3.5 w-3.5 text-accent" /> TUTORBOOK
                  <span className="ml-1 inline-flex items-center gap-1">
                    <Dot tone="success" /> grounded
                  </span>
                </div>
                <div className="space-y-3 font-serif text-[16px] leading-[1.7] text-foreground/90">
                  <p>
                    In an S<sub>N</sub>2 reaction the nucleophile approaches from the side directly
                    opposite the leaving group. As the new bond forms, the three remaining
                    substituents are forced through a flat, trigonal-bipyramidal transition state —
                    like an umbrella turning inside-out in the wind.
                  </p>
                  <p>
                    Because the attack and departure happen in one concerted step, the stereocentre{" "}
                    <em>inverts</em>: the product is the mirror configuration of the starting
                    material (a Walden inversion).
                  </p>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Badge tone="accent">
                    <BookOpen className="h-3 w-3" /> Clayden · Ch. 7, p. 142
                  </Badge>
                  <Badge tone="outline">Lecture 14 · slide 9</Badge>
                  <button className="text-[12px] font-medium text-accent hover:underline">
                    View evidence →
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-10 rounded-xl border border-border bg-card p-2 shadow-soft">
              <textarea
                rows={2}
                placeholder="Ask a follow-up, or steer the tutor…"
                className="w-full resize-none bg-transparent px-3 py-2 text-[14px] outline-none placeholder:text-muted-foreground"
              />
              <div className="flex items-center justify-between px-2 pb-1">
                <span className="text-[11px] text-muted-foreground">
                  Context: SN2 mechanism · whole notebook
                </span>
                <Button size="sm" variant="accent">
                  Send
                </Button>
              </div>
            </div>
          </div>
        </main>

        {/* Graph as a quiet context strip */}
        <aside className="hidden border-l border-border bg-surface/60 lg:block">
          <div className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Study Map
          </div>
          <div className="relative mx-3 h-64 overflow-hidden rounded-lg border border-border bg-card">
            <MiniMap />
          </div>
          <div className="px-4 py-4">
            <div className="text-[12px] font-medium text-muted-foreground">Linked concepts</div>
            <ul className="mt-2 space-y-1 text-[13px]">
              {["Nucleophilicity", "Leaving groups", "Solvent effects", "Stereochemistry"].map(
                (c) => (
                  <li key={c}>
                    <button className="w-full rounded-md px-2 py-1.5 text-left hover:bg-muted">
                      {c}
                    </button>
                  </li>
                ),
              )}
            </ul>
          </div>
        </aside>
      </div>

      <Dock active="notebook" />
    </div>
  );
}

function MiniMap() {
  const nodes = [
    { x: 18, y: 20, label: "Substitution", tone: "primary" as const },
    { x: 58, y: 14, label: "SN2", tone: "accent" as const },
    { x: 60, y: 56, label: "Inversion", tone: "primary" as const },
    { x: 20, y: 64, label: "Plan", tone: "primary" as const },
  ];
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
      <line x1="26" y1="26" x2="58" y2="20" stroke="var(--border)" strokeWidth="0.6" />
      <line
        x1="62"
        y1="22"
        x2="62"
        y2="54"
        stroke="var(--accent)"
        strokeWidth="0.8"
        strokeDasharray="2 2"
      />
      <line x1="26" y1="64" x2="56" y2="58" stroke="var(--border)" strokeWidth="0.6" />
      {nodes.map((n) => (
        <g key={n.label}>
          <circle
            cx={n.x}
            cy={n.y}
            r="2.4"
            fill={n.tone === "accent" ? "var(--accent)" : "var(--primary)"}
          />
          <text
            x={n.x + 4}
            y={n.y + 1.5}
            fontSize="4.5"
            fill="var(--muted-foreground)"
            fontFamily="var(--font-sans)"
          >
            {n.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
