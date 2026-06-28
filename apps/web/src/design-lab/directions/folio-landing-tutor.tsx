import {
  ArrowRight,
  Brain,
  FlaskConical,
  GraduationCap,
  ListChecks,
  Sparkles,
  Wand2,
} from "lucide-react";
import { FolioGraphCanvas, FolioNode } from "../ui/folio-nodes.js";
import { Button } from "../ui/primitives.js";
import { AgentTrace, Citation, DEMO_TRACE, UserBubble } from "../ui/workspace.js";
import { AppSurface, SimulationSurface } from "../ui/surfaces.js";
import {
  FaqSection,
  HeroImage,
  LogoStrip,
  Reveal,
  SectionHeader,
  TestimonialGrid,
} from "./folio-landing-shared.js";
import {
  Badge,
  ChevronRight,
  CtaPair,
  DemoBrowser,
  LandingShell,
  type LandingNavigate,
} from "./folio-landing-chrome.js";

const HERO_IMG = "/folio-landing/folio-landing-tutor-hero.png";

const AGENT_STEPS = [
  { icon: Brain, title: "Reads your learning state", desc: "Mastery, weak spots, last session" },
  { icon: Wand2, title: "Retrieves evidence", desc: "Search across PDFs, slides, notes" },
  { icon: Sparkles, title: "Composes a grounded answer", desc: "With citations you can verify" },
  { icon: ListChecks, title: "Opens practice", desc: "Quizzes & cards when you're ready" },
];

