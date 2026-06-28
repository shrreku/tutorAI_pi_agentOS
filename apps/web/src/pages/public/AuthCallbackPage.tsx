import { useEffect } from "react";
import { useSession } from "../../routing/RouteGuards.js";
import { Logo, Grain } from "../../ui/brand.js";
import { motion, useReducedMotion } from "../../ui/motion.js";

/* ============================================================================
   Auth callback — completes the session handoff, then redirects into the app.
   Folio loading surface: editorial ivory full page, branded mark, soft halo,
   and a calm "signing you in" state. Callback logic is preserved verbatim.
   ============================================================================ */

export function AuthCallbackPage({ navigate }: { navigate: (path: string) => void }) {
  const { refresh } = useSession();
  const reduce = useReducedMotion();

  useEffect(() => {
    void (async () => {
      await refresh();
      navigate("/app");
    })();
  }, [navigate, refresh]);

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden bg-background px-5 text-foreground">
      <Grain opacity={0.5} />
      {/* soft halo */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[480px] w-[680px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/10 blur-3xl" />

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 0.61, 0.36, 1] }}
        className="relative flex w-full max-w-md flex-col items-center text-center"
      >
        {/* Branded mark with an orbiting accent ring */}
        <div className="relative grid h-24 w-24 place-items-center">
          {!reduce && (
            <>
              <motion.span
                className="absolute inset-0 rounded-[1.6rem] border border-accent/30"
                animate={{ rotate: 360 }}
                transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
              />
              <motion.span
                className="absolute inset-2 rounded-[1.4rem] border border-gold/40 border-t-transparent"
                animate={{ rotate: -360 }}
                transition={{ duration: 3.4, repeat: Infinity, ease: "linear" }}
              />
            </>
          )}
          <motion.span
            className="relative grid h-16 w-16 place-items-center rounded-2xl bg-card shadow-soft"
            {...(reduce
              ? {}
              : {
                  animate: { scale: [1, 1.04, 1] },
                  transition: { duration: 2.2, repeat: Infinity, ease: "easeInOut" },
                })}
          >
            <Logo size={36} />
          </motion.span>
        </div>

        <div className="mt-7 text-[12px] font-semibold uppercase tracking-[0.16em] text-accent">
          Almost there
        </div>
        <h1 className="mt-2 font-display text-[clamp(26px,5vw,34px)] font-semibold leading-tight tracking-[-0.01em]">
          Signing you in
        </h1>
        <p className="mt-2.5 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
          Completing authentication and getting your workspace ready. You&rsquo;ll land on your
          dashboard in a moment.
        </p>

        {/* Animated progress dots */}
        <div className="mt-7 flex items-center gap-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-2 w-2 rounded-full bg-accent"
              {...(reduce
                ? {}
                : {
                    animate: { opacity: [0.25, 1, 0.25], y: [0, -3, 0] },
                    transition: {
                      duration: 1.1,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: i * 0.18,
                    },
                  })}
            />
          ))}
        </div>

        <span className="sr-only" role="status">
          Signing you in and redirecting to your dashboard.
        </span>
      </motion.div>
    </div>
  );
}
