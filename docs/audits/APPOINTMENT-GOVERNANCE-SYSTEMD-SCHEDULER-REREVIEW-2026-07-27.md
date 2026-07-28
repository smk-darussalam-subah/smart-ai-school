# Appointment Governance Systemd Scheduler Re-review

Tanggal: 2026-07-27
Peran: reviewer independen
Scope: penggantian n8n appointment activation dengan systemd timer, script caller, runbook, dan readiness Git gate.
Status: **FOLLOW-UP REQUIRED**

## Putusan

**FOLLOW-UP REQUIRED**

Peralihan ownership dari n8n ke systemd sudah benar secara arsitektur. Token tidak ditulis literal, endpoint tetap internal, public route diblokir, timezone timer eksplisit, dan disposable smoke membuktikan guard serta idempotency. Namun dua P1 pada kontrak scheduler masih dapat menyebabkan kegagalan operasional yang tampak sukses atau salah environment. Packaging ditahan sampai keduanya ditutup.

Keyakinan reviewer: **94%** untuk source dan test lokal. Live systemd/staging tetap belum dibuktikan, sesuai gate.

## Findings

### [P1] Respons 2xx malformed dianggap sukses dengan count nol

`diis-appointment-due-activation.sh` menangkap kegagalan parse JSON dengan mengganti body menjadi `{}`. Helper `toCount()` juga mengubah field hilang/tidak valid menjadi `0`. Status service hanya ditentukan oleh HTTP 2xx.

Akibatnya, respons `201` berupa HTML, body kosong, atau kontrak JSON yang rusak akan dicatat sebagai:

`ok=true` dengan seluruh count `0`, lalu service exit `0`.

Ini membuat systemd menganggap aktivasi berhasil ketika kontrak API sebenarnya tidak dapat diverifikasi.

Required remediation:

1. Pada response 2xx, JSON wajib berhasil diparse.
2. Empat field `endedCount`, `cancelledCount`, `activatedCount`, dan `affectedUserCount` wajib berupa integer non-negatif.
3. Gunakan allowlist response key; respons yang membawa identifier atau key tak dikenal harus gagal tertutup.
4. Parse/shape failure harus menghasilkan output aman `error=invalid_response_contract` dan exit nonzero, tanpa mencetak body mentah.
5. Tambahkan smoke untuk body kosong, JSON malformed, missing count, negative/non-integer count, dan extra identifier field. Semua harus gagal nonzero.

### [P1] Drop-in staging mengambil alih satu-satunya timer produksi

Unit memakai satu nama tetap `diis-appointment-due-activation.service` dengan default `smk-api`. Runbook staging menyuruh `systemctl edit` unit yang sama dan mengganti `DIIS_API_CONTAINER=smk-staging-api`.

Prod dan staging berjalan pada VPS yang sama. Setelah drop-in staging diterapkan, timer tunggal akan memanggil staging dan produksi kehilangan scheduler. Sebaliknya, menghapus drop-in untuk produksi menghilangkan target staging.

Required remediation paling sederhana:

1. Timer terpasang/enabled hanya untuk produksi dan tetap menargetkan `smk-api`.
2. Staging QA menjalankan script secara manual dengan environment `DIIS_API_CONTAINER=smk-staging-api`; jangan memasang drop-in atau enable timer staging.
3. Hapus instruksi `systemctl edit` staging dari runbook dan beri peringatan bahwa satu unit produksi tidak boleh dialihkan.

Alternatif yang juga valid adalah templated service/timer dengan instance dan environment file root-owned terpisah untuk prod/staging. Jangan membuat dua unit yang memakai nama/log/state yang sama.

### [P2] Tidak ada bounded retry dan preflight permission `appuser`

Satu kegagalan sementara Docker/API membuat aktivasi tertunda sampai hari berikutnya. Source juga mengasumsikan `appuser` dapat mengakses Docker socket, sedangkan smoke report tidak membuktikan script dijalankan sebagai user systemd tersebut.

Required remediation:

1. Tambahkan bounded retry, misalnya systemd `Restart=on-failure`, `RestartSec`, dan `StartLimitBurst/IntervalSec`, lalu verifikasi kompatibilitas `Type=oneshot` menggunakan `systemd-analyze verify`.
2. Runbook wajib memeriksa `sudo -u appuser docker inspect smk-api` dan manual script sebagai `appuser`.
3. Dokumentasikan bahwa setelah retry habis unit berstatus failed dan harus masuk monitoring/journal review. Tidak perlu menambah provider notifikasi baru pada wave ini.
4. Validasi timeout sebagai integer positif dengan batas wajar agar override konfigurasi tidak membuat Node timeout invalid.

## Hal Yang Lulus

- Workflow appointment n8n telah dihapus; wiring appointment pada service n8n dan `DIIS_API_INTERNAL_URL` sudah bersih.
- n8n lain untuk health/backup tetap ada dan JSON-nya valid.
- Decision log menetapkan systemd sebagai satu-satunya scheduler appointment.
- Token dibaca dari environment container API; tidak muncul pada script, unit, output, atau dokumentasi.
- Endpoint dipanggil dari dalam container ke loopback dan public nginx route tetap `404`.
- `OnCalendar=*-*-* 00:15:00 Asia/Jakarta` dan `Persistent=true` benar; evidence VPS memetakan waktu ke `17:15 UTC`.
- Script `bash -n` lulus secara independen.
- `appointments.spec.ts` lulus independen: **21/21**.
- Executor melaporkan API/web type-check, lint, build dan disposable scheduler smoke lulus.
- `git diff --check` lulus; tidak ada staged changes.

## Re-review Gate

Executor cukup melakukan follow-up sempit pada:

- `infrastructure/systemd/diis-appointment-due-activation.sh`
- `infrastructure/systemd/diis-appointment-due-activation.service`
- `infrastructure/systemd/diis-appointment-due-activation.timer` bila retry/unit berubah
- `docs/runbooks/appointment-due-activation-systemd.md`
- focused smoke/report

Setelah P1/P2 ditutup, jalankan:

1. `bash -n`;
2. `systemd-analyze verify` dan calendar check di VPS temporary path;
3. response-contract negative smoke;
4. valid call + retry/idempotency;
5. manual staging-container call sebagai `appuser`, tanpa install/enable unit;
6. appointment focused test, API/web type-check/lint/build, source sweep, dan `git diff --check`.

Tidak perlu Prompt Architect. Setelah re-review lulus, explicit Git packaging dapat dibuka. Install/enable timer produksi tetap menunggu promotion production; staging hanya memakai manual scheduler smoke.

## Batas Review

Reviewer tidak mengubah source produk, systemd live, database, Git, Keycloak, n8n live, deploy, atau browser.
