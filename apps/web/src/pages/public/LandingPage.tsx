import { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  FlaskConical,
  GraduationCap,
  LayoutGrid,
  Quote,
  ShieldCheck,
  Sparkles,
  Star,
  Menu,
} from "lucide-react";
import { Badge, Button } from "../../ui/primitives.js";
import { Logo, Wordmark, HeroArt, Grain } from "../../ui/brand.js";
import { Reveal, Stagger, StaggerItem, Lift, motion } from "../../ui/motion.js";
import { cn } from "../../ui/cn.js";

/* ============================================================================
   Landing page #1 — "Editorial". The flagship marketing page in Folio:
   sticky nav, editorial hero, social proof, value props, feature bento,
   how-it-works, an inline product demo, testimonial, pricing, FAQ, CTA, footer.
   ============================================================================ */

const NAV = [
  ["Features", "#features"],
  ["How it works", "#how"],
  ["Demo", "#demo"],
  ["Pricing", "#pricing"],
] as const;

const FEATURES = [
  {
    icon: ShieldCheck,
    t: "Grounded in your sources",
    d: "Every answer cites the page, slide, or paper it came from. No hand-wavy hallucinations — just your material, explained.",
  },
  {
    icon: LayoutGrid,
    t: "A living Study Map",
    d: "Your curriculum becomes a graph of concepts, objectives, and checkpoints that updates as you learn.",
  },
  {
    icon: FlaskConical,
    t: "Interactive surfaces",
    d: "Worked examples, simulations, MCP apps, and quizzes — generated on demand, right inside the conversation.",
  },
  {
    icon: Sparkles,
    t: "Adaptive tutoring",
    d: "The tutor reads your mastery and meets you where you are, recapping weak spots before moving on.",
  },
  {
    icon: BookOpen,
    t: "Source Wiki",
    d: "Auto-compiled, linked wiki of every concept across your documents — your personal textbook.",
  },
  {
    icon: GraduationCap,
    t: "Live Plan",
    d: "An always-current plan of next best actions, so you never wonder what to study next.",
  },
];

const STEPS = [
  [
    "Bring your sources",
    "Drop in PDFs, slides, and notes. We index every page and build your knowledge graph.",
  ],
  [
    "Study with the tutor",
    "Chat, and watch the tutor retrieve evidence, reason, and open the right learning surface.",
  ],
  ["Master, provably", "Quizzes and spaced recall lift weak concepts — tracked on your Study Map."],
] as const;

const TIERS = [
  {
    name: "Free",
    price: "$0",
    note: "for trying it out",
    features: ["1 notebook", "5 sources", "Core tutor & Study Map", "Community support"],
    cta: "Start free",
    variant: "outline" as const,
  },
  {
    name: "Pro",
    price: "$18",
    note: "per month",
    features: [
      "Unlimited notebooks",
      "200 sources",
      "Interactive & MCP surfaces",
      "Spaced-recall + Live Plan",
      "Priority tutoring",
    ],
    cta: "Go Pro",
    variant: "primary" as const,
    featured: true,
  },
  {
    name: "Team",
    price: "Custom",
    note: "for cohorts & schools",
    features: ["Everything in Pro", "Shared notebooks", "Admin & analytics", "SSO + onboarding"],
    cta: "Talk to us",
    variant: "outline" as const,
  },
];

