# Plugs

A mobile-first dashboard for Shelly smart plugs. See on/off state and current
power draw for every plug, and toggle relays from your phone.

## Architecture

```
Browser     ──WS──▶      Deno (Hono)       ──HTTP──▶       Shelly Plug
         single channel                  per-plug polling
```

The browser only talks to the Deno server over a single WebSocket. It never
touches a plug directly. The server polls each plug over HTTP, holds the
canonical state, and broadcasts changes to every connected client. This keeps
the UI simple and lets multiple tabs (phone and laptop, say) stay in sync.

To add a new device family, drop a new driver in `server/drivers/` that
implements the `Driver` interface. No UI or WebSocket changes needed. Gen1
and Gen2/Gen3 Shelly drivers are included.

## Stack

- **UI**: React + Mantine, built by Vite to static assets
- **Server**: Deno + Hono, serves the UI and the `/ws` channel
- **Device**: Shelly Gen1 HTTP API (`/relay`, `/meter`) and Gen2/Gen3
  JSON-RPC HTTP API (`Switch.GetStatus`, `Switch.Set`)

## Project layout

```
src/                  React/Mantine frontend
  App.tsx             Plug list + header (live total, settings)
  main.tsx            React entry point
  ws.ts               WebSocket hook with auto-reconnect
shared/
  types.ts            Wire protocol, shared by both ends
server/               Deno + Hono backend
  main.ts             HTTP + /ws entry point, serves dist/
  plugs.json          Plug configuration (see plugs.example.json)
  lib/
    registry.ts       Canonical state, poll loop, toggle handling
    ws.ts             Per-client WebSocket handler
    log.ts            Small leveled logger
  drivers/
    types.ts          Driver interface
    http.ts           fetch() with AbortController-based timeout
    shelly_gen1.ts    Gen1 Shelly driver (legacy HTTP API)
    shelly_gen2.ts    Gen2/Gen3 Shelly driver (JSON-RPC API)
dist/                 Built UI (produced by `pnpm build`)
```

## Develop

Run two terminals: Vite for HMR, Deno for the WebSocket and plug polling.

```bash
deno task dev          # :8000, polls plugs, serves /ws
pnpm dev               # :5173, Vite dev server, proxies /ws to :8000
```

Open <http://localhost:5173>.

## Run

```bash
pnpm build             # builds into dist/
deno task start        # :8000, serves dist/ and /ws
```

Open <http://localhost:8000> (or your Pi's address once deployed).

## Tooling notes

- Built with the React Compiler enabled (see `vite.config.ts`).
- Oxlint for linting (`pnpm lint`), Vite for building, Deno for the server.
- `deno task check` type-checks the server with `strict` and
  `noUncheckedIndexedAccess`.
