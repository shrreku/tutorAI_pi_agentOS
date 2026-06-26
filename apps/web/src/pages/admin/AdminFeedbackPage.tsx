import { useState } from "react";
import { api } from "../../routing/api.js";
import { AdminLoadingState, AdminTable, useAdminFetch } from "./adminShared.js";

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

  return (
    <div className="tb-card">
      <h1>Feedback</h1>
      <AdminLoadingState loading={loading} error={error} />
      {data ? (
        <>
          <h2>Learning feedback</h2>
          <AdminTable>
            <thead>
              <tr>
                <th>Goal</th>
                <th>Helped</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Grant</th>
              </tr>
            </thead>
            <tbody>
              {data.learningFeedback.map((row) => (
                <tr key={row.id}>
                  <td data-ph-mask>{row.studyGoal}</td>
                  <td>{row.helped ? "Yes" : "No"}</td>
                  <td>
                    <select
                      value={row.status}
                      disabled={busyId === row.id}
                      onChange={(event) => void patchFeedback(row.id, event.target.value)}
                    >
                      {FEEDBACK_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{new Date(row.createdAt).toLocaleString()}</td>
                  <td>
                    <button
                      type="button"
                      disabled={busyId === row.id || row.status !== "reviewed"}
                      onClick={() => void grantFeedbackCredits(row.id)}
                    >
                      Grant $1 tutor credit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </AdminTable>
          <h2>Support reports</h2>
          <AdminTable>
            <thead>
              <tr>
                <th>Category</th>
                <th>Message</th>
                <th>Status</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {data.supportReports.map((row) => (
                <tr key={row.id}>
                  <td>{row.category}</td>
                  <td data-ph-mask>{row.message}</td>
                  <td>
                    <select
                      value={row.status}
                      disabled={busyId === row.id}
                      onChange={(event) => void patchSupportReport(row.id, event.target.value)}
                    >
                      {SUPPORT_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{new Date(row.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </AdminTable>
        </>
      ) : null}
    </div>
  );
}
