# Runbook Backup dan Verifikasi Pemulihan DIIS

**Berlaku untuk source:** 2026-09-05

**Pemilik:** Operator infrastruktur

**Status:** `NOT ACTIVE / NOT COMMISSIONED`

## Current Verified Runtime

Application production telah berada pada tree yang ditinjau, tetapi source recovery
follow-up dalam dokumen ini belum dipaketkan, dideploy, atau diaktifkan. Gate 1
terakhir hanya mengobservasi tujuh dump legacy dan nol completion manifest target;
keadaan itu adalah `legacy-observed`, bukan target-valid, off-site-complete, atau
restore-proven. Jadwal legacy yang terakhir diverifikasi tetap 19:00 WIB; catatan
ini hanya current-state evidence dan bukan authority untuk mengubah scheduler.
Workflow n8n pada repository tetap `active=false` dan credential monitor belum
dikonfigurasi.

Jangan menggunakan bagian target di bawah sebagai bukti bahwa backup, off-site,
monitor, atau restore rehearsal sudah operasional. Operating truth hanya boleh
diubah oleh laporan commissioning production exact-SHA yang ditinjau independen.

## Target Contract Setelah Commissioning

- Satu-satunya backup database terjadwal adalah container `smk-pg-backup` pukul
  02:00 WIB (`Asia/Jakarta`).
- `scripts/backup-db.sh` hanya membuat titik `pre-change` manual yang terlindungi.
- n8n hanya memantau telemetry PII-safe pukul 02:45 WIB dan tidak menjalankan
  backup atau restore.
- Backup valid hanya setelah dump, local MinIO copy-back, exact object manifest,
  off-site copy-back, safe counts, dan completion manifest seluruhnya valid.
- Restore rehearsal hanya boleh memakai container PostgreSQL disposable bertanda
  pada network terisolasi. Production recovery memakai replacement target baru.
- Semua instance backup target memakai writer lock host bersama pada
  `/var/lock/diis-backup/backup.lock`; candidate memakai tool volume fisik unik,
  scheduler mati, bucket creation mati, dan retention dry-run sampai acceptance.

## Urutan Gate H1, H2, Capacity, dan C1

Semua gate berikut tetap memerlukan approval terpisah dan tidak boleh digabungkan
menjadi satu otorisasi mutation:

1. **H1 — root-cron read-only.** Jalankan helper klasifikasi root cron yang sudah
   ditinjau untuk menghasilkan hanya count, status, dan hash. Jangan tampilkan body
   atau command cron. H1 tidak memasang file dan tidak mengubah cron.
2. **H2 — lock bootstrap.** Hanya setelah H1 diterima, operator root menjalankan
   installer hash-bound dengan confirmation exact untuk memasang satu tmpfiles rule
   dan membuat `/var/lock/diis-backup` sebagai directory canonical, non-symlink,
   owner/group `appuser:appuser`, mode `0750`. Mode ini memberi operator dan
   container backup dalam group yang sama akses shared lock tanpa akses user lain.
   Installer tidak memberi shell atau sudo umum kepada `appuser`; reboot recreation
   berasal dari rule yang byte/hash-nya sama. Existing target divalidasi read-only;
   installer tidak memperbaiki owner/mode secara implisit, dan atomic install guard
   menolak invocation kedua. Eksekusi installer dilarang pada source
   review.
3. **Capacity cleanup.** Hanya setelah bukti H1/H2 dan approval cleanup exact,
   ukur `docker buildx du` pada builder `default` dengan filter `until=1h`,
   `inuse=false`, DAN `private=true`; prune memakai tiga filter yang identik. Parser
   JSON ketat menolak duplicate key dan record shared. Lower bound deletable dihitung
   sebagai private eligible bytes dikurangi penuh `--reserved-space` 8 GiB, tidak
   pernah dari aggregate reclaimable/upper bound. Required lower bound adalah deficit
   menuju 24 GiB ditambah margin 2 GiB. Ulangi ukuran dan digest exact
   setelah host lock serta writer lock; drift berhenti sebelum prune. Jika target 24
   GiB dan minimum persentase sudah terpenuhi, hasil wajib no-op. Pemeriksaan no-op
   diulang setelah seluruh lock diperoleh dan tepat sebelum locked eligibility/prune.
