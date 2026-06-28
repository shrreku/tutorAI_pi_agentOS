import { ArrowRight, BookOpen, ListChecks } from "lucide-react";
import { FolioGraphCanvas } from "../ui/folio-nodes.js";
import { Badge, Button, Eyebrow } from "../ui/primitives.js";
import { PracticeSurface, TextSurface } from "../ui/surfaces.js";
import { Citation, UserBubble } from "../ui/workspace.js";
import {
  ComparisonTable,
  FaqSection,
  HeroImage,
  LogoStrip,
  PRODUCT_FEATURES,
  Reveal,
  SectionHeader,
  TestimonialGrid,
} from "./folio-landing-shared.js";
import {
  CtaPair,
  DemoBrowser,
  LandingShell,
  type LandingNavigate,
} from "./folio-landing-chrome.js";

const HERO_IMG = "/folio-landing/folio-landing-journal-hero.png";

export function FolioLandingJournal({ navigate }: { navigate: LandingNavigate }) {
  const highlights = PRODUCT_FEATURES.slice(0, 3);

  return (
    <LandingShell variant="journal" navigate={navigate}>
      <section className="folio-landing-hero folio-landing-hero--journal folio-landing-hero--mesh">
        <div className="folio-landing-container">
          <Reveal>
            <div className="folio-journal-masthead">
              <span className="folio-journal-rule" />
              <p className="folio-journal-kicker">The Study Journal · Vol. I</p>
              <span className="folio-journal-rule" />
            </div>
            <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.1fr]">
              <div>
                <h1 className="folio-journal-headline folio-journal-headline--wide">
                  Your sources become a tutor that <em>remembers</em> the thread.
                </h1>
                <p className="folio-journal-deck">
                  Folio is an editorial study environment for serious learners — grounded tutoring,
                  a living curriculum map, and a journal that tracks what matters for your next
                  session.
                </p>
                <div className="mt-6 flex flex-wrap gap-4">
                  <CtaPair navigate={navigate} primary="Begin your journal" secondary="Explore demo" />
                </div>
                <p className="mt-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Free during beta · No credit card · Your data stays yours
                </p>
              </div>
              <HeroImage src={HERO_IMG} alt="Folio study journal interface" className="folio-float-slow" />
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div className="folio-journal-spread folio-journal-spread--lift">
              <div className="folio-journal-spread-left">
                <Eyebrow>Today&apos;s journal</Eyebrow>
                <h2 className="mt-3 font-display text-[28px] font-semibold leading-tight">
                  Welcome back, Alex.
                </h2>
                <p className="mt-3 border-l-2 border-accent/60 pl-3 font-display text-[14px] italic leading-relaxed text-muted-foreground">
                  <span className="not-italic font-mono text-[10px] font-semibold uppercase tracking-wider text-accent">
                    Tutor
                  </span>{" "}
                  Stereochemistry is still at 45% — start with the five chiral-center flashcards
                  queued for you.
                </p>
                <ul className="mt-6 space-y-3 border-t border-border pt-4">
                  {["Organic Chemistry I · Ch. 7", "Linear Algebra", "Cell Biology"].map((t, i) => (
                    <li key={t} className="flex items-baseline gap-3">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="font-display text-[15px] font-medium">{t}</span>
                      {i === 0 ? (
                        <Badge tone="accent" className="ml-auto">
                          Active
                        </Badge>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <div className="mt-6 grid grid-cols-3 gap-2 border-t border-border pt-4">
                  {[
                    { v: "47m", l: "Today" },
                    { v: "71%", l: "Credits" },
                    { v: "3", l: "Due" },
                  ].map((s) => (
                    <div key={s.l} className="text-center">
                      <p className="font-display text-[22px] font-semibold tabular-nums">{s.v}</p>
                      <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                        {s.l}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="folio-journal-spread-right">
                <DemoBrowser title="Organic Chemistry I · workspace">
                  <div className="grid min-h-[300px] grid-cols-2">
                    <div className="border-r border-border p-3">
                      <UserBubble>Why does SN2 invert stereochemistry?</UserBubble>
                      <p className="mt-3 font-display text-[12px] leading-relaxed text-foreground/85">
                        The nucleophile attacks from the backside — like an umbrella flipping inside
                        out. As substituents pass through a planar transition state, the stereocentre
                        inverts — a Walden inversion.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Citation>Clayden p. 142</Citation>
                        <Citation>Lecture 14</Citation>
                      </div>
                    </div>
                    <div className="relative min-h-[220px] overflow-hidden bg-surface/40 p-2">
                      <div className="origin-top-left scale-[0.45]">
                        <FolioGraphCanvas height={340} />
                      </div>
                    </div>
                  </div>
                </DemoBrowser>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <LogoStrip />

      <section className="folio-landing-section">
        <div className="folio-landing-container">
          <Reveal>
            <SectionHeader
              eyebrow="The product"
              title="Three surfaces, one notebook"
              lead="Journal for rhythm, tutor for depth, map for structure — always in the same workspace."
            />
          </Reveal>
          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {highlights.map((f, i) => (
              <Reveal key={f.id} delay={i * 100}>
                <article className="folio-product-panel">
                  <span className="folio-feature-numeral">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="mt-2 font-display text-[20px] font-semibold">{f.title}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{f.body}</p>
                  <ul className="mt-4 space-y-1.5">
                    {f.points.map((p) => (
                      <li key={p} className="flex items-center gap-2 text-[13px]">
                        <span className="h-1 w-1 rounded-full bg-accent" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="folio-landing-section folio-landing-section--muted">
        <div className="folio-landing-container">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <Reveal>
              <SectionHeader
                eyebrow="Study map"
                title="Editorial figure-nodes, not generic bubbles"
                lead="Curriculum, concepts, objectives, and checkpoints — numbered like figures in a textbook."
              />
              <p className="mt-4 text-[14px] leading-relaxed text-muted-foreground">
                Click a concept to pull evidence, open reading, or launch practice. The map updates as
                you master objectives — your tutor always knows where you are on the path.
              </p>
              <Button
                variant="accent"
                className="mt-6"
                onClick={() => navigate("/notebooks/demo-orgchem")}
              >
                Explore the map <ArrowRight className="h-4 w-4" />
              </Button>
            </Reveal>
            <Reveal delay={100}>
              <div className="relative h-[360px] overflow-hidden rounded-[var(--radius)] border border-border bg-elevated shadow-soft">
                <FolioGraphCanvas height={400} />
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="folio-landing-section">
        <div className="folio-landing-container">
          <Reveal>
            <SectionHeader
              eyebrow="Learning surfaces"
              title="Reading & practice open beside the tutor"
              align="center"
            />
          </Reveal>
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <Reveal delay={80}>
              <div className="folio-surface-showcase">
                <div className="folio-surface-showcase-label">
                  <BookOpen className="h-3.5 w-3.5" /> Reading
                </div>
                <div className="h-[280px] overflow-hidden">
                  <TextSurface />
                </div>
              </div>
            </Reveal>
            <Reveal delay={160}>
              <div className="folio-surface-showcase">
                <div className="folio-surface-showcase-label">
                  <ListChecks className="h-3.5 w-3.5" /> Practice
                </div>
                <div className="h-[280px] overflow-hidden">
                  <PracticeSurface />
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="folio-landing-section folio-landing-section--muted">
        <div className="folio-landing-container">
          <Reveal>
            <SectionHeader eyebrow="Learners" title="Built for exam-season trust" align="center" />
          </Reveal>
          <div className="mt-10">
            <TestimonialGrid />
          </div>
        </div>
      </section>

      <section className="folio-landing-section">
        <div className="folio-landing-container grid gap-12 lg:grid-cols-2">
          <Reveal>
            <SectionHeader eyebrow="Compare" title="Folio vs. generic AI" />
            <p className="mt-4 text-[14px] text-muted-foreground">
              When the midterm is next week, you need citations — not confident-sounding guesses.
            </p>
          </Reveal>
          <Reveal delay={100}>
            <ComparisonTable />
          </Reveal>
        </div>
      </section>

      <section className="folio-landing-section folio-landing-section--muted">
        <div className="folio-landing-container max-w-3xl">
          <Reveal>
            <SectionHeader eyebrow="FAQ" title="Common questions" align="center" />
          </Reveal>
          <div className="mt-8">
            <FaqSection />
          </div>
        </div>
      </section>

      <section className="folio-landing-cta-band folio-landing-cta-band--glow">
        <div className="folio-landing-container flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
          <Reveal>
            <h2 className="font-display text-[32px] font-semibold">Ready to open your journal?</h2>
            <p className="mt-1 font-display text-[15px] italic text-foreground/70">
              Start with a template or bring your own syllabus — tutoring begins in minutes.
            </p>
          </Reveal>
          <CtaPair navigate={navigate} />
        </div>
      </section>
    </LandingShell>
  );
}
