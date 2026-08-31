# Appointment School-Date Follow-up Staging Review

Tanggal: 2026-08-31

Peran: Independent Staging Reviewer

Verdict: **APPROVED FOR STAGING SIGN-OFF AND PRODUCTION PROMOTION PLANNING**

Approval ini bukan izin promosi `main`, perubahan credential production, instalasi systemd,
manual rehearsal production, atau aktivasi timer.

## Findings

Tidak ditemukan P0, P1, atau P2 pada delivery dan QA staging scope ini.

### P3 - Residual governance ruleset main

Ruleset `Protect main` aktif dan mewajibkan satu approval, tetapi masih memiliki bypass actor
`RepositoryRole`. Environment `production` sendiri tetap mempunyai required reviewer dan
`can_admins_bypass=false`, sehingga deployment production masih memiliki manual gate nyata.
Residual ini tidak memblokir staging sign-off, tetapi harus tetap dicatat pada approval production
dan tidak boleh dipakai untuk melewati PR/review normal.

## Exact-SHA Integrity

- Feature head: `00fd78bca33a90c1473e0fa07ccbf68cdb82a3d7`.
- PR `#622` merged ke `develop`: `4bdc402faf182b5d418387e72d9fe5a2e41fced5`.
- PR `#623` merged ke `staging`: `b0fcb0d4e891a92a6dea9364d83bc75a01cc24ae`.
- Deploy run `33358979134` sukses pada exact staging SHA tersebut.
- Kedua PR masing-masing membawa tepat 15 file; Build, Lint & Type Check, dan Unit Tests lulus.
- Tree `origin/develop` dan `origin/staging` identik:
  `50a40483a434cbd37070045436d2a96ff60e911a`.
- Tidak ada PR terbuka.

## Independent Runtime Verification

Pemeriksaan read-only pada VPS membuktikan:

- checkout staging tepat `b0fcb0d4e891a92a6dea9364d83bc75a01cc24ae` dan bersih;
- `smk-staging-api` running/healthy dan `smk-staging-web` running;
- health endpoint HTTP 200 dengan database `up`;
- Prisma menemukan 46 migration dan schema up to date;
- request `POST /api/v1/appointments/activate-due` tanpa token ditolak 403;
- service dan timer production tetap `LoadState=not-found`, `ActiveState=inactive`;
- checkout production tetap bersih pada
  `76d64c6582fdf959d5868d89f36a3e36ea02beea`.

Reviewer tidak mengulang authorized one-shot karena itu merupakan endpoint mutasi. Evidence
Executor untuk dua run diterima: keduanya mengembalikan exact four-safe-count dengan seluruh
nilai nol, dan run kedua membuktikan idempotensi tanpa transition tambahan.

## Governance Verification

- Classic protection `develop`, `staging`, dan `main`: satu approval.
- Ruleset `Protect Staging` dan `Protect main`: aktif, satu approval.
- Ruleset staging tidak memiliki bypass actor.
- Environment production: required reviewer tersedia dan `can_admins_bypass=false`.
- Tidak ada staging drop-in, daemon reload, unit installation, credential production, Keycloak,
  n8n, database manual, main merge, atau production deployment pada scope ini.

## QA Scope Assessment

Tidak diperlukan browser QA atau regenerasi 40 screenshot, 24 PDF, dan 4 deck karena delta tepat
tujuh source backend, enam test backend, dan dua laporan audit. Tidak ada perubahan web, Help,
artifact registry/binary, schema, migration, dependency, atau infrastructure.

Boundary rollover selama lock wait tidak diuji dengan mengubah clock shared staging. Hal tersebut
diterima pada gate ini karena tiga deferred-lock source regression telah direview dan lulus untuk
scheduler, create academic year, dan update academic year. Staging membuktikan deployed wiring,
guard, safe response contract, idempotensi, health, dan containment.

## Gate Decision

Staging sign-off disetujui. Tahap berikutnya boleh menyiapkan promosi exact reviewed tree ke
`main`, tetapi eksekusi production tetap harus memakai approval baru yang menyebut exact SHA dan
batas tindakan.

Untuk efisiensi, satu approval production berikutnya boleh mencakup rangkaian Gate 1 yang
berurutan dan fail-closed: promosi/deploy `main`, verifikasi health/migration, pemasangan credential
tanpa mencetak nilainya, instalasi script/service/timer dalam keadaan disabled, lalu dua manual
one-shot rehearsal. Aktivasi `enable --now` tetap Gate 2 terpisah setelah laporan Gate 1 direview.

Confidence:

- Exact-SHA/Git delivery: 0.99
- Staging runtime: 0.98
- Security/privacy: 0.98
- Production readiness: 0.90 (Gate 1 dan Gate 2 belum dijalankan)
