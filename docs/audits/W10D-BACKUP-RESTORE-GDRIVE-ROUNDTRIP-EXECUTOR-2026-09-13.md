# W10-D Backup dan Restore Google Drive Round-trip Executor

Tanggal final follow-up: 2026-09-14 WIB

Status: `SOURCE FOLLOW-UP DAN SYNTHETIC ROUND-TRIP COMPLETE - INDEPENDENT RE-REVIEW REQUIRED`

Baseline source: `2d6d05313ec301dbf30929812193245d7d1153b5`

Baseline tree: `a624ee4ab494112bee6401960b6684af5e3dad2e`

## Ringkasan

Tiga finding independent review telah ditutup dalam satu follow-up:

1. stage MinIO Client sekarang memakai registry eksplisit
   `quay.io/minio/mc@sha256:a7fe349e...f11727`;
2. kontrak object nested sekarang menjalankan backup, membentuk manifest, menjalankan
   restore, memeriksa byte/hash dua file nested, mengabaikan directory entry, dan
   menolak invocation yang kehilangan salah satu flag wajib;
3. round-trip sintetis baru mempertahankan payload proof teredaksi dan tujuh receipt
   fase berantai SHA-256 sebelum cleanup.

Tidak ada build/tag/publication image D2. Tidak ada data produksi, staging, VPS,
n8n, scheduler, atau production yang disentuh.

## Source Closure

Manifest source tetap tepat 10 file:

1. `docs/runbooks/backup-restore.md`
2. `docs/runbooks/restore-database.md`
3. `infrastructure/docker/docker-compose.yml`
4. `infrastructure/docker/pg-backup.Dockerfile`
5. `infrastructure/docker/scripts/backup-lib.sh`
6. `infrastructure/docker/scripts/backup.sh`
7. `infrastructure/docker/scripts/offsite-replication.sh`
8. `infrastructure/docker/tests/backup-contract.sh`
9. `infrastructure/n8n/workflows/backup-daily.json`
10. `scripts/restore-drill.sh`

Aggregate SHA-256, dengan format canonical `<sha256><dua spasi><path><LF>`:

`3b05579d80ce4fb0fee028408d75ff2687480266da1111c14993ffbe7d0aac83`

Hash tiap file tersimpan pada evidence JSON. Hanya Dockerfile dan contract harness
yang berubah dibanding snapshot review sebelumnya; delapan file lain byte-identik.

### Supply chain

- Referensi unqualified `minio/mc@sha256:...` telah dihapus.
- Referensi Quay exact digest dapat di-resolve secara read-only dan menyediakan
  platform `linux/amd64`.
- Binary `/usr/bin/mc` dari stage itu tetap diverifikasi terhadap SHA-256 executable
  `01f866e9...12e891` sebelum image dapat selesai dibangun.
- Contract menolak bila referensi kembali unqualified.
- D2 image tidak dibangun, ditag, atau dipublikasikan pada gate ini.

### Nested object behavioral proof

Contract case membentuk:

- `media/2026/class-a/photo.bin`;
- `documents/reports/report.bin`;
- satu directory kosong yang bukan object.

Invocation actual diwajibkan memakai `--recursive --files-only`. Manifest harus
memiliki tepat dua record dan setiap path, byte count, serta SHA-256 dibandingkan ke
source. Restore canonical harus menghasilkan tepat dua file yang sama byte-for-byte.
Negative control tanpa `--files-only` dan tanpa `--recursive` sama-sama ditolak.

Full backup contract selesai `47/47 PASS`; jumlah test tidak dinaikkan secara palsu
karena static string-only case diganti behavioral case.

## Synthetic Drive Round-trip

Run sukses:

- backup ID `20260913T165516Z-338684`;
- provider Google Shared Drive sekolah melalui `rclone crypt`;
- filename encryption `standard` dan directory-name encryption aktif;
- PostgreSQL custom-format dump `3,767` byte;
- safe count sumber dan hasil restore: 3 tabel, 3 user sintetis, 2 siswa sintetis;
- dua object nested pulih dan cocok byte/hash;
- object `tmp/` tetap dikecualikan oleh kontrak.

Hash utama:

- dump: `a034f4da...d141494d`;
- completion: `c6231cbe...4fadbc53`;
- object manifest: `c5508d0a...1538c807`;
- provenance: `a54cd3ae...4c1773ab`;
- database restore proof: `62a16d12...ddf0b91`;
- object restore proof: `b7e00021...8a7c5bd`.

Credential tetap pada jalur privat Windows, hanya disalin sementara dengan mode
`0600`, tidak dicetak, dan tidak masuk evidence. Evidence hanya menyimpan SHA-256
artifact, authority fingerprint, dan hash ID target.

## Receipt dan Proof

Direktori evidence:

