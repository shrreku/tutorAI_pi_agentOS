import { useState } from "react";
import { api } from "../../routing/api.js";
import { AdminLoadingState, AdminTable, useAdminFetch } from "./adminShared.js";

type AccessCodeRow = {
  id: string;
  code: string;
  codeType: string;
  grantsJson: Record<string, unknown>;
  redemptionCount: number;
  maxRedemptions: number | null;
  revokedAt: string | null;
};

type RedemptionRow = {
  id: string;
  accessCodeId: string;
  userId: string;
  redeemedAt: string;
};
type AccessCodesResponse = {
  accessCodes: AccessCodeRow[];
  redemptions: RedemptionRow[];
};

export function AdminAccessCodesPage() {
  const { data, error, loading, reload } =
    useAdminFetch<AccessCodesResponse>("/admin/access-codes");
  const [code, setCode] = useState("");
  const [codeType, setCodeType] = useState<"single_use" | "campaign">("single_use");
  const [maxRedemptions, setMaxRedemptions] = useState("10");
  const [studyAccess, setStudyAccess] = useState(true);
  const [ingestionAccess, setIngestionAccess] = useState(false);
  const [tutorCreditsCents, setTutorCreditsCents] = useState("500");
  const [ingestionCreditsCents, setIngestionCreditsCents] = useState("0");
  const [pilotTags, setPilotTags] = useState("");
  const [templateIds, setTemplateIds] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function createCode(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      const res = await api("/admin/access-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(code.trim() ? { code: code.trim() } : {}),
          codeType,
          maxRedemptions: codeType === "campaign" ? Number.parseInt(maxRedemptions, 10) : undefined,
          grants: {
            studyAccess,
            ingestionAccess,
            tutorCreditsCents: Number.parseInt(tutorCreditsCents, 10) || 0,
            ingestionCreditsCents: Number.parseInt(ingestionCreditsCents, 10) || 0,
            ...(pilotTags.trim()
              ? {
                  pilotTags: pilotTags
                    .split(",")
                    .map((tag) => tag.trim())
                    .filter(Boolean),
                }
              : {}),
            ...(templateIds.trim()
              ? {
                  templateIds: templateIds
                    .split(",")
                    .map((id) => id.trim())
                    .filter(Boolean),
                }
              : {}),
          },
        }),
      });
      const body = (await res.json()) as { message?: string };
      if (!res.ok) throw new Error(body.message ?? "Create failed");
      setCode("");
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setBusy(true);
    try {
      await api(`/admin/access-codes/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tb-card">
      <h1>Access codes</h1>
      <form className="tb-form" onSubmit={(event) => void createCode(event)}>
        <label className="tb-field">
          <span>Code (optional — auto-generated if blank)</span>
          <input
            className="tb-input"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        </label>
        <label className="tb-field">
          <span>Code type</span>
          <select
            value={codeType}
            onChange={(event) => setCodeType(event.target.value as "single_use" | "campaign")}
          >
            <option value="single_use">Single use</option>
            <option value="campaign">Campaign</option>
          </select>
        </label>
        {codeType === "campaign" ? (
          <label className="tb-field">
            <span>Max redemptions</span>
            <input
              className="tb-input"
              type="number"
              min={1}
              value={maxRedemptions}
              onChange={(event) => setMaxRedemptions(event.target.value)}
            />
          </label>
        ) : null}
        <fieldset className="tb-field">
          <legend>Grant bundle</legend>
          <label>
            <input
              type="checkbox"
              checked={studyAccess}
              onChange={(event) => setStudyAccess(event.target.checked)}
            />
            Study access
          </label>
          <label>
            <input
              type="checkbox"
              checked={ingestionAccess}
              onChange={(event) => setIngestionAccess(event.target.checked)}
            />
            Ingestion access
          </label>
          <label className="tb-field">
            <span>Tutor credits (cents)</span>
            <input
              className="tb-input"
              type="number"
              min={0}
              value={tutorCreditsCents}
              onChange={(event) => setTutorCreditsCents(event.target.value)}
            />
          </label>
          <label className="tb-field">
            <span>Ingestion credits (cents)</span>
            <input
              className="tb-input"
              type="number"
              min={0}
              value={ingestionCreditsCents}
              onChange={(event) => setIngestionCreditsCents(event.target.value)}
            />
          </label>
          <label className="tb-field">
            <span>Pilot tags (comma-separated)</span>
            <input
              className="tb-input"
              value={pilotTags}
              onChange={(event) => setPilotTags(event.target.value)}
              placeholder="pilot-a, early-access"
            />
          </label>
          <label className="tb-field">
            <span>Template IDs (comma-separated)</span>
            <input
              className="tb-input"
              value={templateIds}
              onChange={(event) => setTemplateIds(event.target.value)}
              placeholder="st_template_1"
            />
          </label>
        </fieldset>
        {formError && <p className="tb-error">{formError}</p>}
        <button type="submit" className="tb-button tb-button-primary" disabled={busy}>
          Create code
        </button>
      </form>
      <AdminLoadingState loading={loading} error={error} />
      {data ? (
        <>
          <AdminTable>
            <thead>
              <tr>
                <th>Code</th>
                <th>Type</th>
                <th>Grants</th>
                <th>Redemptions</th>
                <th>Revoked</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.accessCodes.map((row) => (
                <tr key={row.id}>
                  <td>{row.code}</td>
                  <td>{row.codeType}</td>
                  <td>
                    <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                      {JSON.stringify(row.grantsJson ?? {}, null, 0)}
                    </pre>
                  </td>
                  <td>
                    {row.redemptionCount}
                    {row.maxRedemptions != null ? ` / ${row.maxRedemptions}` : ""}
                  </td>
                  <td>{row.revokedAt ? "Yes" : "No"}</td>
                  <td>
                    {!row.revokedAt ? (
                      <button type="button" disabled={busy} onClick={() => void revoke(row.id)}>
                        Revoke
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </AdminTable>
          <h2>Recent redemptions</h2>
          <AdminTable>
            <thead>
              <tr>
                <th>Code ID</th>
                <th>User ID</th>
                <th>Redeemed</th>
              </tr>
            </thead>
            <tbody>
              {data.redemptions.map((row) => (
                <tr key={row.id}>
                  <td>{row.accessCodeId}</td>
                  <td>{row.userId}</td>
                  <td>{new Date(row.redeemedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </AdminTable>
        </>
      ) : null}
    </div>
  );
}
