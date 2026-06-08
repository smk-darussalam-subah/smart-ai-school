# CLAUDE.md — DIIS Smart AI School
> Brief permanen untuk Claude Code. Baca ini sebelum mengerjakan task apapun.
> Diperbarui oleh: Cowork AI (koordinator) | Versi: 1.2 | 8 Juni 2026

---

## ⭐ KEPUTUSAN TAHAP 2 (2026-06-08) — MENANG atas teks lama bila bertentangan
> Pasca audit eksternal (`Laporan_Audit_Komparatif_DIIS_2026-06-08.md`) + brainstorm Director.
> Detail & rationale: `docs/decision-log.md`. Roadmap: `docs/SUPER-PROMPT-tahap2-system-analyst.md`.
> **Bila §3/§5/§6 di bawah bertentangan dengan poin di sini, poin ini yang berlaku.**

- **RBAC → permission-based pragmatis** (mengganti "role-based" di §5/§6). **7 role tetap sebagai DASAR**
  (tidak dihapus), TAPI ditambah tabel `permission` + `role_permissions` (Super Admin ubah izin TANPA deploy)
  + override per-user (mis. guru wali-kelas lihat siswa kelasnya). Frasa "IMMUTABLE" di §6 = jumlah/ nama 7
  role dasar tetap; model otorisasi menjadi permission-based.
- **Stack §3 "IMMUTABLE" = inti tetap, dengan TAMBAHAN Tahap 2 yang disahkan:** **shadcn/ui** (komponen UI),
  **BullMQ** (antrian keandalan broadcast WA — rate-limit/retry/tahan-restart). Bukan mengganti, menambah.
- **Event/automasi:** domain event tetap **EventEmitter (NestJS)**; **BullMQ** untuk broadcast WA; **n8n hybrid**
  = pemicu terjadwal (SPP bayar/telat dari `spp_payments`, kalender akademik). Domain logic tetap di NestJS.
- **GERBANG GO-LIVE DATA NYATA:** R-05 consent + N-20 isolasi (`smk_staging_db`) + N-23b + AuditLog persisten +
  R-03 ditutup (bila Claude). Sebelum gerbang → semua dummy (di tabel DB), CRUD penuh termasuk DELETE aman.
- **Git VPS:** dijalankan sebagai user **`appuser`** (punya deploy key); root tidak.
- API docs: Markdown cukup (Swagger ditunda). Blueprint akan direvisi → v2.1.

---

## 1. IDENTITAS PROYEK

**Nama:** DIIS — Digital Integrated Information System
**Visi:** Smart AI Vocational School Ecosystem 5.0
**Sekolah:** SMK Darussalam Subah
**Fase aktif:** Tahap 1 — System Design & Core Build (mulai 28 Mei 2026)
**Tahap 0:** ✅ SELESAI 2026-05-28 — Go/No-Go LULUS, 23/23 deliverable terverifikasi
**Direktur:** Kang Sholah (Arsitek & Decision Maker)
**Koordinator AI:** Cowork (planning, specs, Linear, Notion)
**Eksekutor AI:** Claude Code (coding, testing, refactor, debug)

---

## 2. PERAN CLAUDE CODE

Kamu adalah **Senior Full-Stack Engineer** di tim DIIS. Tugasmu:
- Eksekusi task dari `.tasks/current.md` secara mandiri
- Fix TypeScript errors, buat tests, refactor kode
- Jangan ubah arsitektur atau keputusan desain tanpa konfirmasi
- Laporkan blocking issues dengan jelas di akhir setiap sesi
- Ikuti semua conventions di dokumen ini tanpa pengecualian

**Yang TIDAK boleh dilakukan tanpa konfirmasi eksplisit:**
- Mengubah Prisma schema yang sudah punya migration
- Mengubah struktur folder top-level
- Menambah dependency baru yang belum ada di package.json
- Mengubah docker-compose.yml service yang sudah running
- Push ke branch main atau staging

---

## 3. TECH STACK (IMMUTABLE)