`docs/audits/W10D-BACKUP-RESTORE-GDRIVE-ROUNDTRIP-FOLLOWUP-RECEIPTS-2026-09-13`

Isinya tepat sembilan file:

1. `01-preflight.json`
2. `02-backup.json`
3. `03-offsite-fetch.json`
4. `04-postgresql-restore.json`
5. `05-object-restore.json`
6. `06-remote-and-resource-cleanup.json`
7. `07-local-cleanup.json`
8. `proof-payloads.json`
9. `manifest.json`

Setiap receipt memuat status, exit code, waktu UTC, safe facts, dan hash receipt
sebelumnya. Rantai dimulai dari digest domain tetap dan berakhir pada:

`f06a5ba06a791b418041d67184e0bf094d44cf448a82fac7ac5fdc9b1463459c`

Hash manifest receipt:

`ab0db74aea3a47033dcd8f9fb31af94f02142c0d2f4866032f73b05c23df7883`

Hash payload proof teredaksi:

`7ec65ce632ec0e52af9810c091ff1c4bd08531ab5e4abfacef90570b1651183e`

Validator independen lokal membuktikan `7/7` chain link cocok, seluruh hash manifest
cocok, dump/object hash konsisten lintas completion, provenance, database proof, dan
object proof, serta safe count cocok. Pemindaian bundle tidak menemukan pola private
key, email principal, token, client secret, crypt password, atau access key.

## Cleanup

- Prefix Drive sintetis exact: tidak ada setelah purge.
- Bounded parent inventory: kosong, SHA-256
  `e3b0c442...b855`.
- Database restore disposable: tidak ada setelah proof.
- Object restore target: tidak ada setelah proof.
- Plaintext restore input: tidak ada.
- Container dan network berprefix `diisw10d-`: tidak ada.
- Runtime `/tmp/diis-gdrive-roundtrip-*`: tidak ada.
- Secret mount `/run/diis-secrets`: tidak ada.
- Marker active-roundtrip lokal: tidak ada.

Credential Windows sengaja dipertahankan untuk gate berotorisasi berikutnya. Ini
bukan bukti custody acceptance atau commissioning.

## Transparansi Percobaan

Percobaan follow-up pertama mencapai backup dan dua restore, lalu berhenti
fail-closed saat exporter meminta field yang tidak ada pada schema object proof resmi.
Cleanup otomatis menghapus prefix Drive dan seluruh resource lokal. Partial receipt
percobaan tersebut dihapus secara terarah sebelum rerun agar paket final tidak
mencampur dua run.

Exporter kemudian diperbaiki hanya pada allowlist evidence, dari field yang tidak ada
menjadi `sourceProvenanceSha256` yang memang dimiliki proof canonical. Rerun sukses
di atas adalah satu-satunya run dalam receipt manifest final.

## Verifikasi Akhir

- Backup contract WSL/Linux: `47/47 PASS`.
- Bash syntax: PASS.
- Quay exact-digest manifest resolution: PASS.
- Nested backup/manifest/restore behavioral regression: PASS.
- Synthetic encrypted Drive round-trip: PASS.
- Receipt chain: `7/7 PASS`.
- Proof cross-binding: PASS.
- JSON parse: PASS.
- `git diff --check`: PASS.
- Added-diff dan evidence secret scan: PASS.
- Staged files: 0.
- Disposable runtime residue: 0.

Full application suite tidak diulang karena delta follow-up hanya menyentuh
Dockerfile supply-chain reference, focused contract behavior, dan evidence. Bukti
full suite sebelumnya tidak diklaim sebagai rerun.

## Manifest Review

Paket re-review aktual terdiri dari 21 path:

- 10 source/runbook paths;
- 1 Executor report ini;
- 1 evidence JSON;
- 9 files dalam receipt bundle.

Screenshot lama dipertahankan sebagai histori dan dikecualikan dari paket re-review
karena tidak merepresentasikan backup ID rerun. Laporan Independent Reviewer lama
tetap tidak diubah dan tidak dihitung sebagai output Executor.

## Gate Berikutnya

Berhenti untuk independent re-review sempit atas 21 path, source aggregate, contract
47/47, Quay resolution, proof payload, receipt chain, dan cleanup. Commit, push, PR,
D2 build/tag/publication, credential commissioning, n8n, scheduler, staging, VPS,
backup/restore operasional, serta production tetap HOLD.

## Model Advisor

Task berikutnya: independent re-review sempit atas source dan evidence follow-up.

Rekomendasi: GPT-5.6 Sol (`gpt-5.6-sol`) / high.

Alasan: review mengikat supply-chain availability, behavioral recovery regression,
credential-safe cloud receipts, dan cleanup lintas boundary. Eskalasi ke GPT-6 Astra
/ high hanya jika hash source, receipt chain, atau absence proof saling bertentangan.

Sesi laporan ini: model/effort aktual tidak diverifikasi.
