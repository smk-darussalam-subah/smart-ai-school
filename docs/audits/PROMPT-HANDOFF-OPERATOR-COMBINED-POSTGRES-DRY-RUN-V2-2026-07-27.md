# Handoff Executor: Combined PostgreSQL Dry-Run and Integrated Validation V2

Tanggal: 2026-07-27
Status: Director memberi izin eksplisit untuk menjalankan dry-run melalui executor/operator.
Tujuan: satu rangkaian bukti terintegrasi untuk TF2 + Appointment Wave B + Wave C final, dengan satu laporan kumulatif dan gate fail-closed.

## Peran

Anda adalah executor/operator validasi DIIS. Jalankan pemeriksaan source, test lokal, dry-run database, API runtime terisolasi, dan validasi n8n sesuai urutan gate. Anda boleh menggunakan SSH/VPS, PostgreSQL tools, snapshot staging, dan runtime sementara sesuai otorisasi Director, tetapi tidak boleh mengubah data staging/live atau production.

## Putusan dan Batas Mutlak

- Target hanya database disposable hasil restore snapshot staging. Nama harus mengandung `dryrun` atau `copy`.
- Jangan mencetak connection string, host internal, password, token, nama, email, telepon, NIS/NIP/NIY, Keycloak ID, atau UUID mentah ke terminal transcript/report.
- Jangan menjalankan migration, script proof, atau query write sebelum target diverifikasi bukan source/staging/live.
- Jangan commit, push, PR, deploy, restart service production/staging, mengaktifkan jadwal n8n, atau mengubah Keycloak.
- Import workflow n8n hanya boleh ke instance test/isolated dan harus tetap `active=false`. API runtime sementara hanya boleh menunjuk database disposable.
- Jangan mengirim WA/email nyata saat pengujian. Gunakan notification sink/dummy target atau putuskan cabang notifikasi.
- Bila preflight gagal, berhenti fail-closed dan laporkan hambatan tanpa mencoba target lain.

## Satu Laporan, Beberapa Gate

Gunakan satu file report sepanjang proses:

`docs/audits/APPOINTMENT-GOVERNANCE-INTEGRATED-VALIDATION-EXECUTION-2026-07-27.md`

Setiap gate harus memiliki status `PASS`, `FAIL`, `BLOCKED`, atau `DEFERRED`, command class, exit code, ringkasan hasil, dan residual risk. Jangan membuat laporan terpisah untuk tiap test. Bila sebuah gate wajib gagal, hentikan gate berikutnya dan tetap selesaikan report dengan alasan yang akurat.

## Manifest Source Final - Wajib Diverifikasi Dulu

Jalankan dari canonical worktree final yang memuat perubahan local Wave C, atau read-only copy yang dibuat persis dari worktree itu. Jangan memakai `develop` lama atau prompt operator 2026-07-24 secara verbatim.

Tiga migration target, urut timestamp:

1. `packages/database/prisma/migrations/20260722000001_tf2_p1_1_zombie_permissions/migration.sql`
2. `packages/database/prisma/migrations/20260724000001_appointment_governance_wave_b/migration.sql`
3. `packages/database/prisma/migrations/20260727000001_appointment_capacity_wave_c_architecture/migration.sql`

Outbox bukan target. Sebelum melanjutkan, buktikan bahwa `20260725000001_appointment_outbox_wave_c/migration.sql` tidak ada di source package yang akan dipakai. Bila ada, STOP: source package tidak sesuai keputusan Director Option A.

Rekam hash SHA-256 tiga file migration di atas dan `packages/database/prisma/schema.prisma` dalam report. Hash boleh dilaporkan; source/secret/PII tidak boleh.

## Gate 0 - Runtime Preflight

Pastikan tersedia `psql`, `pg_dump`, `pg_restore`, `createdb`, `dropdb`, Node/npm, dan source worktree. Siapkan environment variables sementara dan rahasia berikut tanpa pernah di-echo:

- `STAGING_DATABASE_URL` untuk source snapshot read-only.
- `DRYRUN_DATABASE_URL` untuk target disposable.

Gunakan query non-PII untuk membuktikan:

