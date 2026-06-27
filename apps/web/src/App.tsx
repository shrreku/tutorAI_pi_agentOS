import { AppRouter } from "./routing/AppRouter.js";
import { ThemeProvider } from "./next/shell/ThemeProvider.js";
import { DevThemeSwitcher } from "./next/shell/DevThemeSwitcher.js";
import "./next/next.css";

export function App() {
  return (
    <ThemeProvider>
      <AppRouter />
      <DevThemeSwitcher />
    </ThemeProvider>
  );
}
