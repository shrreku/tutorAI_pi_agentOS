import { useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { devLogin, isLocalhost, useSession } from "../../routing/RouteGuards.js";
import { recordPublicAnalyticsEvent } from "../../routing/api.js";
import { Button, Field, Input } from "../../ui/primitives.js";
import { Logo, Wordmark, Grain } from "../../ui/brand.js";
import { Reveal, motion } from "../../ui/motion.js";

/* ============================================================================
   Login — a centered Folio auth card on a soft editorial background.
   Preserves the legacy auth mechanism exactly: dev-login on localhost,
   WorkOS OAuth redirect otherwise (with the same analytics event).
   ============================================================================ */

const HIGHLIGHTS = [
  {
    icon: ShieldCheck,
    t: "Grounded in your sources",
    d: "Every answer cites the page it came from.",
  },
  { icon: BookOpen, t: "Your living Study Map", d: "A curriculum graph that grows as you learn." },
  { icon: Sparkles, t: "Interactive surfaces", d: "Worked examples and quizzes, on demand." },
] as const;

export function LoginPage({ navigate }: { navigate: (path: string) => void }) {
  const { refresh } = useSession();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const localhost = isLocalhost();

  const handleDevLogin = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await devLogin(email.trim());
      await refresh();
      navigate("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-dvh overflow-hidden bg-background text-foreground">
      <Grain opacity={0.5} />
      {/* soft accent glow */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[460px] w-[860px] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-12rem] right-[-6rem] h-[420px] w-[420px] rounded-full bg-gold/10 blur-3xl" />

      {/* top bar */}
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <button onClick={() => navigate("/")} aria-label="TutorBook home">
          <Wordmark />
        </button>
        <button
          onClick={() => navigate("/")}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to home
        </button>
      </header>

      <main className="relative z-10 mx-auto grid min-h-[calc(100dvh-5rem)] max-w-6xl items-center gap-12 px-5 pb-16 lg:grid-cols-[1fr_1fr]">
        {/* ---------- editorial column ---------- */}
        <Reveal className="hidden lg:block">
          <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
            Welcome back
          </div>
          <h1 className="mt-3 max-w-md font-display text-[clamp(32px,4vw,48px)] font-semibold leading-[1.05] tracking-[-0.02em]">
            Pick up where your <span className="text-gold">sources</span> left off.
          </h1>
          <p className="mt-4 max-w-md text-[16px] leading-relaxed text-muted-foreground">
            Sign in to your notebooks, Study Map, and the tutor that actually read your material.
          </p>

          <ul className="mt-9 space-y-5">
            {HIGHLIGHTS.map((h, i) => {
              const Icon = h.icon;
              return (
                <motion.li
                  key={h.t}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.15 + i * 0.1 }}
                  className="flex items-start gap-3.5"
                >
                  <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/12 text-accent">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="font-display text-[16px] font-semibold">{h.t}</div>
                    <div className="text-[14px] text-muted-foreground">{h.d}</div>
                  </div>
                </motion.li>
              );
            })}
          </ul>
        </Reveal>

        {/* ---------- auth card ---------- */}
        <Reveal y={24} className="mx-auto w-full max-w-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 0.61, 0.36, 1] }}
            className="relative overflow-hidden rounded-3xl border border-border bg-card p-7 shadow-pop sm:p-9"
          >
            <Grain opacity={0.3} />

            <div className="relative">
              <div className="flex justify-center">
                <Logo size={44} />
              </div>
              <h2 className="mt-5 text-center font-display text-[26px] font-semibold tracking-[-0.01em]">
                Sign in to TutorBook
              </h2>
              <p className="mt-1.5 text-center text-[14px] text-muted-foreground">
                Access study templates, your workspaces, and the tutor experience.
              </p>

              {localhost ? (
                <form
                  className="mt-7 space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleDevLogin();
                  }}
                >
                  <Field label="Dev email">
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="you@example.com"
                        autoComplete="email"
                        required
                        className="pl-9"
                      />
                    </div>
                  </Field>
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    className="w-full"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      "Signing in…"
                    ) : (
                      <>
                        Continue <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </form>
              ) : (
                <div className="mt-7 space-y-4">
                  <a
                    className="inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-lg bg-primary px-6 text-[15px] font-medium text-primary-foreground shadow-soft transition-[opacity,transform] hover:opacity-90 active:translate-y-px"
                    href="/api/v1/auth/workos/login"
                    onClick={() =>
                      recordPublicAnalyticsEvent("login_redirect", { provider: "workos" })
                    }
                  >
                    <ShieldCheck className="h-4.5 w-4.5" />
                    Sign in with WorkOS
                  </a>

                  <div className="flex items-center gap-3 py-1">
                    <span className="h-px flex-1 bg-border" />
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Secure single sign-on
                    </span>
                    <span className="h-px flex-1 bg-border" />
                  </div>

                  <p className="text-center text-[13px] leading-relaxed text-muted-foreground">
                    Use your organization or social account. We never see your password — sign-in is
                    handled by WorkOS.
                  </p>
                </div>
              )}

              {error && (
                <div className="mt-5 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-[13px] text-destructive">
                  {error}
                </div>
              )}

              <p className="mt-7 text-center text-[12px] leading-relaxed text-muted-foreground">
                By continuing you agree to our{" "}
                <button
                  onClick={() => navigate("/terms")}
                  className="font-medium text-accent underline-offset-2 hover:underline"
                >
                  Terms
                </button>{" "}
                and{" "}
                <button
                  onClick={() => navigate("/privacy")}
                  className="font-medium text-accent underline-offset-2 hover:underline"
                >
                  Privacy Policy
                </button>
                .
              </p>
            </div>
          </motion.div>

          <p className="mt-6 text-center text-[14px] text-muted-foreground">
            New to TutorBook?{" "}
            <button
              onClick={() => navigate("/")}
              className="font-medium text-foreground underline-offset-4 hover:text-accent hover:underline"
            >
              Explore the product
            </button>
          </p>
        </Reveal>
      </main>
    </div>
  );
}
