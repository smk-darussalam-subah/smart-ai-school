# Arsitektur Sistem DIIS — Smart AI School 5.0

**Sekolah:** SMK Darussalam Subah  
**Domain:** smkdarussalamsubah.sch.id  
**Versi Dokumen:** 1.0 | 2026-05-29  
**Status:** Tahap 0 SELESAI — Tahap 1 aktif

---

## 1. Gambaran Umum

DIIS (Digital Integrated Information System) adalah sistem manajemen sekolah terintegrasi berbasis cloud yang dibangun di atas arsitektur microservice-lite dengan monorepo Turborepo. Sistem terdiri dari 14 Docker service yang berjalan dalam satu VPS, di-proxy oleh Nginx sebagai satu-satunya titik masuk publik.

```
Internet (HTTPS)
      │
      ▼
┌─────────────┐
│  Cloudflare │  ← SSL termination, DDoS protection, CDN
│  (Full SSL) │
└──────┬──────┘
       │ HTTP (80) ke VPS
       ▼
┌─────────────┐
│    Nginx    │  ← Reverse proxy, rate limiting, security headers
│  (port 80)  │
└──────┬──────┘
       │ smk-network (Docker internal bridge)
       ├─────────────────────────────────────┐
       ▼                                     ▼
┌─────────────┐                    ┌─────────────────┐
│  web:3000   │                    │    api:3001      │
│  (Next.js)  │◄──────────────────►│   (NestJS)       │
└─────────────┘  /api/backend/*    └────────┬─────────┘
                                            │
                    ┌───────────────────────┼──────────────────────┐
                    ▼                       ▼                      ▼
           ┌──────────────┐       ┌──────────────┐       ┌──────────────┐
           │  postgres:   │       │  redis:6379  │       │ keycloak:    │
           │  5432        │       │  (cache +    │       │ 8080         │
           │  (pgvector)  │       │   throttle)  │       │ (auth SSO)   │
           └──────────────┘       └──────────────┘       └──────────────┘
```

---

## 2. 14 Docker Services

| # | Service | Image | Container | Port Internal | Fungsi |
|---|---------|-------|-----------|--------------|--------|
| 1 | **postgres** | pgvector/pgvector:pg16 | smk-postgres | 5432 | Database utama + pgvector extension untuk AI |
| 2 | **redis** | redis:7-alpine | smk-redis | 6379 | Cache session, rate limit counter, queue |
| 3 | **keycloak** | keycloak:24.0 | smk-keycloak | 8080 | Auth SSO, realm `diis`, JWKS endpoint |
| 4 | **api** | Custom (NestJS) | smk-api | 3001 | Backend REST API — NestJS 11 + Fastify |
| 5 | **web** | Custom (Next.js) | smk-web | 3000 | Frontend — Next.js 15 + React 19 |
| 6 | **n8n** | n8nio/n8n:latest | smk-n8n | 5678 | Automation workflow engine |
| 7 | **ollama** | ollama/ollama:latest | smk-ollama | 11434 | AI lokal — LLM inference (data sensitif tidak keluar) |
| 8 | **metabase** | metabase/metabase:v0.49.10 | smk-metabase | 3000 | Analytics dashboard |
| 9 | **minio** | minio/minio:latest | smk-minio | 9000/9001 | File storage (backup, dokumen) |
| 10 | **uptime-kuma** | louislam/uptime-kuma:1 | smk-uptime-kuma | 3001 | Status page & uptime monitoring |
| 11 | **prometheus** | prom/prometheus:latest | smk-prometheus | 9090 | Metrics collector |
| 12 | **grafana** | grafana/grafana:latest | smk-grafana | 3000 | Metrics visualization dashboard |
| 13 | **pg-backup** | postgres:16-alpine | smk-pg-backup | — | Cron backup PostgreSQL → MinIO (02:00 WIB) |
| 14 | **nginx** | nginx:alpine | smk-nginx | 80 | Reverse proxy, rate limit, security headers |

> **Catatan:** Port internal hanya aksesibel via `smk-network` Docker bridge. Tidak ada port yang di-expose ke host kecuali Nginx (80) dan Keycloak (8080 — untuk admin setup awal).

---

## 3. Network Topology

