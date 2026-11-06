# DONE — Mixed725 three checkpoints, 4 November 2026

Status: SOURCE/FUNCTIONAL PASS terbatas pada CAP-04 dan deduplikasi request-local; CAPACITY725 NOT PASSED. INDEPENDENT REVIEW REQUIRED — GIT/STAGING/PRODUCTION/COMMISSIONING HOLD.

- CP1: kegagalan lookup authority menghasilkan 503 AUTHORITY_UNAVAILABLE; genuine deny tetap ditolak, exception aman dan transaksi rollback. Failing-before/passing-after pada Nest/Fastify produksi tersimpan.
- CP2: permission/role entry guard berbagi satu lookup dalam satu request melalui WeakMap. Request baru, identity lain, transaksi serta pemeriksaan setelah antre tetap membaca ulang. Query role autosave/heartbeat 700 menjadi350 pada diagnostic350 request. Latensi gabungan tidak membaik konsisten, sehingga tidak diklaim sebagai solusi725. Pool, concurrency, timeout dan ingress aplikasi tidak diubah pada checkpoint ini.
- CP3: API milestone efektif 2115 lulus, 482 skipped; enam batch Linux dan dua follow-up prerequisite, bukan satu proses hijau. Web 65/65, PostgreSQL aktual 151/151; dua counterexample antrean pada image standar lulus. Browser Guru32 dan siswa20 kontrol lulus pada build nyata dengan autentikasi sintetis.
- Dua full725 setara serta satu kontrol observer-off dijalankan, seluruh error awal/retry dan ledger dipertahankan. Setiap run mempertahankan350 jawaban akhir,350 Grade,360 durable outbox dan56.000JP tanpa duplikasi. Dispatch outbox tidak diterima. Kapasitas tetap belum lulus; lihat angka per endpoint/phase, 500/502/504,429/503 dan dropped/coalesced intents.
- Image API standar final: sha256:aafa9f304ea5c2c6d01a222160d052f615d55b8266a65bc39517cb8737368635;551 input builder cocok. Web image lama dipakai kembali dengan859 input runtime identik. Build memakai Dockerfile standar dan cache; bukan remote CI clean-install baru.

Laporan tunggal: ../output/mixed725-capacity-three-checkpoints-20261104/EXECUTOR-HANDOFF.md. Manifest/patch/evidence, batas lab parsial, kegagalan harness dan cleanup tercantum di sana. Baseline133 path dipertahankan di luar intersection resmi; HEAD dan index tidak diubah. Tidak ada akses staging/production atau Git mutation.

Tindak lanjut: reviewer terpisah memeriksa delta dan artifact lokal berikut rekonsiliasi kapasitas. Model/effort rekomendasi: GPT-6.1 Sol (gpt-6.1-sol)/high. Source PASS tidak memberi izin rilis dan tidak membuktikan kapasitas725. Model/effort aktual sesi tidak terverifikasi.
