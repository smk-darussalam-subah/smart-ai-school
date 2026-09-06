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
- Exact backing remote/prefix yang dibaca dari konfigurasi crypt, effective backend
  type, provider identity, origin publik non-secret, dan mode enkripsi diikat ke
  `OFFSITE_CONFIG_FINGERPRINT` SHA-256 hasil review.
- Untuk backend `drive`, fingerprint yang sama juga wajib mengikat SHA-256
  non-secret dari exact `team_drive`, `root_folder_id`, auth mode, principal,
  project, key identity, dan seluruh byte artifact credential. Nilai kosong,
  tertukar, atau berubah setelah approval ditolak sebelum write. Rotasi key selalu
  menghasilkan fingerprint baru dan membutuhkan commissioning review baru.
- Backend `drive` hanya menerima dedicated Google Service Account file pada exact
  mount `/run/diis-secrets/google-service-account.json`, mode host `0600`, dan mount
  container read-only. Default/shared client, OAuth `token`, `client_id`,
  `client_secret`, inline `service_account_credentials`, impersonation, serta domain
  user delegation ditolak. Parser hanya menghasilkan hash non-secret; raw JSON,
  email, project, key ID, dan private key tidak masuk log/evidence.
- `OFFSITE_EXPECTED_PROVIDER` dan `OFFSITE_EXPECTED_ORIGIN` berasal dari
  commissioning terpisah. Custom endpoint wajib HTTPS, FQDN publik, cocok persis
  dengan origin yang disetujui, serta bukan IP literal, loopback, RFC1918,
  link-local, IPv6 lokal, `.local`, `.internal`, atau namespace privat lain.
  Provider tanpa custom endpoint memakai nilai origin `provider-default`.
- Pada candidate Google, kedua nilai itu wajib tampil sebagai safe binding aktual
  `google` dan `provider-default` di runtime manifest v5, acceptance v6, direct
  candidate verification, serta final handoff pre-mutation check. Missing/wrong
  provider atau origin menghentikan alur sebelum scheduler mutation.
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
2. Untuk Drive, Director menyetujui dedicated Service Account berizin minimum pada
   destination exact. Admin Google harus memberi attestation eksternal bahwa Domain
   Wide Delegation dan impersonation tidak dikonfigurasi; isi JSON key saja tidak
   dapat membuktikan hal ini. Pasang key melalui kanal secret-managed pada path dan
   mode exact, jangan simpan di Git atau laporan.
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
Pembacaan marker dibatasi 4 KiB dan 30 detik melalui bounded capture. JSON wajib
memiliki exact schema tanpa key duplikat atau field tambahan. Marker kosong/malformed
menahan backup sebagai error; marker yang tidak dapat diobservasi atau melebihi batas
tetap mempertahankan protected point dan menghasilkan status `RELEASE_MARKER_UNAVAILABLE`.

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
`OFFSITE_EXPECTED_ROOT_FOLDER_SHA256`, `OFFSITE_EXPECTED_AUTH_MODE=service-account-file`,
`OFFSITE_EXPECTED_PRINCIPAL_SHA256`, `OFFSITE_EXPECTED_PROJECT_SHA256`,
`OFFSITE_EXPECTED_KEY_IDENTITY_SHA256`, dan
`OFFSITE_EXPECTED_CREDENTIAL_ARTIFACT_SHA256`. Artifact harus tersedia pada exact
mount read-only. Script mengunduh tepat dump, sidecar, completion, dan object manifest
untuk satu backup ID, memverifikasi hash/ukuran, serta menulis provenance
`source=independent-crypt`. Path MinIO lokal bukan fallback dan wajib menjadi
negative control pada acceptance bundle.

Download memakai `umask 077`. Pada copy, checksum, signal, atau publication
failure, seluruh exact candidate/final plaintext dan lock harus dihapus serta
absence diverifikasi. Jika remove atau observasi gagal, status wajib
`OFFSITE_RESTORE_PLAINTEXT_CLEANUP_AMBIGUOUS retry=prohibited`; hentikan recovery
dan jangan mengulang attempt.

Destination wajib kosong selain marker
`.diis-disposable-restore-target-v3`. Marker strict ini mengikat attempt, exact
source remote/provider/origin/config fingerprint serta hash backing remote aktual,
exact target parent/remote/provider/origin/config fingerprint, exact target, dan satu
`authoritySha256` hasil approval. Create, restore, dan cleanup memakai validator
authority canonical yang sama. Sebelum mutasi, ketiganya membaca konfigurasi crypt
source dan backing source ke private capture terpisah dengan batas 64 KiB/30 detik,
memvalidasi cardinality field, dan menghitung ulang fingerprint commissioning.
Unavailable, malformed, atau backing/prefix drift berhenti sebelum `mkdir`, copy,
atau purge. Remote name source, backing, dan target wajib berbeda;
backend target `local`, `crypt`, atau `alias`, fingerprint yang sama, serta pasangan
provider+origin yang sama dengan source selalu ditolak. Source tidak menyediakan
pengecualian otomatis untuk failure domain yang sama.

