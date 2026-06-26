import { AdminLoadingState, AdminTable, useAdminFetch } from "./adminShared.js";

type AnalyticsResponse = {
  eventCounts: Array<{ eventName: string; count: number }>;
  recentEvents: Array<{ id: string; eventName: string; userId: string | null; createdAt: string }>;
};

export function AdminAnalyticsPage() {
  const { data, error, loading } = useAdminFetch<AnalyticsResponse>("/admin/analytics/summary");

  return (
    <div className="tb-card">
      <h1>Analytics</h1>
      <p>First-party product analytics summaries.</p>
      <AdminLoadingState loading={loading} error={error} />
      {data ? (
        <>
          <AdminTable>
            <thead>
              <tr>
                <th>Event</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {data.eventCounts.map((row) => (
                <tr key={row.eventName}>
                  <td>{row.eventName}</td>
                  <td>{row.count}</td>
                </tr>
              ))}
            </tbody>
          </AdminTable>
          <h2>Recent events</h2>
          <AdminTable>
            <thead>
              <tr>
                <th>Event</th>
                <th>User</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {data.recentEvents.map((row) => (
                <tr key={row.id}>
                  <td>{row.eventName}</td>
                  <td>{row.userId ?? "—"}</td>
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
