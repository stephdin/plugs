// Shared HTTP helper for plug drivers.
//
// Bounds every device request so a vanished plug is detected in seconds
// rather than waiting on the OS TCP retransmit backoff (~20s on Windows).

// 2s catches real-world Wi-Fi jitter (observed: a Gen1 plug spiked to 899ms
// during a network disruption and barely survived a 1s deadline) while still
// detecting a genuinely dead plug quickly enough for a smart-home UI.
const DEFAULT_TIMEOUT_MS = 2000;

/** fetch() wrapper that aborts after `timeoutMs` (default 2s). */
export async function fetchWithTimeout(
  url: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}
