import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, BookOpen, Clock, Sparkles, Target } from "lucide-react";
import {
  createWorkspaceFromTemplate,
  fetchStudyTemplate,
  type StudyTemplateSummary,
} from "../../routing/api.js";
import { Badge, Button, Eyebrow, Panel, Ring } from "../../ui/primitives.js";
import { Reveal, motion } from "../../ui/motion.js";
import { HeroArt } from "../../ui/brand.js";

export function WorkspaceCreatePage({ navigate }: { navigate: (path: string) => void }) {
  const templateId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("template");
  }, []);

  const [error, setError] = useState<string | null>(null);

  const templateQ = useQuery<StudyTemplateSummary>({
    queryKey: ["study-template", templateId],
    queryFn: () => fetchStudyTemplate(templateId as string),
    enabled: Boolean(templateId),
    retry: false,
  });

  useEffect(() => {
    if (!templateId) {
      setError("No study template was selected.");
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const notebookId = await createWorkspaceFromTemplate(templateId);
        if (!cancelled) {
          navigate(`/notebooks/${encodeURIComponent(notebookId)}`);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to create workspace.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [templateId, navigate]);

  return (
    <div>
      {/* Page header */}
      <Reveal>
        <div className="border-b border-border pb-5">
          <Eyebrow>New workspace</Eyebrow>
          <h1 className="mt-2 font-display text-[clamp(26px,4vw,34px)] font-semibold leading-[1.05]">
            {error ? "We hit a snag" : "Setting up your study workspace"}
          </h1>
          <p className="mt-2 max-w-2xl text-[15px] text-muted-foreground">
            {error
              ? "Your workspace couldn't be created. Here's what happened."
              : "We're creating a personal notebook from your chosen template. This only takes a moment."}
          </p>
        </div>
      </Reveal>

      <div className="mt-7">
        {error ? (
          <Reveal>
            <Panel className="overflow-hidden p-0">
              <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr]">
                <div className="p-7">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-destructive/12 text-destructive">
                    <AlertTriangle className="h-5 w-5" />
                  </span>
                  <h2 className="mt-4 font-display text-[22px] font-semibold">
                    Could not create workspace
                  </h2>
                  <p className="mt-2 max-w-md rounded-lg bg-destructive/8 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-destructive">
                    {error}
                  </p>
                  <p className="mt-4 max-w-md text-[14px] leading-relaxed text-muted-foreground">
                    You can head back to your dashboard and try again, or pick a different study
                    template.
                  </p>
                  <div className="mt-6 flex flex-wrap gap-2.5">
                    <Button variant="primary" onClick={() => navigate("/app")}>
                      <ArrowLeft className="h-4 w-4" /> Back to dashboard
                    </Button>
                    <Button variant="outline" onClick={() => navigate("/app")}>
                      Browse templates
                    </Button>
                  </div>
                </div>
                <div className="hidden place-items-center border-l border-border bg-surface/40 p-7 md:grid">
                  <HeroArt className="w-full max-w-[220px] opacity-90" />
                </div>
              </div>
            </Panel>
          </Reveal>
        ) : (
          <Reveal>
            <Panel className="p-7">
              <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
                <div className="relative shrink-0">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1.6, ease: "linear" }}
                  >
                    <Ring value={66} size={64} tone="accent" />
                  </motion.div>
                  <span className="pointer-events-none absolute inset-0 grid place-items-center text-accent">
                    <Sparkles className="h-5 w-5" />
                  </span>
                </div>
                <div className="min-w-0">
                  <Badge tone="accent">
                    <Sparkles className="h-3 w-3" /> Creating
                  </Badge>
                  <h2 className="mt-2.5 font-display text-[22px] font-semibold leading-snug">
                    {templateQ.data ? templateQ.data.title : "Building your workspace…"}
                  </h2>
                  <p className="mt-1.5 max-w-lg text-[14px] leading-relaxed text-muted-foreground">
                    Indexing the template materials and preparing your tutor. You'll be taken to
                    your new notebook automatically.
                  </p>
                </div>
              </div>

              {templateQ.data && (
                <div className="mt-6 grid grid-cols-1 gap-3 border-t border-border pt-6 sm:grid-cols-3">
                  <DetailTile
                    icon={<Target className="h-4 w-4" />}
                    label="Topic"
                    value={templateQ.data.topic}
                  />
                  <DetailTile
                    icon={<BookOpen className="h-4 w-4" />}
                    label="Level"
                    value={templateQ.data.sourceLevel}
                  />
                  <DetailTile
                    icon={<Clock className="h-4 w-4" />}
                    label="Estimated"
                    value={`~${templateQ.data.estimatedMinutes} min`}
                  />
                </div>
              )}

              <div className="mt-6 h-1.5 w-full overflow-hidden rounded-full bg-surface">
                <motion.div
                  className="h-full rounded-full bg-accent"
                  initial={{ x: "-100%" }}
                  animate={{ x: "100%" }}
                  transition={{ repeat: Infinity, duration: 1.3, ease: "easeInOut" }}
                  style={{ width: "55%" }}
                />
              </div>
            </Panel>
          </Reveal>
        )}
      </div>
    </div>
  );
}

function DetailTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface/50 p-3.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span className="text-accent">{icon}</span>
        {label}
      </div>
      <div className="mt-1.5 truncate font-display text-[15px] font-medium" title={value}>
        {value}
      </div>
    </div>
  );
}