4. **C1 — credential.** Pembuatan/pemasangan credential baru dipertimbangkan setelah
   source re-review dan capacity cleanup diterima. C1 tidak otomatis mengaktifkan
   candidate, scheduler, backup, retention, atau restore.

Jalur legacy tunggal mempertahankan pembuatan parent internal terbatas sampai H2
selesai agar source deployment tidak mematikan scheduler lama. Jalur ini tidak
shared-host dan tidak boleh diterima sebagai target. Candidate, cleanup, serta
handoff wajib membawa `BACKUP_LOCK_BOOTSTRAP_REQUIRED=1`; karena itu ketiganya
menolak parent yang belum dibuat oleh H2. Pada production, ketiganya menolak setiap
lock selain exact `/var/lock/diis-backup/backup.lock`; test override hanya berlaku
ketika `DIIS_W10D_TEST_ROOT` menunjuk satu canonical directory owner-caller mode
`0700` yang merupakan direct child `/tmp`. Seluruh repo, root-prefix, credential,
lock, evidence, marker, dan release test wajib tetap di bawah root itu. Production
mode menolak setiap `ALLOW_TEST_*`, `DIIS_TEST_*`, dan inherited acceptance-test
control sebelum mutation.

Template H2 berikut hanya boleh diisi dari manifest/hash yang sudah disetujui dan
dijalankan pada gate mutation terpisah; jangan menyalin nilai placeholder:

```bash
sudo env \
  LOCK_BOOTSTRAP_CONFIRMATION=INSTALL_EXACT_W10D_BACKUP_LOCK_BOOTSTRAP \
  EXPECTED_INSTALLER_SHA256=<reviewed-installer-sha256> \
  EXPECTED_RULE_SHA256=<reviewed-rule-sha256> \
  RULE_SOURCE=<absolute-reviewed-source>/infrastructure/systemd/diis-backup-lock.conf \
  bash <absolute-reviewed-source>/infrastructure/deploy/install-w10d-backup-lock-bootstrap.sh
```

Hasil wajib memverifikasi hash rule, path canonical, owner/group, mode, dan bahwa
target bukan mountpoint terpisah. Kegagalan atau signal harus meninggalkan nol rule
atau directory yang dimiliki attempt tersebut.
Seluruh dependency jalur sukses, rollback, signal, dan verification (`cat`, `awk`,
`chown`, `mountpoint`, dan dependency lain) harus tersedia sebelum mutation pertama.

Cleanup hanya boleh menjalankan BuildKit-cache prune terfilter. Tidak ada image,
container, network, volume, atau system-wide prune. Sejak tepat sebelum command
prune, setiap timeout, signal, exit nonzero, target/persentase gagal, observability
gagal, no-touch drift, atau lock-release gagal adalah
`PARTIAL_IRREVERSIBLE ... no_retry=1`; operator wajib berhenti untuk investigasi.
Seluruh pre-mutation phase mempunyai deadline 5 menit dan setiap observasi eksternal
memiliki timeout. Waktu UTC dibaca ulang tepat sebelum `prune_started=1`; remaining
15 menit prune, kill grace, dan 5 menit postcheck harus masih muat di approved window
serta tidak menyentuh guard band scheduler backup. Expiry atau overlap berhenti
sebelum prune.

## Immutable pg-backup Runtime Gate

