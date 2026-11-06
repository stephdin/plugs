# Plugs

A mobile-first dashboard for Shelly smart plugs. See on/off state and current
power draw for every plug, and toggle relays from your phone.

## Architecture

```
Browser     ──WS──▶      Node (Hono)       ──HTTP──▶       Shelly Plug
         single channel                  per-plug polling
```

The browser only talks to the Node server over a single WebSocket. It never
touches a plug directly. The server polls each plug over HTTP, holds the
canonical state, and broadcasts changes to every connected client. This keeps
the UI simple and lets multiple tabs (phone and laptop, say) stay in sync.

To add a new device family, drop a new driver in `server/drivers/` that
implements the `Driver` interface. No UI or WebSocket changes needed. Gen1
and Gen2/Gen3 Shelly drivers are included.

## Stack

- **UI**: React + shadcn/ui (Base UI, Tailwind CSS v4, default dark theme),
  built by Vite to static assets
- **Server**: Node 26 + Hono (`@hono/node-server` + `ws`), serves the UI and
  the `/ws` channel. TypeScript runs directly via Node's type stripping, with
  no build step
- **Device**: Shelly Gen1 HTTP API (`/relay`, `/meter`) and Gen2/Gen3
  JSON-RPC HTTP API (`Switch.GetStatus`, `Switch.Set`)

## Project layout

```
src/                  React/shadcn frontend
  App.tsx             Plug list + header (live total, settings)
  main.tsx            React entry point
  index.css           Tailwind + shadcn theme variables
  ws.ts               WebSocket hook with auto-reconnect
  components/ui/      shadcn components (add more: `pnpm dlx shadcn@latest add <name>`)
  hooks/              useLongPress (long-press opens the plug's web UI)
  lib/utils.ts        `cn()` class-name helper
shared/
  types.ts            Wire protocol, shared by both ends
server/               Node + Hono backend
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

Requires Node 26+ and pnpm. Run `pnpm install`, then two terminals: Vite for
HMR, Node for the WebSocket and plug polling.

```bash
pnpm server:dev        # :8000, polls plugs, serves /ws (restarts on change)
pnpm dev               # :5173, Vite dev server, proxies /ws to :8000
```

To find plugs on your network, run `pnpm scan`. It prints a `plugs.json`
snippet.

Open <http://localhost:5173>.

## Run

```bash
pnpm build             # builds into dist/
pnpm start             # :8000 (override with PORT), serves dist/ and /ws
```

Open <http://localhost:8000> (or your Pi's address once deployed).

### Configuration

- `server/plugs.json` is created as an empty `[]` if it doesn't exist. If it
  exists but is invalid (bad JSON, missing or wrong fields, duplicate ids),
  the server refuses to start and lists every problem. It never rewrites an
  existing file.
- `PORT` sets the listen port (default `8000`).
- `ALLOWED_ORIGINS` is a comma-separated list of extra origins allowed to
  open `/ws`. By default only pages served from the same host can connect,
  so other websites can't switch your plugs. You only need this behind a
  reverse proxy that rewrites the `Host` header, e.g.
  `ALLOWED_ORIGINS=https://plugs.example.com`.
- The server shuts down cleanly on `SIGTERM`/`SIGINT`, so `docker stop` is
  instant.

## Tooling notes

- Built with the React Compiler enabled (see `vite.config.ts`).
- Oxlint for linting (`pnpm lint`), Vite for building, Node for the server.
- `pnpm check:server` type-checks the server with `strict`,
  `noUncheckedIndexedAccess` and `erasableSyntaxOnly` (so everything stays
  runnable by Node's type stripping: no enums, namespaces or parameter
  properties).
