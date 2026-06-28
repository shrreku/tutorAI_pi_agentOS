import type { ReactNode } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  GraduationCap,
  Map,
  Play,
  Sparkles,
  Upload,
} from "lucide-react";
import { cn } from "../lib/utils.js";
import { Badge, Button, Eyebrow } from "../ui/primitives.js";

function LandingBackdrop({ variant }: { variant: FolioLandingVariant }) {
  return (
    <div className="folio-landing-backdrop" aria-hidden data-variant={variant}>
      <span className="folio-orb folio-orb--1" />
      <span className="folio-orb folio-orb--2" />
      <span className="folio-orb folio-orb--3" />
      <span className="folio-paper-grain" />
    </div>
  );
}

export type FolioLandingVariant = "index" | "journal" | "tutor" | "library";
export type LandingNavigate = (path: string) => void;

export const LANDING_VARIANTS: Array<{
  id: Exclude<FolioLandingVariant, "index">;
  label: string;
  blurb: string;
}> = [
  { id: "journal", label: "Journal", blurb: "Editorial masthead · study journal hero" },
  { id: "tutor", label: "Tutor", blurb: "Split hero · live demo · dark band" },
  { id: "library", label: "Library", blurb: "Minimal · product collage · proof" },
];

export function LandingNav({
  variant,
  navigate,
}: {
  variant: FolioLandingVariant;
  navigate: LandingNavigate;
}) {
  return (
    <header className="folio-landing-nav">
      <div className="folio-landing-nav-inner">
        <button type="button" className="folio-landing-logo" onClick={() => navigate("/landing")}>
          <span className="folio-landing-logo-mark">TB</span>
          <span className="folio-landing-logo-text">
            TutorBook
            <span className="folio-landing-logo-sub">Folio</span>
          </span>
        </button>

        <nav className="folio-landing-nav-links" aria-label="Landing variants">
          {LANDING_VARIANTS.map((v) => (
            <button
              key={v.id}
              type="button"
              className="folio-landing-nav-link"
              data-active={variant === v.id}
              onClick={() => navigate(`/landing/${v.id}`)}
            >
              {v.label}
            </button>
          ))}
        </nav>

        <div className="folio-landing-nav-actions">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
            Open app
          </Button>
          <Button variant="accent" size="sm" onClick={() => navigate("/notebooks/demo-orgchem")}>
            Try demo
          </Button>
        </div>
      </div>
    </header>
  );
}

export function LandingFooter({ navigate }: { navigate: LandingNavigate }) {
  return (
    <footer className="folio-landing-footer">
      <div className="folio-landing-footer-inner">
        <div>
          <p className="font-display text-[18px] font-semibold">TutorBook Folio</p>
          <p className="mt-1 max-w-sm font-display text-[14px] italic text-muted-foreground">
            The editorial study experience — grounded tutoring for students who read the textbook.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate("/landing/journal")}>
            Journal
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/landing/tutor")}>
            Tutor
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/landing/library")}>
            Library
          </Button>
          <Button variant="accent" size="sm" onClick={() => navigate("/dashboard")}>
            Enter the app <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <p className="folio-landing-copyright">
        © {new Date().getFullYear()} TutorBook · Beta product preview
      </p>
    </footer>
  );
}

export function LandingShell({
  variant,
  navigate,
  children,
}: {
  variant: FolioLandingVariant;
  navigate: LandingNavigate;
  children: ReactNode;
}) {
  return (
    <div className="folio-landing-root">
      <LandingBackdrop variant={variant} />
      <LandingNav variant={variant} navigate={navigate} />
      <div className="folio-landing-body">{children}</div>
      <LandingFooter navigate={navigate} />
    </div>
  );
}

export function DemoBrowser({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("folio-demo-browser", className)}>
      <div className="folio-demo-browser-chrome">
        <span className="folio-demo-dot" />
        <span className="folio-demo-dot" />
        <span className="folio-demo-dot" />
        <span className="folio-demo-browser-title">{title}</span>
      </div>
      <div className="folio-demo-browser-body">{children}</div>
    </div>
  );
}

export function CtaPair({
  navigate,
  primary = "Start studying",
  secondary = "Watch demo",
  invert,
}: {
  navigate: LandingNavigate;
  primary?: string;
  secondary?: string;
  invert?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant={invert ? "primary" : "accent"}
        size="lg"
        onClick={() => navigate("/dashboard")}
      >
        {primary} <ArrowRight className="h-4 w-4" />
      </Button>
      <Button
        variant={invert ? "outline" : "outline"}
        size="lg"
        className={invert ? "border-primary-foreground/30 text-primary-foreground hover:bg-white/10" : ""}
        onClick={() => navigate("/notebooks/demo-orgchem")}
      >
        <Play className="h-4 w-4" /> {secondary}
      </Button>
    </div>
  );
}

export { ArrowRight, BookOpen, Check, ChevronRight, GraduationCap, Eyebrow, Badge, Map, Play, Sparkles, Upload };
