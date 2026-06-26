import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  fetchCreditCheckoutPacks,
  fetchCredits,
  startCreditCheckout,
  type CreditCheckoutPack,
} from "../../routing/api.js";

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
      <h1>Tutor credits</h1>
      <p className="tb-lead">Your beta tutor budget for AI study sessions.</p>

      {checkoutStatus === "success" && (
        <div className="tb-card tb-checkout-banner" role="status">
          Payment received. Credits may take a moment to appear after Stripe confirms your purchase.
        </div>
      )}
      {checkoutStatus === "cancelled" && (
        <div className="tb-card tb-checkout-banner tb-checkout-banner-muted" role="status">
          Checkout was cancelled. No charge was made.
        </div>
      )}

      {isLoading && <div className="tb-card">Loading credit balance…</div>}
      {error && (
        <pre className="tb-error">
          {error instanceof Error ? error.message : "Failed to load credits"}
        </pre>
      )}

      {!isLoading && !error && summary && (
        <div className="tb-card">
          <div className="tb-credits-header">
            <strong>{percent}% remaining</strong>
            {exhausted ? <span className="tb-credits-exhausted">Exhausted</span> : null}
          </div>
          <div
            className="tb-credits-bar"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="tb-credits-bar-fill"
              data-exhausted={exhausted}
              style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
            />
          </div>
          {exhausted ? (
            <p className="tb-credits-message">
              Your tutor credits are used up. You can still review your workspace, but new tutor
              turns are paused until more credits are available. Buy more below, redeem an access
              code, or contact support.
            </p>
          ) : (
            <p className="tb-credits-message">
              Credits are consumed as you chat with the tutor. Upload and review your study
              materials anytime.
            </p>
          )}
        </div>
      )}

      {packsLoading && <div className="tb-card">Loading purchase options…</div>}

      {checkoutEnabled && (
        <section className="tb-card">
          <h2>Buy more credits</h2>
          <p className="tb-muted">
            Secure checkout via Stripe. Purchased credits are added to your account after payment.
          </p>
          <ul className="tb-credit-pack-list">
            {sortedPacks.map((pack: CreditCheckoutPack) => (
              <li key={pack.id} className="tb-credit-pack-item">
                <div>
                  <strong>{pack.label}</strong>
                  <p className="tb-muted">{pack.description}</p>
                </div>
                <div className="tb-credit-pack-actions">
                  <span className="tb-credit-pack-price">{formatUsd(pack.priceCents)}</span>
                  <button
                    type="button"
                    className="tb-button tb-button-primary"
                    disabled={checkoutMutation.isPending}
                    onClick={() => checkoutMutation.mutate(pack.id)}
                  >
                    {checkoutMutation.isPending && activePackId === pack.id
                      ? "Redirecting…"
                      : "Buy"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {checkoutError && <pre className="tb-error">{checkoutError}</pre>}
        </section>
      )}

      {!packsLoading && !checkoutEnabled && (
        <section className="tb-card">
          <h2>Need more credits?</h2>
          <p className="tb-muted">
            Redeem an access code from the sidebar, or contact support if you need additional beta
            access.
          </p>
        </section>
      )}
    </div>
  );
}
