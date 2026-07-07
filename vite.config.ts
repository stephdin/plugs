import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  server: {
    proxy: {
      // Forward the WebSocket channel to the Deno backend during dev so the
      // app gets live state. In production the same URL is served directly
      // by the Deno process, so client code never changes.
      "/ws": {
        target: "http://localhost:8000",
        ws: true,
      },
    },
  },
})