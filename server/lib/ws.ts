// WebSocket transport: one channel (/ws) per client. The server pushes
// `state` messages whenever the registry changes; clients send `set`
// requests back. Multiple connected clients all receive the same broadcasts.
//
// Returns Hono's runtime-agnostic `WSEvents`, so this file doesn't care
// which adapter (Node, Deno, Bun, …) performs the actual upgrade.

import type { WSContext, WSEvents } from "hono/ws";

import type { Registry } from "./registry.ts";
import type { ClientMessage, ServerMessage } from "../../shared/types.ts";
import { log } from "./log.ts";

export function createWebSocketHandler(registry: Registry): WSEvents {
  let unsubscribe: (() => void) | null = null;

  const send = (ws: WSContext, msg: ServerMessage) => {
    if (!unsubscribe) return;
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // socket already closed — cleanup happens in onClose.
    }
  };

  // Detach on close / error so we don't broadcast to dead sockets.
  const cleanup = () => {
    if (!unsubscribe) return;
    unsubscribe();
    unsubscribe = null;
    log("info", "ws", "client disconnected");
  };

  return {
    onOpen(_evt, ws) {
      log("info", "ws", "client connected");
      // Subscribe before sending the snapshot so no poll update is missed.
      unsubscribe = registry.subscribe((plugs) => {
        send(ws, { type: "state", plugs });
      });
      send(ws, { type: "state", plugs: registry.getState() });
    },

    // Receive set requests.
    async onMessage(evt) {
      if (typeof evt.data !== "string") return;
      let msg: ClientMessage;
      try {
        msg = JSON.parse(evt.data) as ClientMessage;
      } catch {
        return;
      }
      // Guard against valid-JSON-but-wrong-shape payloads (e.g. `null` or a
      // bare number) — without this, `msg.type` would throw synchronously
      // and surface as an unhandled promise rejection.
      if (!msg || typeof msg !== "object") return;
      switch (msg.type) {
        case "set":
          if (typeof msg.id !== "string" || typeof msg.on !== "boolean") {
            return;
          }
          await registry.set(msg.id, msg.on);
          break;
      }
    },

    onClose: cleanup,
    onError: cleanup,
  };
}
