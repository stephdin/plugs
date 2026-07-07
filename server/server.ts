// Hono app entry point.
//
// Responsibilities:
//   - Serve the built UI from ./dist (run `pnpm build` first).
//   - Expose a single WebSocket channel at /ws.
//   - Periodically poll plugs in the background and broadcast state.
//
// Nothing in this file knows the Shelly protocol; adding Gen1 / another
// device type lives in server/shelly.ts only.

import { Hono } from "hono";
import { serveStatic } from "hono/deno";

import { createPlugRegistry } from "./plugs.ts";
import { createShellyGen2Driver } from "./shelly.ts";
import { handleWebSocket } from "./ws.ts";
import { log } from "./log.ts";

// Plug configuration. Currently hardcoded; future: persist to plugs.json and
// expose admin endpoints to manage this list at runtime.
const registry = createPlugRegistry([
  {
    id: "0",
    name: "Ventilator",
    readOnly: false,
    driver: createShellyGen2Driver({
      kind: "shelly.gen2",
      host: "192.168.2.166",
      id: 0,
    }),
  },
  {
    id: "1",
    name: "Kühlschrank",
    readOnly: false,
    driver: createShellyGen2Driver({
      kind: "shelly.gen2",
      host: "192.168.2.167",
      id: 0,
    }),
  },
]);
registry.start();

log("info", "server", `${registry.getState().length} plugs configured`);

const app = new Hono();

// Single WebSocket channel: server pushes state, client sends toggle intents.
app.get("/ws", (c) => {
  const { socket, response } = Deno.upgradeWebSocket(c.req.raw);
  handleWebSocket(socket, registry);
  return response;
});

// Static UI assets produced by `pnpm build`.
app.use("/*", serveStatic({ root: "./dist" }));

// SPA fallback: unknown GET routes render index.html so client-side routing
// (if/when we add react-router) keeps working on a hard refresh.
app.get("/*", (c) => c.html(Deno.readTextFileSync("./dist/index.html")));

// `started` fires once when the server is ready; logging earlier would print
// before we know the port actually bound.
Deno.serve(app.fetch);
setTimeout(() => log("info", "server", "listening on :8000"), 0);
