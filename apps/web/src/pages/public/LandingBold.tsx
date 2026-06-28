import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  GraduationCap,
  Menu,
  Quote,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "../../ui/primitives.js";
import { Logo, Wordmark, Grain } from "../../ui/brand.js";
import { Reveal, Stagger, StaggerItem, Lift, motion } from "../../ui/motion.js";
import { cn } from "../../ui/cn.js";

/* ============================================================================
   Landing variant #3 — "Bold / editorial statement".
   High-contrast, typographic: a full-bleed dark forest-green hero with a huge
   serif statement, alternating editorial feature rows, a manifesto band,
   logos, a stark pricing section, and a dramatic closing CTA.
   ============================================================================ */

const NAV = [
  ["Why", "#why"],
  ["Method", "#method"],
  ["Pricing", "#pricing"],
] as const;

type FeatureRow = {
  no: string;
  eyebrow: string;
  title: string;
  body: string;
  mock: "evidence" | "map" | "surface";
};

const ROWS: readonly FeatureRow[] = [
  {
    no: "01",
    eyebrow: "Grounded",
    title: "It reads your books, not the whole internet.",
    body: "Every answer cites the exact page, slide, or paper it came from. No hand-wavy guesses — just your material, explained back to you with the receipts attached.",
    mock: "evidence",
  },
  {
    no: "02",
    eyebrow: "Mapped",
    title: "Your course becomes a living map.",
    body: "Concepts, objectives, and checkpoints assemble into a graph that updates as you learn. You always know where you are — and what to study next.",
    mock: "map",
  },
  {
    no: "03",
    eyebrow: "Interactive",
    title: "Surfaces that appear when you need them.",
    body: "Worked examples, simulations, MCP-powered apps, and quizzes — generated on demand, right inside the conversation, exactly when the moment calls for one.",
    mock: "surface",
  },
];

const LOGOS = ["Stanford", "MIT", "Oxford", "Berkeley", "ETH Zürich", "NUS"] as const;

type Tier = {
  name: string;
  price: string;
  note: string;
  features: readonly string[];
  cta: string;
  featured?: boolean;
};

const TIERS: readonly Tier[] = [
  {
    name: "Free",
    price: "$0",
    note: "to try it out",
    features: ["1 notebook", "5 sources", "Core tutor & map", "Community support"],
    cta: "Start free",
  },
  {
    name: "Pro",
    price: "$18",
    note: "per month",
    features: [
      "Unlimited notebooks",
      "200 sources",
      "Interactive & MCP surfaces",
      "Spaced recall + Live Plan",
      "Priority tutoring",
    ],
    cta: "Go Pro",
    featured: true,
  },
  {
    name: "Team",
    price: "Custom",
    note: "for cohorts",
    features: ["Everything in Pro", "Shared notebooks", "Admin & analytics", "SSO + onboarding"],
    cta: "Talk to us",
  },
];

/* ----------------------------------------------------------------------- Nav */
function Nav({ navigate }: { navigate: (path: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <motion.header
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 0.61, 0.36, 1] }}
      className="sticky top-0 z-50 border-b border-primary-foreground/10 bg-primary/90 text-primary-foreground backdrop-blur"
    >
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-5 py-3.5">
        <button
          onClick={() => navigate("/")}
          aria-label="TutorBook home"
          className="inline-flex items-center gap-2.5"
        >
          <Logo size={30} />
          <span className="font-display text-[19px] font-semibold tracking-[-0.01em] text-primary-foreground">
            TutorBook
          </span>
        </button>
        <nav className="ml-4 hidden items-center gap-7 md:flex">
          {NAV.map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="text-[14px] font-medium text-primary-foreground/70 transition-colors hover:text-primary-foreground"
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => navigate("/login")}
            className="hidden rounded-md px-3 py-1.5 text-[14px] font-medium text-primary-foreground/80 transition-colors hover:text-primary-foreground sm:inline-flex"
          >
            Sign in
          </button>
          <Button variant="gold" size="sm" onClick={() => navigate("/login")}>
            Get started <ArrowRight className="h-4 w-4" />
          </Button>
          <button
            className="grid h-9 w-9 place-items-center rounded-lg text-primary-foreground/80 hover:bg-primary-foreground/10 md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {open && (
        <motion.nav
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="overflow-hidden border-t border-primary-foreground/10 md:hidden"
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-5 py-3">
            {NAV.map(([label, href]) => (
              <a
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-2 text-[15px] font-medium text-primary-foreground/80 hover:bg-primary-foreground/10"
              >
                {label}
              </a>
            ))}
          </div>
        </motion.nav>
      )}
    </motion.header>
  );
}

