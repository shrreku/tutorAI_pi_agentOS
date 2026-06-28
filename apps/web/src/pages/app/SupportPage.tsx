import { useMemo, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  CreditCard,
  LifeBuoy,
  Mail,
  MessageCircle,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import { api } from "../../routing/api.js";
import { LearningFeedbackForm } from "./LearningFeedbackForm.js";
import { Badge, Button, Eyebrow, Field, Input, Textarea } from "../../ui/primitives.js";
import { Reveal, Stagger, StaggerItem, Lift } from "../../ui/motion.js";
import { HeroArt } from "../../ui/brand.js";
import { cn } from "../../ui/cn.js";

const SUPPORT_CATEGORIES = [
  { value: "wrong_tutor_answer", label: "Wrong or confusing tutor answer" },
  { value: "ingestion_problem", label: "Upload or ingestion problem" },
  { value: "credit_access", label: "Credits or access problem" },
  { value: "privacy_delete", label: "Privacy or delete request" },
  { value: "bug_ux", label: "Bug or UX issue" },
  { value: "learning_feedback", label: "General learning feedback" },
] as const;

const HELP_CATEGORIES = [
  {
    icon: BookOpen,
    title: "Getting started",
    body: "Create your first notebook, add sources, and meet the tutor that learns your material.",
    tone: "accent" as const,
  },
  {
    icon: Upload,
    title: "Uploads & ingestion",
    body: "Supported file types, page limits, and what to do when a source won't index.",
    tone: "primary" as const,
  },
  {
    icon: CreditCard,
    title: "Credits & billing",
    body: "How tutor credits work, top-up packs, and managing your plan.",
    tone: "gold" as const,
  },
  {
    icon: ShieldCheck,
    title: "Privacy & data",
    body: "Where your data lives, exporting your notebooks, and deletion requests.",
    tone: "accent" as const,
  },
];

const FAQS = [
  {
    q: "How does the tutor know my material?",
    a: "Every source you add is indexed page by page. When you ask a question, the tutor pulls the exact passages from your own documents and answers with citations you can open and verify.",
  },
  {
    q: "What file types can I upload?",
    a: "PDFs, slide decks, and plain notes work best. If a source fails to index, it's usually a scanned image without selectable text — re-export it with text layers and try again.",
  },
  {
    q: "How are tutor credits used?",
    a: "Credits are consumed as you converse with the tutor and generate study material. You can track your remaining balance and buy top-up packs from the Credits page.",
  },
  {
    q: "Can I delete my data?",
    a: "Yes. You can request deletion of your account and all notebooks from your account settings, or send us a privacy request below and we'll process it.",
  },
  {
    q: "Is TutorBook still in beta?",
    a: "Yes — you're an early user, which is why your feedback matters. Reports submitted here go straight to our admin console and shape what we build next.",
  },
];

function supportContextJson(): Record<string, unknown> {
  const notebookMatch = window.location.pathname.match(/^\/notebooks\/([^/]+)/);
  return {
    path: window.location.pathname,
    notebookId: notebookMatch?.[1] ?? null,
    browser: navigator.userAgent,
  };
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group flex w-full items-center justify-between gap-4 py-4 text-left"
      >
        <span className="font-display text-[16px] font-medium text-foreground group-hover:text-accent">
          {q}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180 text-accent",
          )}
        />
      </button>
      <div
        className={cn(
          "grid transition-all duration-300 ease-out",
          open ? "grid-rows-[1fr] pb-4 opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <p className="max-w-2xl text-[14px] leading-relaxed text-muted-foreground">{a}</p>
        </div>
      </div>
    </div>
  );
}

