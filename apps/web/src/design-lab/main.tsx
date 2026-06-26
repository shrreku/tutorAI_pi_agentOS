import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DesignLab } from "./DesignLab.js";
import "./styles.css";

const root = document.getElementById("design-lab-root");
if (!root) throw new Error("design-lab-root element not found");

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <DesignLab />
    </QueryClientProvider>
  </React.StrictMode>,
);
