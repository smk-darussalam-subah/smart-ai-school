# Independent Source Re-review - Appointment Expiry Lifecycle Follow-up

Tanggal: 2026-09-01

Verdict: **APPROVED FOR EXPLICIT GIT PACKAGING**

## Ringkasan

Rekonsiliasi expiry yang baru memperbaiki defect utama pada run scheduler tunggal:
Appointment operasional kedaluwarsa diakhiri, seluruh state praaktif `DRAFT`,
`PENDING_APPROVAL`, dan `APPROVED` kedaluwarsa dibatalkan, PLT yang terhubung ke definitive
yang berakhir ditutup, boundary hari ini tetap inklusif, dan kapasitas dapat digunakan kembali.

Focused matrix `7 suite / 156 test`, full API `70 suite / 1.340 test`, API type-check, lint,
dan build telah diulang secara independen dan lulus. Keempat finding P1 telah ditutup.
Laporan production juga tetap memakai status HOLD yang akurat.

## Findings

### P1-R01 - CLOSED - Lifecycle manual dapat menghidupkan kembali row yang sudah diakhiri scheduler

**Evidence**

- Scheduler membaca snapshot lalu memakai `updateMany` dengan CAS status di
  `apps/api/src/appointments/appointments.service.ts:814-932`.
- `submit`, `cancel`, `suspend`, dan `resume` membaca status sebelum write, lalu memakai
  `updateStatus()` yang melakukan `appointment.update({ where: { id } })` tanpa expected
  status pada `appointments.service.ts:467-478`, `541-573`, `577-589`, dan `1889-1905`.
- `approve`, `reject`, `end`, dan `supersede` juga memvalidasi state di luar transaksi
  write dan tidak mengambil advisory lock scheduler.
- PostgreSQL proof hanya merace dua instance scheduler. Tidak ada race scheduler melawan
  `resume`, `suspend`, `approve`, `end`, atau `supersede`.

**Reproduction**

1. `resume()` membaca definitive `SUSPENDED` yang sudah kedaluwarsa.
2. Scheduler memperoleh lock dan mengubah row tersebut menjadi `ENDED`.
3. `resume()` melanjutkan unconditional update berdasarkan pembacaan lama.
4. Row terminal berubah kembali menjadi `ACTIVE`.

Pola setara dapat terjadi pada `suspend`. Pada `approve`, kandidat kedaluwarsa yang berubah
dari `PENDING_APPROVAL` setelah snapshot scheduler dapat tertinggal `APPROVED` sampai run
berikutnya.

**Impact**

Status terminal dapat dibangkitkan kembali, capacity kembali terisi, dan authority dapat
muncul lagi setelah scheduler menyatakan lifecycle berakhir. Advisory lock antarscheduler
tidak mencegah race dengan mutasi operator.

**Required fix**

- Serialisasikan seluruh mutasi status Appointment terhadap lock yang sama, atau gunakan
  CAS expected-status yang lengkap dan re-read di dalam transaksi.
- Ambil `now`/`schoolDate` setelah lock.
- Tolak approval/resume/suspend yang sudah melewati `effectiveUntil`.
- Jika CAS kehilangan race, kembalikan 409 tanpa audit sukses atau invalidasi yang keliru.
- Tambahkan PostgreSQL race proof scheduler-vs-resume dan scheduler-vs-approve, termasuk
  final state, count, cache invalidation, dan retry.

### P1-R02 - CLOSED - PLT dapat tetap ACTIVE setelah definitive diakhiri melalui jalur manual

**Evidence**

Rekonsiliasi baru hanya menutup PLT jika definitive induknya masuk
`expiredDefinitiveIds` pada snapshot run yang sama. Method `end()` di
`appointments.service.ts:593-630` mengakhiri definitive dan mencoba mengaktifkan successor,
tetapi tidak mengakhiri atau membatalkan PLT yang merujuk definitive tersebut.

**Reproduction**

1. Definitive berstatus `SUSPENDED` dan memiliki PLT `ACTIVE` yang masih valid.
2. KS/SA menjalankan `end()` pada definitive tanpa successor.
3. Definitive menjadi `ENDED`; PLT tidak disentuh dan tetap `ACTIVE`.
4. Run harian berikutnya juga tidak menutup PLT karena parent sudah terminal dan tidak masuk
   `expiredDefinitiveIds` baru.

**Impact**

PLT dapat terus memperoleh permission setelah dasar penugasannya berakhir. Ini melanggar
kontrak authority fail-closed dan klaim bahwa PLT tidak dapat bertahan setelah definitive
berakhir.

**Required fix**

- Buat satu helper terminal-parent reconciliation yang dipakai expiry, manual `end`,
  supersede/cutover yang relevan, dan recovery data stale.