| Layer | Teknologi | Versi | Catatan |
|---|---|---|---|
| Frontend | Next.js | 15.x | App Router, React 19 |
| Styling | Tailwind CSS | 3.x | + custom smk-* colors |
| Auth Frontend | next-auth | 4.x | Keycloak provider |
| Backend | NestJS | 11.x | Fastify adapter (BUKAN Express) |
| Runtime | Node.js | 20.x LTS | |
| Language | TypeScript | 5.x | strict mode WAJIB |
| Database | PostgreSQL | 16+ | + pgvector extension |
| ORM | Prisma | 5.x | |
| Cache | Redis | 7.x | |
| Auth Server | Keycloak | 24.x | Realm: diis |
| Automation | n8n | latest | |
| AI Lokal | Ollama | latest | |
| Containers | Docker Compose | v2 | |
| CI/CD | GitHub Actions | | |
| Monorepo | Turborepo | 2.x | |
| Validation | Zod | 3.x | BUKAN class-validator |
| Logging | Winston | 3.x | via @smk/logger |

---

## 4. STRUKTUR MONOREPO

```
smart-ai-school/
├── apps/
│   ├── api/          → NestJS 11 + Fastify (port 3001)
│   └── web/          → Next.js 15 (port 3000)
├── packages/
│   ├── auth/         → @smk/auth — Keycloak JWT verify, UserRole, hasRole()
│   ├── database/     → @smk/database — Prisma client + schema
│   ├── logger/       → @smk/logger — Winston logger, auditLog(), logError()
│   ├── types/        → @smk/types — Shared TypeScript interfaces
│   └── config/       → @smk/config — tsconfig base files
├── infrastructure/
│   ├── docker/       → docker-compose.yml (14 services)
│   ├── nginx/        → nginx.conf
│   ├── monitoring/   → prometheus.yml, grafana dashboards
│   └── n8n/          → workflow JSON files
├── .github/
│   └── workflows/    → ci.yml, deploy.yml
├── .tasks/           → Task queue sistem (dibaca Claude Code)
│   ├── current.md    → Task aktif sekarang
│   ├── queue.md      → Antrian task berikutnya
│   └── done/         → Task yang sudah selesai (arsip)
├── docs/             → Dokumentasi teknis
├── CLAUDE.md         → File ini
└── turbo.json
```

---

## 5. CONVENTIONS WAJIB

### TypeScript
```typescript
// ✅ SELALU: strict types, no any
const userId: string = request.user.keycloakId;

// ❌ JANGAN: any, as any (kecuali ada penjelasan komentar)
const data: any = ...;

// ✅ SELALU: JSDoc di public methods
/**
 * Verifikasi JWT Keycloak dan ekstrak user payload
 * @throws UnauthorizedException jika token invalid
 */
async verifyToken(token: string): Promise<AuthUser> { ... }
```

### NestJS (apps/api)
```typescript
// ✅ DTO: Zod schema + infer type (BUKAN class-validator)
export const CreateStudentSchema = z.object({
  nis: z.string().min(5).max(20),
  fullName: z.string().min(3),
});
export type CreateStudentDto = z.infer<typeof CreateStudentSchema>;

// ✅ Controller: gunakan @Body(new ZodPipe(schema))
@Post()
create(@Body(new ZodPipe(CreateStudentSchema)) dto: CreateStudentDto) { ... }

// ✅ Guard: @Public() untuk endpoint tanpa auth
@Public()
@Get('health')
health() { ... }

// ✅ Role-based: @Roles() decorator
@Roles('GURU', 'KEPALA_SEKOLAH')
@Get('students')
findAll() { ... }
```

### Next.js (apps/web)
```typescript
// ✅ Server components by default
// ✅ 'use client' hanya jika butuh hooks/interaktivitas
// ✅ getServerSession(authOptions) untuk auth di server component
// ✅ useSession() untuk auth di client component
// ✅ Tailwind + smk-* custom colors (smk-blue, smk-green)
```

