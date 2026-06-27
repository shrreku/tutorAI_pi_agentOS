import { useState } from "react";
import { Button, Card, CardContent, CardHeader, CardTitle, Label } from "@studyagent/ui";
import { submitConsent, useSession } from "../../routing/RouteGuards.js";
import { NextProductShell } from "../shell/NextProductShell.js";

export function NextConsentPage({ navigate }: { navigate: (path: string) => void }) {
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
    <NextProductShell navigate={navigate} active="dashboard">
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle className="font-display text-2xl">Beta consent</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 font-reading text-base leading-relaxed text-muted-foreground">
          <p>
            TutorBook is experimental beta software and AI tutoring may be inaccurate. We collect identified product
            analytics and may record privacy-masked workspace replays to understand onboarding and usability.
          </p>
          <p>
            Read our{" "}
            <button type="button" className="text-primary underline-offset-4 hover:underline" onClick={() => navigate("/privacy")}>
              Privacy Policy
            </button>{" "}
            and{" "}
            <button type="button" className="text-primary underline-offset-4 hover:underline" onClick={() => navigate("/terms")}>
              Terms of Service
            </button>
            .
          </p>
          <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4">
            <input
              id="consent"
              type="checkbox"
              className="mt-1"
              checked={accepted}
              onChange={(event) => setAccepted(event.target.checked)}
            />
            <Label htmlFor="consent" className="font-sans font-normal text-foreground">
              I understand and agree to participate in the TutorBook beta.
            </Label>
          </div>
          <Button type="button" disabled={!accepted || isSubmitting} onClick={() => void handleSubmit()}>
            {isSubmitting ? "Saving…" : "Continue to dashboard"}
          </Button>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>
    </NextProductShell>
  );
}
