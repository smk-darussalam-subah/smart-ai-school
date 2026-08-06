# Wave 3 AI Output Quality Closure - Staging QA Remediation

Tanggal: 2026-08-03

## Scope

- Continuation QA Wave 3 dan AI-0A pada staging setelah source quality closure.
- Perbaikan sempit untuk freshness progres LMS siswa yang ditemukan selama QA.
- Tidak ada perubahan pada API, schema, migration, dependency, Keycloak,
  systemd, scheduler, staging database langsung, production, atau `main`.

Staging yang diuji sebelum follow-up ini berada pada SHA
`b85bebbd9917dc9b013785f4af5b16d1e9b579a5`. Semua interaksi menggunakan data
dan akun fixture staging yang sintetis serta PII-safe. Tidak ada kredensial,
identifier akun, atau prompt mentah yang dicantumkan di laporan ini.

## Status

**FOLLOW-UP IMPLEMENTED - AWAITING SOURCE RE-REVIEW.**

QA independen tetap dilanjutkan setelah temuan ini karena server sudah menyimpan
progres dengan benar dan temuan tidak membahayakan otorisasi, data integrity,
privacy, atau containment production. Namun deployment Wave 3 berikutnya harus
memasukkan perbaikan ini, lalu menjalankan ulang skenario progres siswa secara
targeted sebelum final staging sign-off.

## Finding P2 - Progres Siswa Tidak Segar Setelah Sukses Server

### Reproduksi

1. Siswa fixture membuka Modul pada dashboard akademik.
2. Siswa menekan `Tandai Selesai` pada modul LMS yang terbit dan sesuai kelas.
3. Endpoint progres berhasil dan UI menampilkan toast sukses.
4. Bukti server/database menunjukkan status `completed`, progres `100`, dan
   completion timestamp telah tersimpan.
5. Kartu Modul yang sedang terbuka tetap menampilkan progres lama sampai halaman
   dimuat ulang.

### Dampak

Data server tidak hilang atau salah, tetapi UI memberi informasi yang tertinggal
tepat setelah aksi sukses. Siswa dapat mengira penyelesaian modul gagal atau
menekan aksi lagi tanpa perlu.

### Akar Masalah

`ModulSiswa` hanya memanggil `updateLmsProgress` lalu menampilkan toast. Data
modul yang dirender berasal dari payload server awal pada `SiswaWorkspace`, tanpa
refresh atau state lokal setelah respons sukses.

## Perbaikan

Perbaikan diletakkan pada state workspace agar Beranda dan Modul melihat data
yang sama:

- `ModulSiswa` meneruskan UUID modul hanya setelah `updateLmsProgress` berhasil.
- `SiswaWorkspace` menyimpan set UUID yang sudah dikonfirmasi selesai pada sesi
  tampilan saat ini.
- Helper `withCompletedModuleProgress` membentuk data tampil turunan: hanya UUID
  yang memang ada pada payload server saat ini menjadi `Selesai` dengan progres
  `100`.
- Baris lain dan data asal tidak dimutasi.
- Kegagalan API tetap menampilkan pesan gagal dan tidak mengubah state lokal.

Perbaikan tidak membuat request tambahan, tidak mengoptimistis sebelum respons
server, dan tidak mengubah kontrak API. Refresh berikutnya tetap memakai data
authoritative dari server.

## QA Wave 3 Yang Sudah Dilanjutkan

### AI-0A dan kualitas output

| Skenario | Hasil |
| --- | --- |
| Tiga sampel Kegiatan non-PII | PASS - struktur pertemuan pertama lengkap, tanpa code fence atau istilah KI/KD lama |
| Tiga sampel Asesmen non-PII | PASS - diagnostik, formatif, dan sumatif terpisah dengan konteks CP/TP tersimpan |
| Simpan, tutup, buka kembali draft | PASS - hasil AI dan field manual bertahan |
| CP authoritative dan TP/ATP tersimpan | PASS |
| Draft tanpa fondasi TP | PASS - CTA jujur, tidak membuat RPP atau generation request |
| Legacy AI controls | PASS - tidak terlihat pada UI interaktif |

Panggilan AI non-PII pada staging menghasilkan output aktual melalui provider
OpenAI `gpt-4.1-mini`. Durasi interaktif Kegiatan dan Asesmen berada pada kisaran
belasan hingga puluhan detik pada sampel QA; ini bukan bukti capacity/load untuk
penggunaan massal.

### Review, LMS, dan kontrol akses

