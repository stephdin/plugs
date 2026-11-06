// Loads and validates plugs.json.
//
// Rules:
//   - Missing file   → create an empty `[]` and run with no plugs.
//   - Directory      → warn and run with no plugs. This happens when Docker
//                      bind-mounts a path that doesn't exist on the host.
//   - Anything else wrong (unreadable, invalid JSON, bad entries) → throw a
//     ConfigError listing every problem. The file is NEVER written in this
//     case, so a typo can't wipe the config.

import { readFileSync, writeFileSync } from "node:fs";

import type { ShellyGen1Config } from "../drivers/shelly_gen1.ts";
import type { ShellyGen2Config } from "../drivers/shelly_gen2.ts";
import { log } from "./log.ts";

export type DriverConfig = ShellyGen2Config | ShellyGen1Config;

export type PlugJson = {
  id: string;
  name: string;
  description?: string;
  readOnly?: boolean;
  confirm?: boolean;
  driver: DriverConfig;
};

const DRIVER_KINDS: readonly DriverConfig["kind"][] = [
  "shelly.gen2",
  "shelly.gen1",
];

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function loadPlugConfigs(url: URL): PlugJson[] {
  let text: string;
  try {
    text = readFileSync(url, "utf-8");
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      try {
        // `wx` fails if the file appeared in the meantime, so we can't
        // clobber anything even in that race.
        writeFileSync(url, "[]\n", { flag: "wx" });
        log("info", "server", "created empty plugs.json");
      } catch {
        log("warn", "server", "cannot create plugs.json, no plugs configured");
      }
      return [];
    }
    if (code === "EISDIR") {
      log("warn", "server", "plugs.json is a directory, no plugs configured");
      return [];
    }
    throw new ConfigError(
      `cannot read plugs.json: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new ConfigError(
      `plugs.json is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  return validate(raw);
}

function validate(raw: unknown): PlugJson[] {
  if (!Array.isArray(raw)) {
    throw new ConfigError("plugs.json must contain a JSON array of plugs");
  }

  const errors: string[] = [];
  const seenIds = new Set<string>();

  raw.forEach((entry: unknown, i) => {
    const at = `plug #${i + 1}`;
    if (!isObject(entry)) {
      errors.push(`${at}: must be an object`);
      return;
    }
    const label =
      typeof entry.name === "string" ? `${at} ("${entry.name}")` : at;
    const err = (msg: string) => errors.push(`${label}: ${msg}`);

    if (typeof entry.id !== "string" || entry.id === "") {
      err(`"id" must be a non-empty string`);
    } else if (seenIds.has(entry.id)) {
      err(`duplicate id "${entry.id}"`);
    } else {
      seenIds.add(entry.id);
    }
    if (typeof entry.name !== "string" || entry.name === "") {
      err(`"name" must be a non-empty string`);
    }
    for (const key of ["description"] as const) {
      if (entry[key] !== undefined && typeof entry[key] !== "string") {
        err(`"${key}" must be a string`);
      }
    }
    for (const key of ["readOnly", "confirm"] as const) {
      if (entry[key] !== undefined && typeof entry[key] !== "boolean") {
        err(`"${key}" must be true or false`);
      }
    }

    const d = entry.driver;
    if (!isObject(d)) {
      err(`"driver" must be an object`);
      return;
    }
    if (!DRIVER_KINDS.includes(d.kind as DriverConfig["kind"])) {
      err(
        `driver.kind must be one of ${DRIVER_KINDS.map((k) => `"${k}"`).join(", ")} (got ${JSON.stringify(d.kind)})`,
      );
    }
    if (typeof d.host !== "string" || d.host === "") {
      err(`driver.host must be a non-empty string`);
    }
    if (!Number.isInteger(d.id) || (d.id as number) < 0) {
      err(`driver.id must be a non-negative integer (usually 0)`);
    }
  });

  if (errors.length > 0) {
    throw new ConfigError(
      `plugs.json has ${errors.length} problem(s):\n  - ${errors.join("\n  - ")}`,
    );
  }
  return raw as PlugJson[];
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
