# Wave 9 Checkpoint A Executive Authority Staging QA

Tanggal: 2026-08-29
Status: EXECUTOR QA COMPLETE - READY FOR EXACT-SHA FREEZE

## Scope

Laporan ini mencatat delivery dan affected browser matrix setelah penutupan authority Dasbor Eksekutif serta perbaikan aksesibilitas navigasi mobile. Semua akun yang digunakan adalah fixture sintetis staging. Tidak ada credential, secret, data siswa nyata, atau screenshot ber-PII yang disimpan.

Checkpoint B belum dijalankan ulang pada laporan ini. Screenshot final, PDF, deck, dan adoption package wajib menggunakan freeze SHA baru setelah laporan ini dipromosikan sebagai evidence docs-only.

## Source dan Git Delivery

- Source authority commit: `f3c237b79e328c986dbeb190a3d0e77cc65fd75f`.
- PR source authority: `#601` ke `develop`, CI hijau.
- PR promotion authority: `#602` ke `staging`, CI hijau.
- Follow-up accessibility commit: `7d7512d3deb811e327251043c4e9731e8d17049d`.
- PR follow-up: `#603` ke `develop`, CI run `33242780684`, seluruh check hijau.
- PR promotion follow-up: `#604` ke `staging`, CI run `33242999035`, seluruh check hijau.
- Staging application SHA final yang diuji: `816673bafdf8073dbe7ca76c621c0a40df4ffd43`.
- Application tree: `daf8af567acaef309f303e64e0ba13954c805048`.
- Deploy staging: run `33243194950`, sukses.
- `origin/main` tetap `76d64c6582fdf959d5868d89f36a3e36ea02beea` dan tidak disentuh.

Temporary approval relaxation hanya digunakan pada merge yang telah diotorisasi. Setelah merge:

- classic protection `develop`: `1` approval;
- classic protection `staging`: `1` approval;
- classic protection `main`: `1` approval;
- ruleset `Protect Staging`: `1` approval;
- PR terbuka: `0`.

## Runtime Preflight

Runtime VPS staging diverifikasi pada checkout `/opt/diis-staging/smart-ai-school`:

- checkout SHA tepat `816673bafdf8073dbe7ca76c621c0a40df4ffd43`;
- `smk-staging-web` running;
- `smk-staging-api` healthy;
- health API `200`, database `up`;
- Prisma menemukan `46` migration dan schema dinyatakan up to date;
- production checkout, container, database, Keycloak, timer, dan branch tidak dimutasi.

## Affected Browser Matrix

Browser QA menggunakan fresh federated synthetic sessions dan akun yang memiliki pasangan row aplikasi serta user Keycloak. Tidak ada role yang disuntikkan melalui browser.

| Skenario | Hasil | Evidence ringkas |
| --- | --- | --- |
| SUPER_ADMIN | PASS | Dasbor Eksekutif terlihat dan dapat dibuka; data strategis ter-render; console bersih. |
| Stable GURU + Appointment KEPALA_SEKOLAH aktif | PASS | Shell menampilkan identitas Guru dan Appointment Kepala Sekolah; menu dan route Dasbor Eksekutif tersedia. |
| WAKA aktif non-KS | PASS | Menu Dasbor Eksekutif tidak tersedia; direct route kembali ke dashboard; konten eksekutif tidak bocor. |
| GURU biasa tanpa authority | PASS | Menu tidak tersedia; direct route kembali ke dashboard; console bersih. |
| Mode tinjau GURU dari akun KS | PASS | Appointment asli disembunyikan, route eksekutif ditolak, dan authority KS pulih setelah mode tinjau dihentikan. |
| Mobile KS 390x844 | PASS | Menu berisi Dasbor Eksekutif, dialog bernama dan memiliki deskripsi, tanpa horizontal overflow. |

Keycloak read-only preflight juga membuktikan fixture tidak memiliki kombinasi stable role ganda. Karena itu matrix role campuran tidak direkayasa.

## Accessibility dan UX Follow-up

Browser run awal menemukan warning Radix karena sheet navigasi mobile memiliki title tetapi tidak memiliki description. Finding ditutup pada PR `#603/#604` dengan `SheetDescription` yang screen-reader-only serta behavioral render regression.

Re-QA pada SHA `816673b...` membuktikan:

- viewport `390x844`, `innerWidth=390`, `scrollWidth=390`;
- dialog memiliki accessible name `Menu navigasi`;
- `aria-describedby` menunjuk teks `Navigasi utama sesuai peran dan kewenangan aktif.`;
- fokus awal tetap berada di dalam dialog;
- Escape menutup dialog;
- fokus kembali ke tombol `Buka menu navigasi`;
- tidak ada console warning atau error baru setelah fresh reload;
- direct-route GURU biasa tetap fail-closed setelah perubahan shared layout.

## Automated Verification

- Focused MobileNav test: `3/3` pass.
- Web type-check: pass.
- Web lint: pass, tanpa warning/error aplikasi.
- Fresh web build: `49/49` halaman.
- CI PR `#603`: Build, Lint & Type Check, Unit Tests pass.
- CI PR `#604`: Build, Lint & Type Check, Unit Tests pass.
- Git diff/cached check: pass.

## Cleanup dan Containment

- Federated browser session diakhiri dan browser kembali ke halaman login.
- View-as state dibersihkan sebelum logout.
- Mobile viewport override dikembalikan.
- Tidak ada fixture database, role Keycloak, atau permission yang dibuat selama affected QA.
- Tidak ada screenshot final, PDF, deck, atau adoption package yang dibuat pada SHA lama.

## Freeze Handoff

Application source yang telah diuji dibekukan pada:

- application SHA: `816673bafdf8073dbe7ca76c621c0a40df4ffd43`;
- application tree: `daf8af567acaef309f303e64e0ba13954c805048`.

Setelah laporan ini dipromosikan docs-only ke staging, catat final staging evidence SHA dan buktikan bahwa delta dari application SHA hanya dokumen ini. Checkpoint B baru boleh membuat ulang screenshot PII-safe, 24 PDF, 4 deck, dan adoption package setelah exact-SHA freeze tersebut ditetapkan.

Appointment automation production tetap belum diklaim aktif dan tetap merupakan prasyarat go-live terpisah.
