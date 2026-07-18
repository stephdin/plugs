# Stage 1 — Build the Vite frontend
FROM node:22-alpine AS builder
WORKDIR /build

# Install pnpm via corepack
RUN corepack enable

# Dependencies first (layer caching)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Source code & config
COPY tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts index.html ./
COPY shared/ shared/
COPY src/ src/

RUN pnpm build  # → dist/

# Stage 2 — Deno runtime
FROM denoland/deno:alpine
WORKDIR /app

# Built static assets
COPY --from=builder /build/dist ./dist

# Deno server source
COPY server/ ./server/

# Deno looks for deno.json in CWD to resolve import maps;
# copy it here so bare specifiers like "hono" work.
COPY server/deno.json ./deno.json

EXPOSE 8000
CMD ["deno", "run", "-A", "server/main.ts"]
