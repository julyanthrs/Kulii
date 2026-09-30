import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const api = `http://localhost:${process.env.API_PORT || 8787}`;

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          supabase: ["@supabase/supabase-js"],
          ui: ["lucide-react", "@dnd-kit/core", "date-fns", "zustand", "immer"],
        },
      },
    },
  },
  server: {
    // Fixed port so the URL never changes (Supabase redirect links point here). 5173 is left for other projects.
    port: Number(process.env.PORT) || 5180,
    strictPort: true,
    proxy: {
      "/api": {
        target: api,
        // API server not running → answer with a clear JSON error instead of a bare 500.
        configure: (proxy) =>
          proxy.on("error", (_err, _req, res) => {
            if ("writeHead" in res && !res.headersSent) {
              res.writeHead(503, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ ok: false, error: "The Kulii API server isn't running — start it with npm run dev" }));
            }
          }),
      },
      "/ws": { target: api.replace("http", "ws"), ws: true },
    },
  },
});
