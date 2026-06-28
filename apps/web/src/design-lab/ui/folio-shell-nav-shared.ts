import { useEffect, useState } from "react";
import { BookOpen, LayoutDashboard } from "lucide-react";
import { folioCredits, folioMe, folioStudyToday } from "../lib/folio-mock-data.js";

export type FolioNavKey = "dashboard" | "notebooks" | "account" | "nodepack";
export type FolioAccountTab = "overview" | "credits" | "access-code" | "support" | "data";
export type FolioNavVariant = "editorial" | "drawer" | "forest";

export const NAV_VARIANTS: Array<{ id: FolioNavVariant; label: string; blurb: string }> = [
  { id: "editorial", label: "Editorial", blurb: "Masthead · rules · study ledger" },
  { id: "drawer", label: "Drawer", blurb: "Floating panel · pills · chips" },
  { id: "forest", label: "Forest", blurb: "Dark immersive · gold accents" },
];

const COLLAPSE_KEY = "folio-design-lab-nav-collapsed";
const VARIANT_KEY = "folio-design-lab-nav-variant";

export const PRIMARY_NAV: Array<{
  key: Exclude<FolioNavKey, "account" | "nodepack">;
  label: string;
  path: string;
  icon: typeof LayoutDashboard;
  numeral?: string;
}> = [
  { key: "dashboard", label: "Journal", path: "/dashboard", icon: LayoutDashboard, numeral: "I" },
  { key: "notebooks", label: "Notebooks", path: "/notebooks", icon: BookOpen, numeral: "II" },
];

export function useFolioNavCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  return [collapsed, setCollapsed] as const;
}

export function useFolioNavVariant() {
  const [variant, setVariant] = useState<FolioNavVariant>(() => {
    try {
      const v = localStorage.getItem(VARIANT_KEY);
      if (v === "editorial" || v === "drawer" || v === "forest") return v;
    } catch {
      /* ignore */
    }
    return "editorial";
  });

  useEffect(() => {
    try {
      localStorage.setItem(VARIANT_KEY, variant);
    } catch {
      /* ignore */
    }
  }, [variant]);

  return [variant, setVariant] as const;
}

export function useFolioNavStats() {
  const firstName = folioMe.user.displayName.split(" ")[0] ?? "Reader";
  const studyPct = Math.min(
    100,
    Math.round((folioStudyToday.minutes / folioStudyToday.goal) * 100),
  );
  const minutesLeft = Math.max(0, folioStudyToday.goal - folioStudyToday.minutes);

  return {
    firstName,
    displayName: folioMe.user.displayName,
    studyMinutes: folioStudyToday.minutes,
    studyGoal: folioStudyToday.goal,
    studyPct,
    minutesLeft,
    creditsPct: folioCredits.percentRemaining,
  };
}
