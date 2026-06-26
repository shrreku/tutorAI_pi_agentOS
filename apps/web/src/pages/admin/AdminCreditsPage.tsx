import { useState } from "react";
import { api } from "../../routing/api.js";
import { AdminLoadingState, AdminTable, useAdminFetch } from "./adminShared.js";

type UserRow = { id: string; email: string };

type UsersResponse = { users: UserRow[] };

type CreditSummary = {
  tutorCreditsCents: number;
  ingestionCreditsCents: number;
  exhausted: boolean;
};

type CreditsResponse = {
  userId: string;
  summary: CreditSummary;
  ledger: Array<{
    id: string;
    creditType: string;
    entryType: string;
    amountCents: number;
    reason: string | null;
    createdAt: string;
  }>;
};

export function AdminCreditsPage() {
  const {
    data: usersData,
    error: usersError,
    loading: usersLoading,
  } = useAdminFetch<UsersResponse>("/admin/users");
  const [userId, setUserId] = useState("");
  const [amountCents, setAmountCents] = useState("100");
  const [creditType, setCreditType] = useState<"tutor" | "ingestion">("tutor");
  const [reason, setReason] = useState("admin_top_up");
  const [ledger, setLedger] = useState<CreditsResponse | null>(null);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadLedger(selectedUserId: string) {
    setLedgerError(null);
    const res = await api(`/admin/credits/${encodeURIComponent(selectedUserId)}`);
    const body = (await res.json()) as CreditsResponse & { message?: string };
    if (!res.ok) {
      setLedgerError(body.message ?? "Failed to load credits");
      setLedger(null);
      return;
    }
    setLedger(body);
  }

  async function adjustCredits(event: React.FormEvent) {
    event.preventDefault();
    if (!userId) return;
    setBusy(true);
    try {
      const res = await api(`/admin/credits/${encodeURIComponent(userId)}/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creditType,
          amountCents: Number.parseInt(amountCents, 10),
          reason,
        }),
      });
      if (!res.ok) throw new Error("Adjustment failed");
      await loadLedger(userId);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tb-card">
      <h1>Credits</h1>
      <AdminLoadingState loading={usersLoading} error={usersError} />
      {usersData ? (
        <div className="tb-form">
          <label>
            Learner
            <select
              className="tb-input"
              value={userId}
              onChange={(event) => {
                setUserId(event.target.value);
                if (event.target.value) void loadLedger(event.target.value);
              }}
            >
              <option value="">Select user</option>
              {usersData.users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.email}
                </option>
              ))}
            </select>
          </label>
          <label>
            Credit type
            <select
              className="tb-input"
              value={creditType}
              onChange={(event) => setCreditType(event.target.value as "tutor" | "ingestion")}
            >
              <option value="tutor">Tutor</option>
              <option value="ingestion">Ingestion</option>
            </select>
          </label>
          <label>
            Amount (cents)
            <input
              className="tb-input"
              value={amountCents}
              onChange={(event) => setAmountCents(event.target.value)}
            />
          </label>
          <label>
            Reason
            <input
              className="tb-input"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="tb-button tb-button-primary"
            disabled={busy || !userId}
            onClick={(event) => void adjustCredits(event)}
          >
            Adjust credits
          </button>
        </div>
      ) : null}
      {ledgerError ? <p className="tb-error">{ledgerError}</p> : null}
      {ledger ? (
        <>
          <p>
            Tutor: {ledger.summary.tutorCreditsCents}¢ · Ingestion:{" "}
            {ledger.summary.ingestionCreditsCents}¢{ledger.summary.exhausted ? " · Exhausted" : ""}
          </p>
          <AdminTable>
            <thead>
              <tr>
                <th>Type</th>
                <th>Entry</th>
                <th>Amount</th>
                <th>Reason</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {ledger.ledger.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.creditType}</td>
                  <td>{entry.entryType}</td>
                  <td>{entry.amountCents}</td>
                  <td>{entry.reason ?? "—"}</td>
                  <td>{new Date(entry.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </AdminTable>
        </>
      ) : null}
    </div>
  );
}
