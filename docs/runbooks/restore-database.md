# Runbook Pemulihan Database DIIS

**Status source:** `NOT ACTIVE / NOT COMMISSIONED`

## Prinsip

1. Rehearsal hanya pada PostgreSQL disposable bertanda di satu network
   terisolasi. Cluster aplikasi production/staging selalu ditolak.
2. Recovery insiden memakai server/database replacement baru. Sumber insiden
   dipertahankan read-only atau diisolasi.
3. Hanya backup dengan dump, checksum, completion manifest, dan object manifest
   yang saling cocok boleh dipilih.
4. Cutover ingress/DNS memerlukan approval terpisah setelah rekonsiliasi.

## Preflight Rehearsal

- Catat exact application SHA, backup ID, image digest, dan approval.
- Buat container PostgreSQL disposable dengan label
  `com.diis.restore-target=disposable-v1` dan
  `com.diis.restore-data-path=/var/lib/postgresql/data`.
- Hubungkan hanya ke satu network berlabel
  `com.diis.restore-network=isolated-v1`.
- Jangan gunakan nama yang memuat `smk`, `production`, atau `staging`.
- Sediakan direktori privat existing mode `0700` untuk `RESTORE_PROOF_OUTPUT`.
- Jangan set `RESTORE_OWNERSHIP_FILE`. Script menurunkan file ownership sebagai
  direct child dari canonical proof directory privat yang sudah divalidasi; path
  arbitrer, absolute/traversal, dan symlink override ditolak sebelum mutasi.
- Pastikan dump tidak melebihi `4015794422` bytes.
- Gunakan hanya input yang telah dibuat oleh `prepare-offsite-restore.sh` dan
  memiliki provenance `source=independent-crypt`; path MinIO lokal ditolak
  sebagai sumber rehearsal off-site.

Script memeriksa kapasitas dari filesystem data PostgreSQL di dalam target,
bukan dari lokasi dump. Target harus memiliki ruang sedikitnya tiga kali dump dan
tetap minimal 25% bebas setelah restore. Kegagalan observability menghentikan run
sebelum `CREATE DATABASE`.

## Jalankan Rehearsal

```bash
POSTGRES_CONTAINER=diis-restore-disposable-<run> \
POSTGRES_USER=postgres \
DUMP_FILE=/private/recovery/<backupId>.dump \
CHECKSUM_FILE=/private/recovery/<backupId>.sha256 \
MANIFEST_FILE=/private/recovery/<backupId>.complete.json \
PROVENANCE_FILE=/private/recovery/<backupId>.offsite-provenance.json \
RESTORE_PROOF_OUTPUT=/private/recovery/restore-proof.json \
RESTORE_LOCK_DIR=/private/recovery/restore.lock \
  bash scripts/restore-drill.sh
```

Tidak ada default container. `smk-postgres`, target staging/production, target
tanpa label, target multi-network, network aplikasi, archive invalid, checksum
mismatch, dan kapasitas yang tidak dapat dibaca ditolak sebelum mutasi.

Restore memakai database unik `diis_restore_*`, `--exit-on-error`, dan
`--single-transaction`. Sebelum lock atau `CREATE DATABASE` dipanggil, script
mendaftarkan ownership cleanup sebagai direct child dari canonical proof
directory privat dan menyiapkan token lock yang exact. Karena itu signal/exit
setelah resource dibuat tetap masuk cleanup meskipun helper belum sempat
mengembalikan status ke caller. Cleanup selalu melakukan absence probe database
melalui `pg_database` dan probe exact lock path; kedua hasil harus `true`. Jika
drop, release, atau observasi gagal, script menulis
`RESTORE_DRILL_CLEANUP_AMBIGUOUS ... retry=prohibited` dan drill tetap gagal.
Proof sukses tidak boleh diterbitkan pada status ambiguous.

## Rekonsiliasi

Bandingkan dengan completion manifest:

- base table count;
- `auth.users` count;
- `student.students` count;
- archive list dan checksum;
- migration/constraint/index pada exact release;
- exact object set dari manifest;
- orphan dan referential-integrity checks yang berlaku.

Aggregate mismatch tidak boleh diperbaiki dengan SQL ad hoc.

## Restore Object

Pulihkan object memakai `restore-objects.sh` ke target disposable kosong yang
memiliki marker `.diis-disposable-restore-target-v1`. Script wajib memulihkan
set exact, memverifikasi setiap hash/ukuran, dan menolak object tambahan. Lihat
[Off-site Backup Recovery](offsite-backup-recovery.md).

Verifikasi object plaintext hanya boleh berada pada private `mktemp` directory
dengan `umask 077`. EXIT/HUP/INT/TERM, copy failure, hash/size mismatch, dan proof
publication failure wajib menghapus file/direktori tersebut dan membuktikan
absence. Status cleanup ambiguous adalah stop/no-retry condition.
Final target listing harus berhasil secara mandiri sebelum jumlah object dihitung;
aturan ini tetap berlaku untuk backup sah dengan `objectCount=0`.

## Publish Proof Bulanan

`restore-drill.sh` menolak sumber selain provenance `independent-crypt` sebelum
menyentuh target dan menulis proof PII-safe lokal yang terikat ke hash provenance:

```json
{ "schemaVersion": "diis-restore-proof-v2", "status": "success", "source": "independent-crypt", "sourceProvenanceSha256": "<sha256>", "createdEpoch": 0 }
```

Setelah independent review, publish dengan target container backup authoritative
dan confirmation exact:

```bash
PG_BACKUP_CONTAINER=smk-pg-backup \
RESTORE_PROOF_FILE=/private/recovery/restore-proof.json \
RESTORE_PROOF_PUBLISH_CONFIRMATION=PUBLISH_PII_SAFE_MONTHLY_RESTORE_PROOF \
  bash scripts/publish-restore-proof.sh
```

Publish melakukan upload dan copy-back byte comparison. Ini belum boleh dijalankan
sampai backup runtime serta credential MinIO commissioned.

## Recovery Production

Production recovery menggunakan replacement cluster/host yang tidak menerima
traffic. Terapkan exact SHA, pulihkan database/object, uji health, login sintetis,
authority fail-closed, read workflow, hash download, dan log redaction. Write smoke
hanya memakai fixture sintetis terinventarisasi.

Cutover harus mengikat target, SHA, backup ID, dan waktu. Jika health atau
rekonsiliasi gagal, hentikan write dan kembali ke target lama yang masih
dipertahankan. Jangan menjalankan restore kedua tanpa investigasi.

## Evidence dan Cleanup

Evidence hanya memuat backup ID, SHA/digest, ukuran, safe counts, status,
timestamp, approval, dan cleanup. Jangan memuat nama, surel, nomor telepon, UUID
internal, token, connection string, object path nyata, atau isi tabel.

Setelah acceptance, hapus database/container/server/network/file/credential
sementara secara terukur. Jangan pernah menghapus sumber insiden sebelum jendela
rollback berakhir.
