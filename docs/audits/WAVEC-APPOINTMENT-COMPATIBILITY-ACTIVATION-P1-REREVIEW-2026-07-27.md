# Wave C Appointment Compatibility Activation P1 Re-review

Tanggal: 2026-07-27
Peran: reviewer independen, source-only dan local verification
Scope: penutupan dua P1 pada machine-only `POST /appointments/activate-due` dan workflow n8n.
Status: **APPROVED FOR COMBINED POSTGRESQL DRY-RUN GATE**

## Putusan

**APPROVED FOR COMBINED POSTGRESQL DRY-RUN GATE**

Dua P1 dari re-review sebelumnya telah ditutup secara sempit dan sesuai kontrak Opsi A. Persetujuan ini hanya membuka gate dry-run PostgreSQL gabungan pada copy disposable. Ini bukan persetujuan commit, push, PR, merge, deploy, import/activation n8n, perubahan VPS/Keycloak, atau staging/browser QA.

Keyakinan reviewer: **94%** untuk source dan test lokal. Keyakinan runtime tetap rendah sampai ada bukti PostgreSQL, n8n runtime, dan staging.

## P1 Yang Ditutup

### Scope token automation kini hanya tahun ajaran aktif

- `apps/api/src/appointments/appointments.controller.ts:48-52` tidak lagi menerima `academicYearId`; route memanggil service tanpa parameter.
- `apps/api/src/appointments/appointments.service.ts:450-461` selalu mencari satu `AcademicYear` dengan `isActive: true` dan tidak lagi menyediakan cabang `findUnique()` berdasarkan input caller.
- Test `due activator uses only active academic year...` mencoba mengirim argumen runtime tambahan, lalu membuktikan argumen itu tidak berpengaruh, `findUnique()` tidak dipanggil, dan advisory lock tetap dipakai.

Hasil: token internal tidak dapat memilih tahun ajaran lama, nonaktif, atau masa depan.

### Respons automation kini PII-minimal

- `activateDueAppointments()` tetap memakai `affectedKeycloakIds` secara internal untuk invalidasi cache setelah transaksi commit, tetapi hanya mengembalikan `endedCount`, `cancelledCount`, `activatedCount`, dan `affectedUserCount`.
- `infrastructure/n8n/workflows/appointment-due-activation-daily.json:54` membaca `body.affectedUserCount`, bukan daftar identifier.
- Karena HTTP response body kini agregat aman, `fullResponse: true` dan `saveManualExecutions: true` tidak lagi membuat daftar Keycloak ID tersimpan pada execution data workflow.
- Test fokus memastikan respons tidak memiliki `affectedKeycloakIds`, `staffId`, atau `fullName`.

Hasil: observability scheduler memperoleh count yang diperlukan tanpa membawa identifier pengguna.

## Verifikasi Independen

- `appointments.spec.ts`: **21/21 pass**.
- Hasil test mencakup guard token fail-closed, aktivasi tahun aktif, respons aman, dan invalidasi cache setelah commit.
- JSON workflow n8n berhasil diparse.
- Pencarian pada controller dan workflow tidak menemukan `academicYearId`, `affectedKeycloakIds`, `staffId`, atau `fullName` sebagai kontrak automation.
- `git diff --check` dan `git diff --cached --check` lulus. Tidak ada staged changes.

Catatan: warning `ts-jest` terhadap file JavaScript hasil build package auth/logger tetap ada, tetapi tidak menyebabkan kegagalan assertion atau test.

## Gate Berikutnya

Jalankan combined PostgreSQL dry-run pada **copy database disposable**, mencakup perubahan TF2, Wave B, dan Wave C:

1. Rekam pre-count non-PII dan snapshot/backup yang dapat direstore.
2. Apply seluruh migration sesuai urutan target.
3. Jalankan post-reconciliation, proof partial unique index, capacity, lifecycle/cutover, dan quarantine.
4. Lakukan restore rehearsal schema dan data pada copy terpisah, lalu rekam hasilnya.
5. Kembali ke reviewer dengan command/output ringkas, before/after counts, dan daftar file migration tepat.

Jika dry-run diterima, gate berikutnya adalah explicit Git packaging; jangan gunakan `git add .` atau `git add -A` pada worktree mixed ini.

## Batas Review

Reviewer tidak mengubah source, schema, database, n8n live, Keycloak, VPS, Git, deploy, atau browser. n8n runtime dan staging QA tetap residual wajib sebelum workflow diaktifkan atau perubahan dipromosikan.
