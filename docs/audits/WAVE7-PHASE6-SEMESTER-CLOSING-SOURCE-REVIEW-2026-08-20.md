# Wave 7 Phase 6 Semester Closing - Independent Source Review

Tanggal: 2026-08-20
Branch: `feat/wave7-phase6-semester-closing-20260820`
Basis yang diperiksa: `origin/develop@1436e28`
Mode: independent review only; tidak ada perubahan source, Git, staging, atau production

## Verdict

**FOLLOW-UP REQUIRED IN WAVE 7 - NOT APPROVED FOR EXPLICIT GIT PACKAGING**

Implementasi membentuk fondasi yang kuat: migration additive, transaksi close serializable,
shared cutover lock, readiness fingerprint, immutable closure row, dan integrasi write barrier
lintas domain. Namun kontrak Wave 7 belum tertutup. Review menemukan enam P1 dan dua P2.
Sebagian celah dapat membuat sistem kehilangan periode aktif, menyembunyikan kewenangan Kepala
Sekolah yang sah, atau menutup semester berdasarkan readiness yang tidak lengkap.

## Findings

### P1-01 - Generic period mutation masih dapat melewati workflow close

`SchoolConfigService.updateAcademicYear()` hanya memanggil guard bila `isActive === true` dan
melewati guard saat ID target sama dengan tahun aktif. Request tersebut tetap menonaktifkan
semua semester sebelum mengaktifkan ulang tahun yang sama, sehingga sistem dapat berakhir
dengan satu tahun aktif tetapi tanpa semester aktif. PATCH `isActive: false` untuk tahun aktif
juga tidak diguard. Pola yang sama ada pada `updateSemester()`: hanya aktivasi `true` yang
digate; semester aktif masih dapat dinonaktifkan langsung dengan `false`.

Evidence:

- `apps/api/src/school-config/school-config.service.ts:187-206`
- `apps/api/src/school-config/school-config.service.ts:335-357`

Required fix:

- Tolak seluruh perubahan `isActive` melalui endpoint generic jika menyentuh periode aktif,
  termasuk `true -> true` dan `true -> false`.
- Sisakan hanya bootstrap awal yang eksplisit ketika belum ada active year/semester, serta
  workflow `SemesterClosingService.close()` dan cutover tahun ajaran yang sah.
- Tambahkan test API untuk deactivation langsung, re-assert active entity yang sama, dan
  kombinasi yang akan meninggalkan zero-active/mismatched period.

### P1-02 - UI memakai stable JWT role, bukan Appointment authority

Halaman Penutupan Semester menghitung `canReadFinalReport` dan kemampuan close dari
`session.roles`. Arsitektur DIIS telah menetapkan jabatan sebagai Appointment aktif, sedangkan
JWT hanya membawa stable base role. Kepala Sekolah/WAKA/KAPROG yang akun dasarnya GURU akan
dirender sebagai GURU biasa: close, Capaian, Riwayat, dan export hilang walaupun backend dapat
mengotorisasi appointment aktif. Test web memalsukan `KEPALA_SEKOLAH` sebagai JWT role sehingga
tidak menguji kondisi runtime sebenarnya.

Evidence:

- `apps/web/src/app/dashboard/penutupan-semester/page.tsx:12-27`
- `apps/web/src/app/dashboard/penutupan-semester/semester-closing-ui.ts:18-24`
- `apps/web/src/__tests__/semester-closing-ui.test.ts:40-74`

Required fix:

- Ambil effective appointment/permission dari backend pada server page, mengikuti projection
  yang sudah dipakai layout/sidebar.
- Turunkan capability dari permission + active position, bukan dari stable JWT role.
- Tambahkan matrix test untuk stable GURU + KS/WAKA/KAPROG appointment, ordinary GURU, SA,
  expired/future/suspended appointment, dan mode tinjau.

### P1-03 - Readiness dapat menghasilkan false-ready

