// Gen1 Shelly driver (e.g. Shelly Plug S, Shelly 1).
// Speaks the legacy HTTP API: /relay/<id> for relay state and control,
// /meter/<id> for instantaneous power.

import { fetchWithTimeout } from "./http.ts";
import type { Driver } from "./types.ts";

export type ShellyGen1Config = {
  kind: "shelly.gen1";
  host: string;
  /** Relay channel id; usually 0 for a single-channel plug. */
  id: number;
};

type RawShellyGen1Relay = {
  ison: boolean;
};

type RawShellyGen1Meter = {
  power: number;
};

export function createShellyGen1Driver(config: ShellyGen1Config): Driver {
  const base = `http://${config.host}`;

  return {
    async fetchStatus() {
      const relayRes = await fetchWithTimeout(`${base}/relay/${config.id}`);
      if (!relayRes.ok) {
        throw new Error(`relay/${config.id} failed: ${relayRes.status}`);
      }
      const relay = (await relayRes.json()) as RawShellyGen1Relay;

      // Power metering is a separate endpoint on Gen1 and not all devices have
      // it. A missing meter is not an error — report 0 W and let the relay
      // state through. Use a short timeout: a real meter replies in
      // milliseconds, so 1s is plenty to decide it's absent and keeps polls
      // fast on meter-less devices.
      let activeWatts = 0;
      try {
        const meterRes = await fetchWithTimeout(
          `${base}/meter/${config.id}`,
          1000,
        );
        if (meterRes.ok) {
          const meter = (await meterRes.json()) as RawShellyGen1Meter;
          activeWatts = meter.power;
        }
      } catch {
        // No meter — leave activeWatts at 0.
      }

      return { on: relay.ison, activeWatts };
    },

    async setOutput(on) {
      const turn = on ? "on" : "off";
      const res = await fetchWithTimeout(
        `${base}/relay/${config.id}?turn=${turn}`,
      );
      if (!res.ok) {
        throw new Error(
          `relay/${config.id}?turn=${turn} failed: ${res.status}`,
        );
      }
    },
  };
}
