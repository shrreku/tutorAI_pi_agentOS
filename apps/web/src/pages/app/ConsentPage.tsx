import { useState } from "react";
import { ArrowRight, FileText, ScrollText, ShieldCheck } from "lucide-react";
import { submitConsent, useSession } from "../../routing/RouteGuards.js";
import { Badge, Button, Eyebrow, Panel } from "../../ui/primitives.js";
import { Reveal } from "../../ui/motion.js";
import { Grain } from "../../ui/brand.js";

const SUMMARY = [
  {
    icon: ShieldCheck,
    title: "Experimental beta",
    body: "TutorBook is experimental beta software and AI tutoring may be inaccurate. Don't use it for high-stakes educational decisions.",
  },
  {
    icon: ScrollText,
    title: "What we collect",
    body: "We collect identified product analytics and may record privacy-masked workspace replays to understand onboarding and usability. Your feedback may be used to improve the product.",
  },
  {
    icon: FileText,
    title: "Your sources",
    body: "Uploaded sources remain private to your workspace, but authentication, storage, parsing, and model providers process them on our behalf.",
  },
] as const;

export function ConsentPage({ navigate }: { navigate: (path: string) => void }) {
  const { refresh } = useSession();
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!accepted) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await submitConsent();
      await refresh();
      navigate("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save consent");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Reveal>
        <header className="text-center">
          <div className="flex justify-center">
            <Badge tone="gold">
              <ShieldCheck className="h-3 w-3" /> Beta consent
            </Badge>
          </div>
          <h1 className="mt-4 font-display text-[clamp(26px,4vw,34px)] font-semibold">
            Before you begin
          </h1>
          <p className="mx-auto mt-2 max-w-md text-[14px] text-muted-foreground">
            A quick note on how TutorBook works and how we handle your data. Read it through, then
            accept to continue.
          </p>
        </header>
      </Reveal>

      <Reveal delay={0.08}>
        <Panel className="relative mt-7 overflow-hidden p-6 sm:p-8 shadow-pop">
          <Grain opacity={0.35} />
          <div className="relative">
            <Eyebrow>Summary</Eyebrow>
            <ul className="mt-4 space-y-5">
              {SUMMARY.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.title} className="flex gap-4">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/12 text-accent">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="font-display text-[16px] font-semibold leading-snug">
                        {item.title}
                      </h2>
                      <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">
                        {item.body}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>

            <p className="mt-6 border-t border-border pt-5 text-[13.5px] leading-relaxed text-foreground/80">
              Read our{" "}
              <button
                type="button"
                onClick={() => navigate("/privacy")}
                className="font-medium text-accent underline-offset-4 hover:underline"
              >
                Privacy Policy
              </button>{" "}
              and{" "}
              <button
                type="button"
                onClick={() => navigate("/terms")}
                className="font-medium text-accent underline-offset-4 hover:underline"
              >
                Terms of Service
              </button>
              .
            </p>

            <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface/60 p-4 transition-colors hover:border-accent/40">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(event) => setAccepted(event.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)]"
              />
              <span className="text-[14px] leading-relaxed text-foreground">
                I understand and agree to participate in the TutorBook beta.
              </span>
            </label>

            {error && (
              <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
                {error}
              </p>
            )}

            <div className="mt-6 flex justify-end">
              <Button
                variant="primary"
                size="lg"
                disabled={!accepted || isSubmitting}
                onClick={() => void handleSubmit()}
              >
                {isSubmitting ? (
                  "Saving…"
                ) : (
                  <>
                    Accept &amp; continue <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </Panel>
      </Reveal>
    </div>
  );
}
