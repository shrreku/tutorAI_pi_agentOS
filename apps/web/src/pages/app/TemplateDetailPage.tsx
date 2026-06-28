import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Clock,
  Compass,
  GraduationCap,
  Sparkles,
  Target,
} from "lucide-react";
import {
  createWorkspaceFromTemplate,
  fetchStudyTemplate,
  type StudyTemplateSummary,
} from "../../routing/api.js";
import { Badge, Button, Eyebrow, Skeleton } from "../../ui/primitives.js";
import { Reveal, Stagger, StaggerItem } from "../../ui/motion.js";
import { HeroArt } from "../../ui/brand.js";

function PageHeader({ navigate }: { navigate: (path: string) => void }) {
  return (
    <div>
      <button
        type="button"
        onClick={() => navigate("/app")}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-accent"
      >
        <ArrowLeft className="h-4 w-4" /> Back to dashboard
      </button>
    </div>
  );
}

type DetailRow = {
  icon: typeof Compass;
  label: string;
  value: string;
};

function buildRows(template: StudyTemplateSummary): DetailRow[] {
  return [
    { icon: Compass, label: "Topic", value: template.topic },
    { icon: GraduationCap, label: "Source level", value: template.sourceLevel },
    { icon: Clock, label: "Estimated time", value: `${template.estimatedMinutes} minutes` },
    { icon: BookOpen, label: "Study mode", value: template.studyMode },
    { icon: Target, label: "Expected outcome", value: template.expectedOutcome },
  ];
}

export function TemplateDetailPage({
  templateId,
  navigate,
}: {
  templateId: string;
  navigate: (path: string) => void;
}) {
  const {
    data: template,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["study-template", templateId],
    queryFn: () => fetchStudyTemplate(templateId),
  });

  const startMutation = useMutation({
    mutationFn: () => createWorkspaceFromTemplate(templateId),
    onSuccess: (notebookId) => {
      navigate(`/notebook/${encodeURIComponent(notebookId)}`);
    },
  });

  if (isLoading) {
    return (
      <div>
        <PageHeader navigate={navigate} />
        <div className="mt-6">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-3 h-10 w-2/3" />
          <Skeleton className="mt-3 h-5 w-1/2" />
          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
          <Skeleton className="mt-8 h-12 w-48" />
        </div>
      </div>
    );
  }

  if (error || !template) {
    return (
      <div>
        <PageHeader navigate={navigate} />
        <Reveal>
          <div className="mx-auto mt-10 max-w-md rounded-xl border border-dashed border-border bg-card/60 p-8 text-center shadow-soft">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-destructive/10 text-destructive">
              <Compass className="h-6 w-6" />
            </span>
            <h1 className="mt-4 font-display text-[clamp(22px,4vw,26px)] font-semibold">
              Template unavailable
            </h1>
            <p className="mx-auto mt-2 max-w-sm text-[14px] text-muted-foreground">
              {error instanceof Error
                ? error.message
                : "This study path could not be loaded. It may have been unpublished."}
            </p>
            <Button className="mt-6" variant="primary" onClick={() => navigate("/app")}>
              Back to dashboard
            </Button>
          </div>
        </Reveal>
      </div>
    );
  }

  const rows = buildRows(template);

  return (
    <div>
      <PageHeader navigate={navigate} />

      {/* Header */}
      <Reveal>
        <div className="mt-5 border-b border-border pb-6">
          <Badge tone="gold">
            <Sparkles className="h-3 w-3" /> Study path
          </Badge>
          <h1 className="mt-3 font-display text-[clamp(26px,4vw,34px)] font-semibold leading-[1.05]">
            {template.title}
          </h1>
          <p className="mt-2 max-w-2xl font-display text-[16px] italic text-muted-foreground">
            A guided path on {template.topic} — designed to take you from {template.sourceLevel} to
            a clear outcome in about {template.estimatedMinutes} minutes.
          </p>
        </div>
      </Reveal>

      <div className="mt-7 grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-[1.55fr_1fr]">
        {/* Lead column — the syllabus */}
        <div>
          <Eyebrow>What this path covers</Eyebrow>
          <Stagger className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {rows.map((row) => {
              const Icon = row.icon;
              return (
                <StaggerItem key={row.label}>
                  <div className="flex h-full flex-col rounded-xl border border-border bg-card p-4 shadow-soft">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent/12 text-accent">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="mt-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                      {row.label}
                    </span>
                    <span className="mt-1 font-display text-[16px] font-medium leading-snug text-foreground">
                      {row.value}
                    </span>
                  </div>
                </StaggerItem>
              );
            })}
          </Stagger>

          {startMutation.isError && (
            <p className="mt-6 rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
              {startMutation.error instanceof Error
                ? startMutation.error.message
                : "Could not start this path. Please try again."}
            </p>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              variant="primary"
              disabled={startMutation.isPending}
              onClick={() => startMutation.mutate()}
            >
              {startMutation.isPending ? "Setting up…" : "Start this path"}
              {!startMutation.isPending && <ArrowRight className="h-4 w-4" />}
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate("/app")}>
              Maybe later
            </Button>
          </div>
        </div>

        {/* Side column */}
        <div className="space-y-7">
          <Reveal delay={0.05}>
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-soft">
              <div className="relative h-32 bg-surface/70">
                <HeroArt className="absolute inset-0 h-full w-full" />
              </div>
              <div className="border-t border-border p-5">
                <Eyebrow>What happens next</Eyebrow>
                <p className="mt-2 font-display text-[14.5px] italic leading-relaxed text-foreground/85">
                  Starting this path creates a fresh notebook with the tutor primed on{" "}
                  {template.topic}. Bring your own sources, or dive straight into the conversation.
                </p>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="rounded-xl border border-border border-l-[3px] border-l-primary bg-card p-5 shadow-soft">
              <Eyebrow>At a glance</Eyebrow>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Badge tone="neutral">{template.sourceLevel}</Badge>
                <Badge tone="neutral">~{template.estimatedMinutes}m</Badge>
                <Badge tone="accent">{template.studyMode}</Badge>
              </div>
              <p className="mt-4 font-display text-[13px] italic leading-relaxed text-muted-foreground">
                {template.expectedOutcome}
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </div>
  );
}
