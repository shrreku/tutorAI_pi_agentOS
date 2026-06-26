import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/utils.js";

/* ------------------------------------------------------------------ Button */
const button = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background,border,color,box-shadow,transform] duration-150 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 active:translate-y-px select-none",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:opacity-90 shadow-soft",
        accent: "bg-accent text-accent-foreground hover:opacity-90 shadow-soft",
        outline: "border border-border bg-transparent text-foreground hover:bg-muted",
        subtle: "bg-muted text-foreground hover:bg-secondary",
        ghost: "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
        link: "bg-transparent text-accent underline-offset-4 hover:underline px-0",
      },
      size: {
        sm: "h-8 rounded-md px-3 text-[13px]",
        md: "h-10 rounded-lg px-4 text-sm",
        lg: "h-12 rounded-lg px-6 text-[15px]",
        icon: "h-9 w-9 rounded-lg",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(button({ variant, size }), className)} {...props} />;
}

/* -------------------------------------------------------------------- Card */
export function Panel({
  className,
  inset,
  ...props
}: HTMLAttributes<HTMLDivElement> & { inset?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card text-card-foreground",
        inset ? "" : "shadow-soft",
        className,
      )}
      {...props}
    />
  );
}

/* ------------------------------------------------------------------- Badge */
const badge = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold leading-none",
  {
    variants: {
      tone: {
        neutral: "bg-muted text-muted-foreground",
        accent: "bg-accent/12 text-accent",
        primary: "bg-primary/10 text-primary",
        success: "bg-success/14 text-success",
        warning: "bg-warning/16 text-warning",
        danger: "bg-destructive/14 text-destructive",
        outline: "border border-border text-muted-foreground",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);
export function Badge({
  className,
  tone,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ tone }), className)} {...props} />;
}

/* -------------------------------------------------------------- Status dot */
export function Dot({
  tone = "neutral",
  pulse,
}: {
  tone?: "neutral" | "accent" | "success" | "warning" | "danger";
  pulse?: boolean;
}) {
  const map = {
    neutral: "bg-muted-foreground",
    accent: "bg-accent",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-destructive",
  } as const;
  return (
    <span className="relative inline-flex h-2 w-2">
      {pulse && (
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
            map[tone],
          )}
        />
      )}
      <span className={cn("relative inline-flex h-2 w-2 rounded-full", map[tone])} />
    </span>
  );
}

/* ------------------------------------------------------------------- Meter */
export function Meter({
  value,
  tone = "primary",
  className,
  thickness = "md",
}: {
  value: number;
  tone?: "primary" | "accent" | "success" | "warning" | "danger";
  className?: string;
  thickness?: "sm" | "md" | "lg";
}) {
  const fill = {
    primary: "bg-primary",
    accent: "bg-accent",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-destructive",
  } as const;
  const h = thickness === "sm" ? "h-1" : thickness === "lg" ? "h-2.5" : "h-1.5";
  const clamped = Math.max(0, Math.min(100, value <= 1 ? value * 100 : value));
  return (
    <div className={cn("w-full overflow-hidden rounded-full bg-muted", h, className)}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", fill[tone])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- Ring (radial) */
export function Ring({
  value,
  size = 72,
  label,
  sublabel,
}: {
  value: number;
  size?: number;
  label?: ReactNode;
  sublabel?: ReactNode;
}) {
  const v = Math.max(0, Math.min(100, value <= 1 ? value * 100 : value));
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `conic-gradient(var(--accent) ${v}%, color-mix(in oklab, var(--muted-foreground) 22%, transparent) 0)`,
          mask: "radial-gradient(farthest-side, transparent calc(100% - 8px), #000 calc(100% - 8px))",
          WebkitMask:
            "radial-gradient(farthest-side, transparent calc(100% - 8px), #000 calc(100% - 8px))",
        }}
      />
      <div className="text-center leading-none">
        {label != null && <div className="text-sm font-semibold">{label}</div>}
        {sublabel != null && (
          <div className="mt-0.5 text-[10px] text-muted-foreground">{sublabel}</div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------- Segmented control */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  className,
}: {
  options: Array<{ value: T; label: ReactNode }>;
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-surface p-1",
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-full font-medium transition-colors",
              size === "sm" ? "px-3 py-1 text-[12px]" : "px-3.5 py-1.5 text-[13px]",
              active
                ? "bg-card text-foreground shadow-soft"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------------- Kbd */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
      {children}
    </kbd>
  );
}

/* ---------------------------------------------------------------- Skeleton */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

/* ----------------------------------------------------------------- Avatar */
export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      className={cn(
        "inline-grid place-items-center rounded-full bg-primary text-primary-foreground text-[11px] font-semibold",
        className ?? "h-8 w-8",
      )}
    >
      {initials || "?"}
    </span>
  );
}

/* ------------------------------------------------------------ Section label */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}
