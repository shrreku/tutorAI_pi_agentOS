import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { api } from "../../routing/api.js";
import { Button, Field, Textarea } from "../../ui/primitives.js";

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
      <div className="rounded-xl border border-success/30 bg-success/10 p-6 shadow-soft">
        <p className="flex items-center gap-2 font-display text-[18px] font-semibold text-success">
          <Sparkles className="h-4 w-4" /> Thanks for the feedback
        </p>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
          Your response helps us improve TutorBook and prioritize beta access.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-soft">
      <h3 className="font-display text-[18px] font-semibold">Learning feedback</h3>
      <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">
        Tell us what you were trying to learn and whether TutorBook helped.
      </p>
      {detectedNotebookId ? (
        <p className="mt-1 text-[12px] text-muted-foreground">
          Linked to workspace {detectedNotebookId}
        </p>
      ) : null}

      <div className="mt-5 space-y-4">
        <Field label="What were you trying to learn?">
          <Textarea
            value={studyGoal}
            onChange={(event) => setStudyGoal(event.target.value)}
            rows={3}
          />
        </Field>

        <fieldset>
          <legend className="mb-1.5 block text-[13px] font-medium text-foreground">
            Did TutorBook help?
          </legend>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2.5 text-[14px] text-foreground">
              <input
                type="radio"
                name="helped"
                checked={helped === true}
                onChange={() => setHelped(true)}
                className="h-4 w-4 accent-accent"
              />
              Yes, it helped
            </label>
            <label className="flex items-center gap-2.5 text-[14px] text-foreground">
              <input
                type="radio"
                name="helped"
                checked={helped === false}
                onChange={() => setHelped(false)}
                className="h-4 w-4 accent-accent"
              />
              Not really
            </label>
          </div>
        </fieldset>

        <Field label="Where did it break down or confuse you?">
          <Textarea
            value={confusionText}
            onChange={(event) => setConfusionText(event.target.value)}
            rows={3}
          />
        </Field>

        <Field label="What workflow would have worked better?">
          <Textarea
            value={alternativeWorkflow}
            onChange={(event) => setAlternativeWorkflow(event.target.value)}
            rows={3}
          />
        </Field>

        <label className="flex items-start gap-2.5 text-[14px] text-foreground">
          <input
            type="checkbox"
            checked={contactPermission}
            onChange={(event) => setContactPermission(event.target.checked)}
            className="mt-0.5 h-4 w-4 accent-accent"
          />
          <span>You may contact me about this feedback.</span>
        </label>

        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
            {error}
          </p>
        )}

        <div className="flex justify-end">
          <Button variant="primary" disabled={isSubmitting} onClick={() => void handleSubmit()}>
            {isSubmitting ? "Submitting…" : "Submit learning feedback"}
          </Button>
        </div>
      </div>
    </div>
  );
}
