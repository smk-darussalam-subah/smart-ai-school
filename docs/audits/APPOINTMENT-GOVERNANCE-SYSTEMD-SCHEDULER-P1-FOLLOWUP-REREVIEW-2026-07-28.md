# Appointment Governance Systemd Scheduler P1 Follow-up Re-review

Tanggal review: 2026-07-28
Peran: Reviewer independen
Status: **FOLLOW-UP REQUIRED**

## Ringkasan Keputusan

Follow-up telah menutup sebagian besar risiko operasional sebelumnya:

- respons kosong, JSON malformed, count hilang, dan count bertipe/nilai tidak valid gagal tertutup;
- retry lokal tersedia dengan default tiga percobaan dan jeda sepuluh detik;
- staging tidak memasang atau mengaktifkan timer;
- timer produksi tetap memakai zona waktu `Asia/Jakarta`;
- scheduler tidak lagi bergantung pada n8n;
- pengujian API terfokus, build, type-check, lint, dan pemeriksaan whitespace dilaporkan lulus.

Namun Git gate belum dapat disetujui karena kontrak respons belum benar-benar exact allowlist. Dua hardening operasional P2 juga belum sepenuhnya menjadi kontrak yang dapat diulang oleh operator.

## Temuan

### P1 - Respons dengan key tambahan masih diterima

File:

- `infrastructure/systemd/diis-appointment-due-activation.sh`

Validator hanya memastikan empat field berikut tersedia dan berupa integer nonnegatif:

- `endedCount`
- `cancelledCount`
- `activatedCount`
- `affectedUserCount`

Validator belum membandingkan seluruh `Object.keys(response)` dengan allowlist tersebut. Akibatnya respons `2xx` yang membawa empat count valid sekaligus identifier internal atau field tak dikenal tetap dinilai sukses.

Pengujian yang dilaporkan bahwa identifier tambahan tidak muncul pada output hanya membuktikan redaksi log aman. Pengujian itu belum membuktikan kontrak fail-closed terhadap pelebaran payload. Perubahan API yang tanpa sengaja mengembalikan PII atau identifier juga tidak akan terdeteksi scheduler.

Perbaikan wajib:

1. Terapkan exact allowlist terhadap empat key aman.
2. Tolak respons yang memiliki key kurang maupun key tambahan.
3. Tambahkan negative test minimal untuk `affectedKeycloakIds`, `staffId`, dan satu key tak dikenal.
4. Pastikan pesan error tidak mencetak nilai atau payload mentah.

### P2 - Override retry dan timeout belum memiliki batas operasional

File:

- `infrastructure/systemd/diis-appointment-due-activation.sh`
- `infrastructure/systemd/diis-appointment-due-activation.service`

`MAX_ATTEMPTS` dan `RETRY_DELAY_SECONDS` divalidasi sebagai angka, tetapi belum dibatasi maksimum yang masuk akal. `REQUEST_TIMEOUT_MS` belum divalidasi sebagai integer positif. Default-nya bounded, tetapi override operator dapat membuat proses berjalan sangat lama atau gagal dengan perilaku runtime Node yang kurang jelas.

Rekomendasi:

- `MAX_ATTEMPTS`: `1..5`
- `RETRY_DELAY_SECONDS`: `0..300`
- `REQUEST_TIMEOUT_MS`: `1000..120000`

Nilai di luar rentang harus gagal sebelum `docker exec` dan tanpa menampilkan secret.

### P2 - Runbook belum menjadikan akses Docker `appuser` sebagai preflight yang dapat diulang

File:

- `docs/runbooks/appointment-due-activation-systemd.md`

Laporan mencatat bukti akses Docker oleh `appuser`, tetapi runbook perlu memuat pemeriksaan eksplisit sebelum instalasi karena unit dijalankan dengan `User=appuser`.

Tambahkan perintah preflight nonmutatif, misalnya pemeriksaan identitas dan `docker inspect`/`docker ps` terbatas yang dijalankan sebagai `appuser`, beserta kriteria lulus. Manual staging one-shot juga sebaiknya dijalankan melalui identitas OS yang sama agar bukti sesuai dengan runtime systemd.

## Verifikasi Independen Reviewer

Reviewer menjalankan:

- API focused `appointments.spec.ts`: **21/21 pass**;
- `bash -n` pada script scheduler: **pass**;
- parse seluruh workflow n8n yang tersisa: **pass**;
- pencarian `DIIS_API_INTERNAL_URL` pada source non-audit: **tidak ditemukan**;
- `git diff --check`: **pass**.

Peringatan `ts-jest` yang muncul pada focused test adalah warning existing dan tidak menyebabkan kegagalan assertion.

## Aspek yang Diterima

- Keputusan tidak memakai n8n untuk appointment activation konsisten dengan arsitektur terbaru.
- Timer hanya untuk produksi dan staging memakai manual one-shot adalah pilihan konservatif dan mudah diaudit.
- Retry dilakukan di script, sehingga unit systemd tidak perlu menumpuk kebijakan restart lain.
- Script membaca token dari environment container API dan tidak mencetak token.
- Respons log dibatasi ke proyeksi count yang aman.
- Belum ada aksi Git, deploy, database, Keycloak, atau instalasi systemd live.

## Gate Selanjutnya

Follow-up dapat langsung dikirim ke eksekutor; tidak perlu kembali ke Prompt Architect karena scope perbaikannya sempit dan tidak mengubah arsitektur, schema, lifecycle appointment, atau keputusan deployment.

Eksekutor harus:

1. menutup P1 exact allowlist;
2. menutup dua P2 hardening di atas;
3. menjalankan kembali contract matrix scheduler, focused API test, syntax/unit verification, dan `git diff --check`;
4. berhenti di reviewer gate tanpa commit/push/deploy;
5. mempertahankan explicit file scope karena worktree mixed.

Setelah re-review lulus, barulah lanjut explicit Git packaging. Instalasi dan `enable --now` timer produksi tetap merupakan gate terpisah setelah source masuk staging/production sesuai Gitflow, dengan bukti `systemctl is-enabled`, `systemctl list-timers`, manual one-shot, dan `journalctl` yang hanya memuat safe counts.

## Nilai Keyakinan

**96%**

Keyakinan tinggi berasal dari inspeksi source scheduler, unit, runbook, laporan follow-up, dan focused verification. Sisa ketidakpastian berada pada runtime produksi karena timer live memang belum dipasang atau dijalankan, sesuai protokol.