```
                    INTERNET
                       │
              ┌────────▼─────────┐
              │   Cloudflare     │
              │  Full Strict SSL │
              │  DDoS Protection │
              └────────┬─────────┘
                       │ HTTP:80
              ┌────────▼─────────┐
              │      Nginx       │ ← satu-satunya container
              │  Rate Limiting:  │   dengan port terbuka ke host
              │  API: 100r/m     │
              │  Web: 200r/m     │
              └────────┬─────────┘
                       │
          ─────────────── smk-network (Docker bridge) ───────────────
          │              │              │              │             │
    ┌─────▼────┐  ┌──────▼────┐  ┌─────▼────┐  ┌────▼─────┐ ┌────▼──────┐
    │  web     │  │   api     │  │ keycloak │  │  n8n     │ │ metabase  │
    │ :3000    │  │  :3001    │  │  :8080   │  │  :5678   │ │   :3000   │
    └──────────┘  └──────────┘  └──────────┘  └──────────┘ └───────────┘
                        │              │
                  ┌─────▼──────────────▼──────────────────────┐
                  │              postgres:5432                  │
                  │         (pgvector/pgvector:pg16)            │
                  │   Schemas: public, keycloak, n8n,           │
                  │   metabase, auth, diis_*                    │
                  └─────────────────────────────────────────────┘
```

### Subdomain Routing

| Subdomain | → Container | Catatan |
|-----------|------------|---------|
| `smkdarussalamsubah.sch.id` | web:3000 | Portal utama siswa/guru |
| `api.smkdarussalamsubah.sch.id` | api:3001 | REST API (Bearer token) |
| `auth.smkdarussalamsubah.sch.id` | keycloak:8080 | SSO login, JWKS |
| `n8n.smkdarussalamsubah.sch.id` | n8n:5678 | Automation (Basic Auth) |
| `analytics.smkdarussalamsubah.sch.id` | metabase:3000 | Laporan data |
| `monitor.smkdarussalamsubah.sch.id` | grafana:3000 | Metrics & alert |
| `status.smkdarussalamsubah.sch.id` | uptime-kuma:3001 | Status uptime |

---

## 4. Layer Arsitektur

### Layer 1 — Frontend (Next.js 15)
- **Lokasi:** `apps/web/`
- **Port:** 3000
- **Framework:** Next.js 15 App Router, React 19, Tailwind CSS 3
- **Auth client:** next-auth v4 + Keycloak provider
- **Pattern:** Server Components by default, 'use client' hanya saat perlu interaktivitas
- **SSR:** `getServerSession(authOptions)` untuk auth di Server Components
- **CSP:** Per-request nonce via `middleware.ts` (Web Crypto API, Edge Runtime)
- **SessionProvider:** Di-mount hanya di `/dashboard/*` via `DashboardProviders.tsx`

### Layer 2 — Backend API (NestJS 11)
- **Lokasi:** `apps/api/`
- **Port:** 3001
- **Framework:** NestJS 11 + Fastify adapter (BUKAN Express)
- **Validation:** Zod (BUKAN class-validator) via `ZodPipe`
- **Auth:** `KeycloakGuard` global via `APP_GUARD` — semua endpoint protected by default
- **Rate Limit:** `ThrottlerGuard` global (100 req/menit), auth endpoint 15 req/menit
- **Logging:** Winston via `@smk/logger` + `LoggingInterceptor`
- **Security Headers:** Fastify `addHook('onSend')` — X-Frame-Options, CSP, dll
- **Error Format:** `HttpExceptionFilter` — uniform error response

### Layer 3 — Auth (Keycloak 24)
- **Realm:** `diis`
- **Clients:** `diis-web` (frontend), `diis-api` (backend)
- **Token:** JWT RS256, JWKS endpoint `/realms/diis/protocol/openid-connect/certs`
- **Verification:** `packages/auth/` — `verifyKeycloakToken()` via JWKS
- **Session:** JWT strategy, 8 jam (sesuai jam kerja sekolah)
- **DB Backend:** PostgreSQL schema `keycloak`

### Layer 4 — Database (PostgreSQL 16 + pgvector)
- **Image:** `pgvector/pgvector:pg16`
- **Extension:** pgvector — untuk AI embedding/similarity search
- **ORM:** Prisma 5 + multi-schema
- **Schemas:** `public`, `keycloak`, `n8n`, `metabase`, domain schemas
- **Backup:** Otomatis setiap 02:00 WIB via `pg-backup` → MinIO

### Layer 5 — Cache (Redis 7)
- **Fungsi:** Session token cache, rate limit counter (ThrottlerModule), BullMQ queue
- **Auth:** Password required (`requirepass`)
- **Persistence:** AOF (appendonly yes)

### Layer 6 — AI Lokal (Ollama)
- **Fungsi:** LLM inference lokal — data sensitif siswa tidak keluar server
- **API:** `http://ollama:11434`
- **Model:** Dikonfigurasi saat runtime (llama3, mistral, dll)
- **GPU:** Opsional — komentar tersedia di docker-compose.yml

