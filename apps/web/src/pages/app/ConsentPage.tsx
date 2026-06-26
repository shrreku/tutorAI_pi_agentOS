import { useState } from "react";
import { submitConsent, useSession } from "../../routing/RouteGuards.js";

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
    <div className="tb-card">
      <h1>Beta consent</h1>
      <p>
        TutorBook is experimental beta software and AI tutoring may be inaccurate. We collect identified product
        analytics and may record privacy-masked workspace replays to understand onboarding and usability. Uploaded
        sources remain private to your workspace, but authentication, storage, parsing, and model providers process them
        on our behalf. Your feedback may be used to improve the product. Do not use TutorBook for high-stakes
        educational decisions. Read our{" "}
        <button type="button" className="tb-inline-link" onClick={() => navigate("/privacy")}>
          Privacy Policy
        </button>{" "}
        and{" "}
        <button type="button" className="tb-inline-link" onClick={() => navigate("/terms")}>
          Terms of Service
        </button>
        .
      </p>
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 16 }}>
        <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
        <span>I understand and agree to participate in the TutorBook beta.</span>
      </label>
      <div className="tb-actions">
        <button
          type="button"
          className="tb-button tb-button-primary"
          disabled={!accepted || isSubmitting}
          onClick={() => void handleSubmit()}
        >
          {isSubmitting ? "Saving…" : "Continue to dashboard"}
        </button>
      </div>
      {error && <pre className="tb-error">{error}</pre>}
    </div>
  );
}
