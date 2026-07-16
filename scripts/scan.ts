// Shelly plug network scanner.
//
// Discovers Shelly smart plugs on your local network by probing every IP in
// each local /24 subnet via HTTP. Supports any device family registered in the
// `probes` table below — add a new entry to support a new family.
//
// Usage: deno run -A scripts/scan.ts
//
// Prints a JSON array you can paste directly into server/plugs.json.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Driver config snippet shared with server/main.ts. `kind` selects the driver;
// the rest is driver-specific.
type DriverConfig = { kind: string; host: string; id: number };

// A fully-scanned plug: enough to render a plugs.json entry plus a summary row.
type DiscoveredPlug = {
  name: string | null;
  model: string;
  driver: DriverConfig;
};

// One probe per device family. `kind` matches the `kind` field in plugs.json
// and the switch in server/main.ts. `parse` returns null when the response
// isn't one of ours, so probes can be tried in order against the same IP.
type Probe = {
  kind: string;
  path: string;
  parse: (
    info: unknown,
  ) => { name: string | null; model: string; id: number } | null;
};

// ---------------------------------------------------------------------------
// Probes — add new device families here.
// ---------------------------------------------------------------------------

// Gen2/Gen3 (e.g. Shelly Plus Plug, Shelly Plug S Gen3): JSON-RPC device info.
// Gen1 (e.g. Shelly Plug S): the legacy /shelly endpoint, which only replies
// with a `type` field, so we use that as both the model and the detector.
const probes: Probe[] = [
  {
    kind: "shelly.gen2",
    path: "/rpc/Shelly.GetDeviceInfo",
    parse: (info) => {
      const i = info as { name?: string; model?: string };
      return { name: i.name ?? null, model: i.model ?? "unknown", id: 0 };
    },
  },
  {
    kind: "shelly.gen1",
    path: "/shelly",
    parse: (info) => {
      const i = info as { type?: string; name?: string };
      return i.type ? { name: i.name ?? null, model: i.type, id: 0 } : null;
    },
  },
];

// ---------------------------------------------------------------------------
// Networking
// ---------------------------------------------------------------------------

/** GET `url` as JSON, or null on any network/HTTP/parse failure. */
async function fetchJson(
  url: string,
  timeoutMs: number,
): Promise<unknown | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** /24 prefixes of all non-loopback IPv4 interfaces. */
function localSubnets(): string[] {
  const subnets = new Set<string>();
  for (const iface of Deno.networkInterfaces()) {
    if (iface.family !== "IPv4" || iface.address === "127.0.0.1") continue;
    subnets.add(iface.address.split(".").slice(0, 3).join("."));
  }
  return [...subnets];
}

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

/** Try each probe against `ip` in order; return the first hit or null. */
async function probeIp(
  ip: string,
  timeoutMs: number,
): Promise<DiscoveredPlug | null> {
  for (const probe of probes) {
    const info = await fetchJson(`http://${ip}${probe.path}`, timeoutMs);
    if (!info) continue;
    const hit = probe.parse(info);
    if (hit) {
      return {
        name: hit.name,
        model: hit.model,
        driver: { kind: probe.kind, host: ip, id: hit.id },
      };
    }
  }
  return null;
}

async function scanSubnet(
  subnet: string,
  concurrency: number,
  timeoutMs: number,
): Promise<DiscoveredPlug[]> {
  const ips = Array.from({ length: 254 }, (_, i) => `${subnet}.${i + 1}`);
  const found: DiscoveredPlug[] = [];

  for (let i = 0; i < ips.length; i += concurrency) {
    const batch = ips.slice(i, i + concurrency);
    const hits = await Promise.all(batch.map((ip) => probeIp(ip, timeoutMs)));
    for (const d of hits) {
      if (!d) continue;
      found.push(d);
      console.log(
        `  ✓ ${d.model.padEnd(16)} ${d.driver.host}${
          d.name ? `  "${d.name}"` : ""
        }`,
      );
    }
    const done = Math.min(i + concurrency, ips.length);
    Deno.stdout.writeSync(
      new TextEncoder().encode(`\r  ${done}/${ips.length} IPs scanned…`),
    );
  }

  console.log(""); // newline after progress
  return found;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

type PlugJson = {
  id: string;
  name: string;
  description?: string;
  readOnly: boolean;
  confirm: boolean;
  driver: DriverConfig;
};

function toPlugJson(d: DiscoveredPlug, id: string): PlugJson {
  return {
    id,
    name: d.name ?? `Shelly ${d.model}`,
    description: "",
    readOnly: false,
    confirm: false,
    driver: d.driver,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const concurrency = 40;
  const timeoutMs = 800;

  console.log("Shelly Plug Scanner\n");

  const subnets = localSubnets();
  console.log(
    `Scanning ${subnets.length} subnet(s): ${subnets.join(".0/24, ")}.0/24`,
  );

  const found: DiscoveredPlug[] = [];
  for (const subnet of subnets) {
    console.log(`\nScanning ${subnet}.0/24…`);
    found.push(...(await scanSubnet(subnet, concurrency, timeoutMs)));
  }

  console.log(`\nFound ${found.length} Shelly device(s):`);
  for (const d of found) {
    const label = d.name ?? "(unnamed)";
    console.log(
      `${label.padEnd(16)} ${d.driver.host.padEnd(16)} ${d.model.padEnd(
        16,
      )} ${d.driver.kind}`,
    );
  }

  if (found.length > 0) {
    console.log("\nplugs.json snippet:");
    console.log(
      JSON.stringify(
        found.map((d, i) => toPlugJson(d, String(i))),
        null,
        2,
      ),
    );
  }
}

if (import.meta.main) {
  await main();
}
