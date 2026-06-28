import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "./lib/utils.js";

const button = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background,border,color,box-shadow,transform] duration-150 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px select-none",
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

export function Eyebrow({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn(
        "font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

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

export function Meter({
  value,
  className,
  thickness = "md",
  tone = "primary",
}: {
  value: number;
  className?: string;
  thickness?: "sm" | "md";
  tone?: "primary" | "accent" | "warning";
}) {
  const fill =
    tone === "accent" ? "bg-accent" : tone === "warning" ? "bg-warning" : "bg-primary";
  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-full bg-black/8",
        thickness === "sm" ? "h-1" : "h-1.5",
        className,
      )}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={cn("h-full rounded-full transition-all", fill)} style={{ width: `${value}%` }} />
    </div>
  );
}

export function FolioErrorNotice({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-destructive/30 bg-destructive/5 px-4 py-3">
      <p className="font-display text-[15px] font-semibold text-destructive">{title}</p>
      <p className="mt-1 text-[13px] text-muted-foreground">{message}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function FolioEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start justify-center px-6 py-12">
      <h2 className="font-display text-[22px] font-semibold">{title}</h2>
      {description ? (
        <p className="mt-2 max-w-md text-[14px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function FolioSkeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-[var(--radius)] bg-muted", className)} />;
}