### Naming Conventions
```
Files:        kebab-case         → user-profile.service.ts
Classes:      PascalCase         → UserProfileService
Variables:    camelCase          → userId, fullName
Constants:    UPPER_SNAKE_CASE   → MAX_RETRY_COUNT
DB Tables:    snake_case         → user_profiles
API Routes:   kebab-case         → /api/v1/user-profiles
Branches:     feat/SMA-XX-desc   → feat/SMA-09-keycloak-setup
Commits:      conventional       → feat(auth): add Keycloak JWT guard
```

### Git Commit Format
```
feat(scope): deskripsi singkat          → fitur baru
fix(scope): deskripsi singkat           → bugfix
refactor(scope): deskripsi singkat      → refactor tanpa fitur baru
test(scope): deskripsi singkat          → tambah/fix tests
docs(scope): deskripsi singkat          → dokumentasi
chore(scope): deskripsi singkat         → config, deps, tools

Contoh:
feat(auth): add Keycloak JWT verification with JWKS
fix(api): handle expired token in KeycloakGuard
test(health): add unit tests for HealthController
```

---

## 6. ROLES SISTEM (7 ROLES — IMMUTABLE)

```typescript
type UserRole =
  | 'SUPER_ADMIN'      // akses penuh semua sistem
  | 'KEPALA_SEKOLAH'   // dashboard eksekutif, laporan, approval
  | 'TATA_USAHA'       // administrasi: keuangan SPP/BOS, PPDB admin, data siswa
  | 'GURU'             // manajemen kelas, nilai, absensi
  | 'SISWA'            // portal siswa, nilai, jadwal
  | 'ORANG_TUA'        // pantau perkembangan anak
  | 'INDUSTRI';        // mitra industri: PKL/Prakerin, BKK, rekrutmen
```

### Akses Modul per Role (ringkasan)
| Modul | SA | KS | TU | Guru | Siswa | OT | Industri |
|---|---|---|---|---|---|---|---|
| Dashboard Eksekutif | ✅ | ✅ | - | - | - | - | - |
| Keuangan (SPP/BOS) | ✅ | 👁 | ✅ | - | 👁 | 👁 | - |
| PPDB / CRM | ✅ | 👁 | ✅ | 👁¹ | - | - | - |
| Data Siswa | ✅ | 👁 | ✅ | 👁 | 👁 | 👁 | - |
| Nilai & Absensi | ✅ | 👁 | - | ✅ | 👁 | 👁 | - |
| PKL/Prakerin | ✅ | 👁 | 👁 | ✅ | ✅ | 👁 | ✅ |
| BKK/Rekrutmen | ✅ | 👁 | - | - | ✅ | - | ✅ |
| Monitoring/AI | ✅ | - | - | - | - | - | - |

(✅ = write access, 👁 = read only, - = no access)

¹ **GURU 👁 PPDB** = HANYA `GET /ppdb/stats` (agregat: total leads per status, conversion rate — tanpa PII).
  GURU TIDAK boleh akses `GET /ppdb/leads` atau detail lead individual (mengandung nama + nomor HP calon siswa).

---

## 7. STATUS COMPLETION TAHAP 0

> ⚠️ **PENTING:** Kolom "Diverifikasi" = ada bukti runtime (curl output / test hasil / screenshot).
> Kolom "Klaim" = diklaim selesai tapi belum ada bukti runtime.
> Lesson learned dari Laporan System Analyst 2026-05-26 (O-02).

### ✅ SELESAI & DIVERIFIKASI

