# Wave 9 Checkpoint A - Parent Mobile Overflow Staging QA

Tanggal selesai: 2026-08-30

Peran laporan: Executor staging runtime evidence

Verdict Executor: **AFFECTED STAGING BROWSER MATRIX PASS - READY FOR INDEPENDENT STAGING REVIEW**

## Batas Gate

Laporan ini hanya menutup affected browser matrix untuk follow-up header mobile orang
tua. Laporan ini belum merupakan independent staging sign-off, izin memulai ulang
Checkpoint B, approval artefak, atau approval production.

Seluruh screenshot Checkpoint B yang dibuat sebelum follow-up tetap provisional.
Appointment automation production juga tetap belum aktif dan merupakan prasyarat
go-live terpisah.

## Git dan Deployment

| Bukti | Hasil |
| --- | --- |
| Feature commit | `d89012abc3b9dd43911658008c86ea358f56f57a` |
| PR feature | `#607` ke `develop`, merged |
| CI PR #607 | Build, Lint & Type Check, Unit Tests: PASS |
| Develop merge | `3f6d17b102589160b624f955760b106bd1bb75cc` |
| PR promotion | `#608` ke `staging`, merged |
| CI PR #608 | Build, Lint & Type Check, Unit Tests: PASS |
| Staging merge/deployed SHA | `de2d5b89929c385a93befc14b750c6798b491a11` |
| Deploy run | `33247269171`, PASS |
| VPS checkout | Persis `de2d5b89929c385a93befc14b750c6798b491a11` |
| Container | `smk-staging-api` healthy; `smk-staging-web` running |
| API health | HTTP 200, status `ok`, database `up` |
| Migration | 46 migration; schema up to date |
| Production/main | Tidak berubah, `76d64c6582fdf959d5868d89f36a3e36ea02beea` |

Temporary approval relaxation hanya dipakai pada branch yang diotorisasi. Setelah
merge, classic protection `develop`, `staging`, dan `main` kembali memerlukan satu
approval. Ruleset `Protect Staging` dan `Protect main` tetap aktif. Tidak ada PR
terbuka setelah delivery.

## Persona dan Data

- Persona: akun sintetis `ORANG_TUA` staging.
- Login: fresh federated Keycloak session; logout federated dilakukan setelah QA.
- Fixture: dua anak sintetis agar child switch dan contextual Help dapat diuji.
- Tidak ada data produksi, SQL langsung, perubahan schema, atau mutasi fixture.
- ID anak digunakan sementara di browser untuk membandingkan konteks, tidak dicetak
  ke laporan atau screenshot.

## Browser Matrix

### Viewport 390 x 844

Status: **PASS**

- `innerWidth=390`; document `scrollWidth=375`; tidak ada horizontal page overflow.
- Pemilih anak, Notifikasi, Panduan, dan Akun seluruhnya berada di dalam viewport.
- Seluruh empat kontrol top bar memiliki tinggi 44 px.
- Probe presentation-only dengan nama anak sintetis sangat panjang tetap menghasilkan
  pemilih maksimal 104 px; label terpotong, avatar/chevron tidak menyusut, dan tiga
  kontrol kanan tetap utuh.
- Rapor resmi dan Keuangan mempertahankan `studentId` anak terpilih.
- Halaman Rapor tidak memiliki elemen yang keluar viewport.

### Viewport 360 x 800

Status: **PASS**

- `innerWidth=360`; document `scrollWidth=345`; tidak ada horizontal page overflow.
- Dengan nama anak sintetis sangat panjang, seluruh action top bar tetap berada pada
  rentang horizontal 74.7-328.7 px.
- Pemilih anak maksimal 104 px; Notifikasi, Panduan, dan Akun masing-masing 44 x 44 px.
- Rapor resmi tetap tanpa overflow.
- Tabel Keuangan berukuran 441 px berada di dalam container `overflow-x:auto` selebar
  359 px. Container dapat digeser 82 px, sedangkan halaman tetap 360 px. Ini adalah
  responsive table scrolling yang terisolasi, bukan page overlap atau konten hilang.

## Child Switch dan Contextual Help

Status: **PASS**

1. Anak A aktif dan tautan Panduan membawa konteks anak A.
2. Pemilih anak menampilkan dua fixture sintetis.
3. Setelah memilih anak B, accessible name pemilih dan konteks `studentId` Panduan
   berubah ke anak B.
4. Setelah kembali ke anak A, konteks Panduan kembali ke anak A.
5. Deep-link `Rapor Resmi` dan `Keuangan dan SPP` mempertahankan konteks anak aktif.
6. Tidak ada ID internal yang ditampilkan kepada pengguna atau disimpan pada evidence.

## Panel Akun dan Aksesibilitas

Status: **PASS**

- Radix Sheet memiliki dialog bernama `Panel Akun` dan description yang terbaca.
- Initial focus berada di dalam dialog.
- Enam penekanan Tab berputar pada Tema, Notifikasi, Keluar, Tutup, lalu kembali ke
  awal; fokus tidak menembus overlay.
- Shift+Tab tetap berada di dialog.
- Escape menutup Sheet dan mengembalikan fokus ke tombol Akun.
- Tombol Tutup berukuran tepat 44 x 44 px.
- Pada 360 x 800, Sheet berada penuh di dalam viewport, semua action memiliki tinggi
  minimal 44 px, dan tidak membuat overflow halaman.

## Console dan Network

Status aplikasi: **PASS**

- Fresh reload menghasilkan 50 resource dengan status respons terukur; tidak ada
  resource HTTP 4xx/5xx.
- Tidak ada error atau warning aplikasi yang terdeteksi.
- Chrome extension mencatat satu pesan `Receiving end does not exist` pada kanal
  messaging ekstensi. Pesan juga muncul di halaman login, tidak berasal dari bundle
  DIIS, dan diklasifikasikan sebagai artefak browser-control non-product.

## Evidence PII-Safe

Evidence sementara tersimpan di `.tmp/wave9-parent-mobile-staging-qa-20260829/`:

- `parent-header-390x844.png`
- `parent-header-360x800-crop.png`
- `parent-account-sheet-360x800.png`

Nama pada probe adalah teks sintetis presentation-only. Evidence tidak memuat secret,
password, cookie, token, atau ID anak. File `.tmp` tidak boleh masuk Git packaging.

## Cleanup

- Teks probe tidak pernah disimpan ke server dan hilang saat reload.
- Viewport browser dikembalikan ke ukuran default.
- Sesi persona ditutup melalui federated logout.
- Tidak ada perubahan database, Keycloak role, schema, migration, staging container,
  atau production.
- File screenshot lama di `apps/web/private/help-screenshots/` tetap provisional dan
  tidak distage.

## Kesimpulan

Affected staging browser matrix lulus pada SHA aplikasi
`de2d5b89929c385a93befc14b750c6798b491a11`. Finding overflow mobile orang tua
tertutup pada viewport 390 x 844 dan 360 x 800, termasuk nama panjang, multi-anak,
deep-link Help/Rapor/Keuangan, serta keyboard/focus Panel Akun.

Gate berikutnya adalah independent staging review. Setelah reviewer mengonfirmasi
tidak ada P0/P1/P2 dan application-tree freeze, barulah seluruh screenshot, 24 PDF,
4 deck, dan adoption package Checkpoint B dibuat ulang.
