import { useState, type ReactNode } from "react";
import {
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronDown,
  FileText,
  GraduationCap,
  ListChecks,
  Loader2,
  Maximize2,
  Paperclip,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  Wand2,
} from "lucide-react";
import { cn } from "../lib/utils.js";
import { Badge, Button, Dot } from "./primitives.js";

/* ============================================================================
   Chat-primary workspace. The tutoring system runs through chat, so the chat
   column is the focus and is always >= the study-map column. The agent
   "working trace" (tool calls, retrieval, thinking, composing) is first-class.
   All themed via tokens, so each direction looks distinct.
   ============================================================================ */

type TraceKind = "state" | "tool" | "think" | "check" | "evidence" | "write";
export type TraceStep = {
  kind: TraceKind;
  label: string;
  detail?: string;
  tool?: string;
  meta?: string;
  status?: "done" | "running";
};

const TRACE_ICON: Record<TraceKind, typeof Brain> = {
  state: ListChecks,
  tool: Wand2,
  think: Brain,
  check: CheckCircle2,
  evidence: BookOpen,
  write: Sparkles,
};

export const DEMO_TRACE: TraceStep[] = [
  {
    kind: "state",
    label: "Read learning state",
    meta: "0.3s",
    detail: "Mastery — SN2 92% · Stereochemistry 45% (needs review) · Nucleophilicity 74%",
    status: "done",
  },
  {
    kind: "tool",
    label: "Retrieved evidence",
    tool: 'search_sources("backside attack stereochemistry")',
    meta: "3 hits",
    detail: "Clayden p.142 · Lecture 14 · Wikipedia: SN2",
    status: "done",
  },
  {
    kind: "think",
    label: "Reasoning",
    detail:
      "They're shaky on stereochemistry (45%). Anchor the explanation on the trigonal-bipyramidal transition state and the umbrella-flip analogy, then cite Ch. 7.",
    status: "done",
  },
  {
    kind: "check",
    label: "Checked prerequisite",
    meta: "ok",
    detail: "Nucleophilicity is solid — safe to go straight to inversion.",
    status: "done",
  },
  { kind: "write", label: "Composing answer", status: "running" },
];

