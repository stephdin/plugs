// Tiny logger. Keeps timestamps and levels consistent without pulling in a
// dependency. Add fields as you need them, but keep it boring.
//
// Example output:
//   2026-07-08T22:14:01.123  INFO  server  listening on :8000
//   2026-07-08T22:14:02.631  WARN  plugs   "Ventilator" unreachable: fetch failed

const LEVELS = ["debug", "info", "warn", "error"] as const;
type Level = (typeof LEVELS)[number];

export function log(level: Level, scope: string, message: string): void;
export function log(scope: string, message: string): void;
export function log(...a: [Level, string, string] | [string, string]): void {
  const [level, scope, message] =
    a.length === 3 ? a : (["info", ...a] as [Level, string, string]);
  const ts = new Date().toISOString();

  console.log(`${ts} ${level.toUpperCase().padEnd(5)} ${scope} ${message}`);
}
