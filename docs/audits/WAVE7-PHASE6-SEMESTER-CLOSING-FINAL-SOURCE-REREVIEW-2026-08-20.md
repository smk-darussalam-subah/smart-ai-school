# Wave 7 Phase 6 Semester Closing - Final Source Re-review

Tanggal: 2026-08-20

Branch: `feat/wave7-phase6-semester-closing-20260820`

Peran: independent reviewer, review-only

## Verdict

**FOLLOW-UP REQUIRED IN WAVE 7 - NOT YET APPROVED FOR EXPLICIT GIT PACKAGING**

Tujuh finding pada re-review sebelumnya telah ditutup secara source dan test. Integritas
penutupan semester sekarang kuat: statistik final membaca snapshot Rapor distributed,
mapping CP/TP/ATP tervalidasi, scope KAPROG fail-closed, orphan dan overlap menjadi blocker,
mode tinjau menyembunyikan authority appointment asli, serta dialog/stale lifecycle telah
diperbaiki.

Masih ada satu P1 operasional dan satu P2 acceptance. Backend memiliki endpoint detail
snapshot historis, tetapi UI tidak pernah memanggilnya. Setelah semester ditutup, tab
`Capaian` berpindah ke preview live periode aktif berikutnya dan `Riwayat` hanya menyediakan
CSV. Laporan final historis tidak dapat dibuka atau dicetak dari aplikasi.

## Findings

### P1-F01 - Laporan final historis dan print view belum operasional

Kontrak Wave 7 mewajibkan report dan export pasca-close membaca
`SemesterClosure.snapshot`, menyediakan print-friendly browser view, dan menampilkan success
state yang menghubungkan operator ke closure/history/export.

Kondisi saat ini:

- backend sudah menyediakan `GET /semester-closing/closures/:id` dan memfilter snapshot
  sesuai authority;
- web belum memiliki action untuk mengambil detail closure;
- tab `Capaian` selalu merender `readiness.finalReport`, yaitu preview periode aktif saat ini;
- setelah close, client membuang payload detail hasil close dan hanya menampilkan pesan umum;
- tabel `Riwayat` hanya mempunyai tombol CSV;
- tidak ada historical detail view, print route, print stylesheet, atau print command.

Evidence:

- `apps/api/src/semester-closing/semester-closing.controller.ts:48`
- `apps/api/src/semester-closing/semester-closing.service.ts:381`
- `apps/web/src/app/dashboard/penutupan-semester/actions.ts:74`
- `apps/web/src/app/dashboard/penutupan-semester/actions.ts:85`
- `apps/web/src/app/dashboard/penutupan-semester/_components/SemesterClosingClient.tsx:308`
- `apps/web/src/app/dashboard/penutupan-semester/_components/SemesterClosingClient.tsx:478`
- `apps/web/src/app/dashboard/penutupan-semester/_components/SemesterClosingClient.tsx:490`
- Prompt Wave 7 bagian I, lines 426-429, dan bagian J, lines 445-446.

Impact:

- KS/WAKA/KAPROG tidak dapat memeriksa kembali laporan resmi semester lama di aplikasi;
- tab `Capaian` setelah cutover dapat disalahpahami sebagai laporan semester yang baru saja
  ditutup, padahal datanya sudah berasal dari periode baru;
- print acceptance tidak dapat diuji karena surface-nya belum ada;
- snapshot immutable ada di backend, tetapi workflow audit manusia belum selesai end-to-end.

Required closure:

1. Tambahkan typed web action untuk membaca closure detail.
2. Tambahkan aksi `Lihat laporan` pada setiap riwayat dan render snapshot historis yang dipilih,
   bukan readiness live.
3. Tampilkan identitas periode, waktu/aktor close, hash publik, dan final report snapshot.
4. Sediakan print-friendly browser view menggunakan CSS print dan command print yang nyata;
   jangan membuat PDF/download palsu.
5. Pertahankan server-side scope: SA/KS/WAKA school-wide, KAPROG major-only, role lain denied.
6. Setelah close sukses, pertahankan payload closure untuk menampilkan timestamp, actor,
   periode berikutnya, aksi lihat riwayat, dan export.
7. Tambahkan behavioral test yang membuktikan laporan historis tetap memakai snapshot lama
   setelah readiness berpindah ke semester berikutnya.

