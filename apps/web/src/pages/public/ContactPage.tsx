import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  Check,
  Clock,
  GraduationCap,
  LifeBuoy,
  Mail,
  Menu,
  MessageSquare,
  Send,
} from "lucide-react";
import { Badge, Button, Field, Input, Textarea } from "../../ui/primitives.js";
import { Logo, Wordmark, Grain } from "../../ui/brand.js";
import { Reveal, Stagger, StaggerItem, Lift, motion } from "../../ui/motion.js";
import { cn } from "../../ui/cn.js";

/* ============================================================================
   Contact — "Folio" editorial full page: sticky nav, split hero with a
   polished contact form on the left and contact details on the right, a
   support-channels band, a short FAQ, and the shared footer.
   ============================================================================ */

const NAV = [
  ["Home", "/"],
  ["Demo", "/demo"],
  ["Pricing", "/#pricing"],
] as const;

const TOPICS = [
  "General question",
  "Sales & teams",
  "Technical support",
  "Press & partnerships",
] as const;

const CHANNELS = [
  {
    icon: Mail,
    t: "Email us",
    d: "We read every message and reply within one business day.",
    cta: "hello@tutorbook.me",
    href: "mailto:hello@tutorbook.me",
  },
  {
    icon: LifeBuoy,
    t: "Help center",
    d: "Guides, troubleshooting, and answers to common setup questions.",
    cta: "Browse the docs",
    href: "/#features",
  },
  {
    icon: MessageSquare,
    t: "Sales & cohorts",
    d: "Bringing TutorBook to a class or school? Let's design the rollout.",
    cta: "sales@tutorbook.me",
    href: "mailto:sales@tutorbook.me",
  },
] as const;

const DETAILS = [
  { icon: Mail, label: "Email", value: "hello@tutorbook.me" },
  { icon: Clock, label: "Response time", value: "Within 1 business day" },
  { icon: LifeBuoy, label: "Support hours", value: "Mon–Fri, 9am–6pm" },
] as const;

