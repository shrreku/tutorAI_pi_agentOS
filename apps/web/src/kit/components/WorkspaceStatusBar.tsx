import type { ReactNode } from "react";

export function WorkspaceStatusBar({
  left,
  center,
  right,
}: {
  left: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="statusbar">
      <div className="left">{left}</div>
      {center != null ? <div className="center">{center}</div> : null}
      {right != null ? (
        <div className="right">
          <span className="accent">{right}</span>
        </div>
      ) : null}
    </div>
  );
}
