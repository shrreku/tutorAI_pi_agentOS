import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { CreditCard, KeyRound, LifeBuoy, ShieldCheck, User } from "lucide-react";
import {
  ACCOUNT_TAB_LABELS,
  type AccountTab,
} from "../../features/account/account-tabs.js";
import { apiClient } from "../../platform/api-client.js";
import { creditsPercentOf, displayNameOf, useSession } from "../lib/session.js";
import { Avatar, Badge, Button, Eyebrow, Meter, Ring } from "../ui/primitives.js";

const TAB_ORDER: AccountTab[] = ["overview", "credits", "access-code", "support", "data"];

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius)] border border-border bg-card/60 p-5">
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2 className="mt-1 font-display text-[18px] font-semibold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function OverviewTab() {
  const { data: session } = useSession();
  const name = displayNameOf(session);
  const ent = session?.entitlements;
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4 rounded-[var(--radius)] border border-border bg-card/60 p-5">
        <Avatar name={name} className="h-14 w-14 text-[16px]" />
        <div className="min-w-0">
          <h2 className="font-display text-[22px] font-semibold leading-tight">{name}</h2>
          <p className="truncate text-[13.5px] text-muted-foreground">{session?.user?.email}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ent?.studyAccess ? <Badge tone="success">Study access</Badge> : null}
            {ent?.ingestionAccess ? <Badge tone="accent">Ingestion</Badge> : null}
            {ent?.adminAccess ? <Badge tone="primary">Admin</Badge> : null}
            {session?.consentAccepted ? <Badge tone="neutral">Consent accepted</Badge> : null}
          </div>
        </div>
      </div>
      <Section eyebrow="Profile" title="Account details">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Name</dt>
            <dd className="mt-0.5 text-[14px]">{name}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Email</dt>
            <dd className="mt-0.5 text-[14px]">{session?.user?.email ?? "—"}</dd>
          </div>
        </dl>
      </Section>
    </div>
  );
}

function CreditsTab() {
  const { data: session } = useSession();
  const pct = creditsPercentOf(session);
  const exhausted = session?.credits?.exhausted ?? false;
  return (
    <div className="space-y-5">
      <Section eyebrow="Tutor credits" title="Your balance">
        <div className="flex items-center gap-6">
          <Ring value={pct ?? 0} size={92} label={`${pct ?? 0}%`} sublabel="remaining" />
          <div className="min-w-0 flex-1">
            <Meter value={pct ?? 0} tone={exhausted ? "danger" : "accent"} thickness="lg" />
            <p className="mt-3 text-[13.5px] text-muted-foreground">
              {exhausted
                ? "You're out of tutor credits. Reading your materials and browsing the study map stay free."
                : "Credits meter AI tutor turns. Reading, browsing the study map, and reviewing practice never consume credits."}
            </p>
          </div>
        </div>
      </Section>
    </div>
  );
}

function AccessCodeTab() {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<{ kind: "idle" | "ok" | "error"; message?: string }>({
    kind: "idle",
  });
  const [pending, setPending] = useState(false);

  const redeem = async () => {
    if (!code.trim()) return;
    setPending(true);
    setStatus({ kind: "idle" });
    try {
      const res = await apiClient.request("/access-codes/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (!res.ok) throw new Error(`Could not redeem (${res.status})`);
      setStatus({ kind: "ok", message: "Access code applied." });
      setCode("");
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : "Failed to redeem" });
    } finally {
      setPending(false);
    }
  };

  return (
    <Section eyebrow="Access" title="Redeem an access code">
      <p className="text-[13.5px] text-muted-foreground">
        Enter a code shared by your cohort or instructor to unlock features and templates.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void redeem()}
          placeholder="ACCESS-CODE"
          className="min-w-[220px] flex-1 rounded-[var(--radius)] border border-border bg-elevated px-3 py-2 font-mono text-[14px] uppercase tracking-wider outline-none focus:border-accent"
        />
        <Button onClick={() => void redeem()} disabled={pending || !code.trim()}>
          {pending ? "Redeeming…" : "Redeem"}
        </Button>
      </div>
      {status.kind === "ok" ? (
        <p className="mt-3 rounded-[var(--radius)] bg-success/12 px-3 py-2 text-[13px] text-success">
          {status.message}
        </p>
      ) : null}
      {status.kind === "error" ? (
        <p className="mt-3 rounded-[var(--radius)] bg-destructive/12 px-3 py-2 text-[13px] text-destructive">
          {status.message}
        </p>
      ) : null}
    </Section>
  );
}

function SupportTab() {
  return (
    <Section eyebrow="Help" title="Support">
      <p className="text-[13.5px] text-muted-foreground">
        Questions, bugs, or feedback during the beta? We read every note.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href="mailto:support@tutorbook.app">
          <Button variant="accent">
            <LifeBuoy className="h-4 w-4" /> Email support
          </Button>
        </a>
        <Link to="/contact">
          <Button variant="outline">Contact form</Button>
        </Link>
      </div>
    </Section>
  );
}

function DataTab() {
  const { data: session } = useSession();
  return (
    <div className="space-y-5">
      <Section eyebrow="Privacy" title="Your data">
        <p className="text-[13.5px] text-muted-foreground">
          Consent {session?.consentAccepted ? "accepted" : "pending"}
          {session?.consentVersion ? ` · version ${session.consentVersion}` : ""}. Review how your
          sources and study data are used.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to="/privacy">
            <Button variant="outline">Privacy policy</Button>
          </Link>
          <Link to="/terms">
            <Button variant="outline">Terms</Button>
          </Link>
        </div>
      </Section>
      <Section title="Delete account">
        <p className="text-[13.5px] text-muted-foreground">
          Request deletion of your account and study data. This is permanent.
        </p>
        <a href="mailto:support@tutorbook.app?subject=Account%20deletion%20request" className="mt-3 inline-block">
          <Button variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10">
            Request deletion
          </Button>
        </a>
      </Section>
    </div>
  );
}

const TAB_ICON: Record<AccountTab, typeof User> = {
  overview: User,
  credits: CreditCard,
  "access-code": KeyRound,
  support: LifeBuoy,
  data: ShieldCheck,
};

export function AccountPage({ tab }: { tab: AccountTab }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 pb-20 pt-10">
      <Eyebrow>Account &amp; settings</Eyebrow>
      <h1 className="mt-2 font-display text-[clamp(1.9rem,4vw,2.5rem)] font-semibold leading-tight tracking-[-0.02em]">
        {ACCOUNT_TAB_LABELS[tab]}
      </h1>

      <div className="folio-account-tabs">
        {TAB_ORDER.map((key) => {
          const Icon = TAB_ICON[key];
          return (
            <Link
              key={key}
              to="/app/account/$tab"
              params={{ tab: key }}
              className="folio-account-tab"
              data-active={tab === key}
            >
              <Icon className="mr-1 inline h-3 w-3" />
              {ACCOUNT_TAB_LABELS[key]}
            </Link>
          );
        })}
      </div>

      <div className="mt-6">
        {tab === "overview" ? <OverviewTab /> : null}
        {tab === "credits" ? <CreditsTab /> : null}
        {tab === "access-code" ? <AccessCodeTab /> : null}
        {tab === "support" ? <SupportTab /> : null}
        {tab === "data" ? <DataTab /> : null}
      </div>
    </div>
  );
}
