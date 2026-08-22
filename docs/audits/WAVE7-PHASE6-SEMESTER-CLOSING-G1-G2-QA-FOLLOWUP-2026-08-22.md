# Wave 7 Phase 6 Semester Closing - G1/G2 QA Follow-up

Tanggal: 2026-08-22
Executor: Codex
Scope: QA staging follow-up setelah PR #551 dan promosi staging #552.

## Verdict Executor

READY FOR REVIEWER FINAL STAGING SIGN-OFF.

Tidak ada P0/P1/P2 baru yang ditemukan pada follow-up ini.

## Delivery Evidence

- PR source: #551, head `2e5cdad6e5834271dcebd83e1676bf2afb3c1c19`.
- Merge ke `develop`: `45c33ab59de52ce19a571f361400e46a4fc9dce9`.
- Promotion PR: #552.
- Merge ke `staging`: `03c57303365ba7f6d49f02a55f0987448f6999f9`.
- Deploy staging: run `32556638311`, conclusion `success`.
- VPS staging checkout: `/opt/diis-staging/smart-ai-school` at `03c57303365ba7f6d49f02a55f0987448f6999f9`.
- Staging API health: `ok`, database up.
- Prisma migrate status staging: 44 migrations, schema up to date.
- Production checkout unchanged: `/home/appuser/smart-ai-school` at `23e93af414a3b71ff0114ad43f78b833cefaa132`.
- Open PR list after delivery: none.
- Branch protection restored:
  - `develop`: 1 required approval.
  - `staging`: 1 required approval.
  - `main`: 1 required approval.

## G1 - KAPROG Major-only Authority

Status: PASS.

Metode:

- Login browser staging memakai akun PII-safe.
- Buat appointment `KAPROG` untuk akun GURU fixture pada jurusan `QAAKL`.
- Approve appointment melalui UI `Struktur Organisasi`.
- Jalankan one-shot aktivasi appointment staging:
  - Run pertama: `endedCount=0`, `cancelledCount=0`, `activatedCount=1`, `affectedUserCount=1`.
  - Run kedua: `endedCount=0`, `cancelledCount=0`, `activatedCount=0`, `affectedUserCount=0`.
- Login sebagai GURU fixture dengan appointment aktif KAPROG.
- Buka `/dashboard/penutupan-semester`.

Evidence:

- Page menampilkan `Scope jurusan QAAKL`.
- Form final close tidak ditampilkan; mode tinjau muncul.
- Tab `Capaian` hanya menampilkan `X QAAKL 1` dan `QAAKL`.
- Tidak ditemukan `QATKJ`, `QABDP`, `Scope sekolah`, atau data sekolah penuh pada tampilan KAPROG.
- Browser console error: none for G1.

Kesimpulan: appointment KAPROG aktif memberi akses major-only, bukan school-wide.

## G2 - Positive Close on Disposable Stack

Status: PASS.

Shared staging tidak ditutup.

Catatan integritas evidence:

- Evidence awal `wave7-g2-before-close.png` dan `wave7-g2-after-close.png` dinyatakan superseded karena keduanya merekam state setelah close.
- G2 diulang minimal pada disposable stack fresh dengan artifact baru berawalan `wave7-g2-rerun-*`.
- Rerun ini membuktikan state browser/API dimulai dari `closureCount=0`, melakukan final close, lalu berakhir dengan `closureCount=1`.

Karena Docker lokal Windows tidak aktif untuk disposable browser runtime, disposable stack dijalankan di VPS menggunakan database PostgreSQL terpisah:

- Disposable DB: `diis_wave7_g2_rerun_20260822`.
- API container temp: `diis-wave7-g2-rerun-api`.
- Web container temp: `diis-wave7-g2-rerun-web`.
- Image: image staging yang sama dengan SHA deployed.
- API health disposable: `ok`.
- Migration disposable: 44 migrations applied, schema up to date.
- Seed fixture PII-safe: 1 academic year, semester 1/2, 1 class, 1 student, 1 teaching assignment, 1 approved RPP, 1 KKTP config, 1 distributed report card, 1 attendance record, active KS appointment.

Metode auth:

- OIDC terhadap Keycloak staging memakai akun KS fixture.
- Client secret dan NextAuth secret dibaca dari env runtime secara redacted dan hanya dipakai di memori.
- Auth.js session cookie dibuat di memori.
- Browser QA memakai Chrome headless lokal melalui Playwright-core temp dengan extra Cookie header.
- Tidak ada token, password, cookie, atau secret yang dicetak atau disimpan permanen.

