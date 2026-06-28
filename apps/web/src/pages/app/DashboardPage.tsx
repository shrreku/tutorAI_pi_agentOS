import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowRight, BookText, Clock, FileText, Plus, Sparkles } from "lucide-react";
import {
  fetchNotebooks,
  fetchStudyTemplates,
  submitOnboarding,
  type NotebookSummary,
  type StudyTemplateSummary,
} from "../../routing/api.js";
import { useSession } from "../../routing/RouteGuards.js";
import { Badge, Button, Eyebrow, Meter, Skeleton } from "../../ui/primitives.js";
import { Reveal, Stagger, StaggerItem, Lift, motion } from "../../ui/motion.js";
import { cn } from "../../ui/cn.js";

const LEVELS = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
] as const;

const SUBJECT_ACCENT = [
  "bg-accent",
  "bg-gold",
  "bg-primary",
  "bg-[#4a6a8c]",
  "bg-[#9a7b1f]",
  "bg-[#7a6cab]",
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function OnboardingModal({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const { refresh } = useSession();
  const [studyGoal, setStudyGoal] = useState("");
  const [level, setLevel] = useState<string>(LEVELS[0].value);
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: submitOnboarding,
    onSuccess: async () => {
      setError(null);
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      onDone();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed to save"),
  });

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm"
      role="presentation"
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 0.61, 0.36, 1] }}
        role="dialog"
        aria-labelledby="onb-title"
        className="w-full max-w-md rounded-2xl border border-border bg-card p-7 shadow-pop"
      >
        <Badge tone="accent">
          <Sparkles className="h-3 w-3" /> Quick setup
        </Badge>
        <h2 id="onb-title" className="mt-3 font-display text-[24px] font-semibold">
          What are you studying?
        </h2>
        <p className="mt-1 text-[14px] text-muted-foreground">
          Optional — it helps the tutor suggest better paths. You can skip anytime.
        </p>
        <label className="mt-5 block">
          <span className="mb-1.5 block text-[13px] font-medium">Your current goal</span>
          <textarea
            value={studyGoal}
            onChange={(e) => setStudyGoal(e.target.value)}
            rows={3}
            placeholder="e.g. Master Organic Chemistry I before finals"
            className="w-full resize-none rounded-lg border border-input bg-elevated px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-accent/30"
          />
        </label>
        <label className="mt-3 block">
          <span className="mb-1.5 block text-[13px] font-medium">Rough level</span>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="h-10 w-full rounded-lg border border-input bg-elevated px-3 text-sm outline-none focus-visible:border-ring"
          >
            {LEVELS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2.5">
          <Button
            variant="ghost"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ skipped: true })}
          >
            Skip for now
          </Button>
          <Button
            variant="primary"
            disabled={mutation.isPending || !studyGoal.trim()}
            onClick={() => mutation.mutate({ studyGoal: studyGoal.trim(), level })}
          >
            {mutation.isPending ? "Saving…" : "Continue"}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

