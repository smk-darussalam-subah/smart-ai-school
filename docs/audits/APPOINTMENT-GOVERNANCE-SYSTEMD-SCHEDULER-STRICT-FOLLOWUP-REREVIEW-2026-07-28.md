# Appointment Governance Systemd Scheduler Strict Follow-up Re-review

Tanggal review: 2026-07-28
Peran: Reviewer independen
Verdict: **APPROVED FOR EXPLICIT GIT PACKAGING**

## Findings

Tidak ditemukan P0, P1, atau P2 baru pada scope strict scheduler follow-up.

Tiga temuan re-review sebelumnya telah ditutup:

1. Respons sukses memakai exact allowlist empat field:
   - `endedCount`
   - `cancelledCount`
   - `activatedCount`
   - `affectedUserCount`
2. Field tambahan, termasuk `affectedKeycloakIds` atau identifier internal lain, ditolak sebagai `invalid_response_contract`.
3. Override timeout, attempts, dan retry delay telah memiliki validasi tipe dan batas operasional.
4. Runbook telah memuat preflight Docker access yang repeatable untuk identitas runtime `appuser`.

## Source Review

### Exact response contract

`infrastructure/systemd/diis-appointment-due-activation.sh` memeriksa:

- response merupakan object non-array;
- jumlah key tepat empat;
- setiap key termasuk dalam allowlist;
- setiap field merupakan integer nonnegatif;
- kegagalan tidak mencetak raw response.

Kontrak ini konsisten dengan `AppointmentsService.activateDueAppointments()`, yang memproyeksikan hanya empat safe counts dan tidak mengembalikan `affectedKeycloakIds`.

### Bounded configuration

Rentang yang diterapkan:

- `DIIS_APPOINTMENT_REQUEST_TIMEOUT_MS`: `1000..120000`;
- `DIIS_APPOINTMENT_MAX_ATTEMPTS`: `1..5`;
- `DIIS_APPOINTMENT_RETRY_DELAY_SECONDS`: `0..300`.

Input kosong, nonnumeric, atau di luar rentang gagal sebelum HTTP request loop.

### Operator runbook

Runbook sekarang mengharuskan operator:

- berjalan sebagai `appuser`;
- membuktikan membership group `docker`;
- membuktikan Docker dapat diakses tanpa `sudo`;
- membuktikan target API container berjalan;
- membuktikan automation token tersedia tanpa mencetak nilainya.

Staging tetap manual one-shot ke `smk-staging-api`. Tidak ada drop-in staging pada unit produksi, dan timer hanya boleh di-enable untuk produksi.

## Independent Verification

Reviewer menjalankan:

- API focused `appointments.spec.ts`: **1 suite / 21 tests pass**;
- syntax check `bash -n` pada scheduler script: **pass**;
- parse seluruh remaining n8n workflow JSON: **pass**;
- source scan `DIIS_API_INTERNAL_URL` di luar audit docs: **no matches**;
- `git diff --check`: **pass**.

Run pertama focused test tidak mencapai assertion karena Jest mencoba menulis cache ke Windows temp yang tidak writable pada sesi reviewer. Rerun menggunakan scratch cache di luar repository lulus 21/21. Ini merupakan keterbatasan environment reviewer, bukan kegagalan source.

## Accepted Residual Risks

- Timer belum dipasang atau di-enable pada production.
- Staging manual one-shot terhadap API hasil deployment belum dijalankan.
- Browser/staging QA tetap menjadi post-promotion gate.
- Membership `appuser` pada group `docker` merupakan hak operasional tinggi. Risiko diterima untuk arsitektur ini dengan syarat script dan unit runtime tetap di-install sebagai `root:root` dan tidak writable oleh `appuser`.
- Worktree sangat mixed dan memiliki banyak untracked historical artifacts.

Risiko tersebut tidak menghalangi Git packaging karena perubahan live memang belum diizinkan dan runbook memisahkan source gate dari operator gate.

## Git Gate

Eksekutor boleh melanjutkan explicit Git packaging dengan ketentuan:

1. jangan memakai `git add .`, `git add -A`, broad glob, atau broad directory staging;
2. stage hanya file manifest Appointment Governance Wave C dan scheduler yang telah direview;
3. jangan ikutkan cache, scratch, test output, historical audit yang tidak menjadi scope, atau file wave lain;
4. periksa `git diff --cached --stat`;
5. periksa `git diff --cached --check`;
6. inspeksi `git diff --cached` untuk memastikan tidak ada secret, PII, n8n appointment workflow, atau file liar;
7. commit/push/PR berhenti sebelum merge dan deploy untuk reviewer/CI gate berikutnya.

## Post-Promotion Operator Gate

Setelah source dipromosikan sesuai Gitflow:

1. jalankan staging manual one-shot ke `smk-staging-api`;
2. pastikan output hanya empat safe counts;
3. pastikan tidak ada systemd drop-in staging;
4. pada production, install script/unit sebagai `root:root`;
5. buktikan `systemctl is-enabled`, `systemctl list-timers`, manual service start, dan `journalctl`;
6. pastikan journal hanya memuat safe counts dan jadwal efektif `00:15 Asia/Jakarta`.

Timer production tidak boleh di-enable sebelum source version, environment token, container target, dan operator preflight semuanya terverifikasi.

## Confidence

**98%**

Keyakinan didasarkan pada inspeksi source, kesesuaian kontrak API-script, focused test independen, syntax validation, configuration boundary review, dan runbook review. Dua persen tersisa adalah bukti runtime pascadeploy yang memang berada pada gate selanjutnya.