`OBJECT_TARGET_EXPECTED_CONFIG_FINGERPRINT` adalah SHA-256 atas byte bounded
`rclone config show <target-remote>` yang direview tanpa mencetak isinya.
`OBJECT_TARGET_EXPECTED_AUTHORITY_SHA256` adalah hash canonical per-attempt dari
seluruh binding source dan target di atas. Keduanya berasal dari decision packet,
bukan dihitung bebas oleh command eksekusi. Gunakan manifest dan completion dari
backup ID yang sama:

Inventory parent/target dan marker disposable harus dibaca melalui private bounded
capture. Overflow, timeout, producer nonzero, duplicate marker key, atau kegagalan
post-purge/post-restore observation tidak boleh menjadi bukti kosong/sukses; setelah
mutation statusnya adalah explicit ambiguous/no-retry sampai diinspeksi terpisah.

```bash
OFFSITE_CRYPT_REMOTE=<approved-crypt-remote>:<prefix> \
OFFSITE_CONFIG_FINGERPRINT=<approved-source-fingerprint> \
OFFSITE_EXPECTED_PROVIDER=<approved-source-provider> \
OFFSITE_EXPECTED_ORIGIN=<approved-source-origin> \
OBJECT_TARGET_EXPECTED_PROVIDER=<approved-target-provider> \
OBJECT_TARGET_EXPECTED_ORIGIN=<approved-target-origin> \
OBJECT_TARGET_EXPECTED_CONFIG_FINGERPRINT=<approved-target-config-fingerprint> \
OBJECT_TARGET_EXPECTED_AUTHORITY_SHA256=<approved-per-attempt-authority-sha256> \
OBJECT_TARGET_CREATE_CONFIRMATION=CREATE_EXACT_DISPOSABLE_OBJECT_RESTORE_TARGET \
  sh scripts/prepare-object-restore-target.sh <attemptId> <isolated-parent-remote>:

OFFSITE_CRYPT_REMOTE=<approved-crypt-remote>:<prefix> \
OFFSITE_CONFIG_FINGERPRINT=<approved-source-fingerprint> \
OFFSITE_EXPECTED_PROVIDER=<approved-source-provider> \
OFFSITE_EXPECTED_ORIGIN=<approved-source-origin> \
OBJECT_RESTORE_TARGET_PARENT=<isolated-parent-remote>: \
OBJECT_RESTORE_ATTEMPT_ID=<attemptId> \
OBJECT_RESTORE_TARGET=<isolated-parent-remote>:/<attemptId> \
OBJECT_TARGET_EXPECTED_PROVIDER=<approved-target-provider> \
OBJECT_TARGET_EXPECTED_ORIGIN=<approved-target-origin> \
OBJECT_TARGET_EXPECTED_CONFIG_FINGERPRINT=<approved-target-config-fingerprint> \
OBJECT_TARGET_EXPECTED_AUTHORITY_SHA256=<approved-per-attempt-authority-sha256> \
OBJECT_RESTORE_PROOF_DIR=/private/object-restore-proofs \
OBJECT_RESTORE_CONFIRMATION=RESTORE_EXACT_OBJECT_SET_TO_DISPOSABLE_TARGET \
  sh infrastructure/docker/scripts/restore-objects.sh \
  /private/<backupId>.offsite-provenance.json \
  /private/<backupId>.complete.json \
  /private/<backupId>.sha256 \
  /private/<backupId>.objects.tsv

OFFSITE_CRYPT_REMOTE=<approved-crypt-remote>:<prefix> \
OFFSITE_CONFIG_FINGERPRINT=<approved-source-fingerprint> \
OFFSITE_EXPECTED_PROVIDER=<approved-source-provider> \
OFFSITE_EXPECTED_ORIGIN=<approved-source-origin> \
OBJECT_TARGET_EXPECTED_PROVIDER=<approved-target-provider> \
OBJECT_TARGET_EXPECTED_ORIGIN=<approved-target-origin> \
OBJECT_TARGET_EXPECTED_CONFIG_FINGERPRINT=<approved-target-config-fingerprint> \
OBJECT_TARGET_EXPECTED_AUTHORITY_SHA256=<approved-per-attempt-authority-sha256> \
OBJECT_TARGET_CLEANUP_CONFIRMATION=DELETE_EXACT_DISPOSABLE_OBJECT_RESTORE_TARGET \
  sh scripts/cleanup-object-restore-target.sh <attemptId> <isolated-parent-remote>:

OFFSITE_RESTORE_CLEANUP_CONFIRMATION=DELETE_EXACT_DISPOSABLE_OFFSITE_RESTORE_INPUT \
  sh scripts/cleanup-offsite-restore.sh <backupId> /private/<attempt>
```

