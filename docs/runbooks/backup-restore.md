# Runbook Backup dan Verifikasi Pemulihan DIIS

**Berlaku untuk source:** 2026-09-03

**Pemilik:** Operator infrastruktur

**Status:** `NOT ACTIVE / NOT COMMISSIONED`

## Current Verified Runtime

Source Wave 10 pada dokumen ini belum dideploy atau diaktifkan. Gate 0 terakhir
menemukan backup legacy berjalan pukul 19:00 WIB, disk host hanya 21,32% bebas,
belum ada salinan encrypted independent-provider, dan restore proof terbaru belum
mewakili bentuk production saat ini. Workflow n8n pada repository tetap
`active=false` dan credential monitor belum dikonfigurasi.

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

## Candidate dan Scheduler Handoff

Candidate hanya dibuat melalui `infrastructure/deploy/create-w10d-backup-candidate.sh`.
Launcher itu mewajibkan attempt ID, project Compose attempt-specific, physical tool
volume baru, exact MinIO source volume, dan shared `BACKUP_LOCK_HOST_PATH`. Render
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
reviewed SHA; tool volume wajib membawa attempt ID yang sama.

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

1. Ambil owner lock dengan boot ID, PID, dan process start time. Owner hidup
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