export function DashboardPage({ navigate }: { navigate: (path: string) => void }) {
  const { session } = useSession();
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (!session?.authenticated || !session.consentAccepted) return;
    if (session.onboarding?.completed) return;
    setShowOnboarding(true);
  }, [session]);

  const notebooksQ = useQuery<NotebookSummary[]>({
    queryKey: ["notebooks"],
    queryFn: fetchNotebooks,
    retry: false,
  });
  const templatesQ = useQuery<StudyTemplateSummary[]>({
    queryKey: ["study-templates"],
    queryFn: fetchStudyTemplates,
    retry: false,
  });

  const notebooks = (notebooksQ.data ?? []).filter((n) => n.workspaceType === "personal_learner");
  const templates = templatesQ.data ?? [];
  const firstName = (session?.user?.displayName ?? "").split(" ")[0] || "there";
  const featured = notebooks[0];

  return (
    <div>
      {showOnboarding && <OnboardingModal onDone={() => setShowOnboarding(false)} />}

      {/* Masthead */}
      <Reveal>
        <div className="border-b-2 border-foreground/80 pb-5">
          <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            <span>The Study Journal</span>
            <span>
              {new Date().toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </span>
          </div>
          <h1 className="mt-3 font-display text-[clamp(32px,5vw,44px)] font-semibold leading-[1.03]">
            {greeting()}, {firstName}.
          </h1>
          <p className="mt-2 max-w-2xl font-display text-[16px] italic text-muted-foreground">
            {notebooks.length > 0
              ? `You have ${notebooks.length} notebook${notebooks.length > 1 ? "s" : ""} open. Pick up where you left off, or start something new.`
              : "Bring in your first source and meet a tutor that learns it with you."}
          </p>
        </div>
      </Reveal>

      <div className="mt-7 grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-[1.6fr_1fr]">
        {/* Lead column */}
        <div>
          {notebooksQ.isLoading ? (
            <Skeleton className="h-44 w-full" />
          ) : featured ? (
            <Reveal>
              <Eyebrow>Continue</Eyebrow>
              <Lift className="mt-3">
                <button
                  onClick={() => navigate(`/notebook/${encodeURIComponent(featured.id)}`)}
                  className="block w-full rounded-xl border border-border border-l-[3px] border-l-accent bg-card p-6 text-left shadow-soft"
                >
                  <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                    Last opened {timeAgo(featured.updatedAt)}
                  </div>
                  <h2 className="mt-1 font-display text-[26px] font-semibold leading-tight">
                    {featured.title}
                  </h2>
                  <p className="mt-2 max-w-lg font-display text-[15px] leading-relaxed text-foreground/80">
                    Resume your conversation with the tutor — your Study Map and sources are right
                    where you left them.
                  </p>
                  <span className="mt-4 inline-flex items-center gap-2 text-[14px] font-medium text-accent">
                    Open notebook <ArrowRight className="h-4 w-4" />
                  </span>
                </button>
              </Lift>
            </Reveal>
          ) : (
            <Reveal>
              <div className="rounded-xl border border-dashed border-border bg-card/60 p-8 text-center">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-accent/12 text-accent">
                  <BookText className="h-6 w-6" />
                </span>
                <h2 className="mt-4 font-display text-[22px] font-semibold">
                  Start your first notebook
                </h2>
                <p className="mx-auto mt-2 max-w-md text-[14px] text-muted-foreground">
                  Choose a study template below, or create a blank notebook and add your own
                  sources.
                </p>
                <Button
                  className="mt-5"
                  variant="primary"
                  onClick={() => navigate("/app/workspaces/new")}
                >
                  <Plus className="h-4 w-4" /> New notebook
                </Button>
              </div>
            </Reveal>
          )}

          {notebooks.length > 0 && (
            <div className="mt-9">
              <div className="mb-2 flex items-baseline justify-between border-b border-border pb-2">
                <Eyebrow>Your notebooks</Eyebrow>
                <button
                  onClick={() => navigate("/notebooks")}
                  className="text-[12px] font-medium text-accent hover:underline"
                >
                  View all
                </button>
              </div>
              <Stagger className="divide-y divide-border">
                {notebooks.slice(0, 6).map((n, i) => (
                  <StaggerItem key={n.id}>
                    <button
                      onClick={() => navigate(`/notebook/${encodeURIComponent(n.id)}`)}
                      className="group flex w-full items-center gap-4 py-3.5 text-left"
                    >
                      <span
                        className={cn(
                          "h-9 w-1.5 shrink-0 rounded-full",
                          SUBJECT_ACCENT[i % SUBJECT_ACCENT.length],
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-[16px] font-medium group-hover:text-accent">
                          {n.title}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                          <Clock className="h-3 w-3" /> {timeAgo(n.updatedAt)}
                        </span>
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                    </button>
                  </StaggerItem>
                ))}
              </Stagger>
            </div>
          )}

          {/* Templates */}
          <div className="mt-9">
            <div className="mb-3 flex items-baseline justify-between border-b border-border pb-2">
              <Eyebrow>{notebooks.length > 0 ? "Start something new" : "Study templates"}</Eyebrow>
            </div>
            {templatesQ.isLoading ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Skeleton className="h-28" />
                <Skeleton className="h-28" />
              </div>
            ) : templates.length === 0 ? (
              <p className="text-[14px] text-muted-foreground">
                Published templates will appear here.
              </p>
            ) : (
              <Stagger className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {templates.slice(0, 4).map((t) => (
                  <StaggerItem key={t.id}>
                    <Lift>
                      <button
                        onClick={() => navigate(`/app/templates/${encodeURIComponent(t.id)}`)}
                        className="flex h-full w-full flex-col rounded-xl border border-border bg-card p-4 text-left shadow-soft"
                      >
                        <span className="grid h-9 w-9 place-items-center rounded-lg bg-gold/14 text-gold">
                          <FileText className="h-4 w-4" />
                        </span>
                        <h3 className="mt-3 font-display text-[16px] font-semibold leading-snug">
                          {t.title}
                        </h3>
                        <p className="mt-1 line-clamp-2 text-[12.5px] text-muted-foreground">
                          {t.topic}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-1.5">
                          <Badge tone="neutral">{t.sourceLevel}</Badge>
                          <Badge tone="neutral">~{t.estimatedMinutes}m</Badge>
                        </div>
                      </button>
                    </Lift>
                  </StaggerItem>
                ))}
              </Stagger>
            )}
          </div>
        </div>

        {/* Side column */}
        <div className="space-y-7">
          <Reveal delay={0.05}>
            <div className="rounded-xl border border-border border-l-[3px] border-l-primary bg-card p-5 shadow-soft">
              <Eyebrow>From your tutor</Eyebrow>
              <p className="mt-2 font-display text-[14.5px] italic leading-relaxed text-foreground/85">
                {notebooks.length > 0
                  ? "Welcome back. Open a notebook and ask me anything — I'll pull the exact passage from your sources and we'll work through it together."
                  : "Add a PDF, slide deck, or set of notes, and I'll index every page so we can study from your real material — with citations."}
              </p>
              <p className="mt-3 font-display text-[13px] italic text-muted-foreground">
                — TutorBook
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
              <Eyebrow>Your library</Eyebrow>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                {[
                  ["Notebooks", String(notebooks.length)],
                  ["Templates", String(templates.length)],
                  ["Credits", session?.credits ? `${session.credits.percentRemaining}%` : "—"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-surface/70 px-2 py-3">
                    <div className="font-display text-[22px] font-semibold text-primary">
                      {value}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{label}</div>
                  </div>
                ))}
              </div>
              {session?.credits && (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-[12px] text-muted-foreground">
                    <span>Tutor credits</span>
                    <span>{session.credits.percentRemaining}%</span>
                  </div>
                  <Meter
                    className="mt-1.5"
                    value={session.credits.percentRemaining}
                    tone={session.credits.exhausted ? "danger" : "accent"}
                  />
                  <button
                    onClick={() => navigate("/app/credits")}
                    className="mt-2 text-[12px] font-medium text-accent hover:underline"
                  >
                    Manage credits →
                  </button>
                </div>
              )}
            </div>
          </Reveal>
        </div>
      </div>
    </div>
  );
}
