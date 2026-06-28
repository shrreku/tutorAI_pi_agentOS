import type { ReactNode } from "react";
import { Bolt, LayoutGrid, BookText, CreditCard, LifeBuoy, ShieldHalf } from "lucide-react";
import { useSession } from "../../routing/RouteGuards.js";
import { Wordmark } from "../../ui/brand.js";
import { Avatar } from "../../ui/primitives.js";
import { cn } from "../../ui/cn.js";

type AppNavKey = "dashboard" | "notebooks" | "credits" | "access-code" | "support" | "account";

const NAV_ITEMS: Array<{ key: AppNavKey; label: string; path: string; icon: typeof LayoutGrid }> = [
  { key: "dashboard", label: "Dashboard", path: "/app", icon: LayoutGrid },
  { key: "notebooks", label: "Notebooks", path: "/notebooks", icon: BookText },
  { key: "credits", label: "Credits", path: "/app/credits", icon: CreditCard },
  { key: "support", label: "Support", path: "/app/support", icon: LifeBuoy },
];

export function AppShell({
  navigate,
  active,
  children,
}: {
  navigate: (path: string) => void;
  active: AppNavKey;
  children: ReactNode;
}) {
  const { session } = useSession();
  const credits = session?.credits;
  const percent = credits?.percentRemaining;
  const name = session?.user?.displayName ?? session?.user?.email ?? "You";
  const isAdmin = session?.entitlements?.adminAccess ?? false;

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-5">
          <button onClick={() => navigate("/app")} aria-label="TutorBook" className="mr-4 shrink-0">
            <Wordmark />
          </button>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
            {NAV_ITEMS.map((item) => {
              const on = active === item.key;
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  onClick={() => navigate(item.path)}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "relative inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors",
                    on
                      ? "text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                  {on && (
                    <span className="absolute inset-x-3 -bottom-[1px] h-[2px] rounded-full bg-accent" />
                  )}
                </button>
              );
            })}
            {isAdmin && (
              <button
                onClick={() => navigate("/admin")}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[13.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ShieldHalf className="h-4 w-4" /> Admin
              </button>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2.5">
            {percent != null && (
              <button
                onClick={() => navigate("/app/credits")}
                title="Tutor credits"
                className={cn(
                  "hidden items-center gap-2 rounded-full border border-border bg-card py-1 pl-2.5 pr-3 text-[12px] font-medium sm:inline-flex",
                  credits?.exhausted ? "text-destructive" : "text-foreground",
                )}
              >
                <Bolt
                  className={cn(
                    "h-3.5 w-3.5",
                    credits?.exhausted ? "text-destructive" : "text-accent",
                  )}
                />
                <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                  <span
                    className={cn(
                      "block h-full rounded-full",
                      credits?.exhausted ? "bg-destructive" : "bg-accent",
                    )}
                    style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
                  />
                </span>
                {percent}%
              </button>
            )}
            <button
              onClick={() => navigate("/app/account")}
              aria-label="Account"
              className="rounded-full"
            >
              <Avatar name={name} className="h-9 w-9 text-[12px]" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8">{children}</main>
    </div>
  );
}
