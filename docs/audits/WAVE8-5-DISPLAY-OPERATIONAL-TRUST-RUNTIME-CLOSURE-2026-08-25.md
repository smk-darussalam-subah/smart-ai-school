# Wave 8.5 Display Operational Trust Runtime Closure

Tanggal: 2026-08-25
Executor: Codex
Status: READY FOR EXTERNAL INDEPENDENT RE-REVIEW
Candidate branch: `fix/wave8-5-display-operational-trust-20260825`
Baseline: `origin/develop@773df0f1b555383feec7fc821fa69ef30fe8d533`

## Scope

Follow-up ini menutup runtime gate Wave 8.5 yang belum lengkap:

1. View-as browser desktop/mobile, termasuk penyembunyian dan pemulihan Appointment asli.
2. Display Ruang Guru/TU dengan data operasional nyata.
3. Alert T+5/T+10/T+15, satu pemimpin audio, Bahasa Indonesia, dan anti-replay.
4. Kepadatan papan 14-15 kelas aktif dengan 10 JP per hari pada target TV 43 inci 1080p.

Perubahan warna/style harian dipertahankan. Tidak ada schema, migration, dependency, Keycloak role, shared staging, production, atau branch protection yang diubah.

## Source Remediation

- Snapshot SSE bernama `snapshot` dikonsumsi langsung; polling 60 detik menjadi reconciliation fallback.
- Proyeksi display memakai agregat presensi siswa/guru, denominator roster, completeness, tren lima hari, agenda tahun aktif, dan pengumuman terkurasi.
- Numerator presensi siswa memakai kohort yang sama dengan denominator: siswa aktif, tidak dihapus, dan sudah ditempatkan pada kelas.
- Ruang TU memakai antrean nyata: onboarding, PPDB follow-up, placement, dan SPP yang perlu diproses.
- Payload display tetap allowlist dan tidak membawa kontak, NISN, kredensial, nilai individual, data wali, atau detail finansial individual.
- Tombol Tes dan alert T+10 memakai helper yang sama: voice `id-ID`, rate `0.92`, pitch `1`, volume `1`; voice non-Indonesia tidak menjadi fallback.
- Audio memakai claim Redis global per profil sebelum `speechSynthesis.speak()`. Lease 45 detik mengikat `deliveryId + token`, dipertahankan sampai ucapan selesai, serta memakai compare-and-extend/delete. Tepat satu tab/instance dan satu alert memperoleh kanal suara pada satu waktu.
- Redis tidak memiliki memory fallback untuk audio. Ketidaktersediaan Redis fail-closed ke alert visual.
- Tombol Tes terkunci sejak claim alert dimulai sampai playback selesai sehingga tidak dapat memotong T+10.
- Delivery baru ditransisikan ke `PLAYED` setelah event `onend`. Error, abort/timeout, atau klaim kedaluwarsa sebelum selesai tetap retryable; delivery `PLAYED` dinormalisasi menjadi non-audible agar reload/reconnect tidak mengulang suara yang sudah selesai.
- Monitoring menampilkan badge dan aksi eksplisit `Pemimpin audio`; copy kredensial dibedakan menjadi `Ganti kode pairing` dan `Pulihkan pairing`.
- Papan memilih cohort sesi yang sedang berlangsung. Saat jeda, papan memilih cohort berikutnya, bukan enam sesi pertama hari itu.
- Maksimal enam kartu ditampilkan per halaman. Cohort 14-15 kelas berotasi otomatis setiap 12 detik dengan indikator jumlah kelas dan halaman; dialog menampilkan semua kelas pada segmen tersebut.
- Toolbar papan menyusun previous, pause/play, next, lalu `Lihat semua` sesuai hierarchy aksi. Seluruh kontrol berukuran 44px, berlabel aksesibel, dan rotasi otomatis berhenti saat `prefers-reduced-motion` aktif hingga operator memilih Play secara eksplisit.
- Tipografi target 43 inci: nama kelas 24px, mapel 18px, dan metadata 16px pada 1920x1080. Truncation mencegah nama panjang merusak grid.
- Error audio/koneksi memakai live region; alert visual tetap kanal utama.

## Independent Finding Closure

Finding final pertama reviewer ditutup sebagai berikut:

| Finding | Closure |
|---|---|
| P1 dua tab dapat mulai berbicara sebelum loser dibatalkan | Claim Redis dilakukan sebelum browser membuat playback; hanya winner menerima token. `PLAYED` memerlukan token aktif yang diperpanjang secara atomik. |
| P2 tombol Tes memotong alert aktif | Guard sinkron memeriksa claim/playback in-flight; tombol juga disabled selama alert busy dan tidak menjalankan `cancel()`. |
| P2 numerator dan denominator presensi berbeda kohort | Query group attendance sekarang memfilter relasi student dengan policy roster yang sama. |

