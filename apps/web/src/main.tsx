import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as SentryReact from "@sentry/react";
import { initSentry } from "@studyagent/observability";
import { App } from "./App.js";
import "katex/dist/katex.min.css";
import "./study-shell.css";
import "./tutorbook.css";

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
