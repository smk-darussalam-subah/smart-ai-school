# =============================================================================
# Dockerfile — Next.js Web (@smk/web)
# Build context: repo root (karena butuh workspace packages/)
# output: 'standalone' sudah dikonfigurasi di next.config.js
# =============================================================================

FROM node:20-alpine AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

# Copy root manifests
COPY package.json package-lock.json turbo.json ./

# Copy workspace packages (dependency @smk/auth, @smk/logger, @smk/types)
COPY packages/ ./packages/

# Copy Web app
COPY apps/web/ ./apps/web/

# Install semua workspace dependencies dari root
RUN npm ci

# Build Next.js → output standalone ke apps/web/.next/standalone/
RUN cd apps/web && npx next build

# =============================================================================
# Production image — Next.js standalone mode
# =============================================================================

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Standalone build sudah include semua dependencies yang dibutuhkan
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000

# Next.js standalone entry point
CMD ["node", "apps/web/server.js"]