1. `current_database()` source dan target berbeda.
2. Nama target memiliki penanda `dryrun` atau `copy`.
3. Target bukan database staging/live/production yang dikenal operator.
4. Pada source snapshot, tabel `_prisma_migrations` tidak menunjukkan salah satu dari tiga migration target sudah diterapkan. Bila sudah ada, STOP dan minta snapshot yang tepat; jangan mengklaim initial migration proof.
5. Disk cukup untuk dump, restore, dan rehearsal kedua.

Connection string, hostname, dan nama database riil tidak boleh masuk report. Laporkan hanya `source_verified=yes`, `target_verified=yes`, serta kelas nama target `disposable`.

## Gate 1 - Source Integrity dan Automated Checks

Jalankan sebelum database mutation:

1. Verifikasi manifest/hash final, outbox tidak ada, `git diff --check`, conflict marker, dan whitespace file target.
2. Prisma generate dan validate dengan URL dummy atau disposable.
3. API focused:
   - `appointments.spec.ts`
   - `positions.spec.ts`
   - `permissions.spec.ts`
   - `school-config.spec.ts`
   - `roles.spec.ts`
4. API policy regression untuk attendance, grade, analytics, badges, gamification, WA log, student, report card/activity, teaching assignment, teacher attendance, question bank, dan schedule.
5. Web focused `struktur-ui.test.ts`.
6. API/web type-check dan lint.
7. API/web production build.
8. Parse workflow JSON dan pastikan boundary controller+n8n tidak memuat `academicYearId`, `affectedKeycloakIds`, `staffId`, atau `fullName`.

Rekam jumlah suite/test dan exit code. Warning existing harus dipisahkan dari error baru. Bila assertion, type-check, lint, build, Prisma validation, atau manifest check gagal, STOP sebelum Gate 2.

## Gate 2 - Combined PostgreSQL Dry-Run

1. Buat custom-format snapshot staging pada storage sementara terlindungi, lalu restore ke database disposable kosong.
2. Rekam baseline non-PII:
   - count `auth.users`, `auth.user_permission_overrides`, `school.staff_positions`, `school.positions`, `school.academic_years`;
   - agregat override menurut `source/status` bila kolom sudah ada;
   - status `_prisma_migrations` target;
   - fingerprint schema/tabel/kolom relevan tanpa row data.
3. Jalankan `prisma migrate status` terhadap target disposable.
4. Jalankan `prisma migrate deploy` terhadap target disposable saja, menggunakan source manifest final.
5. Rekam migration history, post-count, dan reconciliation untuk TF2 serta Appointment Wave B.
6. Verifikasi Wave C:
   - `school.positions.max_active_holders` ada dan constraint minimum satu ada;
   - kedua kode wakil yang diset kebijakan memiliki kapasitas dua;
   - function `school.appointment_enforce_active_capacity` dan trigger `appointment_scope_capacity_guard` ada;
   - partial unique index Wave B yang digantikan memang sudah tidak dipakai sebagai mekanisme kapasitas final.
7. Jalankan script `scripts/appointment-wave-b-dry-run.ts` untuk pre/post/reconciliation yang masih relevan, tetapi jangan menjadikannya satu-satunya proof Wave C karena script itu bernama/index-oriented.
8. Tambahkan capacity-trigger proof pada transaksi yang selalu di-rollback:
   - posisi berkapasitas satu: ACTIVE kedua pada scope sama ditolak;
   - WAKIL_KOOR_BKK atau WAKIL_KOOR_HUBIN berkapasitas dua: dua ACTIVE independen diterima, ACTIVE ketiga ditolak;
   - APPROVED successor dengan `replaces_appointment_id` boleh disiapkan saat incumbent ACTIVE;
   - kandidat terbuka tanpa replacement yang melebihi kapasitas ditolak.
   Gunakan fixture aktif yang memenuhi FK/role, jangan mencetak identifier fixture, dan pastikan seluruh insert proof rollback.
9. Lakukan restore rehearsal nyata: buat database disposable kedua dari snapshot yang sama dan bandingkan baseline schema/count dengan rekaman awal. Hapus copy rehearsal setelah perbandingan, tetapi pertahankan copy migrated utama sampai Gate 3-4 selesai.

