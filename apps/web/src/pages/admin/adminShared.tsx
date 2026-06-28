import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { api } from "../../routing/api.js";
import { Skeleton } from "../../ui/primitives.js";
import { cn } from "../../ui/cn.js";

export function useAdminFetch<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api(path);
      const body = (await res.json()) as T & { message?: string };
      if (!res.ok) {
        throw new Error(body.message ?? `Request failed (${res.status})`);
      }
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload };
}

/** Page header used across every admin screen. */
export function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
      <div>
        <h1 className="font-display text-[clamp(24px,4vw,30px)] font-semibold leading-tight">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-[14px] text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function AdminLoadingState({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-5/6" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13.5px] text-destructive">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{error}</span>
      </div>
    );
  }
  return null;
}

/** A themed, card-wrapped data table. Use with AdminTH / AdminTD for consistent cells. */
export function AdminTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-soft">
      <table className="w-full border-collapse text-left text-[13.5px]">{children}</table>
    </div>
  );
}

export function AdminTH({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "border-b border-border bg-surface/60 px-4 py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function AdminTD({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <td className={cn("border-b border-border/70 px-4 py-3 align-middle", className)}>
      {children}
    </td>
  );
}

/** Small KPI tile for overview/analytics dashboards. */
export function AdminStat({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {icon ? <span className="text-accent">{icon}</span> : null}
      </div>
      <div className="mt-2 font-display text-[28px] font-semibold leading-none">{value}</div>
      {hint ? <div className="mt-1.5 text-[12.5px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

/** Centered empty state for tables with no rows. */
export function AdminEmpty({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface/40 px-6 py-12 text-center text-[14px] text-muted-foreground">
      {message}
    </div>
  );
}
