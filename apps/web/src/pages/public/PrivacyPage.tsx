import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { PublicLayout } from "./PublicLayout.js";
import { Eyebrow } from "../../ui/primitives.js";
import { Grain } from "../../ui/brand.js";
import { Reveal, motion } from "../../ui/motion.js";
import { cn } from "../../ui/cn.js";

/* ============================================================================
   Privacy policy — Folio editorial long-form legal page. Serif headings,
   readable measure, sticky section nav with scroll-spy. Copy preserved from
   the prior version, expanded into clearly-scoped sections.
   ============================================================================ */

type Section = {
  id: string;
  title: string;
  body: ReadonlyArray<string>;
  list?: ReadonlyArray<string>;
};

const UPDATED = "June 2026";

const SECTIONS: ReadonlyArray<Section> = [
  {
    id: "overview",
    title: "Overview",
    body: [
      "TutorBook collects account information, study activity, identified product analytics, optional privacy-masked workspace replay, and feedback to operate and improve the beta. This policy explains what we gather, how it is used, who processes it on our behalf, and the control you have over it.",
      "We have written it to be read, not skimmed past. If anything here is unclear, reach out and we will explain it plainly.",
    ],
  },
  {
    id: "what-we-collect",
    title: "What we collect",
    body: [
      "We collect the minimum needed to run a grounded tutoring product and make it better during the beta:",
    ],
    list: [
      "Account information — your name, email, and authentication identifiers.",
      "Study activity — notebooks, sessions, mastery progress, and the actions you take while learning.",
      "Identified product analytics — events that tell us which features are used and where they break.",
      "Optional workspace replay — privacy-masked recordings you can choose to enable to help us debug.",
      "Feedback — anything you send us directly about the product.",
    ],
  },
  {
    id: "your-sources",
    title: "Your sources",
    body: [
      "Uploaded sources are private to your learner workspace. They are processed by contracted authentication, storage, parsing, analytics, monitoring, and AI providers strictly to deliver the product to you.",
      "Your sources are never used to train models, and they are not shared with other learners or workspaces.",
    ],
  },
  {
    id: "analytics",
    title: "What analytics never include",
    body: [
      "Ordinary analytics events are deliberately scoped to behaviour, not content. They exclude:",
    ],
    list: [
      "Source text and uploaded file contents.",
      "Tutor transcripts and conversation detail.",
      "Private mastery detail tied to your learning.",
    ],
  },
  {
    id: "providers",
    title: "Service providers",
    body: [
      "We rely on contracted providers for authentication, storage, parsing, analytics, monitoring, and AI inference. Each processes data only as needed to provide their part of the service and under terms that bind them to confidentiality.",
    ],
  },
  {
    id: "your-controls",
    title: "Your controls",
    body: [
      "You stay in control of your data. You can delete private sources and workspaces at any time, or request full account deletion and we will remove your account data.",
    ],
    list: [
      "Delete individual sources from your workspace.",
      "Delete entire workspaces you no longer need.",
      "Request full account deletion.",
    ],
  },
  {
    id: "contact",
    title: "Contact",
    body: [
      "Questions about this policy, or a request related to your data, can be sent to us through the contact page and we will respond promptly.",
    ],
  },
];

function SectionNav({ active, onJump }: { active: string; onJump: (id: string) => void }) {
  return (
    <nav aria-label="On this page" className="space-y-1">
      <Eyebrow className="mb-3 text-accent">On this page</Eyebrow>
      {SECTIONS.map((s) => {
        const current = s.id === active;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onJump(s.id)}
            className={cn(
              "block w-full rounded-md border-l-2 px-3 py-1.5 text-left text-[13.5px] transition-colors",
              current
                ? "border-accent bg-accent/8 font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
            aria-current={current ? "true" : undefined}
          >
            {s.title}
          </button>
        );
      })}
    </nav>
  );
}

