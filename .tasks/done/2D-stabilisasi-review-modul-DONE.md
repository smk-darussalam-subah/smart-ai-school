# DONE — 2D: Stabilisasi + Review-Gate Retrospektif + Modul KamilEdu (2026-06-11)

> Eksekutor: Claude (Fable 5, sesi Cowork) — atas mandat Director "sempurnakan proyek,
> ambil modul & referensi dari dokumentasi KamilEdu". Branch stack dari `develop`:
> `feat/2D-1-repo-hygiene` → `feat/2D-2-permission-hardening` → `feat/2D-3-announcements`
> → `feat/2D-4-dashboard-classes` (linear, bisa di-PR sekaligus atau bertahap).

## Konteks temuan awal (audit 2026-06-11)
- 2B-1/2/3 dan 2C-0..7 ternyata SUDAH merged ke develop (9–10 Juni) **tanpa done-report
  dan tanpa gerbang review Cowork** — pelanggaran WAYS-OF-WORKING (akar "kacau di tengah jalan").
- queue.md masih berhenti di "Berikutnya: 2B Fondasi" → drift ledger vs kode.
- 677 file artefak coverage ter-commit (termasuk di `apps/api/src/coverage-*`).
- 1 error tsc di `audit-interceptor.spec.ts` (TS7006) → CI type-check merah.
- Frontend lama memanggil `/classes` & `/api/backend/classes` yang TIDAK ADA di API (silent 404).
- Dashboard admin menampilkan angka HARDCODED (542 siswa, 48 guru, dst.).

## 2D-1 — Repo hygiene (d416dd3)
- `git rm -r --cached` 7 direktori coverage (677 file, −178k baris) + `.gitignore` pola `coverage*/`.
- Fix TS7006 spec audit.

## 2D-2 — Permission hardening (e8c2a3b) — review-gate retrospektif 2B-2
Temuan & fix (semua ber-unit-test):
1. **PermissionGuard fail-open** — `if (!user) return true` → kini ForbiddenException (fail-closed).
2. **Override grant=false tidak efektif** — resolusi hanya membaca grant=true; revoke kini
   benar-benar MENARIK permission dari role (semantik schema "true=beri, false=tarik").
3. **Filter override di JS atas SELURUH tabel + N+1 findAuthUserId di loop** → kini
   `where { userId }` di QUERY level (doktrin proyek), 1 lookup.
4. **invalidateRole = no-op** (hanya purge expired) → `invalidateAll()` saat role/permission
   berubah; grant/revoke per-user → invalidasi user via reverse-lookup keycloakId (fail-safe clear-all).
Catatan review 2B-1 (audit log): interceptor PII-redaction/fail-soft/skip-audit SEHAT;
schema `audit` konsisten 4 tempat ✔. Temuan minor (backlog): statusCode interceptor ditebak
(POST→201, lainnya→200) bukan dari reply aktual; denylist field case-sensitive exact-match.
2B-3 (school-config): RBAC mutasi SA-only sehat; read terautentikasi ✔.

## 2D-3 — Modul Pengumuman Sekolah (d66db4c + 5ca3040) — KamilEdu M14
- Schema `notification.announcements` (additive CREATE-only, migration
  `20260611000001_2D3_announcements`): kategori(5)/prioritas(3)/audience JSONB/pin/
  status draft→published→archived/scheduledAt/jejak pembuat.
- API: GET list+detail (7 role; visibilitas NON-manager dipaksa di QUERY:
  published + audiens role/ALL + scheduledAt lewat), POST/PATCH/:id/publish/:id/archive/
  :id/pin (SA+KS), DELETE (SA) — CRUD penuh termasuk DELETE aman (tabel tanpa FK).
- Permission baru: `announcement.read/manage/delete` + mapping 7 role di seed-permissions.
- Web `/dashboard/pengumuman`: list pinned-first + badge + filter + cari, form
  draft/terbitkan dengan audiens per-role, jadwal tampil, konfirmasi hapus; sidebar 📢 semua role.
- publishedAt pertama tidak ditimpa re-publish; mutasi otomatis terekam AuditInterceptor.

## 2D-4 — Dashboard realtime + heatmap + API /classes (ac34bb6) — KamilEdu M1/M4
- `GET /attendance/heatmap?days=N` (SA/KS/TU): agregasi `groupBy(classId,date,status)`
  DI DB; pct per sel; sel tanpa data = null (bukan 0% menyesatkan); overall today vs
  yesterday untuk delta.
- API `/classes` BARU (GET staf+guru; POST/PATCH SA+TU; DELETE SA): menutup bug
  referensi frontend 404; studentCount + waliKelas (relasi teacher→user); DELETE → 409
  bila masih ada siswa/absensi/jadwal/penugasan (arahkan isActive=false).
- Dashboard web: kartu placeholder diganti data NYATA (siswa, rombel, kehadiran hari
  ini + delta, leads PPDB) dengan fail-soft '—'; widget heatmap 10 hari 5-level warna
  + legenda + tooltip hadir/total.

## Bukti runtime (O-02)
Lingkungan: salinan repo di sandbox Linux (Node 22), `npm install` penuh,
`prisma generate --no-engine` (engine binari diblokir jaringan sandbox).
- `tsc --noEmit` apps/api: **0 error** · apps/web: **0 error** · packages build OK.
- `eslint` apps/api & apps/web: **0 warning/error**.
- `jest` apps/api: **34 suite, 592 test PASS** (560 lama + 32 baru — tidak ada regresi,
  3 test permissions diperketat sesuai fail-closed) · apps/web: 12 PASS · packages/auth: 50 PASS.
- `nest build`: hijau. `next build`: TIDAK bisa di sandbox (SIGBUS worker swc — keterbatasan
  lingkungan, bukan kode) → **wajib dikonfirmasi via CI** sebelum merge.

## Belum diverifikasi (WAJIB sebelum CLOSED-prod)
1. `next build` di CI (sandbox tak mampu — lihat atas).
2. Migration `2D3_announcements` diuji di `smk_staging_db` dulu (payoff N-20):
   `\dt notification.announcements` + satu mutasi nyata → baris audit & pengumuman.
3. Pasca-merge: `prisma generate` + jalankan ulang `seed-permissions.ts`
   (3 permission baru announcement.*) di staging lalu prod.
4. Smoke test UI: /dashboard (heatmap+stat), /dashboard/pengumuman (CRUD+publish+pin),
   login GURU → hanya lihat pengumuman published utk GURU/ALL.

## Backlog baru (non-blok)
- AuditInterceptor: statusCode dari reply aktual; denylist case-insensitive + nested.
- SiswaForm masih POST ke `/api/backend/classes` (route Next tidak ada) → arahkan ke
  server action /classes baru.
- Pengumuman: integrasi broadcast WA (BullMQ) saat publish kategori darurat.
- Heatmap drill-down klik sel → detail absensi kelas.
