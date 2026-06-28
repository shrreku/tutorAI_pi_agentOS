import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as SentryReact from "@sentry/react";
import { initSentry } from "@studyagent/observability";
import { App } from "./App.js";
import "katex/dist/katex.min.css";
import "./ui/theme.css";
// study-shell.css themes the live TutorPanel + Whiteboard graph panes (reused
// wiring). The old tutorbook.css has been fully retired — Folio (theme.css) now
// drives every shipped surface.
import "./study-shell.css";

initSentry(
  import.meta.env.VITE_SENTRY_DSN,
  import.meta.env.VITE_SENTRY_ENVIRONMENT,
  import.meta.env.VITE_SENTRY_RELEASE,
  {
    runtime: "browser",
    client: SentryReact,
  },
);

const root = document.getElementById("root")!;
const queryClient = new QueryClient();
const app = (
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
);

ReactDOM.createRoot(root).render(
  import.meta.env.DEV ? app : <React.StrictMode>{app}</React.StrictMode>,
);
