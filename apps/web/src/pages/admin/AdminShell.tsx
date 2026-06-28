import type { ReactNode } from "react";
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  FileStack,
  KeyRound,
  CreditCard,
  MessageSquareText,
  Trash2,
  DownloadCloud,
  BarChart3,
  ArrowLeft,
} from "lucide-react";
import type { AdminPage } from "../../routing/routes.js";
import { Logo } from "../../ui/brand.js";
import { Badge } from "../../ui/primitives.js";
import { cn } from "../../ui/cn.js";

const NAV_ITEMS: Array<{ key: AdminPage; label: string; path: string; icon: typeof Users }> = [
  { key: "overview", label: "Overview", path: "/admin", icon: LayoutDashboard },
  { key: "users", label: "Users", path: "/admin/users", icon: Users },
  { key: "workspaces", label: "Workspaces", path: "/admin/workspaces", icon: FolderKanban },
  { key: "templates", label: "Templates", path: "/admin/templates", icon: FileStack },
  { key: "access-codes", label: "Access codes", path: "/admin/access-codes", icon: KeyRound },
  { key: "credits", label: "Credits", path: "/admin/credits", icon: CreditCard },
  { key: "feedback", label: "Feedback", path: "/admin/feedback", icon: MessageSquareText },
  {
    key: "account-deletion",
    label: "Account deletion",
    path: "/admin/account-deletion",
    icon: Trash2,
  },
  { key: "ingestion", label: "Ingestion", path: "/admin/ingestion", icon: DownloadCloud },
  { key: "analytics", label: "Analytics", path: "/admin/analytics", icon: BarChart3 },
];

export function AdminShell({
  navigate,
  active,
  children,
}: {
  navigate: (path: string) => void;
  active: AdminPage;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-surface/50 px-3 py-4 md:flex">
        <button
          onClick={() => navigate("/app")}
          className="mb-1 flex items-center gap-2 px-2"
          aria-label="TutorBook"
        >
          <Logo size={28} />
          <span className="font-display text-[16px] font-semibold">TutorBook</span>
          <Badge tone="gold" className="ml-1">
            Admin
          </Badge>
        </button>

        <nav className="mt-4 flex-1 space-y-0.5" aria-label="Admin">
          {NAV_ITEMS.map((item) => {
            const on =
              active === item.key ||
              (active === "user-detail" && item.key === "users") ||
              (active === "workspace-detail" && item.key === "workspaces");
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                onClick={() => navigate(item.path)}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13.5px] font-medium transition-colors",
                  on
                    ? "bg-accent/12 text-accent"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <button
          onClick={() => navigate("/app")}
          className="mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to app
        </button>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-5 py-8">{children}</div>
      </main>
    </div>
  );
}
