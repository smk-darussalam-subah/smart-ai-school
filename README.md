# Smart AI School — SMK Darussalam Subah

**Smart AI Vocational School Ecosystem 5.0**

> Transformasi Total Sistem Pendidikan SMK Berbasis AI — Otomatis • Berbasis Data • Terhubung Industri • Scalable • Future-Ready

---

## Tech Stack

| Layer | Teknologi | Versi | Status |
|---|---|---|---|
| Frontend | Next.js + Tailwind CSS + shadcn/ui | 15.x | ✅ Aktif |
| UI Runtime | React | 19.x | ✅ Aktif (Server Components first) |
| Mobile | Flutter | 3.x | ⏸ Deferred — TBD Tahap 3 |
| Backend | NestJS + TypeScript + Prisma | 11.x | ✅ Aktif (Fastify adapter) |
| Database | PostgreSQL + pgvector | 16+ | ✅ Aktif |
| Cache | Redis | 7.x | ✅ Aktif |
| Automation | n8n (self-hosted) | latest | ✅ Aktif |
| AI Lokal | Ollama + Llama 3.1 | latest | ✅ Aktif |
| AI Premium | Claude API (Anthropic) | claude-sonnet-4-6 | ✅ Opsional |
| Auth | Keycloak (SSO + RBAC) | 24.x | ✅ Aktif |
| Analytics | Metabase | latest | ✅ Aktif |
| Monitoring | Grafana + Prometheus + Uptime Kuma | latest | ✅ Aktif |
| Deployment | Docker + Docker Compose + GitHub Actions | Compose v2 | ✅ Aktif |

> ℹ️ Tech stack dibekukan per Keputusan Arsitektur 2026-05-23. Perubahan versi butuh CR formal.

---

## Subdomain

| Subdomain | Service |
|---|---|
| `smkdarussalamsubah.sch.id` | Portal utama (Next.js) |
| `api.smkdarussalamsubah.sch.id` | Backend API (NestJS) |
| `auth.smkdarussalamsubah.sch.id` | SSO (Keycloak) |
| `n8n.smkdarussalamsubah.sch.id` | Automation (n8n) |
| `analytics.smkdarussalamsubah.sch.id` | Dashboard (Metabase) |
| `monitor.smkdarussalamsubah.sch.id` | Monitoring (Grafana) |
| `status.smkdarussalamsubah.sch.id` | Uptime (Uptime Kuma) |

> DNS: Cloudflare (NS: celeste.ns.cloudflare.com / corey.ns.cloudflare.com) | VPS: Hetzner 204.168.242.123

---

## Quick Start (Development)

```bash
# Clone repo
git clone https://github.com/smk-darussalam-subah/smart-ai-school.git
cd smart-ai-school

# Install dependencies
npm install

# Setup environment
cp infrastructure/docker/.env.example infrastructure/docker/.env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.local.example apps/web/.env.local
# Edit semua .env dengan nilai yang sesuai

# Jalankan infrastructure services
cd infrastructure/docker
docker compose up -d postgres redis keycloak n8n minio

# Setup database
cd ../../packages/database
npx prisma migrate deploy
npx prisma generate
npx prisma db seed

# Jalankan dev server (dari root)
cd ../..
npm run dev
```

---

## Connect ke Database dari Lokal

Port 5432 (PostgreSQL) dan 6379 (Redis) **tidak diekspos** di `docker-compose.yml` produksi — hanya aksesibel di dalam Docker network internal.

**Opsi A — Dev override (database lokal di Docker):**

```bash
cd infrastructure/docker
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
# PostgreSQL tersedia di localhost:5432, Redis di localhost:6379
```

**Opsi B — SSH tunnel ke VPS (database di server):**

```bash
# Buka tunnel di background (ganti IP sesuai VPS aktif)
ssh -L 5432:localhost:5432 -L 6379:localhost:6379 root@204.168.242.123 -N &

# Sekarang tools lokal bisa connect ke localhost:5432
npx prisma studio
# atau buka DBeaver/TablePlus → host: localhost, port: 5432
```

Tutup tunnel: `kill %1` atau `pkill -f "ssh -L 5432"`

---

## Struktur Proyek

```
smart-ai-school/
├── apps/
│   ├── api/          # NestJS 11 Backend (Fastify, port 3001)
│   ├── web/          # Next.js 15 Frontend (port 3000)
│   ├── admin/        # ⏸ Tahap 3 — belum ada
│   └── mobile/       # ⏸ Tahap 3 — belum ada (Flutter, deferred)
├── packages/
│   ├── types/        # @smk/types — Shared TypeScript interfaces
│   ├── database/     # @smk/database — Prisma schema & migrations
│   ├── logger/       # @smk/logger — Winston shared logger
│   ├── auth/         # @smk/auth — Keycloak utilities & guards
│   ├── config/       # @smk/config — Shared tsconfig base files
│   ├── ui/           # 📋 Tahap 1 — akan dibuat (shadcn/ui components)
│   └── ai-prompts/   # 📋 Tahap 1 — akan dibuat (AI prompt templates)
├── infrastructure/
│   ├── docker/       # Docker Compose (14 services) + .env
│   ├── nginx/        # Reverse proxy config
│   ├── monitoring/   # Grafana + Prometheus config
│   └── n8n/          # n8n workflow JSONs
├── docs/
│   ├── architecture/ # System overview, ADR
│   ├── gates/        # Quality gates: security, compliance, capacity
│   └── runbooks/     # Disaster recovery, restore procedures
├── scripts/          # VPS setup, backup, utilities
├── .tasks/           # Task queue untuk Claude Code
└── .github/
    └── workflows/    # CI/CD pipelines (ci.yml, deploy.yml)
```

---

## Dokumentasi

- [CLAUDE.md](CLAUDE.md) — Panduan untuk Claude Code (conventions, task queue, arsitektur)
- [.tasks/AUDIT-FINDINGS.md](.tasks/AUDIT-FINDINGS.md) — Status 24 temuan dari System Analyst
- [docs/gates/security-gate.md](docs/gates/security-gate.md) — Checklist Security Gate (Tahap 0 → 1)
- [docs/gates/compliance-gate.md](docs/gates/compliance-gate.md) — Checklist Compliance Gate (Tahap 1 → 2)
- [Laporan System Analyst (2026-05-26)](docs/Laporan_System_Analyst_DIIS_2026-05-26.docx) — Analisis risiko lengkap

---

*Smart AI VSE 5.0 © 2026 — SMK Darussalam Subah*
*Dikelola dengan Cowork AI + Claude Code*
