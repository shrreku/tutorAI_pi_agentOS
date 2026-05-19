import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App.js";
import "katex/dist/katex.min.css";
import "./study-shell.css";

const root = document.getElementById("root")!;
const queryClient = new QueryClient();
const app = (
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
);

ReactDOM.createRoot(root).render(
  import.meta.env.DEV ? app : (
    <React.StrictMode>
      {app}
    </React.StrictMode>
  ),
);