### Layer 7 — Monitoring Stack
- **Prometheus:** Metrics collector, retention 30 hari
- **Grafana:** Dashboard visualisasi, alert
- **Uptime Kuma:** Status page publik, notifikasi downtime
- **Config:** `infrastructure/docker/monitoring/`

### Layer 8 — File Storage & Backup
- **MinIO:** S3-compatible object storage (backup, dokumen sekolah)
- **pg-backup:** Cron `0 19 * * *` (= 02:00 WIB) → pg_dump → MinIO bucket `diis-backup`
- **Retention:** 7 hari rolling

---

## 5. Data Flow — Request Autentikasi

```
User Browser
     │
     │ 1. GET https://smkdarussalamsubah.sch.id/dashboard
     ▼
Cloudflare → Nginx
     │
     │ 2. proxy_pass http://web:3000
     ▼
Next.js middleware.ts
     │ 3. getToken() → cek JWT cookie next-auth
     │    Jika tidak ada token → redirect /login
     │    Jika ada token → inject x-nonce header
     ▼
Next.js dashboard/layout.tsx (Server Component)
     │ 4. getServerSession(authOptions)
     │    Jika session null → redirect /login
     ▼
User melihat dashboard (session valid)

─── Flow Login ───────────────────────────────────────────

User klik "Masuk dengan Akun Sekolah"
     │
     │ 5. signIn('keycloak') → next-auth
     ▼
next-auth /api/auth/signin/keycloak
     │ 6. Redirect ke auth.smkdarussalamsubah.sch.id
     ▼
Keycloak Login Page (auth.* subdomain)
     │ 7. User input username/password Keycloak
     ▼
Keycloak → Authorization Code → next-auth callback
     │ 8. next-auth exchange code → access_token + refresh_token
     │    jwt() callback: simpan roles, keycloakId, expiresAt
     │    session() callback: expose ke client
     ▼
User redirected ke /dashboard (authenticated)

─── Flow API Request ─────────────────────────────────────

Dashboard Component (client)
     │
     │ 9. fetch('/api/backend/students') + Bearer token
     ▼
Next.js rewrite → api.smkdarussalamsubah.sch.id
     │
     ▼
NestJS API (ThrottlerGuard → KeycloakGuard → Controller)
     │ 10. ThrottlerGuard: cek rate limit per IP
     │ 11. KeycloakGuard: verifyKeycloakToken() via JWKS
     │     Keycloak JWKS: GET /realms/diis/.../certs
     │ 12. Inject AuthUser ke request
     ▼
Controller → Service → Prisma → PostgreSQL
     │ 13. Return JSON response
     ▼
LoggingInterceptor: audit log via Winston
```

---

## 6. Role-Based Access Matrix

7 role tersedia di sistem. Role di-assign di Keycloak dan di-carry dalam JWT token.

| Modul | SUPER_ADMIN | KEPALA_SEKOLAH | TATA_USAHA | GURU | SISWA | ORANG_TUA | INDUSTRI |
|-------|:-----------:|:--------------:|:----------:|:----:|:-----:|:---------:|:--------:|
| Dashboard Eksekutif | ✅ | ✅ | — | — | — | — | — |
| Keuangan (SPP/BOS) | ✅ | 👁 | ✅ | — | 👁 | 👁 | — |
| PPDB / CRM | ✅ | 👁 | ✅ | 👁 | — | — | — |
| Data Siswa | ✅ | 👁 | ✅ | 👁 | 👁 | 👁 | — |
| Nilai & Absensi | ✅ | 👁 | — | ✅ | 👁 | 👁 | — |
| PKL/Prakerin | ✅ | 👁 | 👁 | ✅ | ✅ | 👁 | ✅ |
| BKK/Rekrutmen | ✅ | 👁 | — | — | ✅ | — | ✅ |
| Monitoring/AI | ✅ | — | — | — | — | — | — |

> ✅ = write access | 👁 = read only | — = tidak ada akses

---

## 7. Tech Stack Lengkap

| Layer | Teknologi | Versi | Catatan |
|-------|-----------|-------|---------|
| Frontend | Next.js | 15.x | App Router, React 19 |
| Styling | Tailwind CSS | 3.x | + custom smk-* colors |
| Auth Frontend | next-auth | 4.x | Keycloak provider |
| Backend | NestJS | 11.x | Fastify adapter (BUKAN Express) |
| Runtime | Node.js | 20.x LTS | |
| Language | TypeScript | 5.x | strict mode WAJIB |
| Database | PostgreSQL | 16+ | + pgvector extension |
| ORM | Prisma | 5.x | multi-schema |
| Cache | Redis | 7.x | + AOF persistence |
| Auth Server | Keycloak | 24.x | Realm: diis |
| Automation | n8n | latest | workflow engine |
| AI Lokal | Ollama | latest | LLM inference lokal |
| Analytics | Metabase | 0.49.10 | self-hosted BI |
| File Storage | MinIO | latest | S3-compatible |
| Monitoring | Prometheus + Grafana | latest | metrics + dashboard |
| Uptime | Uptime Kuma | 1.x | status page |
| Reverse Proxy | Nginx | alpine | satu-satunya public port |
| Containers | Docker Compose | v2 | 14 services |
| CI/CD | GitHub Actions | — | ci.yml + deploy.yml |
| Monorepo | Turborepo | 2.x | + npm workspaces |
| Validation | Zod | 3.x | BUKAN class-validator |
| Logging | Winston | 3.x | via @smk/logger |
| CDN / SSL | Cloudflare | — | Full Strict mode |

