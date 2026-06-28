import {
  useFolioNavCollapsed,
  useFolioNavVariant,
  type FolioAccountTab,
  type FolioNavKey,
  type FolioNavVariant,
} from "./folio-shell-nav-shared.js";
import { FolioNavDrawer } from "./folio-shell-nav-drawer.js";
import { FolioNavEditorial } from "./folio-shell-nav-editorial.js";
import { FolioNavForest } from "./folio-shell-nav-forest.js";

export type { FolioAccountTab, FolioNavKey, FolioNavVariant };
export { useFolioNavCollapsed, useFolioNavVariant, NAV_VARIANTS } from "./folio-shell-nav-shared.js";

export function FolioShellNav({
  active,
  navigate,
  collapsed,
  onToggleCollapse,
  variant,
  onVariantChange,
}: {
  active: FolioNavKey;
  navigate: (path: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  variant: FolioNavVariant;
  onVariantChange: (v: FolioNavVariant) => void;
}) {
  const props = { active, navigate, collapsed, onToggleCollapse, variant, onVariantChange };

  switch (variant) {
    case "drawer":
      return <FolioNavDrawer {...props} />;
    case "forest":
      return <FolioNavForest {...props} />;
    default:
      return <FolioNavEditorial {...props} />;
  }
}
