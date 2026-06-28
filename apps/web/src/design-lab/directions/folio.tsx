/** @deprecated Folio design lab now uses FolioApp — these exports remain for the direction registry. */
import { FolioMarginWorkspace } from "../ui/layouts/folio-margin.js";
import { FolioNodePack } from "../ui/folio-nodes.js";
import { folioNotebooks } from "../lib/folio-mock-data.js";
import { FolioDashboardPage } from "./folio-pages.js";

export function Workspace() {
  const notebook = folioNotebooks[0]?.title ?? "Organic Chemistry I";
  return <FolioMarginWorkspace notebook={notebook} />;
}

export function NodePack() {
  return <FolioNodePack />;
}

export function Dashboard() {
  return <FolioDashboardPage navigate={() => {}} />;
}
