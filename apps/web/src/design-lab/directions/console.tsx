import { useState } from "react";
import {
  Activity,
  ChevronRight,
  Circle,
  FileText,
  FolderTree,
  GitBranch,
  Hash,
  Search,
  Terminal,
} from "lucide-react";
import { Badge, Button, Dot, Kbd, Meter } from "../ui/primitives.js";
import { cn } from "../lib/utils.js";
import {
  sampleActivity,
  sampleMastery,
  sampleNotebooks,
  samplePlan,
  sampleWeek,
  useCredits,
  useNotebooks,
} from "../lib/data.js";

function Spark({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * 100},${28 - (v / max) * 24}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="h-6 w-20">
      <polyline
        points={pts}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.6"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function Dashboard() {
  const nb = useNotebooks();
  const credits = useCredits();
  const notebooks = nb.data && nb.data.length ? nb.data : sampleNotebooks;
  const usingSample = !nb.data || nb.data.length === 0;
  const progressByIndex = [60, 32, 88, 12, 45, 73];

  return (
    <div className="flex h-[calc(100dvh-49px)] flex-col font-sans">
      {/* command bar */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-2 text-[12px]">
        <Terminal className="h-3.5 w-3.5 text-accent" />
        <span className="font-mono text-muted-foreground">~/studyagent</span>
        <ChevronRight className="h-3 w-3 text-muted-foreground" />
        <span className="font-mono">overview</span>
        <button className="ml-auto flex items-center gap-2 rounded-md border border-border bg-input px-2.5 py-1 text-muted-foreground hover:text-foreground">
          <Search className="h-3.5 w-3.5" /> jump to… <Kbd>⌘K</Kbd>
        </button>
      </div>

      <div className="grid flex-1 grid-cols-[220px_1fr_300px] overflow-hidden">
        {/* left: notebooks explorer */}
        <aside className="overflow-y-auto border-r border-border bg-surface/60 py-2">
          <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <FolderTree className="h-3.5 w-3.5" /> notebooks{" "}
            <span className="ml-auto font-mono">{notebooks.length}</span>
          </div>
          {notebooks.map((n, i) => (
            <button
              key={n.id}
              className="group flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-muted"
            >
              <Circle
                className={cn(
                  "h-2 w-2 shrink-0",
                  progressByIndex[i % 6]! > 50
                    ? "fill-accent text-accent"
                    : "fill-warning text-warning",
                )}
              />
              <span className="flex-1 truncate font-mono text-[12px]">{n.title}</span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {progressByIndex[i % 6]!}%
              </span>
            </button>
          ))}
        </aside>

        {/* main: dense table + activity */}
        <main className="overflow-y-auto console-grid">
          <div className="flex items-center justify-between px-5 pt-4">
            <div>
              <h1 className="text-[18px] font-semibold tracking-tight">Overview</h1>
              <p className="font-mono text-[12px] text-muted-foreground">
                {notebooks.length} notebooks · 14 concepts tracked · 8-day streak
              </p>
            </div>
            {usingSample && <Badge tone="outline">sample data</Badge>}
          </div>

          {/* metric strip */}
          <div className="grid grid-cols-4 gap-px overflow-hidden rounded-lg border border-border bg-border mx-5 mt-4">
            {[
              ["streak", "8d", "+2"],
              ["mastered", "14", "+3"],
              ["sources", "7", "1200p"],
              ["credits", `${Math.round(credits.data?.percentRemaining ?? 71)}%`, "~18h"],
            ].map(([k, v, d]) => (
              <div key={k} className="bg-card px-4 py-3">
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {k}
                </div>
                <div className="mt-1 font-mono text-[22px] font-semibold leading-none">{v}</div>
                <div className="mt-1 font-mono text-[11px] text-accent">{d}</div>
              </div>
            ))}
          </div>

          {/* notebooks table */}
          <div className="mx-5 mt-5 overflow-hidden rounded-lg border border-border">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-surface/80 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 font-medium">notebook</th>
                  <th className="px-3 py-2 font-medium">progress</th>
                  <th className="px-3 py-2 font-medium">trend</th>
                  <th className="px-3 py-2 text-right font-medium">status</th>
                </tr>
              </thead>
              <tbody>
                {notebooks.slice(0, 6).map((n, i) => (
                  <tr
                    key={n.id}
                    className="border-b border-border/60 last:border-0 hover:bg-muted/50"
                  >
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{n.title}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {["chem", "math", "bio", "phys", "econ", "hist"][i % 6]!}/notebook
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Meter
                          value={progressByIndex[i % 6]!}
                          thickness="sm"
                          tone={progressByIndex[i % 6]! < 40 ? "warning" : "accent"}
                        />
                        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                          {progressByIndex[i % 6]!}%
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <Spark
                        data={sampleWeek.map((w) => w.v).map((v, k) => v + ((i * 7 + k) % 20))}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {progressByIndex[i % 6]! < 40 ? (
                        <Badge tone="warning">behind</Badge>
                      ) : progressByIndex[i % 6]! > 85 ? (
                        <Badge tone="success">on track</Badge>
                      ) : (
                        <Badge tone="neutral">active</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* activity log */}
          <div className="mx-5 my-5">
            <div className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              <Activity className="h-3.5 w-3.5" /> activity.log{" "}
              <span className="text-muted-foreground/60">tail -f</span>
            </div>
            <div className="space-y-1 rounded-lg border border-border bg-card p-3 font-mono text-[12px]">
              {sampleActivity.map((a) => (
                <div key={a.id} className="flex gap-3">
                  <span className="text-muted-foreground/60">{a.at.padStart(6)}</span>
                  <span
                    className={cn(
                      a.kind === "quiz"
                        ? "text-success"
                        : a.kind === "source"
                          ? "text-primary"
                          : "text-accent",
                    )}
                  >
                    {a.kind.toUpperCase().padEnd(6)}
                  </span>
                  <span className="flex-1 text-foreground/90">{a.title}</span>
                  <span className="hidden text-muted-foreground sm:inline">{a.meta}</span>
                </div>
              ))}
            </div>
          </div>
        </main>

        {/* right: now / next */}
        <aside className="overflow-y-auto border-l border-border bg-surface/60 px-4 py-4">
          <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            now / next
          </div>
          <div className="mt-3 rounded-lg border border-accent/40 bg-accent/5 p-3">
            <div className="text-[12px] font-medium text-accent">RESUME</div>
            <div className="mt-1 text-[14px] font-semibold">Backside attack stereochem</div>
            <Button size="sm" variant="accent" className="mt-3 w-full">
              Continue →
            </Button>
          </div>
          <div className="mt-4 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            queue
          </div>
          <ol className="mt-2 space-y-1.5">
            {samplePlan.map((p) => (
              <li key={p.id} className="flex items-center gap-2 font-mono text-[12px]">
                <span
                  className={cn(
                    p.status === "done"
                      ? "text-success"
                      : p.status === "active"
                        ? "text-accent"
                        : "text-muted-foreground",
                  )}
                >
                  {p.status === "done" ? "[x]" : p.status === "active" ? "[>]" : "[ ]"}
                </span>
                <span
                  className={cn(
                    "flex-1 truncate",
                    p.status === "done" && "text-muted-foreground line-through",
                  )}
                >
                  {p.label}
                </span>
                <span className="text-muted-foreground">{p.minutes}m</span>
              </li>
            ))}
          </ol>
          <div className="mt-5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            mastery.tsv
          </div>
          <div className="mt-2 space-y-2">
            {sampleMastery.map((m) => (
              <div key={m.concept} className="flex items-center gap-2 font-mono text-[12px]">
                <span className="flex-1 truncate">{m.concept}</span>
                <Meter
                  className="w-16"
                  value={m.value}
                  thickness="sm"
                  tone={m.review ? "danger" : "accent"}
                />
                <span className="w-9 text-right tabular-nums text-muted-foreground">
                  {m.value}%
                </span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

const TREE = [
  { label: "sources/", depth: 0, icon: FolderTree },
  { label: "Clayden_OrgChem.pdf", depth: 1, icon: FileText, ok: true },
  { label: "SN2_Mechanisms.pdf", depth: 1, icon: FileText, ok: true },
  { label: "Lecture_07.pptx", depth: 1, icon: FileText, ok: true },
  { label: "curriculum/", depth: 0, icon: GitBranch },
  { label: "Ch.7 · Substitution", depth: 1, icon: Hash, active: true },
  { label: "SN1 reactions", depth: 1, icon: Hash },
  { label: "Elimination", depth: 1, icon: Hash },
];

const NODES = [
  { id: "c", x: 60, y: 70, kind: "CURR", title: "Ch.7 Substitution" },
  { id: "s", x: 300, y: 110, kind: "CONCEPT", title: "SN2 mechanism", active: true },
  { id: "i", x: 320, y: 250, kind: "OBJ", title: "Inversion" },
  { id: "r", x: 540, y: 130, kind: "CHECK", title: "SN2 rate" },
];

export function Workspace() {
  const nb = useNotebooks();
  const notebook = nb.data?.[0] ?? sampleNotebooks[0]!;
  const [tab, setTab] = useState<"tutor" | "map">("map");

  return (
    <div className="flex h-[calc(100dvh-49px)] flex-col">
      <div className="grid flex-1 grid-cols-[230px_1fr_300px] overflow-hidden">
        {/* explorer */}
        <aside className="overflow-y-auto border-r border-border bg-surface/60 py-2 font-mono text-[12px]">
          <div className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            {notebook.title}
          </div>
          {TREE.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.label}
                className={cn(
                  "flex w-full items-center gap-2 py-1.5 pr-3 text-left hover:bg-muted",
                  t.active && "bg-accent/10 text-accent",
                )}
                style={{ paddingLeft: 12 + t.depth * 14 }}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                <span className="flex-1 truncate">{t.label}</span>
                {"ok" in t && t.ok && <Dot tone="success" />}
              </button>
            );
          })}
        </aside>

        {/* center: tabs */}
        <main className="flex flex-col overflow-hidden">
          <div className="flex items-center gap-1 border-b border-border bg-surface/40 px-2">
            {(["tutor", "map"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "border-b-2 px-3 py-2 font-mono text-[12px]",
                  tab === t
                    ? "border-accent text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t === "tutor" ? "tutor.chat" : "study.map"}
              </button>
            ))}
          </div>

          {tab === "map" ? (
            <div className="relative flex-1 console-grid">
              <svg className="absolute inset-0 h-full w-full">
                <path
                  d="M 180 90 C 250 95 250 120 300 125"
                  fill="none"
                  stroke="var(--border)"
                  strokeWidth="1.5"
                />
                <path
                  d="M 360 150 C 360 200 360 220 370 250"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2"
                  strokeDasharray="4 4"
                />
                <path
                  d="M 440 130 C 490 132 500 132 540 145"
                  fill="none"
                  stroke="var(--border)"
                  strokeWidth="1.5"
                />
              </svg>
              {NODES.map((n) => (
                <button
                  key={n.id}
                  className={cn(
                    "absolute w-40 rounded-md border bg-card p-2.5 text-left",
                    "active" in n && n.active
                      ? "border-accent ring-1 ring-accent/30"
                      : "border-border",
                  )}
                  style={{ left: n.x, top: n.y }}
                >
                  <div
                    className={cn(
                      "font-mono text-[10px]",
                      "active" in n && n.active ? "text-accent" : "text-muted-foreground",
                    )}
                  >
                    {n.kind}
                  </div>
                  <div className="mt-0.5 text-[13px] font-medium">{n.title}</div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-5">
              <div className="mx-auto max-w-xl space-y-4">
                <div className="rounded-lg border border-border bg-card p-3 text-[13px]">
                  <span className="font-mono text-[11px] text-muted-foreground">user&gt;</span>{" "}
                  Explain the backside attack.
                </div>
                <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 text-[13px] leading-relaxed">
                  <div className="mb-1 flex items-center gap-1.5 font-mono text-[11px] text-accent">
                    <Dot tone="accent" /> tutor
                  </div>
                  The nucleophile attacks opposite the leaving group; the concerted transition state
                  inverts the stereocentre (Walden inversion).
                  <div className="mt-2">
                    <Badge tone="accent">Clayden · p.142</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-input px-3 py-2">
                  <span className="font-mono text-[12px] text-accent">›</span>
                  <input
                    className="flex-1 bg-transparent font-mono text-[13px] outline-none placeholder:text-muted-foreground"
                    placeholder="message tutor…"
                  />
                </div>
              </div>
            </div>
          )}
        </main>

        {/* inspector */}
        <aside className="overflow-y-auto border-l border-border bg-surface/60 p-4">
          <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            inspector
          </div>
          <div className="mt-2 text-[15px] font-semibold">SN2 mechanism</div>
          <Badge tone="accent" className="mt-2">
            concept · verified
          </Badge>
          <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
            One-step bimolecular nucleophilic substitution. Rate depends on both nucleophile and
            substrate.
          </p>
          <div className="mt-4 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            evidence
          </div>
          <div className="mt-2 space-y-2">
            {[
              ["Clayden", "p.142"],
              ["Lecture 07", "slide 14"],
            ].map(([t, m]) => (
              <div key={t} className="rounded-md border border-border p-2 text-[12px]">
                <div className="font-medium">{t}</div>
                <div className="font-mono text-[11px] text-muted-foreground">{m}</div>
              </div>
            ))}
          </div>
        </aside>
      </div>

      {/* status bar */}
      <div className="flex items-center gap-4 border-t border-border bg-surface/80 px-4 py-1.5 font-mono text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Dot tone="success" /> grounded
        </span>
        <span>24 nodes · 31 edges</span>
        <span className="ml-auto">obj 5 · SN2 mechanism</span>
        <span>UTF-8</span>
        <span>main</span>
      </div>
    </div>
  );
}
