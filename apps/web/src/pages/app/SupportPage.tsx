import { useState } from "react";
import { api } from "../../routing/api.js";
import { LearningFeedbackForm } from "./LearningFeedbackForm.js";

const SUPPORT_CATEGORIES = [
  { value: "wrong_tutor_answer", label: "Wrong or confusing tutor answer" },
  { value: "ingestion_problem", label: "Upload or ingestion problem" },
  { value: "credit_access", label: "Credits or access problem" },
  { value: "privacy_delete", label: "Privacy or delete request" },
  { value: "bug_ux", label: "Bug or UX issue" },
  { value: "learning_feedback", label: "General learning feedback" },
] as const;

function supportContextJson(): Record<string, unknown> {
  const notebookMatch = window.location.pathname.match(/^\/notebooks\/([^/]+)/);
  return {
    path: window.location.pathname,
    notebookId: notebookMatch?.[1] ?? null,
    browser: navigator.userAgent,
  };
}

export function SupportPage() {
  const [category, setCategory] = useState<string>(SUPPORT_CATEGORIES[0].value);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      <h1>Support</h1>
      <p className="tb-lead">Share learning feedback or report a beta issue.</p>

      <LearningFeedbackForm />

      <div className="tb-card" style={{ marginTop: 20 }}>
        <h2>Support report</h2>
        {success ? (
          <p>Support report submitted. We will review it in the admin console.</p>
        ) : (
          <>
            <label className="tb-field">
              <span>Category</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                {SUPPORT_CATEGORIES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="tb-field">
              <span>What happened?</span>
              <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={5} />
            </label>

            <div className="tb-actions">
              <button
                type="button"
                className="tb-button tb-button-primary"
                disabled={isSubmitting}
                onClick={() => void submitSupportReport()}
              >
                {isSubmitting ? "Submitting…" : "Submit support report"}
              </button>
            </div>
          </>
        )}
        {error && <pre className="tb-error">{error}</pre>}
      </div>
    </div>
  );
}
