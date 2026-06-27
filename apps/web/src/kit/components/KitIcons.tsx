type IconProps = { className?: string };

function Svg({ className, children }: { className?: string | undefined; children: React.ReactNode }) {
  return (
    <svg
      className={className ?? "svg-i"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function IconSearch({ className }: IconProps) {
  return (
    <Svg {...(className ? { className } : {})}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </Svg>
  );
}

export function IconCap({ className }: IconProps) {
  return (
    <Svg {...(className ? { className } : {})}>
      <path d="M22 10 12 5 2 10l10 5 10-5z" />
      <path d="M6 12v5c0 1 2.5 3 6 3s6-2 6-3v-5" />
    </Svg>
  );
}

export function IconChev({ className }: IconProps) {
  return (
    <Svg {...(className ? { className } : {})}>
      <polyline points="9 18 15 12 9 6" />
    </Svg>
  );
}

export function IconSend({ className }: IconProps) {
  return (
    <Svg {...(className ? { className } : {})}>
      <path d="m5 12 14-7-5 14-2-5z" />
    </Svg>
  );
}

export function IconEvidence({ className }: IconProps) {
  return (
    <Svg {...(className ? { className } : {})}>
      <path d="M12 2 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6z" />
      <path d="m9 12 2 2 4-4" />
    </Svg>
  );
}

export function IconChat({ className }: IconProps) {
  return (
    <Svg {...(className ? { className } : {})}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </Svg>
  );
}