/* --------------------------------------------------------------- Hero mock */
function HeroLines() {
  return (
    <svg
      viewBox="0 0 1200 520"
      className="pointer-events-none absolute inset-0 h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <defs>
        <linearGradient id="lb-line" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--gold)" stopOpacity="0.5" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      {Array.from({ length: 7 }).map((_, i) => (
        <motion.path
          key={i}
          d={`M0 ${70 + i * 64} C 300 ${30 + i * 64}, 900 ${120 + i * 58}, 1200 ${50 + i * 62}`}
          stroke="url(#lb-line)"
          strokeWidth="1.2"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.6, delay: 0.2 + i * 0.08, ease: [0.22, 0.61, 0.36, 1] }}
        />
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------- Row mocks */
function RowMock({ kind }: { kind: FeatureRow["mock"] }) {
  if (kind === "evidence") {
    return (
      <div className="overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-pop">
        <div className="flex justify-end">
          <span className="max-w-[80%] rounded-2xl rounded-br-sm bg-secondary px-3.5 py-2 text-[13px] text-secondary-foreground">
            Why does configuration invert in an SN2 reaction?
          </span>
        </div>
        <div className="mt-4 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
          <span className="grid h-5 w-5 place-items-center rounded-md bg-primary text-primary-foreground">
            <GraduationCap className="h-3 w-3" />
          </span>
          TutorBook
          <span className="inline-flex items-center gap-1 text-success">● grounded</span>
        </div>
        <p className="mt-2 font-display text-[15px] leading-relaxed text-foreground/90">
          The nucleophile attacks opposite the leaving group, forcing the three substituents through
          a flat transition state — like an umbrella in the wind. The stereocentre inverts.
        </p>
        <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-accent/12 px-2 py-0.5 text-[11px] font-medium text-accent">
          <BookOpen className="h-3 w-3" /> Clayden · p. 142
        </div>
      </div>
    );
  }
  if (kind === "map") {
    return (
      <div className="rule-grid relative min-h-[260px] overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-pop">
        <div className="absolute left-5 top-6 w-44 rounded-lg border border-border bg-surface/70 p-2.5 shadow-soft">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-gold">
            Curriculum
          </div>
          <div className="text-[13px] font-semibold">Ch. 7 · Substitution</div>
        </div>
        <div className="absolute right-5 top-24 w-40 rounded-lg border border-accent bg-card p-2.5 shadow-soft ring-2 ring-accent/20">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-accent">
            Concept
          </div>
          <div className="text-[13px] font-semibold">SN2 mechanism</div>
        </div>
        <div className="absolute bottom-6 left-10 w-36 rounded-lg border border-border bg-card p-2.5 shadow-soft">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            Objective
          </div>
          <div className="text-[12px] font-semibold">Backside attack</div>
        </div>
        <svg className="absolute inset-0 h-full w-full" aria-hidden>
          <path
            d="M120 70 C 180 120, 240 110, 300 130 M260 150 C 220 200, 180 200, 150 220"
            stroke="var(--accent)"
            strokeWidth="1.5"
            strokeDasharray="4 6"
            fill="none"
            opacity="0.6"
          />
        </svg>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-pop">
      <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-wider text-accent">
        <Sparkles className="h-3.5 w-3.5" /> Generated surface
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {["Worked example", "Simulation", "Flashcards", "Quiz"].map((s, i) => (
          <div
            key={s}
            className={cn(
              "rounded-lg border p-3",
              i === 1
                ? "border-accent bg-accent/10 ring-1 ring-accent/20"
                : "border-border bg-surface/60",
            )}
          >
            <div className="font-display text-[13.5px] font-semibold">{s}</div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", i === 1 ? "bg-accent" : "bg-gold/60")}
                style={{ width: `${50 + i * 14}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ===================================================================== Page */
export function LandingBold({ navigate }: { navigate: (path: string) => void }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <Nav navigate={navigate} />

      {/* ---------------------------------------------------------- Hero */}
      <section className="relative overflow-hidden bg-primary text-primary-foreground">
        <Grain opacity={0.6} />
        <HeroLines />
        <div className="pointer-events-none absolute -top-32 right-1/4 h-[480px] w-[480px] rounded-full bg-gold/10 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/4 h-[360px] w-[520px] rounded-full bg-accent/20 blur-3xl" />

        <div className="relative mx-auto max-w-6xl px-5 pb-24 pt-20 lg:pb-32 lg:pt-28">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/5 px-3 py-1 text-[12px] font-medium text-primary-foreground/80"
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-gold" />
            Grounded tutoring for your own sources
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.06, ease: [0.22, 0.61, 0.36, 1] }}
            className="mt-7 max-w-[16ch] font-display text-[clamp(48px,9vw,108px)] font-semibold leading-[0.95] tracking-[-0.03em]"
          >
            Your textbooks,
            <br />
            <span className="text-gold">finally</span> teaching back.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.18 }}
            className="mt-8 max-w-xl text-[18px] leading-relaxed text-primary-foreground/75"
          >
            TutorBook reads your PDFs, slides, and notes — then tutors from them, citing every
            answer and mapping your whole curriculum as you learn.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.26 }}
            className="mt-10 flex flex-wrap items-center gap-4"
          >
            <Button size="lg" variant="gold" onClick={() => navigate("/login")}>
              Start learning free <ArrowRight className="h-4 w-4" />
            </Button>
            <button
              onClick={() => navigate("/demo")}
              className="group inline-flex items-center gap-1.5 text-[15px] font-medium text-primary-foreground/80 transition-colors hover:text-primary-foreground"
            >
              See the demo
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </button>
          </motion.div>
        </div>

        {/* hero stat strip */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="relative border-t border-primary-foreground/10"
        >
          <div className="mx-auto grid max-w-6xl grid-cols-2 divide-x divide-primary-foreground/10 px-5 sm:grid-cols-4">
            {(
              [
                ["12,000+", "learners"],
                ["1.4M", "questions answered"],
                ["100%", "cited to source"],
                ["48", "subjects covered"],
              ] as const
            ).map(([stat, label]) => (
              <div key={label} className="px-2 py-6 first:pl-0">
                <div className="font-display text-[28px] font-semibold leading-none text-gold">
                  {stat}
                </div>
                <div className="mt-1.5 text-[12px] uppercase tracking-wider text-primary-foreground/60">
                  {label}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ---------------------------------------------------- Feature rows */}
      <section id="why" className="mx-auto max-w-6xl px-5 py-24 lg:py-32">
        <Reveal>
          <h2 className="max-w-3xl font-display text-[clamp(30px,5vw,52px)] font-semibold leading-[1.04] tracking-[-0.02em]">
            Generic chatbots guess.
            <br />
            <span className="text-muted-foreground">TutorBook knows.</span>
          </h2>
        </Reveal>

        <div className="mt-16 flex flex-col gap-24 lg:gap-32">
          {ROWS.map((row, i) => {
            const flip = i % 2 === 1;
            return (
              <div key={row.no} className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
                <Reveal className={cn(flip && "lg:order-2")}>
                  <div className="flex items-center gap-3">
                    <span className="font-display text-[40px] font-semibold leading-none text-accent/25">
                      {row.no}
                    </span>
                    <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-accent">
                      {row.eyebrow}
                    </span>
                  </div>
                  <h3 className="mt-4 font-display text-[clamp(26px,3.6vw,40px)] font-semibold leading-[1.08] tracking-[-0.02em]">
                    {row.title}
                  </h3>
                  <p className="mt-4 max-w-md text-[16px] leading-relaxed text-muted-foreground">
                    {row.body}
                  </p>
                </Reveal>
                <Reveal y={28} delay={0.1} className={cn(flip && "lg:order-1")}>
                  <Lift>
                    <RowMock kind={row.mock} />
                  </Lift>
                </Reveal>
              </div>
            );
          })}
        </div>
      </section>

      {/* ------------------------------------------------------- Manifesto */}
      <section
        id="method"
        className="relative overflow-hidden border-y border-border bg-primary text-primary-foreground"
      >
        <Grain opacity={0.5} />
        <div className="pointer-events-none absolute -bottom-24 left-1/2 h-[400px] w-[700px] -translate-x-1/2 rounded-full bg-accent/15 blur-3xl" />
        <div className="relative mx-auto max-w-4xl px-5 py-28 text-center">
          <Reveal>
            <Quote className="mx-auto h-10 w-10 text-gold/60" />
            <p className="mx-auto mt-8 max-w-3xl font-display text-[clamp(26px,4.4vw,46px)] font-medium leading-[1.12] tracking-[-0.01em]">
              Studying shouldn't mean trusting a model that never read your course. It should mean
              opening the book — and having it <span className="text-gold">answer back.</span>
            </p>
          </Reveal>
          <Reveal delay={0.12}>
            <div className="mt-10 flex items-center justify-center gap-3 text-[14px]">
              <span className="h-9 w-9 rounded-full bg-gold" />
              <div className="text-left">
                <div className="font-semibold">Priya N.</div>
                <div className="text-primary-foreground/60">2nd-year · Organic Chemistry</div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ----------------------------------------------------------- Logos */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <Reveal>
          <p className="text-center text-[12px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Trusted by learners at
          </p>
        </Reveal>
        <Stagger className="mt-8 flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
          {LOGOS.map((name) => (
            <StaggerItem key={name}>
              <span className="font-display text-[22px] font-semibold text-foreground/60 transition-colors hover:text-foreground">
                {name}
              </span>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* --------------------------------------------------------- Pricing */}
      <section id="pricing" className="border-t border-border bg-surface/40">
        <div className="mx-auto max-w-6xl px-5 py-24">
          <Reveal>
            <div className="max-w-2xl">
              <h2 className="font-display text-[clamp(30px,5vw,52px)] font-semibold leading-[1.04] tracking-[-0.02em]">
                One price. No asterisks.
              </h2>
              <p className="mt-4 text-[16px] text-muted-foreground">
                Start free. Upgrade when your courses do. Cancel anytime.
              </p>
            </div>
          </Reveal>

          <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
            {TIERS.map((tier, i) => (
              <Reveal key={tier.name} delay={i * 0.08}>
                <div
                  className={cn(
                    "relative flex h-full flex-col rounded-2xl border p-7",
                    tier.featured
                      ? "border-transparent bg-primary text-primary-foreground shadow-pop"
                      : "border-border bg-card shadow-soft",
                  )}
                >
                  {tier.featured && (
                    <span className="absolute -top-3 left-7 rounded-full bg-gold px-2.5 py-0.5 text-[11px] font-semibold text-white">
                      Most popular
                    </span>
                  )}
                  <div
                    className={cn(
                      "text-[13px] font-semibold uppercase tracking-wider",
                      tier.featured ? "text-primary-foreground/70" : "text-muted-foreground",
                    )}
                  >
                    {tier.name}
                  </div>
                  <div className="mt-3 flex items-baseline gap-1.5">
                    <span className="font-display text-[48px] font-semibold leading-none tracking-tight">
                      {tier.price}
                    </span>
                    <span
                      className={cn(
                        "text-[13px]",
                        tier.featured ? "text-primary-foreground/60" : "text-muted-foreground",
                      )}
                    >
                      {tier.note}
                    </span>
                  </div>
                  <ul className="mt-6 flex-1 space-y-3">
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-center gap-2.5 text-[14px]">
                        <Check
                          className={cn(
                            "h-4 w-4 shrink-0",
                            tier.featured ? "text-gold" : "text-accent",
                          )}
                        />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="mt-7 w-full"
                    variant={tier.featured ? "gold" : "outline"}
                    onClick={() => navigate("/login")}
                  >
                    {tier.cta}
                  </Button>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------- Closing CTA */}
      <section className="relative overflow-hidden bg-primary text-primary-foreground">
        <Grain opacity={0.6} />
        <div className="pointer-events-none absolute -top-24 left-1/2 h-[420px] w-[760px] -translate-x-1/2 rounded-full bg-gold/12 blur-3xl" />
        <div className="relative mx-auto max-w-5xl px-5 py-28 text-center lg:py-36">
          <Reveal>
            <h2 className="mx-auto max-w-[18ch] font-display text-[clamp(40px,7vw,84px)] font-semibold leading-[0.98] tracking-[-0.03em]">
              Open the book.
              <br />
              <span className="text-gold">Let it teach you.</span>
            </h2>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="mx-auto mt-7 max-w-xl text-[17px] text-primary-foreground/75">
              Add your first PDF and meet a tutor that actually knows it — free to start.
            </p>
          </Reveal>
          <Reveal delay={0.2}>
            <div className="mt-10 flex justify-center">
              <Button size="lg" variant="gold" onClick={() => navigate("/login")}>
                Start learning free <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------------------ Footer */}
      <footer className="border-t border-border bg-background">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-14 sm:grid-cols-2 md:grid-cols-4">
          <div className="sm:col-span-2 md:col-span-1">
            <Wordmark />
            <p className="mt-3 max-w-xs text-[13px] text-muted-foreground">
              The grounded tutoring OS — your sources, taught back to you.
            </p>
          </div>
          {(
            [
              [
                "Product",
                [
                  ["Why", "#why"],
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
            ] as ReadonlyArray<readonly [string, ReadonlyArray<readonly [string, string]>]>
          ).map(([title, links]) => (
            <div key={title}>
              <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                {title}
              </div>
              <ul className="mt-3 space-y-2">
                {links.map(([label, href]) => (
                  <li key={label}>
                    <a
                      href={href.startsWith("#") ? href : undefined}
                      onClick={() => (href.startsWith("#") ? undefined : navigate(href))}
                      className="cursor-pointer text-[14px] text-foreground/80 transition-colors hover:text-accent"
                    >
                      {label}
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
