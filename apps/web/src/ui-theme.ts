export type VisualTheme = "mist" | "folio" | "focus";

const VISUAL_THEME_KEY = "tutorbook.visualTheme";
export const UI_THEME_CHANGED_EVENT = "tutorbook-ui-theme-changed";

export function getVisualTheme(): VisualTheme {
  const theme = window.localStorage.getItem(VISUAL_THEME_KEY);
  if (theme === "folio" || theme === "focus") return theme;
  if (theme === "atlas") {
    window.localStorage.setItem(VISUAL_THEME_KEY, "focus");
    return "focus";
  }
  return "mist";
}

export function setVisualTheme(theme: VisualTheme): void {
  window.localStorage.setItem(VISUAL_THEME_KEY, theme);
  window.dispatchEvent(new Event(UI_THEME_CHANGED_EVENT));
}
