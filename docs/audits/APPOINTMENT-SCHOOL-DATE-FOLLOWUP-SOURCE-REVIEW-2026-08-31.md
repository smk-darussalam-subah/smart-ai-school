# Appointment School-Date Follow-up Source Review

Tanggal: 2026-08-31

Peran: Independent Reviewer

Verdict: **APPROVED FOR EXPLICIT GIT PACKAGING**

## Findings

### P1 - Successor kedaluwarsa dapat diubah menjadi ACTIVE - CLOSED

Lokasi:

- `apps/api/src/appointments/appointments.service.ts:823-844`
- `packages/database/prisma/migrations/20260727000001_appointment_capacity_wave_c_architecture/migration.sql:43-88`

`activateDueSuccessorInTransaction()` hanya mensyaratkan successor berstatus `APPROVED`,
berjenis `DEFINITIVE`, dan `effectiveFrom <= schoolDate`. Berbeda dengan aktivasi scheduler
dan supersede manual, query ini tidak mensyaratkan `effectiveUntil IS NULL OR effectiveUntil >=
schoolDate`. Akibatnya, saat incumbent diakhiri, successor yang tanggal akhirnya sudah lewat
dapat diubah menjadi `ACTIVE`.

Dampak:

- lifecycle appointment menjadi tidak benar;
- trigger kapasitas menghitung status `ACTIVE` tanpa memeriksa tanggal efektif, sehingga record
  kedaluwarsa dapat menghalangi kandidat/pengganti yang sah;
- resolver permission mungkin menyembunyikan authority record tersebut karena memeriksa tanggal,
  tetapi hal itu tidak memperbaiki korupsi status dan occupancy database.

Required fix:

1. Terapkan boundary inklusif yang sama pada jalur successor otomatis:
   `effectiveFrom <= schoolDate` dan `effectiveUntil` null atau `>= schoolDate`.
2. Tentukan penanganan successor `APPROVED` yang sudah kedaluwarsa secara eksplisit dan
   fail-closed, misalnya dibatalkan dengan alasan terstruktur atau menghasilkan konflik yang
   actionable; jangan mengubahnya menjadi `ACTIVE`.
3. Tambahkan regresi yang membuktikan successor dengan `effectiveUntil` kemarin tidak pernah
   diaktifkan, sedangkan `effectiveUntil` hari ini tetap dapat diaktifkan.
4. Buktikan record kedaluwarsa tidak mengonsumsi kapasitas atau memblokir successor berikutnya.

Closure re-review:

- successor `APPROVED` definitif dengan `effectiveUntil < schoolDate` dibatalkan di dalam
  transaksi sebelum kandidat sah dicari;
- status `CANCELLED` melepaskan open-replacement/capacity slot dan record tersebut tidak pernah
  diubah menjadi `ACTIVE`;
- query kandidat sah sekarang menerapkan boundary inklusif `effectiveUntil >= schoolDate`;
- regresi membuktikan tanggal akhir kemarin dibatalkan dan tanggal akhir hari ini tetap aktif.

### P2 - Tanggal operasi diambil sebelum advisory lock - CLOSED

Lokasi:

- `apps/api/src/appointments/appointments.service.ts:797-806`
- `apps/api/src/school-config/school-config.service.ts:143-176`
- `apps/api/src/school-config/school-config.service.ts:198-240`

Scheduler dan annual cutover menangkap `now` sebelum transaksi memperoleh shared advisory lock.
Jika request menunggu lock melewati tengah malam Jakarta, active-year read dan seluruh mutasi
terjadi setelah tengah malam tetapi memakai `schoolDate` hari sebelumnya. Lock ordering memang
benar, namun titik waktu operasi belum linear terhadap lock yang melindungi perubahan tersebut.

Dampak:

- appointment yang jatuh tempo pada hari baru dapat terlambat aktif;
- cutover dapat mengaktifkan tahun ajaran baru tetapi tidak mengaktifkan appointment yang mulai
  berlaku pada tanggal sekolah saat transaksi benar-benar berjalan;
- bukti boundary 00:15 saat ini hanya mencakup eksekusi tanpa lock wait, bukan rollover selama
  antrean lock.

Required fix:

1. Ambil satu authoritative `now` segera setelah advisory lock berhasil diperoleh, sebelum
   membaca tahun aktif dan sebelum mutasi.
2. Teruskan instant tersebut ke seluruh helper dalam transaksi agar satu operasi tetap konsisten.
3. Tambahkan fake-timer/deferred-lock regression: request dimulai sebelum 00:00 WIB, lock baru
   selesai setelah 00:00 WIB, dan query aktivasi harus memakai tanggal sekolah yang baru.
4. Terapkan proof yang sama pada scheduler serta jalur create/update academic-year activation.

Closure re-review:

- scheduler mengambil satu `now` segera setelah activation lock selesai dan sebelum active-year
  read;
- create/update academic year mengambil satu `activationNow` segera setelah lock, lalu meneruskan
  instant yang sama ke cutover;
- tiga deferred-lock regression membuktikan request yang dimulai sebelum tengah malam dan
  memperoleh lock sesudah tengah malam memakai tanggal sekolah yang baru.

## Verifikasi Reviewer

- Focused API awal: 7 suite / 152 test lulus.
- Focused API re-review: 7 suite / 157 test lulus.
- API type-check: lulus.
- `git diff --check`: lulus.
- Staged file sebelum laporan reviewer: 0.
- Manifest Executor sesuai 14 file yang dilaporkan.
- Tidak ada schema, migration, dependency, web, infra, Keycloak, systemd, token, staging,
  atau production mutation pada patch Executor.

Perintah focused yang dijalankan reviewer:

```text
npm.cmd test -- --runInBand \
  src/__tests__/school-date.helper.spec.ts \
  src/__tests__/appointment-scope.helper.spec.ts \
  src/__tests__/appointments.spec.ts \
  src/__tests__/permissions.spec.ts \
  src/__tests__/positions.spec.ts \
  src/__tests__/school-config.spec.ts \
  src/__tests__/roles.spec.ts
```

## Assessment

Shared `getSchoolDate()` dan penyelarasan consumer utamanya sudah tepat. Cache permission memiliki
rollover guard per tanggal sekolah, response automation tetap empat count aman, lifecycle
successor sudah fail-closed, dan titik waktu scheduler/cutover sudah linear terhadap advisory
lock. Tidak ditemukan P0/P1/P2 tersisa pada scope source follow-up ini.

Patch boleh masuk explicit Git packaging dengan manifest literal yang telah direview. Approval
ini bukan staging sign-off dan bukan izin promosi `main`, Gate 1 production, pemasangan
credential/unit, manual rehearsal, atau aktivasi timer; seluruh gate runtime/production tersebut
tetap **HOLD** dan memerlukan approval terpisah yang terikat exact SHA.

Confidence:

- Source correctness: 0.99
- Security/authority: 0.96
- Lifecycle/data integrity: 0.98
- Runtime readiness: 0.84 (staging one-shot dan production activation belum dijalankan)