- Ketika definitive berakhir, `ACTIVE`/`SUSPENDED` PLT menjadi `ENDED`; PLT
  `DRAFT`/`PENDING_APPROVAL`/`APPROVED` menjadi `CANCELLED` dalam transaksi yang sama.
- Invalidasi cache seluruh pemangku yang benar-benar berubah.
- Tambahkan unit dan PostgreSQL proof untuk manual end tanpa successor, dengan successor,
  retry, serta parent yang sudah terminal sebelum scheduler mulai.

### P1-R03 - CLOSED - Test PostgreSQL dapat memutasi database non-disposable bila env salah arah

**Evidence**

`apps/api/src/__tests__/appointment-expiry-postgres.spec.ts` aktif hanya berdasarkan adanya
`APPOINTMENT_EXPIRY_DATABASE_URL`. Test kemudian menjalankan
`academicYear.updateMany({ where: { isActive: true }, data: { isActive: false } })` dan tidak
memulihkan tahun ajaran yang sebelumnya aktif.

**Impact**

Salah memasang URL staging/production akan menonaktifkan seluruh tahun ajaran aktif dan
menulis banyak fixture sintetis. Nama environment khusus bukan guard data.

**Required fix**

- Tambahkan preflight fail-closed sebelum mutation: baca `current_database()`, host, dan marker
  eksplisit; izinkan hanya database bernama disposable yang disetujui seperti
  `diis_dryrun_*`/`diis_test_*` serta explicit confirmation flag.
- Tolak database canonical `diis_db`, staging, dan production.
- Simpan dan pulihkan state tahun aktif di `finally` sebagai defense in depth.
- Tambahkan test bahwa URL/DB tanpa marker ditolak sebelum query mutation pertama.

## P2 Packaging Note

Worktree saat ini berada pada branch `promote/main-wave9-school-date-gate1-20260831`, bukan
branch follow-up bersih dari `origin/develop`. Setelah source approval nanti, transplant exact
manifest ke branch `fix/*` baru dari `origin/develop`; jangan push branch promotion ini dan jangan
memakai broad staging.

## Verification Re-run

- Focused API: `6 suite / 148 test` pass.
- API type-check: pass.
- API lint: pass.
- API build: pass.
- Source diff terbatas pada service, unit test, dan satu PostgreSQL proof test.
- Laporan production sudah menyatakan `BUSINESS LIFECYCLE SIGN-OFF HOLD`.
- Tidak ada commit, push, deploy, atau production mutation yang dilakukan reviewer.

PostgreSQL proof Executor `1/1` dan full API `1,332` diterima sebagai evidence laporan,
tetapi tidak dijalankan ulang oleh reviewer karena database disposable telah dibersihkan.

## Gate Berikutnya

Kembalikan ketiga P1 ke branch follow-up yang sama. Setelah ditutup, ulang independent source
re-review. Git packaging, staging fixture nonzero, production promotion, dan final business
lifecycle claim tetap HOLD.

## Re-review Kedua

Re-review kedua mengonfirmasi ketiga finding sebelumnya sudah ditutup:

- seluruh mutasi status manual memakai shared advisory lock, re-read dalam transaksi,
  authoritative school date setelah lock, dan expected-status CAS;
- CAS kalah menghasilkan 409 dan transaksi tidak meninggalkan approval audit atau cache
  invalidation sukses palsu;
- helper PLT terminal dipakai manual end, supersede, cutover, expiry, dan stale-parent recovery;
- test PostgreSQL mewajibkan confirmation exact, loopback host, nama database disposable,
  kecocokan `current_database()`, dan marker table/value sebelum mutation;
- state tahun ajaran aktif dipulihkan dalam cleanup.

### P1-R04 - CLOSED - Kandidat PENDING_APPROVAL kedaluwarsa tetap membekukan kapasitas

**Evidence**

- `reconcileExpiredAppointments()` membangun `cancelledIds` hanya dari status `APPROVED`
  pada `apps/api/src/appointments/appointments.service.ts:848-855`.
- `PENDING_APPROVAL` termasuk `PREPARED_STATUSES` dan dihitung dalam occupancy serta
  duplicate/capacity guard pada `appointments.service.ts:1481-1500`, `1513-1525`,
  `1820-1829`, dan `1895-1909`.
- `approve()` kini benar menolak kandidat tersebut setelah `effectiveUntil`, tetapi tidak
  mengubah statusnya. Scheduler juga tidak membatalkannya.

**Reproduction**

1. Buat Appointment dengan kapasitas satu, submit menjadi `PENDING_APPROVAL`, dan biarkan
   `effectiveUntil` lewat sebelum approval.