Runtime target dibangun hanya dari `infrastructure/docker/pg-backup.Dockerfile`.
Recipe tersebut mempertahankan PostgreSQL client beserta seluruh library-nya dari
exact `postgres:16.4-alpine3.20` digest dan menambahkan interpreter dari exact
`python:3.12-alpine3.20` digest. Build harus menjalankan validator strict dan
benar-benar mengeksekusi `pg_dump`, `pg_restore`, `psql`, serta `pg_isready`; sekadar
menemukan nama binary tidak cukup. Tidak ada `apk add`, package install saat startup,
download runtime tanpa version/checksum terpin, atau external Dockerfile frontend
yang dipilih dengan tag mutable.

Image hasil build harus dipublikasikan melalui gate supply-chain terpisah, direview,
dan diberikan ke Compose sebagai `PG_BACKUP_IMAGE=<registry>@sha256:<64-hex>` yang
exact. Nilai kosong membuat render gagal; tag tanpa digest ditolak lagi saat startup.
Gate publikasi juga harus mencatat exact local image ID `sha256:<64-hex>` dan
RepoDigest yang memuat digest reference tersebut; reference dan ID menjadi satu
pasangan approval yang tidak dapat dipertukarkan.
Validator dan helper observasi dipasang read-only pada path `/scripts` dan semua
operator production-bound menolak selector path dari environment sebelum preflight.
Build lokal, render Compose, atau hash source bukan approval publish, deploy,
commissioning, scheduler, backup, maupun restore.

## Candidate dan Scheduler Handoff

Candidate hanya dibuat melalui `infrastructure/deploy/create-w10d-backup-candidate.sh`.
Launcher itu mewajibkan attempt ID, project Compose attempt-specific, physical tool
volume baru, exact MinIO source volume, shared `BACKUP_LOCK_HOST_PATH`,
`EXPECTED_CANDIDATE_IMAGE=<name>@sha256:<64-hex>`, dan
`EXPECTED_CANDIDATE_IMAGE_ID=sha256:<64-hex>`. Launcher memverifikasi local image ID
sebelum Compose, lalu membandingkan reference dan image ID container aktual dengan
pasangan yang sama. RepoDigest tetap diverifikasi pada supply-chain/handoff gate. Base
image PostgreSQL bukan candidate image. Render
tanpa kedua binding volume harus gagal; `docker_backup_bin` legacy tidak boleh
dipasang, ditulis, direcreate, atau dihapus. Startup candidate hanya memverifikasi
bucket existing; scheduler, bucket creation, dan retention apply seluruhnya tetap
mati. Manual run pertama tetap di bawah host lock deployment.

Setelah manual backup, independent crypt retrieval, DB restore, object restore,
root-cron classification, serta cleanup lulus, operator membuat private acceptance
bundle mode `0600`. Bundle harus mengikat seluruh runtime contract: container ID,
entrypoint, command, working directory, user, restart policy, network mode/names,
exact full mount set, exact environment-name set, hash seluruh environment values,
attempt/role identity labels, dan full label hash. Bundle juga mengikat exact
base/candidate Compose, runtime-manifest helper, dan tool-capture script dari
reviewed SHA; tool volume wajib membawa attempt ID yang sama. Runtime manifest v5
juga mengekspose hanya safe recovery bindings: empat flag safety, lock path,
provider `google`, origin `provider-default`, off-site fingerprint, hash Shared
Drive/root, auth mode, dan empat hash identity/artifact. Acceptance v6
membandingkan nilai aktual ini dengan evidence; hash seluruh
environment saja tidak dianggap cukup.

Seluruh evidence acceptance harus berupa file owner root mode `0600` di parent
root-owned `0700`. Validator membaca setiap file satu kali dengan no-follow,
menulis byte yang sama secara exclusive ke snapshot privat, memeriksa expected
bundle hash di dalam validator, lalu handoff mengulang hash snapshot tepat sebelum
mutation. Manual completion dan sidecar memakai parser strict yang sama dengan
preflight, dan bundle mengikat hash kedua file serta producer exit code `0`.
Completion mewajibkan table count positif, `studentCount <= userCount`, dan
`targetFreeBytes <= targetTotalBytes`. Klaim projected percentage yang tidak dapat
dihitung ulang dari field completion dihapus; projection tetap tersedia pada
telemetry yang memiliki input perhitungannya. Database restore proof v3 membawa
ketiga exact count hasil query dan acceptance mewajibkan equality dengan completion.

