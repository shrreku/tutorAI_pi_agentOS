import { useEffect, useState } from "react";
import { getVisualTheme, UI_THEME_CHANGED_EVENT, type VisualTheme } from "./ui-theme.js";

export function useUiTheme(): VisualTheme {
  const [theme, setTheme] = useState<VisualTheme>(() => getVisualTheme());

  useEffect(() => {
    const sync = () => setTheme(getVisualTheme());
    window.addEventListener(UI_THEME_CHANGED_EVENT, sync);
    return () => window.removeEventListener(UI_THEME_CHANGED_EVENT, sync);
  }, []);

  return theme;
}
