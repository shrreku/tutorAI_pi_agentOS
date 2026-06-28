import { createFileRoute } from "@tanstack/react-router";
import { accountTabSchema, type AccountTab } from "../../../features/account/account-tabs.js";
import { AccountPage } from "../../../folio/pages/account.js";

export const Route = createFileRoute("/_learner/app/account/$tab")({
  params: {
    parse: (raw) => ({ tab: accountTabSchema.parse(raw.tab) }),
    stringify: ({ tab }) => ({ tab }),
  },
  component: AccountRoute,
});

function AccountRoute() {
  const { tab } = Route.useParams() as { tab: AccountTab };
  return <AccountPage tab={tab} />;
}
