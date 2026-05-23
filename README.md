# Smart AI School — SMK Darussalam Subah

**Smart AI Vocational School Ecosystem 5.0**

> Transformasi Total Sistem Pendidikan SMK Berbasis AI — Otomatis • Berbasis Data • Terhubung Industri • Scalable • Future-Ready

---

## Tech Stack

| Layer | Teknologi |
|---|---|
| Frontend | Next.js 14 + Tailwind CSS + shadcn/ui |
| Mobile | Flutter 3.x |
| Backend | NestJS 10 + TypeScript + Prisma |
| Database | PostgreSQL 16 + pgvector |
| Cache/Queue | Redis 7 + BullMQ |
| Automation | n8n (self-hosted) |
| AI Lokal | Ollama + Llama 3.1 |
| AI Premium | Claude API (Anthropic) |
| Auth | Keycloak 24 (SSO + RBAC) |
| Analytics | Metabase |
| Monitoring | Grafana + Prometheus + Uptime Kuma |
| Deployment | Docker + Docker Compose + GitHub Actions |

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

## Quick Start (Development)

```bash
# Clone repo
git clone https://github.com/smk-darussalam-subah/smart-ai-school.git
cd smart-ai-school

# Setup environment
cp .env.example .env
# Edit .env dengan nilai yang sesuai

# Jalankan semua service
cd infrastructure/docker
docker compose up -d

# Setup database
npm run db:generate
npm run db:migrate
npm run db:seed

# Jalankan dev server
npm run dev
```

## Struktur Proyek

```
smart-ai-school/
├── apps/
│   ├── api/          # NestJS Backend
│   ├── web/          # Next.js Frontend
│   ├── admin/        # Next.js Admin Panel
│   └── mobile/       # Flutter Mobile App
├── packages/
│   ├── types/        # Shared TypeScript types
│   ├── database/     # Prisma schema & migrations
│   ├── logger/       # Winston shared logger
│   ├── auth/         # Keycloak utilities
│   ├── ui/           # shadcn/ui components
│   ├── ai-prompts/   # AI prompt templates
│   └── config/       # Shared ESLint, TS, Prettier config
├── infrastructure/
│   ├── docker/       # Docker Compose + init SQL
│   ├── nginx/        # Reverse proxy config
│   └── monitoring/   # Grafana + Prometheus config
├── scripts/          # VPS setup, backup, utilities
├── docs/             # Arsitektur, API, deployment docs
└── .github/
    └── workflows/    # CI/CD pipelines
```

## Dokumentasi

- [Master Plan Kerja](../DIIS_MasterPlan_Kerja.md)
- [Blueprint v2.0](../docs/Blueprint_SmartAI_VSE_v2.0.md)
- [Tahap 0 Detail](../docs/Tahap0_Foundation_SmartAI_SMK.md)

---

*Smart AI VSE 5.0 © 2026 — SMK Darussalam Subah*
