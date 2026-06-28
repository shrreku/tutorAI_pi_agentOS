import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Gauge,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Upload,
  XCircle,
} from "lucide-react";
import {
  fetchCreditCheckoutPacks,
  fetchCredits,
  startCreditCheckout,
  type CreditCheckoutPack,
} from "../../routing/api.js";
import { Badge, Button, Eyebrow, Ring, Skeleton } from "../../ui/primitives.js";
import { Reveal, Stagger, StaggerItem, Lift } from "../../ui/motion.js";
import { cn } from "../../ui/cn.js";

function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function readCheckoutStatus(): "success" | "cancelled" | null {
  const value = new URLSearchParams(window.location.search).get("checkout");
  if (value === "success" || value === "cancelled") {
    return value;
  }
  return null;
}

function clearCheckoutQueryParam(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("checkout");
  window.history.replaceState({}, "", `${url.pathname}${url.search}`);
}

const CREDIT_TYPE_LABEL: Record<CreditCheckoutPack["creditType"], string> = {
  tutor: "Tutor turns",
  ingestion: "Source ingestion",
};

export function CreditsPage() {
  const queryClient = useQueryClient();
  const [checkoutStatus, setCheckoutStatus] = useState<"success" | "cancelled" | null>(() =>
    readCheckoutStatus(),
  );
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [activePackId, setActivePackId] = useState<string | null>(null);

  const {
    data: credits,
    isLoading: creditsLoading,
    error: creditsError,
  } = useQuery({
    queryKey: ["credits"],
    queryFn: fetchCredits,
  });

  const { data: packs, isLoading: packsLoading } = useQuery({
    queryKey: ["credit-checkout-packs"],
    queryFn: fetchCreditCheckoutPacks,
    retry: false,
  });

  useEffect(() => {
    const status = readCheckoutStatus();
    if (!status) {
      return;
    }
    setCheckoutStatus(status);
    clearCheckoutQueryParam();
    void queryClient.invalidateQueries({ queryKey: ["credits"] });
    void queryClient.invalidateQueries({ queryKey: ["me"] });
  }, [queryClient]);

  const checkoutMutation = useMutation({
    mutationFn: startCreditCheckout,
    onMutate: (packId) => {
      setCheckoutError(null);
      setActivePackId(packId);
    },
    onSuccess: (checkoutUrl) => {
      window.location.assign(checkoutUrl);
    },
    onError: (error) => {
      setCheckoutError(error instanceof Error ? error.message : "Failed to start checkout");
      setActivePackId(null);
    },
  });

  const isLoading = creditsLoading;
  const error = creditsError;
  const summary = credits;
  const percent = summary?.percentRemaining ?? 0;
  const exhausted = summary?.exhausted ?? false;
  const checkoutEnabled = packs != null && packs.length > 0;

  const sortedPacks = useMemo(
    () => (packs ?? []).slice().sort((a, b) => a.creditType.localeCompare(b.creditType)),
    [packs],
  );

  return (
    <div>
      {/* Page header */}
      <Reveal>
        <Eyebrow>Account</Eyebrow>
        <h1 className="mt-2 font-display text-[clamp(26px,4vw,34px)] font-semibold leading-tight">
          Tutor credits
        </h1>
        <p className="mt-2 max-w-2xl font-display text-[16px] italic text-muted-foreground">
          Your beta tutor budget for AI study sessions.
        </p>
      </Reveal>

      {/* Checkout return banners */}
      {checkoutStatus === "success" && (
        <Reveal className="mt-6">
          <div
            role="status"
            className="flex items-start gap-3 rounded-xl border border-border border-l-[3px] border-l-accent bg-card p-4 shadow-soft"
          >
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <p className="text-[14px] text-foreground/85">
              Payment received. Credits may take a moment to appear after Stripe confirms your
              purchase.
            </p>
          </div>
        </Reveal>
      )}
      {checkoutStatus === "cancelled" && (
        <Reveal className="mt-6">
          <div
            role="status"
            className="flex items-start gap-3 rounded-xl border border-border bg-surface/70 p-4"
          >
            <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <p className="text-[14px] text-muted-foreground">
              Checkout was cancelled. No charge was made.
            </p>
          </div>
        </Reveal>
      )}

      {/* Hero credit panel */}
      {isLoading ? (
        <Skeleton className="mt-7 h-48 w-full rounded-xl" />
      ) : error ? (
        <Reveal className="mt-7">
          <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/8 p-5">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="font-display text-[16px] font-semibold text-foreground">
                Couldn’t load your credits
              </p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {error instanceof Error ? error.message : "Failed to load credits"}
              </p>
            </div>
          </div>
        </Reveal>
      ) : summary ? (
        <Reveal className="mt-7">
          <div
            className={cn(
              "overflow-hidden rounded-xl border border-border bg-card shadow-soft",
              "border-l-[3px]",
              exhausted ? "border-l-destructive" : "border-l-primary",
            )}
          >
            <div className="grid grid-cols-1 gap-6 p-6 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-8 sm:p-7">
              <div className="flex items-center justify-center">
                <Ring
                  value={percent}
                  size={132}
                  tone={exhausted ? "gold" : "primary"}
                  label={<span className="font-display text-[26px] font-semibold">{percent}%</span>}
                  sublabel="remaining"
                />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Eyebrow>Tutor budget</Eyebrow>
                  {exhausted ? (
                    <Badge tone="danger">Exhausted</Badge>
                  ) : (
                    <Badge tone="success">Active</Badge>
                  )}
                </div>
                <h2 className="mt-2 font-display text-[24px] font-semibold leading-tight">
                  {exhausted ? "Your tutor credits are used up" : "You’re ready to study"}
                </h2>
                <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
                  {exhausted
                    ? "You can still review your workspace, but new tutor turns are paused until more credits are available. Buy more below, redeem an access code, or contact support."
                    : "Credits are consumed as you chat with the tutor. Upload and review your study materials anytime."}
                </p>
                {checkoutEnabled && (
                  <Button
                    className="mt-4"
                    variant={exhausted ? "primary" : "outline"}
                    onClick={() => {
                      document
                        .getElementById("top-up")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                  >
                    <Sparkles className="h-4 w-4" /> Top up credits
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Reveal>
      ) : null}

      {/* How credits work */}
      {!isLoading && !error && summary && (
        <Reveal className="mt-8">
          <div className="mb-3 border-b border-border pb-2">
            <Eyebrow>How credits work</Eyebrow>
          </div>
          <Stagger className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              {
                icon: MessageSquare,
                title: "Tutor turns spend credits",
                body: "Each conversation turn with your tutor draws from your balance.",
                tint: "bg-accent/12 text-accent",
              },
              {
                icon: Upload,
                title: "Reviewing is always free",
                body: "Read sources, notes, and your Study Map without spending anything.",
                tint: "bg-gold/14 text-gold",
              },
              {
                icon: Gauge,
                title: "Top up anytime",
                body: "Purchased credits are added to your account right after payment.",
                tint: "bg-primary/12 text-primary",
              },
            ].map((item) => (
              <StaggerItem key={item.title}>
                <div className="h-full rounded-xl border border-border bg-card p-5 shadow-soft">
                  <span className={cn("grid h-9 w-9 place-items-center rounded-lg", item.tint)}>
                    <item.icon className="h-4 w-4" />
                  </span>
                  <h3 className="mt-3 font-display text-[15.5px] font-semibold leading-snug">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                    {item.body}
                  </p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </Reveal>
      )}

      {/* Top up */}
      <div id="top-up" className="mt-10 scroll-mt-8">
        <div className="mb-3 flex items-baseline justify-between border-b border-border pb-2">
          <Eyebrow>Top up</Eyebrow>
          {checkoutEnabled && (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" /> Secure checkout via Stripe
            </span>
          )}
        </div>

        {packsLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        ) : checkoutEnabled ? (
          <>
            <Stagger className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {sortedPacks.map((pack: CreditCheckoutPack) => {
                const pending = checkoutMutation.isPending && activePackId === pack.id;
                return (
                  <StaggerItem key={pack.id}>
                    <Lift className="h-full">
                      <div className="flex h-full flex-col rounded-xl border border-border bg-card p-5 shadow-soft">
                        <div className="flex items-start justify-between gap-3">
                          <Badge tone="neutral">{CREDIT_TYPE_LABEL[pack.creditType]}</Badge>
                          <span className="font-display text-[24px] font-semibold tabular-nums">
                            {formatUsd(pack.priceCents)}
                          </span>
                        </div>
                        <h3 className="mt-3 font-display text-[18px] font-semibold leading-snug">
                          {pack.label}
                        </h3>
                        <p className="mt-1 flex-1 text-[13px] leading-relaxed text-muted-foreground">
                          {pack.description}
                        </p>
                        <Button
                          className="mt-4 w-full"
                          variant="primary"
                          disabled={checkoutMutation.isPending}
                          onClick={() => checkoutMutation.mutate(pack.id)}
                        >
                          <CreditCard className="h-4 w-4" />
                          {pending ? "Redirecting…" : "Buy"}
                        </Button>
                      </div>
                    </Lift>
                  </StaggerItem>
                );
              })}
            </Stagger>
            {checkoutError && (
              <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive/8 p-3.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <p className="text-[13px] text-destructive">{checkoutError}</p>
              </div>
            )}
          </>
        ) : (
          <Reveal>
            <div className="rounded-xl border border-dashed border-border bg-card/60 p-8 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gold/14 text-gold">
                <Sparkles className="h-6 w-6" />
              </span>
              <h2 className="mt-4 font-display text-[20px] font-semibold">Need more credits?</h2>
              <p className="mx-auto mt-2 max-w-md text-[14px] text-muted-foreground">
                Redeem an access code from the sidebar, or contact support if you need additional
                beta access.
              </p>
            </div>
          </Reveal>
        )}
      </div>
    </div>
  );
}
