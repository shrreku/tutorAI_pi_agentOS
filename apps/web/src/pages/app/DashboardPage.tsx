import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { fetchStudyTemplates, submitOnboarding } from "../../routing/api.js";
import { useSession } from "../../routing/RouteGuards.js";

const LEVEL_OPTIONS = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
] as const;

export function DashboardPage({ navigate }: { navigate: (path: string) => void }) {
  const { session, refresh } = useSession();
  const queryClient = useQueryClient();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [studyGoal, setStudyGoal] = useState("");
  const [level, setLevel] = useState<string>(LEVEL_OPTIONS[0].value);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);

  const { data: templates = [], isLoading, error } = useQuery({
    queryKey: ["study-templates"],
    queryFn: fetchStudyTemplates,
  });

  useEffect(() => {
    if (!session?.authenticated || !session.consentAccepted) return;
    if (session.onboarding?.completed) return;
    setShowOnboarding(true);
  }, [session]);

  const onboardingMutation = useMutation({
    mutationFn: submitOnboarding,
    onSuccess: async () => {
      setOnboardingError(null);
      setShowOnboarding(false);
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (err) => {
      setOnboardingError(err instanceof Error ? err.message : "Failed to save onboarding");
    },
  });

  return (
    <div>
      {showOnboarding ? (
        <div className="tb-modal-backdrop" role="presentation">
          <div className="tb-modal tb-card" role="dialog" aria-labelledby="onboarding-title">
            <h2 id="onboarding-title">Quick setup</h2>
            <p className="tb-lead">Optional — helps us suggest better study paths. You can skip anytime.</p>
            <label className="tb-field">
              <span>What are you trying to learn right now?</span>
              <textarea value={studyGoal} onChange={(event) => setStudyGoal(event.target.value)} rows={3} />
            </label>
            <label className="tb-field">
              <span>Rough level</span>
              <select value={level} onChange={(event) => setLevel(event.target.value)}>
                {LEVEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {onboardingError && <pre className="tb-error">{onboardingError}</pre>}
            <div className="tb-actions">
              <button
                type="button"
                className="tb-button"
                disabled={onboardingMutation.isPending}
                onClick={() => onboardingMutation.mutate({ skipped: true })}
              >
                Skip for now
              </button>
              <button
                type="button"
                className="tb-button tb-button-primary"
                disabled={onboardingMutation.isPending || !studyGoal.trim()}
                onClick={() => onboardingMutation.mutate({ studyGoal: studyGoal.trim(), level })}
              >
                {onboardingMutation.isPending ? "Saving…" : "Continue"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <h1>Study templates</h1>
      <p className="tb-lead">Choose a published template to start a guided study path.</p>

      {isLoading && <div className="tb-card">Loading templates…</div>}
      {error && <pre className="tb-error">{error instanceof Error ? error.message : "Failed to load templates"}</pre>}

      {!isLoading && !error && templates.length === 0 && (
        <div className="tb-card">
          <h2>No templates yet</h2>
          <p>Published study templates will appear here when they are ready for the beta.</p>
        </div>
      )}

      <div className="tb-template-grid">
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            className="tb-card tb-template-card"
            onClick={() => navigate(`/app/templates/${encodeURIComponent(template.id)}`)}
          >
            <h3>{template.title}</h3>
            <div className="tb-template-meta">
              <span>Topic: {template.topic}</span>
              <span>Source level: {template.sourceLevel}</span>
              <span>Estimated time: {template.estimatedMinutes} min</span>
              <span>Study mode: {template.studyMode}</span>
              <span>Expected outcome: {template.expectedOutcome}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
