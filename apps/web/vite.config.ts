import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(here, "../..");
const apiProxyTarget = process.env.VITE_API_PROXY_TARGET ?? "http://127.0.0.1:4000";

// `design-lab` is a scratch/exploration surface. It stays available in the dev server
// (its HTML entry is served directly by Vite) but is excluded from the production bundle
// unless explicitly opted in, so it never ships to the hosted beta web image.
const includeDesignLab = process.env.ENABLE_DESIGN_LAB === "true";

export default defineConfig({
  envPrefix: ["VITE_"],
  // Tailwind v4 (CSS-first) powers the app-wide Folio design system (src/ui/theme.css).
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        main: path.join(here, "index.html"),
        ...(includeDesignLab ? { "design-lab": path.join(here, "design-lab.html") } : {}),
      },
      output: {
        // Split large/independent vendors into their own cacheable chunks. The
        // heaviest libs (React Flow, KaTeX) are only pulled in by the lazily
        // loaded notebook workspace, so they never weigh down the first paint.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("react-dom") || /[\\/]react[\\/]/.test(id) || id.includes("react/jsx"))
            return "react";
          if (id.includes("@xyflow") || id.includes("d3-")) return "reactflow";
          if (id.includes("katex")) return "katex";
          if (
            id.includes("framer-motion") ||
            id.includes("motion-dom") ||
            id.includes("motion-utils")
          )
            return "motion";
          if (
            id.includes("react-markdown") ||
            id.includes("remark") ||
            id.includes("rehype") ||
            id.includes("micromark") ||
            id.includes("mdast") ||
            id.includes("hast")
          )
            return "markdown";
          if (id.includes("@tanstack")) return "tanstack";
          if (id.includes("@sentry")) return "sentry";
          return "vendor";
        },
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
