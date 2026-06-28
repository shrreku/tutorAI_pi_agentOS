import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ACCOUNT_TAB_LABELS,
  accountTabSchema,
  type AccountTab,
} from "../../../features/account/account-tabs.js";

export const Route = createFileRoute("/_learner/app/account/$tab")({
  params: {
    parse: (raw) => ({ tab: accountTabSchema.parse(raw.tab) }),
    stringify: ({ tab }) => ({ tab }),
  },
  component: AccountPage,
});

function AccountPage() {
  const { tab } = Route.useParams() as { tab: AccountTab };

  return (
    <section>
      <h1>Account</h1>
      <nav aria-label="Account sections">
        {(Object.keys(ACCOUNT_TAB_LABELS) as AccountTab[]).map((key) => (
          <span key={key} style={{ marginRight: "0.75rem" }}>
            <Link to="/app/account/$tab" params={{ tab: key }}>
              {ACCOUNT_TAB_LABELS[key]}
              {tab === key ? " (active)" : ""}
            </Link>
          </span>
        ))}
      </nav>
      <div className="folio-placeholder">
        {ACCOUNT_TAB_LABELS[tab]} — F04/F05/F06 wire real account flows.
      </div>
    </section>
  );
}
