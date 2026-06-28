import { ArrowRight, FileText, Menu, ShieldAlert } from "lucide-react";
import { Badge, Button } from "../../ui/primitives.js";
import { Logo, Wordmark, Grain } from "../../ui/brand.js";
import { Reveal, motion } from "../../ui/motion.js";

/* ============================================================================
   Terms of service — Folio editorial long-form legal treatment.
   Self-contained public page: sticky nav, editorial hero, a sticky table of
   contents, restyled long-form sections, and a footer. Copy preserved from the
   original beta terms; only the presentation is editorial.
   ============================================================================ */

const UPDATED = "June 28, 2026";

type Section = {
  id: string;
  title: string;
  body: ReadonlyArray<string>;
};

const SECTIONS: ReadonlyArray<Section> = [
  {
    id: "beta",
    title: "Experimental beta",
    body: [
      "TutorBook is offered as an experimental beta. Features may change, break, or disappear without notice while we refine the product, and availability is not guaranteed.",
      "By using TutorBook during this period you acknowledge that the service is provided on an as-is basis and that you are helping us shape an early product.",
    ],
  },
  {
    id: "use",
    title: "Acceptable use",
    body: [
      "Do not use TutorBook for high-stakes educational decisions. Generated explanations, quizzes, and study plans are study aids — not authoritative assessments — and should not replace graded coursework, certifications, or professional advice.",
      "You are responsible for the sources you upload and must have the right to use them. Do not upload content that infringes others' rights or violates applicable law.",
    ],
  },
  {
    id: "content",
    title: "Your sources & content",
    body: [
      "Sources you add remain yours. We process them only to operate the tutoring experience for your workspace, and we never use your sources to train models.",
      "You can delete private sources and workspaces, or request full account deletion, at any time. See our privacy policy for how data is handled.",
    ],
  },
  {
    id: "availability",
    title: "Availability & changes",
    body: [
      "Because this is a beta, we may modify, suspend, or discontinue any part of the service at any time. We will make a reasonable effort to communicate significant changes.",
      "Full terms will be published before general availability. Continued use after updated terms take effect constitutes acceptance of those terms.",
    ],
  },
];

function Nav({ navigate }: { navigate: (p: string) => void }) {
  return (
    <motion.header
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 0.61, 0.36, 1] }}
      className="sticky top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur"
    >
      <div className="mx-auto flex max-w-5xl items-center gap-6 px-5 py-3">
        <button type="button" onClick={() => navigate("/")} aria-label="TutorBook home">
          <Wordmark />
        </button>
        <nav className="ml-4 hidden items-center gap-6 md:flex">
          <a
            href="/privacy"
            onClick={(e) => {
              e.preventDefault();
              navigate("/privacy");
            }}
            className="text-[14px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Privacy
          </a>
          <a
            href="/contact"
            onClick={(e) => {
              e.preventDefault();
              navigate("/contact");
            }}
            className="text-[14px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Contact
          </a>
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
            type="button"
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

export function TermsPage({ navigate }: { navigate: (path: string) => void }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <Nav navigate={navigate} />

      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden border-b border-border">
        <Grain opacity={0.5} />
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[360px] w-[760px] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" />
        <div className="mx-auto max-w-5xl px-5 pb-14 pt-16 lg:pb-16 lg:pt-20">
          <Reveal>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[12px] font-medium text-muted-foreground shadow-soft">
              <Badge tone="accent">Legal</Badge> Beta terms
            </div>
          </Reveal>
          <Reveal delay={0.05}>
            <h1 className="mt-5 font-display text-[clamp(36px,5.5vw,60px)] font-semibold leading-[1.04] tracking-[-0.02em]">
              Terms of <span className="text-gradient">service.</span>
            </h1>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-muted-foreground">
              The plain-language terms for using TutorBook while it is in experimental beta. Please
              read them before you rely on the product for your studies.
            </p>
          </Reveal>
          <Reveal delay={0.16}>
            <div className="mt-6 inline-flex items-center gap-2 text-[13px] text-muted-foreground">
              <FileText className="h-4 w-4 text-accent" />
              Last updated {UPDATED}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------- Beta notice ---------- */}
      <section className="mx-auto max-w-5xl px-5 pt-10">
        <Reveal y={20}>
          <div className="flex items-start gap-3 rounded-2xl border border-gold/40 bg-gold/10 p-5">
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gold/20 text-gold">
              <ShieldAlert className="h-5 w-5" />
            </span>
            <p className="text-[14.5px] leading-relaxed text-foreground/90">
              TutorBook is offered as an experimental beta.{" "}
              <span className="font-medium text-foreground">
                Do not use it for high-stakes educational decisions.
              </span>{" "}
              Full terms will be published before general availability.
            </p>
          </div>
        </Reveal>
      </section>

      {/* ---------- Body ---------- */}
      <section className="mx-auto max-w-5xl px-5 py-14">
        <div className="grid gap-10 lg:grid-cols-[220px_1fr]">
          {/* Table of contents */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
              On this page
            </div>
            <nav className="mt-3 space-y-1.5 border-l border-border pl-3">
              {SECTIONS.map((s, i) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="block text-[14px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  <span className="font-mono text-[11px] text-accent">
                    {String(i + 1).padStart(2, "0")}
                  </span>{" "}
                  {s.title}
                </a>
              ))}
            </nav>
          </aside>

          {/* Sections */}
          <div className="max-w-2xl">
            {SECTIONS.map((s, i) => (
              <Reveal key={s.id} delay={i * 0.04}>
                <article
                  id={s.id}
                  className="scroll-mt-24 border-b border-border py-8 first:pt-0 last:border-0 last:pb-0"
                >
                  <div className="flex items-baseline gap-3">
                    <span className="font-display text-[15px] font-semibold text-accent/40">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h2 className="font-display text-[clamp(22px,3vw,28px)] font-semibold leading-tight">
                      {s.title}
                    </h2>
                  </div>
                  <div className="mt-4 space-y-4">
                    {s.body.map((p, pi) => (
                      <p key={pi} className="text-[15.5px] leading-[1.7] text-muted-foreground">
                        {p}
                      </p>
                    ))}
                  </div>
                </article>
              </Reveal>
            ))}

            {/* Contact line */}
            <Reveal>
              <div className="mt-10 rounded-2xl border border-border bg-card p-6 shadow-soft">
                <h3 className="font-display text-[18px] font-semibold">
                  Questions about these terms?
                </h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">
                  We are happy to clarify anything before you commit to studying with TutorBook.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => navigate("/contact")}
                >
                  Get in touch <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-col gap-6 px-5 py-12 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Logo size={32} />
            <p className="mt-3 max-w-xs text-[13px] text-muted-foreground">
              The grounded tutoring OS — your sources, taught back to you.
            </p>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            {(
              [
                ["Privacy", "/privacy"],
                ["Terms", "/terms"],
                ["Contact", "/contact"],
              ] as ReadonlyArray<readonly [string, string]>
            ).map(([label, href]) => (
              <a
                key={label}
                href={href}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(href);
                }}
                className="cursor-pointer text-[14px] text-foreground/80 transition-colors hover:text-accent"
              >
                {label}
              </a>
            ))}
          </nav>
        </div>
        <div className="border-t border-border py-5 text-center text-[13px] text-muted-foreground">
          © {new Date().getFullYear()} TutorBook. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
