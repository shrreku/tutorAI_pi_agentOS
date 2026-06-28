import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../lib/utils.js";
import { Eyebrow } from "../ui/primitives.js";

export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setVisible(true);
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn("folio-reveal", visible && "folio-reveal--visible", className)}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  lead,
  align = "left",
}: {
  eyebrow: string;
  title: string;
  lead?: string;
  align?: "left" | "center";
}) {
  return (
    <div className={cn(align === "center" && "mx-auto max-w-2xl text-center")}>
      <Eyebrow className="folio-landing-eyebrow">{eyebrow}</Eyebrow>
      <h2 className="mt-3 font-display text-[clamp(1.75rem,4vw,2.25rem)] font-semibold leading-tight tracking-[-0.02em]">
        {title}
      </h2>
      {lead ? (
        <p className="mt-3 font-display text-[16px] italic leading-relaxed text-muted-foreground">
          {lead}
        </p>
      ) : null}
    </div>
  );
}

export function LogoStrip() {
  const labels = [
    "Stanford",
    "MIT",
    "Berkeley",
    "Michigan",
    "UCLA",
    "Georgia Tech",
    "Pre-med cohort",
    "Orgo study groups",
  ];
  return (
    <div className="folio-logo-strip" aria-hidden>
      <div className="folio-logo-strip-track">
        {[...labels, ...labels].map((label, i) => (
          <span key={`${label}-${i}`} className="folio-logo-strip-item">
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

export const TESTIMONIALS = [
  {
    quote:
      "I stopped copy-pasting into ChatGPT. Folio actually reads Clayden and tells me which page it's citing.",
    name: "Maya K.",
    role: "Pre-med · Organic Chemistry",
  },
  {
    quote:
      "The study map feels like a syllabus I can click into. Practice opens right next to the tutor thread.",
    name: "Jordan L.",
    role: "Engineering · Linear Algebra",
  },
  {
    quote:
      "Exam week is less chaotic — my journal shows what to review and the tutor picks up where I left off.",
    name: "Priya S.",
    role: "Biology major",
  },
];

export function TestimonialGrid() {
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {TESTIMONIALS.map((t, i) => (
        <Reveal key={t.name} delay={i * 80}>
          <blockquote className="folio-testimonial-card">
            <p className="font-display text-[16px] italic leading-relaxed">&ldquo;{t.quote}&rdquo;</p>
            <footer className="mt-4 border-t border-border pt-3">
              <p className="font-display text-[14px] font-semibold">{t.name}</p>
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {t.role}
              </p>
            </footer>
          </blockquote>
        </Reveal>
      ))}
    </div>
  );
}

export const PRODUCT_FEATURES = [
  {
    id: "journal",
    title: "Study journal",
    body: "A dashboard that reads like a morning edition — notebooks, tutor nudges, practice due, and study rhythm at a glance.",
    points: ["Notebook shelf with progress", "Tutor recommendations", "Weekly & monthly activity"],
  },
  {
    id: "tutor",
    title: "Grounded tutor",
    body: "Chat-first tutoring with visible agent activity. Every answer links to the page, slide, or PDF it came from.",
    points: ["Source citations inline", "Agent reasoning trace", "Follow-up practice decks"],
  },
  {
    id: "map",
    title: "Editorial study map",
    body: "Roman-numbered figure nodes — curriculum, concepts, objectives, checkpoints — on a canvas you can navigate.",
    points: ["8 node types", "Evidence drawer", "Surface tabs: read, practice, sim"],
  },
  {
    id: "sources",
    title: "Source ingestion",
    body: "Upload textbooks, lectures, and problem sets. Folio prepares them for tutoring and maps them into your graph.",
    points: ["PDF & slide ingestion", "Readiness tracking", "Per-notebook library"],
  },
  {
    id: "practice",
    title: "Practice surfaces",
    body: "Quizzes, flashcards, and worked examples open beside the tutor — opened by the agent when you're ready.",
    points: ["Adaptive quizzes", "Spaced flashcards", "Step-by-step reveals"],
  },
  {
    id: "templates",
    title: "Study templates",
    body: "Published curricula for common courses. Clone a template into your personal workspace in one click.",
    points: ["Undergrad sciences", "Guided learning paths", "Estimated time to complete"],
  },
];

export function FaqSection() {
  const faqs = [
    {
      q: "How is Folio different from ChatGPT?",
      a: "Folio tutors only from your uploaded sources and course graph. Answers include citations, and the tutor can open practice and reading surfaces in your workspace — not a blank chat box.",
    },
    {
      q: "What file types can I upload?",
      a: "PDFs, lecture slides, and text-based materials. Folio indexes them for retrieval and shows readiness per source before tutoring begins.",
    },
    {
      q: "Is there a mobile app?",
      a: "Folio is web-first during beta. The journal and tutor work on tablet-width screens; dedicated mobile apps are on the roadmap.",
    },
    {
      q: "How do tutor credits work?",
      a: "Credits meter AI tutor turns. Reading your materials, browsing the study map, and reviewing practice do not consume credits.",
    },
  ];

  return (
    <div className="folio-faq-list">
      {faqs.map((faq, i) => (
        <Reveal key={faq.q} delay={i * 60}>
          <details className="folio-faq-item">
            <summary className="folio-faq-question">{faq.q}</summary>
            <p className="folio-faq-answer">{faq.a}</p>
          </details>
        </Reveal>
      ))}
    </div>
  );
}

export function ComparisonTable() {
  const rows = [
    ["Answers cite your sources", true, false],
    ["Curriculum study map", true, false],
    ["Visible tutor reasoning", true, false],
    ["Practice beside chat", true, false],
    ["Notebook-scoped memory", true, false],
    ["Generic web knowledge", false, true],
  ] as const;

  return (
    <div className="folio-comparison-wrap">
      <table className="folio-comparison-table">
        <thead>
          <tr>
            <th scope="col" />
            <th scope="col">Folio</th>
            <th scope="col">Generic AI</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, folio, generic]) => (
            <tr key={label}>
              <td>{label}</td>
              <td data-yes={folio}>{folio ? "✓" : "—"}</td>
              <td data-yes={generic}>{generic ? "✓" : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HeroImage({
  alt,
  className,
}: {
  src?: string;
  alt: string;
  className?: string;
}) {
  // Asset-free, on-brand editorial product mock (study journal + map + tutor).
  return (
    <div className={cn("folio-hero-image-wrap", className)} role="img" aria-label={alt}>
      <div className="folio-hero-image-glow" aria-hidden />
      <svg viewBox="0 0 640 430" className="folio-hero-image" xmlns="http://www.w3.org/2000/svg">
        <rect width="640" height="430" fill="var(--elevated)" />
        {/* window chrome */}
        <rect width="640" height="34" fill="var(--surface)" />
        <circle cx="20" cy="17" r="4.5" fill="#e8836b" />
        <circle cx="36" cy="17" r="4.5" fill="#d4a84b" />
        <circle cx="52" cy="17" r="4.5" fill="#5cb87a" />
        <rect x="78" y="11" width="150" height="12" rx="6" fill="var(--muted)" />
        {/* sidebar */}
        <rect x="0" y="34" width="150" height="396" fill="color-mix(in oklab, var(--surface) 60%, var(--elevated))" />
        <rect x="18" y="58" width="92" height="10" rx="5" fill="var(--primary)" opacity="0.85" />
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x="18" y={92 + i * 30} width={i === 1 ? 104 : 84} height="9" rx="4.5" fill="var(--muted-foreground)" opacity={i === 1 ? 0.55 : 0.28} />
        ))}
        <rect x="18" y="372" width="114" height="40" rx="8" fill="var(--card)" stroke="var(--border)" />
        <circle cx="40" cy="392" r="11" fill="var(--accent)" />
        <rect x="58" y="385" width="56" height="7" rx="3.5" fill="var(--muted-foreground)" opacity="0.5" />
        <rect x="58" y="397" width="40" height="6" rx="3" fill="var(--muted-foreground)" opacity="0.3" />
        {/* masthead rule */}
        <text x="180" y="74" fontFamily="var(--font-mono)" fontSize="9" letterSpacing="2" fill="#c49a2a">THE STUDY JOURNAL</text>
        <line x1="180" y1="86" x2="600" y2="86" stroke="color-mix(in oklab, #c49a2a 45%, var(--border))" strokeWidth="1" />
        {/* headline (serif) */}
        <text x="180" y="128" fontFamily="var(--font-display)" fontSize="30" fontWeight="600" fill="var(--foreground)">Organic Chemistry I</text>
        <rect x="180" y="146" width="300" height="9" rx="4.5" fill="var(--muted-foreground)" opacity="0.4" />
        <rect x="180" y="164" width="240" height="9" rx="4.5" fill="var(--muted-foreground)" opacity="0.28" />
        {/* study map node cluster */}
        <g transform="translate(180,210)">
          <line x1="40" y1="40" x2="150" y2="20" stroke="var(--accent)" strokeWidth="2" opacity="0.5" />
          <line x1="40" y1="40" x2="140" y2="110" stroke="var(--accent)" strokeWidth="2" opacity="0.5" />
          <line x1="150" y1="20" x2="270" y2="60" stroke="var(--accent)" strokeWidth="2" opacity="0.4" />
          <line x1="140" y1="110" x2="270" y2="60" stroke="var(--accent)" strokeWidth="2" opacity="0.4" />
          <circle cx="40" cy="40" r="20" fill="var(--primary)" />
          <circle cx="150" cy="20" r="15" fill="var(--accent)" />
          <circle cx="140" cy="110" r="15" fill="#c49a2a" />
          <circle cx="270" cy="60" r="17" fill="var(--accent)" opacity="0.85" />
        </g>
        {/* tutor card */}
        <rect x="470" y="120" width="150" height="250" rx="12" fill="var(--card)" stroke="var(--border)" />
        <rect x="486" y="138" width="70" height="8" rx="4" fill="var(--accent)" />
        {[0, 1, 2].map((i) => (
          <rect key={i} x="486" y={162 + i * 22} width={i === 2 ? 80 : 118} height="8" rx="4" fill="var(--muted-foreground)" opacity="0.3" />
        ))}
        <rect x="486" y="246" width="118" height="46" rx="8" fill="color-mix(in oklab, var(--accent) 10%, var(--elevated))" stroke="color-mix(in oklab, var(--accent) 30%, var(--border))" />
        <rect x="496" y="258" width="70" height="7" rx="3.5" fill="var(--accent)" opacity="0.7" />
        <rect x="496" y="272" width="98" height="6" rx="3" fill="var(--accent)" opacity="0.4" />
        <rect x="486" y="338" width="118" height="20" rx="10" fill="var(--primary)" />
      </svg>
    </div>
  );
}
