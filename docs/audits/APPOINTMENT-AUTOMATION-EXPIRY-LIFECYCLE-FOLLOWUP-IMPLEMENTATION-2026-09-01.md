# Appointment Automation Expiry Lifecycle Follow-up

Tanggal: 2026-09-01

Peran: Executor

Status: **READY FOR INDEPENDENT SOURCE RE-REVIEW**

## Ringkasan

Follow-up ini menutup P1 pada rekonsiliasi lifecycle harian Appointment. Perubahan tetap berada
pada branch Appointment school-date yang sama dan belum di-commit, push, deploy, atau dijalankan
terhadap staging/production.

Scheduler dan seluruh mutasi lifecycle manual sekarang memakai advisory lock, transaksi, tanggal
sekolah, dan compare-and-set status yang sama. Di dalam kontrak tersebut sistem:

1. mengakhiri Appointment `ACTIVE` dan `SUSPENDED` bila `effectiveUntil < schoolDate`;
2. membatalkan seluruh Appointment `DRAFT`, `PENDING_APPROVAL`, dan `APPROVED` kedaluwarsa
   pada tahun ajaran aktif;
3. mengakhiri PLT aktif/suspended bila appointment definitif induknya kedaluwarsa;
4. membatalkan PLT draft/pending/approved bila appointment definitif induknya kedaluwarsa;
5. mempertahankan batas inklusif `effectiveUntil == schoolDate` sebagai masih berlaku;
6. mengaktifkan successor valid setelah slot incumbent kedaluwarsa dilepas;
7. menghitung hanya transisi CAS yang benar-benar terjadi;
8. menolak `submit`, `approve`, `suspend`, dan `resume` yang sudah kedaluwarsa;
9. menutup PLT aktif/suspended serta membatalkan PLT prepared ketika definitive diakhiri manual,
   di-supersede, terkena cutover, atau sudah terminal sebelum scheduler mulai;
10. mengembalikan 409 tanpa approval audit atau cache invalidation bila CAS kehilangan race;
11. memasukkan terminasi PLT child akibat supersede ke safe-count yang sesuai;
12. menginvalidasi cache seluruh pengguna yang benar-benar terdampak hanya setelah commit.

Tidak ada perubahan Prisma schema, migration, dependency, endpoint, token, systemd, Keycloak,
n8n, atau kontrak exact four-safe-count.

## Desain Transaksi

`activateDueAppointments()` dan mutasi manual `submit`, `approve`, `reject`, `cancel`, `suspend`,
`resume`, `end`, serta `supersede` memperoleh shared advisory lock yang sama. Waktu dan
`schoolDate` baru dibaca setelah lock diperoleh. Target dan authority Appointment dibaca ulang dari
transaction client yang sama, lalu transition dilakukan dengan compare-and-set status melalui
`updateMany`.

Authority Kepala Sekolah dalam lifecycle transaction tidak membuka koneksi Prisma kedua. Ini
menghindari pool starvation ketika request lain sedang menunggu advisory lock. CAS mencegah
scheduler atau operator menimpa transition yang sudah mengubah status row. Retry melihat state
terbaru dan berhenti 409 atau menghasilkan exact zero counts.

Helper terminal-parent yang sama dipakai oleh expiry, manual `end`, supersede, cutover, dan stale
recovery. Karena itu tidak ada PLT terbuka yang dapat mempertahankan authority setelah definitive
induk menjadi terminal.

PostgreSQL test memiliki preflight sebelum mutasi: confirmation flag exact, host loopback, nama
database `diis_test_*`/`diis_dryrun_*`, kecocokan `current_database()`, dan marker table/value exact.
State tahun aktif disimpan dan dipulihkan pada cleanup sebagai defense in depth.

## Manifest Source

- `apps/api/src/appointments/appointments.service.ts`
- `apps/api/src/__tests__/appointments.spec.ts`
- `apps/api/src/__tests__/appointment-expiry-postgres.spec.ts`

Dokumen ini dan koreksi laporan final adalah evidence Executor. Laporan Independent Reviewer tetap
reviewer-owned dan tidak diubah.

## Automated Verification

### Focused Unit Matrix

Command:

```text
npm --workspace @smk/api test -- --runInBand \
  src/__tests__/appointments.spec.ts \
  src/__tests__/appointment-expiry-postgres.spec.ts \
  src/__tests__/appointment-scope.helper.spec.ts \
  src/__tests__/permissions.spec.ts \
  src/__tests__/positions.spec.ts \
  src/__tests__/roles.spec.ts \
  src/__tests__/school-config.spec.ts
```