Catatan validasi:

- `scripts/appointment-wave-b-dry-run.ts --prove-indexes` tetap berguna untuk skenario perilaku dan error `23505`, tetapi namanya mencerminkan desain Wave B lama. Setelah Wave C, bukti otoritatif adalah function/trigger capacity dan skenario kapasitas eksplisit.
- `SKIPPED` hanya boleh diterima bila fixture memang tidak tersedia dan ada proof alternatif yang setara. Skenario capacity satu dan dua holder tidak boleh seluruhnya `SKIPPED`.
- Restore rehearsal harus membandingkan fingerprint/count baseline yang direkam, bukan asumsi bahwa tabel/kolom tertentu selalu belum ada.

Jika migration, reconciliation, capacity proof, atau restore rehearsal gagal, STOP. Jangan lanjut ke runtime API.

## Gate 3 - API Runtime Terisolasi End-to-End

Jalankan API pada port sementara dengan:

- `DATABASE_URL` menuju database disposable hasil migration;
- token automation sementara minimal 32 byte;
- integrasi Keycloak, WA, email, dan layanan eksternal dibuat fail-soft/dummy bila tidak diperlukan;
- tidak ada koneksi write ke staging/live.

Validasi minimal:

1. `POST /appointments/activate-due` tanpa token dan token salah ditolak `403`.
2. Token valid menghasilkan hanya `endedCount`, `cancelledCount`, `activatedCount`, `affectedUserCount`.
3. Query `academicYearId` tambahan tidak dapat mengubah target; hanya tahun aktif diproses.
4. Dua pemanggilan berulang idempotent; panggilan kedua tidak mengaktivasi ulang row yang sama.
5. Dua request concurrent tidak menghasilkan duplicate activation dan menggunakan shared advisory-lock domain.
6. Future `APPROVED` tidak memberi permission sebelum `effectiveFrom`; due `APPROVED` menjadi `ACTIVE`.
7. `SUSPENDED` menghapus authority; linked PLT dapat aktif; resume ditolak selama PLT aktif dan diterima setelah PLT berakhir bila kapasitas tersedia.
8. Cutover tahun ajaran mengakhiri `ACTIVE/SUSPENDED` tahun lama, membatalkan draft/open lama, dan mengaktifkan appointment due tahun baru dalam transaksi yang sama.
9. Same-person reappointment lintas tahun diterima; same-person same-year ditolak.
10. Legacy `PositionsService.assign/unassign` tetap `409` tanpa menulis StaffPosition, override, cache, atau Keycloak.
11. Permission resolver hanya memakai Appointment `ACTIVE` efektif + override `MANUAL`; normal GURU tidak menjadi elevated.
12. Struktur, Users access diagnostic, dan sidebar projection tidak membaca StaffPosition sebagai authority.

Gunakan fixture sintetis pada database disposable dan sanitasi semua output. Setelah test, rollback/hapus fixture tetapi pertahankan database disposable untuk Gate 4. Bila satu skenario authority/lifecycle gagal, STOP sebelum Gate 4 dan lanjutkan cleanup aman.

## Gate 4 - n8n Isolated Runtime

Import `appointment-due-activation-daily.json` ke instance test/isolated dalam keadaan `active=false`.

Validasi:

1. Workflow tetap memiliki satu schedule owner dan tidak menduplikasi transition logic API.
2. URL mengarah ke API internal sementara, token berasal dari env/credential, dan tidak ada secret literal.
3. Manual execution sukses terhadap API disposable dan hanya menyimpan safe counts.
4. Execution data seluruh node tidak memuat token, Keycloak ID, UUID fixture, nama, email, telepon, `staffId`, atau `fullName`.
5. Simulasikan kegagalan API tanpa mengirim notifikasi nyata; jalur alert menghasilkan payload generik yang tidak memuat PII.
6. Workflow tetap `active=false` setelah test.
7. Setelah evidence lengkap, hentikan runtime sementara, hapus workflow test bila dibuat khusus, drop database disposable migrated, dan hapus snapshot sesuai retensi aman.

