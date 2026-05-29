# =============================================================================
# Dockerfile — NestJS API (@smk/api)
# Build context: repo root (karena butuh workspace packages/)
# =============================================================================

FROM node:20-alpine AS builder
WORKDIR /app

# OpenSSL diperlukan di builder agar prisma generate menghasilkan
# binary linux-musl-openssl-3.0.x (bukan default linux-musl yang butuh 1.1.x).
# Alpine 3.19+ pakai OpenSSL 3.x — harus konsisten antara builder dan runner.
RUN apk add --no-cache openssl openssl-dev

# Copy root manifests
COPY package.json package-lock.json turbo.json ./

# Copy workspace packages (dependency @smk/auth, @smk/logger, dll)
COPY packages/ ./packages/

# Copy API app
COPY apps/api/ ./apps/api/

# Install semua workspace dependencies dari root
RUN npm ci

# ─── Step 1: Build workspace packages dalam urutan dependency ─────────────────
# Packages memiliki "main": "./dist/index.js" — harus dikompilasi dulu
# sebelum TypeScript di apps/api bisa me-resolve import-nya.
RUN cd packages/types  && npx tsc --project tsconfig.json
RUN cd packages/logger && npx tsc --project tsconfig.json
RUN cd packages/auth   && npx tsc --project tsconfig.json

# ─── Step 2: Generate Prisma client ──────────────────────────────────────────
# prisma generate membaca schema.prisma dan menghasilkan @prisma/client types.
# Tidak butuh koneksi DB — hanya baca file schema.
RUN cd packages/database && npx prisma generate

# ─── Step 3: Build NestJS API ────────────────────────────────────────────────
RUN cd apps/api && npx nest build

# =============================================================================
# Production image — minimal, tanpa devDependencies
# =============================================================================

FROM node:20-alpine AS runner
WORKDIR /app

# OpenSSL 3.x diperlukan untuk Prisma engine binary linux-musl-openssl-3.0.x.
# openssl-dev tidak perlu di runner (hanya header, tidak dibutuhkan runtime).
RUN apk add --no-cache openssl

ENV NODE_ENV=production

# Copy build output
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Copy node_modules (workspace node_modules ada di root)
COPY --from=builder /app/node_modules ./node_modules

# Copy packages (dist/ sudah ada karena di-build di tahap builder)
# node_modules/@smk/* symlink → /app/packages/*/dist/index.js
COPY --from=builder /app/packages ./packages

# Copy package.json untuk module resolution
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json

EXPOSE 3001

# Startup: jalankan migrasi dulu, lalu start API.
# Prisma migrate deploy bersifat idempotent — tidak ada migrasi pending → selesai < 1s.
# Container sudah di smk-network → bisa reach postgres service.
# DATABASE_URL tersedia dari docker-compose.yml environment.
# Jika migrasi gagal (DB belum siap), container exit → Docker restart ulang
# sampai postgres healthy dan migrasi berhasil sebelum API start.
CMD ["sh", "-c", "cd /app/packages/database && /app/node_modules/.bin/prisma migrate deploy && exec node /app/apps/api/dist/main.js"]
