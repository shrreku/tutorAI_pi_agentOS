import { useState } from "react";
import { api } from "../../routing/api.js";
import { AdminLoadingState, useAdminFetch } from "./adminShared.js";

type UserDetailResponse = {
  user: {
    id: string;
    email: string;
    displayName: string | null;
    disabledAt: string | null;
    createdAt: string;
  };
  productState: {
    studyAccess: number;
    ingestionAccess: number;
    adminAccess: number;
  } | null;
  credits: {
    percentRemaining: number;
    exhausted: boolean;
    tutorCreditsCents: number;
    ingestionCreditsCents: number;
  };
  workspaceCount: number;
  consents: Array<{ consentVersion: string; acceptedAt: string }>;
};

export function AdminUserDetailPage({
  userId,
  navigate,
}: {
  userId: string;
  navigate: (path: string) => void;
}) {
  const { data, error, loading, reload } = useAdminFetch<UserDetailResponse>(
    `/admin/users/${encodeURIComponent(userId)}`,
  );
  const [busy, setBusy] = useState(false);

  async function patchUser(body: Record<string, boolean>) {
    setBusy(true);
    try {
      const res = await api(`/admin/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error("User update failed");
      }
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tb-card">
      <button type="button" className="tb-button" onClick={() => navigate("/admin/users")}>
        ← Back to users
      </button>
      <h1>User detail</h1>
      <AdminLoadingState loading={loading} error={error} />
      {data ? (
        <dl className="tb-admin-detail">
          <div>
            <dt>Email</dt>
            <dd>{data.user.email}</dd>
          </div>
          <div>
            <dt>Display name</dt>
            <dd>{data.user.displayName ?? "—"}</dd>
          </div>
          <div>
            <dt>Disabled</dt>
            <dd>{data.user.disabledAt ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt>Study access</dt>
            <dd>{data.productState?.studyAccess ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt>Ingestion access</dt>
            <dd>{data.productState?.ingestionAccess ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt>Admin access</dt>
            <dd>{data.productState?.adminAccess ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt>Workspaces</dt>
            <dd>{data.workspaceCount}</dd>
          </div>
          <div>
            <dt>Credits remaining</dt>
            <dd>
              {data.credits.percentRemaining}% ({data.credits.exhausted ? "exhausted" : "active"})
            </dd>
          </div>
          <div>
            <dt>Consent history</dt>
            <dd>
              {data.consents.length === 0
                ? "None"
                : data.consents.map((consent) => (
                    <div key={`${consent.consentVersion}-${consent.acceptedAt}`}>
                      {consent.consentVersion} · {new Date(consent.acceptedAt).toLocaleString()}
                    </div>
                  ))}
            </dd>
          </div>
        </dl>
      ) : null}
      <div className="tb-actions">
        {data ? (
          <>
            <button
              type="button"
              className="tb-button"
              disabled={busy}
              onClick={() => void patchUser({ studyAccess: !data.productState?.studyAccess })}
            >
              {data.productState?.studyAccess ? "Revoke Study Access" : "Grant Study Access"}
            </button>
            <button
              type="button"
              className="tb-button"
              disabled={busy}
              onClick={() => void patchUser({ ingestionAccess: !data.productState?.ingestionAccess })}
            >
              {data.productState?.ingestionAccess ? "Revoke Ingestion Access" : "Grant Ingestion Access"}
            </button>
          </>
        ) : null}
        <button
          type="button"
          className="tb-button tb-button-primary"
          onClick={() => void api(`/admin/credits/${encodeURIComponent(userId)}`).then(() => navigate("/admin/credits"))}
        >
          View credit ledger
        </button>
      </div>
    </div>
  );
}
