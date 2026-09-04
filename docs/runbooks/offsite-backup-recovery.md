# Runbook Off-site Backup dan Provider Recovery

**Status:** `NOT ACTIVE / NOT COMMISSIONED`

Dokumen ini adalah target contract source. Credential, remote, provider,
retention apply, restore rehearsal, dan production recovery memerlukan approval
dan independent review terpisah.

## Kontrak Provider Independen

- Tujuan wajib `rclone crypt` dengan `filename_encryption=standard` dan
  `directory_name_encryption=true`.
- Backing remote harus berada pada provider/failure domain independen yang masuk
  allowlist commissioning. `local`, `crypt` bertingkat, alias, MinIO sumber,
  localhost, endpoint lokal, serta provider yang sama/terlarang ditolak.
- Effective backend type, provider identity, origin publik non-secret, dan mode
  enkripsi diikat ke `OFFSITE_CONFIG_FINGERPRINT` SHA-256 hasil review.
- Untuk backend `drive`, fingerprint yang sama juga wajib mengikat SHA-256
  non-secret dari exact `team_drive` dan `root_folder_id`. Nilai kosong,
  tertukar, atau berubah setelah approval ditolak sebelum write.
- `OFFSITE_EXPECTED_PROVIDER` dan `OFFSITE_EXPECTED_ORIGIN` berasal dari
  commissioning terpisah. Custom endpoint wajib HTTPS, FQDN publik, cocok persis
  dengan origin yang disetujui, serta bukan IP literal, loopback, RFC1918,
  link-local, IPv6 lokal, `.local`, `.internal`, atau namespace privat lain.
  Provider tanpa custom endpoint memakai nilai origin `provider-default`.
- Konfigurasi efektif boleh dibaca untuk validasi, tetapi tidak boleh dicetak atau
  dimasukkan ke evidence.
- Dump, sidecar, object manifest, dan completion memakai immutable `copyto`.
  `rclone sync` dilarang.

## Exact Historical Object Contract

Setiap backup menyimpan:

1. manifest canonical berisi header schema, SHA-256, ukuran, dan path yang
   di-encode untuk setiap object pada restore point;
2. blob immutable di `objects/blobs/<sha256>`;
3. manifest di `objects/manifests/<backupId>.objects.tsv`;
4. hash manifest dan jumlah object di completion manifest.

Set object divalidasi sebelum dan setelah dump/copy. Seluruh source object juga
dihash ulang setelah copy. Create, update, atau delete selama jendela snapshot
membatalkan run. Restore tidak membaca folder `current`; ia membuat destination
kosong dari manifest backup yang dipilih sehingga deletion historis tetap tepat.

## Commissioning Remote

1. Pilih akun/provider/region yang independen dari VPS, Hetzner, dan MinIO lokal.
2. Buat konfigurasi secret-managed berizin sempit di host; jangan simpan di Git.
3. Catat hanya fingerprint non-secret yang dihitung source dan cocokkan dengan
   nilai yang disetujui.
4. Uji remote unreadable, local/same-provider backing, perbedaan huruf provider,
   endpoint loopback/RFC1918/link-local/IPv6/internal, origin di luar allowlist,
   filename `off`, `obfuscate`, directory encryption mati, fingerprint salah,
   timeout, dan credential revoked. Seluruhnya harus gagal tanpa completion.
5. Uji dump/sidecar copy-back dan setiap object blob/manifest copy-back dengan
   hash penuh.
6. Uji tiga restore point: object dibuat, diperbarui/ditambah, lalu dihapus.
   Masing-masing harus memulihkan set persis sesuai manifest.
7. Tinjau retention dry-run sebelum mengizinkan apply.

## Protected Pre-change

Completion `class=pre-change` wajib memiliki `protectionState=protected`. Retention
tidak boleh menghapus dump, sidecar, object manifest, atau completion hingga marker
`database/releases/<backupId>.release.json` tersedia dan valid.

Marker release hanya dibuat setelah cohort/recovery direkonsiliasi, melalui script
resmi dan approval yang menyebut backup ID serta reconciliation reference PII-safe.
Shared content-addressed blob tidak dihapus oleh retention biasa; garbage
collection blob adalah prosedur terpisah agar backup lain tidak rusak.

## Restore Object Exact ke Target Disposable

Ambil seluruh input dari remote crypt yang disetujui—bukan MinIO lokal—ke
direktori baru mode `0700`:

```bash
OFFSITE_CRYPT_REMOTE=<approved-crypt-remote>:<prefix> \
OFFSITE_CONFIG_FINGERPRINT=<approved-fingerprint> \
OFFSITE_EXPECTED_PROVIDER=<approved-provider> \
OFFSITE_EXPECTED_ORIGIN=<approved-origin> \
  sh scripts/prepare-offsite-restore.sh <backupId> /private/<attempt>
```

