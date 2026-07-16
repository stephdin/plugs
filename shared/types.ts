// Shared protocol between the Plugs frontend and the Deno server.
// This is the single source of truth for shared types.

export type Plug = {
  id: string;
  name: string;
  description?: string;
  on: boolean;
  loading: boolean;
  offline: boolean;
  activeWatts: number;
  readOnly: boolean;
  confirm?: boolean;
};

// Server → Client
export type ServerMessage = { type: "state"; plugs: Plug[] };

// Client → Server
export type ClientMessage = { type: "toggle"; id: string };
