import { useState, type ReactNode } from "react";
import { IconChev } from "./KitIcons.js";

export function Collapsible({
  title,
  defaultOpen = false,
  children,
  className,
}: {
  title: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`collapse${open ? " open" : ""}${className ? ` ${className}` : ""}`} data-collapse>
      <button
        type="button"
        className="collapse-head"
        data-collapse-head
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <IconChev className="svg-i chev" />
        {title}
      </button>
      <div className="collapse-body">{children}</div>
    </div>
  );
}
