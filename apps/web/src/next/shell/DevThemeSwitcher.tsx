import { setVisualTheme, type VisualTheme } from "../../ui-theme.js";
import { useUiTheme } from "../../use-ui-theme.js";

const themes: VisualTheme[] = ["mist", "folio", "focus"];

export function DevThemeSwitcher() {
  if (!import.meta.env.DEV) return null;

  const theme = useUiTheme();

  return (
    <div className="dev-ui-switcher" aria-label="Theme switcher">
      <div className="dev-ui-switcher__label">Theme</div>
      <div className="dev-ui-switcher__row">
        {themes.map((value) => (
          <button
            key={value}
            type="button"
            className={`dev-ui-switcher__btn${theme === value ? " is-active" : ""}`}
            onClick={() => setVisualTheme(value)}
          >
            {value}
          </button>
        ))}
      </div>
    </div>
  );
}
