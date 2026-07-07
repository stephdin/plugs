// Shared protocol between the Plugs frontend and the Deno server.
// Mirrors server/types.ts — keep both in sync when you change anything here.

export type Plug = {
  id: string;
  name: string;
  /** Human-readable note shown under the plug name. */
  description?: string;
  /** Where the plug lives, e.g. a room name. */
  location?: string;
  on: boolean;
  /** When true, state is still being fetched — show a spinner. */
  loading: boolean;
  /** When true, the plug can't be reached — toggle is disabled. */
  offline: boolean;
  /** Power draw when on, in watts. */
  activeWatts: number;
  /** When true, the plug cannot be toggled from the UI (e.g. a fridge). */
  readOnly: boolean;
};

// Server → Client
export type ServerMessage =
  | { type: "state"; plugs: Plug[] };

// Client → Server
export type ClientMessage =
  | { type: "toggle"; id: string };