const FAQS = [
  [
    "Does it actually use my materials?",
    "Yes — TutorBook only answers from sources you add, and every claim links back to the exact page or slide. You can open the evidence drawer on any statement.",
  ],
  [
    "What can the tutor generate?",
    "Text explanations and worked examples, interactive simulations, MCP-powered apps, flashcards, and quizzes — all grounded in your sources.",
  ],
  [
    "Is my data used to train models?",
    "No. Your sources stay yours and are never used for training. See our privacy policy for details.",
  ],
  [
    "Can I use it for a whole course?",
    "Absolutely. Notebooks hold a course's worth of material; the Study Map and Live Plan keep an entire curriculum organised.",
  ],
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

function DemoMock() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-pop">
      <div className="flex items-center gap-1.5 border-b border-border bg-surface/70 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-warning/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
        <span className="ml-3 font-mono text-[11px] text-muted-foreground">
          tutorbook.app/notebook/organic-chemistry
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr]">
        {/* chat */}
        <div className="border-b border-border p-5 md:border-b-0 md:border-r">
          <div className="flex justify-end">
            <span className="max-w-[80%] rounded-2xl rounded-br-sm bg-secondary px-3.5 py-2 text-[13.5px] text-secondary-foreground">
              Why does the configuration invert in an SN2 reaction?
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
              The nucleophile attacks opposite the leaving group, forcing the three substituents
              through a flat transition state — like an umbrella in the wind. The stereocentre
              inverts.
            </p>
            <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-accent/12 px-2 py-0.5 text-[11px] font-medium text-accent">
              <BookOpen className="h-3 w-3" /> Clayden · p. 142
            </div>
          </div>
        </div>
        {/* map */}
        <div className="rule-grid relative min-h-[220px] p-4">
          <div className="absolute left-4 top-5 w-40 rounded-lg border border-border bg-card p-2.5 shadow-soft">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-gold">
              Curriculum
            </div>
            <div className="text-[12.5px] font-semibold">Ch. 7 · Substitution</div>
          </div>
          <div className="absolute right-4 top-20 w-36 rounded-lg border border-accent bg-card p-2.5 shadow-soft ring-2 ring-accent/20">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-accent">
              Concept
            </div>
            <div className="text-[12.5px] font-semibold">SN2 mechanism</div>
          </div>
          <div className="absolute bottom-5 left-8 w-32 rounded-lg border border-border bg-card p-2.5 shadow-soft">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              Objective
            </div>
            <div className="text-[12px] font-semibold">Backside attack</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LandingPage({ navigate }: { navigate: (path: string) => void }) {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <Nav navigate={navigate} />

      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden">
        <Grain opacity={0.5} />
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" />
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-14 lg:grid-cols-[1.05fr_0.95fr] lg:pb-24 lg:pt-20">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[12px] font-medium text-muted-foreground shadow-soft"
            >
              <Badge tone="accent">New</Badge> Grounded tutoring for your own sources
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.05, ease: [0.22, 0.61, 0.36, 1] }}
              className="mt-5 font-display text-[clamp(40px,6vw,68px)] font-semibold leading-[1.02] tracking-[-0.02em]"
            >
              Turn your textbooks into a tutor that{" "}
              <span className="text-gradient">actually knows them.</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.12 }}
              className="mt-5 max-w-xl text-[17px] leading-relaxed text-muted-foreground"
            >
              TutorBook reads your PDFs, slides, and notes, then teaches from them — citing every
              answer, mapping your curriculum, and opening interactive surfaces as you learn.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.18 }}
              className="mt-7 flex flex-wrap items-center gap-3"
            >
              <Button size="lg" variant="primary" onClick={() => navigate("/login")}>
                Start learning free <ArrowRight className="h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate("/demo")}>
                See the demo
              </Button>
            </motion.div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="mt-6 flex items-center gap-3 text-[13px] text-muted-foreground"
            >
              <div className="flex -space-x-2">
                {["#2f6f4f", "#b6892f", "#25402f", "#a23a2e"].map((c, i) => (
                  <span
                    key={i}
                    className="h-7 w-7 rounded-full border-2 border-background"
                    style={{ background: c }}
                  />
                ))}
              </div>
              <span className="flex items-center gap-1">
                <span className="flex text-gold">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-3.5 w-3.5 fill-current" />
                  ))}
                </span>
                Loved by 12,000+ learners
              </span>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 0.61, 0.36, 1] }}
            className="relative"
          >
            <HeroArt className="w-full drop-shadow-xl" />
          </motion.div>
        </div>

        {/* logos marquee */}
        <div className="border-y border-border bg-surface/50">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-5">
            <span className="shrink-0 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
              Trusted at
            </span>
            <div className="relative flex-1 overflow-hidden">
              <div className="flex w-max animate-marquee items-center gap-12 opacity-60">
                {[
                  "Stanford",
                  "MIT",
                  "Oxford",
                  "Berkeley",
                  "ETH Zürich",
                  "NUS",
                  "Stanford",
                  "MIT",
                  "Oxford",
                  "Berkeley",
                  "ETH Zürich",
                  "NUS",
                ].map((n, i) => (
                  <span
                    key={i}
                    className="font-display text-[18px] font-semibold text-foreground/70"
                  >
                    {n}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Features ---------- */}
      <section id="features" className="mx-auto max-w-6xl px-5 py-20">
        <Reveal>
          <div className="max-w-2xl">
            <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
              Why TutorBook
            </div>
            <h2 className="mt-2 font-display text-[clamp(28px,4vw,40px)] font-semibold leading-tight">
              A tutor that reads the same books you do.
            </h2>
            <p className="mt-3 text-[16px] text-muted-foreground">
              Generic chatbots guess. TutorBook teaches from your material, shows its working, and
              keeps your whole curriculum in view.
            </p>
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

      {/* ---------- How it works ---------- */}
      <section id="how" className="border-y border-border bg-surface/40">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <Reveal>
            <h2 className="font-display text-[clamp(28px,4vw,40px)] font-semibold">
              Three steps to a tutor that knows your course.
            </h2>
          </Reveal>
          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
            {STEPS.map(([t, d], i) => (
              <Reveal key={t} delay={i * 0.08}>
                <div className="relative rounded-xl border border-border bg-card p-6 shadow-soft">
                  <span className="font-display text-[44px] font-semibold leading-none text-accent/20">
                    {i + 1}
                  </span>
                  <h3 className="mt-3 font-display text-[19px] font-semibold">{t}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Demo ---------- */}
      <section id="demo" className="mx-auto max-w-6xl px-5 py-20">
        <Reveal>
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
              See it in action
            </div>
            <h2 className="mt-2 font-display text-[clamp(28px,4vw,40px)] font-semibold">
              Chat on the left. Your knowledge on the right.
            </h2>
            <p className="mt-3 text-[16px] text-muted-foreground">
              The tutor retrieves evidence, reasons in the open, and opens the right surface — while
              your Study Map keeps the big picture.
            </p>
          </div>
        </Reveal>
        <Reveal y={28}>
          <DemoMock />
        </Reveal>
      </section>

      {/* ---------- Testimonial ---------- */}
      <section className="border-y border-border bg-primary text-primary-foreground">
        <div className="mx-auto max-w-4xl px-5 py-20 text-center">
          <Reveal>
            <Quote className="mx-auto h-9 w-9 opacity-40" />
            <p className="mx-auto mt-5 max-w-3xl font-display text-[clamp(22px,3.2vw,32px)] font-medium leading-snug">
              “It's the first time studying felt like having office hours on demand — except the
              tutor had actually read my professor's slides.”
            </p>
            <div className="mt-6 flex items-center justify-center gap-3 text-[14px]">
              <span className="h-9 w-9 rounded-full bg-gold" />
              <div className="text-left">
                <div className="font-semibold">Priya N.</div>
                <div className="opacity-70">2nd-year, Organic Chemistry</div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------- Pricing ---------- */}
      <section id="pricing" className="mx-auto max-w-6xl px-5 py-20">
        <Reveal>
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="font-display text-[clamp(28px,4vw,40px)] font-semibold">
              Simple pricing. Start free.
            </h2>
            <p className="mt-3 text-[16px] text-muted-foreground">
              Upgrade when your courses do. Cancel anytime.
            </p>
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

      {/* ---------- FAQ ---------- */}
      <section className="border-t border-border bg-surface/40">
        <div className="mx-auto max-w-3xl px-5 py-20">
          <Reveal>
            <h2 className="text-center font-display text-[clamp(26px,4vw,36px)] font-semibold">
              Questions, answered.
            </h2>
          </Reveal>
          <div className="mt-8 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {FAQS.map(([q, a], i) => {
              const open = openFaq === i;
              return (
                <div key={q}>
                  <button
                    onClick={() => setOpenFaq(open ? null : i)}
                    className="flex w-full items-center gap-3 px-5 py-4 text-left"
                  >
                    <span className="font-display text-[16px] font-medium">{q}</span>
                    <span
                      className={cn(
                        "ml-auto text-accent transition-transform",
                        open && "rotate-45",
                      )}
                    >
                      +
                    </span>
                  </button>
                  <motion.div
                    initial={false}
                    animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
                    transition={{ duration: 0.3, ease: [0.22, 0.61, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <p className="px-5 pb-4 text-[14px] leading-relaxed text-muted-foreground">
                      {a}
                    </p>
                  </motion.div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------- Final CTA ---------- */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <Reveal y={24}>
          <div className="relative overflow-hidden rounded-3xl border border-accent/30 bg-gradient-to-br from-accent to-primary px-8 py-14 text-center text-primary-foreground shadow-pop">
            <Grain opacity={0.4} />
            <h2 className="relative font-display text-[clamp(28px,4.5vw,44px)] font-semibold leading-tight">
              Your sources are waiting to teach you.
            </h2>
            <p className="relative mx-auto mt-3 max-w-xl text-[16px] opacity-85">
              Add your first PDF and meet a tutor that actually knows it — free to start.
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
