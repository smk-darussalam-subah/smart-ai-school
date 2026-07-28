# Wave C Appointment Compatibility Activation Follow-up Re-review

Tanggal: 2026-07-27
Peran: reviewer independen, source-only dan local verification
Scope: Gate 2 Opsi A internal automation token, aktivasi appointment jatuh tempo, shared lock, projection Appointment, workflow n8n, dan nginx defense-in-depth.
Status: **FOLLOW-UP REQUIRED - BELUM BOLEH GIT GATE ATAU COMBINED POSTGRESQL DRY-RUN**

## Putusan

**FOLLOW-UP REQUIRED**

Implementasi telah menutup mayoritas temuan arsitektur sebelumnya: route machine-only memiliki guard fail-closed, due activation dan cutover memakai lock transaksi yang sama, proyeksi Struktur/Users/sidebar telah berpindah ke Appointment, dan workflow n8n tetap inactive serta tidak memuat token literal. Namun dua P1 di batas endpoint otomatisasi masih membuat scope token lebih luas dari kontrak dan mengekspos identifier internal ke data eksekusi n8n. Keduanya harus ditutup dan direview ulang sebelum menjalankan dry-run PostgreSQL gabungan TF2 + Wave B + Wave C atau melakukan packaging Git.

Keyakinan reviewer: **91%** untuk temuan source dan verifikasi lokal; **rendah untuk runtime** karena PostgreSQL, import/eksekusi n8n, VPS, dan browser/staging QA memang belum dijalankan.

## Findings

### [P1] Token mesin dapat mengaktifkan appointment untuk tahun ajaran arbitrer

`POST /appointments/activate-due` menerima `academicYearId` dari query lalu meneruskannya ke service. Ketika parameter diisi, `activateDueAppointments()` mencari tahun itu hanya berdasarkan `id`, tanpa syarat `isActive: true`. Dengan demikian token n8n yang seharusnya hanya memiliki hak sempit untuk aktivasi jatuh tempo tahun ajaran aktif dapat dipakai mengubah appointment pada tahun lama atau tahun masa depan.

Evidence:

- `apps/api/src/appointments/appointments.controller.ts:48-52` menerima `@Query('academicYearId')` di route machine-only.
- `apps/api/src/appointments/appointments.service.ts:447-459` memilih tahun berdasarkan `id` bila parameter tersedia; filter `isActive: true` hanya digunakan ketika parameter tidak dikirim.

Required remediation:

1. Hapus `academicYearId` dari kontrak HTTP automation endpoint. Endpoint n8n hanya boleh memproses satu tahun ajaran yang `isActive` pada saat eksekusi.
2. Bila operasi manusia terautentikasi benar-benar memerlukan target tahun eksplisit, buat route/aksi terpisah dengan permission dan audit actor yang eksplisit; jangan perluas token n8n untuk itu.
3. Tambahkan test controller/service bahwa request automation tidak dapat memilih tahun nonaktif, lama, atau masa depan, dan tetap idempotent saat dipanggil ulang.

### [P1] Respons scheduler membawa `affectedKeycloakIds` ke execution data n8n

Service mengembalikan `affectedKeycloakIds` ke controller. Workflow n8n memakai `fullResponse: true`, kemudian menghitung jumlah identifier itu di node berikutnya. Ringkasan akhir memang hanya menyimpan count, tetapi respons mentah sudah menjadi data node HTTP dan workflow mengaktifkan `saveManualExecutions: true`; ringkasan setelahnya tidak menghapus data respons dari execution log. Ini bertentangan dengan kontrak observability PII-minimal.

Evidence:

- `apps/api/src/appointments/appointments.service.ts:436-439` membentuk respons dengan `affectedKeycloakIds`.
- `apps/api/src/appointments/appointments.service.ts:466-468` membuktikan identifier hanya dibutuhkan internal service untuk invalidasi cache.
- `infrastructure/n8n/workflows/appointment-due-activation-daily.json:35-36` meminta respons penuh, dan `:48` membaca `body.affectedKeycloakIds`.
- Workflow memiliki `saveManualExecutions: true` pada konfigurasi, sehingga respons HTTP mentah perlu diperlakukan sebagai data tersimpan.