Jalankan `capture-w10d-candidate-tool-evidence.sh` untuk membuat tool evidence dari
byte aktual `mc`, `rclone.zip`, dan executable `rclone` beserta versi ter-normalisasi.
Schema v3 mengekstrak exact `rclone-v1.70.3-linux-amd64/rclone` dari archive
ber-checksum terpin dan mewajibkan hash entry itu sama dengan executable aktual;
kesamaan versi saja tidak cukup.
`w10d-backup-scheduler-handoff.sh` merekam ulang evidence tersebut tepat sebelum
mutation dan menuntut byte-for-byte match. Changed command, extra mount/network,
environment drift, label drift, tool hash, atau version drift menahan handoff.

Handoff memverifikasi hash bundle,
menahan host lock, membekukan dua daemon sebelum crontab berubah, lalu memindahkan
authority menjadi tepat satu scheduler. Container legacy tidak dihapus; ia
di-rename dan dihentikan sebagai rollback exact. Signal/kegagalan memulihkan cron
legacy, mematikan cron candidate, dan melarang retry tersembunyi. Cleanup legacy
hanya boleh dilakukan pada gate terpisah setelah rollback window berakhir.

## Batas Kapasitas Gate 0

Hard budget lokal wajib tepat `4015794422` bytes (3,74 GiB). Nilai lain ditolak.
Preflight mencadangkan 65.536 byte metadata di luar estimasi dump. Setelah
retention dan telemetry ditulis, total MinIO diukur ulang; pelampauan membatalkan
hanya recovery point baru, memulihkan telemetry sebelumnya, dan menggagalkan run.
Sebelum write, engine mengukur:

1. filesystem temporary backup;
2. volume MinIO tujuan yang benar melalui mount read-only;
3. aggregate object backup yang sudah ada;
4. estimasi database saat itu.

Masing-masing target harus memiliki sedikitnya tiga kali estimasi dan tetap
minimal 25% bebas setelah operasi. Target yang tidak dapat diobservasi adalah
failure, bukan alasan untuk melewati guard. Commissioning production juga wajib
mereclaim sedikitnya 6,49 GiB agar baseline mencapai sasaran 30% bebas.

Readonly summary schema v3 mengobservasi completion target dan dump legacy secara
terpisah. Inventory ditangkap status-preserving ke temporary directory privat dan
dihentikan pada batas 1 MiB sebelum dibuffer; setiap marker target dibaca dengan
batas 128 KiB dan sidecar 4 KiB, lalu parser
menolak duplicate/unknown/missing key, tipe ambigu termasuk bool-as-int, timestamp/
backup ID yang tidak konsisten, status/provenance tidak complete, checksum sidecar
yang tidak cocok, object count/status yang tidak konsisten, dan read failure. Marker
baru dihitung setelah seluruh validasi lulus. State yang diterima untuk capacity
preservation hanya:

- `target-complete`: completion target lebih dari nol dan legacy nol;
- `legacy-observed`: completion target nol dan legacy lebih dari nol;
- `transition-observed`: keduanya lebih dari nol.

State empty, command error, malformed count/hash, missing container, aggregate nol,
atau klasifikasi ambigu wajib nonzero dan tidak boleh menulis success JSON ke stdout.
Output sukses tunggal baru ditulis setelah seluruh validasi akhir dan hanya memuat
count, aggregate byte, state/reason, path-set hash, serta sorted manifest/sidecar
content-set hash. Seluruh temporary capture wajib terhapus sebelum success. Legacy tidak pernah diubah
menjadi completion marker.

