import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "../../ui/primitives.js";
import { Logo, Wordmark } from "../../ui/brand.js";
import { motion } from "../../ui/motion.js";

/* ============================================================================
   PublicLayout — shared Folio chrome for public/marketing surfaces (Demo,
   Contact, Privacy, Terms). Sticky top nav (Wordmark + Sign in + Get started)
   and an editorial footer. Renders `children` between them.
   ============================================================================ */

type NavigateFn = (path: string) => void;

const FOOTER_SECTIONS: ReadonlyArray<readonly [string, ReadonlyArray<readonly [string, string]>]> =
  [
    [
      "Product",
      [
        ["Features", "/#features"],
        ["Pricing", "/#pricing"],
        ["Demo", "/demo"],
      ],
    ],
    [
      "Company",
      [
        ["About", "/contact"],
        ["Contact", "/contact"],
      ],
    ],
    [
      "Legal",
      [
        ["Privacy", "/privacy"],
        ["Terms", "/terms"],
      ],
    ],
  ];

export function PublicLayout({
  navigate,
  children,
}: {
  navigate: NavigateFn;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      {/* ---------- Top nav ---------- */}
      <motion.header
        initial={{ y: -16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 0.61, 0.36, 1] }}
        className="sticky top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur"
      >
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-5 py-3">
          <button
            type="button"
            onClick={() => navigate("/")}
            aria-label="TutorBook home"
            className="rounded-md outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <Wordmark />
          </button>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={() => navigate("/login")}
            >
              Sign in
            </Button>
            <Button variant="primary" size="sm" onClick={() => navigate("/login")}>
              Get started <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </motion.header>

      {/* ---------- Page body ---------- */}
      <main className="flex-1">{children}</main>

      {/* ---------- Footer ---------- */}
      <footer className="border-t border-border bg-surface/40">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 sm:grid-cols-2 md:grid-cols-4">
          <div className="sm:col-span-2 md:col-span-1">
            <button
              type="button"
              onClick={() => navigate("/")}
              aria-label="TutorBook home"
              className="rounded-md outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <Logo size={34} />
            </button>
            <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
              The grounded tutoring OS — your sources, taught back to you.
            </p>
          </div>
          {FOOTER_SECTIONS.map(([title, links]) => (
            <div key={title}>
              <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                {title}
              </div>
              <ul className="mt-3 space-y-2">
                {links.map(([label, href]) => (
                  <li key={label}>
                    <button
                      type="button"
                      onClick={() => navigate(href)}
                      className="cursor-pointer text-[14px] text-foreground/80 transition-colors hover:text-accent"
                    >
                      {label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-border py-5 text-center text-[13px] text-muted-foreground">
          © {new Date().getFullYear()} TutorBook. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
