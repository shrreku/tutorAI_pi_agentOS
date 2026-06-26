import { useMemo, useState } from "react";
import { api } from "../../routing/api.js";

function notebookIdFromPath(): string | undefined {
  const match = window.location.pathname.match(/^\/notebooks\/([^/]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

export function LearningFeedbackForm({ onSubmitted }: { onSubmitted?: () => void }) {
  const detectedNotebookId = useMemo(() => notebookIdFromPath(), []);
  const [studyGoal, setStudyGoal] = useState("");
  const [helped, setHelped] = useState<boolean | null>(null);
  const [confusionText, setConfusionText] = useState("");
  const [alternativeWorkflow, setAlternativeWorkflow] = useState("");
  const [contactPermission, setContactPermission] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!studyGoal.trim() || helped === null) {
      setError("Please share your study goal and whether TutorBook helped.");
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      const res = await api("/feedback/learning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studyGoal: studyGoal.trim(),
          helped,
          confusionText: confusionText.trim() || undefined,
          alternativeWorkflow: alternativeWorkflow.trim() || undefined,
          contactPermission,
          notebookId: detectedNotebookId,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? "Failed to submit feedback");
      }
      setSuccess(true);
      onSubmitted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit feedback");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="tb-card">
        <h2>Thanks for the feedback</h2>
        <p>Your response helps us improve TutorBook and prioritize beta access.</p>
      </div>
    );
  }

  return (
    <div className="tb-card">
      <h2>Learning feedback</h2>
      <p className="tb-lead">Tell us what you were trying to learn and whether TutorBook helped.</p>
      {detectedNotebookId ? (
        <p className="tb-muted">Linked to workspace {detectedNotebookId}</p>
      ) : null}

      <label className="tb-field">
        <span>What were you trying to learn?</span>
        <textarea
          value={studyGoal}
          onChange={(event) => setStudyGoal(event.target.value)}
          rows={3}
        />
      </label>

      <fieldset className="tb-field">
        <legend>Did TutorBook help?</legend>
        <label>
          <input
            type="radio"
            name="helped"
            checked={helped === true}
            onChange={() => setHelped(true)}
          />
          Yes, it helped
        </label>
        <label>
          <input
            type="radio"
            name="helped"
            checked={helped === false}
            onChange={() => setHelped(false)}
          />
          Not really
        </label>
      </fieldset>

      <label className="tb-field">
        <span>Where did it break down or confuse you?</span>
        <textarea
          value={confusionText}
          onChange={(event) => setConfusionText(event.target.value)}
          rows={3}
        />
      </label>

      <label className="tb-field">
        <span>What workflow would have worked better?</span>
        <textarea
          value={alternativeWorkflow}
          onChange={(event) => setAlternativeWorkflow(event.target.value)}
          rows={3}
        />
      </label>

      <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <input
          type="checkbox"
          checked={contactPermission}
          onChange={(event) => setContactPermission(event.target.checked)}
        />
        <span>You may contact me about this feedback.</span>
      </label>

      <div className="tb-actions">
        <button
          type="button"
          className="tb-button tb-button-primary"
          disabled={isSubmitting}
          onClick={() => void handleSubmit()}
        >
          {isSubmitting ? "Submitting…" : "Submit learning feedback"}
        </button>
      </div>

      {error && <pre className="tb-error">{error}</pre>}
    </div>
  );
}
