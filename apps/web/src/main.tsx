import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import * as SentryReact from "@sentry/react";
import { initSentry } from "@studyagent/observability";
import { App } from "./App.js";
import { folioQueryClient } from "./app/query-client.js";
import "katex/dist/katex.min.css";
import "./tutorbook.css";
import "./study-shell.css";
import "./features/folio/theme/folio-tailwind.css";
import "./features/folio/theme/folio-workspace.css";
import "./features/folio/theme/folio-tutor-overrides.css";

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
const app = (
  <QueryClientProvider client={folioQueryClient}>
    <App />
  </QueryClientProvider>
);

ReactDOM.createRoot(root).render(
  import.meta.env.DEV ? app : <React.StrictMode>{app}</React.StrictMode>,
);