const FAQS = [
  [
    "How fast will I hear back?",
    "Most messages get a reply within one business day. Sales and cohort enquiries are usually faster.",
  ],
  [
    "Can I book a walkthrough?",
    "Yes — mention it in your message and we'll send a few times for a live demo of your own sources.",
  ],
  [
    "Do you offer student discounts?",
    "We do. Reach out with your student email and we'll get you set up on the right plan.",
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
            <button
              key={href}
              onClick={() => navigate(href)}
              className="text-[14px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {label}
            </button>
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

export function ContactPage({ navigate }: { navigate: (path: string) => void }) {
  const [topic, setTopic] = useState<(typeof TOPICS)[number]>(TOPICS[0]);
  const [sent, setSent] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSent(true);
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <Nav navigate={navigate} />

      {/* ---------- Hero + form ---------- */}
      <section className="relative overflow-hidden">
        <Grain opacity={0.5} />
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" />
        <div className="mx-auto grid max-w-6xl items-start gap-10 px-5 pb-16 pt-14 lg:grid-cols-[1fr_1.05fr] lg:pb-24 lg:pt-20">
          {/* left: intro + details */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[12px] font-medium text-muted-foreground shadow-soft"
            >
              <Badge tone="accent">Contact</Badge> We'd love to hear from you
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.05, ease: [0.22, 0.61, 0.36, 1] }}
              className="mt-5 font-display text-[clamp(36px,5.4vw,60px)] font-semibold leading-[1.04] tracking-[-0.02em]"
            >
              Let's talk about how you <span className="text-gradient">study.</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.12 }}
              className="mt-5 max-w-md text-[17px] leading-relaxed text-muted-foreground"
            >
              Questions about the beta, bringing TutorBook to a cohort, or just curious how grounded
              tutoring works? Send a note — a real person reads every one.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.18 }}
              className="mt-8 space-y-3"
            >
              {DETAILS.map((d) => {
                const Icon = d.icon;
                return (
                  <div
                    key={d.label}
                    className="flex items-center gap-3.5 rounded-xl border border-border bg-card p-3.5 shadow-soft"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent/12 text-accent">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {d.label}
                      </div>
                      <div className="font-display text-[15px] font-semibold">{d.value}</div>
                    </div>
                  </div>
                );
              })}
            </motion.div>
          </div>

          {/* right: form card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 0.61, 0.36, 1] }}
            className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-pop sm:p-8"
          >
            <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gold/10 blur-2xl" />
            {sent ? (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="relative flex flex-col items-center py-10 text-center"
              >
                <span className="grid h-14 w-14 place-items-center rounded-full bg-accent/12 text-accent">
                  <Check className="h-7 w-7" />
                </span>
                <h2 className="mt-5 font-display text-[24px] font-semibold">Message sent</h2>
                <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
                  Thanks for reaching out. We'll get back to you within one business day at the
                  email you provided.
                </p>
                <Button variant="outline" className="mt-6" onClick={() => setSent(false)}>
                  Send another message
                </Button>
              </motion.div>
            ) : (
              <form onSubmit={onSubmit} className="relative space-y-5">
                <div>
                  <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
                    Send a message
                  </div>
                  <h2 className="mt-1.5 font-display text-[22px] font-semibold">
                    Tell us what you need.
                  </h2>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Name">
                    <Input name="name" placeholder="Ada Lovelace" autoComplete="name" required />
                  </Field>
                  <Field label="Email">
                    <Input
                      name="email"
                      type="email"
                      placeholder="you@school.edu"
                      autoComplete="email"
                      required
                    />
                  </Field>
                </div>

                <div>
                  <span className="mb-2 block text-[13px] font-medium text-foreground">Topic</span>
                  <div className="flex flex-wrap gap-2">
                    {TOPICS.map((t) => {
                      const active = t === topic;
                      return (
                        <button
                          type="button"
                          key={t}
                          onClick={() => setTopic(t)}
                          aria-pressed={active}
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
                            active
                              ? "border-accent bg-accent/12 text-accent"
                              : "border-border bg-transparent text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <Field label="Message" hint="The more detail, the better we can help.">
                  <Textarea
                    name="message"
                    rows={5}
                    placeholder="Tell us a little about what you're working on…"
                    required
                  />
                </Field>

                <Button type="submit" size="lg" variant="primary" className="w-full">
                  Send message <Send className="h-4 w-4" />
                </Button>
                <p className="text-center text-[12px] text-muted-foreground">
                  By sending, you agree to our{" "}
                  <button
                    type="button"
                    onClick={() => navigate("/privacy")}
                    className="text-accent underline-offset-2 hover:underline"
                  >
                    privacy policy
                  </button>
                  .
                </p>
              </form>
            )}
          </motion.div>
        </div>
      </section>

      {/* ---------- Channels ---------- */}
      <section className="border-y border-border bg-surface/40">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <Reveal>
            <div className="max-w-2xl">
              <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
                Other ways to reach us
              </div>
              <h2 className="mt-2 font-display text-[clamp(26px,4vw,38px)] font-semibold leading-tight">
                Pick the channel that fits.
              </h2>
            </div>
          </Reveal>
          <Stagger className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CHANNELS.map((c) => {
              const Icon = c.icon;
              const isLink = c.href.startsWith("/");
              return (
                <StaggerItem key={c.t}>
                  <Lift className="flex h-full flex-col rounded-xl border border-border bg-card p-5 shadow-soft">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent/12 text-accent">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-4 font-display text-[18px] font-semibold">{c.t}</h3>
                    <p className="mt-1.5 flex-1 text-[14px] leading-relaxed text-muted-foreground">
                      {c.d}
                    </p>
                    {isLink ? (
                      <button
                        onClick={() => navigate(c.href)}
                        className="mt-4 inline-flex items-center gap-1.5 self-start text-[14px] font-medium text-accent hover:underline"
                      >
                        {c.cta} <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <a
                        href={c.href}
                        className="mt-4 inline-flex items-center gap-1.5 self-start text-[14px] font-medium text-accent hover:underline"
                      >
                        {c.cta} <ArrowRight className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </Lift>
                </StaggerItem>
              );
            })}
          </Stagger>
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section className="mx-auto max-w-3xl px-5 py-20">
        <Reveal>
          <h2 className="text-center font-display text-[clamp(26px,4vw,36px)] font-semibold">
            Before you write.
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
                    className={cn("ml-auto text-accent transition-transform", open && "rotate-45")}
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
                  <p className="px-5 pb-4 text-[14px] leading-relaxed text-muted-foreground">{a}</p>
                </motion.div>
              </div>
            );
          })}
        </div>
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
                  ["Features", "/#features"],
                  ["Pricing", "/#pricing"],
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
                    <button
                      onClick={() => navigate(h)}
                      className="cursor-pointer text-[14px] text-foreground/80 hover:text-accent"
                    >
                      {l}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-center gap-2 border-t border-border py-5 text-center text-[13px] text-muted-foreground">
          <GraduationCap className="h-4 w-4" />© {new Date().getFullYear()} TutorBook. All rights
          reserved.
        </div>
      </footer>
    </div>
  );
}