export function SupportPage() {
  const [category, setCategory] = useState<string>(SUPPORT_CATEGORIES[0]!.value);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredFaqs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FAQS;
    return FAQS.filter((f) => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q));
  }, [query]);

  const submitSupportReport = async () => {
    if (!message.trim()) {
      setError("Please describe the issue.");
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      const res = await api("/feedback/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          message: message.trim(),
          contextJson: supportContextJson(),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? "Failed to submit support report");
      }
      setMessage("");
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit support report");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <Reveal>
        <div className="flex items-start justify-between gap-4">
          <div>
            <Badge tone="accent">
              <LifeBuoy className="h-3 w-3" /> Help center
            </Badge>
            <h1 className="mt-3 font-display text-[clamp(26px,4vw,34px)] font-semibold">
              Help &amp; support
            </h1>
            <p className="mt-1.5 max-w-xl text-[15px] text-muted-foreground">
              Find answers, share learning feedback, or report a beta issue — we read every message.
            </p>
          </div>
        </div>
      </Reveal>

      {/* Search hero */}
      <Reveal delay={0.05}>
        <div className="relative mt-6 overflow-hidden rounded-xl border border-border bg-card p-6 shadow-soft sm:p-8">
          <HeroArt className="pointer-events-none absolute -right-8 -top-6 h-44 w-44 opacity-40" />
          <div className="relative max-w-xl">
            <Eyebrow>Search the help center</Eyebrow>
            <h2 className="mt-2 font-display text-[22px] font-semibold leading-snug">
              What can we help you with?
            </h2>
            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search frequently asked questions…"
                className="pl-9"
                aria-label="Search frequently asked questions"
              />
            </div>
          </div>
        </div>
      </Reveal>

      {/* Help categories */}
      <div className="mt-9">
        <div className="mb-3 flex items-baseline justify-between border-b border-border pb-2">
          <Eyebrow>Browse by topic</Eyebrow>
        </div>
        <Stagger className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {HELP_CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const iconCls =
              cat.tone === "gold"
                ? "bg-gold/14 text-gold"
                : cat.tone === "primary"
                  ? "bg-primary/10 text-primary"
                  : "bg-accent/12 text-accent";
            return (
              <StaggerItem key={cat.title}>
                <Lift>
                  <div className="flex h-full flex-col rounded-xl border border-border bg-card p-5 shadow-soft">
                    <span className={cn("grid h-10 w-10 place-items-center rounded-lg", iconCls)}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-3 font-display text-[17px] font-semibold leading-snug">
                      {cat.title}
                    </h3>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">
                      {cat.body}
                    </p>
                  </div>
                </Lift>
              </StaggerItem>
            );
          })}
        </Stagger>
      </div>

      <div className="mt-9 grid grid-cols-1 gap-x-10 gap-y-9 lg:grid-cols-[1.5fr_1fr]">
        {/* FAQ + forms */}
        <div className="space-y-9">
          {/* FAQ */}
          <Reveal>
            <div>
              <div className="mb-1 flex items-baseline justify-between border-b border-border pb-2">
                <Eyebrow>Frequently asked</Eyebrow>
              </div>
              {filteredFaqs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-card/60 p-8 text-center">
                  <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-accent/12 text-accent">
                    <Search className="h-5 w-5" />
                  </span>
                  <p className="mt-3 font-display text-[16px] font-semibold">No matches found</p>
                  <p className="mx-auto mt-1 max-w-xs text-[13px] text-muted-foreground">
                    Try a different term, or send us a report below — we&apos;re happy to help
                    directly.
                  </p>
                </div>
              ) : (
                <div>
                  {filteredFaqs.map((f) => (
                    <FaqItem key={f.q} q={f.q} a={f.a} />
                  ))}
                </div>
              )}
            </div>
          </Reveal>

          {/* Learning feedback (preserved legacy component) */}
          <Reveal>
            <div>
              <div className="mb-3 flex items-baseline justify-between border-b border-border pb-2">
                <Eyebrow>Learning feedback</Eyebrow>
              </div>
              <LearningFeedbackForm />
            </div>
          </Reveal>

          {/* Support report */}
          <Reveal>
            <div>
              <div className="mb-3 flex items-baseline justify-between border-b border-border pb-2">
                <Eyebrow>Report an issue</Eyebrow>
              </div>
              <div className="rounded-xl border border-border bg-card p-6 shadow-soft">
                <div className="flex items-center gap-2">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                    <MessageCircle className="h-4 w-4" />
                  </span>
                  <h3 className="font-display text-[18px] font-semibold">Support report</h3>
                </div>

                {success ? (
                  <div className="mt-5 rounded-lg border border-success/30 bg-success/10 p-4">
                    <p className="flex items-center gap-2 text-[14px] font-medium text-success">
                      <Sparkles className="h-4 w-4" /> Support report submitted
                    </p>
                    <p className="mt-1 text-[13px] text-muted-foreground">
                      Thank you — we&apos;ll review it in the admin console.
                    </p>
                  </div>
                ) : (
                  <div className="mt-5 space-y-4">
                    <Field label="Category">
                      <select
                        value={category}
                        onChange={(event) => setCategory(event.target.value)}
                        className="h-10 w-full rounded-lg border border-input bg-elevated px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-accent/30"
                      >
                        {SUPPORT_CATEGORIES.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="What happened?">
                      <Textarea
                        value={message}
                        onChange={(event) => setMessage(event.target.value)}
                        rows={5}
                        placeholder="Describe what you were doing and what went wrong…"
                      />
                    </Field>

                    {error && (
                      <p className="rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
                        {error}
                      </p>
                    )}

                    <div className="flex justify-end">
                      <Button
                        variant="primary"
                        disabled={isSubmitting}
                        onClick={() => void submitSupportReport()}
                      >
                        <Send className="h-4 w-4" />
                        {isSubmitting ? "Submitting…" : "Submit support report"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Reveal>
        </div>

        {/* Contact sidebar */}
        <div className="space-y-7">
          <Reveal delay={0.05}>
            <div className="rounded-xl border border-border border-l-[3px] border-l-accent bg-card p-5 shadow-soft">
              <Eyebrow>Still need a hand?</Eyebrow>
              <p className="mt-2 font-display text-[14.5px] italic leading-relaxed text-foreground/85">
                We&apos;re a small team building TutorBook with our early users. Reach out and a
                real person will get back to you.
              </p>
              <a
                href="mailto:support@tutorbook.app"
                className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-surface/70 p-3 transition-colors hover:border-accent/40"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent/12 text-accent">
                  <Mail className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-foreground">
                    Email support
                  </span>
                  <span className="block truncate text-[12px] text-muted-foreground">
                    support@tutorbook.app
                  </span>
                </span>
              </a>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
              <Eyebrow>Response times</Eyebrow>
              <ul className="mt-3 space-y-3 text-[13px]">
                <li className="flex items-start gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  <span className="text-muted-foreground">
                    <span className="font-medium text-foreground">Bugs &amp; access:</span> usually
                    within one business day.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                  <span className="text-muted-foreground">
                    <span className="font-medium text-foreground">Privacy requests:</span> processed
                    promptly per our policy.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <span className="text-muted-foreground">
                    <span className="font-medium text-foreground">Feedback:</span> reviewed weekly
                    to shape the roadmap.
                  </span>
                </li>
              </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </div>
  );
}
