// Plug registry: holds the canonical state, polls each plug via its driver
// at a fixed cadence, broadcasts state changes to subscribers, and processes
// toggle intents from connected clients. This is the single source of truth
// for the UI — clients never talk to plugs directly.

import type { Plug } from "../../shared/types.ts";
import type { Driver } from "../drivers/types.ts";
import { log } from "./log.ts";

type PlugConfig = {
  id: string;
  name: string;
  description?: string;
  driver: Driver;
  readOnly?: boolean;
  confirm?: boolean;
};

export type Registry = {
  getState(): Plug[];
  toggle(id: string): Promise<void>;
  subscribe(fn: (plugs: Plug[]) => void): () => void;
  start(): void;
};

const POLL_INTERVAL_MS = 1500;

export function createPlugRegistry(configs: PlugConfig[]): Registry {
  // Every plug starts in an unknown state; the first poll resolves it to
  // either `offline` or `loaded` once the device replies.
  let state: Plug[] = configs.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    on: false,
    loading: true,
    offline: false,
    activeWatts: 0,
    readOnly: c.readOnly ?? false,
    confirm: c.confirm,
  }));

  const subscribers = new Set<(plugs: Plug[]) => void>();
  // Ids of plugs whose poll is still in flight. Used to skip re-entrant polls.
  const inFlight = new Set<string>();
  const notify = () => {
    for (const fn of subscribers) fn(state);
  };
  const patch = (id: string, p: Partial<Plug>) => {
    state = state.map((x) => (x.id === id ? { ...x, ...p } : x));
    notify();
  };

  const poll = async (c: PlugConfig) => {
    // Skip if a previous poll for this plug hasn't returned yet (e.g. a slow
    // or hung device). Without this, overlapping polls resolve out of order
    // when the device comes back, flapping offline/on and on/off.
    if (inFlight.has(c.id)) return;
    inFlight.add(c.id);
    try {
      const status = await c.driver.fetchStatus();
      const wasOffline = state.find((p) => p.id === c.id)?.offline;
      patch(c.id, { loading: false, offline: false, ...status });
      if (wasOffline) log("info", "plug", `"${c.name}" back online`);
    } catch (e) {
      const wasOffline = state.find((p) => p.id === c.id)?.offline;
      // Keep the last known `on` / `activeWatts`; only mark unreachable.
      patch(c.id, { loading: false, offline: true });
      // Only log the first failure of a streak to avoid spamming every poll.
      if (!wasOffline) {
        log(
          "warn",
          "plug",
          `"${c.name}" unreachable: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    } finally {
      inFlight.delete(c.id);
    }
  };

  return {
    getState: () => state,

    async toggle(id) {
      const current = state.find((p) => p.id === id);
      const cfg = configs.find((c) => c.id === id);
      if (
        !current ||
        !cfg ||
        current.loading ||
        current.offline ||
        current.readOnly
      ) {
        return;
      }

      const next = !current.on;
      log("info", "plug", `toggle "${current.name}" → ${next ? "on" : "off"}`);
      // Optimistic: flip immediately so every client feels responsive; the
      // next poll reconciles `apower` and confirms the relay actually moved.
      patch(id, { on: next });
      try {
        await cfg.driver.setOutput(next);
      } catch (e) {
        log(
          "warn",
          "plug",
          `toggle failed for "${current.name}": ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
        // Revert on failure and mark unreachable; poll will retry.
        patch(id, { on: !next, offline: true });
      }
    },

    subscribe(fn) {
      subscribers.add(fn);
      return () => {
        subscribers.delete(fn);
      };
    },

    start() {
      for (const c of configs) void poll(c);
      setInterval(() => {
        for (const c of configs) void poll(c);
      }, POLL_INTERVAL_MS);
    },
  };
}
