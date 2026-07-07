// Tiny logger. Keeps timestamps and levels consistent without pulling in a
// dependency. Add fields as you need them, but keep it boring.
//
// Example output:
//   2026-07-08T22:14:01.123  INFO  server  listening on :8000
//   2026-07-08T22:14:02.631  WARN  plugs   "Ventilator" unreachable: fetch failed

const LEVELS = ["debug", "info", "warn", "error"] as const;
type Level = (typeof LEVELS)[number];

const LEVEL_COLORS: Record<Level, string> = {
  debug: "\x1b[90m", // gray
  info: "\x1b[36m", // cyan
  warn: "\x1b[33m", // yellow
  error: "\x1b[31m", // red
};

const RESET = "\x1b[0m";

export function log(level: Level, scope: string, message: string): void;
export function log(scope: string, message: string): void;
export function log(...a: [Level, string, string] | [string, string]): void {
  const [level, scope, message] =
    a.length === 3 ? a : (["info", ...a] as [Level, string, string]);
  const ts = new Date().toISOString();
  const color = LEVEL_COLORS[level];
  console.log(
    `${ts}  ${color}${level.toUpperCase().padEnd(5)}${RESET}  ${scope}  ${message}`,
  );
}