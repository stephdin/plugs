# Plugs

A minimal mobile-first dashboard for Shelly smart plugs. See the live state of
every plug at a glance — on/off, current power draw — and toggle relays from
your phone.

## Architecture

```
Browser     ──WS──▶      Deno (Hono)       ──HTTP──▶       Shelly Plug
         single channel                  per-plug polling
```

The browser only speaks Plugs' own small protocol over a single WebSocket — it
never talks to a plug directly. The Deno process is the source of truth: it
polls each plug over HTTP, holds the canonical state, and broadcasts changes
to every connected client. That keeps the UI dead simple and lets multiple
tabs (phone + laptop, etc.) stay in sync automatically.

Adding a new device type (e.g. Gen1 Shelly Plug S) is a new driver in
`server/shelly.ts` implementing the `Driver` interface — no changes to the UI
or the WebSocket protocol.

## Stack

- **UI**: React + Mantine, built by Vite to static assets
- **Server**: Deno + Hono, serves the UI and the `/ws` channel
- **Device**: Shelly Gen2/Gen3 JSON-RPC HTTP API (`Switch.GetStatus`,
  `Switch.Set`)

## Project layout

```
src/                  React/Mantine frontend
  App.tsx             Plug list + header (live total, settings)
  ws.ts               WebSocket hook with auto-reconnect
  types.ts            Wire protocol (mirrors server)
server/               Deno + Hono backend
  server.ts           HTTP + /ws entry point, serves dist/
  plugs.ts            Registry: canonical state, poll loop, broadcast
  shelly.ts           Driver interface + Shelly Gen2 driver
  ws.ts                Per-client WebSocket handler
  types.ts            Wire protocol (mirrors src)
dist/                 Built UI (produced by `pnpm build`)
```

## Develop

Two terminals — Vite for HMR, Deno for the WebSocket + plug polling.

```bash
deno task dev          # :8000 — polls plugs, serves /ws
pnpm dev               # :5173 — Vite dev server, proxies /ws → :8000
```

Open <http://localhost:5173>.

## Run

```bash
pnpm build             # → dist/
deno task start        # :8000 — serves dist/ + /ws
```

Open <http://localhost:8000> (or your Pi's address once deployed).

## Tooling notes

- Built with the React Compiler enabled (see `vite.config.ts`).
- Oxlint for linting (`pnpm lint`), Vite for building, Deno for the server.
