import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarClock,
  Clock,
  Flame,
  GraduationCap,
  Sparkles,
} from "lucide-react";
import { dashboardSummaryQueryOptions } from "@studyagent/api-client";
import type {
  DashboardNotebookSummary,
  DashboardRecentActivity,
  LearnerDashboardSummary,
} from "@studyagent/schemas";
import { apiClient } from "../../platform/api-client.js";
import { firstNameOf, useSession } from "../lib/session.js";
import { timeAgo } from "../lib/utils.js";
import { Badge, Button, Eyebrow, Meter, Skeleton } from "../ui/primitives.js";

function Masthead({ name, generatedAt }: { name: string; generatedAt?: string }) {
  return (
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
      <h1 className="mt-3 font-display text-[clamp(2rem,5vw,2.75rem)] font-semibold leading-[1.02] tracking-[-0.02em]">
        Welcome back, {name}.
      </h1>
      {generatedAt ? (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Updated {timeAgo(generatedAt)}
        </p>
      ) : null}
    </div>
  );
}

const READINESS_TONE = {
  ready: "success",
  partial: "warning",
  processing: "accent",
  not_ready: "neutral",
  empty: "neutral",
} as const;

function NotebookRow({
  notebook,
  index,
}: {
  notebook: DashboardNotebookSummary;
  index: number;
}) {
  return (
    <li className="group">
      <Link
        to="/notebooks/$notebookId"
        params={{ notebookId: notebook.id }}
        className="block border-l-2 border-transparent py-3.5 pl-4 transition-colors hover:border-accent hover:bg-accent/5"
      >
        <div className="flex items-baseline gap-3">
          <span className="w-6 shrink-0 font-display text-[13px] tabular-nums text-muted-foreground">
            {String(index + 1).padStart(2, "0")}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-[18px] font-semibold leading-tight group-hover:text-accent">
                {notebook.title}
              </h3>
              <Badge tone={READINESS_TONE[notebook.readiness]}>{notebook.readiness}</Badge>
            </div>
            <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              {notebook.modulesLabel} · {notebook.lastActivityLabel}
            </p>
            {notebook.description ? (
              <p className="mt-1.5 line-clamp-1 text-[13.5px] text-foreground/75">
                {notebook.description}
              </p>
            ) : null}
            <div className="mt-2 max-w-[280px]">
              <Meter
                value={notebook.progressPercent}
                thickness="sm"
                tone={notebook.progressPercent < 50 ? "warning" : "primary"}
              />
            </div>
          </div>
          <span className="shrink-0 self-center font-mono text-[12px] tabular-nums text-muted-foreground">
            {notebook.progressPercent}%
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 self-center text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      </Link>
    </li>
  );
}

function RailCard({
  eyebrow,
  icon: Icon,
  children,
}: {
  eyebrow: string;
  icon: typeof Clock;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius)] border border-border bg-card/60 p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-accent" />
        <Eyebrow>{eyebrow}</Eyebrow>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function StudyTimeCard({ studyTime }: { studyTime: LearnerDashboardSummary["studyTime"] }) {
  if (studyTime.status !== "ready") {
    return <p className="text-[13px] text-muted-foreground">Study time will appear as you learn.</p>;
  }
  const week = studyTime.week;
  const month = studyTime.month;
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <div className="font-display text-[24px] font-semibold leading-none">
          {week ? Math.round(week.totalMinutes / 60) : 0}
          <span className="ml-1 text-[13px] font-normal text-muted-foreground">h this wk</span>
        </div>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {week?.activeDays ?? 0} active days
        </p>
      </div>
      <div>
        <div className="font-display text-[24px] font-semibold leading-none">
          {month ? Math.round(month.totalMinutes / 60) : 0}
          <span className="ml-1 text-[13px] font-normal text-muted-foreground">h this mo</span>
        </div>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {month?.activeDays ?? 0} active days
        </p>
      </div>
    </div>
  );
}

function ActivityList({ items }: { items: DashboardRecentActivity[] }) {
  if (items.length === 0) {
    return <p className="text-[13px] text-muted-foreground">No recent activity yet.</p>;
  }
  return (
    <ul className="space-y-3">
      {items.slice(0, 5).map((item) => (
        <li key={item.id} className="border-l border-border pl-3">
          <p className="text-[13.5px] font-medium leading-snug">{item.title}</p>
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {item.notebookTitle} · {timeAgo(item.occurredAt)}
          </p>
        </li>
      ))}
    </ul>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 pb-20 pt-10">
      <Skeleton className="h-24 w-full" />
      <div className="mt-8 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <Skeleton className="h-80 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    </div>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const summaryQuery = useQuery(dashboardSummaryQueryOptions(apiClient.request));

  if (summaryQuery.isLoading) return <DashboardSkeleton />;

  const summary = summaryQuery.data;
  const name = firstNameOf(session);
  const notebooks = summary?.notebooks ?? [];
  const recommendations =
    summary?.recommendations.status === "ready" ? summary.recommendations.items : [];
  const duePractice = summary?.duePractice.status === "ready" ? summary.duePractice.items : [];

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pb-20 pt-10">
      <Masthead name={name} {...(summary?.header.generatedAt ? { generatedAt: summary.header.generatedAt } : {})} />

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        {/* Lead — notebook shelf */}
        <div>
          <div className="flex items-center justify-between">
            <Eyebrow>Your notebooks</Eyebrow>
            <Button size="sm" variant="ghost" onClick={() => navigate({ to: "/app/notebooks" })}>
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>

          {notebooks.length === 0 ? (
            <div className="mt-4 rounded-[var(--radius)] border border-dashed border-border bg-card/40 px-6 py-12 text-center">
              <GraduationCap className="mx-auto h-8 w-8 text-accent" />
              <h3 className="mt-3 font-display text-[20px] font-semibold">Start your first notebook</h3>
              <p className="mx-auto mt-1.5 max-w-sm text-[14px] text-muted-foreground">
                Bring in a source and meet a tutor that learns it with you.
              </p>
              <Button className="mt-4" onClick={() => navigate({ to: "/app/workspaces/new" })}>
                New notebook <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-border border-y border-border">
              {notebooks.map((n, i) => (
                <NotebookRow key={n.id} notebook={n} index={i} />
              ))}
            </ul>
          )}
        </div>

        {/* Rail */}
        <div className="space-y-5">
          <RailCard eyebrow="Study rhythm" icon={Clock}>
            <StudyTimeCard studyTime={summary?.studyTime ?? { status: "unavailable" }} />
          </RailCard>

          {duePractice.length > 0 ? (
            <RailCard eyebrow="Due practice" icon={CalendarClock}>
              <ul className="space-y-2.5">
                {duePractice.slice(0, 4).map((item) => (
                  <li key={item.id} className="flex items-start gap-2">
                    <Flame className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-medium leading-snug">{item.label}</p>
                      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        {item.notebookTitle}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </RailCard>
          ) : null}

          {recommendations.length > 0 ? (
            <RailCard eyebrow="Tutor suggests" icon={Sparkles}>
              <ul className="space-y-2.5">
                {recommendations.slice(0, 3).map((rec) => (
                  <li key={rec.id}>
                    <p className="text-[13.5px] font-medium leading-snug">{rec.label}</p>
                    <p className="mt-0.5 text-[12px] italic text-muted-foreground">{rec.reason}</p>
                  </li>
                ))}
              </ul>
            </RailCard>
          ) : null}

          <RailCard eyebrow="Recent activity" icon={Clock}>
            <ActivityList items={summary?.recentActivity ?? []} />
          </RailCard>
        </div>
      </div>
    </div>
  );
}
