import { JournalLandingPage } from "../components/chrome/journal-landing.js";
import { PublicChrome } from "../components/chrome/public-chrome.js";

export function PublicLandingRoute() {
  return (
    <PublicChrome>
      <JournalLandingPage />
    </PublicChrome>
  );
}
