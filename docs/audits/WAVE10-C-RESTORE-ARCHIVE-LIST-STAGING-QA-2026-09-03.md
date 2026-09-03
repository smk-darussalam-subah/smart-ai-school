# Wave 10-C Restore Archive List Staging QA

Tanggal: 2026-09-03
Peran: Executor
Status: **AFFECTED STAGING QA PASS - INDEPENDENT STAGING REVIEW REQUIRED**

## Delivery Binding

- Source follow-up PR: `#639`, head
  `b16e9c4b562e7236712c9d7a457e1794b95841a5`.
- Merge `develop`: `c032fc11219afd84e265561b939383511992288e`.
- Promotion PR: `#640`.
- Exact staging SHA: `04edadfe87a27d7184a16a292b33df6efe30053d`.
- Deploy run: `33740040094`, attempt 1, sukses.
- Tree `develop` dan `staging`:
  `bce40b68f2bf2b884edbeca751e206d48b74dbd0`.
- `main` tetap
  `a490a391e5e4922c1bf2d0566aa5cef9a1aba80e`.

Seluruh CI PR source dan promotion lulus. Classic protection `develop`,
`staging`, dan `main` telah kembali ke satu approval. Ruleset staging dan main
juga kembali ke satu approval. Tidak ada PR terbuka setelah promotion.

## Exact Runtime

- Checkout VPS staging tepat pada SHA di atas, branch `staging`, dan bersih.
- Hash `scripts/restore-drill.sh`:
  `61c1a3e5ce4dc02da2aa68b4594f24485ddd1227c573d7a53e01619923dded10`.
- Hash `infrastructure/docker/tests/backup-contract.sh`:
  `88d2d5d50325cae319340f87453d0046a55576dd2bdbd90574e8c6156b0f4fba`.
- API container `running/healthy`.
- PostgreSQL container `running/healthy`.
- Public API health HTTP 200, status `ok`, database `up`.
- Public web HTTP 200.
- Prisma: 46 migration, schema up to date.

## Affected Runtime Matrix

### Behavioral Contract

Backup contract dijalankan dari checkout exact-SHA pada VPS Linux. Node hanya
disediakan melalui container sementara dari image API staging; checkout
dipasang read-only dan wrapper sementara dihapus sesudah eksekusi.

Hasil: **16/16 lulus**, termasuk:

- archive-list producer 5.000 baris wajib selesai;
- command failure ditolak sebelum mutasi;
- output archive list kosong ditolak;
- temporary archive-list selalu dibersihkan;
- target production/staging dan target tanpa marker tetap ditolak.

### Actual Custom-Format Restore

Target PostgreSQL memakai container disposable berlabel `disposable-v1`, tepat
satu network berlabel `isolated-v1`, dan data directory pada tmpfs 1 GiB.
Tmpfs dipilih agar proof tidak menekan disk VPS serta tetap memenuhi guard
kapasitas minimum.

Hasil:

- 46 migration diterapkan;
- custom-format dump valid dibuat dari fixture kosong;
- restore pertama: 68 tabel, 0 user, 0 siswa;
- restore kedua: 68 tabel, 0 user, 0 siswa;
- archive rusak dengan checksum dan manifest yang konsisten ditolak pada
  archive-list validation;
- proof archive rusak berstatus `failed`;
- tidak ada database `diis_restore_%` yang tertinggal;
- file archive-list sementara tersisa 0.

Run awal dengan filesystem overlay host berhenti fail-closed pada guard ruang
bebas minimum 25%. Run tersebut tidak membuat database restore dan cleanup
meninggalkan 0 container, network, serta direktori sementara. Guard tidak
dilonggarkan; run sukses kemudian memakai target tmpfs terisolasi.

## Cleanup

Sesudah seluruh matrix:

- container disposable Wave 10: 0;
- network disposable Wave 10: 0;
- direktori sementara Wave 10: 0;
- restore database sementara: 0;
- checkout staging tetap bersih;
- shared staging database tidak dimutasi oleh restore drill.

## Browser Evidence Boundary

Delta dari staging lama `b26ef10072c12dc9e966792a2c9d7779a77f2d80` ke
SHA baru tepat tiga path manifest follow-up. Tree berikut identik:

- `apps/web`: `3f12d6f656760797886d18821601dbe0e831e5b2`;
- `apps/api`: `6f865167c4f9115f9bfcca1d9cf5bea5692a0472`.

Karena tidak ada perubahan produk, UI, API, auth, permission, atau identity
workflow, browser identity matrix tidak diulang. Evidence sebelumnya hanya
boleh direuse oleh Independent Reviewer bila binding SHA/tree-nya dinilai
memadai; laporan ini tidak mengklaim browser run baru.

## Verdict Executor

**AFFECTED STAGING QA PASS - INDEPENDENT STAGING REVIEW REQUIRED**

False failure archive-list yang memblokir SHA staging lama tidak tereproduksi
pada exact SHA baru. Success, retry, failure, capacity guard, reconciliation,
dan cleanup sudah terbukti pada runtime staging Linux dengan data sintetis.

Main, production, credential Google Drive, backup commissioning, identity
cleanup, real-data pilot, dan recovery production tetap **HOLD**.
