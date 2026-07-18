// Shared HTTP helper for plug drivers.
//
// Bounds every device request so a vanished plug is detected in seconds
// rather than waiting on the OS TCP retransmit backoff (~20s on Windows).

// 15s gives flaky Wi-Fi plenty of room to complete a request. Your network
// may spike to 10–15s during disruptions; timing out sooner just produces
// "signal aborted" noise and forces expensive retries.
const DEFAULT_TIMEOUT_MS = 15000;

/** fetch() wrapper that aborts after `timeoutMs` (default 15s). */
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
