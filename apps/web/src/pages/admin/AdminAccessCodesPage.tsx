import { useState } from "react";
import { KeyRound, Ticket, Ban, Plus, History, Gift } from "lucide-react";
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
import { Badge, Button, Field, Input, Segmented } from "../../ui/primitives.js";
import { Reveal } from "../../ui/motion.js";

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

function GrantPills({ grants }: { grants: Record<string, unknown> }) {
  const pills: Array<{ key: string; label: string; tone: "primary" | "accent" | "gold" }> = [];
  if (grants.studyAccess) pills.push({ key: "study", label: "Study", tone: "primary" });
  if (grants.ingestionAccess) pills.push({ key: "ingestion", label: "Ingestion", tone: "accent" });
  const tutor = typeof grants.tutorCreditsCents === "number" ? grants.tutorCreditsCents : 0;
  const ingest =
    typeof grants.ingestionCreditsCents === "number" ? grants.ingestionCreditsCents : 0;
  if (tutor > 0)
    pills.push({ key: "tutor", label: `Tutor $${(tutor / 100).toFixed(2)}`, tone: "gold" });
  if (ingest > 0)
    pills.push({ key: "ic", label: `Ingest $${(ingest / 100).toFixed(2)}`, tone: "gold" });
  const tags = Array.isArray(grants.pilotTags) ? (grants.pilotTags as unknown[]) : [];
  const templates = Array.isArray(grants.templateIds) ? (grants.templateIds as unknown[]) : [];

  if (pills.length === 0 && tags.length === 0 && templates.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {pills.map((p) => (
        <Badge key={p.key} tone={p.tone}>
          {p.label}
        </Badge>
      ))}
      {tags.map((t, i) => (
        <Badge key={`tag-${i}`} tone="outline">
          {String(t)}
        </Badge>
      ))}
      {templates.map((t, i) => (
        <Badge key={`tpl-${i}`} tone="neutral">
          {String(t)}
        </Badge>
      ))}
    </div>
  );
}

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
    if (!window.confirm("Revoke this access code? It can no longer be redeemed.")) return;
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

  const codes = data?.accessCodes ?? [];
  const redemptions = data?.redemptions ?? [];
  const activeCount = codes.filter((c) => !c.revokedAt).length;
  const totalRedemptions = codes.reduce((sum, c) => sum + c.redemptionCount, 0);

  return (
    <div>
      <AdminPageHeader
        title="Access codes"
        description="Issue single-use or campaign codes that grant study access, ingestion, and credit bundles."
      />

      {data ? (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <AdminStat
            label="Active codes"
            value={activeCount}
            hint={`${codes.length} total issued`}
            icon={<Ticket className="h-4 w-4" />}
          />
          <AdminStat
            label="Total redemptions"
            value={totalRedemptions}
            hint="Across all codes"
            icon={<Gift className="h-4 w-4" />}
          />
          <AdminStat
            label="Recent redemptions"
            value={redemptions.length}
            hint="Latest activity"
            icon={<History className="h-4 w-4" />}
          />
        </div>
      ) : null}

      <Reveal className="mb-8 rounded-xl border border-border bg-card p-6 shadow-soft">
        <div className="mb-5 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-accent" />
          <h2 className="font-display text-[18px] font-semibold leading-tight">Create a code</h2>
        </div>
        <form className="space-y-5" onSubmit={(event) => void createCode(event)}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Code" hint="Optional — auto-generated if left blank.">
              <Input value={code} onChange={(event) => setCode(event.target.value)} />
            </Field>
            <Field label="Code type">
              <Segmented<"single_use" | "campaign">
                value={codeType}
                onChange={setCodeType}
                options={[
                  { value: "single_use", label: "Single use" },
                  { value: "campaign", label: "Campaign" },
                ]}
              />
            </Field>
          </div>

          {codeType === "campaign" ? (
            <Field label="Max redemptions">
              <Input
                type="number"
                min={1}
                value={maxRedemptions}
                onChange={(event) => setMaxRedemptions(event.target.value)}
                className="sm:max-w-xs"
              />
            </Field>
          ) : null}

          <fieldset className="rounded-lg border border-border bg-surface/40 p-4">
            <legend className="px-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Grant bundle
            </legend>
            <div className="mb-4 flex flex-wrap gap-5">
              <label className="flex items-center gap-2 text-[13.5px] text-foreground">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--primary)]"
                  checked={studyAccess}
                  onChange={(event) => setStudyAccess(event.target.checked)}
                />
                Study access
              </label>
              <label className="flex items-center gap-2 text-[13.5px] text-foreground">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--primary)]"
                  checked={ingestionAccess}
                  onChange={(event) => setIngestionAccess(event.target.checked)}
                />
                Ingestion access
              </label>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Tutor credits (cents)">
                <Input
                  type="number"
                  min={0}
                  value={tutorCreditsCents}
                  onChange={(event) => setTutorCreditsCents(event.target.value)}
                />
              </Field>
              <Field label="Ingestion credits (cents)">
                <Input
                  type="number"
                  min={0}
                  value={ingestionCreditsCents}
                  onChange={(event) => setIngestionCreditsCents(event.target.value)}
                />
              </Field>
              <Field label="Pilot tags" hint="Comma-separated.">
                <Input
                  value={pilotTags}
                  onChange={(event) => setPilotTags(event.target.value)}
                  placeholder="pilot-a, early-access"
                />
              </Field>
              <Field label="Template IDs" hint="Comma-separated.">
                <Input
                  value={templateIds}
                  onChange={(event) => setTemplateIds(event.target.value)}
                  placeholder="st_template_1"
                />
              </Field>
            </div>
          </fieldset>

          {formError ? <p className="text-[13.5px] text-destructive">{formError}</p> : null}

          <div className="flex justify-end">
            <Button type="submit" variant="primary" disabled={busy}>
              <Plus className="h-4 w-4" />
              Create code
            </Button>
          </div>
        </form>
      </Reveal>

      <AdminLoadingState loading={loading} error={error} />

      {data ? (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 font-display text-[18px] font-semibold leading-tight">
              Issued codes
            </h2>
            {codes.length === 0 ? (
              <AdminEmpty message="No access codes issued yet." />
            ) : (
              <AdminTable>
                <thead>
                  <tr>
                    <AdminTH>Code</AdminTH>
                    <AdminTH>Type</AdminTH>
                    <AdminTH>Grants</AdminTH>
                    <AdminTH>Redemptions</AdminTH>
                    <AdminTH>Status</AdminTH>
                    <AdminTH className="text-right">Actions</AdminTH>
                  </tr>
                </thead>
                <tbody>
                  {codes.map((row) => (
                    <tr key={row.id} className="transition-colors hover:bg-surface/40">
                      <AdminTD>
                        <span className="font-mono text-[13px] text-foreground">{row.code}</span>
                      </AdminTD>
                      <AdminTD>
                        <Badge tone={row.codeType === "campaign" ? "accent" : "neutral"}>
                          {row.codeType}
                        </Badge>
                      </AdminTD>
                      <AdminTD>
                        <GrantPills grants={row.grantsJson ?? {}} />
                      </AdminTD>
                      <AdminTD>
                        <span className="font-mono text-[13px]">
                          {row.redemptionCount}
                          {row.maxRedemptions != null ? (
                            <span className="text-muted-foreground"> / {row.maxRedemptions}</span>
                          ) : null}
                        </span>
                      </AdminTD>
                      <AdminTD>
                        {row.revokedAt ? (
                          <Badge tone="danger">Revoked</Badge>
                        ) : (
                          <Badge tone="success">Active</Badge>
                        )}
                      </AdminTD>
                      <AdminTD className="text-right">
                        {!row.revokedAt ? (
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            disabled={busy}
                            onClick={() => void revoke(row.id)}
                          >
                            <Ban className="h-3.5 w-3.5" />
                            Revoke
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </AdminTD>
                    </tr>
                  ))}
                </tbody>
              </AdminTable>
            )}
          </section>

          <section>
            <h2 className="mb-3 font-display text-[18px] font-semibold leading-tight">
              Recent redemptions
            </h2>
            {redemptions.length === 0 ? (
              <AdminEmpty message="No redemptions recorded yet." />
            ) : (
              <AdminTable>
                <thead>
                  <tr>
                    <AdminTH>Code ID</AdminTH>
                    <AdminTH>User ID</AdminTH>
                    <AdminTH>Redeemed</AdminTH>
                  </tr>
                </thead>
                <tbody>
                  {redemptions.map((row) => (
                    <tr key={row.id} className="transition-colors hover:bg-surface/40">
                      <AdminTD>
                        <span className="font-mono text-[12.5px] text-muted-foreground">
                          {row.accessCodeId}
                        </span>
                      </AdminTD>
                      <AdminTD>
                        <span className="font-mono text-[12.5px] text-muted-foreground">
                          {row.userId}
                        </span>
                      </AdminTD>
                      <AdminTD>{new Date(row.redeemedAt).toLocaleString()}</AdminTD>
                    </tr>
                  ))}
                </tbody>
              </AdminTable>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
