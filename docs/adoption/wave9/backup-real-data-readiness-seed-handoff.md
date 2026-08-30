# Handoff Backup dan Seed Readiness

## Tujuan

Menjamin latihan dapat direproduksi dan data nyata dapat dipulihkan tanpa mencampur fixture, credential, atau lingkungan.

## Backup

- Catat waktu, database, branch/SHA, migration count, dan checksum backup.
- Simpan backup pada lokasi yang dibatasi dan terenkripsi sesuai kebijakan sekolah.
- Lakukan restore ke database disposable, bukan menimpa shared staging atau production.
- Verifikasi jumlah data kunci, constraint, dan health setelah restore.

## Seed Sintetis

- Seed harus idempotent, PII-safe, dan memiliki prefix `QA`.
- Password dan token tidak boleh berada dalam Git atau laporan.
- Setiap fixture mempunyai owner dan cleanup command resmi.
- Seed tidak boleh mengubah production.

## Handoff

| Item | Bukti yang diserahkan |
| --- | --- |
| Baseline | SHA, tree, migration count, health |
| Backup | checksum, ukuran, waktu, lokasi terbatas |
| Restore | log teredaksi, post-count, health |
| Fixture | daftar entitas sintetis dan owner cleanup |
| Browser QA | matrix persona, viewport, console/network |
| Residual | risiko yang diterima dan prasyarat go-live |

## Stop Condition

Hentikan proses jika backup tidak dapat dipulihkan, periode ambigu, ownership tidak jelas, constraint gagal, atau evidence mengandung credential/PII.
