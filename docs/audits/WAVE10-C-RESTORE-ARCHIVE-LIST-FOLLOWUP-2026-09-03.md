# Wave 10-C Restore Archive List Follow-up

Tanggal: 2026-09-03
Peran: Executor
Baseline: `origin/develop@8f7a0a80980a296e7fcde58191247b69ed8eba9b`
Status: **SOURCE FOLLOW-UP COMPLETE - INDEPENDENT RE-REVIEW REQUIRED**

## Temuan Staging

Pada staging exact SHA `b26ef10072c12dc9e966792a2c9d7779a77f2d80`, concurrency
PostgreSQL lulus 3/3 tetapi restore arsip valid berhenti pada validasi archive
list. Akar masalah adalah pipeline berikut di bawah `set -o pipefail`:

```sh
pg_restore --list | grep -q .
```

`grep -q` berhenti setelah menemukan baris pertama. Untuk archive list yang
besar, writer dapat menerima `SIGPIPE`; pipeline lalu salah menilai arsip valid
sebagai gagal.

Tidak ada database shared staging atau production yang dimutasi. Target
PostgreSQL disposable, network, dan image test telah dibersihkan sebelum
follow-up source dibuat.

## Remediasi

- `pg_restore --list` wajib selesai dan exit `0` sebelum hasil diterima.
- Output ditulis ke file privat sementara dengan mode `0600`.
- File harus non-kosong dan selalu dibersihkan melalui success path maupun
  cleanup trap.
- Behavioral regression menghasilkan 5.000 baris archive list dan baru menulis
  completion marker setelah seluruh output terkonsumsi. Ini membuktikan
  validator tidak lagi memutus producer lebih awal.
- Kegagalan command `pg_restore --list` dan output list kosong ditolak sebelum
  `CREATE DATABASE`, menghasilkan proof `failed`, dan membersihkan file privat
  sementara.

## Verifikasi Executor

- Shell syntax `restore-drill.sh` dan `backup-contract.sh`: lulus.
- Backup contract Git Bash: 16/16 lulus.
- Backup contract WSL: 16/16 lulus.
- PostgreSQL disposable aktual:
  - 46/46 migration diterapkan;
  - concurrency last-Super-Admin 3/3 lulus;
  - custom-format archive dapat didaftar sampai selesai;
  - restore berhasil dengan rekonsiliasi 69 tabel, 0 user, dan 0 siswa pada
    fixture sintetis kosong;
  - database restore sementara terhapus setelah proof selesai.
- `git diff --check` dan cached diff check: lulus.
- Tidak ada container, network, volume, atau image disposable Wave 10 yang
  tertinggal.
- Secret-pattern scan: bersih.
- `shellcheck`: tidak tersedia pada Git Bash maupun WSL dan tidak diklaim
  lulus.

Binding source setelah seluruh verifikasi:

- `scripts/restore-drill.sh`:
  `61c1a3e5ce4dc02da2aa68b4594f24485ddd1227c573d7a53e01619923dded10`
- `infrastructure/docker/tests/backup-contract.sh`:
  `88d2d5d50325cae319340f87453d0046a55576dd2bdbd90574e8c6156b0f4fba`

Uji ini dijalankan pada Docker Desktop lokal terhadap target berlabel
`disposable-v1` di network berlabel `isolated-v1`. Tidak ada koneksi ke database
shared staging atau production pada pengulangan source proof ini.

## Manifest Literal

1. `docs/audits/WAVE10-C-RESTORE-ARCHIVE-LIST-FOLLOWUP-2026-09-03.md`
2. `infrastructure/docker/tests/backup-contract.sh`
3. `scripts/restore-drill.sh`

Gunakan staging eksplisit. `git add .` dan `git add -A` dilarang.

## Gate

Seluruh source proof Executor sudah lulus. Setelah independent source re-review
hijau, buat PR follow-up ke `develop`, promosikan ke staging, lalu ulang hanya
PostgreSQL restore dan cleanup matrix yang terdampak pada exact deployed SHA.

Main, production, credential, commissioning backup, identity cleanup, dan data
nyata tetap **HOLD**.
