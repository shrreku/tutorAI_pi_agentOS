import { AdminLoadingState } from "./adminShared.js";
import { useAdminFetch } from "./adminShared.js";

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

  return (
    <div className="tb-card">
      <h1>Admin overview</h1>
      <p>Monitor learners, templates, credits, ingestion, and beta feedback.</p>
      <AdminLoadingState loading={loading} error={error} />
      {data ? (
        <dl className="tb-admin-stats">
          <div><dt>Users</dt><dd>{data.counts.users}</dd></div>
          <div><dt>Activated learners</dt><dd>{data.counts.activatedLearners}</dd></div>
          <div><dt>Credit exhausted</dt><dd>{data.counts.creditExhausted}</dd></div>
          <div><dt>Failed ingestion</dt><dd>{data.counts.failedIngestion}</dd></div>
          <div><dt>Pending feedback</dt><dd>{data.counts.pendingFeedback}</dd></div>
        </dl>
      ) : null}
    </div>
  );
}
