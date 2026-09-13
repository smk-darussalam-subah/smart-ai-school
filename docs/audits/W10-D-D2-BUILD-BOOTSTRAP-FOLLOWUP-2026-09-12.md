# W10-D D2 Backup Build Bootstrap Follow-up

- Tanggal: 2026-09-13, Asia/Jakarta
- Peran: Executor, bukan Independent Reviewer
- Baseline: `b2ee3b369db6b95b09de7cbca6de94dd2e779b8e`
- Tree baseline: `5453bfb7701d4adac7691fbef46a3e80f7782b20`
- Status: `D2 SOURCE AND LOCAL SYNTHETIC RESTORE COMPLETE - MERGE AND OPERATIONS HOLD`

## Ringkasan

Transaksi D1-A selesai dan telah dibaca ulang. Environment
`backup-image-publication`, `staging-image-publication`, dan `staging` masing-masing
memiliki satu reviewer `sholahuddinzen-cpu`, admin bypass nonaktif, serta hanya menerima
branch yang ditetapkan. Environment `production` tetap tidak disentuh.

Dispatch D2-A tidak menghasilkan workflow run. GitHub menolak permintaan dengan HTTP 404
karena `backup-image.yml` belum tersedia pada default branch. Tidak ada artifact, package,
deployment, tag, commit, atau biaya build yang dibuat oleh percobaan tersebut.

Patch ini menambahkan jalur bootstrap minimal agar build pertama dapat dijalankan dari
exact commit `develop` tanpa melemahkan publish gate. Tidak ada build atau dispatch baru
yang dilakukan dalam source gate ini.

Independent review menemukan bahwa tag dapat dihapus lalu dibuat ulang dan diterima lagi.
Follow-up ini mengikat bootstrap ke `run_id`, `run_attempt=1`, dan riwayat workflow GitHub;
hanya run exact-workflow dengan ID terendah untuk source/tag tersebut yang diterima. Run
kedua serial, recreate tag, rerun attempt, history ambigu, pagination lebih dari 100, serta
metadata run/repository yang tidak tepat ditolak fail-closed.

## Kontrak bootstrap

1. Workflow hanya menerima push tag dengan prefix `w10d-backup-build-`.
2. Validator mensyaratkan nama tag tepat `w10d-backup-build-<40-char source SHA>`.
3. `GITHUB_SHA`, tip `develop`, objek tag, current run, dan history run harus menunjuk
   commit/tag/workflow/repository yang sama.
4. Hanya `run_attempt=1` dan run ID paling awal yang diterima. Delete/recreate tag, run
   kedua serial, rerun, history hilang/ambigu/terpotong, tag annotated, branch push, input
   manual pada tag, SHA berbeda, serta metadata GitHub yang tidak dapat dibaca ditolak.
5. Workflow hanya menambahkan permission read-only `actions: read`; tidak ada
   `packages: write` pada job bootstrap.
6. Jalur bootstrap hanya menjalankan build, smoke, SBOM, scan, dan upload artifact privat
   tujuh hari. Job publish secara eksplisit hanya menerima `workflow_dispatch`.
7. Metadata publikasi merekam `buildTrigger` dan membuktikan source bootstrap tetap berada
   pada ancestry `develop` sebelum artifact dapat dipakai untuk keputusan publikasi.
8. Satu tag/build berikutnya tetap memerlukan approval baru yang mengikat exact reviewed
   SHA. Otorisasi D2-A lama tidak digunakan kembali.

## Keputusan Google Drive dan restore

Director menetapkan Shared Drive sekolah `DIIS Recovery/BACKUP_DIIS` sebagai tujuan arsip
cloud dan sumber restore authoritative. Read-only owner verification membuktikan akun
`admin@smkdarussalamsubah.sch.id` berperan Manager dan service account project
`diis-backup-recovery` berperan Content manager. Service account aktif dan belum memiliki
key. Tidak ada key atau permission yang dibuat atau diubah.

Keputusan tersebut diterapkan tanpa klaim teknis palsu: Google Drive menyimpan arsip
terenkripsi dan dapat menjadi sumber streaming, tetapi tidak menjalankan PostgreSQL,
MinIO, atau filesystem database hidup. Executable restore tetap memerlukan compute dan
filesystem disposable yang disetujui. Drive C saat ini tidak memenuhi reserve minimum
25 persen dan tidak dipaksa. Tidak ada backup production yang diunduh ke CI, layanan AI,
atau Drive lokal.

