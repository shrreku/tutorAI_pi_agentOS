import { Activity, BarChart3, RefreshCw, Users } from "lucide-react";
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
import { Badge, Button } from "../../ui/primitives.js";
import { Reveal } from "../../ui/motion.js";

type AnalyticsResponse = {
  eventCounts: Array<{ eventName: string; count: number }>;
  recentEvents: Array<{ id: string; eventName: string; userId: string | null; createdAt: string }>;
};

export function AdminAnalyticsPage() {
  const { data, error, loading, reload } = useAdminFetch<AnalyticsResponse>(
    "/admin/analytics/summary",
  );

  const eventCounts = data?.eventCounts ?? [];
  const recentEvents = data?.recentEvents ?? [];

  const totalEvents = eventCounts.reduce((sum, row) => sum + row.count, 0);
  const distinctEvents = eventCounts.length;
  const topEvent = eventCounts.reduce<{ eventName: string; count: number } | null>(
    (best, row) => (best === null || row.count > best.count ? row : best),
    null,
  );
  const maxCount = topEvent?.count ?? 0;
  const uniqueUsers = new Set(
    recentEvents.map((row) => row.userId).filter((id): id is string => id !== null),
  ).size;

  return (
    <>
      <AdminPageHeader
        title="Analytics"
        description="First-party product analytics summaries across every workspace event."
        actions={
          <Button variant="outline" size="sm" onClick={() => void reload()} disabled={loading}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        }
      />

      <AdminLoadingState loading={loading} error={error} />

      {data ? (
        <div className="space-y-8">
          <Reveal>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <AdminStat
                label="Total events"
                value={totalEvents.toLocaleString()}
                hint="All recorded events"
                icon={<Activity className="h-4 w-4" />}
              />
              <AdminStat
                label="Event types"
                value={distinctEvents.toLocaleString()}
                hint="Distinct event names"
                icon={<BarChart3 className="h-4 w-4" />}
              />
              <AdminStat
                label="Top event"
                value={topEvent ? topEvent.count.toLocaleString() : "—"}
                {...(topEvent ? { hint: topEvent.eventName } : {})}
                icon={<BarChart3 className="h-4 w-4" />}
              />
              <AdminStat
                label="Active users"
                value={uniqueUsers.toLocaleString()}
                hint="In recent activity"
                icon={<Users className="h-4 w-4" />}
              />
            </div>
          </Reveal>

          <Reveal delay={0.05}>
            <section className="space-y-3">
              <h2 className="font-display text-[18px] font-semibold leading-tight">
                Events by type
              </h2>
              {eventCounts.length === 0 ? (
                <AdminEmpty message="No events recorded yet." />
              ) : (
                <div className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-soft">
                  {eventCounts.map((row) => {
                    const pct = maxCount > 0 ? Math.round((row.count / maxCount) * 100) : 0;
                    return (
                      <div key={row.eventName} className="space-y-1.5">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="truncate font-mono text-[12.5px] text-foreground">
                            {row.eventName}
                          </span>
                          <span className="shrink-0 font-display text-[14px] font-semibold tabular-nums text-foreground">
                            {row.count.toLocaleString()}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-surface">
                          <div
                            className="h-full rounded-full bg-primary transition-[width] duration-500"
                            style={{ width: `${Math.max(pct, 2)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </Reveal>

          <Reveal delay={0.1}>
            <section className="space-y-3">
              <h2 className="font-display text-[18px] font-semibold leading-tight">
                Recent events
              </h2>
              {recentEvents.length === 0 ? (
                <AdminEmpty message="No recent events." />
              ) : (
                <AdminTable>
                  <thead>
                    <tr>
                      <AdminTH>Event</AdminTH>
                      <AdminTH>User</AdminTH>
                      <AdminTH className="text-right">When</AdminTH>
                    </tr>
                  </thead>
                  <tbody>
                    {recentEvents.map((row) => (
                      <tr key={row.id}>
                        <AdminTD>
                          <Badge tone="neutral">{row.eventName}</Badge>
                        </AdminTD>
                        <AdminTD>
                          {row.userId ? (
                            <span className="font-mono text-[12.5px] text-foreground">
                              {row.userId}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </AdminTD>
                        <AdminTD className="text-right text-muted-foreground">
                          {new Date(row.createdAt).toLocaleString()}
                        </AdminTD>
                      </tr>
                    ))}
                  </tbody>
                </AdminTable>
              )}
            </section>
          </Reveal>
        </div>
      ) : null}
    </>
  );
}
