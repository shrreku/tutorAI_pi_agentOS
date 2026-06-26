import { useState } from "react";
import { api } from "../../routing/api.js";

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
    <div className="tb-card">
      <h1>Access code</h1>
      <p className="tb-lead">
        Redeem a code for additional study privileges, credits, or pilot access.
      </p>

      <label className="tb-field">
        <span>Access code</span>
        <input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="TB-XXXXXXXXXX"
        />
      </label>

      <div className="tb-actions">
        <button
          type="button"
          className="tb-button tb-button-primary"
          disabled={isSubmitting}
          onClick={() => void handleRedeem()}
        >
          {isSubmitting ? "Redeeming…" : "Redeem code"}
        </button>
      </div>

      {success && <p style={{ marginTop: 16 }}>{success}</p>}
      {error && <pre className="tb-error">{error}</pre>}
    </div>
  );
}
