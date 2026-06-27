import { useState } from "react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from "@studyagent/ui";
import { devLogin, isLocalhost, useSession } from "../../routing/RouteGuards.js";
import { recordPublicAnalyticsEvent } from "../../routing/api.js";
import { NextPublicLayout } from "../shell/NextPublicLayout.js";

export function NextLoginPage({ navigate }: { navigate: (path: string) => void }) {
  const { refresh } = useSession();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const localhost = isLocalhost();

  const handleDevLogin = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await devLogin(email.trim());
      await refresh();
      navigate("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <NextPublicLayout navigate={navigate}>
      <Card className="shadow-md">
        <CardHeader>
          <Badge variant="purple" className="mb-2 w-fit">
            Learner access
          </Badge>
          <CardTitle className="text-2xl">Sign in to TutorBook</CardTitle>
          <p className="text-sm text-muted-foreground">
            Access study templates, your workspaces, and the tutor experience.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {localhost ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void handleDevLogin();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="dev-email">Dev email</Label>
                <Input
                  id="dev-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Signing in…" : "Continue (dev)"}
              </Button>
            </form>
          ) : (
            <a
              className="inline-flex h-9 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
              href="/api/v1/auth/workos/login"
              onClick={() => recordPublicAnalyticsEvent("login_redirect", { provider: "workos" })}
            >
              Sign in with WorkOS
            </a>
          )}
          {error ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>
    </NextPublicLayout>
  );
}
