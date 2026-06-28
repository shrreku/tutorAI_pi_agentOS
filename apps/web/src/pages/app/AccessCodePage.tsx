import { useState } from "react";
import { CheckCircle2, KeyRound, Sparkles, Ticket } from "lucide-react";
import { api } from "../../routing/api.js";
import { Badge, Button, Eyebrow, Field, Input } from "../../ui/primitives.js";
import { Reveal, motion } from "../../ui/motion.js";
import { HeroArt } from "../../ui/brand.js";

export function AccessCodePage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRedeem = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      setError("Enter an access code.");
      return;
    }

    setError(null);
    setSuccess(null);
    setIsSubmitting(true);
    try {
      const res = await api("/access-codes/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      const body = (await res.json()) as { message?: string; grants?: Record<string, unknown> };
      if (!res.ok) {
        throw new Error(body.message ?? "Failed to redeem access code");
      }

      const grants = body.grants ?? {};
      const parts: string[] = [];
      if (grants.studyAccess) parts.push("study access");
      if (grants.ingestionAccess) parts.push("ingestion access");
      if (typeof grants.tutorCreditsCents === "number" && grants.tutorCreditsCents > 0) {
        parts.push(`${grants.tutorCreditsCents} tutor credits`);
      }
      if (typeof grants.ingestionCreditsCents === "number" && grants.ingestionCreditsCents > 0) {
        parts.push(`${grants.ingestionCreditsCents} ingestion credits`);
      }
      if (Array.isArray(grants.pilotTags) && grants.pilotTags.length > 0) {
        parts.push(`pilot tags: ${grants.pilotTags.join(", ")}`);
      }

      setSuccess(parts.length > 0 ? `Redeemed: ${parts.join(", ")}.` : "Access code redeemed.");
      setCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to redeem access code");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <Reveal>
        <div className="border-b border-border pb-5">
          <Eyebrow>Membership</Eyebrow>
          <h1 className="mt-2 font-display text-[clamp(26px,4vw,34px)] font-semibold leading-[1.05]">
            Redeem an access code
          </h1>
          <p className="mt-2 max-w-xl text-[15px] text-muted-foreground">
            Unlock additional study privileges, credits, or pilot access with a code from your
            program.
          </p>
        </div>
      </Reveal>

      <div className="mx-auto mt-8 max-w-lg">
        <Reveal delay={0.05}>
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-soft">
            <div className="relative border-b border-border bg-surface/60 px-7 py-6">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gold/14 text-gold">
                <Ticket className="h-5 w-5" />
              </span>
              <h2 className="mt-3 font-display text-[20px] font-semibold">Enter your code</h2>
              <p className="mt-1 text-[13.5px] text-muted-foreground">
                Codes are case-insensitive and look like{" "}
                <span className="font-mono text-foreground/80">TB-XXXXXXXXXX</span>.
              </p>
            </div>

            <div className="px-7 py-6">
              <Field label="Access code">
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={code}
                    onChange={(event) => {
                      setCode(event.target.value);
                      if (error) setError(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !isSubmitting) {
                        event.preventDefault();
                        void handleRedeem();
                      }
                    }}
                    placeholder="TB-XXXXXXXXXX"
                    autoComplete="off"
                    spellCheck={false}
                    className="pl-9 font-mono tracking-wide"
                    aria-label="Access code"
                  />
                </div>
              </Field>

              {success && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="mt-4 flex items-start gap-2.5 rounded-lg border border-primary/30 bg-primary/8 px-3.5 py-3"
                  role="status"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p className="text-[13.5px] leading-relaxed text-foreground">{success}</p>
                </motion.div>
              )}

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-[13.5px] text-destructive"
                  role="alert"
                >
                  {error}
                </motion.div>
              )}

              <Button
                className="mt-5 w-full"
                variant="primary"
                size="lg"
                disabled={isSubmitting}
                onClick={() => void handleRedeem()}
              >
                {isSubmitting ? (
                  "Redeeming…"
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> Redeem code
                  </>
                )}
              </Button>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="mt-6 flex items-center gap-3 rounded-xl border border-dashed border-border bg-card/50 px-5 py-4">
            <HeroArt className="hidden h-12 w-12 shrink-0 sm:block" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Badge tone="gold">Pilot</Badge>
                <span className="text-[13px] font-medium text-foreground">No code yet?</span>
              </div>
              <p className="mt-1 text-[12.5px] text-muted-foreground">
                Access codes are issued by your institution or pilot program. Reach out to your
                coordinator if you need one.
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