Runtime Redis juga menemukan race koneksi lazy pada dua claim pertama. Satu shared connection promise ditambahkan dan dikunci oleh regression test.

Re-review berikutnya menemukan lease beberapa alert diambil paralel terlalu dini. Queue kemudian diubah menjadi sekuensial: hanya item paling depan yang diklaim, ucapan diselesaikan, `PLAYED` dikonfirmasi dari `onend`, lease dilepas, lalu item berikutnya diproses. Regression memakai durasi virtual 90 detik, lebih panjang dari TTL 45 detik, dan membuktikan waktu claim `0/30/60` detik.

## Runtime Evidence

Runtime pertama terisolasi memakai PostgreSQL, Redis, Keycloak, API/web lokal, 45 migration resmi, dan fixture PII-safe. Bukti berikut telah lulus:

- View-as normal/GURU desktop dan mobile, lalu restore Appointment asli.
- Kehadiran siswa `2/3` dengan `3/3 tercatat`; guru `1/1`; tren lima hari berasal dari database.
- Dua agenda tahun aktif dan satu pengumuman `ALL` terkurasi; pengumuman `SISWA` tidak bocor.
- T+5 private notification, T+10 dua visual delivery/satu audible leader, T+15 private escalation.
- Delivery leader berubah `DELIVERED -> PLAYED`; follower visual-only; reload tidak replay.

Runtime Redis final memakai container Redis 7 disposable pada port 6385:

- dua claim paralel menghasilkan tepat satu winner;
- stale token ditolak;
- winning token dapat extend;
- wrong-token release ditolak;
- winning release berhasil;
- delivery dapat diklaim ulang sesudah release.

Browser final memakai dua tab dengan credential leader yang sama dan controlled speech harness. Harness dikunci ke profil yang sebelumnya benar-benar tersedia pada Chrome runtime (`Google Bahasa Indonesia`, `id-ID`, rate `0.92`) agar jumlah panggilan dapat dihitung deterministik. Hasil:

- dua tab menerima tiga alert T+10 serentak;
- ketiga alert dibaca sekuensial, tanpa overlap lintas tab;
- tepat tiga transisi `PLAYED` dan tidak ada replay;
- profil kedua jalur identik: `Google Bahasa Indonesia`, `id-ID`, rate `0.92`;
- tombol Tes memakai profil identik, disabled selama queue aktif, dan klik paksa tidak menambah ucapan Tes atau memotong alert.

## Dense Board QC

Skenario browser memuat 150 sesi sintetis: 15 kelas x 10 JP.

| Check | Hasil |
|---|---|
| Kohort waktu | JP 5 aktif terpilih; bukan sesi pagi pertama |
| Kelas aktif | 15/15 terjangkau melalui tiga halaman 6-6-3 |
| Rotasi | 12 detik; ketiga halaman `1/3`, `2/3`, `3/3` dikunjungi browser |
| Kendali rotasi | Previous, Pause/Play, Next, dan `Lihat semua` tersusun sesuai prioritas; status rotasi terlihat dan reduced-motion dihormati |
| Jeda | Cohort JP berikutnya dipilih |
| 1920x1080, target TV 43 inci | Tidak overlap, clipping, horizontal/vertical page overflow, atau target di bawah 44px |
| 1366x768 fallback | Tidak horizontal/vertical page overflow; panel samping dapat scroll internal bila konten lebih panjang |
| Nama/mapel/ruang panjang | Truncate stabil; detail sesi tetap tersedia |
| Warna harian | Tidak diubah |

QC visual browser memberikan keyakinan 96% untuk UI/UX target 43 inci. Residual fisik hanya jarak pemasangan TV, ketajaman panel, volume ruangan, dan kualitas speaker aktual; hal itu memerlukan acceptance singkat di ruang guru setelah deployment.

## Visual Evidence

Screenshot hanya berisi fixture sintetis. File tidak masuk Git; hash dicatat sebelum cleanup.

| File | SHA-256 |
|---|---|
| `display-dense-43inch-page1.png` | `616295d4f73e58ad727d743286b4ebdc56b27b20a41c146ee41929825480ab0f` |
| `display-dense-43inch-page2.png` | `6d82d99242aa33e4989287d0d711e1ddf76b34d87e98415ca703fd6963b78110` |
| `display-dense-43inch-page3.png` | `f8b5acc1404267612cf8874aa81b5ff09e08a6d1951d4873b351a91124edeb72` |
| `display-dense-1366x768.png` | `c34c3697ab756a897d8385dacb449c02de2eed4c28ad953e13302b53f344ea13` |

