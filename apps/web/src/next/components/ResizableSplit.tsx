import { useCallback, useRef } from "react";

export function ResizableSplit({
  percent,
  onPercentChange,
  left,
  right,
  handleOnly = false,
  min = 20,
  max = 70,
}: {
  percent: number;
  onPercentChange: (pct: number) => void;
  left: React.ReactNode;
  right: React.ReactNode;
  handleOnly?: boolean;
  min?: number;
  max?: number;
}) {
  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      const onMove = (ev: MouseEvent) => {
        if (!dragging.current || !containerRef.current) return;
        const parent = containerRef.current.parentElement;
        if (!parent) return;
        const rect = parent.getBoundingClientRect();
        onPercentChange(Math.min(max, Math.max(min, ((ev.clientX - rect.left) / rect.width) * 100)));
      };
      const onUp = () => {
        dragging.current = false;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [max, min, onPercentChange],
  );

  if (handleOnly) {
    return (
      <div
        ref={containerRef}
        role="separator"
        aria-orientation="vertical"
        onMouseDown={onMouseDown}
        style={{ width: 4, cursor: "col-resize", background: "var(--border)", flexShrink: 0 }}
      />
    );
  }

  return (
    <div ref={containerRef} style={{ display: "flex", flex: 1, minHeight: 0 }}>
      <div style={{ width: `${percent}%`, flexShrink: 0, minWidth: 0 }}>{left}</div>
      <div
        role="separator"
        aria-orientation="vertical"
        onMouseDown={onMouseDown}
        style={{ width: 4, cursor: "col-resize", background: "var(--border)", flexShrink: 0 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>{right}</div>
    </div>
  );
}
