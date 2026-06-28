import type { ReactNode } from "react";
import { PublicChrome } from "../../components/chrome/public-chrome.js";
import { Eyebrow } from "../ui/primitives.js";

function PublicDoc({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow: string;
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <PublicChrome>
      <div className="mx-auto w-full max-w-3xl px-6 pb-24 pt-16">
        <Eyebrow className="folio-landing-eyebrow">{eyebrow}</Eyebrow>
        <h1 className="mt-3 font-display text-[clamp(2rem,5vw,3rem)] font-semibold leading-tight tracking-[-0.02em]">
          {title}
        </h1>
        {lead ? (
          <p className="mt-3 max-w-2xl font-display text-[17px] italic leading-relaxed text-muted-foreground">
            {lead}
          </p>
        ) : null}
        <div className="mt-10 space-y-8 text-[15px] leading-[1.7] text-foreground/85">{children}</div>
      </div>
    </PublicChrome>
  );
}

function DocSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-[20px] font-semibold tracking-[-0.01em]">{heading}</h2>
      <div className="mt-2 space-y-2 text-muted-foreground">{children}</div>
    </section>
  );
}

export function ContactPage() {
  return (
    <PublicDoc
      eyebrow="Get in touch"
      title="Contact"
      lead="We're a small team building a grounded study tutor. We read every message."
    >
      <DocSection heading="Support">
        <p>
          For help, bugs, or feedback during the beta, email{" "}
          <a href="mailto:support@tutorbook.app" className="text-accent hover:underline">
            support@tutorbook.app
          </a>
          . We typically reply within one business day.
        </p>
      </DocSection>
      <DocSection heading="Partnerships & schools">
        <p>
          Running a course or cohort? Reach out at{" "}
          <a href="mailto:hello@tutorbook.app" className="text-accent hover:underline">
            hello@tutorbook.app
          </a>{" "}
          to talk about study templates and access codes.
        </p>
      </DocSection>
    </PublicDoc>
  );
}

export function PrivacyPage() {
  return (
    <PublicDoc
      eyebrow="Legal"
      title="Privacy policy"
      lead="How TutorBook handles your sources and study data."
    >
      <DocSection heading="What we collect">
        <p>
          Your account details, the sources you upload, and the study activity needed to power
          tutoring, the study map, and your journal.
        </p>
      </DocSection>
      <DocSection heading="How your sources are used">
        <p>
          Uploaded materials are indexed so the tutor can cite them. They are scoped to your
          notebooks and are not used to train shared models.
        </p>
      </DocSection>
      <DocSection heading="Your controls">
        <p>
          You can review consent and request deletion of your account and data from Account →
          Data at any time.
        </p>
      </DocSection>
      <p className="text-[13px] text-muted-foreground">This is a beta product preview.</p>
    </PublicDoc>
  );
}

export function TermsPage() {
  return (
    <PublicDoc
      eyebrow="Legal"
      title="Terms of use"
      lead="The terms for using the TutorBook beta."
    >
      <DocSection heading="Beta software">
        <p>
          TutorBook is an experimental beta. Features may change, and you should not rely on it for
          high-stakes decisions. Always verify important answers against your sources.
        </p>
      </DocSection>
      <DocSection heading="Acceptable use">
        <p>
          Use TutorBook for your own learning. Don't upload material you don't have the right to
          use, and don't attempt to disrupt the service.
        </p>
      </DocSection>
      <DocSection heading="Credits">
        <p>
          Tutor credits meter AI turns. Reading your materials, browsing the study map, and
          reviewing practice never consume credits.
        </p>
      </DocSection>
    </PublicDoc>
  );
}
