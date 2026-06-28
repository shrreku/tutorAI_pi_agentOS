import { useState } from "react";
import {
  ArrowRight,
  ArrowDown,
  BookOpen,
  Check,
  FileText,
  GraduationCap,
  Layers,
  Map as MapIcon,
  Menu,
  Sparkles,
  Target,
  Upload,
  Zap,
} from "lucide-react";
import { Badge, Button, Eyebrow } from "../../ui/primitives.js";
import { Logo, Wordmark, Grain } from "../../ui/brand.js";
import { Reveal, Stagger, StaggerItem, Lift, motion } from "../../ui/motion.js";
import { cn } from "../../ui/cn.js";

/* ============================================================================
   Landing page #2 — "Flow / product-led". A scroll-storytelling page that walks
   the reader through the product loop: Add a source -> Tutor reads it -> Study
   Map grows -> Master it. Large mock panels reveal on scroll. Distinct structure
   from LandingPage but the same Folio brand.
   ============================================================================ */

const NAV = [
  ["How it flows", "#flow"],
  ["Features", "#features"],
  ["Proof", "#proof"],
  ["Pricing", "#pricing"],
] as const;

type Step = {
  n: string;
  icon: typeof Upload;
  eyebrow: string;
  title: string;
  body: string;
  mock: "source" | "tutor" | "map" | "master";
};

const STEPS: readonly Step[] = [
  {
    n: "01",
    icon: Upload,
    eyebrow: "Add a source",
    title: "Drop in the material you actually study.",
    body: "PDFs, lecture slides, lab handouts, your own notes. TutorBook indexes every page and pulls out the concepts hiding inside it — no setup, no tagging.",
    mock: "source",
  },
  {
    n: "02",
    icon: BookOpen,
    eyebrow: "The tutor reads it",
    title: "Ask anything. Watch it cite the page.",
    body: "The tutor retrieves the exact passage, reasons in the open, and answers from your material — every claim linked back to the page or slide it came from.",
    mock: "tutor",
  },
  {
    n: "03",
    icon: MapIcon,
    eyebrow: "Your Study Map grows",
    title: "Every session expands the graph.",
    body: "Concepts, objectives, and checkpoints connect into a living map of your course. As you learn, the map fills in — and shows you exactly where the gaps are.",
    mock: "map",
  },
  {
    n: "04",
    icon: Target,
    eyebrow: "Master it, provably",
    title: "Recall lifts your weak spots to green.",
    body: "Quizzes and spaced recall target shaky concepts before they fade. Mastery is tracked node by node, so you always know what's solid and what needs another pass.",
    mock: "master",
  },
];

const FEATURES = [
  {
    icon: Sparkles,
    t: "Grounded answers",
    d: "Every response cites its source — page, slide, or paper.",
  },
  {
    icon: Layers,
    t: "Interactive surfaces",
    d: "Worked examples, simulations, and quizzes on demand.",
  },
  {
    icon: MapIcon,
    t: "Living Study Map",
    d: "Your curriculum as a graph that updates as you learn.",
  },
  { icon: Zap, t: "Adaptive tutoring", d: "Meets your mastery level and recaps weak spots first." },
  { icon: BookOpen, t: "Source Wiki", d: "An auto-linked textbook built from your documents." },
  {
    icon: GraduationCap,
    t: "Live Plan",
    d: "Always-current next best actions, so you never stall.",
  },
] as const;

const METRICS = [
  ["12,000+", "learners studying daily"],
  ["3.1M", "sources read & grounded"],
  ["94%", "say it beats office hours"],
  ["4.9/5", "average rating"],
] as const;

const QUOTES = [
  {
    q: "It read my professor's actual slides and quizzed me on the parts I kept skipping. My grade jumped a full letter.",
    name: "Priya N.",
    role: "Organic Chemistry, 2nd year",
  },
  {
    q: "The Study Map made me realise I'd never actually connected two whole chapters. Now I see the shape of the course.",
    name: "Marcus L.",
    role: "Macroeconomics, finals prep",
  },
] as const;

