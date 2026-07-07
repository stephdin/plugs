// WebSocket transport: one channel (/ws) per client. The server pushes
// `state` messages whenever the registry changes; clients send `toggle`
// intents back. Multiple connected clients all receive the same broadcasts.

import type { Registry } from "./plugs.ts";
import type { ClientMessage, ServerMessage } from "./types.ts";
import { log } from "./log.ts";

// Decoupled socket shape — Deno's ServerWebSocket satisfies this, but
// structurally typing it keeps the transport swap-able and test-friendly.
interface WebSocketLike {
  addEventListener(
    type: string,
    listener: (e: { data?: unknown }) => void,
  ): void;
  send(data: string): void;
}

export function handleWebSocket(socket: WebSocketLike, registry: Registry) {
  const send = (msg: ServerMessage) => {
    try {
      socket.send(JSON.stringify(msg));
    } catch {
      // socket already closed — cleanup happens in the close listener.
    }
  };

  // Fresh snapshot on connect.
  socket.addEventListener("open", () => {
    log("info", "ws", "client connected");
    send({ type: "state", plugs: registry.getState() });
  });

  // Forward all subsequent state changes to this client.
  const unsubscribe = registry.subscribe((plugs) => {
    send({ type: "state", plugs });
  });

  // Receive toggle intents.
  socket.addEventListener("message", async (e) => {
    let msg: ClientMessage;
    try {
      if (typeof e.data !== "string") return;
      msg = JSON.parse(e.data) as ClientMessage;
    } catch {
      return;
    }
    switch (msg.type) {
      case "toggle":
        await registry.toggle(msg.id);
        break;
    }
  });

  // Detach on close / error so we don't broadcast to dead sockets.
  const cleanup = () => {
    log("info", "ws", "client disconnected");
    unsubscribe();
  };
  socket.addEventListener("close", cleanup);
  socket.addEventListener("error", cleanup);
}
