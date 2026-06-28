import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  FileText,
  GraduationCap,
  LayoutGrid,
  Menu,
  MessageSquare,
  Play,
  Send,
  Sparkles,
  Target,
} from "lucide-react";
import { Badge, Button, Dot, Meter, Segmented } from "../../ui/primitives.js";
import { Logo, Wordmark, Grain } from "../../ui/brand.js";
import { Reveal, Stagger, StaggerItem, Lift, motion, useReducedMotion } from "../../ui/motion.js";
import { cn } from "../../ui/cn.js";

/* ============================================================================
   DemoPage — "Folio" interactive product tour. A faux product walkthrough:
   a larger chat + study-map mock driven by step tabs, with each step
   highlighting a different surface of the tutoring OS. Self-contained full
   page (own nav + footer), props { navigate }.
   ============================================================================ */

const NAV = [
  ["Features", "/#features"],
  ["How it works", "/#how"],
  ["Pricing", "/#pricing"],
] as const;

type StepId = "ask" | "evidence" | "surface" | "mastery";

type ChatTurn =
  | { role: "user"; text: string }
  | { role: "tutor"; text: string; tool?: string; cite?: string }
  | { role: "surface" };

type Step = {
  id: StepId;
  label: string;
  eyebrow: string;
  title: string;
  blurb: string;
  icon: typeof MessageSquare;
  chat: ChatTurn[];
  highlight: "concept" | "objective" | "curriculum";
};

const STEPS: readonly [Step, ...Step[]] = [
  {
    id: "ask",
    label: "Ask",
    eyebrow: "Step 1 — Ask anything",
    title: "Start a conversation grounded in your course.",
    blurb:
      "Ask in plain language. The tutor knows exactly which notebook you're in and which sources it can draw from — no copy-pasting context.",
    icon: MessageSquare,
    highlight: "concept",
    chat: [{ role: "user", text: "Why does the configuration invert in an SN2 reaction?" }],
  },
  {
    id: "evidence",
    label: "Retrieve",
    eyebrow: "Step 2 — Grounded answers",
    title: "Watch it retrieve evidence, then cite it.",
    blurb:
      "The agent searches your sources in the open, reasons over the passages it finds, and links every claim back to the exact page or slide.",
    icon: BookOpen,
    highlight: "concept",
    chat: [
      { role: "user", text: "Why does the configuration invert in an SN2 reaction?" },
      {
        role: "tutor",
        tool: 'search_sources("backside attack")',
        text: "The nucleophile attacks opposite the leaving group, forcing the three substituents through a flat transition state — like an umbrella in the wind. The stereocentre inverts.",
        cite: "Clayden · p. 142",
      },
    ],
  },
  {
    id: "surface",
    label: "Explore",
    eyebrow: "Step 3 — Interactive surfaces",
    title: "Open the right learning surface on demand.",
    blurb:
      "When a diagram beats a paragraph, the tutor generates one. Simulations, worked examples, MCP apps, and quizzes appear right inside the thread.",
    icon: LayoutGrid,
    highlight: "objective",
    chat: [
      { role: "user", text: "Can you show me the transition state?" },
      {
        role: "tutor",
        text: "Here's an interactive view — drag to rotate the trigonal-bipyramidal transition state.",
      },
      { role: "surface" },
    ],
  },
  {
    id: "mastery",
    label: "Master",
    eyebrow: "Step 4 — Provable mastery",
    title: "Track what you've actually learned.",
    blurb:
      "Quizzes and spaced recall lift weak concepts. Your Study Map updates as you go, so you always know what to study next.",
    icon: Target,
    highlight: "curriculum",
    chat: [
      { role: "user", text: "Quiz me before I move on." },
      {
        role: "tutor",
        text: "Nice — 4 of 5 correct. I've marked SN2 stereochemistry as mastered and queued a recap of leaving-group ability for tomorrow.",
      },
    ],
  },
];

const SOURCES = [
  ["Clayden — Organic Chemistry", "PDF · 1,234 pp", true],
  ["Lecture 12 — Substitution", "Slides · 38"],
  ["Problem set 7", "PDF · 6 pp"],
] as const;

const MASTERY = [
  ["SN2 mechanism", 92, "success"],
  ["Stereochemistry", 78, "accent"],
  ["Leaving groups", 41, "warning"],
] as const;

