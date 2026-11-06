// Shared protocol between the Plugs frontend and the Node server.
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
  toggling: boolean;
  confirm?: boolean;
  /** IP / hostname of the physical device. Used by the UI to deep-link to the Shelly web UI. */
  host?: string;
};

// Server → Client
export type ServerMessage = { type: "state"; plugs: Plug[] };

// Client → Server
// Carries the *desired* state rather than "flip it": if the plug changed in
// the meantime (another tab, the physical button), a stale click can't
// accidentally switch it the opposite way.
export type ClientMessage = { type: "set"; id: string; on: boolean };
