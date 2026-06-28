/* ============================================================================
   Generated, self-contained SVG brand + illustration assets (no binary files).
   Folio identity: editorial, forest green + gold, a folded "folio" page mark.
   ============================================================================ */

export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      className={className}
      aria-hidden
    >
      <rect width="40" height="40" rx="11" fill="var(--primary)" />
      {/* folded folio page */}
      <path d="M13 11h9l5 5v13H13z" fill="var(--primary-foreground)" opacity="0.96" />
      <path d="M22 11l5 5h-5z" fill="var(--primary-foreground)" opacity="0.55" />
      {/* ruled lines + a green accent seam */}
      <path
        d="M16 20h8M16 23.5h8M16 27h5"
        stroke="var(--primary)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path d="M20 11v18" stroke="var(--gold)" strokeWidth="1.4" opacity="0.0" />
      <circle cx="27.5" cy="13" r="3" fill="var(--gold)" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={"inline-flex items-center gap-2.5 " + (className ?? "")}>
      <Logo size={30} />
      <span className="font-display text-[19px] font-semibold tracking-[-0.01em] text-foreground">
        TutorBook
      </span>
    </span>
  );
}

/** Decorative grain layer for editorial surfaces. */
export function Grain({ className, opacity = 0.5 }: { className?: string; opacity?: number }) {
  return (
    <svg
      className={"pointer-events-none absolute inset-0 h-full w-full " + (className ?? "")}
      aria-hidden
    >
      <filter id="tb-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#tb-grain)" opacity={opacity * 0.06} />
    </svg>
  );
}

/**
 * Hero illustration: an editorial composition — a source page feeding into a
 * little study-map constellation, with the tutor "spark". Themed by tokens.
 */
export function HeroArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 520 420"
      fill="none"
      className={className}
      role="img"
      aria-label="A source becoming a study map"
    >
      <defs>
        <linearGradient id="tb-paper" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--elevated)" />
          <stop offset="1" stopColor="var(--surface)" />
        </linearGradient>
        <linearGradient id="tb-accent" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--primary)" />
        </linearGradient>
      </defs>

      {/* soft halo */}
      <circle cx="270" cy="200" r="180" fill="var(--accent)" opacity="0.06" />

      {/* source document */}
      <g transform="rotate(-6 120 210)">
        <rect
          x="48"
          y="120"
          width="150"
          height="190"
          rx="10"
          fill="url(#tb-paper)"
          stroke="var(--border)"
        />
        <rect x="48" y="120" width="150" height="30" rx="10" fill="var(--primary)" opacity="0.10" />
        <path
          d="M66 168h114M66 182h114M66 196h92M66 210h114M66 224h78M66 238h114M66 252h60"
          stroke="var(--muted-foreground)"
          strokeOpacity="0.5"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <rect x="62" y="128" width="44" height="9" rx="4" fill="var(--gold)" />
      </g>

      {/* connecting flow */}
      <path
        d="M205 200 C 250 180, 270 240, 320 215"
        stroke="var(--accent)"
        strokeWidth="2.5"
        strokeDasharray="4 7"
        strokeLinecap="round"
        opacity="0.8"
      />

      {/* study-map constellation */}
      <g>
        <path
          d="M360 150 L 360 250 M360 200 L 440 165 M360 200 L 445 255"
          stroke="var(--border)"
          strokeWidth="2"
        />
        <rect x="320" y="128" width="120" height="46" rx="10" fill="url(#tb-accent)" />
        <rect x="332" y="140" width="70" height="7" rx="3.5" fill="#fff" opacity="0.9" />
        <rect x="332" y="153" width="50" height="6" rx="3" fill="#fff" opacity="0.6" />

        <rect
          x="402"
          y="142"
          width="96"
          height="44"
          rx="10"
          fill="var(--card)"
          stroke="var(--border)"
        />
        <rect
          x="414"
          y="154"
          width="56"
          height="6"
          rx="3"
          fill="var(--muted-foreground)"
          opacity="0.7"
        />
        <rect
          x="414"
          y="166"
          width="40"
          height="6"
          rx="3"
          fill="var(--muted-foreground)"
          opacity="0.4"
        />

        <rect
          x="332"
          y="230"
          width="110"
          height="44"
          rx="10"
          fill="var(--card)"
          stroke="var(--border)"
        />
        <rect
          x="344"
          y="242"
          width="62"
          height="6"
          rx="3"
          fill="var(--muted-foreground)"
          opacity="0.7"
        />
        <rect
          x="344"
          y="254"
          width="44"
          height="6"
          rx="3"
          fill="var(--muted-foreground)"
          opacity="0.4"
        />

        <rect x="404" y="232" width="92" height="44" rx="10" fill="var(--gold)" opacity="0.16" />
        <rect x="416" y="244" width="54" height="6" rx="3" fill="var(--gold)" />
        <rect x="416" y="256" width="36" height="6" rx="3" fill="var(--gold)" opacity="0.6" />
      </g>

      {/* tutor spark */}
      <g transform="translate(250 96)">
        <circle r="20" fill="var(--accent)" />
        <path d="M0 -10 L3 -3 L10 0 L3 3 L0 10 L-3 3 L-10 0 L-3 -3 Z" fill="#fff" />
      </g>
    </svg>
  );
}