Jika instance n8n isolated tidak tersedia, tandai Gate 4 `BLOCKED`, bukan `PASS`. Offline JSON parse saja tidak cukup untuk runtime sign-off.

## Gate 5 - Browser/Staging QA Setelah Promotion

Gate ini dicatat pada report yang sama tetapi **DEFERRED** sampai reviewer menyetujui Git packaging, CI hijau, dan promotion staging. Dry-run executor tidak boleh melakukan promotion sendiri.

Setelah staging tersedia, QA wajib:

1. SUPER_ADMIN dapat melihat struktur appointment, status lifecycle, tahun, scope, tanggal efektif, dan kapasitas dengan benar.
2. KEPALA_SEKOLAH aktif dapat mengesahkan jabatan non-KS; hanya SUPER_ADMIN dapat mengesahkan KEPALA_SEKOLAH.
3. GURU biasa tetap scoped; WAKA/KAPROG/BKK/Hubin hanya mendapat permission sesuai appointment/position permission.
4. Users access dialog menampilkan stable identity, active appointments, appointment permissions, manual override, dan effective permissions secara konsisten.
5. Sidebar berubah setelah appointment efektif/cache refresh tanpa memerlukan realm role jabatan.
6. Suspend, PLT, end, supersede, resume, pergantian tengah tahun, dan reappointment lintas tahun memiliki dialog/message yang jelas.
7. Cutover tahun ajaran dan due activation n8n terpantau melalui count aman tanpa logout paksa atau PII.
8. Legacy Struktur assignment action tetap read-only/fail-closed selama UI Appointment lifecycle belum menggantikannya sepenuhnya.
9. Desktop dan mobile tidak mengalami overflow, overlap, false empty state, atau stale terminology `StaffPosition` sebagai authority.

Lampirkan screenshot hanya bila bebas secret/PII atau sudah disanitasi.

## Kriteria Lulus

Gate 1-4 harus terpenuhi untuk runtime validation sign-off:

- Tiga migration final sukses dalam urutan tepat; outbox tidak diterapkan.
- TF2 quarantine/revoke reconciliation tidak kehilangan row dan tidak mengaktifkan grant ambigu.
- Appointment migration menghasilkan agregat status/review yang masuk akal dan tidak mengubah `staff_positions` secara tak terduga.
- Capacity trigger memenuhi empat skenario di atas pada PostgreSQL aktual.
- Restore rehearsal mengembalikan baseline schema dan count yang direkam sebelum migration.
- API lifecycle/authority scenarios lulus pada runtime disposable.
- n8n isolated runtime lulus dan workflow tetap inactive.
- Report PII-minimal berisi command class, exit status, hash manifest, count/agregat, hasil proof, dan residual; tidak berisi secret atau identitas.

Gate 5 boleh `DEFERRED` pada tahap ini, tetapi harus `PASS` sebelum staging/final Wave C sign-off.

## Stop Conditions

STOP dan kembali ke reviewer bila source manifest tidak cocok, outbox masih ada, target tidak terbukti disposable, snapshot sudah berisi migration target, automated check gagal, migration gagal, count/reconciliation tidak konsisten, capacity proof tidak deterministik, restore rehearsal gagal, runtime authority/lifecycle gagal, atau execution n8n memuat secret/PII.

## Format Deliverable Tunggal

Buat dan perbarui hanya:

`docs/audits/APPOINTMENT-GOVERNANCE-INTEGRATED-VALIDATION-EXECUTION-2026-07-27.md`

Struktur report:

1. Executive verdict dan confidence.
2. Source manifest + SHA-256.
3. Gate matrix 0-5.
4. Automated test summary.
5. PostgreSQL pre/post reconciliation.
6. Capacity/concurrency/restore proof.
7. API runtime scenario matrix.
8. n8n execution safety evidence.
9. Browser/staging QA atau alasan `DEFERRED`.
10. Findings P0/P1/P2, residual, cleanup confirmation, dan rekomendasi gate berikutnya.

Jangan melakukan Git action setelah validasi; kirim report tunggal tersebut ke reviewer.
