# Wave 3 LMS Progress Freshness - Source Re-review

Tanggal: 2026-08-03

## Verdict

**FOLLOW-UP REQUIRED IN WAVE 3**

Tidak ditemukan P0/P1. Perbaikan sudah menutup akar masalah state freshness pada
lapisan data tampilan: callback hanya berjalan setelah server sukses, data asal
tidak dimutasi, dan Beranda serta Modul menerima derived payload yang sama.

Namun dua P2 di bawah masih harus ditutup pada branch yang sama sebelum explicit
Git packaging. Source approval, deployment, dan staging sign-off tetap merupakan
gate terpisah.

## Findings

### P2-1 - Acceptance `Selesai/100%` belum sesuai render aktual

**Evidence**

- `SiswaWorkspace.tsx:198-211` mengubah modul yang dikonfirmasi menjadi
  `status: Selesai` dan `prog: 100`, lalu mengirim derived payload ke Beranda dan
  Modul.
- `BerandaSiswa.tsx:45` hanya memilih modul dengan status `Aktif`. Setelah modul
  selesai, kartu itu hilang dari Beranda atau Beranda berpindah ke modul aktif
  berikutnya; modul yang baru selesai tidak ditampilkan sebagai `Selesai/100%`.
- `ModulSiswa.tsx:108-122` menampilkan ikon selesai, tetapi progress bar dan angka
  persen hanya dirender untuk status `Aktif`. Kartu selesai tidak menyatakan
  `Selesai` atau `100%` secara eksplisit.
- Test baru `siswa-modul-progress.test.ts` hanya membuktikan transformasi helper,
  bukan output UI yang menjadi acceptance target.

**Impact**

State sudah segar secara internal, tetapi bukti visual yang dijanjikan laporan
belum tercapai. Re-QA dengan ekspektasi `Selesai/100%` akan gagal atau menghasilkan
interpretasi yang ambigu.

**Required follow-up**

1. Pada daftar Modul, tampilkan status eksplisit `Selesai` dan `100%` untuk kartu
   yang baru berhasil diselesaikan.
2. Tetapkan perilaku Beranda secara jujur dan konsisten:
   - rekomendasi: tampilkan konfirmasi ringkas `Baru selesai` untuk modul tersebut,
     lalu tetap tawarkan modul aktif berikutnya sebagai `Lanjutkan Belajar`; atau
   - bila Beranda memang harus langsung berpindah ke modul berikutnya, ubah
     acceptance/report agar tidak mengklaim kartu lama tetap terlihat sebagai
     `Selesai/100%`, dan tampilkan indikator jumlah modul selesai yang ikut segar.
3. Tambahkan component/behavior test yang mengunci output visual setelah respons
   sukses dan memastikan respons gagal tidak menandai modul selesai.

### P2-2 - Tombol `Tandai Selesai` berada di dalam tombol kartu

**Evidence**

- `ModulSiswa.tsx:74-88` merender seluruh kartu sebagai `<button>`.
- `ModulSiswa.tsx:125-145` merender tombol `Tandai Selesai` sebagai `<button>`
  di dalam kartu tersebut.
- HTML Standard melarang interactive content sebagai descendant elemen button:
  https://html.spec.whatwg.org/multipage/form-elements.html#the-button-element

**Impact**

Struktur HTML tidak valid dan berisiko menghasilkan perilaku klik, fokus,
aksesibilitas, atau hydration yang berbeda antarbrowser. `stopPropagation()`
tidak memperbaiki struktur semantik.

**Required follow-up**

Ubah kartu menjadi `article`/`div` dengan dua kontrol sibling yang jelas: kontrol
buka modul dan tombol selesai. Jangan menaruh button/link interaktif di dalam
button lain. Tambahkan behavior test bahwa klik `Tandai Selesai` tidak membuka
detail modul dan tidak ada nested button pada hasil render.

## Review Positif

- Tidak ada optimistic success sebelum respons server berhasil.
- UUID yang tidak ada pada payload server diabaikan.
- Baris yang tidak terkait mempertahankan referensi dan data asal tidak dimutasi.
- API, schema, migration, dependency, auth, dan data staging tidak diubah.
- Perubahan tetap terbatas pada lima file manifest yang dilaporkan.

## Independent Verification

Reviewer menjalankan ulang dari worktree branch
`fix/wave3-lms-progress-freshness-20260803`:

| Check | Hasil |
| --- | --- |
| Web test | PASS - 23 suite / 135 test |
| Web type-check | PASS |
| Web lint | PASS; warning Next lint existing |
| Web production build | PASS - 39/39 halaman |
| `git diff --check` | PASS |
| `git diff --cached --check` | PASS; tidak ada staged change |

Build menggunakan junction dependency sementara dan menghasilkan warning EPERM
trace-copy yang sesuai laporan executor. Junction dan cache sementara telah
dihapus kembali; dependency checkout utama tetap utuh.

## Residual Runtime Gate

- OAuthCallback saat rapid role switching belum menunjukkan defect source ini.
  Ulangi direct-route siswa dengan sesi bersih setelah deploy.
- React error `#310` berarti jumlah Hooks yang dirender berubah antar-render
  (https://react.dev/errors/310). Temuan itu tidak boleh dianggap tertutup hanya
  oleh unit test, tetapi juga tidak boleh disamakan tanpa bukti dengan OAuthCallback
  atau nested button.
- Setelah follow-up source lulus, staging re-QA wajib mencakup: sukses dan gagal
  update progres, Beranda dan Modul tanpa reload, mobile, archive LMS, route
  negatif siswa, serta console/network bersih.

## Gate Recommendation

Kembalikan langsung ke executor pada branch yang sama. Prompt Architect baru tidak
diperlukan karena kedua finding berada dalam acceptance Wave 3 yang sedang aktif.
Setelah P2-1 dan P2-2 ditutup dan diverifikasi, lakukan re-review source sebelum
explicit packaging, PR, promotion staging, dan browser sign-off.

## Confidence

- Kebenaran temuan source: **0.97**
- Verdict gate: **0.96**
- Readiness untuk explicit Git packaging saat ini: **0.35**