2. Jalankan scheduler. Row tetap `PENDING_APPROVAL`.
3. Approval ditolak karena kedaluwarsa, tetapi row tetap dihitung sebagai prepared capacity.
4. Kandidat pengganti tanpa replacement plan ditolak meskipun kandidat lama tidak mungkin
   lagi aktif.

**Impact**

Slot jabatan dapat terkunci tanpa batas dan memerlukan cancel manual. Registry juga tidak
truthful terhadap lifecycle otomatis yang dimaksud. Ini terutama relevan untuk pengisian
jabatan di tengah tahun dengan jendela approval pendek.

**Required fix**

- Rekonsiliasi seluruh pre-active Appointment dengan `effectiveUntil < schoolDate`:
  minimal `PENDING_APPROVAL` dan `APPROVED`; rekomendasi terbaik juga menutup `DRAFT` agar
  registry tidak menyimpan draft mustahil secara permanen.
- Gunakan CAS status awal yang tepat, reason konsisten, `cancelledCount`, dan cache
  invalidation hanya untuk row yang benar-benar berubah.
- Tambahkan unit dan PostgreSQL proof bahwa expired pending/draft menjadi `CANCELLED`,
  capacity bebas, boundary hari ini tetap terbuka, dua scheduler hanya menghitung sekali,
  dan retry kembali nol.

## Verification Re-run Kedua

- Focused API: `7 suite / 156 test` pass; tiga PostgreSQL runtime test ter-skip tanpa URL.
- Full API: `70 suite / 1,340 test` pass; satu suite/tujuh test environment-gated skip.
- API type-check: pass.
- API lint: pass.
- API build: pass.
- `git diff --check`: pass.

PostgreSQL runtime `7/7` tetap evidence Executor dan tidak diulang setelah database
disposable dibersihkan. Finding P1-R04 berasal dari query dan occupancy contract yang dapat
direproduksi langsung dari source.

## Verdict Re-review Kedua

**FOLLOW-UP REQUIRED**

Tiga P1 lama tertutup. P1-R04 harus ditutup pada branch yang sama sebelum transplant ke
branch bersih dan explicit Git packaging.

## Final Re-review P1-R04

P1-R04 sudah ditutup:

- `EXPIRABLE_PREPARED_STATUSES` mencakup `DRAFT`, `PENDING_APPROVAL`, dan `APPROVED`;
- selector expiry memakai `effectiveUntil < schoolDate`, sehingga hari batas tetap inklusif;
- write memakai `updateMany` CAS dan hanya menambah `cancelledCount` serta affected user jika
  tepat satu row berubah;
- invalidasi cache dilakukan setelah transaksi scheduler berhasil commit;
- aktivasi berikutnya hanya membaca `APPROVED` yang masih berada dalam rentang tanggal;
- unit test membuktikan draft/pending/approved kedaluwarsa dibatalkan dan boundary hari ini
  tidak disentuh;
- PostgreSQL proof membuktikan scheduler paralel hanya menghitung sekali, mutasi manual kalah
  secara fail-closed, approval audit tidak tercipta, affected cache tepat, dan retry kembali nol;
- pelepasan kapasitas dibuktikan pada database melalui trigger capacity, sedangkan pembatalan
  `PENDING_APPROVAL`/`DRAFT` dibuktikan pada matriks race yang sama.

## Final Verification Re-run

- Focused API: `7 suite / 156 test` pass; tiga test PostgreSQL runtime ter-skip tanpa URL.
- Full API: `70 suite / 1.340 test` pass; satu suite/tujuh test environment-gated skip.
- API type-check: pass.
- API lint: pass.
- API build: pass.
- `git diff --check`: pass.
- Tidak ada staged changes, commit, push, deploy, atau production mutation oleh reviewer.

PostgreSQL disposable `1 suite / 7 test` diterima sebagai evidence Executor. Reviewer tidak
menghidupkan kembali database yang sudah dibersihkan hanya untuk menduplikasi proof tersebut.

## Final Verdict

**APPROVED FOR EXPLICIT GIT PACKAGING**

Approval hanya berlaku untuk transplant exact patch yang direview ke branch `fix/*` bersih
dari `origin/develop`, lalu literal manifest staging dan pemeriksaan cached diff. Approval ini
bukan izin merge, promosi staging/main, deploy, perubahan timer production, atau pencairan
freeze pembuatan/approval Appointment production.

Gate setelah packaging tetap terpisah: CI PR, staging positive fixture nonzero yang membuktikan
ended/cancelled/activated serta retry nol, independent staging sign-off, lalu approval production
baru. Source timer production saat ini tidak boleh dianggap sudah memuat patch ini.
