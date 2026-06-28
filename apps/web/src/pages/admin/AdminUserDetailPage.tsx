import { useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  CreditCard,
  Database,
  FileText,
  Layers,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { api } from "../../routing/api.js";
import { AdminLoadingState, AdminPageHeader, AdminStat, useAdminFetch } from "./adminShared.js";
import { Avatar, Badge, Button, Meter } from "../../ui/primitives.js";
import { Reveal } from "../../ui/motion.js";

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

function centsToDollars(cents: number): string {
  return (cents / 100).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
  });
}

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

  const studyOn = Boolean(data?.productState?.studyAccess);
  const ingestionOn = Boolean(data?.productState?.ingestionAccess);
  const adminOn = Boolean(data?.productState?.adminAccess);

  return (
    <>
      <AdminPageHeader
        title="User detail"
        description="Inspect entitlements, credit balances, and consent history for a single account."
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/users")}>
            <ArrowLeft className="h-4 w-4" />
            Back to users
          </Button>
        }
      />

      <AdminLoadingState loading={loading} error={error} />

      {data ? (
        <Reveal className="space-y-6">
          {/* Profile head */}
          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-6 shadow-soft">
            <Avatar name={data.user.displayName ?? data.user.email} className="h-14 w-14 text-lg" />
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-[22px] font-semibold leading-tight">
                {data.user.displayName ?? "Unnamed account"}
              </h2>
              <p className="truncate text-[13.5px] text-muted-foreground">{data.user.email}</p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Joined {new Date(data.user.createdAt).toLocaleDateString()}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {data.user.disabledAt ? (
                <Badge tone="danger">Disabled</Badge>
              ) : (
                <Badge tone="success">Active</Badge>
              )}
              {adminOn ? (
                <Badge tone="gold">
                  <ShieldCheck className="h-3 w-3" />
                  Admin
                </Badge>
              ) : null}
            </div>
          </div>

          {/* KPI tiles */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <AdminStat
              label="Workspaces"
              value={data.workspaceCount}
              icon={<Layers className="h-4 w-4" />}
            />
            <AdminStat
              label="Credits remaining"
              value={`${data.credits.percentRemaining}%`}
              hint={data.credits.exhausted ? "Exhausted" : "Active"}
              icon={<CreditCard className="h-4 w-4" />}
            />
            <AdminStat
              label="Consent records"
              value={data.consents.length}
              icon={<FileText className="h-4 w-4" />}
            />
          </div>

          {/* Entitlements */}
          <section className="rounded-xl border border-border bg-card p-6 shadow-soft">
            <h3 className="font-display text-[17px] font-semibold">Entitlements</h3>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Grant or revoke product access. Changes apply immediately.
            </p>
            <div className="mt-5 space-y-3">
              <EntitlementRow
                icon={<BookOpen className="h-4 w-4" />}
                label="Study access"
                enabled={studyOn}
                busy={busy}
                onToggle={() => {
                  if (studyOn && !window.confirm("Revoke Study Access for this user?")) {
                    return;
                  }
                  void patchUser({ studyAccess: !studyOn });
                }}
              />
              <EntitlementRow
                icon={<Database className="h-4 w-4" />}
                label="Ingestion access"
                enabled={ingestionOn}
                busy={busy}
                onToggle={() => {
                  if (ingestionOn && !window.confirm("Revoke Ingestion Access for this user?")) {
                    return;
                  }
                  void patchUser({ ingestionAccess: !ingestionOn });
                }}
              />
            </div>
          </section>

          {/* Credits */}
          <section className="rounded-xl border border-border bg-card p-6 shadow-soft">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-[17px] font-semibold">Credits</h3>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  {data.credits.percentRemaining}% remaining ·{" "}
                  {data.credits.exhausted ? (
                    <span className="text-destructive">exhausted</span>
                  ) : (
                    <span className="text-accent">active</span>
                  )}
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() =>
                  void api(`/admin/credits/${encodeURIComponent(userId)}`).then(() =>
                    navigate("/admin/credits"),
                  )
                }
              >
                <CreditCard className="h-4 w-4" />
                View credit ledger
              </Button>
            </div>
            <div className="mt-4">
              <Meter
                value={data.credits.percentRemaining}
                tone={data.credits.exhausted ? "warning" : "primary"}
              />
            </div>
            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-border/70 bg-surface/40 p-4">
                <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Tutor credits
                </dt>
                <dd className="mt-1 font-display text-[20px] font-semibold">
                  {centsToDollars(data.credits.tutorCreditsCents)}
                </dd>
              </div>
              <div className="rounded-lg border border-border/70 bg-surface/40 p-4">
                <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Ingestion credits
                </dt>
                <dd className="mt-1 font-display text-[20px] font-semibold">
                  {centsToDollars(data.credits.ingestionCreditsCents)}
                </dd>
              </div>
            </dl>
          </section>

          {/* Consent history */}
          <section className="rounded-xl border border-border bg-card p-6 shadow-soft">
            <h3 className="font-display text-[17px] font-semibold">Consent history</h3>
            {data.consents.length === 0 ? (
              <p className="mt-3 text-[13.5px] text-muted-foreground">No consent records.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {data.consents.map((consent) => (
                  <li
                    key={`${consent.consentVersion}-${consent.acceptedAt}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-surface/40 px-4 py-2.5 text-[13.5px]"
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <CheckCircle2 className="h-4 w-4 text-accent" />
                      {consent.consentVersion}
                    </span>
                    <span className="text-muted-foreground">
                      {new Date(consent.acceptedAt).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </Reveal>
      ) : null}
    </>
  );
}

function EntitlementRow({
  icon,
  label,
  enabled,
  busy,
  onToggle,
}: {
  icon: React.ReactNode;
  label: string;
  enabled: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-surface/40 px-4 py-3">
      <span className="flex items-center gap-2.5 text-[14px] font-medium">
        <span className="text-accent">{icon}</span>
        {label}
      </span>
      <div className="flex items-center gap-3">
        {enabled ? (
          <Badge tone="success">
            <CheckCircle2 className="h-3 w-3" />
            Granted
          </Badge>
        ) : (
          <Badge tone="neutral">
            <XCircle className="h-3 w-3" />
            Not granted
          </Badge>
        )}
        <Button
          variant={enabled ? "danger" : "primary"}
          size="sm"
          disabled={busy}
          onClick={onToggle}
        >
          {enabled ? "Revoke" : "Grant"}
        </Button>
      </div>
    </div>
  );
}
