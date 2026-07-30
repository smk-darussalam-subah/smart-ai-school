# Appointment Governance Integrated Validation Re-review

Tanggal: 2026-07-27
Peran: reviewer independen
Scope: Gate 0-5 integrated validation, keputusan penghentian n8n untuk appointment activation, dan kesiapan Git gate.
Status: **FOLLOW-UP REQUIRED**

## Putusan

**FOLLOW-UP REQUIRED**

Gate PostgreSQL telah lulus dengan evidence yang memadai. Automation endpoint juga terbukti fail-closed, concurrent-safe, dan idempotent pada runtime disposable. Namun source saat ini masih menyatakan n8n sebagai pemilik schedule appointment, sementara Director telah menetapkan bahwa n8n tidak lagi dipakai untuk proses ini. Git gate ditahan hanya untuk follow-up scheduler ownership dan cleanup source yang sempit.

Interpretasi keputusan Director yang dipakai reviewer:

- n8n tetap boleh ada untuk workflow lain yang masih disetujui, seperti health/backup.
- n8n tidak lagi menjadi caller `POST /appointments/activate-due`.
- Endpoint machine-only tetap diperlukan agar appointment dengan `effectiveFrom` di tengah tahun dapat aktif otomatis.
- Pemilik jadwal pengganti yang direkomendasikan adalah VPS `systemd timer` yang memanggil endpoint internal API.

Keyakinan reviewer: **95%**. PostgreSQL/runtime automation memiliki evidence kuat; authenticated browser flow dan scheduler pengganti tetap menunggu staging.

## Findings

### [P1] Keputusan scheduler baru belum tercermin pada source

Source masih memiliki:

- workflow untracked `infrastructure/n8n/workflows/appointment-due-activation-daily.json`;
- wiring `DIIS_API_INTERNAL_URL` dan `APPOINTMENT_AUTOMATION_TOKEN` pada service n8n;
- dokumentasi n8n appointment activation;
- komentar `.env.example` dan nginx yang menyebut n8n sebagai caller.

Jika perubahan ini dikemas sekarang, aplikasi akan membawa kontrak operasional yang sudah dibatalkan. Jika seluruh caller n8n hanya dihapus tanpa pengganti, appointment yang jatuh tempo di tengah tahun tidak memiliki pemicu aktivasi.

Required remediation:

1. Hapus workflow appointment dari n8n dan seluruh wiring/docs khusus appointment pada service n8n. Jangan menghapus n8n atau workflow lain yang masih dipakai.
2. Pertahankan `AppointmentAutomationGuard`, `APPOINTMENT_AUTOMATION_TOKEN` pada API, endpoint internal, nginx public block, dan advisory lock.
3. Tambahkan scheduler VPS tunggal:
   - `systemd` oneshot service memanggil API di dalam container `smk-api`;
   - token dibaca dari environment container, tidak ditulis pada unit/script/log;
   - timer berjalan harian pukul 00:15 Asia/Jakarta;
   - `Persistent=true` agar jadwal yang terlewat saat reboot segera dijalankan;
   - script mengembalikan exit nonzero pada HTTP non-2xx dan hanya mencetak safe counts.
4. Tambahkan runbook install, manual test, log inspection, token rotation, disable/rollback, serta konfigurasi staging untuk `smk-staging-api`.
5. Perbarui `docs/decision-log.md`: n8n bukan lagi scheduler appointment; systemd timer adalah trigger eksternal, sedangkan NestJS tetap pemilik domain transition.

### [P2] Snapshot tidak menguji rekonsiliasi data legacy yang berisi row

Snapshot memiliki `0` StaffPosition dan `0` permission override. Migration apply, schema, trigger, concurrency, dan restore sudah terbukti, tetapi klasifikasi historical grant/revoke/position assignment belum diuji terhadap data nyata yang kaya.

Ini dapat diterima sebagai residual karena DIIS belum digunakan dan source staging memang kosong. Sebelum legacy import atau production go-live, jalankan satu fixture-based disposable migration replay yang mencakup:

- grant manual ambigu menjadi quarantined;
- revoke manual tetap active global;
- assignment jabatan dengan provenance kuat direkonstruksi sesuai tahun;
- stable SISWA/ORANG_TUA/INDUSTRI tidak menghasilkan migration review palsu;
- StaffPosition anomalous tetap fail-closed.

P2 ini tidak menahan Git/staging setelah P1 scheduler ditutup, tetapi harus masuk pre-go-live checklist.

## Gate Assessment

| Gate | Reviewer status | Keputusan |
| --- | --- | --- |
| Gate 0 - VPS/runtime | PASS | Tooling dan target disposable terverifikasi. |
| Gate 1 - automated checks | PASS | API 967 test, web 83 test, type/lint/build dan Prisma lulus. |
| Gate 2 - PostgreSQL | PASS | Tiga migration final, capacity proof, concurrency, dan restore rehearsal lulus. |
| Gate 3 - API runtime | PASS WITH DEFERRED AUTH QA | Automation runtime lulus; authenticated authority dipindahkan ke staging QA. |
| Gate 4 - n8n | N/A BY DIRECTOR DECISION | Harus diganti scheduler systemd dan source n8n dibersihkan. |
| Gate 5 - staging/browser | DEFERRED | Wajib setelah Gitflow promotion. |

Hash tiga migration dan schema yang dilaporkan cocok dengan file lokal saat re-review. Outbox migration file tidak ada. `git diff --check` dan cached check lulus.

## Verification Untuk Follow-up Scheduler

Executor wajib membuktikan:

1. `rg` tidak menemukan appointment workflow/wiring pada n8n.
2. `bash -n` pada script scheduler dan `systemd-analyze verify` pada service/timer lulus di Linux/VPS.
3. Manual start terhadap temporary/staging API:
   - missing/invalid token gagal;
   - valid call 2xx;
   - output hanya safe counts;
   - retry idempotent.
4. Timer tercatat `enabled`, jadwal berikutnya benar, workflow n8n appointment tidak ada/aktif.
5. API/web focused regression, type-check, lint, build, workflow JSON checks yang masih relevan, dan `git diff --check` tetap lulus.
6. Tidak ada secret literal, PII, Git action, deploy, atau perubahan production dalam follow-up lokal.

## Gate Berikutnya

Follow-up ini cukup sempit untuk langsung diberikan ke executor; tidak perlu kembali ke Prompt Architect karena keputusan Director sudah final dan tidak ada schema/domain-policy baru.

Setelah source scheduler konsisten dan re-review lulus:

1. lakukan explicit Git packaging;
2. jalankan CI;
3. promote ke staging sesuai Gitflow;
4. jalankan browser QA authenticated dengan akun SUPER_ADMIN, KEPALA_SEKOLAH aktif, GURU biasa, dan pemangku jabatan lain;
5. jalankan timer staging dan periksa lifecycle/sidebar/access diagnostic.

## Batas Review

Reviewer tidak mengubah source aplikasi, infrastructure runtime, database, Git, Keycloak, n8n live, deploy, atau browser. Report executor tetap untracked pada saat review.