Evidence runtime sebelumnya tetap berlaku untuk view-as dan lifecycle T+5/T+10/T+15 karena source final hanya memperketat claim audio, kohort presensi, serta presentasi kohort sesi.

## Narrow Follow-up 2026-08-26

Follow-up reviewer untuk lifecycle audio, kendali rotasi, dan provenance laporan ditutup pada branch yang sama:

- `PLAYED` tidak lagi dikirim dari `onstart`. Helper playback mempertahankan lease sampai audio selesai dan baru mengonfirmasi status terminal dari `onend`.
- `onerror`, kegagalan start, abort/timeout 40 detik, lease kedaluwarsa, respons konfirmasi salah, dan konfirmasi menggantung seluruhnya melepas claim tanpa menulis `PLAYED`; alert tetap retryable.
- Behavioral unit test mencakup `onstart -> onerror`, utterance tanpa terminal event, `onend` sukses, lease kedaluwarsa saat konfirmasi, dan konfirmasi yang menggantung.
- Browser drill terkontrol membuktikan kegagalan pertama menghasilkan `claims=1`, `played=0`, `releases=1`. Retry sukses menghasilkan total `claims=2`, `played=1`, `releases=2`; event `onend` tercatat 62 ms sebelum server menerima transisi `PLAYED`. Refresh berikutnya tidak replay.
- Profil alert dan Tes tetap `Google Bahasa Indonesia`, `id-ID`, rate `0.92`. Browser console tidak memuat warning/error.
- Hierarchy papan mempertahankan konteks sesi sebagai informasi primer. Toolbar sekunder berurutan Previous, Pause/Play, Next; `Lihat semua` menjadi aksi tersier.
- Pada 1920x1080, Pause menahan halaman `1/3` selama 12,5 detik, Next/Previous menghasilkan `1 -> 2 -> 1`, dan Play melanjutkan rotasi. Dialog `Lihat semua` juga menahan halaman selama terbuka.
- Emulasi `prefers-reduced-motion: reduce` memulai rotasi dalam keadaan dijeda; Play menjadi override operator yang eksplisit.
- Ketiga tombol ikon berukuran tepat 44x44px, memiliki accessible name, status rotasi terlihat, dan tidak ada overflow horizontal/vertikal.
- Tombol Pause/Play memakai label perintah dinamis tanpa `aria-pressed` yang kontradiktif; live region mengumumkan status `rotasi otomatis` atau `rotasi dijeda`. Copy kedua state dikunci regression test.
- Previous/Next sekarang menjeda rotasi secara sinkron sebelum memindahkan halaman. Callback interval lama memeriksa ref yang sama, sehingga klik manual pada `t=11,9s` tidak ditimpa tick `t=12s`; rotasi baru berlanjut setelah operator menekan Play.
- Perubahan warna/style harian tetap tidak disentuh.

## Verification

- API focused: 2 suite / 18 test PASS.
- Web focused: 2 suite / 35 test PASS.
- Full API: 66 suite / 1,302 test PASS; satu suite/empat test skipped sesuai konfigurasi repository.
- Full web: 42 suite / 302 test PASS.
- API dan web type-check PASS.
- API lint PASS.
- Web lint PASS dengan warning deprecation/plugin existing.
- API build PASS.
- Web build PASS, 47/47 halaman.
- Secondary read-only source review: tidak menemukan P0/P1/P2 pada follow-up rotasi; official reviewer verdict tetap gate terpisah.
- Redis concurrency/fencing runtime PASS.
- Browser dense-board/two-tab playback dan narrow follow-up matrix PASS.
- `git diff --check` PASS.
- Worktree tidak memiliki staged changes.

## Containment and Next Gate

- Shared staging, production, `main`, timer, VPS, dan branch protection tidak disentuh.
- Tidak ada SQL ke staging/production.
- Runtime lokal, container, screenshot, dan `.tmp` wajib dibersihkan setelah final review evidence selesai.
- Tidak ada commit, push, PR, atau deploy pada gate ini.
- Kandidat diajukan untuk independent final source re-review.
- Setelah approval reviewer, gunakan explicit file manifest; jangan gunakan `git add .` atau `git add -A`.

## Executor Readiness Assessment

Executor menilai lifecycle audio, kontrol rotasi, dense-board, dan disposable runtime siap untuk external independent re-review berdasarkan evidence di atas. Finding P2 terbaru tentang navigasi manual pada batas interval telah diremediasi dan menunggu verdict reviewer resmi. Staging dan production tetap gate terpisah setelah reviewed SHA dipaketkan dan dideploy.
