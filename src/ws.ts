// React hook wrapping the single WebSocket connection to the Deno server.
// Re-connects automatically on close so dev HMR / Wi-Fi blips don't kill the
// UI. Toggle commands are queued onto the current socket; state changes come
// in as `state` messages and surface as `plugs`.

import { useEffect, useRef, useState } from "react";
import type { ClientMessage, Plug, ServerMessage } from "./types.ts";

const RECONNECT_DELAY_MS = 2000;

export type PlugsWebSocket = {
  plugs: Plug[];
  ready: boolean;
  toggle: (id: string) => void;
};

export function usePlugsWebSocket(): PlugsWebSocket {
  const [plugs, setPlugs] = useState<Plug[]>([]);
  const [ready, setReady] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;
    let reconnect: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const url = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(url);
      socketRef.current = ws;

      ws.addEventListener("open", () => {
        if (!cancelled) setReady(true);
      });

      ws.addEventListener("message", (e: MessageEvent) => {
        if (cancelled) return;
        let msg: ServerMessage;
        try {
          msg = JSON.parse(e.data) as ServerMessage;
        } catch {
          return;
        }
        if (msg.type === "state") setPlugs(msg.plugs);
      });

      ws.addEventListener("close", () => {
        if (cancelled) return;
        setReady(false);
        socketRef.current = null;
        reconnect = setTimeout(connect, RECONNECT_DELAY_MS);
      });
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnect) clearTimeout(reconnect);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  const toggle = (id: string) => {
    const msg: ClientMessage = { type: "toggle", id };
    socketRef.current?.send(JSON.stringify(msg));
  };

  return { plugs, ready, toggle };
}