export function PrivacyPage({ navigate }: { navigate: (path: string) => void }) {
  const [active, setActive] = useState<string>(SECTIONS[0]?.id ?? "overview");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const first = visible[0];
        if (first) setActive(first.target.id);
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: 0 },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <PublicLayout navigate={navigate}>
      <div className="min-h-dvh bg-background text-foreground">
        {/* ---------- Header ---------- */}
        <section className="relative overflow-hidden border-b border-border">
          <Grain opacity={0.5} />
          <div className="pointer-events-none absolute -top-32 left-1/2 h-[320px] w-[680px] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" />
          <div className="mx-auto max-w-4xl px-5 pb-12 pt-16">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[12px] font-medium text-muted-foreground shadow-soft"
            >
              <span className="grid h-5 w-5 place-items-center rounded-md bg-accent/12 text-accent">
                <ShieldCheck className="h-3.5 w-3.5" />
              </span>
              Privacy policy
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.05, ease: [0.22, 0.61, 0.36, 1] }}
              className="mt-5 font-display text-[clamp(34px,5vw,52px)] font-semibold leading-[1.05] tracking-[-0.02em]"
            >
              Your sources stay yours.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.12 }}
              className="mt-4 max-w-2xl text-[17px] leading-relaxed text-muted-foreground"
            >
              How TutorBook collects, uses, and protects your data — written to be read.
            </motion.p>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mt-5 text-[13px] text-muted-foreground"
            >
              Last updated <span className="font-medium text-foreground">{UPDATED}</span>
            </motion.div>
          </div>
        </section>

        {/* ---------- Body ---------- */}
        <div className="mx-auto max-w-6xl px-5 py-14">
          <div className="grid gap-12 lg:grid-cols-[220px_1fr]">
            {/* sticky section nav */}
            <aside className="hidden lg:block">
              <div className="sticky top-24">
                <SectionNav active={active} onJump={jump} />
              </div>
            </aside>

            {/* long-form content */}
            <article className="max-w-2xl">
              {SECTIONS.map((s, i) => (
                <Reveal key={s.id} delay={i === 0 ? 0 : 0.04} as="section">
                  <section
                    id={s.id}
                    className={cn("scroll-mt-24", i > 0 && "mt-12 border-t border-border pt-12")}
                  >
                    <h2 className="font-display text-[clamp(22px,3vw,30px)] font-semibold tracking-[-0.01em]">
                      {s.title}
                    </h2>
                    <div className="mt-4 space-y-4">
                      {s.body.map((p, pi) => (
                        <p key={pi} className="text-[16px] leading-[1.75] text-muted-foreground">
                          {p}
                        </p>
                      ))}
                    </div>
                    {s.list && (
                      <ul className="mt-5 space-y-3">
                        {s.list.map((item, li) => (
                          <li
                            key={li}
                            className="flex gap-3 text-[15.5px] leading-[1.65] text-foreground/85"
                          >
                            <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </Reveal>
              ))}

              {/* contact CTA */}
              <Reveal delay={0.05}>
                <div className="mt-14 rounded-2xl border border-border bg-card p-6 shadow-soft">
                  <h3 className="font-display text-[19px] font-semibold">
                    Have a question about your data?
                  </h3>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">
                    We are happy to walk through any part of this policy or help with a deletion
                    request.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate("/contact")}
                    className="mt-4 inline-flex items-center gap-2 text-[14px] font-medium text-accent underline-offset-4 hover:underline"
                  >
                    Contact us
                  </button>
                </div>
              </Reveal>
            </article>
          </div>
        </div>

        {/* ---------- Footer ---------- */}
        <footer className="border-t border-border">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 text-[13px] text-muted-foreground sm:flex-row">
            <span>© {new Date().getFullYear()} TutorBook. All rights reserved.</span>
            <div className="flex items-center gap-5">
              <button
                type="button"
                onClick={() => navigate("/terms")}
                className="hover:text-accent"
              >
                Terms
              </button>
              <button
                type="button"
                onClick={() => navigate("/contact")}
                className="hover:text-accent"
              >
                Contact
              </button>
            </div>
          </div>
        </footer>
      </div>
    </PublicLayout>
  );
}
