import { useEffect } from "react";
import { PublicLayout } from "./PublicLayout.js";
import { useSession } from "../../routing/RouteGuards.js";

export function AuthCallbackPage({ navigate }: { navigate: (path: string) => void }) {
  const { refresh } = useSession();

  useEffect(() => {
    void (async () => {
      await refresh();
      navigate("/app");
    })();
  }, [navigate, refresh]);

  return (
    <PublicLayout navigate={navigate}>
      <div className="tb-card">
        <h1>Signing you in…</h1>
        <p>Completing authentication and redirecting to your dashboard.</p>
      </div>
    </PublicLayout>
  );
}
