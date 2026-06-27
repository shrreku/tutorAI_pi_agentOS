import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
  Button,
} from "@studyagent/ui";
import { fetchNotebooks, fetchStudyTemplates, submitOnboarding } from "../../routing/api.js";
import { useSession } from "../../routing/RouteGuards.js";
import { NextProductShell } from "../shell/NextProductShell.js";
import { useVisualTheme } from "../shell/ThemeProvider.js";
import { IconSearch } from "../../kit/components/KitIcons.js";

const LEVEL_OPTIONS = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
] as const;

function greetingName(email?: string, displayName?: string | null): string {
  if (displayName?.trim()) return displayName.trim();
  if (!email) return "there";
  return email.split("@")[0] ?? "there";
}

export function NextDashboardPage({ navigate }: { navigate: (path: string) => void }) {
  const { session, refresh } = useSession();
  const theme = useVisualTheme();
  const queryClient = useQueryClient();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [studyGoal, setStudyGoal] = useState("");
  const [level, setLevel] = useState<string>(LEVEL_OPTIONS[0].value);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const {
    data: templates = [],
    isLoading: templatesLoading,
    error: templatesError,
  } = useQuery({
    queryKey: ["study-templates"],
    queryFn: fetchStudyTemplates,
  });

  const { data: notebooks = [], isLoading: notebooksLoading } = useQuery({
    queryKey: ["notebooks"],
    queryFn: fetchNotebooks,
  });

  const personal = useMemo(
    () => notebooks.filter((n) => n.workspaceType === "personal_learner"),
    [notebooks],
  );

  const filteredTemplates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => `${t.title} ${t.topic}`.toLowerCase().includes(q));
  }, [search, templates]);

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

  const hour = new Date().getHours();
  const salutation = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <NextProductShell navigate={navigate} active="dashboard">
      <Dialog open={showOnboarding} onOpenChange={setShowOnboarding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quick setup</DialogTitle>
            <DialogDescription>Optional — helps us suggest better study paths.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>What are you trying to learn right now?</Label>
              <Textarea value={studyGoal} onChange={(e) => setStudyGoal(e.target.value)} rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Rough level</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
              >
                {LEVEL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            {onboardingError ? <p className="text-sm text-destructive">{onboardingError}</p> : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={onboardingMutation.isPending}
                onClick={() => onboardingMutation.mutate({ skipped: true })}
              >
                Skip
              </Button>
              <Button
                type="button"
                disabled={onboardingMutation.isPending || !studyGoal.trim()}
                onClick={() => onboardingMutation.mutate({ studyGoal: studyGoal.trim(), level })}
              >
                Continue
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className={`dash dash--${theme}`}>
        <div className="dash-profile-column">
          <h1 className="dash-heading">
            {salutation}, {greetingName(session?.user?.email, session?.user?.displayName)}
          </h1>
          <div className="card" style={{ marginBottom: 18 }}>
            <h3>Your profile</h3>
            <div className="stat-row">
              <div className="ico">📄</div>
              <div>
                <div className="num">{personal.length} workspaces</div>
                <div className="sub">Personal learner notebooks</div>
              </div>
            </div>
            <div className="stat-row">
              <div className="ico">🎯</div>
              <div>
                <div className="num">{templates.length} templates</div>
                <div className="sub">Published study paths</div>
              </div>
            </div>
            <div className="stat-row">
              <div className="ico">⚡</div>
              <div>
                <div className="num">{session?.credits?.percentRemaining ?? "—"}% credits</div>
                <div className="sub">Tutor budget remaining</div>
              </div>
            </div>
          </div>
          <div className="card">
            <h3>Start studying</h3>
            <button
              type="button"
              className="notebook-row"
              onClick={() => navigate("/notebooks")}
              style={{
                width: "100%",
                border: "none",
                background: "transparent",
                textAlign: "left",
              }}
            >
              <div className="meta">
                <div className="t">Browse notebooks</div>
                <div className="s">Open an existing workspace</div>
              </div>
              <span className="badge purple">Open →</span>
            </button>
            <button
              type="button"
              className="notebook-row"
              onClick={() => navigate("/app/workspaces/new")}
              style={{
                width: "100%",
                border: "none",
                background: "transparent",
                textAlign: "left",
              }}
            >
              <div className="meta">
                <div className="t">New workspace</div>
                <div className="s">From a template or blank</div>
              </div>
              <span className="badge purple">Create →</span>
            </button>
          </div>
        </div>

        <div className="dash-primary-column">
          <div className="search" style={{ marginBottom: 18, width: "100%" }}>
            <IconSearch />
            <input
              placeholder="Search templates, topics…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                border: "none",
                background: "transparent",
                outline: "none",
                flex: 1,
                fontSize: 14,
              }}
            />
          </div>
          <div className="card">
            <h3>Published study templates</h3>
            {templatesLoading && <p className="muted">Loading templates…</p>}
            {templatesError && (
              <p style={{ color: "var(--red)" }}>
                {templatesError instanceof Error ? templatesError.message : "Failed to load"}
              </p>
            )}
            {!templatesLoading && filteredTemplates.length === 0 && (
              <p className="muted">No templates match your search.</p>
            )}
            {filteredTemplates.map((template) => (
              <button
                key={template.id}
                type="button"
                className="notebook-row"
                onClick={() => navigate(`/app/templates/${encodeURIComponent(template.id)}`)}
                style={{
                  width: "100%",
                  border: "none",
                  background: "transparent",
                  textAlign: "left",
                }}
              >
                <div className="meta">
                  <div className="t">{template.title}</div>
                  <div className="s">
                    {template.topic} · {template.estimatedMinutes} min · {template.studyMode}
                  </div>
                </div>
                <span className="badge purple">Open</span>
              </button>
            ))}
          </div>

          <div className="card" style={{ marginTop: 18 }}>
            <h3>Active notebooks</h3>
            {notebooksLoading && <p className="muted">Loading…</p>}
            {!notebooksLoading && personal.length === 0 && (
              <p className="muted">No workspaces yet — start from a template.</p>
            )}
            {personal.slice(0, 5).map((notebook) => (
              <button
                key={notebook.id}
                type="button"
                className="notebook-row"
                onClick={() => navigate(`/notebooks/${encodeURIComponent(notebook.id)}`)}
                style={{
                  width: "100%",
                  border: "none",
                  background: "transparent",
                  textAlign: "left",
                }}
              >
                <div className="meta">
                  <div className="t">{notebook.title}</div>
                  <div className="s">
                    Updated {new Date(notebook.updatedAt).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ width: 120 }}>
                  <div className="progress">
                    <span style={{ width: "45%" }} />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="dash-aside-column">
          <div className="card" style={{ marginBottom: 18 }}>
            <h3>Suggested actions</h3>
            <div className="suggest-item">
              <span className="ico">📚</span>
              <span>Pick a study template with curriculum-first paths</span>
            </div>
            <div className="suggest-item">
              <span className="ico">📄</span>
              <span>Upload a source in a notebook to build your Study Map</span>
            </div>
          </div>
          <div className="card">
            <h3>Weekly activity</h3>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 96 }}>
              {[40, 70, 25, 90, 55, 15, 60].map((h, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      borderRadius: 4,
                      background: "var(--accent)",
                      height: `${h}%`,
                    }}
                  />
                  <span className="muted" style={{ fontSize: 10 }}>
                    {["M", "T", "W", "T", "F", "S", "S"][i]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </NextProductShell>
  );
}