## Artefak Satu Restore Point

| Artefak                    | Fungsi                                         |
| -------------------------- | ---------------------------------------------- |
| `<backupId>.dump`          | PostgreSQL custom-format archive               |
| `<backupId>.sha256`        | checksum archive                               |
| `<backupId>.objects.tsv`   | set object exact dan mapping content-addressed |
| `<backupId>.complete.json` | validity boundary dan safe aggregate           |

Marker `*.local.json` adalah titik degraded yang belum selesai off-site dan tidak
boleh dipakai sebagai backup valid.

## Alur Harian Target

1. Ambil owner lock dengan boot ID, PID, dan process start time. Directory tanpa
   owner lengkap selalu ambigu dan tidak boleh direclaim. Owner hidup
   menolak writer kedua; owner mati direclaim secara atomik.
2. Jalankan capacity guard pada temporary storage dan volume MinIO tujuan,
   termasuk reserve metadata tetap dan aggregate existing backup.
3. Inventaris object dibuat canonical sebelum dump.
4. Buat `pg_dump --format=custom`, validasi `pg_restore --list`, checksum, ukuran,
   dan safe counts.
5. Unggah dump dan sidecar ke MinIO lokal, unduh kembali keduanya, lalu cocokkan
   byte, ukuran, dan SHA-256.
6. Salin dump serta setiap object ke encrypted independent provider. Object
   disimpan sebagai blob content-addressed dan dipetakan oleh manifest per backup.
7. Ulangi inventory dan hash sumber setelah copy. Perubahan selama snapshot
   membatalkan seluruh run.
8. Unduh kembali dump, sidecar, manifest, dan setiap blob off-site untuk validasi.
9. Terbitkan completion manifest terakhir, lalu jalankan retention tervalidasi.
10. Terbitkan telemetry PII-safe ukuran, growth 7/30 hari, free space,
    days-to-full, status off-site, dan umur restore proof. Ukur ulang total aktual
    sebelum `BACKUP_COMPLETE`; pelampauan wajib cleanup sempit dan fail-closed.

Semua subprocess read-only yang memengaruhi keputusan memakai capture dengan
deadline, byte cap, producer exit status, pipe EOF, dan process-group absence.
Direct producer exit tidak dianggap sukses selama descendant masih mempertahankan
stdout. Health/migration Docker probe dan locked pre-prune summary memakai batas
waktu yang sama; timeout menghapus partial output dan melepaskan writer lock.

## Retensi dan Protected Pre-change

- Lokal: tiga daily valid terbaru; `pre-change:protected` tidak dihitung sebagai
  daily dan tidak boleh dihapus oleh retention biasa.
- Off-site: 14 daily, 8 weekly, dan 12 monthly.
- Titik protected tetap hidup tanpa batas sampai rekonsiliasi selesai dan release
  marker eksplisit diterbitkan.
- Release hanya melalui `release-prechange-backup.sh` dengan backup ID,
  reconciliation reference PII-safe, dan confirmation exact.
- Retention off-site default dry-run; deletion baru berlaku dengan
  `OFFSITE_RETENTION_APPLY=1` pada commissioning yang disetujui.
- Completion marker dihapus lebih dulu. Interupsi hanya boleh meninggalkan orphan
  payload, tidak boleh meninggalkan false-valid restore point.

Contoh pre-change setelah gate terpisah disetujui:

```bash
MANUAL_PRECHANGE_CONFIRM=CREATE_PROTECTED_PRECHANGE_BACKUP \
  bash scripts/backup-db.sh
```

## Restore Rehearsal Disposable

Target harus dibuat khusus, diberi label berikut, dan hanya terhubung ke satu
network terisolasi:

```text
com.diis.restore-target=disposable-v1
com.diis.restore-data-path=/var/lib/postgresql/data
com.diis.restore-network=isolated-v1
```

