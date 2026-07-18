// Plug registry: holds the canonical state, polls each plug via its driver
// at a fixed cadence, broadcasts state changes to subscribers, and processes
// toggle intents from connected clients. This is the single source of truth
// for the UI — clients never talk to plugs directly.

import type { Plug } from "../../shared/types.ts";
import type { Driver } from "../drivers/types.ts";
import { log } from "./log.ts";

// Safety-net timeouts. Drivers should provide their own, but these guard
// against implementations that forget one — and prevent a hung toggle from
// leaving `toggling` stuck on forever.
const POLL_TIMEOUT_MS = 20_000;
const TOGGLE_TIMEOUT_MS = 10_000;

const FAST_POLL_INTERVAL_MS = 1000;
const SLOW_POLL_INTERVAL_MS = 60_000;
// Consecutive poll failures required to mark a previously-online plug
// offline. A single timeout on flaky Wi-Fi shouldn't flap the state.
const MAX_FAIL_STREAK = 2;

type PlugConfig = {
  id: string;
  name: string;
  description?: string;
  driver: Driver;
  readOnly?: boolean;
  confirm?: boolean;
  host: string;
};

export type Registry = {
  getState(): Plug[];
  toggle(id: string): Promise<void>;
  subscribe(fn: (plugs: Plug[]) => void): () => void;
  start(): void;
  stop(): void;
};

// Race a promise against a timeout. Clears the timer as soon as the winner
// resolves, so a fast poll doesn't leave a 20s setTimeout dangling on every
// tick.
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

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
    toggling: false,
    confirm: c.confirm,
    host: c.host,
  }));

  const subscribers = new Set<(plugs: Plug[]) => void>();
  // Consecutive poll failures per plug.
  const failStreak = new Map<string, number>();
  // Plugs we've seen reply successfully at least once. For these we apply
  // the streak rule before marking offline. Plugs we've never seen go
  // offline on the first failure — otherwise a dead network means a
  // 2× timeout spinner before the UI catches on.
  const seenOnline = new Set<string>();
  // Monotonic counter bumped each time a toggle for this plug completes.
  // Each poll captures the value at start; if it differs at completion, a
  // toggle interleaved and we drop the poll's `on` so it can't clobber the
  // toggle's just-applied value with stale device state.
  const toggleSeq = new Map<string, number>();
  // Per-plug pending poll timer, so we can reschedule on cadence changes
  // and clear everything on stop().
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  // Adaptive polling: fast when someone's watching, slow in the background.
  let pollIntervalMs = SLOW_POLL_INTERVAL_MS;
  let running = false;

  const notify = () => {
    for (const fn of subscribers) fn(state);
  };

  // Patch one plug. Notifies subscribers only if at least one field actually
  // changed — a no-op poll (same on/activeWatts as before) doesn't trigger
  // a broadcast or a UI re-render.
  const patch = (id: string, p: Partial<Plug>) => {
    const prev = state.find((x) => x.id === id);
    if (!prev) return;
    const next = { ...prev, ...p };
    const changed = (Object.keys(p) as (keyof Plug)[]).some(
      (k) => next[k] !== prev[k],
    );
    if (!changed) return;
    state = state.map((x) => (x.id === id ? next : x));
    notify();
  };

  // Chain the next poll `pollIntervalMs` after this one completes (not on
  // a fixed wall-clock tick). This naturally serializes polls per plug —
  // no overlapping requests, no need for an inFlight guard — and spaces
  // them out so a slow device doesn't bunch up with the others.
  const scheduleNext = (c: PlugConfig) => {
    if (!running) return;
    timers.set(
      c.id,
      setTimeout(() => {
        void poll(c);
      }, pollIntervalMs),
    );
  };

  const poll = async (c: PlugConfig) => {
    if (!running) return;
    const startSeq = toggleSeq.get(c.id) ?? 0;
    try {
      const status = await withTimeout(c.driver.fetchStatus(), POLL_TIMEOUT_MS);
      failStreak.delete(c.id);
      seenOnline.add(c.id);
      const wasOffline = state.find((p) => p.id === c.id)?.offline;
      const patchData: Partial<Plug> = {
        loading: false,
        offline: false,
        activeWatts: status.activeWatts,
      };
      // If a toggle completed while we were fetching, drop the poll's `on` —
      // the toggle's just-applied value is authoritative, and a poll that
      // started before the toggle may report stale device state.
      if ((toggleSeq.get(c.id) ?? 0) === startSeq) {
        patchData.on = status.on;
      }
      patch(c.id, patchData);
      if (wasOffline) log("info", "plug", `"${c.name}" back online`);
    } catch (e) {
      const streak = (failStreak.get(c.id) ?? 0) + 1;
      failStreak.set(c.id, streak);
      const firstSighting = !seenOnline.has(c.id);
      const markOffline = firstSighting || streak >= MAX_FAIL_STREAK;
      if (markOffline) {
        patch(c.id, { loading: false, offline: true });
      }
      // Log the unreachable transition exactly once per outage, when the
      // streak first crosses the threshold.
      if (streak === MAX_FAIL_STREAK) {
        log(
          "warn",
          "plug",
          `"${c.name}" unreachable: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    } finally {
      scheduleNext(c);
    }
  };

  const adjustInterval = () => {
    const next =
      subscribers.size > 0 ? FAST_POLL_INTERVAL_MS : SLOW_POLL_INTERVAL_MS;
    if (next === pollIntervalMs) return;
    pollIntervalMs = next;
    // Reschedule pending timers so they pick up the new cadence.
    for (const c of configs) {
      const t = timers.get(c.id);
      if (t !== undefined) {
        clearTimeout(t);
        scheduleNext(c);
      }
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
        current.readOnly ||
        current.toggling // ignore double-clicks / re-entrant toggles
      ) {
        return;
      }

      const next = !current.on;
      log("info", "plug", `toggle "${current.name}" → ${next ? "on" : "off"}`);
      // Show spinner — don't flip on optimistically. Poll is the authority
      // on device state; toggle only manages the in-flight indicator.
      patch(id, { toggling: true });
      try {
        await withTimeout(cfg.driver.setOutput(next), TOGGLE_TIMEOUT_MS);
        // Bump the seq BEFORE patching `on` so any poll completing in the
        // same microtask drops its (potentially stale) `on`.
        toggleSeq.set(id, (toggleSeq.get(id) ?? 0) + 1);
        // Device confirmed the change — take over on from the poll.
        patch(id, { on: next, toggling: false });
      } catch (e) {
        log(
          "warn",
          "plug",
          `toggle failed for "${current.name}": ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
        // Don't touch on, don't mark offline. The next poll will show
        // the actual device state.
        patch(id, { toggling: false });
      }
    },

    subscribe(fn) {
      subscribers.add(fn);
      // Speed up polling now that someone's watching.
      adjustInterval();
      return () => {
        subscribers.delete(fn);
        // Relax polling now that nobody's watching.
        adjustInterval();
      };
    },

    start() {
      if (running) return;
      running = true;
      // Kick off the first poll for each plug; each poll schedules the
      // next one in its finally block.
      for (const c of configs) void poll(c);
    },

    stop() {
      running = false;
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    },
  };
}