Expected assignment saat ini hanya TeachingAssignment yang memiliki Schedule. Kontrak Wave 7
mewajibkan union dengan assignment yang sudah memiliki RPP, LMS, atau assessment pada periode
target. Selain itu, kelengkapan Rapor dibandingkan sebagai dua angka agregat: jumlah siswa aktif
versus jumlah ReportCard distributed. Query distributed tidak memfilter student aktif/non-deleted
atau membandingkan identity set, sehingga rapor milik siswa nonaktif dapat menutupi rapor siswa
aktif yang hilang. Readiness juga tidak membentuk blocker period overlap dan data
orphan/mismatch/duplicate yang diwajibkan prompt.

Evidence:

- `apps/api/src/semester-closing/semester-closing.service.ts:373-385`
- `apps/api/src/semester-closing/semester-closing.service.ts:533-554`
- `packages/database/prisma/migrations/20260820000001_wave7_semester_closing/migration.sql:59-87`

Required fix:

- Bentuk expected assignment sebagai deterministic union: scheduled + RPP + LMS + assessment.
- Bandingkan set student aktif dengan set student ReportCard distributed, bukan count agregat.
- Tambahkan blocker untuk overlap tanggal, parent mismatch, orphan, duplicate, dan cross-period
  inconsistency; buktikan dengan negative fixtures.

### P1-04 - Final academic report W7-02/W7-10 belum diimplementasikan

Snapshot hanya berisi scalar metrics, blocker, warning, dan aggregate A/B/C/D. Tab `Capaian`
hanya merender `MetricGrid` yang sama dengan readiness. Tidak ada grade/KKTP compliance per
subject, class/major heatmap, CP/TP/ATP mapping dari kontrak RPP aktif (`cp` string, `tp[]`,
`atp[].tpRef`), print-friendly detail, atau CSV final yang membawa struktur tersebut. Karena
data itu tidak masuk snapshot, historical report tidak dapat menjadi laporan final yang
diminta meski row closure immutable.

Evidence:

- `apps/api/src/semester-closing/semester-closing.service.ts:33-38`
- `apps/api/src/semester-closing/semester-closing.service.ts:576-632`
- `apps/web/src/app/dashboard/penutupan-semester/_components/SemesterClosingClient.tsx:332-340`

Required fix:

- Definisikan typed final-report snapshot per subject/class/major dengan aggregate PII-minimal.
- Gunakan `resolveKktpThreshold` per konteks dan parser CP/TP/ATP yang mengikuti body RPP aktif;
  jangan membuat proxy CP/TP.
- Detail, print view, dan CSV pasca-close wajib membaca snapshot yang sama.

### P1-05 - Write barrier dibuat fail-open dan belum diuji per mutation family

Delapan service menginjeksi `AcademicPeriodService` sebagai optional dan memanggil guard dengan
optional chaining. Jika wiring module terlepas atau test/provider keliru, seluruh barrier diam-diam
hilang. Ini bertentangan dengan kontrak fail-closed. Test Wave 7 yang ada hanya enam contract test;
tidak ada regression test yang menegakkan `ACADEMIC_PERIOD_CLOSED` pada Grade, Attendance,
Schedule, KKTP, RPP, LMS, Assessment, dan ReportCard.

Evidence:

- `apps/api/src/grade/grade.service.ts:80-84`
- `apps/api/src/attendance/attendance.service.ts:72-76`
- `apps/api/src/assessment/assessment.service.ts:143-148`
- Pola yang sama ada di Schedule, KKTP, RPP, LMS, dan ReportCard.

Required fix:

- Jadikan `AcademicPeriodService` dependency wajib di seluruh service mutasi terkait.
- Perbarui unit fixtures secara eksplisit, bukan mempertahankan optional guard untuk membuat test lama pass.
- Tambahkan positive historical-read dan negative closed-write tests untuk setiap family, serta
  proof close-vs-write concurrency pada PostgreSQL nyata.

### P1-06 - Evidence runtime belum memenuhi acceptance gate