Browser flow:

1. Buka `/dashboard/penutupan-semester`.
2. Verifikasi state awal `Siap ditutup`, `Scope sekolah`, dan form `Final Close`.
3. Isi konfirmasi `TUTUP SEMESTER`.
4. Konfirmasi dialog final close.
5. Verifikasi handoff ke laporan historis.
6. Buka `Riwayat`.
7. Buka detail snapshot historis.
8. Jalankan `Cetak` dengan stub `window.print`.
9. Unduh CSV.

Evidence result:

- Before close:
  - API `/semester-closing/closures`: `closureCount=0`.
  - API `/semester-closing/readiness`: `ready=true`, `alreadyClosed=false`.
  - Browser: `Penutupan Semester 1 2026/2027`, `Siap ditutup`, `Scope sekolah`, dan form `Final Close` tersedia.
  - Screenshot: `.tmp/wave7-g2-rerun-before-close.png`.
  - SHA-256: `631b0a8eb9816c5055ae1b517999ec2936e51d349da3d7a53c7feda387271869`.
- Final close:
  - Browser mengisi `TUTUP SEMESTER`.
  - Dialog `Konfirmasi Final Close` dibuka.
  - Tombol dialog `Tutup Semester` diklik.
- After close:
  - API `/semester-closing/closures`: `closureCount=1`.
  - Browser pindah ke `Penutupan Semester 2 2026/2027`.
  - Browser menampilkan pesan `Semester 1 2026/2027 berhasil ditutup`.
  - Screenshot: `.tmp/wave7-g2-rerun-after-close.png`.
  - SHA-256: `cdc7a13c51bf068833a622100440bf482d75ff7b8275c175148ce901fee8ba18`.
- Screenshot before/after berbeda: `true`.
- Setelah close, UI pindah ke `Semester 2 2026/2027` dan menampilkan pesan `Semester 1 2026/2027 berhasil ditutup`.
- Detail historis membaca snapshot immutable:
  - `LAPORAN FINAL HISTORIS`
  - `Semester 1 2026/2027`
  - actor `QA Wave7 G2 Kepala Sekolah`
  - hash snapshot
  - period berikutnya `Semester 2 2026/2027`
  - heatmap kelas `X G2AKL 1`
  - heatmap jurusan `G2AKL`
  - KKTP `Matematika`, provenance `Konfigurasi kelas`
  - CP/TP/ATP: `TP 1`, `1/1`, `Terpetakan`
- Detail screenshot: `.tmp/wave7-g2-rerun-detail.png`.
- Detail SHA-256: `05545ef6bfa9eaa819f7c11c731874eb5f8372c80210a7a4046fa8333d8644b7`.
- Print: button found, `window.print()` called.
- CSV:
  - Filename: `laporan-penutupan-semester-2026-2027-semester-1.csv`.
  - Contains `X G2AKL 1`.
  - Contains `G2AKL`.
  - Contains `Matematika`.
  - Contains snapshot rows for metrics, class heatmap, major heatmap, subject KKTP, and curriculum map.
- Network response issues: none.
- Console issue: one local disposable favicon `404`. This is classified as localhost favicon noise, not an API/app data failure.

Local evidence artifacts retained:

- `.tmp/wave7-g2-rerun-evidence.json`
- `.tmp/wave7-g2-rerun-before-close.png`
- `.tmp/wave7-g2-rerun-after-close.png`
- `.tmp/wave7-g2-rerun-detail.png`

Do not commit `.tmp` artifacts unless reviewer explicitly asks.

## Cleanup

Completed:

- Removed disposable containers `diis-wave7-g2-rerun-api` and `diis-wave7-g2-rerun-web`.
- Dropped disposable DB `diis_wave7_g2_rerun_20260822`.
- Removed remote temp env, seed, cid, health, and log files.
- Stopped SSH tunnel.
- Removed local headless Chrome profile, temp PFX, temp env, and temp Playwright-core install.
- Removed helper scripts; retained only `.tmp` evidence artifacts.

## Final Notes

- Shared staging remains deployed at `03c57303365ba7f6d49f02a55f0987448f6999f9`.
- Production/main was not modified.
- No PR remains open.
- Main promotion remains a separate gate after reviewer final staging sign-off.
