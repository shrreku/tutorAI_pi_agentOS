import { ArrowRight } from "lucide-react";
import { Eyebrow } from "../ui/primitives.js";
import { Reveal } from "./folio-landing-shared.js";
import { LANDING_VARIANTS, LandingShell, type LandingNavigate } from "./folio-landing-chrome.js";
import { FolioLandingJournal } from "./folio-landing-journal.js";
import { FolioLandingLibrary } from "./folio-landing-library.js";
import { FolioLandingTutor } from "./folio-landing-tutor.js";

export type { FolioLandingVariant } from "./folio-landing-chrome.js";
import type { FolioLandingVariant } from "./folio-landing-chrome.js";

function FolioLandingIndex({ navigate }: { navigate: LandingNavigate }) {
  return (
    <LandingShell variant="index" navigate={navigate}>
      <section className="folio-landing-section folio-landing-section--index folio-landing-hero--mesh">
        <div className="folio-landing-container">
          <Reveal>
            <Eyebrow>Folio marketing</Eyebrow>
            <h1 className="mt-3 max-w-2xl font-display text-[clamp(2rem,4.5vw,2.5rem)] font-semibold leading-tight tracking-[-0.02em]">
              Three polished landing pages for a genuine study product.
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
              Full-length pages with hero art, product demos, testimonials, FAQ, and CTAs into the
              live Folio app. Pick a direction below.
            </p>
          </Reveal>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {LANDING_VARIANTS.map((v, i) => (
              <Reveal key={v.id} delay={i * 80}>
                <button
                  type="button"
                  className="folio-landing-picker-card group h-full text-left"
                  onClick={() => navigate(`/landing/${v.id}`)}
                >
                  <span className="folio-landing-picker-label">{v.label}</span>
                  <span className="mt-2 block font-display text-[22px] font-semibold leading-snug group-hover:text-accent">
                    {v.id === "journal" && "The Study Journal"}
                    {v.id === "tutor" && "Chat-first tutor"}
                    {v.id === "library" && "Scholar's library"}
                  </span>
                  <p className="mt-2 text-[13px] text-muted-foreground">{v.blurb}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-accent">
                    View page <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </button>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </LandingShell>
  );
}

export function FolioLandingPage({
  variant,
  navigate,
}: {
  variant: FolioLandingVariant;
  navigate: (path: string) => void;
}) {
  switch (variant) {
    case "journal":
      return <FolioLandingJournal navigate={navigate} />;
    case "tutor":
      return <FolioLandingTutor navigate={navigate} />;
    case "library":
      return <FolioLandingLibrary navigate={navigate} />;
    default:
      return <FolioLandingIndex navigate={navigate} />;
  }
}