DB proof eksekutor membuktikan migration/catalog dan dua insert closure paralel, bukan dua
panggilan `SemesterClosingService.close()` dengan seluruh readiness dan transition. Restore
rehearsal merestore database yang sudah memiliki migration Wave 7, bukan membuktikan pemulihan
ke schema pre-migration. Bukti stale hash, same-key/different-payload, close-vs-domain-write,
snapshot immutability setelah live data berubah, dan CSV-from-snapshot pada runtime PostgreSQL
belum tersedia. Browser authenticated 1440/390 dan positive close pada disposable exact SHA
juga belum dijalankan. Laporan eksekutor sendiri menilai E2E 78%, di bawah threshold 90%.

Required fix:

- Jalankan satu integrated disposable candidate stack dengan exact reviewed SHA.
- Gunakan API/service nyata untuk concurrency, stale/replay, blocker rollback, post-close writes,
  snapshot/CSV immutability, refresh/new-session transition, dan restore pre-migration rehearsal.
- Browser 1440/390 harus mencakup appointment authority matrix, keyboard/focus, duplicate click,
  loading/error/empty, print/export, dan tidak boleh melakukan positive close di shared staging DB.

### P2-01 - State dan destructive-action UX belum aman/jujur

`stale` praktis selalu `false` karena hash ref diperbarui sebelum readiness state. Refresh/close
tidak memiliki synchronous in-flight guard, sehingga rapid click sebelum React render dapat
mengirim request ganda. Close ditaruh inline tanpa confirmation dialog/focus semantics. Semua
message, termasuk error, memakai warna sukses. `closures` tidak pernah diperbarui setelah close,
sehingga riwayat baru tidak muncul sampai reload.

Evidence:

- `apps/web/src/app/dashboard/penutupan-semester/_components/SemesterClosingClient.tsx:135-188`
- `apps/web/src/app/dashboard/penutupan-semester/_components/SemesterClosingClient.tsx:250-253`
- `apps/web/src/app/dashboard/penutupan-semester/_components/SemesterClosingClient.tsx:303-324`

Required fix: gunakan request sequencing + synchronous gate, explicit stale lifecycle, modal
destruktif aksesibel, typed success/error state, dan refresh closure history setelah close.

### P2-02 - Response close/detail membawa internal metadata yang tidak diperlukan client

Response close memilih raw `idempotencyKey` dan full snapshot. Snapshot detail untuk pembaca
non-KAPROG membawa `actorUserId`, request fingerprint, dan idempotency hash. UI tidak memerlukan
field tersebut; actor name/time/hash publik sudah tersedia dari closure projection.

Evidence:

- `apps/api/src/semester-closing/semester-closing.service.ts:127-145`
- `apps/api/src/semester-closing/semester-closing.service.ts:182-211`
- `apps/api/src/semester-closing/semester-closing.service.ts:272-296`

Required fix: pisahkan internal persistence shape dari public DTO. Return closure ID, period,
closedAt, actor display, readiness version/hash, dan safe snapshot only; jangan expose raw key,
internal actor UUID, atau fingerprint.

## Independent Verification

Lulus pada reviewer run:

- API focused Wave 7: 1 suite / 6 tests.
- Web focused Wave 7: 1 suite / 4 tests.
- API type-check.
- Web type-check.
- Prisma validate.
- `git diff --check` dan `git diff --cached --check`.
- Staging-safe read-only preflight: tepat satu active year, tepat satu active semester,
  tidak ada parent mismatch, invalid date order, atau invalid semester number yang teramati.

Catatan: focused tests yang lulus mengonfirmasi kontrak yang telah ditulis, tetapi tidak
mendeteksi bypass dan runtime gaps di atas.

## Recommended Next Gate

1. Kembalikan delapan finding ini ke executor pada branch Wave 7 yang sama.
2. Re-review source setelah seluruh P1/P2 ditutup dan test negatif ditambah.
3. Setelah source re-review hijau, jalankan integrated PostgreSQL + disposable authenticated
   browser candidate pada exact SHA.
4. Hanya setelah kedua gate lulus, izinkan explicit Git packaging. Shared staging QA tetap
   non-destructive setelah deploy; production tetap hold.

## Confidence

- Finding confidence: **0.97**.
- Source readiness saat ini: **82%**.
- Validated E2E readiness saat ini: **72%**.
- Kelayakan explicit Git packaging: **belum**.
