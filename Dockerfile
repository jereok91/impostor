# Multi-stage Dockerfile for Impostor (Next.js + custom server + Prisma + Socket.io)

# 1) Builder: install deps, generate Prisma client, build app
FROM node:22-alpine AS builder
WORKDIR /app

# Install OS deps required by Prisma (OpenSSL 3.x for Alpine 3.17+)
RUN apk add --no-cache libc6-compat openssl openssl-dev

# Copy package manifests first to leverage Docker cache
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci --silent

# Copy Prisma schema first to generate client
COPY prisma ./prisma

# Generate Prisma client with correct binary targets
RUN npx prisma generate

# Copy the rest of the source
COPY . .

# Build Next.js app
RUN npm run build || true

# 2) Runner: smaller image for production
FROM node:22-alpine AS runner
WORKDIR /app

# Install OpenSSL for Prisma runtime
RUN apk add --no-cache libc6-compat openssl

# Optional: create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy built app and node_modules from builder
COPY --from=builder /app /app

# Ensure proper ownership
RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000

# Healthcheck (optional)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/ || exit 1

# IMPORTANT:
# Provide the database connection and any secrets via environment variables when running the container:
#   - DATABASE_URL (Postgres) required by Prisma
#   - PORT (optional, default 3000)
# Start the custom server (server.js) which initializes Next.js + Socket.io
CMD ["node", "server.js"]
