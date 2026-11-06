import path from "node:path";
import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    proxy: {
      // Forward the WebSocket channel to the Node backend during dev so the
      // app gets live state. In production the same URL is served directly
      // by the Node process, so client code never changes.
      "/ws": {
        target: "http://localhost:8000",
        ws: true,
      },
    },
  },
});