Jalankan dari direktori privat setelah target diverifikasi:

```bash
POSTGRES_CONTAINER=diis-restore-disposable-<run> \
POSTGRES_USER=postgres \
DUMP_FILE=/private/<backupId>.dump \
CHECKSUM_FILE=/private/<backupId>.sha256 \
MANIFEST_FILE=/private/<backupId>.complete.json \
PROVENANCE_FILE=/private/<backupId>.offsite-provenance.json \
RESTORE_PROOF_OUTPUT=/private/restore-proof.json \
RESTORE_LOCK_DIR=/private/restore.lock \
  bash scripts/restore-drill.sh
```

Script menolak `smk-postgres`, nama/label/network staging atau production, target
tanpa marker, target multi-network, dan filesystem data target yang tidak dapat
diobservasi. Proof bulanan baru boleh diterbitkan setelah review terpisah memakai
`scripts/publish-restore-proof.sh`.

## Monitor n8n Target

Workflow `DIIS Backup Completion Monitor` tetap inactive sampai commissioning.
Setelah aktif melalui gate terpisah, ia membaca tepat
`postgres/monitor/latest.json` dengan credential read-only dan menghasilkan reason
code untuk stale completion, telemetry invalid, kapasitas rendah, days-to-full
pendek, off-site incomplete, atau restore proof hilang/gagal/kedaluwarsa.

Kanal notifikasi yang kosong harus dilaporkan `disabled`; keadaan itu bukan sukses
pengiriman alert.

## Larangan dan Fail-closed

- Tidak ada scheduler kedua, host cron kedua, atau `rclone sync`.
- Tidak ada credential, token, connection string, atau konfigurasi rclone di Git
  maupun laporan.
- Tidak ada restore drill pada cluster, container, volume, atau network aplikasi.
- Tidak ada `DROP SCHEMA`, replay SQL parsial, atau write ke database aktif.
- Tidak ada klaim operasional sebelum exact-SHA commissioning, restore proof,
  cleanup, telemetry, dan independent review lulus.

Checksum, archive list, capacity, lock, local/off-site copy-back, manifest,
safe-count reconciliation, telemetry, atau cleanup yang gagal wajib menghentikan
run. Pertahankan recovery evidence dan newest valid backup; jangan melakukan retry
atau perbaikan ad hoc tanpa investigasi.

Creator cleanup tidak boleh mengubah error menjadi success. Partial candidate
creation harus membuktikan exact container dan attempt tool volume absent lewat
observasi Docker yang sukses. Sebelum create, listing exact juga wajib membedakan
absent, present, dan observation error. Error daemon/permission/transient menjadi
`CANDIDATE_PRECREATE_OBSERVATION_AMBIGUOUS retry=prohibited` sebelum Compose
mutation. Kegagalan remove atau observasi setelah create menghasilkan
`CANDIDATE_CLEANUP_AMBIGUOUS retry=prohibited`; jangan menjalankan attempt baru.

## Hetzner Recovery Layers

Lapisan ini berbeda dan tidak boleh disamakan:

- server deletion protection melindungi penghapusan server;
- tujuh slot Backup adalah image berotasi yang tetap terikat pada server/provider;
- individual Backup tidak memiliki protection flag;
- image Backup terpilih harus dikonversi secara eksplisit menjadi Snapshot sebelum
  Snapshot hasil konversi dapat diberi protection;
- restore image hanya ke satu server temporary yang terisolasi dan disposable;
- independent recovery tetap memakai encrypted application backup database/object
  di Google Shared Drive.

Hetzner Backup/Snapshot bersifat crash-consistent pada lapisan image kecuali proses
aplikasi dibekukan dengan prosedur lain; ia bukan bukti application-consistent dan
tidak menggantikan restore database serta exact object set. Konversi, protection,
temporary server, dan destruction semuanya adalah provider mutation gate terpisah.