const STATS = [
  ["Sources cited", "every answer"],
  ["Surfaces", "6 types"],
  ["Setup time", "< 2 min"],
] as const;

function Nav({ navigate }: { navigate: (p: string) => void }) {
  return (
    <motion.header
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 0.61, 0.36, 1] }}
      className="sticky top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur"
    >
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-5 py-3">
        <button onClick={() => navigate("/")} aria-label="TutorBook home">
          <Wordmark />
        </button>
        <nav className="ml-4 hidden items-center gap-6 md:flex">
          {NAV.map(([label, href]) => (
            <a
              key={label}
              href={href}
              onClick={(e) => {
                e.preventDefault();
                navigate(href);
              }}
              className="cursor-pointer text-[14px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="hidden sm:inline-flex"
            onClick={() => navigate("/login")}
          >
            Sign in
          </Button>
          <Button variant="primary" size="sm" onClick={() => navigate("/login")}>
            Get started <ArrowRight className="h-4 w-4" />
          </Button>
          <button
            className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted md:hidden"
            aria-label="Menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>
    </motion.header>
  );
}

/* --------------------------------------------------------- transition-state art */
function TransitionStateArt() {
  return (
    <svg viewBox="0 0 220 120" className="w-full" role="img" aria-label="SN2 transition state">
      <defs>
        <radialGradient id="demo-node" cx="0.4" cy="0.35" r="0.8">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--primary)" />
        </radialGradient>
      </defs>
      {/* bond lines */}
      <line
        x1="30"
        y1="60"
        x2="110"
        y2="60"
        stroke="var(--accent)"
        strokeWidth="2.5"
        strokeDasharray="4 5"
      />
      <line
        x1="110"
        y1="60"
        x2="190"
        y2="60"
        stroke="var(--muted-foreground)"
        strokeWidth="2.5"
        strokeDasharray="4 5"
        opacity="0.6"
      />
      <line x1="110" y1="60" x2="110" y2="20" stroke="var(--border)" strokeWidth="2" />
      <line x1="110" y1="60" x2="80" y2="100" stroke="var(--border)" strokeWidth="2" />
      <line x1="110" y1="60" x2="140" y2="100" stroke="var(--border)" strokeWidth="2" />
      {/* nucleophile + leaving group */}
      <circle cx="30" cy="60" r="14" fill="url(#demo-node)" />
      <text x="30" y="64" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">
        Nu
      </text>
      <circle cx="190" cy="60" r="13" fill="var(--card)" stroke="var(--border)" strokeWidth="1.5" />
      <text
        x="190"
        y="64"
        textAnchor="middle"
        fontSize="10"
        fontWeight="700"
        fill="var(--muted-foreground)"
      >
        LG
      </text>
      {/* central carbon */}
      <circle cx="110" cy="60" r="16" fill="var(--gold)" opacity="0.18" />
      <circle cx="110" cy="60" r="10" fill="var(--gold)" />
      <text x="110" y="64" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">
        C
      </text>
      {/* H substituents */}
      {[
        [110, 20],
        [80, 100],
        [140, 100],
      ].map(([cx, cy], i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r="7"
          fill="var(--surface)"
          stroke="var(--border)"
          strokeWidth="1.5"
        />
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------- chat bubbles */
function ChatStream({ turns }: { turns: ChatTurn[] }) {
  return (
    <div className="flex flex-col gap-4">
      {turns.map((turn, i) => {
        if (turn.role === "user") {
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.08 }}
              className="flex justify-end"
            >
              <span className="max-w-[82%] rounded-2xl rounded-br-sm bg-secondary px-3.5 py-2 text-[13.5px] text-secondary-foreground">
                {turn.text}
              </span>
            </motion.div>
          );
        }
        if (turn.role === "surface") {
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="rounded-xl border border-accent/40 bg-surface/70 p-3.5 ring-1 ring-accent/10"
            >
              <div className="mb-2 flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-wider text-accent">
                <LayoutGrid className="h-3 w-3" /> Interactive surface · 3D model
              </div>
              <TransitionStateArt />
            </motion.div>
          );
        }
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.08 }}
          >
            <div className="mb-1.5 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
              <span className="grid h-5 w-5 place-items-center rounded-md bg-primary text-primary-foreground">
                <GraduationCap className="h-3 w-3" />
              </span>
              TutorBook
              <span className="inline-flex items-center gap-1 text-success">
                <Dot tone="success" pulse /> grounded
              </span>
            </div>
            {turn.tool && (
              <div className="rounded-lg border border-border bg-surface/60 p-2.5">
                <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-wider text-accent">
                  <Sparkles className="h-3 w-3" /> Agent · retrieved evidence
                </div>
                <div className="mt-1 font-mono text-[10.5px] text-muted-foreground">
                  {turn.tool}
                </div>
              </div>
            )}
            <p className="mt-2.5 font-display text-[14.5px] leading-relaxed text-foreground/90">
              {turn.text}
            </p>
            {turn.cite && (
              <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-accent/12 px-2 py-0.5 text-[11px] font-medium text-accent">
                <BookOpen className="h-3 w-3" /> {turn.cite}
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ study-map side */
function StudyMap({ highlight }: { highlight: Step["highlight"] }) {
  const node = (key: Step["highlight"]) =>
    highlight === key ? "border-accent ring-2 ring-accent/20" : "border-border";
  return (
    <div className="rule-grid relative min-h-[260px] p-4">
      <motion.div
        layout
        className={cn(
          "absolute left-4 top-5 w-40 rounded-lg border bg-card p-2.5 shadow-soft transition-colors",
          node("curriculum"),
        )}
      >
        <div className="text-[9px] font-semibold uppercase tracking-wider text-gold">
          Curriculum
        </div>
        <div className="text-[12.5px] font-semibold">Ch. 7 · Substitution</div>
      </motion.div>
      <motion.div
        layout
        className={cn(
          "absolute right-4 top-20 w-36 rounded-lg border bg-card p-2.5 shadow-soft transition-colors",
          node("concept"),
        )}
      >
        <div className="text-[9px] font-semibold uppercase tracking-wider text-accent">Concept</div>
        <div className="text-[12.5px] font-semibold">SN2 mechanism</div>
      </motion.div>
      <motion.div
        layout
        className={cn(
          "absolute bottom-5 left-8 w-32 rounded-lg border bg-card p-2.5 shadow-soft transition-colors",
          node("objective"),
        )}
      >
        <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
          Objective
        </div>
        <div className="text-[12px] font-semibold">Backside attack</div>
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------- the larger demo mock */
function DemoConsole({
  step,
  autoplay,
  onToggleAutoplay,
}: {
  step: Step;
  autoplay: boolean;
  onToggleAutoplay: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-pop">
      {/* window chrome */}
      <div className="flex items-center gap-1.5 border-b border-border bg-surface/70 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-warning/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
        <span className="ml-3 truncate font-mono text-[11px] text-muted-foreground">
          tutorbook.app/notebook/organic-chemistry
        </span>
        <button
          onClick={onToggleAutoplay}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <Play className={cn("h-3 w-3", autoplay && "text-accent")} />
          {autoplay ? "Auto-play on" : "Auto-play"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[64px_1.5fr_1fr]">
        {/* sources rail */}
        <div className="hidden flex-col items-center gap-3 border-r border-border bg-surface/40 py-4 lg:flex">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <FileText className="h-4 w-4" />
          </span>
          {SOURCES.map(([, , active], i) => (
            <span
              key={i}
              className={cn(
                "h-9 w-9 rounded-lg border",
                active ? "border-accent bg-accent/12" : "border-border bg-card",
              )}
            />
          ))}
        </div>

        {/* chat column */}
        <div className="min-h-[320px] border-b border-border p-5 lg:border-b-0 lg:border-r">
          <AnimatePresenceLite stepId={step.id}>
            <ChatStream turns={step.chat} />
          </AnimatePresenceLite>
          {/* faux composer */}
          <div className="mt-5 flex items-center gap-2 rounded-xl border border-border bg-surface/60 px-3 py-2">
            <span className="text-[13px] text-muted-foreground">Ask about your sources…</span>
            <span className="ml-auto grid h-7 w-7 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Send className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>

        {/* right panel: study map + mastery */}
        <div className="flex flex-col">
          <div className="border-b border-border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Study map
          </div>
          <StudyMap highlight={step.highlight} />
          <div className="border-t border-border p-4">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Mastery
            </div>
            <div className="space-y-3">
              {MASTERY.map(([name, value, tone]) => (
                <div key={name}>
                  <div className="mb-1 flex items-center justify-between text-[12px]">
                    <span className="font-medium text-foreground/90">{name}</span>
                    <span className="text-muted-foreground">{value}%</span>
                  </div>
                  <Meter value={value} tone={tone} thickness="sm" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* A tiny remount-on-step wrapper so chat bubbles re-animate per step. */
function AnimatePresenceLite({ stepId, children }: { stepId: StepId; children: ReactNode }) {
  return <div key={stepId}>{children}</div>;
}

export function DemoPage({ navigate }: { navigate: (path: string) => void }) {
  const [active, setActive] = useState<StepId>("evidence");
  const [autoplay, setAutoplay] = useState(false);
  const reduce = useReducedMotion();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // STEPS is a non-empty tuple, so STEPS[0] is always defined.
  const safeStep: Step = STEPS.find((s) => s.id === active) ?? STEPS[0];

  useEffect(() => {
    if (!autoplay || reduce) return;
    timer.current = setInterval(() => {
      setActive((cur) => {
        const idx = STEPS.findIndex((s) => s.id === cur);
        const next = STEPS[(idx + 1) % STEPS.length];
        return next ? next.id : cur;
      });
    }, 3200);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [autoplay, reduce]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <Nav navigate={navigate} />

      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden">
        <Grain opacity={0.5} />
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" />
        <div className="mx-auto max-w-3xl px-5 pb-10 pt-16 text-center lg:pt-20">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[12px] font-medium text-muted-foreground shadow-soft"
          >
            <Badge tone="accent">Live demo</Badge> No sign-up required
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05, ease: [0.22, 0.61, 0.36, 1] }}
            className="mt-5 font-display text-[clamp(34px,5.5vw,58px)] font-semibold leading-[1.04] tracking-[-0.02em]"
          >
            See TutorBook <span className="text-gradient">think with your sources.</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.12 }}
            className="mx-auto mt-5 max-w-xl text-[17px] leading-relaxed text-muted-foreground"
          >
            Step through a real study session. Watch the tutor retrieve evidence, open interactive
            surfaces, and map your mastery — all grounded in your own material.
          </motion.p>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.22 }}
            className="mt-7 flex flex-wrap items-center justify-center gap-6 text-[13px] text-muted-foreground"
          >
            {STATS.map(([label, value]) => (
              <div key={label} className="flex items-center gap-1.5">
                <Check className="h-4 w-4 text-accent" />
                <span>
                  <span className="font-semibold text-foreground">{value}</span> {label}
                </span>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ---------- Interactive walkthrough ---------- */}
      <section className="mx-auto max-w-6xl px-5 pb-20">
        {/* step tabs */}
        <Reveal>
          <div className="mb-6 flex justify-center">
            <Segmented<StepId>
              value={active}
              onChange={(v) => {
                setAutoplay(false);
                setActive(v);
              }}
              options={STEPS.map((s) => ({
                value: s.id,
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <s.icon className="h-3.5 w-3.5" /> {s.label}
                  </span>
                ),
              }))}
            />
          </div>
        </Reveal>

        <div className="grid items-start gap-8 lg:grid-cols-[0.85fr_1.15fr]">
          {/* narrative panel */}
          <Reveal>
            <div className="lg:sticky lg:top-24">
              <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
                {safeStep.eyebrow}
              </div>
              <h2 className="mt-2 font-display text-[clamp(24px,3.4vw,34px)] font-semibold leading-tight">
                {safeStep.title}
              </h2>
              <p className="mt-3 text-[16px] leading-relaxed text-muted-foreground">
                {safeStep.blurb}
              </p>

              {/* step list */}
              <div className="mt-7 space-y-1.5">
                {STEPS.map((s, i) => {
                  const on = s.id === active;
                  return (
                    <button
                      key={s.id}
                      onClick={() => {
                        setAutoplay(false);
                        setActive(s.id);
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors",
                        on ? "border-accent bg-accent/8" : "border-border bg-card hover:bg-muted",
                      )}
                    >
                      <span
                        className={cn(
                          "grid h-8 w-8 shrink-0 place-items-center rounded-lg font-display text-[14px] font-semibold",
                          on
                            ? "bg-accent text-accent-foreground"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {i + 1}
                      </span>
                      <span
                        className={cn(
                          "text-[14px] font-medium",
                          on ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {s.label}
                      </span>
                      {on && <ArrowRight className="ml-auto h-4 w-4 text-accent" />}
                    </button>
                  );
                })}
              </div>

              <Button
                size="lg"
                variant="primary"
                className="mt-7"
                onClick={() => navigate("/login")}
              >
                Try it with your own sources <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </Reveal>

          {/* the console */}
          <Reveal y={28}>
            <DemoConsole
              step={safeStep}
              autoplay={autoplay}
              onToggleAutoplay={() => setAutoplay((a) => !a)}
            />
            <div className="mt-3 flex items-center justify-center gap-2 text-[12px] text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-gold" />
              This is a guided mock — your real notebook is even richer.
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------- What you just saw ---------- */}
      <section className="border-y border-border bg-surface/40">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <Reveal>
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
                Under the hood
              </div>
              <h2 className="mt-2 font-display text-[clamp(28px,4vw,40px)] font-semibold">
                What makes the demo more than a chatbot.
              </h2>
            </div>
          </Reveal>
          <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: BookOpen,
                t: "Grounded retrieval",
                d: "Answers are assembled from your sources and cite the exact page — open the evidence on any claim.",
              },
              {
                icon: LayoutGrid,
                t: "Generated surfaces",
                d: "The tutor decides when a diagram, simulation, or quiz teaches better than prose, then builds it inline.",
              },
              {
                icon: Target,
                t: "Mastery tracking",
                d: "Every interaction updates your Study Map, so weak concepts surface before they trip you up.",
              },
            ].map((f) => (
              <StaggerItem key={f.t}>
                <Lift className="h-full rounded-xl border border-border bg-card p-5 shadow-soft">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent/12 text-accent">
                    <f.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 font-display text-[18px] font-semibold">{f.t}</h3>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">{f.d}</p>
                </Lift>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ---------- Final CTA ---------- */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <Reveal y={24}>
          <div className="relative overflow-hidden rounded-3xl border border-accent/30 bg-gradient-to-br from-accent to-primary px-8 py-14 text-center text-primary-foreground shadow-pop">
            <Grain opacity={0.4} />
            <h2 className="relative font-display text-[clamp(28px,4.5vw,44px)] font-semibold leading-tight">
              Ready to run it on your own course?
            </h2>
            <p className="relative mx-auto mt-3 max-w-xl text-[16px] opacity-85">
              Drop in your first PDF and meet a tutor that actually knows it — free to start.
            </p>
            <div className="relative mt-7 flex flex-wrap justify-center gap-3">
              <Button size="lg" variant="gold" onClick={() => navigate("/login")}>
                Start learning free <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10"
                onClick={() => navigate("/")}
              >
                Back to home
              </Button>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="border-t border-border">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 sm:grid-cols-2 md:grid-cols-4">
          <div className="sm:col-span-2 md:col-span-1">
            <Logo size={34} />
            <p className="mt-3 max-w-xs text-[13px] text-muted-foreground">
              The grounded tutoring OS — your sources, taught back to you.
            </p>
          </div>
          {(
            [
              [
                "Product",
                [
                  ["Features", "/#features"],
                  ["Pricing", "/#pricing"],
                  ["Demo", "/demo"],
                ],
              ],
              [
                "Company",
                [
                  ["About", "/contact"],
                  ["Contact", "/contact"],
                ],
              ],
              [
                "Legal",
                [
                  ["Privacy", "/privacy"],
                  ["Terms", "/terms"],
                ],
              ],
            ] as Array<[string, Array<[string, string]>]>
          ).map(([title, links]) => (
            <div key={title}>
              <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                {title}
              </div>
              <ul className="mt-3 space-y-2">
                {links.map(([l, h]) => (
                  <li key={l}>
                    <a
                      onClick={() => navigate(h)}
                      className="cursor-pointer text-[14px] text-foreground/80 hover:text-accent"
                    >
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-border py-5 text-center text-[13px] text-muted-foreground">
          © {new Date().getFullYear()} TutorBook. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