export function AgentTrace({
  steps,
  defaultOpen = true,
  working = false,
}: {
  steps: TraceStep[];
  defaultOpen?: boolean;
  working?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const done = steps.filter((s) => s.status !== "running").length;
  return (
    <div className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface/60">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        {working ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
        ) : (
          <Sparkles className="h-3.5 w-3.5 text-accent" />
        )}
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Agent activity
        </span>
        <span className="text-[11px] text-muted-foreground">
          · {done}/{steps.length} steps
        </span>
        <ChevronDown
          className={cn(
            "ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="space-y-0 px-3 pb-3">
          {steps.map((s, i) => {
            const Icon = TRACE_ICON[s.kind];
            const running = s.status === "running";
            const last = i === steps.length - 1;
            return (
              <div key={i} className="relative flex gap-2.5 pb-2.5 last:pb-0">
                {!last && (
                  <span
                    className="absolute left-[11px] top-6 bottom-0 w-px bg-border"
                    aria-hidden
                  />
                )}
                <span
                  className={cn(
                    "mt-0.5 grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border",
                    running
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border bg-card text-muted-foreground",
                  )}
                >
                  {running ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Icon className="h-3 w-3" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={cn("text-[13px] font-medium", running && "text-accent")}>
                      {s.label}
                    </span>
                    {s.meta && (
                      <span className="font-mono text-[10px] text-muted-foreground">{s.meta}</span>
                    )}
                  </div>
                  {s.tool && (
                    <div className="mt-1 inline-flex max-w-full items-center gap-1.5 truncate rounded-md border border-border bg-card px-2 py-1 font-mono text-[11px] text-muted-foreground">
                      <Wand2 className="h-3 w-3 shrink-0 text-accent" />
                      <span className="truncate">{s.tool}</span>
                    </div>
                  )}
                  {s.detail && (
                    <p
                      className={cn(
                        "mt-1 text-[12px] leading-relaxed text-muted-foreground",
                        s.kind === "think" && "border-l-2 border-border pl-2 italic",
                      )}
                    >
                      {s.detail}
                    </p>
                  )}
                  {running && (
                    <div className="mt-1 flex gap-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.2s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.1s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function UserBubble({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[82%] rounded-[var(--radius)] rounded-br-sm bg-secondary px-3.5 py-2.5 text-[14px] text-secondary-foreground">
        {children}
      </div>
    </div>
  );
}

export function Citation({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent/12 px-2 py-0.5 text-[11px] font-medium text-accent">
      <BookOpen className="h-3 w-3" />
      {children}
    </span>
  );
}

export function AgentMessage({
  trace,
  working,
  children,
  citations,
  artifact,
}: {
  trace?: TraceStep[];
  working?: boolean;
  children: ReactNode;
  citations?: ReactNode;
  artifact?: { title: string; sub: string };
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
        <span className="grid h-5 w-5 place-items-center rounded-md bg-primary text-primary-foreground">
          <GraduationCap className="h-3 w-3" />
        </span>
        TutorBook
        <span className="inline-flex items-center gap-1">
          <Dot tone="success" /> grounded in your sources
        </span>
      </div>
      {trace && <AgentTrace steps={trace} working={working ?? false} />}
      <div className="space-y-2.5 font-display text-[15px] leading-[1.65] text-foreground/90">
        {children}
      </div>
      {citations && <div className="flex flex-wrap gap-1.5">{citations}</div>}
      {artifact && (
        <button className="flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-border bg-card p-2.5 text-left transition-colors hover:border-accent">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-accent/12 text-accent">
            <FileText className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold">{artifact.title}</span>
            <span className="block text-[12px] text-muted-foreground">{artifact.sub}</span>
          </span>
          <span className="ml-auto text-[12px] font-medium text-accent">Open →</span>
        </button>
      )}
    </div>
  );
}

export function Composer({
  context = "Notebook",
  value = "",
  onChange,
  onSend,
  disabled = false,
}: {
  context?: string;
  value?: string;
  onChange?: (value: string) => void;
  onSend?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-border bg-card p-2 shadow-soft">
      <div className="mb-1.5 flex items-center gap-1.5 px-1">
        <Badge tone="accent">
          <Sparkles className="h-3 w-3" /> {context}
        </Badge>
        <span className="text-[11px] text-muted-foreground">whole-notebook context</span>
      </div>
      <textarea
        rows={2}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend?.();
          }
        }}
        disabled={disabled}
        placeholder="Ask a follow-up, or steer the tutor…"
        className="w-full resize-none bg-transparent px-2 py-1 text-[14px] outline-none placeholder:text-muted-foreground disabled:opacity-60"
      />
      <div className="flex items-center gap-1 px-1 pt-1">
        <button
          type="button"
          className="grid h-8 w-8 place-items-center rounded-[var(--radius-sm)] text-muted-foreground hover:bg-muted"
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="grid h-8 w-8 place-items-center rounded-[var(--radius-sm)] text-muted-foreground hover:bg-muted"
        >
          <SlidersHorizontal className="h-4 w-4" />
        </button>
        <span className="ml-auto text-[11px] text-muted-foreground">↵ send · ⇧↵ newline</span>
        <Button size="sm" variant="accent" disabled={disabled || !value.trim()} onClick={onSend}>
          <Send className="h-3.5 w-3.5" /> Send
        </Button>
      </div>
    </div>
  );
}

/* The default chat transcript — rich, with a live working trace. Directions
   render <ChatPane/> and theme it via tokens. */
export function ChatPane({
  context = "SN2 mechanism",
  className,
  header = true,
}: {
  context?: string;
  className?: string;
  header?: boolean;
}) {
  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {header && (
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <span className="grid h-6 w-6 place-items-center rounded-[var(--radius-sm)] bg-primary text-primary-foreground">
            <GraduationCap className="h-3.5 w-3.5" />
          </span>
          <span className="font-display text-[14px] font-semibold">Tutor</span>
          <Badge tone="neutral" className="ml-1">
            {context}
          </Badge>
          <button className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] text-muted-foreground hover:bg-muted">
            History
          </button>
          <button className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-muted">
            <SlidersHorizontal className="h-4 w-4" />
          </button>
        </div>
      )}
      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5">
        <UserBubble>
          Walk me through the backside attack and why the configuration inverts.
        </UserBubble>
        <AgentMessage
          trace={DEMO_TRACE}
          working
          citations={
            <>
              <Citation>Clayden · Ch. 7, p. 142</Citation>
              <Citation>Lecture 14 · slide 9</Citation>
            </>
          }
          artifact={{
            title: "SN2 stereochemistry · 5-card deck",
            sub: "Generated study aid · tap to review",
          }}
        >
          <p>
            In an S<sub>N</sub>2 reaction the nucleophile approaches from the side directly opposite
            the leaving group. As the new bond forms, the three remaining substituents are pushed
            through a flat, trigonal-bipyramidal transition state — like an umbrella turning
            inside-out in the wind.
          </p>
          <p>
            Because bond-making and bond-breaking happen in one concerted step, the stereocentre{" "}
            <em>inverts</em>: the product is the mirror configuration of the starting material — a
            Walden inversion.
          </p>
        </AgentMessage>
      </div>
      <div className="border-t border-border p-3">
        <Composer context={context} />
      </div>
    </div>
  );
}

/* Map (secondary) pane: header + slot for a graph. */
export function MapPane({
  title = "Study Map",
  meta = "24 nodes · 31 edges",
  children,
  className,
  actions,
}: {
  title?: string;
  meta?: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}) {
  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {title}
        </span>
        <span className="text-[11px] text-muted-foreground">· {meta}</span>
        <div className="ml-auto flex items-center gap-1">
          {actions}
          <button className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-muted">
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="relative flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

/* Workspace header (notebook context). */
export function WorkspaceHeader({
  notebook,
  ready = "7 / 7 sources ready",
  right,
}: {
  notebook: string;
  ready?: string;
  right?: ReactNode;
}) {
  return (
    <header className="flex items-center gap-3 border-b border-border bg-elevated/60 px-4 py-2.5">
      <BookOpen className="h-4 w-4 text-muted-foreground" />
      <span className="font-display text-[14px] font-semibold">{notebook}</span>
      <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <Dot tone="success" /> {ready}
      </span>
      <div className="ml-auto flex items-center gap-2">
        <div className="hidden items-center gap-2 rounded-full border border-border bg-card px-2.5 py-1.5 text-muted-foreground sm:flex">
          <Search className="h-3.5 w-3.5" />
          <span className="text-[12px]">Search notebook</span>
        </div>
        {right}
      </div>
    </header>
  );
}

/* Chat-primary split: chat column is always wider than the map column. */
export function SplitWorkspace({
  chat,
  map,
  chatRatio = 1.45,
}: {
  chat: ReactNode;
  map: ReactNode;
  chatRatio?: number;
}) {
  return (
    <div
      className="grid min-h-0 flex-1"
      style={{ gridTemplateColumns: `minmax(0, ${chatRatio}fr) minmax(0, 1fr)` }}
    >
      <div className="flex min-h-0 flex-col border-r border-border">{chat}</div>
      <div className="hidden min-h-0 flex-col lg:flex">{map}</div>
    </div>
  );
}
