# Wave 9 Checkpoint B Freeze Invalidation - Executive Authority Remediation

Tanggal: 2026-08-29
Peran: Executor
Status: FOLLOW-UP SOURCE READY FOR INDEPENDENT RE-REVIEW

## Baseline yang Dibatalkan

- Application-tested SHA: `eda0541ba6b5612e1640b4845220a314bc517822`
- Staging evidence SHA: `37226737a8555be8f1392490cf42a8ab27c81cb3`
- Shared-auth production SHA: `76d64c6582fdf959d5868d89f36a3e36ea02beea`
- Theme manifest SHA-256: `038f82f39d8419e5e398b6f63bbe6edf2c7b756cfbd06f792163b6a9c3b514f5`

Checkpoint B dihentikan ketika browser sintetis dengan Appointment `KEPALA_SEKOLAH` aktif membuka `/dashboard/executive` tetapi dikembalikan ke `/dashboard`. Screenshot yang diambil sebelum temuan tidak boleh digunakan sebagai evidence final.

## Akar Masalah

Halaman memakai stable JWT role, sedangkan Kepala Sekolah yang benar memiliki stable role `GURU` dan authority period-bound dari Appointment aktif. Sidebar dan katalog Help sudah mengenali Appointment tersebut, sehingga terjadi drift authority antarlapisan.

Independent review juga menemukan bahwa Position `KEPALA_SEKOLAH` belum memiliki mapping authoritative `finance.read`, serta initial render menyelesaikan authority tiga kali.

## Remediasi Source

- Halaman, action publik, Sidebar, dan Help memakai projection authority yang fail-closed.
- Akses Dasbor Eksekutif memerlukan `SUPER_ADMIN` atau Appointment `KEPALA_SEKOLAH`, serta permission efektif `finance.read`.
- `fetchExecutivePageData()` menyelesaikan authority sekali pada initial render dan meneruskan token tervalidasi ke loader privat.
- Kedua Server Action publik tetap memiliki guard sendiri untuk forged invocation.
- Stable `GURU` tanpa Appointment, Appointment lain, view-as, dan projection permission gagal tetap ditolak.
- Migration data-only `20260829000001_wave9_executive_authority_permission` memastikan permission canonical tersedia, memvalidasi tepat satu Position dan permission, lalu menambahkan tepat satu mapping idempotent.
- Manual revoke tetap menang atas grant Appointment.
- Tidak ada perubahan Prisma schema, dependency, role dasar, Keycloak, API contract, atau infrastruktur.

## PostgreSQL Disposable Proof

Docker Desktop lokal gagal start akibat socket inference stale. Bukti database dijalankan pada PostgreSQL 18 + pgvector native di WSL Ubuntu, terisolasi pada `/tmp`, port `55439`, dan database sintetis. Docker data, staging, serta production tidak disentuh; pengaturan Docker AI dikembalikan ke nilai awal.

- Clean apply: seluruh 46 migration resmi berhasil diterapkan dari database kosong.
- Idempotency: migration Wave 9 dijalankan ulang dua kali; count `finance.read=1` dan mapping KS `=1` tetap stabil.
- Resolver matrix PostgreSQL aktual:
  - stable `GURU` + Appointment KS aktif -> `finance.read=true`;
  - stable `GURU` biasa -> `false`;
  - stable `GURU` + Appointment non-KS -> `false`;
  - manual revoke aktif pada KS -> `false`.
- Fixture transaction rollback: seluruh row sintetis kembali `0`.
- Backup pre-migration: SHA-256 `ecbb128121307488938c8a0c311bd4638285ae36444f4acbe68c44503904c098`, ukuran `186025` byte.
- Restore rehearsal:
  - baseline hasil restore: 45 migration, `finance.read=0`, mapping KS `=0`;
  - setelah migration Wave 9 diterapkan ulang: 46 migration, `finance.read=1`, mapping KS `=1`.

## Verifikasi Executor

- Focused API: 2 suite / 47 test lulus.
- Focused web: 5 suite / 46 test lulus.
- Full API: 67 suite lulus, 1 suite skipped; 1.308 test lulus, 4 skipped.
- Full web: 50 suite / 366 test lulus.
- API/web type-check: lulus.
- API/web lint: lulus tanpa warning/error source.
- API build: lulus.
- Web production build: lulus, 49/49 halaman berhasil dibuat.
- Prisma validate/generate: lulus tanpa perubahan schema.
- `git diff --check`: lulus.

Regresi mencakup Super Admin wildcard, KS aktif, Guru tanpa Appointment, Appointment non-KS, view-as, projection gagal, unauthenticated/forged action, satu resolusi authority initial render, migration contract, resolver database, dan manual revoke.

## Gate Berikutnya

1. Independent Source Reviewer memeriksa migration, authority resolver, single initial authority resolution, PostgreSQL proof, dan kontrak fail-closed.
2. Setelah reviewer memberi approval, lakukan explicit Git packaging dan Gitflow normal.
3. Deploy reviewed SHA ke staging dan ulangi browser matrix terdampak untuk Super Admin, KS aktif, Guru biasa, Appointment non-KS, dan mode tinjau.
4. Tetapkan exact-SHA freeze baru.
5. Ambil ulang seluruh screenshot final Checkpoint B sebelum PDF/deck dibuat.

Belum ada staged change, commit, push, PR, deploy, atau perubahan shared Keycloak/production pada remediasi ini.
