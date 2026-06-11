# DONE — 2E: Agent Harness + Backlog Fixes + Modul Jadwal (2026-06-11)

> Branch `feat/2E-harness-uiux` (4 commit, linear dari develop pasca-PR #107).
> Mandat Director: pasang ECC + skill ui-ux-pro-max, lanjutkan pengerjaan, kualitas maksimal.

## Commit
1. `feat(tooling)` — harness terkurasi: 14 skill + 13 agent ECC v2.0.0 (MIT) + skill
   ui-ux-pro-max v2.5.0 (MIT) di `.claude/`. **TANPA ECC hooks** (auto-exec node script
   tiap tool-use = risiko; quality gate tetap CI + review). Audit keamanan lengkap di
   `.claude/HARNESS.md` (md-only, scan pola berbahaya, scan import network python;
   `_sync_all.py` + tests dihapus dari vendor). CLAUDE.md §Tahap 2 menautkan kebijakan.
2. `fix(2E-backlog)` — 3 backlog 2D: (a) AuditInterceptor statusCode kini hormati
   @HttpCode (mis. 204); (b) redaksi PII case-insensitive + normalisasi `_-` + substring
   kunci + rekursif depth 3 + array diringkas; (c) SiswaForm "+ Kelas" → server action
   `createKelas` ke `/classes` nyata (route fiktif `/api/backend/classes` dihapus).
3. `feat(web) Jadwal` — KamilEdu M6: `/dashboard/jadwal`, matrix JP×Hari per kelas
   (rowSpan rentang JP, warna deterministik per mapel), list per hari utk semua-kelas,
   **deteksi bentrok klien** (guru sama overlap lintas kelas; kelas sama overlap rentang —
   celah unique-jpStart DB) di modul murni `conflicts.ts` + 5 unit test; a11y: bentrok
   bukan warna-saja (ikon+teks+tooltip); sidebar 📅.

## Bukti runtime (O-02)
- apps/api: tsc 0 · eslint 0 · **jest 34 suite / 594 PASS** (592→594, +2 hardening audit)
  · nest build hijau.
- apps/web: tsc 0 · eslint 0 · **jest 2 suite / 17 PASS** (12→17, +5 conflicts).
- packages/auth: 50 PASS. `next build`: tetap harus via CI (sandbox SIGBUS — diketahui).

## Wajib sebelum CLOSED
1. CI hijau (termasuk next build) di PR.
2. Smoke UI: /dashboard/jadwal (matrix + filter + tooltip bentrok bila ada data bentrok),
   SiswaForm "+ Kelas" membuat kelas nyata.
3. Konfirmasi Claude Code memuat `.claude/skills/*` project-scope di mesin Director.

## Backlog baru (non-blok)
- Form CRUD jadwal di halaman Jadwal (saat ini read-only; create masih via API/SA-TU).
- Endpoint agregat bentrok server-side (saat ini deteksi klien atas data visible).
- Presensi guru GPS+selfie (KamilEdu M8) & RPP review (M11) = kandidat modul berikutnya.