| Skenario | Hasil |
| --- | --- |
| GURU owner membuat, menyimpan, dan submit RPP | PASS |
| WAKA aktif mereview dan menyetujui RPP | PASS |
| KS aktif dengan stable GURU identity membuka reviewer surface | PASS |
| Publish, unpublish, lalu publish ulang LMS | PASS - status baris berubah langsung |
| Siswa fixture melihat LMS kelas dan menyelesaikan modul | PASS pada server; freshness UI menjadi finding ini |
| GURU non-owner, TU, ORANG_TUA, dan INDUSTRI ke `/dashboard/rpp` | PASS - tidak mendapatkan reviewer board atau data RPP terlindungi |

### Responsive dan console

- Desktop `1440x900`: tidak ada horizontal overflow pada dashboard/wizard yang
  diuji.
- Mobile `390x844`: dialog wizard dapat dibuka/ditutup berulang dan Escape
  menutup dialog; tidak ada horizontal overflow.
- Error React `#310` yang sebelumnya tercatat pada satu tab role-switch cepat
  tidak dapat direproduksi pada sesi browser baru dengan login normal untuk role
  negatif dan route terproteksi. Tidak ada perubahan source spekulatif untuk
  error yang belum reproducible ini.
- Preflight ulang menunjukkan container staging web/API berjalan dan health publik
  `200`; tidak ada baris API `5xx` pada jendela pemeriksaan. Satu
  `OAuthCallback` pada web muncul ketika browser berpindah akun cepat. Karena
  sesi autentikasi tersebut tidak stabil untuk otomasi, direct-route siswa akan
  diulang dengan sesi bersih setelah deploy follow-up, bukan diklaim PASS dari
  percobaan yang gagal.

## Verifikasi Source Follow-up

Dilaksanakan pada branch
`fix/wave3-lms-progress-freshness-20260803` tanpa staged file:

| Check | Hasil |
| --- | --- |
| `npm.cmd --workspace @smk/web test -- --runInBand` | PASS - 23 suite, 135 test |
| `npm.cmd --workspace @smk/web run type-check` | PASS |
| `npm.cmd --workspace @smk/web run lint` | PASS; hanya warning deprecation/plugin Next yang sudah ada |
| `npm.cmd --workspace @smk/web run build` | PASS - 39/39 halaman |
| `git diff --check` | PASS |

Build lokal memakai junction dependency sementara karena worktree follow-up tidak
memiliki instalasi dependency sendiri. Next menyelesaikan build dengan exit 0 dan
39/39 halaman, tetapi mengeluarkan warning EPERM saat menyalin standalone trace
melalui junction. Junction tersebut sudah dilepas; warning itu bukan kegagalan
source dan CI normal tetap wajib menjadi bukti packaging berikutnya.

## File Scope Untuk Reviewer

- `apps/web/src/app/dashboard/akademik/_components/siswa/ModulSiswa.tsx`
- `apps/web/src/app/dashboard/akademik/_components/siswa/SiswaWorkspace.tsx`
- `apps/web/src/app/dashboard/akademik/_components/siswa/siswa-modul-progress.ts`
- `apps/web/src/__tests__/siswa-modul-progress.test.ts`
- `docs/audits/WAVE3-AI-OUTPUT-QUALITY-CLOSURE-STAGING-QA-REMEDIATION-2026-08-03.md`

## Targeted Re-QA Setelah Deploy Follow-up

1. Sebagai siswa fixture, tekan `Tandai Selesai` sekali dan pastikan kartu Modul
   serta Beranda segera menampilkan `Selesai` dan progres `100` tanpa reload.
2. Pastikan satu request progres menghasilkan satu completion dan refresh tetap
   menunjukkan data authoritative yang sama.
3. Ulangi mobile `390x844` untuk aksi tersebut.
4. Jalankan satu aksi archive LMS pada fixture disposable untuk melengkapi matrix
   publish/unpublish/archive tanpa memengaruhi data non-QA.
5. Ulangi route negatif siswa ke `/dashboard/rpp`, lalu capture console baru untuk
   memastikan tidak ada error atau disclosure yang tidak dijelaskan.

## Rekomendasi Gate

Jangan package atau push dulu. Minta re-review source atas lima file manifest di
atas. Jika reviewer menyetujui, lakukan explicit Git packaging dan Gitflow normal
ke `develop`, lalu promosi ke `staging`. Final staging review tetap menunggu
targeted re-QA dan evidence deployment baru.
