# Wave 9 Checkpoint B - Parent Mobile Overflow Follow-up

Tanggal: 2026-08-29

Peran laporan: Executor readiness evidence

Status: FOLLOW-UP READY FOR INDEPENDENT SOURCE REVIEW

## Konteks Freeze

Checkpoint B dimulai dari baseline berikut:

- tested application SHA: `816673bafdf8073dbe7ca76c621c0a40df4ffd43`;
- tested application tree: `daf8af567acaef309f303e64e0ba13954c805048`;
- final staging evidence SHA: `7cee9075b05a7f0dbba4ae259a666efeb2537731`;
- shared-auth production SHA: `76d64c6582fdf959d5868d89f36a3e36ea02beea`;
- theme manifest SHA-256: `038f82f39d8419e5e398b6f63bbe6edf2c7b756cfbd06f792163b6a9c3b514f5`.

Saat screenshot keluarga PII-safe dibuat pada viewport 390 x 844, browser membuktikan
`document.documentElement.scrollWidth=459`. Sesuai kontrak Checkpoint B, temuan produk
ini membatalkan freeze dan produksi artefak dihentikan. Screenshot yang sudah dibuat
sebelum follow-up ini berstatus provisional dan tidak boleh menjadi evidence final.

## Finding

### P2 - Parent mobile header menyebabkan horizontal overflow

`OrtuWorkspace` menempatkan tautan teks penuh `Panduan orang tua` di top bar yang sama
dengan pemilih anak, lonceng, pengubah tema, dan tombol akun. Tautan menggunakan
`w-full` dan tidak dapat menyusut, sehingga top bar memaksa lebar dokumen menjadi 459 px
pada viewport 390 px. Bagian kanan UI dan bottom navigation ikut terpotong dalam
screenshot full-page.

## Remediasi

### Closure awal

Implementasi awal memindahkan Help ke Panel Akun dan menambahkan containment
`overflow-x-clip`. Independent source review menerima diagnosis, tetapi menemukan dua
P2: nama anak panjang masih dapat mendorong kontrol dan panel Akun custom belum memiliki
focus trap, Escape, focus restoration, serta target tutup 44 px.

### Closure final

1. Mengganti tombol Tema di top bar dengan ikon Help 44 x 44 px. Tautan Help tetap
   membawa `studentId` terpilih secara fail-closed.
2. Mempertahankan pengaturan Tema di Panel Akun sehingga tidak ada fungsi yang hilang.
3. Membatasi pemilih anak maksimal 6.5 rem, memberikan `min-w-0` dan `truncate` pada
   label, serta `shrink-0` pada avatar dan chevron.
4. Menyimpan nama anak lengkap dalam accessible name `Pilih anak. Aktif: ...`.
5. Menyembunyikan label brand secara visual di bawah 375 px, tetapi mempertahankan logo
   DIIS dan seluruh kontrol utama.
6. Mengganti panel custom dengan Radix `Sheet` terkontrol. Focus trap, Escape, overlay,
   dan focus restoration sekarang mengikuti primitive yang sudah dipakai aplikasi.
7. Menaikkan target tutup komponen `Sheet` bersama menjadi minimal 44 x 44 px dan
   melokalkan accessible name menjadi `Tutup`.
8. Mempertahankan `overflow-x-clip` hanya sebagai lapisan pertahanan terakhir, bukan
   sebagai solusi utama.
9. Menambahkan component-render tests untuk nama anak ekstrem, prioritas kontrol,
   semantic Sheet, title/description, dan target tutup 44 px.

Perubahan tidak menyentuh API, schema, migration, dependency, auth, permission, data,
tema harian, atau route ownership.

## Verifikasi Lokal

| Gate | Hasil |
| --- | --- |
| Executor focused component and regression tests | PASS, 4 suite / 25 test |
| Independent reviewer focused rerun | PASS, 3 suite / 22 test |
| Web type-check | PASS |
| Web lint | PASS, tanpa warning/error source |
| Fresh web production build | PASS, 49/49 halaman |
| `git diff --check` | PASS |

Build mengeluarkan warning konfigurasi ESLint lama yang sudah ada; tidak ada warning
atau error lint pada patch ini.

Empat suite Executor dijalankan melalui exact command berikut:

```powershell
npm.cmd test -- --runInBand src/__tests__/parent-mobile-header.test.ts src/__tests__/sheet-accessibility.test.ts src/__tests__/academic-operational-ui.test.ts src/__tests__/mobile-nav.test.ts
```

Suite dan jumlah test pada run Executor:

1. `parent-mobile-header.test.ts`: 2 test;
2. `sheet-accessibility.test.ts`: 1 test;
3. `academic-operational-ui.test.ts`: 19 test;
4. `mobile-nav.test.ts`: 3 test.

Total Executor adalah 4 suite / 25 test. Independent Reviewer menjalankan subset tiga
suite / 22 test dan seluruhnya lulus. Kedua hasil dicatat terpisah agar provenance
evidence tidak disalahartikan sebagai satu rerun yang sama.

## Manifest Follow-up

Manifest Executor yang harus direview:

1. `apps/web/src/app/dashboard/akademik/_components/ortu/OrtuWorkspace.tsx`
2. `apps/web/src/components/ui/sheet.tsx`
3. `apps/web/src/__tests__/parent-mobile-header.test.ts`
4. `apps/web/src/__tests__/sheet-accessibility.test.ts`
5. `docs/audits/WAVE9-CHECKPOINT-B-PARENT-MOBILE-OVERFLOW-FOLLOWUP-2026-08-29.md`

Laporan Independent Reviewer berikut tetap reviewer-owned dan tidak boleh dimasukkan
diam-diam ke manifest Executor:

- `docs/audits/WAVE9-CHECKPOINT-B-PARENT-MOBILE-OVERFLOW-SOURCE-REVIEW-2026-08-29.md`

File screenshot provisional di `apps/web/private/help-screenshots/` tidak termasuk
manifest follow-up dan tidak boleh dipaketkan.

## Gate Berikutnya

1. Independent source re-review terhadap lima file manifest Executor.
2. Setelah approval, explicit Git packaging tanpa `git add .` atau `git add -A`.
3. Promosi normal `develop -> staging` dan deploy reviewed SHA.
4. Ulang affected browser matrix pada 390 x 844 dan 360 x 800 untuk:
   - parent dashboard/remedial;
   - parent official report;
   - parent finance;
   - child switch dan contextual Help;
   - account panel Tab/Shift+Tab, Escape, focus trap, dan focus restoration;
   - horizontal overflow dan console/network.
5. Tetapkan exact-SHA freeze baru.
6. Buat ulang seluruh screenshot, 24 PDF, 4 deck, dan adoption package dari freeze baru.

Checkpoint B tetap HOLD sampai reviewer source dan affected staging browser matrix
memberikan sign-off. Appointment automation production tetap belum aktif dan merupakan
prasyarat go-live terpisah.
