import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "../lib/utils.js";

const MIN_PERCENT = 20;
const MAX_PERCENT = 70;
const DEFAULT_PERCENT = 35;
const KEYBOARD_STEP = 2;

function clampSplit(value: number): number {
  return Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, value));
}

function readStoredSplit(storageKey: string): number | null {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const next = Number(raw);
    return Number.isFinite(next) ? clampSplit(next) : null;
  } catch {
    return null;
  }
}

export function FolioSplitPane({
  storageKey,
  defaultPercent = DEFAULT_PERCENT,
  left,
  right,
  className,
}: {
  storageKey: string;
  defaultPercent?: number;
  left: ReactNode;
  right: ReactNode;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const [splitPercent, setSplitPercent] = useState(() => {
    return readStoredSplit(storageKey) ?? defaultPercent;
  });

  useEffect(() => {
    const stored = readStoredSplit(storageKey);
    if (stored != null) {
      setSplitPercent(stored);
    }
  }, [storageKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, String(splitPercent));
    } catch {
      // ignore quota errors
    }
  }, [storageKey, splitPercent]);

  const updateFromClientX = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setSplitPercent(clampSplit(pct));
  }, []);

  const startDrag = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      isDragging.current = true;
      const onMove = (ev: MouseEvent) => {
        if (!isDragging.current) return;
        updateFromClientX(ev.clientX);
      };
      const onUp = () => {
        isDragging.current = false;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [updateFromClientX],
  );

  const onDividerKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setSplitPercent((current) => clampSplit(current - KEYBOARD_STEP));
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setSplitPercent((current) => clampSplit(current + KEYBOARD_STEP));
    }
    if (event.key === "Home") {
      event.preventDefault();
      setSplitPercent(MIN_PERCENT);
    }
    if (event.key === "End") {
      event.preventDefault();
      setSplitPercent(MAX_PERCENT);
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn("flex min-h-0 flex-1 overflow-hidden", className)}
      style={{ userSelect: isDragging.current ? "none" : "auto" }}
    >
      <div
        className="flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-border"
        style={{ width: `${splitPercent}%`, flexShrink: 0 }}
      >
        {left}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuemin={MIN_PERCENT}
        aria-valuemax={MAX_PERCENT}
        aria-valuenow={Math.round(splitPercent)}
        aria-label="Resize tutor and workspace panes"
        tabIndex={0}
        onMouseDown={startDrag}
        onKeyDown={onDividerKeyDown}
        className="group relative z-10 w-1.5 shrink-0 cursor-col-resize bg-border/70 transition-colors hover:bg-accent/40 focus-visible:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 h-8 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground/30 group-hover:bg-accent/70"
        />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{right}</div>
    </div>
  );
}
