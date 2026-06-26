import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api } from "../../routing/api.js";

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

export function AdminLoadingState({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading) return <p>Loading…</p>;
  if (error) return <p className="tb-error">{error}</p>;
  return null;
}

export function AdminTable({ children }: { children: ReactNode }) {
  return (
    <div className="tb-admin-table-wrap">
      <table className="tb-admin-table">{children}</table>
    </div>
  );
}
