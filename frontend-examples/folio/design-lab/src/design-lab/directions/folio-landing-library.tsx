import { ArrowRight, BookOpen, Check } from "lucide-react";
import { folioTemplates } from "../lib/folio-mock-data.js";
import { FolioNode } from "../ui/folio-nodes.js";
import { Button } from "../ui/primitives.js";
import { Eyebrow } from "../ui/primitives.js";
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
import { CtaPair, LandingShell, type LandingNavigate } from "./folio-landing-chrome.js";

const HERO_IMG = "/folio-landing/folio-landing-library-hero.png";

const TIMELINE = [
  { day: "Day 1", title: "Create a workspace", body: "Pick a template or upload your syllabus." },
  { day: "Day 2", title: "Ingest sources", body: "PDFs and slides become tutoring-ready." },
  { day: "Week 1", title: "Map emerges", body: "Concepts and objectives link on your study map." },
  { day: "Ongoing", title: "Journal rhythm", body: "Tutor, practice, and progress in one thread." },
];

export function FolioLandingLibrary({ navigate }: { navigate: LandingNavigate }) {
  return (
    <LandingShell variant="library" navigate={navigate}>
      <section className="folio-landing-hero folio-landing-hero--library folio-landing-hero--mesh">
        <div className="folio-landing-container text-center">
          <Reveal>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Folio by TutorBook
            </p>
            <h1 className="mx-auto mt-4 max-w-3xl font-display text-[clamp(2.25rem,5.5vw,3.25rem)] font-semibold leading-[1.02] tracking-[-0.03em]">
              Study like you have a brilliant TA — who only uses your syllabus.
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-[16px] leading-relaxed text-muted-foreground">
              Not another generic chatbot. Folio is an editorial study environment built around your
              notebooks, sources, and learning map — designed for students who still read the
              textbook.
            </p>
            <div className="mt-8 flex justify-center">
              <CtaPair navigate={navigate} />
            </div>
          </Reveal>
        </div>

        <Reveal delay={150}>
          <div className="folio-library-hero-visual">
            <HeroImage src={HERO_IMG} alt="Folio scholarly study library" className="folio-float-slow" />
            <div className="folio-library-collage folio-library-collage--animated" aria-hidden>
              <div className="folio-library-card folio-library-card--1 folio-float-delay-1">
                <Eyebrow>Journal</Eyebrow>
                <p className="mt-2 font-display text-[18px] font-semibold">3 notebooks</p>
                <p className="mt-1 text-[12px] text-muted-foreground">60% through Orgo Ch. 7</p>
              </div>
              <div className="folio-library-card folio-library-card--2 folio-float-delay-2">
                <FolioNode type="concept" size="s" title="SN2 Reaction" />
              </div>
              <div className="folio-library-card folio-library-card--3 folio-float-delay-3">
                <p className="font-display text-[13px] italic leading-relaxed">
                  &ldquo;Finally a tutor that cites the textbook.&rdquo;
                </p>
                <p className="mt-2 font-mono text-[10px] uppercase text-muted-foreground">
                  — Beta learner, pre-med
                </p>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <LogoStrip />

      <section className="folio-landing-section">
        <div className="folio-landing-container">
          <div className="grid gap-8 md:grid-cols-4">
            {[
              { v: "47m", l: "Avg. session" },
              { v: "92%", l: "Answers cited" },
              { v: "3.2×", l: "Faster review" },
              { v: "7/7", l: "Sources ready" },
            ].map((s, i) => (
              <Reveal key={s.l} delay={i * 60}>
                <div className="folio-stat-card text-center">
                  <p className="font-display text-[40px] font-semibold tabular-nums text-accent folio-count-up">
                    {s.v}
                  </p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {s.l}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="folio-landing-section folio-landing-section--muted">
        <div className="folio-landing-container">
          <Reveal>
            <SectionHeader
              eyebrow="Platform"
              title="Everything in one notebook"
              lead="Six capabilities that work together — not six tabs in six apps."
              align="center"
            />
          </Reveal>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {PRODUCT_FEATURES.map((f, i) => (
              <Reveal key={f.id} delay={i * 50}>
                <article className="folio-feature-tile">
                  <h3 className="font-display text-[18px] font-semibold">{f.title}</h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{f.body}</p>
                  <ul className="mt-3 space-y-1">
                    {f.points.map((p) => (
                      <li key={p} className="flex items-center gap-2 text-[12px] text-muted-foreground">
                        <Check className="h-3 w-3 shrink-0 text-accent" />
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

      <section className="folio-landing-section">
        <div className="folio-landing-container">
          <div className="grid gap-12 lg:grid-cols-2">
            <Reveal>
              <SectionHeader eyebrow="Your first week" title="From zero to studying" />
            </Reveal>
            <div className="folio-timeline">
              {TIMELINE.map((item, i) => (
                <Reveal key={item.day} delay={i * 80}>
                  <div className="folio-timeline-item">
                    <span className="folio-timeline-marker" />
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-wider text-accent">
                        {item.day}
                      </p>
                      <h3 className="mt-1 font-display text-[17px] font-semibold">{item.title}</h3>
                      <p className="mt-1 text-[13px] text-muted-foreground">{item.body}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="folio-landing-section folio-landing-section--muted">
        <div className="folio-landing-container">
          <Reveal>
            <SectionHeader eyebrow="Compare" title="Why not generic AI?" align="center" />
          </Reveal>
          <div className="mx-auto mt-10 max-w-2xl">
            <Reveal delay={100}>
              <ComparisonTable />
            </Reveal>
          </div>
        </div>
      </section>

      <section className="folio-landing-section">
        <div className="folio-landing-container">
          <Reveal>
            <SectionHeader eyebrow="Templates" title="Start from a published curriculum" />
          </Reveal>
          <div className="mt-10 grid gap-5 sm:grid-cols-3">
            {folioTemplates.map((t, i) => (
              <Reveal key={t.id} delay={i * 80}>
                <article className="folio-template-landing-card folio-template-landing-card--lift">
                  <BookOpen className="h-4 w-4 text-accent" />
                  <h3 className="mt-3 font-display text-[18px] font-semibold">{t.title}</h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                    {t.description}
                  </p>
                  <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {t.estimatedMinutes} min · {t.sourceLevel}
                  </p>
                  <div className="mt-4 flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/templates/${encodeURIComponent(t.id)}`)}
                    >
                      Details
                    </Button>
                    <Button
                      variant="accent"
                      size="sm"
                      onClick={() =>
                        navigate(`/workspaces/new?template=${encodeURIComponent(t.id)}`)
                      }
                    >
                      Start
                    </Button>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="folio-landing-section folio-landing-section--muted">
        <div className="folio-landing-container">
          <Reveal>
            <SectionHeader eyebrow="Voices" title="Learners on Folio" align="center" />
          </Reveal>
          <div className="mt-10">
            <TestimonialGrid />
          </div>
        </div>
      </section>

      <section className="folio-landing-section">
        <div className="folio-landing-container max-w-3xl">
          <Reveal>
            <SectionHeader eyebrow="FAQ" title="Before you begin" align="center" />
          </Reveal>
          <div className="mt-8">
            <FaqSection />
          </div>
        </div>
      </section>

      <section className="folio-landing-cta-band folio-landing-cta-band--glow">
        <div className="folio-landing-container">
          <Reveal>
            <div className="folio-library-signup">
              <div>
                <h2 className="font-display text-[26px] font-semibold">Request beta access</h2>
                <p className="mt-2 max-w-md text-[14px] leading-relaxed text-muted-foreground">
                  Join students studying organic chemistry, linear algebra, and cell biology with
                  Folio. Instant access to the demo workspace.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="email"
                  placeholder="you@university.edu"
                  className="folio-landing-input"
                  readOnly
                />
                <Button variant="accent" onClick={() => navigate("/dashboard")}>
                  Get access <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </LandingShell>
  );
}