| Task | Klaim | Diverifikasi | Bukti |
|---|---|---|---|
| W1-01 VPS Setup | ✅ | ✅ | SSH ke VPS berhasil |
| W1-03 Monorepo Turborepo | ✅ | ✅ | `npm run build` dari root |
| W1-04 Docker Compose (14 services) | ✅ | ✅ | `docker compose ps` — semua running |
| W2-01 Keycloak realm `diis` | ✅ | ✅ | Admin console login berhasil, realm visible |
| W2-02 Prisma Schema | ✅ | ✅ | `npx prisma validate` — OK |
| W2-03 pgvector Migration | ✅ | ✅ | `npx prisma migrate status` — applied |
| W2-02 Prisma Seed (40 users, 10 kelas) | ✅ | ✅ | Seed output 40 records berhasil |
| W3-01 GitHub Actions CI | ✅ | ✅ | ci.yml ada di `.github/workflows/` |
| W3-04 Next.js Web Scaffold | ✅ | ✅ | `npm run build` di apps/web — OK |
| SMA-6 Cloudflare DNS | ✅ | ✅ | 9 records di Cloudflare dashboard |

### ⚠️ DIKLAIM SELESAI — BELUM DIVERIFIKASI RUNTIME

| Task | Klaim | Diverifikasi | Issue |
|---|---|---|---|
| W2-05 NestJS API Scaffold | ✅ | ❌ | T-01 (SMA-22): ZodValidationPipe pass-through; T-02 (SMA-23): KeycloakGuard bukan APP_GUARD |
| W3-03 Security Hardening | ✅ | ❌ | Item 4 & 7 salah — lihat SMA-22 & SMA-23 |

### 🚨 ANTRIAN BLOCKING (lihat `.tasks/queue.md` section BLOCKING)
- [x] FIX-T01 — ZodValidationPipe fail-secure (SMA-22) ✅ DONE 2026-05-26
- [x] FIX-T02 — KeycloakGuard APP_GUARD (SMA-23) ✅ DONE 2026-05-26
- [x] FIX-T03 — Port mismatch (SMA-24) ✅ DONE 2026-05-26 — env var adalah `API_PORT`, bukan `PORT`
- [x] FIX-T04 — PostgreSQL port exposed (SMA-25) ✅ DONE 2026-05-26 — ports 5432+6379 dihapus dari production compose, dev.yml dibuat
- [x] FIX-T06 — Backup aktif (SMA-27) ✅ DONE 2026-05-27 — pg_dump→MinIO aktif di VPS, cron 02:00 WIB, 225KiB backup terverifikasi
- [x] DOC-T11 — README update (SMA-29) ✅ DONE 2026-05-27 — versi benar, Flutter deferred, folder fiktif ditandai
- [x] DOC-O02 — Runtime DoD (SMA-30) ✅ DONE 2026-05-27 — Runtime Verification WAJIB di CLAUDE.md Section 9
- [x] FIX-T05 — CSP nonce-based (SMA-26) ✅ DONE 2026-05-27 — unsafe directives dihapus, nonce-based CSP via Next.js middleware
- [x] FIX-T10 — Unit test 70% coverage auth (SMA-28) ✅ DONE 2026-05-27 — 50 tests, 100% coverage packages/auth

### 📋 ANTRIAN REGULER (setelah semua BLOCKING selesai)
- [ ] W2-04 n8n workflow JSON (SMA-12)
- [ ] W3-02 Monitoring — Grafana dashboards (SMA-15)
- [ ] W4-01 Dokumentasi Arsitektur (SMA-18)
- [ ] W4-02 Onboarding Guide (SMA-19)
- [ ] W4-03 Checklist Final Go/No-Go (SMA-20) ⛔ BLOCKED sampai semua FIX-T01..T05 selesai

---

## 8. ENVIRONMENT VARIABLES

### apps/api (.env)
```env
NODE_ENV=development
API_PORT=3001
DATABASE_URL=postgresql://diis:password@localhost:5432/diis_db
REDIS_URL=redis://localhost:6379
KEYCLOAK_ISSUER=http://localhost:8080/realms/diis
ALLOWED_ORIGINS=http://localhost:3000
LOG_LEVEL=info
SERVICE_NAME=smk-api
```

### apps/web (.env.local)
```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<min-32-chars>
KEYCLOAK_CLIENT_ID=diis-web
KEYCLOAK_CLIENT_SECRET=<dari-keycloak-admin>
KEYCLOAK_ISSUER=http://localhost:8080/realms/diis
API_URL=http://localhost:3001
```

---

