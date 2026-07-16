// Hono app entry point.
//
// Responsibilities:
//   - Serve the built UI from ./dist (run `pnpm build` first).
//   - Expose a single WebSocket channel at /ws.
//   - Periodically poll plugs in the background and broadcast state.
//
// Nothing in this file knows the Shelly protocol; adding a new device type
// lives in server/drivers/ only.

import { Hono } from "hono";
import { serveStatic } from "hono/deno";

import { createPlugRegistry } from "./lib/registry.ts";
import { createShellyGen1Driver } from "./drivers/shelly_gen1.ts";
import { createShellyGen2Driver } from "./drivers/shelly_gen2.ts";
import type { ShellyGen1Config } from "./drivers/shelly_gen1.ts";
import type { ShellyGen2Config } from "./drivers/shelly_gen2.ts";
import { handleWebSocket } from "./lib/ws.ts";
import { log } from "./lib/log.ts";

// Plug configuration loaded from plugs.json.

// JSON-friendly plug config shape.
type DriverConfig = ShellyGen2Config | ShellyGen1Config;

type PlugJson = {
  id: string;
  name: string;
  description?: string;
  readOnly?: boolean;
  confirm?: boolean;
  driver: DriverConfig;
};

function createDriver(cfg: DriverConfig) {
  switch (cfg.kind) {
    case "shelly.gen2":
      return createShellyGen2Driver(cfg);
    case "shelly.gen1":
      return createShellyGen1Driver(cfg);
    default:
      throw new Error(`unknown driver kind: ${(cfg as { kind: string }).kind}`);
  }
}

const plugConfigs: PlugJson[] = JSON.parse(
  Deno.readTextFileSync(new URL("./plugs.json", import.meta.url)),
);

const registry = createPlugRegistry(
  plugConfigs.map((c) => ({
    ...c,
    driver: createDriver(c.driver),
  })),
);
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