const TIERS = [
  {
    name: "Free",
    price: "$0",
    note: "to get going",
    features: ["1 notebook", "5 sources", "Core tutor & Study Map"],
    cta: "Start free",
    variant: "outline" as const,
    featured: false,
  },
  {
    name: "Pro",
    price: "$18",
    note: "per month",
    features: [
      "Unlimited notebooks",
      "200 sources",
      "Interactive surfaces",
      "Spaced recall + Live Plan",
    ],
    cta: "Go Pro",
    variant: "primary" as const,
    featured: true,
  },
  {
    name: "Team",
    price: "Custom",
    note: "cohorts & schools",
    features: ["Everything in Pro", "Shared notebooks", "Admin & SSO"],
    cta: "Talk to us",
    variant: "outline" as const,
    featured: false,
  },
] as const;

/* ---------------------------------------------------------------- Nav */
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
              key={href}
              href={href}
              className="text-[14px] font-medium text-muted-foreground transition-colors hover:text-foreground"
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

/* ---------------------------------------------------------------- Step mocks */
function SourceMock() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-pop">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Upload className="h-3.5 w-3.5" /> Sources
      </div>
      <motion.div
        initial={{ scale: 0.97, opacity: 0.7 }}
        whileInView={{ scale: 1, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="mt-3 grid place-items-center rounded-xl border-2 border-dashed border-accent/40 bg-accent/5 py-7 text-center"
      >
        <FileText className="h-7 w-7 text-accent" />
        <div className="mt-2 font-display text-[14px] font-semibold">organic-chemistry-ch7.pdf</div>
        <div className="text-[12px] text-muted-foreground">142 pages · indexing…</div>
      </motion.div>
      <div className="mt-3 space-y-2">
        {["Reaction mechanisms", "Stereochemistry", "Substitution & elimination"].map((c, i) => (
          <motion.div
            key={c}
            initial={{ opacity: 0, x: -8 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.2 + i * 0.12 }}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface/60 px-3 py-2 text-[12.5px]"
          >
            <Check className="h-3.5 w-3.5 text-success" /> {c}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function TutorMock() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-pop">
      <div className="flex items-center gap-1.5 border-b border-border bg-surface/70 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-warning/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
        <span className="ml-3 font-mono text-[11px] text-muted-foreground">
          notebook / organic-chemistry
        </span>
      </div>
      <div className="p-5">
        <div className="flex justify-end">
          <span className="max-w-[80%] rounded-2xl rounded-br-sm bg-secondary px-3.5 py-2 text-[13.5px] text-secondary-foreground">
            Why does configuration invert in an SN2 reaction?
          </span>
        </div>
        <div className="mt-4">
          <div className="mb-1.5 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
            <span className="grid h-5 w-5 place-items-center rounded-md bg-primary text-primary-foreground">
              <GraduationCap className="h-3 w-3" />
            </span>
            TutorBook
            <span className="inline-flex items-center gap-1 text-success">● grounded</span>
          </div>
          <div className="rounded-lg border border-border bg-surface/60 p-2.5">
            <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-wider text-accent">
              <Sparkles className="h-3 w-3" /> Agent · retrieved evidence
            </div>
            <div className="mt-1 font-mono text-[10.5px] text-muted-foreground">
              search_sources("backside attack")
            </div>
          </div>
          <p className="mt-2.5 font-display text-[14.5px] leading-relaxed text-foreground/90">
            The nucleophile attacks opposite the leaving group, pushing the three substituents
            through a flat transition state — like an umbrella in the wind. The stereocentre
            inverts.
          </p>
          <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-accent/12 px-2 py-0.5 text-[11px] font-medium text-accent">
            <BookOpen className="h-3 w-3" /> Clayden · p. 142
          </div>
        </div>
      </div>
    </div>
  );
}

function MapMock() {
  const nodes = [
    { x: "8%", y: "12%", label: "Substitution", tone: "border-border" },
    { x: "58%", y: "6%", label: "SN2 mechanism", tone: "border-accent ring-2 ring-accent/20" },
    { x: "20%", y: "52%", label: "Backside attack", tone: "border-border" },
    { x: "62%", y: "58%", label: "Stereochemistry", tone: "border-gold/60" },
  ] as const;
  return (
    <div className="rule-grid relative min-h-[300px] overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-pop">
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        <line
          x1="20%"
          y1="22%"
          x2="62%"
          y2="16%"
          stroke="currentColor"
          className="text-accent/30"
          strokeWidth="1.5"
        />
        <line
          x1="20%"
          y1="22%"
          x2="30%"
          y2="60%"
          stroke="currentColor"
          className="text-border"
          strokeWidth="1.5"
        />
        <line
          x1="66%"
          y1="20%"
          x2="68%"
          y2="60%"
          stroke="currentColor"
          className="text-border"
          strokeWidth="1.5"
        />
      </svg>
      {nodes.map((node, i) => (
        <motion.div
          key={node.label}
          initial={{ opacity: 0, scale: 0.85 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45, delay: i * 0.14 }}
          style={{ left: node.x, top: node.y }}
          className={cn("absolute w-36 rounded-lg border bg-card p-2.5 shadow-soft", node.tone)}
        >
          <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            Concept
          </div>
          <div className="text-[12.5px] font-semibold">{node.label}</div>
        </motion.div>
      ))}
    </div>
  );
}

function MasterMock() {
  const bars = [
    { label: "SN2 mechanism", pct: 92, tone: "bg-success" },
    { label: "Stereochemistry", pct: 74, tone: "bg-accent" },
    { label: "Elimination", pct: 41, tone: "bg-warning" },
  ] as const;
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-pop">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Target className="h-3.5 w-3.5" /> Mastery
      </div>
      <div className="mt-4 space-y-4">
        {bars.map((b, i) => (
          <div key={b.label}>
            <div className="mb-1 flex items-center justify-between text-[12.5px]">
              <span className="font-medium">{b.label}</span>
              <span className="text-muted-foreground">{b.pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: `${b.pct}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: i * 0.15, ease: [0.22, 0.61, 0.36, 1] }}
                className={cn("h-full rounded-full", b.tone)}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/8 px-3 py-2.5 text-[12.5px]">
        <Zap className="h-4 w-4 shrink-0 text-accent" />
        <span>
          <span className="font-semibold">Up next:</span> 6-card recall on Elimination
        </span>
      </div>
    </div>
  );
}

function StepMock({ kind }: { kind: Step["mock"] }) {
  switch (kind) {
    case "source":
      return <SourceMock />;
    case "tutor":
      return <TutorMock />;
    case "map":
      return <MapMock />;
    case "master":
      return <MasterMock />;
  }
}

/* ---------------------------------------------------------------- Page */
export function LandingFlow({ navigate }: { navigate: (path: string) => void }) {
  const [activeQuote, setActiveQuote] = useState(0);
  const quote = QUOTES[activeQuote] ?? QUOTES[0];

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <Nav navigate={navigate} />

      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden">
        <Grain opacity={0.5} />
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[460px] w-[900px] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" />
        <div className="mx-auto max-w-3xl px-5 pb-14 pt-20 text-center lg:pb-20 lg:pt-28">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[12px] font-medium text-muted-foreground shadow-soft"
          >
            <Badge tone="accent">Product tour</Badge> See the whole loop in 30 seconds
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05, ease: [0.22, 0.61, 0.36, 1] }}
            className="mt-6 font-display text-[clamp(40px,6.4vw,72px)] font-semibold leading-[1.02] tracking-[-0.02em]"
          >
            Watch a textbook become a tutor that{" "}
            <span className="text-gradient">knows it cold.</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.12 }}
            className="mx-auto mt-5 max-w-xl text-[17px] leading-relaxed text-muted-foreground"
          >
            Add a source, ask a question, and watch your Study Map grow until you've mastered the
            course. Scroll to follow the loop, end to end.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.18 }}
            className="mt-8 flex flex-wrap items-center justify-center gap-3"
          >
            <Button size="lg" variant="primary" onClick={() => navigate("/login")}>
              Start learning free <ArrowRight className="h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate("/demo")}>
              See the demo
            </Button>
          </motion.div>
          <motion.a
            href="#flow"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-12 inline-flex flex-col items-center gap-1 text-[12px] font-medium uppercase tracking-wider text-muted-foreground"
          >
            Follow the flow
            <motion.span
              animate={{ y: [0, 6, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            >
              <ArrowDown className="h-4 w-4 text-accent" />
            </motion.span>
          </motion.a>
        </div>
      </section>

      {/* ---------- The flow (scroll storytelling) ---------- */}
      <section id="flow" className="relative border-t border-border bg-surface/30">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <Eyebrow className="text-accent">The loop</Eyebrow>
              <h2 className="mt-2 font-display text-[clamp(28px,4vw,42px)] font-semibold leading-tight">
                One loop. Four moves. Repeat until it's yours.
              </h2>
            </div>
          </Reveal>

          <div className="relative mt-16">
            {/* vertical spine */}
            <div className="pointer-events-none absolute left-1/2 top-0 hidden h-full w-px -translate-x-1/2 bg-gradient-to-b from-accent/0 via-border to-accent/0 lg:block" />
            <div className="space-y-20 lg:space-y-28">
              {STEPS.map((step, i) => {
                const Icon = step.icon;
                const flip = i % 2 === 1;
                return (
                  <div
                    key={step.n}
                    className="grid items-center gap-8 lg:grid-cols-[1fr_auto_1fr] lg:gap-12"
                  >
                    {/* copy */}
                    <Reveal
                      y={24}
                      className={cn(
                        flip ? "lg:order-3" : "lg:order-1",
                        flip ? "lg:text-left" : "lg:text-right",
                      )}
                    >
                      <div
                        className={cn(
                          "flex items-center gap-2",
                          flip ? "lg:justify-start" : "lg:justify-start lg:flex-row-reverse",
                        )}
                      >
                        <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/12 text-accent">
                          <Icon className="h-5 w-5" />
                        </span>
                        <Eyebrow className="text-gold">{step.eyebrow}</Eyebrow>
                      </div>
                      <h3 className="mt-3 font-display text-[clamp(22px,3vw,30px)] font-semibold leading-tight">
                        {step.title}
                      </h3>
                      <p
                        className={cn(
                          "mt-3 text-[15px] leading-relaxed text-muted-foreground",
                          flip ? "lg:mr-0" : "lg:ml-auto",
                          "lg:max-w-md",
                        )}
                      >
                        {step.body}
                      </p>
                    </Reveal>

                    {/* spine node */}
                    <div className="order-first hidden lg:order-2 lg:block">
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        whileInView={{ scale: 1, opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.4, ease: [0.22, 0.61, 0.36, 1] }}
                        className="grid h-14 w-14 place-items-center rounded-full border border-accent/40 bg-card font-display text-[16px] font-semibold text-accent shadow-soft"
                      >
                        {step.n}
                      </motion.div>
                    </div>

                    {/* mock */}
                    <Reveal y={28} delay={0.08} className={cn(flip ? "lg:order-1" : "lg:order-3")}>
                      <Lift>
                        <StepMock kind={step.mock} />
                      </Lift>
                    </Reveal>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Features strip ---------- */}
      <section id="features" className="mx-auto max-w-6xl px-5 py-20">
        <Reveal>
          <div className="max-w-2xl">
            <Eyebrow className="text-accent">Everything in the loop</Eyebrow>
            <h2 className="mt-2 font-display text-[clamp(28px,4vw,40px)] font-semibold leading-tight">
              Each move is powered by something purpose-built.
            </h2>
          </div>
        </Reveal>
        <Stagger className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <StaggerItem key={f.t}>
                <Lift className="h-full rounded-xl border border-border bg-card p-5 shadow-soft">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent/12 text-accent">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 font-display text-[18px] font-semibold">{f.t}</h3>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">{f.d}</p>
                </Lift>
              </StaggerItem>
            );
          })}
        </Stagger>
      </section>

      {/* ---------- Metrics + social proof ---------- */}
      <section id="proof" className="border-y border-border bg-primary text-primary-foreground">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <Stagger className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {METRICS.map(([n, l]) => (
              <StaggerItem key={l}>
                <div className="text-center">
                  <div className="font-display text-[clamp(32px,5vw,52px)] font-semibold leading-none text-gold">
                    {n}
                  </div>
                  <div className="mt-2 text-[13px] opacity-80">{l}</div>
                </div>
              </StaggerItem>
            ))}
          </Stagger>

          <div className="mt-16 grid items-center gap-8 lg:grid-cols-[auto_1fr]">
            <div className="flex gap-2 lg:flex-col">
              {QUOTES.map((qu, i) => (
                <button
                  key={qu.name}
                  onClick={() => setActiveQuote(i)}
                  aria-label={`Quote from ${qu.name}`}
                  className={cn(
                    "h-2.5 rounded-full transition-all",
                    i === activeQuote
                      ? "w-8 bg-gold lg:h-8 lg:w-2.5"
                      : "w-2.5 bg-primary-foreground/30",
                  )}
                />
              ))}
            </div>
            <motion.blockquote
              key={activeQuote}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <p className="font-display text-[clamp(20px,3vw,30px)] font-medium leading-snug">
                “{quote.q}”
              </p>
              <footer className="mt-5 flex items-center gap-3 text-[14px]">
                <span className="h-9 w-9 rounded-full bg-gold" />
                <span>
                  <span className="font-semibold">{quote.name}</span>
                  <span className="opacity-70"> · {quote.role}</span>
                </span>
              </footer>
            </motion.blockquote>
          </div>
        </div>
      </section>

      {/* ---------- Pricing teaser ---------- */}
      <section id="pricing" className="mx-auto max-w-6xl px-5 py-20">
        <Reveal>
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <Eyebrow className="text-accent">Pricing</Eyebrow>
            <h2 className="mt-2 font-display text-[clamp(28px,4vw,40px)] font-semibold">
              Run the whole loop free. Scale when you're ready.
            </h2>
          </div>
        </Reveal>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {TIERS.map((tier, i) => (
            <Reveal key={tier.name} delay={i * 0.08}>
              <div
                className={cn(
                  "relative flex h-full flex-col rounded-2xl border bg-card p-6",
                  tier.featured
                    ? "border-accent shadow-pop ring-1 ring-accent/20"
                    : "border-border shadow-soft",
                )}
              >
                {tier.featured && (
                  <span className="absolute -top-3 left-6 rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-semibold text-accent-foreground">
                    Most popular
                  </span>
                )}
                <div className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {tier.name}
                </div>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="font-display text-[40px] font-semibold tracking-tight">
                    {tier.price}
                  </span>
                  <span className="text-[13px] text-muted-foreground">{tier.note}</span>
                </div>
                <ul className="mt-5 flex-1 space-y-2.5">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-center gap-2.5 text-[14px]">
                      <Check className="h-4 w-4 shrink-0 text-accent" /> {f}
                    </li>
                  ))}
                </ul>
                <Button
                  className="mt-6 w-full"
                  variant={tier.variant}
                  onClick={() => navigate("/login")}
                >
                  {tier.cta}
                </Button>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- Final CTA ---------- */}
      <section className="mx-auto max-w-6xl px-5 pb-20">
        <Reveal y={24}>
          <div className="relative overflow-hidden rounded-3xl border border-accent/30 bg-gradient-to-br from-accent to-primary px-8 py-14 text-center text-primary-foreground shadow-pop">
            <Grain opacity={0.4} />
            <h2 className="relative font-display text-[clamp(28px,4.5vw,44px)] font-semibold leading-tight">
              Start the loop with your first source.
            </h2>
            <p className="relative mx-auto mt-3 max-w-xl text-[16px] opacity-85">
              Drop in a PDF and watch the tutor read, map, and master it alongside you — free to
              begin.
            </p>
            <div className="relative mt-7 flex justify-center gap-3">
              <Button size="lg" variant="gold" onClick={() => navigate("/login")}>
                Start learning free <ArrowRight className="h-4 w-4" />
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
                  ["Features", "#features"],
                  ["Pricing", "#pricing"],
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
                      href={h.startsWith("#") ? h : undefined}
                      onClick={() => (!h.startsWith("#") ? navigate(h) : undefined)}
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
