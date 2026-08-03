# Wave 3 LMS Progress Freshness - Follow-up Remediation

Tanggal: 2026-08-03

## Status

**READY FOR SOURCE RE-REVIEW.**

Follow-up ini menutup dua P2 dari
`WAVE3-LMS-PROGRESS-FRESHNESS-SOURCE-REREVIEW-2026-08-03.md` pada branch Wave 3
yang sama. Ini belum merupakan persetujuan Git packaging, deployment, atau
staging sign-off.

## P2-1 - Status Selesai/100% Kini Terlihat Jelas

### Perbaikan

- `ModuleCard` selalu merender progress bar dan angka untuk modul yang tidak
  terkunci. Modul berstatus `Selesai` menampilkan progress `100%` dan label
  status eksplisit `Selesai`.
- `SiswaWorkspace` menyimpan urutan completion yang sudah dikonfirmasi server,
  lalu menyediakan modul completion terbaru ke Beranda.
- `BerandaSiswa` menampilkan konfirmasi ringkas berstatus `Selesai` dan `100%`
  untuk modul terbaru, sambil tetap memakai modul `Aktif` berikutnya untuk
  permukaan `Lanjutkan Belajar`.

Konfirmasi hanya muncul setelah action progres sukses. Tidak ada optimistic
success, request tambahan, atau perubahan API/data server.

## P2-2 - Nested Button Dihapus

### Perbaikan

- Kartu Modul kini merupakan elemen `article`.
- Kontrol membuka detail modul dan tombol `Tandai Selesai` adalah dua button
  sibling, bukan button bersarang.
- Tombol buka modul memiliki label aksesibel dan tombol selesai memakai
  `type="button"` yang eksplisit.
- `stopPropagation()` tidak lagi dipakai sebagai kompensasi struktur HTML yang
  invalid.

Dengan struktur ini klik `Tandai Selesai` hanya menjalankan completion action;
ia tidak dapat membubble ke kontrol buka modul karena kedua kontrol berada pada
elemen sibling.

## Test Tambahan

`siswa-modul-progress.test.ts` sekarang mencakup rendering dan behavior:

1. Modul selesai merender `Selesai` dan `100%` pada daftar Modul.
2. Konfirmasi completion pada Beranda merender `Selesai` dan `100%`.
3. Hasil render memiliki dua button sibling tanpa nested button.
4. Invokasi button `Tandai Selesai` hanya memanggil completion callback, tidak
   membuka detail modul.

Test menggunakan renderer React server yang sudah tersedia. Tidak ada dependency
test baru. Import React eksplisit pada dua komponen dipertahankan agar transform
JSX klasik `ts-jest` dapat merender komponen yang sama seperti production build.

## Verifikasi Executor

| Check | Hasil |
| --- | --- |
| Focused progress UI test | PASS - 1 suite / 5 test |
| Web test penuh | PASS - 23 suite / 137 test |
| `npm.cmd --workspace @smk/web run type-check` | PASS |
| `npm.cmd --workspace @smk/web run lint` | PASS; hanya warning Next lint existing |
| `npm.cmd --workspace @smk/web run build` | PASS - 39/39 halaman |
| `git diff --check` dan cached check | PASS |

Build lokal memakai junction dependency sementara untuk worktree follow-up. Next
berakhir dengan exit 0 dan membangun 39/39 halaman, tetapi mengeluarkan warning
EPERM saat menyalin standalone trace melalui junction. Junction dan cache
sementara sudah dihapus; dependency checkout utama tetap utuh. CI normal masih
wajib menjadi bukti packaging berikutnya.

## Scope Source

- `apps/web/src/app/dashboard/akademik/_components/siswa/BerandaSiswa.tsx`
- `apps/web/src/app/dashboard/akademik/_components/siswa/ModulSiswa.tsx`
- `apps/web/src/app/dashboard/akademik/_components/siswa/SiswaWorkspace.tsx`
- `apps/web/src/app/dashboard/akademik/_components/siswa/siswa-modul-progress.ts`
- `apps/web/src/__tests__/siswa-modul-progress.test.ts`

Tidak ada perubahan pada API, schema, migration, dependency manifest, Keycloak,
scheduler, infrastructure, staging database secara langsung, production, atau
`main`.

## Residual Staging Gate

React error `#310` tetap browser/staging gate. Follow-up ini tidak mengklaim
menutupnya, karena helper/render test tidak dapat membuktikan urutan Hooks pada
navigasi dan role-switch runtime.

Setelah source reviewer menyetujui, staging re-QA harus mencakup:

1. Completion sukses dan gagal tanpa reload pada daftar Modul dan Beranda.
2. Mobile `390x844` dan desktop untuk kartu action sibling serta fokus keyboard.
3. Archive LMS fixture disposable.
4. Direct-route siswa ke `/dashboard/rpp` dengan sesi autentikasi bersih.
5. Console/network bersih, termasuk matrix reproduksi React `#310`.

## Rekomendasi Gate

Kirim laporan ini bersama laporan re-review sebelumnya kepada reviewer source.
Tahan explicit Git packaging sampai reviewer memberikan verdict baru. Setelah
source sign-off, gunakan explicit manifest; jangan gunakan `git add .` atau
`git add -A`.
