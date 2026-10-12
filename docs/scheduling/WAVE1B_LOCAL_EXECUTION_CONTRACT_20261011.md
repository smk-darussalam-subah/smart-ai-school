# Wave 1B — impor draft lokal terkonsolidasi

Persetujuan langsung user 11 Oktober 2026: perbaikan kompresi/penghubung draft dan P2-LS-R04; validasi dahulu, lanjut wave, **tanpa Git gate**, kemudian kandidat dapat dipaketkan bersama. Persetujuan tambahan: **“Setujui Wave 1B lokal lengkap”**, untuk metadata IMPORT additive dan parser XLSX API versi yang sudah digunakan DIIS. Tidak mengizinkan jadwal aktif, worker, publish, Git, staging atau production berubah.

Checkout: `smart-ai-school-staging-learner-schedule-fix-20261010`, HEAD `d66ae2fb2cd09ebc146520aee5b0b69c5d6221ff`. Semua delta masih working tree.

## Ruang lingkup

- Memperbaiki respons terdekompresi yang masih membawa header kompresi/ukuran lama, serta forward header idempotency yang diizinkan saja.
- Membawa status data anak ready/empty/denied/error ke komponen orang tua. Error/denied tidak berarti anak belum punya kelas dan tidak menampilkan identitas cache.
- CSV UTF-8 dan XLSX tanpa formula, maksimum 512 KiB, 1.000 baris data, 32 kolom, 10 sheet, header pada baris 1–20. Tidak meningkatkan body ceiling Fastify global. Total JSON tetap tunduk pada batas transport.
- Pembacaan sheet/header/delimiter eksplisit, pemetaan kolom serta alias → UUID TeachingAssignment eksplisit, tanpa fuzzy matching atau membuat master baru. UUID penugasan mencakup kelas, mapel, guru/komponen kompetensi.
- Inspect/catalog/preview memakai read-only transaction dan SkipAudit hanya pada handler tersebut; preview tidak membuat upload/job/audit/receipt/token persisten.
- Commit memeriksa ulang file, scope, data live, hari sekolah, dan preview digest setelah domain/cutover/authority locks. Digest hanya binding perubahan, bukan izin/sertifikat.
- Root IMPORT, semua slot, provenance hash minimal, domain audit dan receipt disimpan dalam satu transaksi. Replay terikat actor/operation/key/body dan memeriksa authority/flag baru sebelum ack histori.
- API khusus SUPER_ADMIN dengan permission foundation yang sudah ada, tanpa role/grant tambahan. Dua flag exact opt-in: SMART_SCHEDULER_ENABLED dan SMART_SCHEDULER_IMPORT_ENABLED; default off.
- Panel tambahan pada halaman jadwal, bukan pengganti matriks/bel; akses halaman tidak mengaktifkan fitur API. Periode UI awal mengikuti semester aktif; API menerima periode terdaftar lain. Pratinjau tidak menganggap fasilitas/availability telah lengkap.

## Invarian sekolah

JP mengikuti profil bel per occurrence, bukan angka/durasi hardcode. Komponen produktif berbeda guru tidak digabung/dihapus. Overlap baru, class collision, perluasan atau pengecualian expired tidak diperbolehkan. Baseline resmi yang lengkap dan persis dapat dipertahankan. Kapasitas komputer, zona/alat bengkel TKR, kesiapan TSM dan availability tetap NOT_VERIFIED; tidak ada klaim kelayakan solver/publish.

## Acceptance

| ID | Pemeriksaan wajib |
|---|---|
| B01 | Dua flag default off, guards fail-closed, fresh authority kedua urutan lock dan replay |
| B02 | File/ZIP/XML/encoding/kolom/row ceilings, formula/external/macro/encryption/sparse/bomb refusal |
| B03 | Semua baris diperiksa, unknown/blank/duplicate/malformed tidak disembunyikan |
| B04 | Pemetaan penugasan eksplisit, scope/JP/overlap/coverage/pre-existing exception validator digunakan ulang |
| B05 | Inspect/catalog/preview valid/invalid/error zero-write di seluruh tabel; DB menolak injected write |
| B06 | Perubahan input/bel/pemetaan/hari setelah preview menolak commit tanpa partial save |
| B07 | Commit/replay/konflik key atomik, audit/receipt failure rollback semua slot/root |
| B08 | MANUAL lama tetap valid; IMPORT memerlukan provenance; histori operasional byte-identik |
| B09 | Real browser component mobile/tablet/desktop, light/dark, keyboard/touch, error/retry, preview invalidation |
| B10 | Regresi Web, focused API, dua tanggal PostgreSQL, build/type-check/lint, manifest working-tree, staged 0 |

## Batas wave gabungan

Kandidat ini menggabungkan hotfix, closure P2-LS-R04, Wave 1B, dan bagian UI impor yang semula menunggu wave UI. **Bukan** Wave 2 structured-facility/availability, Wave 3 CP-SAT/worker, Wave 4 wizard solver penuh, atau Wave 5 publish/repair. Wave tersebut memerlukan kontrak/schema/dependency atau runtime approval tersendiri; tabel/worker/solver tidak dibuat sebagai efek samping.

## Arah UI (ekstensi, bukan dunia visual baru)

Operate; pewarisan UI jadwal DIIS. Palet slate/white dan blue-600 untuk tindakan utama, amber untuk coverage belum lengkap, red untuk error, emerald hanya ack draft. Font mengikuti aplikasi; body 14px desktop, input 16px mobile agar tidak zoom; kontrol minimal 44px.

Panel disclosure membuat matriks aktif tetap dominan. Urutan nyata: sumber/scope → baca → petakan → validasi → konfirmasi draft. Tabel lebar hanya scroll di kontainernya; page tidak overflow. Mengubah file/kolom/alias/scope membatalkan hasil dan konfirmasi lama. Retry commit memakai key yang sama; user tidak diberi tombol publish/generate palsu.

## Verifikasi dan tindak lanjut

PostgreSQL hanya target baru task-owned `diis-wave1b-proof-20261011`, loopback `127.0.0.1:55443`, database prefix `diis_wave1b_`. Tidak memakai .env, migrate reset, seed penuh, clone production atau menghapus DB bukti. Fixture browser memakai komponen nyata dan transport/navigation sintetis; tidak diklaim JWT atau authenticated staging E2E.

Rekomendasi model untuk tindak lanjut
Task berikutnya: reviewer independen memeriksa kandidat gabungan source lokal beserta manifest dan bukti bound, tanpa Git/runtime mutation.
Model / effort: GPT-5.6 Sol (`gpt-5.6-sol`) / high.
Alasan: parser untrusted, metadata migration, zero-write preview, serta authority/idempotency lintas transaksi membutuhkan semantic review.
Syarat kualitas: buktikan rollback/dua lock order dan no operational writes; cocokkan manifest final, bukan HEAD saja.
Sesi laporan ini: model/effort aktual tidak terverifikasi.
