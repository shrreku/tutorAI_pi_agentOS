import { FolioApp } from "./directions/folio-app.js";

/**
 * Folio-only design lab: full webapp shell (nav drawer), learner pages,
 * workspace, node pack, and three landing variants — all hash-routed under #folio/…
 */
export function DesignLab() {
  return (
    <div data-direction="folio" className="flex min-h-dvh flex-col bg-background text-foreground">
      <FolioApp />
    </div>
  );
}
