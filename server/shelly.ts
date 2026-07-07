// Device drivers. Each maps a specific Shelly generation's HTTP/WS API onto
// our custom Plug readings. Adding Gen1 (S171) later = new driver here, no
// changes elsewhere.

import type { Plug } from "./types.ts";

/** Minimal contract for any plug driver to implement. */
export interface Driver {
  fetchStatus(): Promise<{ on: boolean; activeWatts: number }>;
  setOutput(on: boolean): Promise<void>;
}

// ---------------------------------------------------------------------------
// Gen2 / Gen3 Shelly (e.g. Shelly Plus Plug, Shelly Plug S gen3)
// Speaks the JSON-RPC over HTTP API: /rpc/Switch.GetStatus, /rpc/Switch.Set.
// ---------------------------------------------------------------------------

export type ShellyGen2Config = {
  kind: "shelly.gen2";
  host: string;
  /** Switch channel id; usually 0 for a single-channel plug. */
  id: number;
};

type RawShellyGen2Status = {
  output: boolean;
  apower: number;
};

export function createShellyGen2Driver(config: ShellyGen2Config): Driver {
  const base = `http://${config.host}/rpc`;

  return {
    async fetchStatus() {
      const res = await fetch(`${base}/Switch.GetStatus?id=${config.id}`);
      if (!res.ok) throw new Error(`Switch.GetStatus failed: ${res.status}`);
      const s = (await res.json()) as RawShellyGen2Status;
      return { on: s.output, activeWatts: s.apower };
    },

    async setOutput(on) {
      const res = await fetch(`${base}/Switch.Set?id=${config.id}&on=${on}`);
      if (!res.ok) throw new Error(`Switch.Set failed: ${res.status}`);
    },
  };
}