## 9. CARA BACA TASK

Sebelum mulai coding, **selalu baca dulu**:
1. `.tasks/current.md` — task yang harus dikerjakan sekarang
2. File-file yang disebut di dalam task tersebut
3. Bagian status di CLAUDE.md ini untuk konteks apa yang sudah ada

Setelah selesai:
- Pastikan TypeScript compile tanpa error (`npx tsc --noEmit`)
- Buat ringkasan apa yang dikerjakan + apa yang perlu perhatian Kang
- Jangan hapus atau ubah `.tasks/current.md` — biarkan Cowork yang update

### ⚠️ Runtime Verification WAJIB (berlaku mulai 2026-05-26)

Setiap task yang menyentuh: **API endpoint, auth/guard, validasi, atau security**
WAJIB menyertakan bukti runtime berupa salah satu:

- (a) Output `curl` command — copy-paste dari terminal
- (b) Test coverage report — output `npx jest --coverage`
- (c) Screenshot `docker compose ps` — untuk task infra

**Larangan keras:** JANGAN centang ✅ atau tulis "selesai" tanpa bukti di atas.

**Format laporan wajib:** tambahkan section `## Bukti Runtime` di akhir setiap laporan task.

> Lesson learned dari T-01 & T-02 yang lolos review tanpa runtime verification (O-02, SMA-30).

---

## 10. KEPUTUSAN ARSITEKTUR (FINAL — JANGAN DIUBAH)

| Keputusan | Pilihan | Alasan |
|---|---|---|
| HTTP Framework | Fastify (bukan Express) | 2-3x lebih cepat, better TypeScript support |
| Validation | Zod (bukan class-validator) | Runtime type safety, shareable dengan frontend |
| Auth Provider | Keycloak JWKS (bukan JWT secret) | Production-grade, key rotation support |
| Auth Guard Model | APP_GUARD global, opt-out via @Public() | Security by default — endpoint baru protected tanpa perlu dekorasi eksplisit. Mencegah T-02 terulang. (SMA-23, 2026-05-26) |
| Auth Rate Limit | @Throttle({ default: { ttl: 60_000, limit: 15 } }) wajib di auth endpoints | Mencegah credential stuffing. Default global throttle (100 req/menit) terlalu longgar untuk auth endpoints. Auth dibatasi 15 req/menit per IP. (SMA-16, 2026-05-28) |
| Security Headers | Fastify onSend hook (bukan Express helmet as Fastify plugin) | Express helmet tidak kompatibel langsung sebagai Fastify plugin. Header di-set via addHook('onSend') — fungsional equivalent, tested runtime. (SMA-16, 2026-05-28) |
| DB Pattern | Multi-schema Prisma | Domain isolation tanpa overhead microservice |
| AI Lokal | Ollama (bukan OpenAI default) | Data sensitif siswa tidak keluar server |
| State Mgmt | React Server Components first | Minimal client JS, better SEO, faster TTFB |
| Monorepo | Turborepo (bukan Nx) | Simpler config, cukup untuk skala ini |
| Package Manager | npm workspaces | Sudah terkonfigurasi, konsisten |
| React Version Pinning | `overrides.react=^19.1.0` + `overrides.react-dom=^19.1.0` di root package.json | next-auth v4 dan next 15 peer-deps menerima React 17/18/19. Tanpa overrides, npm hoist React 18.3.1 ke root karena `react-dom@18.3.1` peer-pin `react@^18.3.1`. Akibatnya `next` resolve React 18 dari root sementara `apps/web` resolve React 19 — dua copy berbeda di proses build menyebabkan React error #31 ("object with keys $$typeof, type, key, ref, props") saat prerender `/404`. Overrides memaksa single React 19.x di seluruh workspace. (2026-05-29) |

---

*Dokumen ini dikelola oleh Cowork AI. Claude Code hanya membaca, tidak mengubah file ini.*
*Update terakhir: 2026-05-28 — Tahap 0 SELESAI. Go/No-Go LULUS 23/23. Fase aktif: Tahap 1.*