Untuk Shared Drive, sertakan `OFFSITE_EXPECTED_TEAM_DRIVE_SHA256` dan
`OFFSITE_EXPECTED_ROOT_FOLDER_SHA256`. Script mengunduh tepat dump, sidecar,
completion, dan object manifest untuk satu backup ID, memverifikasi hash/ukuran,
serta menulis provenance `source=independent-crypt`. Path MinIO lokal bukan
fallback dan wajib menjadi negative control pada acceptance bundle.

Download memakai `umask 077`. Pada copy, checksum, signal, atau publication
failure, seluruh exact candidate/final plaintext dan lock harus dihapus serta
absence diverifikasi. Jika remove atau observasi gagal, status wajib
`OFFSITE_RESTORE_PLAINTEXT_CLEANUP_AMBIGUOUS retry=prohibited`; hentikan recovery
dan jangan mengulang attempt.

Destination wajib kosong selain marker
`.diis-disposable-restore-target-v1`. Gunakan manifest dan completion dari backup
ID yang sama:

```bash
OBJECT_TARGET_CREATE_CONFIRMATION=CREATE_EXACT_DISPOSABLE_OBJECT_RESTORE_TARGET \
  sh scripts/prepare-object-restore-target.sh <attemptId> <isolated-parent-remote>:

OFFSITE_CRYPT_REMOTE=<approved-crypt-remote>:<prefix> \
OBJECT_RESTORE_TARGET=<isolated-parent-remote>:<attemptId> \
OBJECT_RESTORE_PROOF_OUTPUT=/private/<backupId>.object-restore-proof.json \
OBJECT_RESTORE_CONFIRMATION=RESTORE_EXACT_OBJECT_SET_TO_DISPOSABLE_TARGET \
  sh infrastructure/docker/scripts/restore-objects.sh \
  /private/<backupId>.offsite-provenance.json \
  /private/<backupId>.complete.json \
  /private/<backupId>.objects.tsv

OBJECT_TARGET_CLEANUP_CONFIRMATION=DELETE_EXACT_DISPOSABLE_OBJECT_RESTORE_TARGET \
  sh scripts/cleanup-object-restore-target.sh <attemptId> <isolated-parent-remote>:

OFFSITE_RESTORE_CLEANUP_CONFIRMATION=DELETE_EXACT_DISPOSABLE_OFFSITE_RESTORE_INPUT \
  sh scripts/cleanup-offsite-restore.sh <backupId> /private/<attempt>
```

Script memverifikasi schema/header, manifest hash, setiap blob hash dan ukuran,
jumlah hasil, serta tidak adanya object tambahan. Mismatch sekecil apa pun menahan
recovery. Cleanup hanya menerima marker/ID milik attempt exact dan wajib
membuktikan prefix atau direktori temporary sudah kosong/hilang.
Final `rclone lsf` wajib selesai sukses sebelum count dihitung, termasuk untuk
`objectCount=0`; observation error tidak boleh berubah menjadi count nol atau
proof sukses.
Restore object memverifikasi copy melalui direktori `mktemp` mode privat dan trap
EXIT/HUP/INT/TERM. Copy/hash/size/proof failure harus meninggalkan nol plaintext
temporary; kegagalan cleanup dilaporkan sebagai
`OBJECT_RESTORE_PLAINTEXT_CLEANUP_AMBIGUOUS retry=prohibited`.

Jika marker creator gagal setelah prefix dibuat, automatic purge wajib diikuti
successful parent observation. Purge/observation failure adalah
`OBJECT_TARGET_CLEANUP_AMBIGUOUS retry=prohibited`, bukan absence proof.
Cleanup responsibility dimulai sebelum `rclone mkdir`, karena provider dapat
membuat partial prefix lalu mengembalikan error atau menerima signal.

## Kehilangan VPS atau Provider

1. Bekukan perubahan DNS/ingress dan buka incident record.
2. Provision replacement host/network deny-by-default dari image yang disetujui.
3. Pasang exact application SHA dan runtime artifacts terpin.
4. Pilih satu completion backup berdasarkan ID, checksum, manifest, dan review.
5. Pulihkan database serta object ke target replacement baru, bukan sumber.
6. Rekonsiliasi safe counts, migration, exact object set, synthetic login,
   authority, health, dan log redaction.
7. Minta approval cutover yang mengikat SHA, backup ID, target, dan waktu.
8. Setelah diterima, hapus server/volume/network/credential sementara dan buktikan
   billing berhenti.

Image atau Volume pada provider yang sama bukan independent off-site backup dan
tidak menggantikan dump database serta exact object manifest.

## Monthly Restore Evidence

Setiap bulan pilih satu completion secara deterministik dan buktikan custom dump,
checksum, archive list, marked disposable database restore, safe counts, exact
object restore, application read smoke, serta cleanup. Proof PII-safe memuat hanya
schema/status/timestamp dan baru dipublikasikan ke telemetry setelah review.

Kegagalan menahan commissioning/pilot. Jangan mengganti backup, menghapus titik
protected, atau mengulang recovery diam-diam.
