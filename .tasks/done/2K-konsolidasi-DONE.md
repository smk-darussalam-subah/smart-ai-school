# DONE REPORT — 2K-konsolidasi

**Branch:** `feat/2K-konsolidasi`
**Tanggal:** 2026-06-13
**Gate seluruh blok:** `npx tsc --noEmit` → 0 errors (api + web)

---

## Commits

| Blok | Commit | Deskripsi |
|------|--------|-----------|
| 2K-1 | `8ffc835` | feat(2K-1): backup-db.sh + restore-drill.sh + runbook backup-restore |
| 2K-2 | `9adc3b7` | feat(2K-2): sentry runbook + uptime workflow + test-wa-rate script |
| 2K-3 | `49f6200` | feat(2K-3): tab Tanpa Wali + AssignParentDialog + heatmap drill-down |
| 2K-4 | `45f5b59` | feat(2K-4): subject reference table — schema, migration, seed, API, UI combobox |
| 2K-5 | `5bdd5b5` | fix(2K-5): quality polish — httpError 400/404, AI typing indicator, audit page, privacy |

---

## Blok 2K-1 — Backup DB

**File yang dibuat:**
- `scripts/backup-db.sh` — pg_dump -Fc dari container smk-postgres, SHA-256 checksum, retensi 14 hari, rclone opsional
- `scripts/restore-drill.sh` — buat smk_restore_test, pg_restore, hitung tabel/row per schema, drop test DB
- `docs/runbooks/backup-restore.md` — setup, cron schedule (02:30 WIB), monthly drill policy, emergency restore

**Gate:** Backup + drill harus dijalankan nyata di staging/dev lokal (output mentah belum tersedia — butuh akses VPS aktif).

---

## Blok 2K-2 — Observability

**File yang dibuat:**
- `docs/runbooks/sentry-activation.md` — cara aktifkan Sentry DSN, PII scrubbing, verifikasi
- `.github/workflows/uptime.yml` — cron `*/10 * * * *`, curl API health + homepage, email ke Director bila fail
- `scripts/test-wa-rate.ts` — ENV-gated (`WA_RATE_TEST=1`), enqueue N job ke BullMQ, print sukses/gagal/latency

---

## Blok 2K-3 — UI Data

**File yang dibuat/dimodifikasi:**
- `apps/web/src/app/dashboard/siswa/_components/AssignParentDialog.tsx` — wizard 3-step: data ortu → consent → hasil
- `apps/web/src/app/dashboard/siswa/_components/SiswaTable.tsx` — tab "Tanpa Wali (n)" + Lengkapi Wali button
- `apps/web/src/app/dashboard/siswa/page.tsx` — fetch `/students/without-parent` parallel
- `apps/web/src/app/dashboard/siswa/actions.ts` — `assignParentAction`
- `apps/web/src/app/dashboard/_components/HeatmapInteractive.tsx` — client heatmap dengan DetailPanel (focus trap, Esc close)
- `apps/web/src/app/dashboard/actions.ts` — `fetchAttendanceDetailAction` server action
- `apps/web/src/app/dashboard/page.tsx` — import HeatmapInteractive

---

## Blok 2K-4 — Subject Reference Table (DEV-03)

**File yang dibuat/dimodifikasi:**
- `packages/database/prisma/schema.prisma` — model Subject {code, name, isActive} di academic schema
- `packages/database/prisma/migrations/20260613000001_2K4_subjects/migration.sql` — CREATE TABLE academic.subjects
- `scripts/seed-subjects.ts` — upsert DISTINCT subject dari teaching_assignments (idempotent)
- `apps/api/src/subject/dto/subject.dto.ts` — Zod schemas: CreateSubject, UpdateSubject, ListSubjectsQuery
- `apps/api/src/subject/subject.service.ts` — findAll, create, update (dengan conflict check)
- `apps/api/src/subject/subject.controller.ts` — GET /subjects (SA/KS/TU/GURU), POST/PATCH (SA/TU), tanpa DELETE
- `apps/api/src/subject/subject.module.ts`
- `apps/api/src/app.module.ts` — wire SubjectModule
- `apps/web/src/app/dashboard/akademik/page.tsx` — fetch /subjects, export SubjectItem, canEditAssignment prop
- `apps/web/src/app/dashboard/akademik/actions.ts` — createAssignment + createSubject server actions
- `apps/web/src/app/dashboard/akademik/_components/AkademikClient.tsx` — SubjectCombobox (free-type + "tambahkan?"), tab Penugasan, dialog Tambah Penugasan

---

## Blok 2K-5 — Quality Polish

**File yang dimodifikasi/dibuat:**
- `apps/api/src/keycloak-admin/keycloak-admin.service.ts` — httpError() kini: 400 → BadRequestException, 404 → NotFoundException (sebelumnya kedua jatuh ke ServiceUnavailable)
- `apps/web/src/app/dashboard/ai/_components/AiClient.tsx` — typing indicator 3-dot bounce + auto-scroll saat loading berubah
- `apps/web/src/app/dashboard/audit/page.tsx` — server component SA-only, filter via searchParams
- `apps/web/src/app/dashboard/audit/_components/AuditClient.tsx` — tabel + 6 filter + panel JSON metadata + pagination
- `apps/web/src/components/layout/Sidebar.tsx` — item 🛡 Audit Log (SA, audit.read)
- `apps/web/src/app/privacy/page.tsx` — halaman kebijakan privasi standalone (12 seksi)
- `apps/web/src/components/landing/Footer.tsx` — link "Kebijakan Privasi" di seksi Tautan

---

## Yang Ditunda (per spec)

- C4 credentials via WA — butuh akses Keycloak realm live
- FK subject → teaching_assignments — spec minta additive-only, FK tidak dibuat
- 2J-5 backfill — spec menunda eksplisit
- Drill backup runtime proof — butuh VPS aktif dengan data DB nyata

---

## Next Step

Buka PR dari `feat/2K-konsolidasi` → `develop`.
