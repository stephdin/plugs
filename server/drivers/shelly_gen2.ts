// Gen2 / Gen3 Shelly driver (e.g. Shelly Plus Plug, Shelly Plug S Gen3).
// Speaks the JSON-RPC over HTTP API: /rpc/Switch.GetStatus, /rpc/Switch.Set.

import { fetchWithTimeout } from "./http.ts";
import type { Driver } from "./types.ts";

export type ShellyGen2Config = {
  kind: "shelly.gen2";
  host: string;
  /** Switch channel id; usually 0 for a single-channel plug. */
  id: number;
};

// Gen2 RPC returns the result object directly on success, but reports
// failures as a `{ code, message }` body — often with HTTP 200. Checking
// only `res.ok` would silently treat those failures as success and let the
// registry patch `on` to a value the device never applied.
type RawShellyGen2Status = {
  output: boolean;
  apower?: number;
};

type ShellyRpcError = { code: number; message: string };

// Throw on RPC-level errors. No-op for success bodies, which don't carry
// `code`/`message` at the top level.
function checkRpcError(body: unknown): void {
  if (
    typeof body === "object" &&
    body !== null &&
    "code" in body &&
    "message" in body
  ) {
    const err = body as ShellyRpcError;
    throw new Error(`Shelly RPC error ${err.code}: ${err.message}`);
  }
}

export function createShellyGen2Driver(config: ShellyGen2Config): Driver {
  const base = `http://${config.host}/rpc`;

  return {
    async fetchStatus() {
      const res = await fetchWithTimeout(
        `${base}/Switch.GetStatus?id=${config.id}`,
      );
      if (!res.ok) throw new Error(`Switch.GetStatus failed: ${res.status}`);
      const s = (await res.json()) as RawShellyGen2Status;
      checkRpcError(s);
      // `apower` is absent on unmetered devices (e.g. Shelly 1) — fall back
      // to 0 W rather than leak undefined into the Driver contract.
      return { on: s.output, activeWatts: s.apower ?? 0 };
    },

    async setOutput(on) {
      const res = await fetchWithTimeout(
        `${base}/Switch.Set?id=${config.id}&on=${on}`,
      );
      if (!res.ok) throw new Error(`Switch.Set failed: ${res.status}`);
      // Switch.Set returns `{ was_on: boolean }` on success, or an RPC
      // error body on failure (overload, locked relay, bad id). Without
      // this check a device-side failure would be reported as success and
      // the UI would show the wrong state until the next poll corrects it.
      checkRpcError(await res.json());
    },
  };
}
