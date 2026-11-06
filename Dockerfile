# Stage 1 — Build the Vite frontend
FROM node:26-alpine AS builder
WORKDIR /build

# Install pnpm (corepack is no longer bundled with Node >= 25)
RUN npm install -g pnpm@12

# Dependencies first (layer caching)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Source code & config
COPY tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts index.html components.json ./
COPY shared/ shared/
COPY src/ src/

RUN pnpm build  # → dist/

# Stage 2 — Production dependencies only
FROM node:26-alpine AS deps
WORKDIR /app
RUN npm install -g pnpm@12
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Stage 3 — Node runtime (runs the TypeScript server via type stripping)
FROM node:26-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /build/dist ./dist
COPY shared/ ./shared/
COPY server/ ./server/

EXPOSE 8000
CMD ["node", "server/main.ts"]
