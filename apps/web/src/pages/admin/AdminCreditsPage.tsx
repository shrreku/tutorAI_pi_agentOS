import { useState } from "react";
import { Coins, Sparkles, Wallet, AlertOctagon } from "lucide-react";
import { api } from "../../routing/api.js";
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
import { Badge, Button, Field, Input } from "../../ui/primitives.js";
import { Reveal } from "../../ui/motion.js";

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

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function entryTone(entryType: string): "success" | "danger" | "neutral" {
  const lowered = entryType.toLowerCase();
  if (lowered.includes("debit") || lowered.includes("consume") || lowered.includes("spend")) {
    return "danger";
  }
  if (lowered.includes("credit") || lowered.includes("grant") || lowered.includes("top")) {
    return "success";
  }
  return "neutral";
}

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

  const selectClass =
    "h-10 w-full rounded-lg border border-input bg-elevated px-3 text-sm text-foreground outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-accent/30";

  return (
    <>
      <AdminPageHeader
        title="Credits"
        description="Review credit balances and adjust tutor or ingestion allowances per learner."
      />

      <AdminLoadingState loading={usersLoading} error={usersError} />

      {usersData ? (
        <Reveal className="mb-6 rounded-xl border border-border bg-card p-5 shadow-soft">
          <h2 className="font-display text-[17px] font-semibold leading-tight">Adjust credits</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Select a learner to load their ledger, then grant or deduct a balance.
          </p>
          <form
            className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
            onSubmit={(event) => void adjustCredits(event)}
          >
            <Field label="Learner">
              <select
                className={selectClass}
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
            </Field>

            <Field label="Credit type">
              <select
                className={selectClass}
                value={creditType}
                onChange={(event) => setCreditType(event.target.value as "tutor" | "ingestion")}
              >
                <option value="tutor">Tutor</option>
                <option value="ingestion">Ingestion</option>
              </select>
            </Field>

            <Field label="Amount (cents)" hint="Use a negative value to deduct.">
              <Input
                inputMode="numeric"
                value={amountCents}
                onChange={(event) => setAmountCents(event.target.value)}
              />
            </Field>

            <Field label="Reason">
              <Input value={reason} onChange={(event) => setReason(event.target.value)} />
            </Field>

            <div className="sm:col-span-2 lg:col-span-4">
              <Button type="submit" variant="primary" disabled={busy || !userId}>
                {busy ? "Adjusting…" : "Adjust credits"}
              </Button>
            </div>
          </form>
        </Reveal>
      ) : null}

      {ledgerError ? (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13.5px] text-destructive">
          <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{ledgerError}</span>
        </div>
      ) : null}

      {ledger ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <AdminStat
              label="Tutor credits"
              value={formatCents(ledger.summary.tutorCreditsCents)}
              hint="Available tutoring balance"
              icon={<Coins className="h-4 w-4" />}
            />
            <AdminStat
              label="Ingestion credits"
              value={formatCents(ledger.summary.ingestionCreditsCents)}
              hint="Available ingestion balance"
              icon={<Sparkles className="h-4 w-4" />}
            />
            <AdminStat
              label="Status"
              value={ledger.summary.exhausted ? "Exhausted" : "Active"}
              hint={ledger.summary.exhausted ? "Balance depleted" : "Credits remaining"}
              icon={<Wallet className="h-4 w-4" />}
            />
          </div>

          {ledger.summary.exhausted ? (
            <div className="flex items-center gap-2">
              <Badge tone="danger">Exhausted</Badge>
              <span className="text-[13px] text-muted-foreground">
                This learner has no remaining credits.
              </span>
            </div>
          ) : null}

          <section>
            <h2 className="mb-3 font-display text-[17px] font-semibold leading-tight">
              Ledger history
            </h2>
            {ledger.ledger.length === 0 ? (
              <AdminEmpty message="No ledger entries for this learner yet." />
            ) : (
              <AdminTable>
                <thead>
                  <tr>
                    <AdminTH>Type</AdminTH>
                    <AdminTH>Entry</AdminTH>
                    <AdminTH className="text-right">Amount</AdminTH>
                    <AdminTH>Reason</AdminTH>
                    <AdminTH>When</AdminTH>
                  </tr>
                </thead>
                <tbody>
                  {ledger.ledger.map((entry) => (
                    <tr key={entry.id}>
                      <AdminTD className="capitalize">{entry.creditType}</AdminTD>
                      <AdminTD>
                        <Badge tone={entryTone(entry.entryType)}>{entry.entryType}</Badge>
                      </AdminTD>
                      <AdminTD className="text-right font-mono tabular-nums">
                        {formatCents(entry.amountCents)}
                      </AdminTD>
                      <AdminTD className="text-muted-foreground">{entry.reason ?? "—"}</AdminTD>
                      <AdminTD className="whitespace-nowrap text-muted-foreground">
                        {new Date(entry.createdAt).toLocaleString()}
                      </AdminTD>
                    </tr>
                  ))}
                </tbody>
              </AdminTable>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
