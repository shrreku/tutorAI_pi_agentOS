import { useState } from "react";
import { Gift, Inbox, MessageSquareText, Sparkles } from "lucide-react";
import { api } from "../../routing/api.js";
import {
  AdminEmpty,
  AdminLoadingState,
  AdminPageHeader,
  AdminStat,
  AdminTable,
  AdminTD,
  AdminTH,
  useAdminFetch,
} from "./adminShared.js";
import { Badge, Button, Dot } from "../../ui/primitives.js";
import { cn } from "../../ui/cn.js";
import { Reveal } from "../../ui/motion.js";

type FeedbackRow = {
  id: string;
  userId: string;
  studyGoal: string;
  helped: number;
  status: string;
  createdAt: string;
};

type SupportRow = {
  id: string;
  userId: string;
  category: string;
  message: string;
  status: string;
  createdAt: string;
};

type FeedbackResponse = {
  learningFeedback: FeedbackRow[];
  supportReports: SupportRow[];
};

const FEEDBACK_STATUSES = ["submitted", "reviewed", "granted", "closed"] as const;
const SUPPORT_STATUSES = ["submitted", "reviewed", "closed"] as const;

function statusDotTone(status: string): "neutral" | "accent" | "success" | "warning" {
  switch (status) {
    case "submitted":
      return "accent";
    case "reviewed":
      return "warning";
    case "granted":
      return "success";
    default:
      return "neutral";
  }
}

const selectClass = cn(
  "h-8 w-full max-w-[10rem] rounded-md border border-border bg-card px-2.5 text-[13px]",
  "text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

export function AdminFeedbackPage() {
  const { data, error, loading, reload } = useAdminFetch<FeedbackResponse>("/admin/feedback");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function patchFeedback(id: string, status: string) {
    setBusyId(id);
    try {
      const res = await api(`/admin/feedback/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Update failed");
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  async function patchSupportReport(id: string, status: string) {
    setBusyId(id);
    try {
      const res = await api(`/admin/support-reports/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Update failed");
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  async function grantFeedbackCredits(id: string) {
    setBusyId(id);
    try {
      const res = await api(`/admin/feedback/${encodeURIComponent(id)}/grant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creditType: "tutor",
          amountCents: 100,
          reason: "Useful beta learning feedback",
        }),
      });
      if (!res.ok) throw new Error("Credit grant failed");
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  const learning = data?.learningFeedback ?? [];
  const support = data?.supportReports ?? [];
  const helpedCount = learning.filter((row) => row.helped).length;
  const awaitingGrant = learning.filter((row) => row.status === "reviewed").length;

  return (
    <>
      <AdminPageHeader
        title="Feedback inbox"
        description="Learning feedback and support reports from the beta. Triage status and reward useful signal."
      />

      {data ? (
        <Reveal className="mb-7 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <AdminStat
            label="Learning notes"
            value={learning.length}
            hint={`${helpedCount} marked helpful`}
            icon={<Sparkles className="h-4 w-4" />}
          />
          <AdminStat
            label="Support reports"
            value={support.length}
            icon={<MessageSquareText className="h-4 w-4" />}
          />
          <AdminStat
            label="Ready to reward"
            value={awaitingGrant}
            hint="Reviewed, awaiting credit"
            icon={<Gift className="h-4 w-4" />}
          />
        </Reveal>
      ) : null}

      <AdminLoadingState loading={loading} error={error} />

      {data ? (
        <div className="space-y-8">
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Inbox className="h-4 w-4 text-accent" />
              <h2 className="font-display text-[18px] font-semibold">Learning feedback</h2>
            </div>
            {learning.length === 0 ? (
              <AdminEmpty message="No learning feedback yet." />
            ) : (
              <AdminTable>
                <thead>
                  <tr>
                    <AdminTH>Goal</AdminTH>
                    <AdminTH>Helped</AdminTH>
                    <AdminTH>Status</AdminTH>
                    <AdminTH>Submitted</AdminTH>
                    <AdminTH className="text-right">Grant</AdminTH>
                  </tr>
                </thead>
                <tbody>
                  {learning.map((row) => (
                    <tr key={row.id} className="transition-colors hover:bg-muted/40">
                      <AdminTD className="max-w-[24rem]">
                        <span data-ph-mask className="text-foreground">
                          {row.studyGoal}
                        </span>
                      </AdminTD>
                      <AdminTD>
                        {row.helped ? (
                          <Badge tone="success">Yes</Badge>
                        ) : (
                          <Badge tone="neutral">No</Badge>
                        )}
                      </AdminTD>
                      <AdminTD>
                        <div className="flex items-center gap-2">
                          <Dot tone={statusDotTone(row.status)} />
                          <select
                            value={row.status}
                            disabled={busyId === row.id}
                            onChange={(event) => void patchFeedback(row.id, event.target.value)}
                            className={selectClass}
                            aria-label="Feedback status"
                          >
                            {FEEDBACK_STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        </div>
                      </AdminTD>
                      <AdminTD className="whitespace-nowrap text-muted-foreground">
                        {new Date(row.createdAt).toLocaleString()}
                      </AdminTD>
                      <AdminTD className="text-right">
                        <Button
                          variant="gold"
                          size="sm"
                          disabled={busyId === row.id || row.status !== "reviewed"}
                          onClick={() => void grantFeedbackCredits(row.id)}
                        >
                          <Gift className="h-3.5 w-3.5" />
                          Grant $1 tutor credit
                        </Button>
                      </AdminTD>
                    </tr>
                  ))}
                </tbody>
              </AdminTable>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2">
              <MessageSquareText className="h-4 w-4 text-accent" />
              <h2 className="font-display text-[18px] font-semibold">Support reports</h2>
            </div>
            {support.length === 0 ? (
              <AdminEmpty message="No support reports yet." />
            ) : (
              <AdminTable>
                <thead>
                  <tr>
                    <AdminTH>Category</AdminTH>
                    <AdminTH>Message</AdminTH>
                    <AdminTH>Status</AdminTH>
                    <AdminTH>Submitted</AdminTH>
                  </tr>
                </thead>
                <tbody>
                  {support.map((row) => (
                    <tr key={row.id} className="transition-colors hover:bg-muted/40">
                      <AdminTD className="whitespace-nowrap">
                        <Badge tone="outline">{row.category}</Badge>
                      </AdminTD>
                      <AdminTD className="max-w-[28rem]">
                        <span data-ph-mask className="text-foreground">
                          {row.message}
                        </span>
                      </AdminTD>
                      <AdminTD>
                        <div className="flex items-center gap-2">
                          <Dot tone={statusDotTone(row.status)} />
                          <select
                            value={row.status}
                            disabled={busyId === row.id}
                            onChange={(event) =>
                              void patchSupportReport(row.id, event.target.value)
                            }
                            className={selectClass}
                            aria-label="Support report status"
                          >
                            {SUPPORT_STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        </div>
                      </AdminTD>
                      <AdminTD className="whitespace-nowrap text-muted-foreground">
                        {new Date(row.createdAt).toLocaleString()}
                      </AdminTD>
                    </tr>
                  ))}
                </tbody>
              </AdminTable>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
