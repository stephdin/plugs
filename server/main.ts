// Hono app entry point.
//
// Responsibilities:
//   - Serve the built UI from ./dist (run `pnpm build` first).
//   - Expose a single WebSocket channel at /ws.
//   - Periodically poll plugs in the background and broadcast state.
//
// Nothing in this file knows the Shelly protocol; adding a new device type
// lives in server/drivers/ only.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Hono } from "hono";
import { serve, upgradeWebSocket } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { WebSocketServer } from "ws";

import { createPlugRegistry } from "./lib/registry.ts";
import { ConfigError, loadPlugConfigs } from "./lib/config.ts";
import type { DriverConfig, PlugJson } from "./lib/config.ts";
import { createShellyGen1Driver } from "./drivers/shelly_gen1.ts";
import { createShellyGen2Driver } from "./drivers/shelly_gen2.ts";
import { createWebSocketHandler } from "./lib/ws.ts";
import { log } from "./lib/log.ts";

// Resolve paths relative to this script so the server works
// regardless of which directory it's launched from.
const distRoot = fileURLToPath(new URL("../dist/", import.meta.url));

function createDriver(cfg: DriverConfig) {
  switch (cfg.kind) {
    case "shelly.gen2":
      return createShellyGen2Driver(cfg);
    case "shelly.gen1":
      return createShellyGen1Driver(cfg);
  }
}

// A broken plugs.json is fatal: refuse to start with a clear message rather
// than run with a half-understood config. The file is left untouched.
let plugConfigs: PlugJson[];
try {
  plugConfigs = loadPlugConfigs(new URL("./plugs.json", import.meta.url));
} catch (e) {
  if (!(e instanceof ConfigError)) throw e;
  log("error", "server", e.message);
  process.exit(1);
}

const registry = createPlugRegistry(
  plugConfigs.map((c) => ({
    ...c,
    driver: createDriver(c.driver),
    host: c.driver.host,
  })),
);
registry.start();

log("info", "server", `${registry.getState().length} plugs configured`);

// Extra origins allowed to open /ws, comma-separated, e.g. when a reverse
// proxy rewrites the Host header: ALLOWED_ORIGINS=https://plugs.example.com
const extraOrigins = new Set(
  (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
);

// Browsers let any website open a WebSocket to any address, including
// LAN devices, and they don't apply CORS to WebSockets. Without this check,
// a malicious page open on any device in the house could switch plugs.
// Browsers always send Origin on WebSocket requests, so we require it to
// match the host the UI was served from. Non-browser clients (scripts, curl)
// send no Origin and are allowed, because they aren't the threat here.
function isAllowedOrigin(origin: string | undefined, host: string | undefined) {
  if (origin === undefined) return true;
  if (extraOrigins.has(origin)) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

const app = new Hono();

// Single WebSocket channel: server pushes state, client sends set requests.
// Non-upgrade requests fall through to the routes below.
app.get(
  "/ws",
  async (c, next) => {
    const origin = c.req.header("origin");
    if (!isAllowedOrigin(origin, c.req.header("host"))) {
      log("warn", "ws", `rejected connection from origin ${origin}`);
      return c.text("Forbidden origin", 403);
    }
    await next();
  },
  upgradeWebSocket(() => createWebSocketHandler(registry)),
);

// Static UI assets produced by `pnpm build`.
app.use("/*", serveStatic({ root: distRoot }));

// SPA fallback: unknown GET routes render index.html so client-side routing
// (if/when we add react-router) keeps working on a hard refresh. Read per
// request so a rebuild while the server runs is picked up.
app.get("/*", (c) => {
  try {
    return c.html(readFileSync(distRoot + "index.html", "utf-8"));
  } catch {
    return c.text("UI not built yet. Run `pnpm build`.", 503);
  }
});

const port = Number(process.env.PORT ?? 8000);
const wss = new WebSocketServer({ noServer: true });

const server = serve(
  { fetch: app.fetch, port, websocket: { server: wss } },
  (info) => log("info", "server", `listening on :${info.port}`),
);

// Graceful shutdown. Node ignores SIGTERM by default when it runs as PID 1
// (as in Docker), so without this `docker stop` waits 10s and then kills us.
let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log("info", "server", `${signal} received, shutting down`);
  registry.stop();
  for (const client of wss.clients) client.close(1001, "server shutting down");
  server.close(() => process.exit(0));
  // Don't hang on stuck sockets: force-close them, and exit no matter what.
  if ("closeAllConnections" in server) server.closeAllConnections();
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