Required remediation:

1. Pisahkan hasil internal domain dari DTO respons automation. Tetap gunakan `affectedKeycloakIds` hanya di dalam service untuk invalidasi cache, tetapi kirim hanya `endedCount`, `cancelledCount`, `activatedCount`, dan `affectedUserCount` ke n8n.
2. Ubah workflow agar memakai `affectedUserCount` yang sudah aman dari respons, tanpa membaca daftar ID.
3. Tambahkan test yang memastikan respons endpoint automation tidak mengandung `affectedKeycloakIds`, `staffId`, nama, atau data identitas lain.

## Hal Yang Terverifikasi

- `AppointmentAutomationGuard` memerlukan token environment minimal 32 byte, menolak token kosong/salah, dan menggunakan perbandingan constant-time.
- Route scheduler diberi `@Public()` hanya agar tidak bergantung pada token manusia; guard khusus tetap dijalankan. Nginx memblokir path yang sama dari reverse proxy publik sebagai defense-in-depth.
- `AppointmentsService.acquireActivationLock()` memakai satu advisory lock yang dipanggil oleh due activation dan cutover tahun ajaran dalam transaksi masing-masing.
- `PositionsService` untuk assignments, sidebar, dan access diagnostic telah menggunakan Appointment; tidak ditemukan kembali authority `StaffPosition` pada path target yang diperiksa.
- Workflow n8n inactive, memakai referensi environment untuk URL/token/Fonnte, dan alert tidak memuat daftar pengguna.
- Tidak ada schema/dependency baru pada Gate 2 ini di luar artefak Wave C yang telah ada di worktree.

## Verifikasi Independen Yang Dijalankan

- API focused: `appointments`, `positions`, `permissions`, `school-config`, `roles` - **5 suite / 107 test pass**.
- Web focused `struktur-ui.test.ts` - **1 suite / 3 test pass**.
- API type-check - pass.
- Web type-check - pass.
- API lint - pass.
- Web lint - pass; hanya pesan deprecation/plugin Next yang sudah ada, tanpa error lint.
- Prisma validate memakai `DATABASE_URL` dummy - pass; ini validasi schema saja, bukan koneksi atau migration apply.
- `git diff --check` dan `git diff --cached --check` - pass.
- Tidak ada staged changes. Worktree masih mixed dengan untracked historis; tidak aman memakai broad staging.

## Residual Setelah P1 Ditutup

1. Jalankan re-review lokal atas kedua P1, termasuk test negatif kontrak HTTP dan test DTO aman.
2. Setelah re-review lulus, baru jalankan **combined PostgreSQL dry-run gate** pada copy disposable: pre-count, apply migration TF2 + Wave B + Wave C, post-reconciliation, partial-index/capacity proof, dan restore rehearsal schema+data.
3. Setelah evidence PostgreSQL diterima, lakukan explicit Git packaging. Jangan stage file Wave AI/LMS, cache, scratch, atau artefak historis.
4. Sebelum aktivasi workflow: import n8n runtime, inject secret di environment/credential store, verifikasi URL internal, rotasi/emergency disable, dan jalankan smoke aman. Browser/staging QA Struktur, Users, lifecycle appointment, dan alert scheduler tetap wajib sebelum promotion.

## Catatan P2

`RolesGuard` menambahkan kode jabatan aktif yang cocok dengan metadata route. Ini cukup untuk route yang mendeklarasikan `KEPALA_SEKOLAH`/`WAKA_*` dan telah diperiksa pada domain utama, tetapi perlu regression test capability per domain saat surface baru ditambah. Jangan mengubah semua `isElevated()` menjadi akses global bagi WAKA/KAPROG/BKK/Hubin; authority mereka harus tetap permission- dan route-specific.

## Batas Review

Tidak ada perubahan source, schema, database, n8n live, Keycloak, VPS, Git, deploy, atau browser yang dilakukan oleh reviewer. Keberhasilan test lokal tidak menggantikan bukti runtime dan PostgreSQL gate.