### P2-F02 - Nama CSV belum period-bound

`closureCsvFilename()` menghasilkan
`laporan-penutupan-semester-{delapan-karakter-id}.csv`. Nama ini memang tidak memuat PII,
tetapi tidak memenuhi kontrak nama file berbasis periode dan kurang berguna bagi operator
ketika menyimpan laporan beberapa semester.

Evidence:

- `apps/web/src/app/dashboard/penutupan-semester/semester-closing-ui.ts:47`
- `apps/web/src/__tests__/semester-closing-ui.test.ts:116`
- Prompt Wave 7 bagian I, line 429.

Required closure:

- gunakan academic-year code dan nomor semester yang sudah tersedia pada closure summary,
  misalnya `laporan-penutupan-semester-2026-2027-semester-1.csv`;
- sanitasi segmen nama file dan pertahankan formula/PII safety pada isi export;
- ubah test agar memverifikasi period-bound filename, bukan hanya PII-free filename.

## Closure of Previous Findings

| Finding sebelumnya | Status final |
|---|---|
| Statistik memakai live Grade | Closed |
| CP/TP/ATP hanya berupa count | Closed |
| TU + KAPROG dapat melihat school snapshot | Closed |
| Orphan/null/missing/out-of-scope dan cross-year overlap lolos | Closed |
| PostgreSQL matrix tidak lengkap | Closed berdasarkan evidence disposable eksekutor |
| View-as memperlihatkan Appointment asli | Closed source/test |
| Stale timeout dan dialog focus tidak lengkap | Closed source; browser proof tetap staging gate |

## Independent Verification

Reviewer menjalankan:

- API focused Semester Closing: **1 suite / 11 tests pass**;
- web focused Semester Closing: **1 suite / 6 tests pass**;
- API type-check: **pass**;
- web type-check: **pass**;
- `git diff --check`: **pass**;
- `git diff --cached --check`: **pass**;
- staged changes: **none**.

Reviewer juga memeriksa source final-report, curriculum mapping, KAPROG filtering,
view-as authority, stale timer/Radix dialog, CSV projection, dan laporan matrix PostgreSQL.
Disposable PostgreSQL tidak dibuat ulang pada sesi final ini; matrix nyata 44 migrations,
concurrency, rollback, immutability, dan CSV snapshot diterima dari evidence eksekutor yang
tercatat dalam remediation report.

Full regression yang dilaporkan eksekutor:

- API: 62 suites / 1262 tests pass;
- web: 35 suites / 218 tests pass;
- API/web lint dan build pass;
- Prisma validate pass.

## Browser QA Boundary

Browser QA authenticated 1440/390 tetap staging-only setelah exact reviewed SHA dipaketkan dan
dideploy. Source review tidak mengklaim focus trap, print preview, responsive historical report,
atau role matrix browser sebagai pass.

Setelah P1-F01 dan P2-F02 ditutup dan source re-review hijau, staging QA minimal harus mencakup:

- KS menutup semester pada fixture disposable/terkontrol, bukan shared data nyata;
- success handoff menuju laporan historis;
- open/print/export snapshot yang sama;
- perubahan live data tidak mengubah historical detail maupun CSV;
- WAKA school-wide dan KAPROG major-only;
- GURU/TU biasa denied;
- desktop 1440px, mobile 390px, keyboard, focus restore, loading/error/stale, dan rapid click.

## Recommended Next Gate

1. Kembalikan dua finding ini ke executor pada branch Wave 7 yang sama.
2. Terapkan narrow UI/action/test follow-up tanpa schema atau migration baru.
3. Jalankan focused web/API tests, full regression yang terdampak, type-check, lint, build,
   Prisma validate, dan diff checks.
4. Kirim untuk one-pass final source re-review.
5. Jika hijau, lakukan explicit Git packaging. Jangan gunakan `git add .` atau `git add -A`.
6. Deploy reviewed SHA ke staging dan jalankan browser matrix sesuai protokol fixture tersimpan.

## Confidence

**0.97** untuk verdict dan dua finding tersisa.

Kesiapan source/database saat ini diperkirakan **94%**. Integritas inti close sudah layak,
tetapi workflow laporan resmi pasca-close belum dapat dianggap selesai sampai detail historis
dan print view benar-benar dapat digunakan.
