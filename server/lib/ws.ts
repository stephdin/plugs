// WebSocket transport: one channel (/ws) per client. The server pushes
// `state` messages whenever the registry changes; clients send `toggle`
// intents back. Multiple connected clients all receive the same broadcasts.

import type { Registry } from "./registry.ts";
import type { ClientMessage, ServerMessage } from "../../shared/types.ts";
import { log } from "./log.ts";

// Decoupled socket shape — Deno's ServerWebSocket satisfies this, but
// structurally typing it keeps the transport swap-able and test-friendly.
interface WebSocketLike {
  addEventListener(
    type: string,
    listener: (e: { data?: unknown }) => void,
  ): void;
  send(data: string): void;
  readyState: number;
}

export function handleWebSocket(socket: WebSocketLike, registry: Registry) {
  let unsubscribed = false;

  const send = (msg: ServerMessage) => {
    if (unsubscribed) return;
    try {
      socket.send(JSON.stringify(msg));
    } catch {
      // socket already closed — cleanup happens in the close listener.
    }
  };

  // Subscribe to state changes immediately so no poll update is missed.
  const unsubscribe = registry.subscribe((plugs) => {
    send({ type: "state", plugs });
  });

  // Send the initial state snapshot.  If the socket is already OPEN (the
  // common case in Deno) send right away; otherwise wait for the open event.
  if (socket.readyState === 1 /* WebSocket.OPEN */) {
    log("info", "ws", "client connected (immediate)");
    send({ type: "state", plugs: registry.getState() });
  } else {
    socket.addEventListener("open", () => {
      log("info", "ws", "client connected");
      send({ type: "state", plugs: registry.getState() });
    });
  }

  // Receive toggle intents.
  socket.addEventListener("message", async (e) => {
    if (typeof e.data !== "string") return;
    let msg: ClientMessage;
    try {
      msg = JSON.parse(e.data) as ClientMessage;
    } catch {
      return;
    }
    // Guard against valid-JSON-but-wrong-shape payloads (e.g. `null` or a
    // bare number) — without this, `msg.type` would throw synchronously
    // and surface as an unhandled promise rejection.
    if (!msg || typeof msg !== "object") return;
    switch (msg.type) {
      case "toggle":
        await registry.toggle(msg.id);
        break;
    }
  });

  // Detach on close / error so we don't broadcast to dead sockets.
  const cleanup = () => {
    if (unsubscribed) return;
    unsubscribed = true;
    log("info", "ws", "client disconnected");
    unsubscribe();
  };
  socket.addEventListener("close", cleanup);
  socket.addEventListener("error", cleanup);
}
