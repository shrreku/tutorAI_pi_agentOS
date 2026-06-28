import type { ReactNode } from "react";
import {
  AlertTriangle,
  BookOpen,
  CreditCard,
  MessageSquare,
  UploadCloud,
  Users,
} from "lucide-react";
import { AdminLoadingState, AdminPageHeader, AdminStat, useAdminFetch } from "./adminShared.js";
import { Reveal } from "../../ui/motion.js";

type OverviewResponse = {
  counts: {
    users: number;
    activatedLearners: number;
    creditExhausted: number;
    failedIngestion: number;
    pendingFeedback: number;
  };
};

export function AdminOverviewPage() {
  const { data, error, loading } = useAdminFetch<OverviewResponse>("/admin/overview");

  const counts = data?.counts;
  const needsAttention = counts
    ? counts.creditExhausted + counts.failedIngestion + counts.pendingFeedback
    : 0;

  const tiles: { label: string; value: number; hint: string; icon: ReactNode }[] = counts
    ? [
        {
          label: "Users",
          value: counts.users,
          hint: "Total accounts on the platform",
          icon: <Users className="h-4 w-4" />,
        },
        {
          label: "Activated learners",
          value: counts.activatedLearners,
          hint: "Learners with an active workspace",
          icon: <BookOpen className="h-4 w-4" />,
        },
        {
          label: "Credit exhausted",
          value: counts.creditExhausted,
          hint: "Accounts out of credits",
          icon: <CreditCard className="h-4 w-4" />,
        },
        {
          label: "Failed ingestion",
          value: counts.failedIngestion,
          hint: "Uploads that need a retry",
          icon: <UploadCloud className="h-4 w-4" />,
        },
        {
          label: "Pending feedback",
          value: counts.pendingFeedback,
          hint: "Beta notes awaiting review",
          icon: <MessageSquare className="h-4 w-4" />,
        },
      ]
    : [];

  return (
    <div>
      <AdminPageHeader
        title="Admin overview"
        description="Monitor learners, templates, credits, ingestion, and beta feedback at a glance."
      />

      <AdminLoadingState loading={loading} error={error} />

      {counts ? (
        <div className="space-y-8">
          <Reveal className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tiles.map((tile) => (
              <AdminStat
                key={tile.label}
                label={tile.label}
                value={tile.value.toLocaleString()}
                hint={tile.hint}
                icon={tile.icon}
              />
            ))}
          </Reveal>

          <Reveal
            delay={0.05}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-gold/40 bg-gold/5 px-5 py-4"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold">
              <AlertTriangle className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0">
              {needsAttention > 0 ? (
                <p className="text-[14px]">
                  <span className="font-display text-[16px] font-semibold text-foreground">
                    {needsAttention.toLocaleString()}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    item{needsAttention === 1 ? "" : "s"} need attention across credits, ingestion,
                    and feedback.
                  </span>
                </p>
              ) : (
                <p className="text-[14px] text-muted-foreground">
                  Everything is healthy — no credit, ingestion, or feedback items need attention.
                </p>
              )}
            </div>
          </Reveal>
        </div>
      ) : null}
    </div>
  );
}
