import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createTheme, MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";

import App from "./App.tsx";

const theme = createTheme({
  primaryColor: "blue",
  defaultRadius: "lg",
  fontFamily:
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',

  colors: {
    // ── Accent blue (landing --accent: #5e8cf7) ────────────────────
    blue: [
      "#edf2fe", // 0  lightest
      "#d4e2fd", // 1
      "#bbd2fc", // 2
      "#a2c2fb", // 3
      "#89b2f9", // 4
      "#70a2f8", // 5  light-filled
      "#5e8cf7", // 6  filled / accent
      "#4b70c6", // 7  hover
      "#385495", // 8
      "#121c32", // 9  darkest
    ],

    // -- Status: online green (#3fb950) ────────────────────────────
    green: [
      "#edfaf0",
      "#d3f3db",
      "#b9ecc6",
      "#9fe5b1",
      "#85de9c",
      "#3fb950",
      "#329440",
      "#266f30",
      "#194a20",
      "#0d2510",
    ],

    // ── Status: offline red (#f85149) ─────────────────────────────
    red: [
      "#fef0ef",
      "#fdd6d5",
      "#fcbcbb",
      "#fba2a1",
      "#fa8887",
      "#f85149",
      "#c6413a",
      "#94312c",
      "#63201d",
      "#31100f",
    ],

    // -- Dark palette (maps to landing dark-mode backgrounds/text)
    //    9 = app bg, 7 = surface, 4 = border, 0 = text
    dark: [
      "#dfe4eb", // 0  text (--text)
      "#939dab", // 1  text-muted (--text-muted)
      "#68707d", // 2  text-dim (--text-dim)
      "#4a525e", // 3  placeholder
      "#1f262e", // 4  border (dimmer)
      "#181d24", // 5  border-hover
      "#11161d", // 6  hover surface
      "#0c1016", // 7  surface / card bg
      "#080d13", // 8  body bg
      "#080b10", // 9  app bg (--bg)
    ],
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <App />
    </MantineProvider>
  </StrictMode>,
);