Script memverifikasi schema/header, manifest hash, setiap blob hash dan ukuran,
jumlah hasil, serta tidak adanya object tambahan. Mismatch sekecil apa pun menahan
recovery. Cleanup hanya menerima marker/ID milik attempt exact dan wajib
membuktikan prefix atau direktori temporary sudah kosong/hilang.
Direktori proof object wajib path absolut canonical, tanpa komponen symlink, mode
`0700`, dan dimiliki caller. Nama final selalu diturunkan source sebagai
`<backupId>.object-restore-proof.json`; `OBJECT_RESTORE_PROOF_OUTPUT` ditolak.
Final dan candidate wajib belum ada. Candidate dibuat exclusive/no-follow mode
`0600`, lalu dipublikasikan sebagai hard link no-replace pada filesystem yang sama
dan diverifikasi mode, owner, serta hash sebelum candidate dihapus. Seluruh
plaintext dan observasi config/marker privat harus terhapus serta absence-nya
terbukti sebelum success proof dipublikasikan.
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
Pada standalone cleanup, purge juga berjalan melalui bounded capture. Producer
nonzero, signal/late exit, partial purge, target yang masih terlihat, overflow,
parse failure, atau observation failure setelah purge dimulai selalu menghasilkan
status `74` dan `OBJECT_TARGET_CLEANUP_AMBIGUOUS ... retry=prohibited`.
Marker `OBJECT_RESTORE_TARGET_READY` dan `OBJECT_RESTORE_TARGET_REMOVED` hanya
ditulis satu kali dari EXIT finalizer setelah seluruh capture privat dihapus,
direktori observasi hilang, dan absence lokal terbukti. Kegagalan `rm`, `rmdir`,
atau absence proof tidak boleh mendahului maupun disertai marker sukses.

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

### Pemisahan kontrol Hetzner

Server deletion protection, rotating seven-slot Backup, Snapshot, dan Volume adalah
kontrol berbeda. Individual Backup tidak dapat diproteksi. Bila Director kelak
memilih satu Backup sebagai baseline, provider action yang benar adalah konversi
explicit Backup tersebut menjadi Snapshot, lalu aktifkan protection pada Snapshot
hasilnya. Satu temporary restore server harus terisolasi, memiliki destruction
boundary dan cost approval sendiri, lalu dibuktikan terhapus setelah drill.

Image provider bukan application-consistent backup dan tidak menggantikan encrypted
database dump serta exact object-manifest restore dari Shared Drive. Jangan mengubah
server protection, membuat Snapshot, membuat server, atau menghapus resource tanpa
gate provider terpisah.

## Custody Decision yang Masih Kosong

Source tidak mengikat nama individu. Sebelum C1, Director harus menyetujui dan
mengisi role/owner berikut di decision packet, tanpa memasukkan secret:

| Field keputusan | Nilai yang harus disetujui |
| --- | --- |
| Credential custodian | `<ROLE PENDING DIRECTOR DECISION>` |
| Crypt password/salt custodian | `<ROLE PENDING DIRECTOR DECISION>` |
| Break-glass envelope custodian | `<ROLE PENDING DIRECTOR DECISION>` |
| Recovery operator | `<ROLE PENDING DIRECTOR DECISION>` |
| Revocation/lost-access procedure owner | `<ROLE PENDING DIRECTOR DECISION>` |
| Rotation cadence | `<CADENCE PENDING DIRECTOR DECISION>` |
| Quarterly access review owner | `<ROLE PENDING DIRECTOR DECISION>` |

Minimum grant harus memiliki purpose, scope, owner, expiry/review date, dan prosedur
revocation. Password, salt, key, OAuth token, cookie, recovery code, atau isi
`rclone.conf` tidak boleh masuk chat, ticket, report, atau repository.

## Monthly Restore Evidence

Setiap bulan pilih satu completion secara deterministik dan buktikan custom dump,
checksum, archive list, marked disposable database restore, safe counts, exact
object restore, application read smoke, serta cleanup. Proof PII-safe memuat hanya
schema/status/timestamp dan baru dipublikasikan ke telemetry setelah review.

Kegagalan menahan commissioning/pilot. Jangan mengganti backup, menghapus titik
protected, atau mengulang recovery diam-diam.