---

## 8. Monorepo Structure

```
smart-ai-school/
├── apps/
│   ├── api/                   → NestJS 11 + Fastify (port 3001)
│   │   ├── src/
│   │   │   ├── main.ts        → bootstrap, validateEnv(), security headers
│   │   │   ├── app.module.ts  → ThrottlerModule, KeycloakModule, LoggingInterceptor
│   │   │   ├── auth/          → KeycloakGuard, @Public(), @Roles()
│   │   │   ├── config/        → env.validation.ts (Zod, fail-fast)
│   │   │   └── __tests__/     → 62 tests, 8 suites
│   │   └── Dockerfile
│   └── web/                   → Next.js 15 (port 3000)
│       ├── src/
│       │   ├── app/           → App Router (layout, pages)
│       │   ├── components/
│       │   │   ├── layout/    → Sidebar (useSession)
│       │   │   └── providers/ → DashboardProviders (SessionProvider /dashboard/*)
│       │   ├── lib/auth.ts    → NextAuth authOptions
│       │   └── middleware.ts  → CSP nonce + auth guard
│       └── Dockerfile
├── packages/
│   ├── auth/                  → @smk/auth — verifyKeycloakToken(), UserRole, hasRole()
│   ├── database/              → @smk/database — Prisma client + schema
│   ├── logger/                → @smk/logger — Winston, auditLog(), logError()
│   ├── types/                 → @smk/types — shared TypeScript interfaces
│   └── config/                → @smk/config — tsconfig base
├── infrastructure/
│   ├── docker/
│   │   ├── docker-compose.yml → 14 services production
│   │   ├── docker-compose.dev.yml → expose ports untuk dev lokal
│   │   ├── init-db.sql        → PostgreSQL schema init
│   │   ├── scripts/backup.sh  → pg_dump → MinIO
│   │   └── monitoring/        → prometheus.yml, grafana config
│   ├── nginx/nginx.conf       → reverse proxy config
│   ├── keycloak/              → realm-diis.json (import)
│   └── n8n/                   → workflow JSON files
├── docs/
│   ├── architecture/          → dokumen ini
│   ├── deployment/            → env-variables.md, setup-server.md
│   └── gates/                 → security-gate.md (Tahap 0 sign-off)
├── .env.example               → template semua env vars
├── CLAUDE.md                  → brief Claude Code
└── turbo.json                 → Turborepo pipeline
```

---

## 9. Security Architecture

| Lapisan | Mekanisme | Keterangan |
|---------|-----------|-----------|
| Jaringan | Cloudflare Full Strict SSL | TLS di-terminate Cloudflare, re-encrypted ke origin |
| Reverse Proxy | Nginx rate limit | API: 100r/m, Web: 200r/m per IP |
| Auth | Keycloak JWKS RS256 | Key rotation otomatis, tidak hardcode secret |
| API Guard | APP_GUARD global | Semua endpoint protected by default, opt-out @Public() |
| Rate Limit API | ThrottlerGuard | Global 100r/mnt; auth endpoint 15r/mnt (anti credential stuffing) |
| Request Validation | Zod fail-fast | Schema validation sebelum controller logic |
| CSP | Per-request nonce | Nonce via Web Crypto API, diset di Next.js middleware |
| Security Headers | Nginx + Fastify hook | X-Frame-Options, X-Content-Type-Options, CSP, dll |
| Database | Internal network only | PostgreSQL tidak expose port ke host |
| Backup | pg-backup → MinIO | Encrypted at rest, 7-hari retention |
| Secret Management | .env (gitignored) | Tidak ada secret di codebase |
| Audit Log | LoggingInterceptor | Setiap request tercatat: method, url, userId, duration |

---

*Dokumen ini dihasilkan dari source of truth: `infrastructure/docker/docker-compose.yml`, `infrastructure/nginx/nginx.conf`, dan `CLAUDE.md`. Perbarui dokumen ini setiap kali ada perubahan arsitektur signifikan.*
