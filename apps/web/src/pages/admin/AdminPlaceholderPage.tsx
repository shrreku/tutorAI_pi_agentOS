import type { AdminPage } from "../../routing/routes.js";

const LABELS: Record<Exclude<AdminPage, "overview">, string> = {
  users: "Users",
  "user-detail": "User detail",
  workspaces: "Workspaces",
  "workspace-detail": "Workspace detail",
  templates: "Templates",
  "access-codes": "Access codes",
  credits: "Credits",
  feedback: "Feedback",
  ingestion: "Ingestion",
  analytics: "Analytics",
  "account-deletion": "Account deletion",
};

export function AdminPlaceholderPage({ section }: { section: Exclude<AdminPage, "overview"> }) {
  return (
    <div className="tb-card">
      <h1>{LABELS[section]}</h1>
      <p>Admin tools for {LABELS[section].toLowerCase()} will be implemented in upcoming hosted beta tickets.</p>
    </div>
  );
}
