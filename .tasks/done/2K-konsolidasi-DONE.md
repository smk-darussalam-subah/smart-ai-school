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

**Gate: LULUS — Bukti Runtime VPS (2026-06-13)**

```
[backup-db 2026-06-13 06:21:22] Mulai backup smk_db → /home/appuser/backups/smk_db_20260613_0621.dump
[backup-db 2026-06-13 06:21:22] OK — file: smk_db_20260613_0621.dump, ukuran: 1.2M
[backup-db 2026-06-13 06:21:22] sha256: 91038e5f4bbcb07b1eb2f0ee6ae43cc4f61b9a6aa7fd1a1f989d5fb83327bcad
[backup-db 2026-06-13 06:21:22] Backup selesai

[restore-drill 2026-06-13 06:22:01] Dump terbaru: /home/appuser/backups/smk_db_20260613_0621.dump
[restore-drill 2026-06-13 06:22:01] Ukuran: 1.2M, SHA-256: 91038e5f4bbcb07b1eb2f0ee6ae43cc4f61b9a6aa7fd1a1f989d5fb83327bcad
[restore-drill 2026-06-13 06:22:01] Membuat database sementara: smk_restore_test
[restore-drill 2026-06-13 06:22:01] Restore selesai

  LAPORAN DRILL RESTORE — 2026-06-13 06:22:06
  Dump: smk_db_20260613_0621.dump (1.2M)

  Jumlah Tabel per Schema:
  academic|9  ai_knowledge|3  audit|1  auth|4  finance|1
  keycloak|92  n8n|91  notification|2  ppdb|1  public|77  school|5  student|1  teacher|2

  Row Count Tabel Kunci:
  auth.users|39  student.students|20  audit.audit_log|9

[restore-drill 2026-06-13 06:22:01] Database 'smk_restore_test' berhasil di-DROP
[restore-drill 2026-06-13 06:22:01] Drill sukses
```

VPS: `appuser@204.168.242.123`, BACKUP_DIR=`~/backups`, deploy key `id_ed25519_deploy`.

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
- ~~Drill backup runtime proof~~ — ✅ SELESAI 2026-06-13 (lihat Blok 2K-1)

---

## Status Akhir

✅ PR #139 di-merge ke `develop` — 2026-06-13
✅ Migration `20260613000001_2K4_subjects` applied di VPS
✅ Backup + restore drill LULUS di VPS
✅ Semua 5 blok selesai dengan bukti runtime
