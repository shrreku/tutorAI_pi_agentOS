import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(here, "../..");
const apiProxyTarget = process.env.VITE_API_PROXY_TARGET ?? "http://127.0.0.1:4000";

export default defineConfig({
  envPrefix: ["VITE_"],
  // Tailwind is scoped to the standalone design-lab entry; the main app keeps its
  // own hand-written CSS untouched.
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        main: path.join(here, "index.html"),
        "design-lab": path.join(here, "design-lab.html"),
      },
    },
  },
  resolve: {
    alias: {
      "@studyagent/schemas": path.join(workspaceRoot, "packages/schemas/src/index.ts"),
      "@studyagent/eval-runner": path.join(workspaceRoot, "packages/eval-runner/src/index.ts"),
      "@studyagent/ui": path.join(workspaceRoot, "packages/ui/src/index.ts"),
      "@studyagent/observability": path.join(workspaceRoot, "packages/observability/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      "/auth": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
});
