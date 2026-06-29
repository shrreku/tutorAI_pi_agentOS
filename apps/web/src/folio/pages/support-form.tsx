import { useState } from "react";
import { Sparkles } from "lucide-react";
import { submitLearningFeedback } from "@studyagent/api-client";
import { apiClient } from "../../platform/api-client.js";
import { Button } from "../ui/primitives.js";

export function FolioLearningFeedbackForm({ onSubmitted }: { onSubmitted?: () => void }) {
  const [studyGoal, setStudyGoal] = useState("");
  const [helped, setHelped] = useState<boolean | null>(null);
  const [confusionText, setConfusionText] = useState("");
  const [alternativeWorkflow, setAlternativeWorkflow] = useState("");
  const [contactPermission, setContactPermission] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  const notebookId = (() => {
    const match = window.location.pathname.match(/^\/notebooks\/([^/]+)/);
    return match?.[1] ? decodeURIComponent(match[1]) : undefined;
  })();

  const submit = async () => {
    if (!studyGoal.trim() || helped === null) {
      setError("Please share your study goal and whether TutorBook helped.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await submitLearningFeedback(apiClient.request, {
        studyGoal: studyGoal.trim(),
        helped,
        contactPermission,
        ...(confusionText.trim() ? { confusionText: confusionText.trim() } : {}),
        ...(alternativeWorkflow.trim()
          ? { alternativeWorkflow: alternativeWorkflow.trim() }
          : {}),
        ...(notebookId ? { notebookId } : {}),
      });
      setSuccess(true);
      onSubmitted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit feedback");
    } finally {
      setPending(false);
    }
  };

  if (success) {
    return (
      <div className="rounded-[var(--radius)] border border-success/30 bg-success/10 p-5">
        <p className="flex items-center gap-2 font-display text-[17px] font-semibold text-success">
          <Sparkles className="h-4 w-4" /> Thanks for the feedback
        </p>
        <p className="mt-1.5 text-[13.5px] text-muted-foreground">
          Your response helps us improve TutorBook and prioritize beta access.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          What were you trying to learn?
        </span>
        <textarea
          value={studyGoal}
          onChange={(e) => setStudyGoal(e.target.value)}
          rows={3}
          className="mt-1.5 w-full rounded-[var(--radius)] border border-border bg-elevated px-3 py-2 text-[14px] outline-none focus:border-accent"
        />
      </label>
      <fieldset>
        <legend className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Did TutorBook help?
        </legend>
        <div className="mt-2 flex gap-3">
          {[
            [true, "Yes"],
            [false, "Not really"],
          ].map(([value, label]) => (
            <label key={String(value)} className="inline-flex items-center gap-2 text-[14px]">
              <input
                type="radio"
                name="helped"
                checked={helped === value}
                onChange={() => setHelped(value as boolean)}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          What was confusing? (optional)
        </span>
        <textarea
          value={confusionText}
          onChange={(e) => setConfusionText(e.target.value)}
          rows={2}
          className="mt-1.5 w-full rounded-[var(--radius)] border border-border bg-elevated px-3 py-2 text-[14px] outline-none focus:border-accent"
        />
      </label>
      {error ? (
        <p className="rounded-[var(--radius)] bg-destructive/12 px-3 py-2 text-[13px] text-destructive">
          {error}
        </p>
      ) : null}
      <Button disabled={pending} onClick={() => void submit()}>
        {pending ? "Sending…" : "Send feedback"}
      </Button>
    </div>
  );
}