Result: **7 suite / 156 test pass**, dengan 3 test PostgreSQL runtime ter-skip pada run tanpa URL
disposable.

Matrix mencakup definitive, successor, PLT, suspended, batas hari ini, CAS-lost 409, cache
invalidation setelah commit, authority satu transaction client, stale-parent recovery, dan deferred
advisory lock yang melewati tengah malam WIB.

### Full API

Result: **70 suite / 1,340 test pass**, 1 suite dan 7 test environment-gated skip.

### Static and Build

- API type-check: pass.
- API lint: pass.
- API build: pass.
- `git diff --check`: pass.

## PostgreSQL Disposable Proof

Environment:

- PostgreSQL 18 lokal terisolasi;
- pgvector tersedia;
- seluruh **46 migration resmi** diterapkan;
- database, role, dan fixture seluruhnya sintetis.

Proof test:

```text
APPOINTMENT_EXPIRY_DATABASE_URL=<redacted-local-url> \
npm --workspace @smk/api test -- --runInBand \
  src/__tests__/appointment-expiry-postgres.spec.ts
```

Result: **1 suite / 7 test pass**.

Skenario aktual membuktikan:

- kandidat baru ditolak capacity trigger sebelum expiry direkonsiliasi;
- dua instance scheduler dipanggil bersamaan;
- tepat satu instance menghasilkan `endedCount=5`, `cancelledCount=2`,
  `activatedCount=1`, `affectedUserCount=8`;
- instance lain menghasilkan exact zero counts;
- retry ketiga tetap exact zero counts;
- definitive expired menjadi `ENDED`;
- suspended definitive expired menjadi `ENDED`;
- PLT aktif yang induknya expired menjadi `ENDED` walau tanggal PLT sendiri masih valid;
- successor expired menjadi `CANCELLED`;
- successor yang due dan valid menjadi `ACTIVE`;
- appointment dengan `effectiveUntil == schoolDate` tetap `ACTIVE`;
- kandidat baru berhasil dibuat setelah slot expired dilepas.
- scheduler-vs-`resume`, scheduler-vs-`suspend`, dan scheduler-vs-`approve` diserialisasi;
- row expired tidak pernah hidup kembali atau menjadi `APPROVED`;
- `PENDING_APPROVAL` dan `DRAFT` kedaluwarsa menjadi `CANCELLED`, ikut safe-count, dan tidak lagi
  mengonsumsi prepared capacity atau mengotori registry terbuka;
- CAS/retry gagal tidak membuat approval audit atau invalidasi cache palsu;
- manual end definitive tanpa successor mengakhiri PLT aktif;
- manual end dengan successor membatalkan PLT draft lalu mengaktifkan successor;
- retry manual end berhenti fail-closed;
- PLT terbuka dengan parent yang sudah terminal dipulihkan oleh scheduler;
- database canonical, host remote, marker hilang, dan confirmation hilang ditolak sebelum mutasi.

Database dan role proof dihapus dalam `finally`; verifikasi akhir menghasilkan
`cleanup_database=0` dan `cleanup_role=0`. Tidak ada fixture sintetis yang tertinggal.

## Production Containment

- Production tetap pada SHA `c413e2d4f4506f296c7a4bf3820f4457722b7a20`.
- Timer production tidak diubah dan tetap menjalankan source lama.
- Dataset production terakhir terverifikasi tidak memiliki Appointment aktif/kedaluwarsa.
- Pembuatan dan approval Appointment production tetap harus dibekukan secara administratif.
- Tidak ada SSH, credential, unit, database, container, GitHub, atau production mutation pada
  follow-up source ini.

Status yang benar sampai patch selesai dipromosikan adalah:

> TIMER ACTIVE; INSTALLATION AND FIRST EMPTY RUN VERIFIED; BUSINESS LIFECYCLE SIGN-OFF HOLD.

## Remaining Gates

1. Independent source re-review atas manifest dan proof ini.
2. Setelah reviewer approval, transplant exact manifest ke branch `fix/*` bersih dari
   `origin/develop`; branch promotion saat ini tidak boleh dipush.
3. Explicit Git packaging setelah digest/diff transplant cocok.
4. CI dan promosi ke staging.
5. Positive staging fixture dengan count nonzero, aggregate before/after, retry zero, dan journal
   PII-safe.
6. Independent staging sign-off.
7. Approval dan promosi production terpisah.
8. Positive scheduled-run reconciliation sebelum final business lifecycle claim dipulihkan.

Tidak ada klaim staging atau production completion dalam laporan ini.
