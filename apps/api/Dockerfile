# =============================================================================
# Dockerfile — NestJS API (@smk/api)
# Build context: repo root (karena butuh workspace packages/)
# =============================================================================

FROM node:20-alpine AS builder
WORKDIR /app

# Copy root manifests
COPY package.json package-lock.json turbo.json ./

# Copy workspace packages (dependency @smk/auth, @smk/logger, dll)
COPY packages/ ./packages/

# Copy API app
COPY apps/api/ ./apps/api/

# Install semua workspace dependencies dari root
RUN npm ci

# Build NestJS → output ke apps/api/dist/
RUN cd apps/api && npx nest build

# =============================================================================
# Production image — minimal, tanpa devDependencies
# =============================================================================

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy build output
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Copy node_modules (workspace node_modules ada di root)
COPY --from=builder /app/node_modules ./node_modules

# Copy packages source (dibutuhkan sebagai workspace symlinks)
COPY --from=builder /app/packages ./packages

# Copy package.json untuk module resolution
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json

EXPOSE 3001

CMD ["node", "apps/api/dist/main.js"]