Kontrak aktif tidak mengizinkan VM atau biaya cloud baru. Target eksekusi restore harus
PC/laptop dan storage terenkripsi yang sudah dimiliki sekolah. Google Cloud billing tetap
tidak terhubung dan tidak menjadi jalur restore aktif. Bila target existing belum tersedia,
B11 tetap terbuka; hal tersebut tidak boleh ditutup dengan proposal VM berbayar.

## Restore lokal sintetis terukur

Restore lokal dijalankan pada 2026-09-13 menggunakan helper existing tanpa mengubah satu
byte source restore. Seluruh data bersifat sintetis; tidak ada backup, credential, bucket,
database, atau object production/staging yang dibaca. Pengujian hanya membuat resource
Docker bernama unik dan berlabel disposable, lalu membersihkannya melalui inventaris uji.

### PostgreSQL

- Script exact: `infrastructure/docker/tests/wave10-postgres-integration.sh`.
- Image PostgreSQL dipin ke digest yang sudah ada di source.
- Dump custom-format aktual: 247.522 byte, SHA-256
  `e906ea34c0f23578954404cd8155ab3a9fe2fe6825ac1aae3386ab4db07d5255`.
- Target tmpfs: 536.870.912 byte; ruang tersedia sebelum restore 484.306.944 byte;
  proyeksi helper setelah satu dump 90 persen.
- Rekonsiliasi hasil restore: 69 tabel, 0 user, 0 student. Nilai nol adalah fixture
  sintetis yang disengaja, bukan klaim mengenai data sekolah.
- Migrasi diterapkan, concurrency Super Admin 3/3 lulus, provenance
  `independent-crypt` diterima, provenance salah ditolak sebelum mutasi, dan signal setelah
  create tetap membersihkan database/lock.
- Durasi run final: 18,913 detik. Dua percobaan kesiapan dependency sebelumnya berhenti
  sebelum dump/restore dan masing-masing membuktikan cleanup container, network, dan temp.

### MinIO

- Script exact: `infrastructure/docker/tests/wave10-minio-integration.sh`.
- Fixture dump aktual: 8.207 byte; sidecar 80 byte; SHA-256 dump
  `004ce4d9e97ade2bac08bb02a906beb5f0441c1033d45a68932ee5226b591833`.
- Copy-back dump dan sidecar cocok byte-for-byte. Overwrite terkontrol dengan 128 byte
  terdeteksi sebagai korupsi dan tidak diterima sebagai hasil restore.
- Filesystem Docker target saat observasi: 1.081.101.176.832 byte total dan
  1.019.025.059.840 byte tersedia. Angka ini adalah hasil `df` target disposable, bukan
  kapasitas yang diasumsikan untuk restore backup nyata.
- Durasi run: 6,427 detik. Setelah trap cleanup, container, network, volume, dan temp
  dengan prefix uji seluruhnya tidak ada.

Drive C pada waktu pengujian memiliki 62.105.239.552 byte bebas dari total
254.888.898.560 byte atau 24,366 persen. Angka ini tidak diubah menjadi estimasi kebutuhan
restore. Ia hanya menunjukkan bahwa perangkat ini masih kurang 1.616.985.088 byte untuk
mempertahankan reserve policy 25 persen bahkan sebelum footprint backup nyata diukur.
Karena itu, keberhasilan fixture kecil ini membuktikan executable helper dan isolation,
bukan menerima PC ini sebagai target restore backup sekolah.

## Verifikasi terdampak

| Pemeriksaan | Hasil |
| --- | --- |
| Python syntax, lima file | PASS |
| Workflow YAML | PASS, 2 jobs |
| Source closure contract | `44/44 PASS`, termasuk recreate/replay/rerun rejection |
| Integrated closure contract | `22/22 PASS` |
| Capacity lifecycle contract | `55/55 PASS` |
| Staging readiness contract | `49/49 PASS` |
| Historical predecessor inputs | `59 PASS` |
| GitHub Actions response shape | PASS, run ID/path/attempt/source/branch/repository tersedia |
| D1-A environment read-back | 4 environment sesuai policy; production no-touch |
| D2-A run lookup | 0 run pada exact baseline/workflow |
| PostgreSQL synthetic restore | PASS; 247.522 byte, 69 tabel, cleanup exact |
| MinIO synthetic copy-back | PASS; 8.207 byte, corruption rejected, cleanup exact |
| Restore source delta | `0`; helper existing memadai |

Full application API/web suite tidak diulang karena patch hanya menyentuh build workflow,
validator metadata, handoff, dan contract test. Tidak ada application behavior, schema,
dependency, credential, atau runtime yang berubah.