export function FolioLandingTutor({ navigate }: { navigate: LandingNavigate }) {
  return (
    <LandingShell variant="tutor" navigate={navigate}>
      <section className="folio-landing-hero folio-landing-hero--tutor folio-landing-hero--grain">
        <div className="folio-landing-container">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <Reveal>
              <Badge tone="accent" className="mb-4 border-primary-foreground/20 bg-white/10 text-primary-foreground">
                <Sparkles className="h-3 w-3" /> Chat-first tutoring
              </Badge>
              <h1 className="font-display text-[clamp(2.25rem,5vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.02em] text-primary-foreground">
                A tutor that shows its work.
              </h1>
              <p className="mt-4 max-w-md text-[16px] leading-relaxed text-primary-foreground/85">
                Every answer traces back to your material — with agent activity, citations, and
                one-click practice. Folio is tutoring you can trust when the exam is on Friday.
              </p>
              <div className="mt-8">
                <CtaPair navigate={navigate} primary="Start free" secondary="Live demo" invert />
              </div>
              <div className="mt-8 flex flex-wrap gap-6 border-t border-primary-foreground/15 pt-6">
                {[
                  { v: "92%", l: "Answers cited" },
                  { v: "<3s", l: "Evidence retrieval" },
                  { v: "5", l: "Agent steps visible" },
                ].map((s) => (
                  <div key={s.l}>
                    <p className="font-display text-[24px] font-semibold text-primary-foreground">{s.v}</p>
                    <p className="font-mono text-[9px] uppercase tracking-wider text-primary-foreground/60">
                      {s.l}
                    </p>
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal delay={120}>
              <div className="relative">
                <HeroImage
                  src={HERO_IMG}
                  alt="Folio tutor with citations"
                  className="folio-float-slow folio-hero-image--dark"
                />
                <div className="folio-hero-float-card">
                  <DemoBrowser title="Tutor session · SN2 mechanism">
                    <div className="space-y-4 p-4">
                      <UserBubble>Walk me through backside attack.</UserBubble>
                      <AgentTrace steps={DEMO_TRACE} working />
                      <p className="font-display text-[14px] leading-relaxed">
                        In S<sub>N</sub>2, the nucleophile approaches opposite the leaving group — a
                        Walden inversion.
                      </p>
                      <div className="flex gap-1.5">
                        <Citation>Ch. 7, p. 142</Citation>
                        <Citation>Lecture 14</Citation>
                      </div>
                    </div>
                  </DemoBrowser>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <LogoStrip />

      <section className="folio-landing-section">
        <div className="folio-landing-container">
          <Reveal>
            <SectionHeader
              eyebrow="How it works"
              title="From upload to mastery in four moves"
              align="center"
            />
          </Reveal>
          <div className="mt-10 grid gap-4 md:grid-cols-4">
            {AGENT_STEPS.map((step, i) => (
              <Reveal key={step.title} delay={i * 70}>
                <div className="folio-step-card folio-step-card--tall">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-[var(--radius)] bg-accent/12 text-accent">
                      <step.icon className="h-5 w-5" />
                    </span>
                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {String(i + 1).padStart(2, "0")}
                    </p>
                  </div>
                  <h3 className="mt-3 font-display text-[17px] font-semibold">{step.title}</h3>
                  <p className="mt-1 text-[13px] text-muted-foreground">{step.desc}</p>
                  {i < 3 ? (
                    <ChevronRight className="folio-step-arrow hidden h-4 w-4 text-border md:block" />
                  ) : null}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="folio-landing-section folio-landing-section--muted">
        <div className="folio-landing-container">
          <div className="grid gap-10 lg:grid-cols-2">
            <Reveal>
              <SectionHeader
                eyebrow="Agent activity"
                title="No black-box answers"
                lead="Watch the tutor read your state, pull sources, reason, and compose — before you read a word."
              />
              <ul className="mt-6 space-y-3">
                {[
                  "Mastery snapshot before each turn",
                  "Tool calls with retrieval hits",
                  "Reasoning you can skim or expand",
                  "Practice decks generated on demand",
                ].map((line) => (
                  <li key={line} className="flex gap-2 text-[14px]">
                    <span className="text-accent">→</span>
                    {line}
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={100}>
              <div className="rounded-[var(--radius)] border border-border bg-elevated p-4 shadow-soft">
                <AgentTrace steps={DEMO_TRACE} defaultOpen />
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="folio-landing-section">
        <div className="folio-landing-container">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <SectionHeader eyebrow="Workspace" title="Tutor + map + surfaces" />
              <Button variant="accent" onClick={() => navigate("/notebooks/demo-orgchem")}>
                Open full demo <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </Reveal>
          <div className="mt-8 grid gap-4 lg:grid-cols-[1.25fr_1fr]">
            <Reveal delay={80}>
              <DemoBrowser title="Study map · Organic Chemistry I">
                <div className="relative h-[340px] overflow-hidden">
                  <FolioGraphCanvas height={420} />
                </div>
              </DemoBrowser>
            </Reveal>
            <div className="grid gap-4">
              <Reveal delay={120}>
                <FolioNode
                  type="concept"
                  size="m"
                  state="selected"
                  title="SN2 Reaction"
                  claim="Verified claim"
                />
              </Reveal>
              <Reveal delay={180}>
                <FolioNode
                  type="plan"
                  size="l"
                  title="Substitution Steps"
                  steps={[
                    { label: "Proton transfer", done: true },
                    { label: "Backside attack", active: true },
                    { label: "Product isolation" },
                  ]}
                />
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      <section className="folio-landing-section folio-landing-section--muted">
        <div className="folio-landing-container">
          <Reveal>
            <SectionHeader
              eyebrow="Surfaces"
              title="The tutor opens what you need"
              align="center"
            />
          </Reveal>
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <Reveal delay={60}>
              <div className="folio-surface-showcase">
                <div className="folio-surface-showcase-label">
                  <FlaskConical className="h-3.5 w-3.5" /> Interactive
                </div>
                <div className="h-[300px] overflow-hidden">
                  <SimulationSurface />
                </div>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div className="folio-surface-showcase">
                <div className="folio-surface-showcase-label">
                  <GraduationCap className="h-3.5 w-3.5" /> MCP apps
                </div>
                <div className="h-[300px] overflow-hidden">
                  <AppSurface />
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="folio-landing-section">
        <div className="folio-landing-container">
          <Reveal>
            <SectionHeader eyebrow="Learners" title="What students say" align="center" />
          </Reveal>
          <div className="mt-10">
            <TestimonialGrid />
          </div>
        </div>
      </section>

      <section className="folio-landing-section folio-landing-section--muted">
        <div className="folio-landing-container max-w-3xl">
          <Reveal>
            <SectionHeader eyebrow="FAQ" title="Questions about the tutor" align="center" />
          </Reveal>
          <div className="mt-8">
            <FaqSection />
          </div>
        </div>
      </section>

      <section className="folio-landing-cta-band folio-landing-cta-band--dark folio-landing-cta-band--glow">
        <div className="folio-landing-container text-center">
          <Reveal>
            <h2 className="font-display text-[clamp(1.75rem,4vw,2.25rem)] font-semibold text-primary-foreground">
              Join the beta
            </h2>
            <p className="mx-auto mt-3 max-w-lg font-display text-[15px] italic text-primary-foreground/75">
              Students in organic chemistry, math, and biology are already studying with Folio.
            </p>
            <div className="mt-8 flex justify-center">
              <CtaPair navigate={navigate} primary="Get started" invert />
            </div>
          </Reveal>
        </div>
      </section>
    </LandingShell>
  );
}