## Source manifest

Aggregate SHA-256 menggunakan path ASCII terurut dan format
`<sha256><dua spasi><path><LF>`:

`e2ea1ff2f3fd3aa50a5d9a244388d12978d1e470bfd9d3b14d44b2420b5b583d`

| Path | SHA-256 |
| --- | --- |
| `.github/workflows/backup-image.yml` | `fbe06a69f59a05b2f1f722b99e6c051ad000ae9f41375b0f85961e3e49097d5c` |
| `infrastructure/deploy/tests/integrated-closure-contract.py` | `5a3ce146c309b32c1b41c0badc21c3853933fe3da1a6b27f85423056c1cfa43a` |
| `infrastructure/deploy/tests/source-closure-contract.py` | `c542cc074ee996f1226e08db2431ca77c6a7a94b6f7ec592ec7e5060d8172c67` |
| `infrastructure/deploy/verify-backup-build-trigger.py` | `06ccb5ff113678da8fda80ab3ff4deb071dcc60842a41a35ad2f690a55bcb9a5` |
| `infrastructure/deploy/verify-integrated-handoff.py` | `25b8d423145db844ac00d36205156032f98c2a05628076b580dc53faccf8cdf0` |
| `infrastructure/deploy/verify-publication-metadata.py` | `f7cc1db9bf509c0990c98a40326880ed2794bd9d052245b801aec07f352ed4bb` |

Handoff successor mempertahankan laporan dan evidence D0 byte-identik, memvalidasi
manifest predecessor terhadap exact baseline Git, dan tetap mengeksekusi 59 input
historis. Perubahan tanpa binding, file hilang, extra path, SHA salah, atau evidence test
tidak valid ditolak. Validator juga mengikat kebijakan restore ke perangkat sekolah tanpa
biaya baru dan `googleCloudBillingLinked=false`.

## Literal manifest

Jumlah final adalah delapan path: enam source di atas ditambah laporan ini dan
`docs/audits/W10-D-D2-BUILD-BOOTSTRAP-EVIDENCE-2026-09-12.json`.

Packaging Git pada gate ini hanya boleh memuat delapan path tersebut dan berhenti sebelum
merge. Build/tag/publication D2, credential, backup atau restore data nyata, cleanup global,
staging, VPS, production, n8n, dan scheduler tetap HOLD.

## Input Director yang masih diperlukan

Tidak ada input Director tambahan yang diperlukan untuk menyelesaikan packaging dan CI
gate ini. Untuk gate operasional setelah merge, input yang benar-benar masih terbuka adalah:

1. Target PC/laptop sekolah dan filesystem terenkripsi dengan kapasitas aktual yang dapat
   diukur terhadap footprint backup nyata sambil menyisakan reserve minimal 25 persen.
   Keputusan Google Drive sebagai sumber arsip sudah ada dan tidak diminta ulang.
2. Custodian cadangan dan lokasi kit pemulihan di luar VPS serta Drive. Director sudah
   menjadi primary owner; daftar ini tidak menganggap primary-only sebagai redundansi.
3. Binding SMTP Google Workspace dan kanal privat provisioning credential untuk
   `admin@smkdarussalamsubah.sch.id`. Alamat dan owner tidak diminta ulang.
4. Maintenance window WIB untuk writer pause/restart/rollback pada D3-D5. Tidak diperlukan
   untuk synthetic local restore atau Git gate saat ini.
5. Approval exact-SHA terpisah untuk satu build D2 setelah PR merge, quota/biaya GitHub
   diverifikasi, serta independent review menerima candidate. Approval lama tidak dipakai.

## Rekomendasi model untuk tindak lanjut

Task berikutnya: Independent Reviewer memeriksa exact PR delapan path dan CI exact-head,
termasuk source-closure Docker pada runner Ubuntu, tanpa mengulang synthetic restore lokal
yang byte input-nya identik.

Model / effort: GPT-5.6 Sol (`gpt-5.6-sol`) / high.

Alasan: delta sempit tetapi berada pada supply-chain workflow dan integrity handoff yang
memerlukan review security-aware terhadap trigger, ancestry, dan fail-closed behavior.

Syarat kualitas: exact tag/develop/source binding lulus; tag tidak dapat publish; chain
predecessor 59 input dan negative controls tetap valid.

Eskalasi bila review menemukan bypass supply-chain atau konflik binding material:
GPT-6 Astra (`gpt-6-astra`) / high.

Sesi laporan ini: model/effort aktual tidak terverifikasi.
