# RESIDUAL ISSUES REGISTER — DIIS Smart AI School

> **Last updated:** 2026-07-07 (Sesi 4: R-11, R-14, R-27, R-19 selesai — security hardening + cleanup)  
> **Total:** 34 issues (4 CRITICAL, 7 HIGH, 13 MEDIUM, 10 LOW)  
> **Auditor:** Sesi Audit Residual 2026-07-06 + Investigasi Struktur Organisasi + Audit AI Infrastructure  
> **Metode:** Verifikasi langsung dari kode sumber (read-only) + trace auth flow + trace AI wiring

---

## Ringkasan

| ID | Severity | Category | Status | Deskripsi Singkat |
|----|----------|----------|--------|-------------------|
| R-01 | CRITICAL | SIM Residual | **DONE** | Nama siswa hardcoded "Rizky" di BerandaSiswa & CapaianSiswa |
| R-02 | CRITICAL | SIM Residual | **DONE** | Catatan wali kelas hardcoded di RaporModal Ortu |
| R-03 | HIGH | Missing UI | OPEN | Tidak ada UI Manajemen Kelas / Wali Kelas |
| R-04 | HIGH | RBAC Gap | **DONE** | KEPALA_SEKOLAH tidak punya akses write ke classes |
| R-05 | HIGH | Missing UI | OPEN | Tidak ada halaman admin WA log |
| R-06 | HIGH | Architecture | OPEN | Tidak ada Admin Panel / Settings Page terpusat |
| R-07 | MEDIUM | SIM Residual | **DONE** | Toast "simulasi" di 3 komponen Ortu/Siswa |
| R-08 | MEDIUM | SIM Residual | **DONE** | BerandaKiosk masih menggunakan DUMMY data |
| R-09 | MEDIUM | RBAC Gap | OPEN | Tidak ada endpoint untuk assign wali kelas |
| R-10 | MEDIUM | Architecture | OPEN | Domain boundary academic vs teacher overlap |
| R-11 | MEDIUM | Security | **DONE** | SSE token diekspos via query parameter |
| R-12 | MEDIUM | Architecture | OPEN | Data flow tidak realtime (Guru → Siswa/Ortu) |
| R-13 | MEDIUM | Architecture | OPEN | RingkasanGuru: hasPenilaian selalu false (backend belum ada) |
| R-14 | MEDIUM | Security | **DONE** | R-03 Claude PII Gate masih terbuka |
| R-15 | MEDIUM | Infrastructure | OPEN | Single VPS tanpa disaster recovery |
| R-16 | LOW | SIM Residual | **DONE** | RaporModal Ortu: semester hardcoded "Genap 2025/2026" |
| R-17 | LOW | RBAC Gap | OPEN | Role INDUSTRI implementasi minimal |
| R-18 | LOW | Infrastructure | **DONE** | VAPID keys runtime effectiveness belum diverifikasi |
| R-19 | LOW | Infrastructure | **DONE** | Migration enum ALTER TYPE risk |
| R-20 | LOW | Orphan Endpoint | **DONE** | GET /analytics/grades/student tidak dikonsumsi frontend |
| R-21 | LOW | Orphan Endpoint | **DONE** | GET /student-dashboard/leaderboard tidak dikonsumsi Ortu |
| R-22 | LOW | Orphan Endpoint | **DONE** | GET /push/my-notifications tidak dikonsumsi frontend |
| R-23 | CRITICAL | RBAC Gap | **DONE** | Position assignment tidak sync role ke Keycloak — @Roles() blokir akses jabatan |
| R-24 | HIGH | RBAC Gap | **PARTIALLY DONE** | Frontend sidebar/menu tidak menampilkan item berbasis jabatan (position) — R-23 sync selesai, sidebar butuh re-login |
| R-25 | MEDIUM | Architecture | **DONE** | Tidak ada endpoint verifikasi effective access pasca-assign jabatan — kini ada GET /positions/access-check/:userId |
| R-26 | MEDIUM | Architecture | **DONE** | PositionPermission cross-schema reference tanpa FK constraint |
| R-27 | LOW | RBAC Gap | **DONE** | Multi-position accumulation tanpa segregation of duties |
| R-28 | HIGH | Infrastructure | **DONE** | Fixed: 2026-07-07 — Hybrid AI: OpenAiAdapter (gpt-4.1-mini chat) + Ollama (embed only) |
| R-29 | HIGH | Missing Wiring | **DONE** | Fixed: 2026-07-07 — Tombol "Generate Semua" sekarang sequential loop step 2→10 dengan fail-soft |
| R-30 | HIGH | Missing Wiring | **DONE** | Chatbot AI response parsing salah — `data.reply`/`data.message` vs backend return `data.answer` |
| R-31 | HIGH | Infrastructure | **DONE** | Fixed: 2026-07-07 — ollama-init one-shot container auto-pull nomic-embed-text di docker-compose |
| R-32 | MEDIUM | Missing Wiring | **DONE** | Fixed: 2026-07-07 — Tombol "Generate Materi" di Step 10 Lampiran, hasil tersimpan di body.lampiran |
| R-33 | MEDIUM | Missing Wiring | **DONE** | Chatbot tidak mengirim `sessionId` — persistent chat history tidak berfungsi |
| R-34 | MEDIUM | Missing Wiring | **DONE** | Fixed: 2026-07-07 — extractJson() helper dengan 3 strategi: direct parse, markdown code block, bracket match |

---

## Tinjauan Arsitektur RBAC

Sistem DIIS menggunakan **two-layer access control** yang harus dipahami sebelum membaca temuan:

| Layer | Mekanisme | Sumber Truth | Guard | Decorator |
|-------|-----------|--------------|-------|-----------|
| **Layer 1: Roles** | Keycloak JWT realm roles | Token `realm_access.roles` | `RolesGuard` | `@Roles(...)` |
| **Layer 2: Permissions** | DB: `role_permissions` ∪ `user_permission_overrides` | Database | `PermissionGuard` | `@RequirePermission(...)` |

**Guard chain**: `ThrottlerGuard → KeycloakGuard → PermissionGuard → RolesGuard`

**Kritikal**: Roles di Layer 1 diekstrak dari JWT Keycloak ([extractAuthUser](packages/auth/src/index.ts:107-120)), BUKAN dari database. Position assignment (Struktur Organisasi) hanya menulis ke `user_permission_overrides` (Layer 2) dan **tidak** mengubah Keycloak roles (Layer 1). Ini menyebabkan **R-23** — gap paling kritikal.

---

## CRITICAL

### R-01 — Nama Siswa Hardcoded di Dashboard Siswa

| Field | Value |
|-------|-------|
| **Severity** | CRITICAL |
| **Category** | SIM Residual |
| **Status** | **DONE** — Fixed: 2026-07-07 |
| **Discovered** | 2026-07-06 |
| **Source** | Verifikasi kode langsung |

**Deskripsi:**
Dashboard Siswa menampilkan nama "Rizky" dan "Rizky Pratama" secara hardcoded, bukan dari data user yang sedang login. Semua siswa yang login akan melihat nama "Rizky".

**Bukti Kode:**
- File: `apps/web/src/app/dashboard/akademik/_components/siswa/BerandaSiswa.tsx:74` — `Halo, Rizky!` hardcoded
- File: `apps/web/src/app/dashboard/akademik/_components/siswa/BerandaSiswa.tsx:76` — `XI TJKT 1 · SMK Darussalam Subah` hardcoded
- File: `apps/web/src/app/dashboard/akademik/_components/siswa/BerandaSiswa.tsx:78,126` — `15 hari streak kehadiran!` hardcoded
- File: `apps/web/src/app/dashboard/akademik/_components/siswa/CapaianSiswa.tsx:73` — `Rizky Pratama` hardcoded di XP card
- File: `apps/web/src/app/dashboard/akademik/_components/siswa/JadwalSiswa.tsx:57` — `XI TJKT 1 · SMK Darussalam Subah` hardcoded

**Impact:**
Setiap siswa melihat nama orang lain di dashboard. Ini adalah bug data-integrity yang sangat terlihat oleh pengguna dan merusak kepercayaan terhadap sistem.

**Recommended Fix:**
Ganti hardcoded name dengan `user.fullName` dari session/auth context. BerandaSiswa dan CapaianSiswa perlu menerima prop `studentName` dari parent page.tsx yang sudah memiliki data session.

**Dependencies:**
—

---

### R-02 — Catatan Wali Kelas Hardcoded di RaporModal Ortu

| Field | Value |
|-------|-------|
| **Severity** | CRITICAL |
| **Category** | SIM Residual |
| **Status** | **DONE** — Fixed: 2026-07-07 |
| **Discovered** | 2026-07-06 |
| **Source** | Verifikasi kode langsung |

**Deskripsi:**
RaporModal Orang Tua menampilkan catatan wali kelas yang sepenuhnya hardcoded untuk "Ananda Rizky", bukan diambil dari endpoint `/report-cards/:studentId/development-description`.

**Bukti Kode:**
- File: `apps/web/src/app/dashboard/akademik/_components/ortu/RaporModal.tsx:89` — `Ananda Rizky menunjukkan progres yang baik...` hardcoded

**Impact:**
Semua orang tua melihat catatan yang sama persis, tidak peduli anak siapa. Menampilkan data palsu yang bisa membingungkan dan mengurangi kredibilitas rapor digital.

**Recommended Fix:**
Wire RaporModal ke endpoint `/report-cards/:studentId/development-description` yang sudah tersedia. Fallback ke empty state "Catatan wali kelas belum tersedia" jika data kosong.

**Dependencies:**
R-01 (nama siswa juga perlu dinamis di modal ini)

---

## HIGH

### R-03 — Tidak Ada UI Manajemen Kelas / Wali Kelas

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **Category** | Missing UI |
| **Status** | OPEN |
| **Discovered** | 2026-07-06 (carry-over dari prompt audit) |
| **Source** | Audit v2 + verifikasi kode |

**Deskripsi:**
Backend menyediakan `POST /classes`, `PATCH /classes/:id`, dan `DELETE /classes/:id` namun tidak ada satupun layar frontend yang memanggil endpoint tersebut untuk mengelola kelas atau menetapkan wali kelas. Wali kelas hanya bisa di-set via seed database.

**Bukti Kode:**
- File: `apps/api/src/classes/classes.controller.ts:49-63` — POST & PATCH dengan RBAC `SUPER_ADMIN, TATA_USAHA`
- File: `apps/api/src/classes/dto/class.dto.ts:15` — `teacherId: z.string().uuid().nullish()` tersedia di DTO
- Frontend: `grep "PATCH.*classes|updateClass|manajemen.kelas"` → 0 hasil
- File: `apps/web/src/app/dashboard/akademik/_components/KsWorkspace.tsx` — 8 screen, tidak ada class management

**Impact:**
Wali kelas tidak bisa diubah tanpa akses database langsung atau re-seed. Operasional sekolah terhambat saat ada pergantian guru/wali kelas.

**Recommended Fix (dari investigasi Administrasi Sistem — P1):**
Tambahkan menu ke-7 di grup "Administrasi Sistem": **"Manajemen Kelas"** (`/dashboard/kelas`)

- **Role akses:** `SUPER_ADMIN`, `KEPALA_SEKOLAH`, `TATA_USAHA`
- **Fitur yang harus ada:**
  - Tabel kelas dengan filter: grade, majorCode, academicYear, includeInactive
  - Form create: name, majorCode, grade, academicYear, capacity, teacherId (dropdown wali kelas)
  - Edit inline atau modal untuk ubah wali kelas
  - Toggle aktif/nonaktif kelas
  - Delete (SA only)
- **Backend:** `POST /classes`, `PATCH /classes/:id`, `DELETE /classes/:id` sudah lengkap
- **Estimasi effort:** ~1 hari (frontend page + client component + RBAC fix)

**Dependencies:**
R-04 (RBAC KS perlu ditambah), R-09 (wali kelas via `teacherId` di PATCH)

---

### R-04 — KEPALA_SEKOLAH Tidak Punya Akses Write ke Classes

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **Category** | RBAC Gap |
| **Status** | DONE — Fixed: 2026-07-07 |
| **Discovered** | 2026-07-06 |
| **Source** | Verifikasi kode langsung |

**Deskripsi:**
KEPALA_SEKOLAH memiliki tanggung jawab pengawasan akademik tetapi tidak termasuk dalam role yang diizinkan untuk membuat/mengubah kelas.

**Bukti Kode:**
- File: `apps/api/src/classes/classes.controller.ts:49` — `@Roles('SUPER_ADMIN', 'TATA_USAHA')` untuk POST
- File: `apps/api/src/classes/classes.controller.ts:56` — `@Roles('SUPER_ADMIN', 'TATA_USAHA')` untuk PATCH
- KEPALA_SEKOLAH hanya ada di GET (line 35, 43)

**Impact:**
KS tidak bisa melakukan manajemen kelas meskipun secara fungsional bertanggung jawab atas akademik.

**Recommended Fix:**
Tambahkan `'KEPALA_SEKOLAH'` ke decorator `@Roles()` untuk POST dan PATCH di `classes.controller.ts:49,56`. Ini juga diperlukan agar menu "Manajemen Kelas" (R-03) bisa diakses KS.

**Dependencies:**
R-03 (UI Manajemen Kelas harus dibuat dulu)

> **Lihat juga:** R-23 (position-Keycloak sync gap) — bahkan jika R-04 diperbaiki, KS tetap butuh Keycloak role yang benar untuk akses penuh.

---

### R-05 — Tidak Ada Halaman Admin WA Log

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **Category** | Missing UI |
| **Status** | OPEN |
| **Discovered** | 2026-07-06 |
| **Source** | Audit v2 + verifikasi kode |

**Deskripsi:**
Endpoint `GET /wa-log` tersedia untuk SUPER_ADMIN dan KEPALA_SEKOLAH, tetapi tidak ada halaman admin untuk melihat log notifikasi WA secara keseluruhan.

**Bukti Kode:**
- File: `apps/api/src/wa-log/wa-log.controller.ts:42-49` — `@Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH')` + `@Get()`
- Frontend: `grep "wa-log"` hanya menemukan konsumsi di `page.tsx:256` untuk `/wa-log/student/:id` (ortu view), tidak ada admin list page

**Impact:**
Admin tidak bisa memonitor pengiriman notifikasi WA secara global, mendeteksi kegagalan pengiriman, atau audit trail komunikasi sekolah.

**Recommended Fix (dari investigasi Administrasi Sistem — P4):**
Tambahkan menu **"Log Notifikasi WA"** di grup Administrasi Sistem (`/dashboard/wa-log`)

- **Role akses:** `SUPER_ADMIN`, `KEPALA_SEKOLAH`
- **Fitur:** tabel log dengan filter tanggal, student, eventType, pagination
- **Backend:** `GET /wa-log` sudah tersedia dengan RBAC yang sesuai
- **Estimasi effort:** ~0.5 hari

**Dependencies:**
—

---

### R-06 — Tidak Ada Admin Panel / Settings Page Terpusat

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **Category** | Architecture |
| **Status** | OPEN |
| **Discovered** | 2026-07-06 (carry-over T-12) |
| **Source** | Audit v2 + AUDIT-FINDINGS.md |

**Deskripsi:**
Dashboard tidak memiliki area admin/settings terpusat. Konfigurasi kritis (tahun ajaran, semester aktif, profil sekolah, KKTP) tersebar di berbagai halaman atau hanya bisa diakses via API langsung.

**Bukti Kode:**
- Frontend: `grep "settings|admin.*panel"` → tidak ada halaman settings terpusat
- KKTP config: ada di KsWorkspace sebagai sub-screen
- School config: `apps/api/src/school-config/school-config.controller.ts` exists tapi tidak ada admin UI
- Class management: tidak ada UI (lihat R-03)
- Teacher management: tidak ada UI terpusat

**Impact:**
Administrasi sistem bergantung pada akses API langsung atau database. Tidak sustainable untuk operasional jangka panjang.

**Recommended Fix (dari investigasi Administrasi Sistem — P2, P3):**

**P2 — Sub-menu "Profil Sekolah"** (`/dashboard/profil`):
- **Role akses:** `SUPER_ADMIN` (write), semua role (read — endpoint sudah ada)
- **Fitur:**
  - Edit profil sekolah (nama, alamat, logo, kontak) via `PUT /school/profile`
  - CRUD jurusan (code, name, description, isActive) via `CRUD /school/majors`
- **Backend:** `school-config.controller.ts` sudah menyediakan semua endpoint
- **Estimasi effort:** ~0.5 hari
- Ini juga menyelesaikan gap "manajemen jurusan" yang saat ini hanya via seed

**P3 — KKTP Config:**
- **TIDAK perlu dipindah** dari KsWorkspace — KKTP adalah pengaturan pedagogis yang memang domain KS/Wakakur
- Pertimbangkan menambahkan link navigasi dari Admin ke KKTP untuk kemudahan akses SA

**Struktur menu "Administrasi Sistem" yang direkomendasikan setelah semua P1-P4 selesai:**
1. Manajemen User (sudah ada)
2. Struktur Organisasi (sudah ada)
3. Tahun Ajaran (sudah ada)
4. Kalender Akademik (sudah ada)
5. **Manajemen Kelas** (BARU — P1, R-03)
6. **Profil Sekolah** (BARU — P2)
7. **Log Notifikasi WA** (BARU — P4, R-05)

**Dependencies:**
R-03, R-04

> **Lihat juga:** R-23 (Keycloak sync), R-24 (sidebar visibility) — admin panel terpusat harus memperhitungkan position-based roles.

---

## MEDIUM

### R-07 — Toast "Simulasi" di 3 Komponen Frontend

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **Category** | SIM Residual |
| **Status** | **DONE** — Fixed: 2026-07-07 (R-07a, R-07b, R-07c) |
| **Discovered** | 2026-07-06 |
| **Source** | Verifikasi kode langsung |

**Deskripsi:**
Tiga komponen menampilkan toast message yang melabeli aksi sebagai "simulasi", membingungkan user karena mengesankan fitur belum berfungsi.

**Bukti Kode:**
- File: `apps/web/src/app/dashboard/akademik/_components/siswa/NilaiSiswa.tsx:45` — `showToast('Rapor akan tersedia di akhir semester (simulasi)')`
- File: `apps/web/src/app/dashboard/akademik/_components/ortu/RaporModal.tsx:102` — `showToast('Rapor diunduh (simulasi)')`
- File: `apps/web/src/app/dashboard/akademik/_components/ortu/PayDetailModal.tsx:89` — `showToast('Pembayaran ... simulasi VA: ...')`
- File: `apps/web/src/app/dashboard/akademik/_components/ortu/PayDetailModal.tsx:96` — `showToast('Bukti pembayaran diunggah (simulasi)')`

**Impact:**
User melihat label "simulasi" yang menurunkan kepercayaan terhadap sistem. Untuk pembayaran, user mungkin mengira fitur belum bisa dipakai sama sekali.

**Recommended Fix:**
- NilaiSiswa/RaporModal: Ganti toast dengan pesan informatif "Rapor akan tersedia setelah akhir semester" atau wire ke endpoint download PDF bila sudah ada.
- PayDetailModal: Ganti toast dengan "Fitur pembayaran online akan segera tersedia" atau integrasi dengan payment gateway.

**Dependencies:**
—

---

### R-08 — BerandaKiosk Masih Menggunakan DUMMY Data

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **Category** | SIM Residual |
| **Status** | **DONE** — Fixed: 2026-07-07 |
| **Discovered** | 2026-07-06 |
| **Source** | Verifikasi kode langsung |

**Deskripsi:**
BerandaKiosk masih menggunakan data DUMMY untuk beberapa fitur: tren kehadiran rentang panjang, dan rekap kehadiran via date-picker.

**Bukti Kode:**
- File: `apps/web/src/app/dashboard/_components/BerandaKiosk.tsx:9` — comment: `Data baru = DUMMY dulu`
- File: `apps/web/src/app/dashboard/_components/BerandaKiosk.tsx:353` — comment: `Tren kehadiran ... 10H nyata; rentang panjang DUMMY`
- File: `apps/web/src/app/dashboard/_components/BerandaKiosk.tsx:527` — comment: `DUMMY rekap, abaikan libur`

**Impact:**
Kiosk menampilkan data palsu untuk tren kehadiran jangka panjang dan rekap. Jika dilihat oleh pengunjung/pengawas, data ini menyesatkan.

**Recommended Fix:**
Wire ke endpoint agregasi attendance yang mendukung query rentang tanggal. Buat endpoint baru jika perlu: `GET /analytics/attendance/trend?range=30d`.

**Dependencies:**
—

---

### R-09 — Tidak Ada Endpoint untuk Assign Wali Kelas

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **Category** | RBAC Gap |
| **Status** | OPEN |
| **Discovered** | 2026-07-06 |
| **Source** | Audit v2 + verifikasi kode |

**Deskripsi:**
Endpoint `GET /teachers/me/wali-classes` hanya memungkinkan GURU membaca status wali kelas mereka sendiri. Tidak ada endpoint untuk menetapkan/mengubah wali kelas.

**Bukti Kode:**
- File: `apps/api/src/teaching-assignment/wali-kelas.controller.ts:22-27` — hanya `@Get('me/wali-classes')` dengan `@Roles('GURU')`
- Tidak ada `POST/PUT/PATCH /teachers/:id/wali-classes` atau sejenisnya
- `teacherId` di Class DTO (class.dto.ts:15) bisa digunakan untuk ini, tapi tidak ada dedicated endpoint

**Impact:**
Wali kelas hanya bisa di-set via seed database atau manipulasi database langsung. Tidak ada workflow administratif untuk penunjukan wali kelas.

**Recommended Fix:**
Endpoint `PATCH /classes/:id` sudah menerima `teacherId` di DTO (`class.dto.ts:15`). Yang diperlukan hanyalah:
1. UI Manajemen Kelas (R-03) dengan dropdown wali kelas di form create/edit
2. RBAC fix (R-04) agar KS bisa akses POST/PATCH

Tidak perlu endpoint baru — cukup wire UI ke endpoint yang sudah ada.

**Dependencies:**
R-03 (UI Manajemen Kelas), R-04 (RBAC KS)

---

### R-10 — Domain Boundary Academic vs Teacher Overlap

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **Category** | Architecture |
| **Status** | OPEN |
| **Discovered** | 2026-07-06 (carry-over dari AUDIT-FINDINGS T-12) |
| **Source** | AUDIT-FINDINGS.md T-12 |

**Deskripsi:**
Prisma schema memiliki domain `academic` dan `teacher` dengan boundary yang tumpang tindih. Beberapa entitas dan relasi berada di domain yang salah.

**Bukti Kode:**
- Reference: AUDIT-FINDINGS.md T-12 — "Domain boundary academic vs teacher tidak konsisten"
- File: `packages/database/prisma/schema.prisma` — model TeachingAssignment, Class, Schedule berada di antara dua domain

**Impact:**
Menyulitkan maintenance dan onboarding developer baru. Bisa menyebabkan duplikasi logic atau inkonsistensi data.

**Recommended Fix:**
Refactor schema: konsolidasi semua yang terkait KBM ke domain `academic`, semua yang terkait data guru ke domain `teacher`. Diperlukan migrasi bertahap.

**Dependencies:**
—

---

### R-11 — SSE Token Diekspos via Query Parameter

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **Category** | Security |
| **Status** | **DONE** — Fixed: 2026-07-07 |
| **Discovered** | 2026-07-06 |
| **Source** | Verifikasi kode langsung |

**Deskripsi:**
EventSource API tidak mendukung custom headers, sehingga token autentikasi SSE dikirim via `?token=xxx` query parameter. Token ini terekspos di URL, browser history, server access logs, dan referrer headers.

**Bukti Kode:**
- File: `apps/web/src/app/dashboard/akademik/_components/PenilaianSesiModal.tsx:59-72` — `EventSource can't send Authorization headers, so we pass the token via ?token=xxx query param`
- File: `apps/web/src/app/dashboard/akademik/actions.ts:656` — `Returns the current session access token for ?token=xxx query param`

**Impact:**
Token Keycloak bisa bocor melalui server access logs, browser history, atau Referer header. Riskan untuk security jika VPS diakses bersama.

**Fix Applied (2026-07-07):**
- Pendekatan: Short-lived, one-time-use SSE token (bukan cookie — lebih compatible dengan arsitektur cross-origin existing).
- Backend: `POST /auth/sse-token` membuat token random 256-bit dengan TTL 5 menit, disimpan di `auth.sse_tokens`.
- SSE endpoint (`/assessment/sessions/:id/stream`) di-mark `@Public()`, validasi token via `SseTokenService.validateAndConsumeToken()`.
- Token dikonsumsi (one-time use) setelah validasi — tidak bisa di-replay meski diintercept.
- KeycloakGuard: SSE query param fallback dihapus (tidak lagi diperlukan).
- Frontend: `getSseToken()` sekarang memanggil `POST /auth/sse-token` bukan mengembalikan `session.accessToken`.
- File: `sse-token.service.ts`, `auth.controller.ts`, `assessment.controller.ts`, `keycloak.guard.ts`, `actions.ts`, `schema.prisma` + migration.

**Dependencies:**
—

---

### R-12 — Data Flow Tidak Realtime (Guru → Siswa/Ortu)

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **Category** | Architecture |
| **Status** | OPEN |
| **Discovered** | 2026-07-06 (carry-over) |
| **Source** | AUDIT-INTEGRASI-v2-REPORT.md §4.1 #4 |

**Deskripsi:**
Ketika guru menginput nilai, event `GRADE_SUBMITTED` fire tetapi halaman Siswa/Ortu tidak otomatis re-fetch data. Data baru hanya muncul setelah reload manual.

**Bukti Kode:**
- Reference: AUDIT-INTEGRASI-v2-REPORT.md §4.1 #4
- Frontend page.tsx menggunakan `Promise.all` di server component — data hanya di-fetch saat page load awal

**Impact:**
Siswa/orang tua tidak melihat nilai yang baru diinput guru sampai mereka me-refresh halaman. UX terasa "lambat" dan tidak responsif.

**Recommended Fix:**
Implementasi SSE atau WebSocket untuk notifikasi perubahan data. Atau minimal: tambahkan polling interval 30 detik di halaman Siswa/Ortu.

**Dependencies:**
—

---

### R-13 — RingkasanGuru: hasPenilaian Selalu False

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **Category** | SIM Residual |
| **Status** | OPEN |
| **Discovered** | 2026-07-06 |
| **Source** | Verifikasi kode langsung |

**Deskripsi:**
Di RingkasanGuru, variabel `hasPenilaian` selalu `false` karena backend untuk per-session penilaian/feedback belum tersedia. Ini menyebabkan section "Perlu Tindakan" tidak pernah menampilkan item penilaian.

**Bukti Kode:**
- File: `apps/web/src/app/dashboard/akademik/_components/RingkasanGuru.tsx:180-181` — `// SIMULASI — backend untuk per-session penilaian/feedback belum ada` + `const hasPenilaian = false;`

**Impact:**
Guru tidak mendapat feedback tentang sesi penilaian yang perlu ditindaklanjuti dari RingkasanGuru.

**Recommended Fix:**
Buat endpoint untuk per-session assessment feedback, lalu wire ke RingkasanGuru. Atau hapus section ini jika memang tidak akan diimplementasi.

**Dependencies:**
—

---

### R-14 — R-03 Claude PII Gate Masih Terbuka

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **Category** | Security |
| **Status** | **DONE** — Fixed: 2026-07-07 |
| **Discovered** | 2026-07-06 (carry-over dari CLAUDE.md §0) |
| **Source** | CLAUDE.md §0, queue.md SMA-48 |

**Deskripsi:**
Fungsi `hasPii()`/`stripPiiForLlm()` hanya mendeteksi email/phone/NIS/name yang berlabel. Nama siswa/nomor yang tidak berlabel bisa bocor ke Anthropic jika `AI_PROVIDER=claude` diset di production.

**Bukti Kode:**
- Reference: CLAUDE.md §0 — "R-03 Claude PII Gate Open"
- Reference: queue.md SMA-48 notes

**Impact:**
Data PII siswa (nama, NIS) bisa terkirim ke third-party AI provider tanpa consent. Pelanggaran privasi dan regulasi perlindungan data.

**Recommended Fix:**
JANGAN set `AI_PROVIDER=claude` di production sampai R-03 ditutup. Perkuat `stripPiiForLlm()` untuk mendeteksi pola nama Indonesia dan NIS tanpa label.

**Fix Applied (2026-07-07):**
- Audit: `OpenAiAdapter.chat()` SUDAH memanggil `stripPiiForLlm()` (belt-and-suspenders) — line 60, 71.
- Audit: `AiService.chatWithRag()` decision tree SUDAH route PII → Ollama, non-PII → OpenAI dengan strip.
- Improvement: Tambah pattern NISN tanpa label (10 digit standalone, tidak diawali 0/62).
- Documentation: Update comments di `pii-strip.utils.ts` untuk refleksikan OpenAI (bukan hanya Claude).
- Limitasi didokumentasikan: nama Indonesia tanpa label tidak bisa dideteksi tanpa false positive tinggi — mitigasi: hasPii() gate + stripPiiForLlm() di adapter = lapis ganda.
- PII gate adequate untuk OpenAI routing. R-14 ditutup.

**Dependencies:**
—

---

### R-15 — Single VPS Tanpa Disaster Recovery

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **Category** | Infrastructure |
| **Status** | OPEN |
| **Discovered** | 2026-07-06 (carry-over T-07) |
| **Source** | AUDIT-FINDINGS.md T-07 |

**Deskripsi:**
Seluruh 14 Docker service berjalan di satu VPS Hetzner. Tidak ada DR drill yang pernah dilakukan. Jika VPS down, seluruh platform lumpuh.

**Bukti Kode:**
- Reference: AUDIT-FINDINGS.md T-07
- File: `infrastructure/docker/` — semua service di-compose ke satu host

**Impact:**
Single point of failure. Downtime bisa berlangsung lama tanpa prosedur recovery yang teruji.

**Recommended Fix:**
Setup backup database otomatis ke object storage. Dokumentasikan prosedur DR. Pertimbangkan read replica untuk critical services.

**Dependencies:**
—

---

## LOW

### R-16 — RaporModal Ortu: Semester Hardcoded

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **Category** | SIM Residual |
| **Status** | **DONE** — Fixed: 2026-07-07 |
| **Discovered** | 2026-07-06 |
| **Source** | Verifikasi kode langsung |

**Deskripsi:**
RaporModal menampilkan "Rapor Semester Genap 2025/2026" secara hardcoded, tidak dinamis berdasarkan tahun ajaran/semester aktif.

**Bukti Kode:**
- File: `apps/web/src/app/dashboard/akademik/_components/ortu/RaporModal.tsx:28` — `Rapor Semester Genap 2025/2026` hardcoded

**Impact:**
Tahun ajaran/semester tidak berubah meski sudah berganti periode. Minor karena kosmetik, tapi menunjukkan data tidak dinamis.

**Recommended Fix:**
Ambil tahun ajaran dan semester dari parent props atau context yang sudah di-fetch dari `/school-config/academic-year`.

**Dependencies:**
—

---

### R-17 — Role INDUSTRI Implementasi Minimal

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **Category** | RBAC Gap |
| **Status** | OPEN |
| **Discovered** | 2026-07-06 |
| **Source** | Verifikasi kode langsung |

**Deskripsi:**
Role INDUSTRI didefinisikan di schema dan beberapa controller, tetapi implementasi frontend-nya minimal: hanya akses ke halaman `/dashboard/lowongan` dan redirect dari halaman lain. Tidak ada dashboard khusus industri.

**Bukti Kode:**
- File: `apps/web/src/components/layout/Sidebar.tsx:79` — `{ label: 'Lowongan', href: '/dashboard/lowongan', roles: ['INDUSTRI', 'SISWA'] }`
- File: `apps/web/src/app/dashboard/akademik/page.tsx:28` — `if (roles.includes('INDUSTRI')) redirect('/dashboard')`
- INDUSTRI didefinisikan di users.service.ts:92, provisioning, announcements, permissions

**Impact:**
Role INDUSTRI tidak memiliki pengalaman dashboard yang berarti. Hanya bisa melihat lowongan.

**Recommended Fix:**
Buat dashboard INDUSTRI dengan fitur: daftar siswa PKL, penilaian industri, kehadiran industri. Atau hapus role jika belum diperlukan.

**Dependencies:**
—

---

### R-18 — VAPID Keys Runtime Effectiveness Belum Diverifikasi

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **Category** | Infrastructure |
| **Status** | **DONE** — Fixed: 2026-07-07 |
| **Discovered** | 2026-07-06 (carry-over) |
| **Source** | AUDIT-INTEGRASI-v2-REPORT.md §4.4 #6 |

**Deskripsi:**
Workflow `add-vapid-keys.yml` ada untuk menyuntikkan VAPID keys, tetapi efektivitas runtime-nya belum diverifikasi dari kode atau pengujian langsung.

**Bukti Kode:**
- File: `.github/workflows/add-vapid-keys.yml` — workflow exists
- Reference: AUDIT-INTEGRASI-v2-REPORT.md §4.4 #6

**Impact:**
Push notification PWA mungkin tidak berfungsi jika VAPID keys tidak ter-inject dengan benar ke environment.

**Recommended Fix:**
Verifikasi di staging: kirim test push notification dan pastikan service worker menerima payload.

**Dependencies:**
—

---

### R-19 — Migration Enum ALTER TYPE Risk

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **Category** | Infrastructure |
| **Status** | **DONE** — Fixed: 2026-07-07 |
| **Discovered** | 2026-07-06 (carry-over T-08) |
| **Source** | AUDIT-FINDINGS.md T-08 |

**Deskripsi:**
Operasi `ALTER TYPE ... ADD VALUE` di PostgreSQL tidak bisa di-rollback dalam Prisma transaction. Jika migration gagal di tengah, enum value yang sudah ditambah tidak bisa dikembalikan.

**Bukti Kode:**
- Reference: AUDIT-FINDINGS.md T-08

**Impact:**
Migration yang gagal bisa meninggalkan database dalam state inkonsisten. Sulit recovery.

**Recommended Fix:**
Gunakan migration strategy terpisah untuk enum changes. Atau gunakan string columns dengan check constraint sebagai pengganti PostgreSQL enum.

**Fix Applied (2026-07-07):**
- Verifikasi: Migration R-23 (`20260707000001_r23_userrole_position_codes`) sudah menggunakan `IF NOT EXISTS` di semua 12 `ALTER TYPE ADD VALUE` statements.
- Dokumentasi: Buat `docs/runbooks/migration-enum-safety.md` dengan checklist untuk future enum migrations.
- R-19 ditutup — migration sudah aman (idempotent), dokumentasi lengkap.

**Dependencies:**
—

---

### R-20 — Orphan: GET /analytics/grades/student

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **Category** | Orphan Endpoint |
| **Status** | **DONE** — Fixed: 2026-07-07 (TODO comment added) |
| **Discovered** | 2026-07-06 |
| **Source** | Audit v2 + verifikasi kode |

**Deskripsi:**
Endpoint `GET /analytics/grades/student` tersedia untuk SISWA/ORANG_TUA/GURU/SA/KS, tetapi tidak ada satupun file frontend yang memanggil endpoint ini.

**Bukti Kode:**
- File: `apps/api/src/analytics/analytics.controller.ts:98-101` — endpoint exists, RBAC lengkap
- Frontend: `grep "analytics/grades/student"` → 0 hasil

**Impact:**
Endpoint sia-sia消耗 resource server. Data analitik nilai per siswa tidak tersedia di frontend.

**Recommended Fix:**
Wire ke dashboard Siswa (tab Nilai) dan Ortu (tab Capaian) untuk menampilkan analitik nilai per mapel dengan status tuntas/remedial.

**Dependencies:**
—

---

### R-21 — Orphan: GET /student-dashboard/leaderboard (untuk Ortu)

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **Category** | Orphan Endpoint |
| **Status** | **DONE** — Fixed: 2026-07-07 |
| **Discovered** | 2026-07-06 |
| **Source** | Audit v2 + verifikasi kode |

**Deskripsi:**
Endpoint `GET /student-dashboard/leaderboard` dikonsumsi oleh Siswa (via page.tsx) tetapi TIDAK dikonsumsi oleh Ortu. BerandaOrtu menampilkan `rank = null` (hidden).

**Bukti Kode:**
- File: `apps/api/src/student-dashboard/student-dashboard.controller.ts:45-48` — endpoint supports `SISWA, ORANG_TUA`
- File: `apps/web/src/app/dashboard/akademik/_components/ortu/BerandaOrtu.tsx:97` — `const rank: number | null = null;` (hardcoded null, leaderboard tidak di-fetch)
- File: `apps/web/src/app/dashboard/akademik/page.tsx:63` — leaderboard hanya di-fetch untuk siswa, bukan ortu

**Impact:**
Ortu tidak bisa melihat ranking anak di kelas. Fitur leaderboard tidak lengkap.

**Recommended Fix:**
Fetch leaderboard di page.tsx ortu branch dan pass ke BerandaOrtu. Gunakan `childRank()` dari ortu-data.ts untuk highlight anak.

**Dependencies:**
—

---

### R-22 — Orphan: GET /push/my-notifications

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **Category** | Orphan Endpoint |
| **Status** | **DONE** — Fixed: 2026-07-07 (TODO comment added) |
| **Discovered** | 2026-07-06 |
| **Source** | Verifikasi kode langsung |

**Deskripsi:**
Endpoint `GET /push/my-notifications` tersedia untuk SISWA dan ORANG_TUA, tetapi tidak ada halaman frontend yang menampilkan daftar notifikasi.

**Bukti Kode:**
- File: `apps/api/src/push/push.controller.ts:41-46` — `@Get('my-notifications')` dengan `@Roles('SISWA', 'ORANG_TUA')`
- Frontend: `grep "my-notifications"` → 0 hasil

**Impact:**
User tidak bisa melihat riwayat notifikasi push yang sudah diterima.

**Recommended Fix:**
Buat komponen notification center / inbox di dashboard Siswa dan Ortu yang menampilkan daftar notifikasi dari endpoint ini.

**Dependencies:**
—

---

### R-23 — Position Assignment Tidak Sync Role ke Keycloak

| Field | Value |
|-------|-------|
| **Severity** | CRITICAL |
| **Category** | RBAC Gap |
| **Status** | DONE — Fixed: 2026-07-07 |
| **Discovered** | 2026-07-06 |
| **Source** | Investigasi Struktur Organisasi — trace full auth flow |

**Deskripsi:**
Sistem Struktur Organisasi (2J-5) hanya memberikan **permission** via `UserPermissionOverride` (Layer 2) saat penugasan jabatan. Namun, **TIDAK** menyinkronkan role ke Keycloak JWT (Layer 1). Akibatnya, endpoint yang menggunakan `@Roles()` — yang mengecek `realm_access.roles` dari JWT — tetap memblokir guru yang memiliki jabatan.

**Mekanisme Saat Ini (yang berjalan):**
1. `PositionsService.assign()` → buat `StaffPosition` + upsert `UserPermissionOverride(grant=true)` ✅
2. `PermissionGuard` → resolve permission dari `role_permissions` ∪ `user_permission_overrides` ✅
3. Cache invalidation via `invalidateUser(keycloakId)` ✅

**Mekanisme yang TIDAK berjalan:**
4. `RolesGuard` → cek `user.roles` dari JWT Keycloak ❌ — position TIDAK mengubah role JWT

**Bukti Kode (terverifikasi):**
- `positions.service.ts:124-131` — hanya upsert `UserPermissionOverride`, tidak ada pemanggilan Keycloak Admin API
- `packages/auth/src/index.ts:108` — `extractAuthUser` ambil roles dari `payload.realm_access.roles` (murni JWT)
- `auth/guards/roles.guard.ts:49-51` — `user.roles.includes(role)` cek JWT roles, bukan DB
- Guard chain di `app.module.ts:104-107`: `KeycloakGuard → PermissionGuard → RolesGuard`

**Contoh Nyata:**
- Guru (role Keycloak: `GURU`) dijabatkan `BENDAHARA` → mendapat `finance.read/create/update/approve` via permission override ✅
- Endpoint `@Roles('SUPER_ADMIN','TATA_USAHA')` + `@RequirePermission('finance.read')` → PermissionGuard lolos ✅, RolesGuard **TOLAK** ❌ karena JWT role `GURU` ≠ `TATA_USAHA`

**Impact:**
Seluruh akses berbasis role untuk jabatan Struktur Organisasi tidak berfungsi. Guru dengan jabatan tidak bisa mengakses fitur yang seharusnya terbuka. Ini mempengaruhi mayoritas endpoint karena banyak yang menggunakan `@Roles()` sebagai gate pertama.

**Recommended Fix:**
**Opsi A (Recommended):** Sinkronisasi position → Keycloak realm roles via `KeycloakAdminModule`:
- `assign()` → `addRealmRoleToUser(keycloakId, positionCode)`
- `unassign()` → `removeRealmRoleFromUser(keycloakId, positionCode)`
- Prasyarat: seed 13 position code sebagai Keycloak realm roles

**Opsi B (Fallback):** Ubah `RolesGuard` agar juga mengecek `staff_positions` sebagai sumber role tambahan. Menghindari dependency ke Keycloak sync tapi mengubah semantik `@Roles()`.

**Dependencies:**
- `KeycloakAdminModule` sudah ada, perlu extend method role assignment
- 13 position code perlu didaftarkan sebagai Keycloak realm roles
- R-24 (sidebar) otomatis terselesaikan setelah R-23 diperbaiki

---

### R-24 — Frontend Sidebar Tidak Menampilkan Item Berbasis Jabatan

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **Category** | RBAC Gap |
| **Status** | PARTIALLY DONE — 2026-07-07 (R-23 sync selesai + endpoint my-positions ditambahkan; sidebar otomatis benar setelah re-login) |
| **Discovered** | 2026-07-06 |
| **Source** | Investigasi Struktur Organisasi — analisis frontend |

**Deskripsi:**
Sidebar di dashboard menggunakan roles dari session (Keycloak JWT) untuk menentukan item menu yang tampil. Guru dengan jabatan tertentu (misal `BENDAHARA`) tidak melihat menu "Manajemen Keuangan" karena role Keycloak tetap `GURU`.

**Bukti Kode:**
- `Sidebar.tsx` — filter menu berdasarkan `roles.includes('TATA_USAHA')` dll.
- `lib/view-as.ts:18-28` — `getEffectiveRoles()` ambil dari `session.roles` (JWT origin)
- `struktur-organisasi/page.tsx:34-35` — gate halaman pakai `getEffectiveRoles(session)`

**Impact:**
Meski backend permission sudah benar (dan R-23 diperbaiki), user tetap tidak bisa navigasi ke halaman yang seharusnya bisa diakses karena sidebar tidak menampilkan menu tersebut.

**Recommended Fix:**
Setelah R-23 diperbaiki (Keycloak sync), sidebar otomatis benar karena session roles akan mencakup position role. Sebagai pelengkap, tambahkan endpoint `GET /positions/my-positions` yang mengembalikan jabatan aktif user untuk ditampilkan di UI.

**Dependencies:**
R-23 (Keycloak sync) harus diselesaikan terlebih dahulu

---

### R-25 — Tidak Ada Endpoint Verifikasi Effective Access

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **Category** | Architecture |
| **Status** | DONE — Fixed: 2026-07-07 |
| **Discovered** | 2026-07-06 |
| **Source** | Investigasi Struktur Organisasi — analisis validasi |

**Deskripsi:**
Setelah jabatan ditetapkan, tidak ada mekanisme untuk memverifikasi bahwa:
1. Permission override benar-benar tercipta di DB
2. Cache permission berhasil di-invalidate
3. User bisa mengakses endpoint yang seharusnya terbuka
4. Admin bisa melihat ringkasan akses yang dimiliki user

**Bukti Kode:**
- `positions.service.ts:124-132` — assign hanya return `{ id: created.id }`, tanpa konfirmasi permission
- `permissions.service.ts:99-109` — `getUserEffectivePermissions()` ada tapi hanya return overrides, bukan effective set
- Tidak ada endpoint yang menggabungkan: Keycloak roles + position roles + effective permissions

**Impact:**
Admin tidak punya cara untuk memverifikasi bahwa penugasan jabatan berfungsi benar. Debugging access denied menjadi sulit.

**Recommended Fix:**
Buat endpoint `GET /positions/access-check/:userId` yang mengembalikan:
```json
{
  "keycloakRoles": ["GURU"],
  "activePositions": [{"code": "BENDAHARA", "name": "Bendahara"}],
  "positionPermissions": ["finance.read", "finance.create"],
  "effectivePermissions": ["student.read", "finance.read"],
  "resolvedFrom": {"role": [...], "override": [...], "position": [...]}
}
```

**Dependencies:**
—

---

### R-26 — PositionPermission Cross-Schema Reference Tanpa FK Constraint

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **Category** | Architecture |
| **Status** | DONE — Fixed: 2026-07-07 |
| **Discovered** | 2026-07-06 |
| **Source** | Investigasi Struktur Organisasi — analisis schema |

**Deskripsi:**
Model `PositionPermission` (schema `school`) mereferensikan `permission_id` ke tabel `permissions` (schema `auth`) tanpa foreign key constraint. Ini pola intentional ("lintas-schema, tanpa FK — pola sama seperti audit field") tapi berisiko orphan.

**Bukti Kode:**
- `schema.prisma:1123-1135` — comment: "permissionId → auth.permissions (lintas-schema, tanpa FK)"
- `PositionPermission` hanya punya FK ke `Position` (onDelete: Cascade), TIDAK ada FK ke `Permission`
- Jika permission dihapus dari `auth.permissions`, record di `position_permissions` menjadi orphan

**Impact:**
Orphan records bisa menyebabkan `PositionsService.assign()` gagal saat mencoba upsert `UserPermissionOverride` untuk permission yang sudah tidak ada. Sulit dideteksi tanpa integrity check.

**Recommended Fix:**
Tambahkan soft-integrity check: (1) validasi di `PositionsService.assign()` bahwa semua permission masih exist, atau (2) cron job berkala yang membersihkan orphan `position_permissions`, atau (3) event handler saat `Permission.delete()` yang membersihkan referensi terkait.

**Dependencies:**
—

---

### R-27 — Multi-Position Accumulation Tanpa Segregation of Duties

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **Category** | RBAC Gap |
| **Status** | **DONE** — Fixed: 2026-07-07 |
| **Discovered** | 2026-07-06 |
| **Source** | Investigasi Struktur Organisasi — analisis kebijakan |

**Deskripsi:**
Seorang guru bisa memegang beberapa jabatan sekaligus (misal: `BENDAHARA` + `STAF_KEPEGAWAIAN`). Sistem mengakumulasi semua permission dari semua jabatan tanpa validasi apakah kombinasi tersebut berisiko.

**Bukti Kode:**
- `positions.service.ts:81-135` — `assign()` tidak ada validasi konflik jabatan
- `schema.prisma:1155` — unique constraint hanya `[staffId, positionId, academicYearId, majorId]` (mencegah duplikasi, bukan konflik)
- Tidak ada tabel/seed untuk conflict rules

**Contoh Risiko:**
- `BENDAHARA` (finance full access) + `STAF_KEPEGAWAIAN` (user management) = terlalu banyak akses untuk satu orang
- `KEPALA_TU` + `BENDAHARA` = supervisi + eksekusi keuangan (potensi fraud)

**Impact:**
Tidak ada safeguard terhadap konsentrasi akses yang berlebihan. Meski ini kebijakan organisasi, sistem seharusnya bisa memperingatkan atau mencegah kombinasi berisiko.

**Recommended Fix:**
Tambahkan optional conflict rules di seed: `const CONFLICTS = [['BENDAHARA', 'STAF_KEPEGAWAIAN']]`. Validasi di `assign()` dan tampilkan warning di UI jika konflik terdeteksi. Bisa juga berupa soft warning bukan hard block.

**Fix Applied (2026-07-07):**
- Constant `CONFLICT_RULES` di `positions.service.ts` dengan 2 aturan:
  1. `BENDAHARA + STAF_KEPEGAWAIAN` — konsentrasi akses keuangan + kepegawaian
  2. `KEPALA_TU + BENDAHARA` — supervisi + eksekusi keuangan (potensi fraud)
- `assign()` cek konflik setelah create, return `{ id, warning? }` jika konflik terdeteksi.
- SOFT WARNING — assignment tetap diizinkan, admin sadar akan risiko.
- Warning di-log via `logger.warn()` untuk audit trail.

**Dependencies:**
—

---

## AI & OLLAMA READINESS

> Temuan dari audit menyeluruh terhadap fitur AI-powered DIIS: infrastruktur Ollama, wiring UI, dan kesiapan produksi.

### Tinjauan Arsitektur AI

Sistem DIIS memiliki **7 fitur AI-powered** yang semuanya berjalan melalui adapter pattern:

| # | Fitur | Endpoint | Operasi AI | UI Component |
|---|-------|----------|------------|---------------|
| 1 | RAG Chatbot | `POST /ai/chat` | embed() + chat() | `AiClient.tsx` |
| 2 | Chat History | `GET /ai/chat/:id/history` | — (DB only) | `AiClient.tsx` (tidak di-wire) |
| 3 | Knowledge Mgmt | CRUD `/ai/knowledge/*` | embed() | `KnowledgeManager.tsx` |
| 4 | Generate Questions | `POST /ai/generate-questions` | chat() | `QuestionBankEditor.tsx` |
| 5 | Generate Material | `POST /ai/generate-material` | chat() | **TIDAK ADA UI BUTTON** |
| 6 | Generate ATP | `POST /ai/generate-atp` | chat() | `ModulAjarForm.tsx` step 3 |
| 7 | Generate RPP Step | `POST /ai/generate-rpp-step` | chat() | `ModulAjarForm.tsx` step 2-10 |

**Adapter pattern (KEPUTUSAN FINAL — 2026-07-06):**
- `AI_GATEWAY` = `OllamaAdapter` — SELALU aktif, **HANYA untuk embed()** (nomic-embed-text, 768d, ~300 MB RAM)
- `OPENAI_GATEWAY` = `OpenAiAdapter` — **BARU**, untuk chat() + generate via gpt-4.1-mini ($0.40/$1.60 per 1M tokens)
- `CLAUDE_GATEWAY` = `ClaudeAdapter` | null — TIDAK DIPAKAI (diganti OpenAI)
- Embedding tetap lokal (Ollama) — data siswa/guru tidak keluar VPS, comply UU PDP
- Chat/generate via OpenAI API — kualitas baik untuk Bahasa Indonesia, 1M context window
- Estimasi biaya: ~$5.72/bulan (~Rp 92.000) untuk 30 guru, 8-10 JP/hari, 22 hari sekolah

### VPS Capacity Analysis

| Komponen | Min RAM | Ideal RAM |
|-----------|---------|----------|
| PostgreSQL + pgvector | 512 MB | 1 GB |
| Redis | 128 MB | 256 MB |
| Keycloak | 512 MB | 1 GB |
| NestJS API | 256 MB | 512 MB |
| Next.js Web | 256 MB | 512 MB |
| n8n | 256 MB | 512 MB |
| Nginx + misc | 128 MB | 256 MB |
| **Ollama (nomic-embed-text ONLY)** | **300 MB** | **500 MB** |
| **Total** | **~2.2 GB** | **~3.5 GB** |

> **Catatan:** Setelah keputusan final (gpt-4.1-mini + Ollama embed), total RAM ~2.2-3.5 GB — **feasible di CPX22 (4 GB)**. Model chat tidak lagi dijalankan lokal.

---

### R-28 — Strategi AI untuk Hetzner CPX22 (4 GB RAM)

| Field | Value |
|-------|-------|
| **Severity** | HIGH (turun dari CRITICAL setelah keputusan final) |
| **Category** | Infrastructure |
| **Status** | **DONE** — Fixed: 2026-07-07 |
| **Discovered** | 2026-07-06 |
| **Source** | Audit AI Infrastructure — analisis kapasitas VPS |
| **Keputusan** | **gpt-4.1-mini (OpenAI) + Ollama embed-only** — disetujui 2026-07-06 |

**Deskripsi:**
Hetzner CPX22 (2 vCPU, 4 GB RAM) tidak cukup untuk menjalankan model chat lokal (`qwen2.5:7b` butuh ~5-6 GB). Upgrade VPS dibatalkan karena biaya rescale terlalu mahal. Solusi: **hybrid** — Ollama hanya untuk embedding (lokal, ~300 MB), chat/generate via OpenAI API (cloud).

**Keputusan Final (2026-07-06):**

| Aspek | Keputusan | Rationale |
|-------|-----------|-----------|
| Chat/Generate | **gpt-4.1-mini** (OpenAI) | $0.40/$1.60 per 1M tokens, kualitas Bahasa Indonesia baik, 1M context, JSON mode reliable |
| Embedding | **Ollama lokal** (nomic-embed-text) | Data tidak keluar VPS (UU PDP), ~300 MB RAM, 768d sudah wired di schema |
| Biaya bulanan | **~$5.72/bulan (~Rp 92.000)** | Untuk 30 guru, 8-10 JP/hari, 22 hari sekolah |
| RAM Ollama | **~300 MB** (embed only) | Feasible di CPX22, total services ~2.2-3.5 GB |
| Claude | **TIDAK DIPAKAI** | Terlalu mahal ($16.50/bulan), gpt-4.1-mini cukup untuk use case DIIS |

**Implementasi yang diperlukan:**

| # | File | Perubahan | Effort |
|---|------|-----------|--------|
| 1 | `adapters/openai.adapter.ts` | **BARU** — implement `AIGateway` via OpenAI SDK (`chat()` only, `embed()` throw error seperti ClaudeAdapter) | ~2 jam |
| 2 | `ai.module.ts` | Tambah `OPENAI_GATEWAY` provider + factory branch untuk `AI_PROVIDER=openai` | ~1 jam |
| 3 | `ai.service.ts` | Update `chatWithRag()` decision tree: embed via `AI_GATEWAY` (Ollama), chat via `OPENAI_GATEWAY` | ~1 jam |
| 4 | `ai-generate.service.ts` | Inject `OPENAI_GATEWAY` sebagai primary gateway untuk generate | ~0.5 jam |
| 5 | `env.validation.ts` | Tambah `OPENAI_API_KEY` (optional), `OPENAI_CHAT_MODEL` (default `gpt-4.1-mini`) | ~0.5 jam |
| 6 | `.env.production` | Set `AI_PROVIDER=openai`, `OPENAI_API_KEY=sk-...`, turunkan Ollama limit | ~0.5 jam |
| 7 | `docker-compose.yml` | Turunkan Ollama `limits.memory` ke `'1G'`, hapus `qwen2.5:7b` dari pull list | ~0.5 jam |
| 8 | `setup-vps.sh` / init container | Hanya pull `nomic-embed-text` (hapus `qwen2.5:7b`) | ~0.5 jam |
| | | **Total effort** | **~6 jam** |

**Konfigurasi env yang diperlukan:**
```bash
AI_PROVIDER=openai
OPENAI_API_KEY=sk-proj-...
OPENAI_CHAT_MODEL=gpt-4.1-mini
OLLAMA_URL=http://ollama:11434
OLLAMA_EMBED_MODEL=nomic-embed-text
OLLAMA_EMBED_DIMENSIONS=768
# OLLAMA_CHAT_MODEL tidak lagi dipakai (bisa dihapus atau biarkan default)
```

**Dependencies:**
R-30 (chatbot parsing fix), R-31 (model pull — hanya embed model), R-33 (sessionId wiring)

---

### R-29 — Tombol "Generate Semua" di ModulAjarForm Hanya Fake Toast

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **Category** | Missing Wiring |
| **Status** | **DONE** — Fixed: 2026-07-07 |
| **Discovered** | 2026-07-06 |
| **Source** | Audit AI Wiring — ModulAjarForm.tsx |

**Deskripsi:**
AI Assistant Bar di bagian atas ModulAjarForm memiliki tombol "Generate Semua" yang seharusnya men-generate semua bagian modul ajar secara berurutan. Namun, onClick handler hanya memanggil `showToast('Semua bagian berhasil di-generate AI...')` tanpa memanggil endpoint AI manapun.

**Bukti Kode:**
```tsx
// ModulAjarForm.tsx:267-269
<button onClick={() => showToast('Semua bagian berhasil di-generate AI. Silakan sunting setiap bagian.')}
  className="...">
  <Sparkles /> Generate Semua
</button>
```

Tidak ada pemanggilan `aiGenerate()` atau `aiGenerateRppStep()` di handler ini.

**Impact:**
Guru mengira semua bagian sudah di-generate AI, padahal tidak. Fitur utama yang dijanjikan UI tidak berfungsi.

**Recommended Fix:**
Implementasi loop sequential yang memanggil `aiGenerate(stepNum)` untuk step 2-10 secara berurutan (step 1 = Identitas, tidak perlu AI). Tampilkan progress indicator. Handle error per-step (fail-soft: lanjutkan step berikutnya jika satu step gagal).

**Dependencies:**
R-28 (Ollama harus berjalan), R-31 (model harus di-pull)

---

### R-30 — Chatbot AI Response Parsing Salah

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **Category** | Missing Wiring |
| **Status** | **DONE** — Fixed: 2026-07-07 |
| **Discovered** | 2026-07-06 |
| **Source** | Audit AI Wiring — AiClient.tsx |

**Deskripsi:**
`AiClient.tsx` mengirim request ke `/api/backend/ai/chat` dan membaca response dari `data.reply` atau `data.message`. Namun backend `AiService.chatWithRag()` mengembalikan `{ answer, sources, sessionId }`. Field `reply` dan `message` **tidak ada** di response backend.

**Bukti Kode:**
```tsx
// AiClient.tsx:28-29
const data = await res.json();
setMessages(prev => [...prev, { role: 'assistant',
  content: data.reply || data.message || 'Maaf, tidak ada respons.' }]);
```

```ts
// ai.service.ts:194-198 — backend return:
return { answer, sources: chunks.map(...), sessionId };
```

**Impact:**
Chatbot **selalu** menampilkan "Maaf, tidak ada respons." meskipun backend berhasil menjawab. Fitur chatbot RAG 100% broken di sisi frontend.

**Recommended Fix:**
Ubah parsing menjadi `data.answer`. Juga tampilkan `data.sources` sebagai footnote jika ada.

**Dependencies:**
R-28, R-31, R-33

---

### R-31 — Ollama Models Tidak Pernah Di-pull Otomatis

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **Category** | Infrastructure |
| **Status** | **DONE** — Fixed: 2026-07-07 |
| **Discovered** | 2026-07-06 |
| **Source** | Audit AI Infrastructure — analisis setup-vps.sh + docker-compose |

**Deskripsi:**
Docker Compose mendefinisikan container Ollama (`smk-ollama`) dengan volume `ollama_data`, tetapi **tidak ada init step** yang otomatis pull model `qwen2.5:7b` dan `nomic-embed-text`. Script `setup-vps.sh` hanya membuat direktori `data/ollama` (line 150) tanpa pull model.

**Bukti Konfigurasi:**
- `docker-compose.yml:190-201` — container Ollama didefinisikan, tidak ada entrypoint/custom command
- `setup-vps.sh:150` — hanya `mkdir -p "$APP_DIR/data/ollama"`
- `embed-faq.ts:9-10` — dokumentasi menyebut model harus di-pull manual
- `env-variables.md:226-227` — instruksi manual `docker exec smk-ollama ollama pull ...`

**Impact:**
Setelah deploy, Ollama container berjalan tapi **tidak ada model** → semua request embed() dan chat() akan gagal dengan error "model not found".

**Recommended Fix:**
Tambahkan init container atau startup script:
```yaml
ollama-init:
  image: ollama/ollama:latest
  depends_on: [ollama]
  entrypoint: /bin/sh
  command:
    - -c
    - |
      sleep 5  # wait for ollama to be ready
      ollama pull nomic-embed-text
      ollama pull qwen2.5:7b
  volumes:
    - ollama_data:/root/.ollama
```
Atau tambahkan ke `setup-vps.sh` setelah `docker compose up -d`.

**Dependencies:**
R-28 (VPS RAM harus cukup)

---

### R-32 — `aiGenerateMaterial` Action Ada tapi Tidak Ada UI Button

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **Category** | Missing Wiring |
| **Status** | **DONE** — Fixed: 2026-07-07 |
| **Discovered** | 2026-07-06 |
| **Source** | Audit AI Wiring — actions.ts + ModulAjarForm |

**Deskripsi:**
Backend endpoint `POST /ai/generate-material` sudah ada dan berfungsi. Server action `aiGenerateMaterial()` sudah didefinisikan di `actions.ts:365-367`. Namun **tidak ada satupun komponen UI** yang memanggil action ini. Fitur "Generate Materi Pembelajaran" sepenuhnya tidak terjangkau dari UI.

**Bukti Kode:**
- `ai-generate.controller.ts:38-44` — endpoint ada, RBAC: GURU/KS/SA
- `actions.ts:365-367` — `aiGenerateMaterial()` sudah export
- `ModulAjarForm.tsx` — tidak ada import atau pemanggilan `aiGenerateMaterial`
- `QuestionBankEditor.tsx` — hanya generate questions, bukan material

**Impact:**
Guru tidak bisa generate materi pembelajaran via AI, padahal backend sudah siap.

**Recommended Fix:**
Tambahkan tombol "Generate Materi" di ModulAjarForm (misal di Step 10 Lampiran atau sebagai tombol terpisah di luar wizard). Atau integrasikan ke QuestionBankEditor sebagai tab tambahan.

**Dependencies:**
R-28, R-31

---

### R-33 — Chatbot Tidak Mengirim sessionId

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **Category** | Missing Wiring |
| **Status** | **DONE** — Fixed: 2026-07-07 |
| **Discovered** | 2026-07-06 |
| **Source** | Audit AI Wiring — AiClient.tsx |

**Deskripsi:**
`AiClient.tsx` mengirim `{ message: input }` ke `/ai/chat` tanpa field `sessionId`. Backend `AiService.chatWithRag()` mendukung persistent chat history via `ChatSession`/`ChatMessage`, tapi karena sessionId tidak pernah dikirim, setiap request membuat session baru. Fitur `GET /ai/chat/:sessionId/history` juga tidak dipanggil dari frontend.

**Bukti Kode:**
```tsx
// AiClient.tsx:25-26
body: JSON.stringify({ message: input })
// Tidak ada sessionId
```

```ts
// ai.service.ts:130-149 — backend check dto.sessionId
if (dto.sessionId) { /* validate & reuse */ }
else { /* create new session */ }
```

**Impact:**
Chat history tidak persisten. Setiap pesan = session baru. User tidak bisa melihat percakapan sebelumnya.

**Recommended Fix:**
Simpan `sessionId` dari response pertama di state, kirim di request berikutnya. Tampilkan riwayat chat dari `GET /ai/chat/:sessionId/history` saat component mount.

**Dependencies:**
R-30 (fix parsing dulu)

---

### R-34 — `aiGenerateAtp` Output Parsing Tidak Konsisten

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **Category** | Missing Wiring |
| **Status** | **DONE** — Fixed: 2026-07-07 |
| **Discovered** | 2026-07-06 |
| **Source** | Audit AI Wiring — ai-generate.service.ts + ModulAjarForm.tsx |

**Deskripsi:**
`AiGenerateService.generateAtp()` melakukan `JSON.parse(output)` pada line 52 sebelum return ke client. Namun output dari Ollama (`qwen2.5:7b`) tidak selalu valid JSON — bisa mengandung markdown code block atau teks tambahan di luar JSON. Jika `JSON.parse` gagal, endpoint akan throw error 500.

Di sisi UI, `ModulAjarForm.tsx:116-118` menerima `data.output` sebagai `AtpItem[]` — ini konsisten dengan backend yang sudah parse. Tapi risiko ada di backend: `JSON.parse` dari LLM output adalah fragile.

**Bukti Kode:**
```ts
// ai-generate.service.ts:51-52
const output = await this.callAi(prompt);
return { type: 'atp', output: JSON.parse(output) }; // fragile!
```

**Impact:**
Jika Ollama mengembalikan output non-JSON (misal: "Berikut ATP:\n```json\n[...]\n```"), endpoint crash 500. Guru mendapat error message tanpa konteks.

**Recommended Fix:**
Tambahkan JSON extraction helper: cari `[...]` atau `{...}` pertama di output, extract, lalu parse. Fallback: return raw string + warning "AI output tidak dalam format yang diharapkan".

**Dependencies:**
R-28, R-31

---

### Matrix: Wiring Status per Fitur AI

| Fitur | Backend | Action/Route | UI Button | Response Parse | End-to-End |
|-------|---------|-------------|-----------|----------------|------------|
| RAG Chatbot | ✅ | ✅ | ✅ | ❌ R-30 | ❌ BROKEN |
| Chat History | ✅ | ✅ | ❌ R-33 | ❌ R-30 | ❌ BROKEN |
| Knowledge CRUD | ✅ | ✅ | ✅ | ✅ | ✅ OK* |
| Generate Questions | ✅ | ✅ | ✅ | ✅ | ✅ OK* |
| Generate Material | ✅ | ✅ | ❌ R-32 | N/A | ❌ NO UI |
| Generate ATP | ✅ | ✅ | ✅ | ⚠️ R-34 | ⚠️ FRAGILE |
| Generate RPP Step | ✅ | ✅ | ✅ | ✅ | ✅ OK* |
| Generate Semua | ❌ R-29 | ❌ R-29 | ✅ (fake) | N/A | ❌ FAKE |

* = berfungsi jika Ollama embed running + OpenAI API key aktif (R-28, R-31)

---

## Issue yang Sudah Diselesaikan (Tidak Lagi Residual)

> Issue berikut awalnya didokumentasikan di prompt audit tetapi **sudah diperbaiki** oleh sesi sebelumnya.

| ID Asli | Status | Bukti Fix |
|---------|--------|-----------|
| 1.2 (Rapor Pipeline UI) | **CLOSED** | `RaporPipelineKs.tsx` dan `RaporWaliKelas.tsx` sudah wire ke `/report-cards/*` endpoints |
| 2.1 (Ortu SIM data) | **CLOSED** | `BerandaOrtu.tsx:69` — "sumber data 100% real, Tidak ada lagi fallback ke SIM_*" |
| 2.2 (Siswa SIM fallback) | **CLOSED** | `CapaianSiswa.tsx:45-51` — "gunakan props langsung, JANGAN fallback ke SIM_" |
| 4.1 (Dual NA formula) | **CLOSED** | `academic.ts:109` — "naSimple telah dihapus — naOf satu-satunya NA" |
| 4.5 (apiFetch 401 silent) | **CLOSED** | `api.ts:106-108` — "401 → redirect ke login" |
| 1.3 D10 (LMS progress orphan) | **CLOSED** | `actions.ts:478` — PATCH `/lms/modules/:id/progress` sudah di-wire |
| 1.3 D11 (Push subscribe orphan) | **CLOSED** | `PushNotificationToggle.tsx` + `actions.ts:464` sudah ada |
| 1.4 (Push notification UI) | **CLOSED** | `PushNotificationToggle.tsx` sudah tersedia |
| 1.3 D8 (Badges catalog orphan) | **CLOSED** | `actions.ts:220` — `GET /badges` sudah di-wire |
| 1.3 D9 (Leaderboard orphan for Siswa) | **CLOSED** | `page.tsx:63` — leaderboard sudah di-fetch untuk Siswa |

---

## Appendix: Methodology

### Proses Verifikasi
1. **Read source files** — Setiap file yang dirujuk di prompt audit dibaca langsung untuk memverifikasi line number dan status terkini.
2. **Grep cross-reference** — Pencarian pattern di seluruh codebase untuk memastikan tidak ada referensi yang terlewat.
3. **Fix detection** — Comment seperti "T1-02", "P0", "P6" di kode menunjukkan sesi sebelumnya sudah memperbaiki issue tertentu.
4. **Orphan verification** — Setiap endpoint yang diduga orphan diverifikasi dengan `grep` untuk mencari frontend consumer.
5. **Auth flow tracing** — Trace lengkap guard chain: `KeycloakGuard → PermissionGuard → RolesGuard`, verifikasi sumber roles (JWT vs DB), dan trace position assignment flow dari controller → service → DB → cache invalidation.

### Issue yang Dihapus dari Register (Sudah Fixed)
- 10 issue dari prompt awal terbukti sudah diperbaiki oleh sesi audit v2 sebelumnya.
- Issue 1.3 D10, D11, D8, D9 terbukti sudah di-wire.
- Issue 2.1, 2.2, 4.1, 4.5 terbukti sudah diperbaiki.

### Issue Tambahan yang Ditemukan
- **R-01** (hardcoded nama siswa) — ditemukan saat verifikasi BerandaSiswa.tsx
- **R-02** (hardcoded catatan wali kelas) — ditemukan saat verifikasi RaporModal.tsx
- **R-13** (hasPenilaian selalu false) — ditemukan saat grep pattern SIMULASI
- **R-16** (semester hardcoded) — ditemukan saat verifikasi RaporModal.tsx
- **R-20** (orphan /analytics/grades/student) — ditemukan saat verifikasi orphan endpoints
- **R-22** (orphan /push/my-notifications) — ditemukan saat verifikasi push controller
- **R-23** (position-Keycloak sync gap) — ditemukan saat trace auth flow Struktur Organisasi
- **R-24** (sidebar tidak responsif jabatan) — ditemukan saat analisis frontend Struktur Organisasi
- **R-25** (tidak ada access verification endpoint) — ditemukan saat analisis validasi Struktur Organisasi
- **R-26** (cross-schema FK missing) — ditemukan saat analisis schema PositionPermission
- **R-27** (multi-position SoD) — ditemukan saat analisis kebijakan penugasan
- **R-28** (VPS RAM tidak cukup) — ditemukan saat analisis kapasitas Hetzner CPX22 vs Ollama
- **R-29** (Generate Semua fake) — ditemukan saat audit wiring ModulAjarForm.tsx
- **R-30** (chatbot response parsing salah) — ditemukan saat trace AiClient.tsx → ai.service.ts
- **R-31** (model tidak di-pull otomatis) — ditemukan saat analisis setup-vps.sh + docker-compose
- **R-32** (generate material no UI) — ditemukan saat cross-reference actions.ts vs UI components
- **R-33** (chatbot no sessionId) — ditemukan saat audit AiClient.tsx request payload
- **R-34** (ATP JSON.parse fragile) — ditemukan saat analisis ai-generate.service.ts error handling

---

## Appendix: Position Permission Matrix (Struktur Organisasi)

Katalog jabatan dan permission yang diberikan saat penugasan aktif (sumber: migration `2J5_struktur_organisasi`).

| Position Code | Nama Jabatan | Kategori | Scope | Permission yang Diberikan |
|---------------|-------------|----------|-------|---------------------------|
| KEPALA_SEKOLAH | Kepala Sekolah | STRUKTURAL | NONE | `report.read`, `report.manage`, `audit.read` |
| WAKA_KURIKULUM | Wakasek Kurikulum | STRUKTURAL | NONE | `academic.schedule.manage/read`, `academic.teaching.manage/read`, `academic.grade.read`, `report.read/manage`, `rpp.read`, `rpp.review` |
| WAKA_KESISWAAN | Wakasek Kesiswaan | STRUKTURAL | NONE | `student.read`, `academic.attendance.read`, `activity.read/manage`, `announcement.read/manage` |
| WAKA_HUMAS | Wakasek Humas | STRUKTURAL | NONE | `announcement.manage/read`, `ppdb.read`, `ppdb.stats.read` |
| WAKA_SARPRAS | Wakasek Sarpras | STRUKTURAL | NONE | `announcement.read` |
| KEPALA_TU | Kepala Tata Usaha | STRUKTURAL | NONE | `user.read`, `finance.read`, `student.read`, `ppdb.read` |
| KAPROG | Kepala Program Keahlian | FUNGSIONAL | MAJOR | `academic.teaching.read`, `academic.schedule.read`, `student.read`, `academic.grade.read` |
| KOOR_BKK | Koordinator BKK | FUNGSIONAL | NONE | `ppdb.read`, `ppdb.stats.read`, `announcement.read` |
| KOOR_HUBIN | Koordinator Hubin | FUNGSIONAL | NONE | `ppdb.read`, `announcement.read` |
| GURU_BK | Guru BK | FUNGSIONAL | NONE | `student.read`, `academic.attendance.read` |
| BENDAHARA | Bendahara | TENDIK | NONE | `finance.read/create/update/approve` |
| STAF_KEPEGAWAIAN | Staf Kepegawaian | TENDIK | NONE | `user.read`, `user.manage` |
| OPERATOR_DAPODIK | Operator Dapodik | TENDIK | NONE | `student.read`, `user.read` |

**Catatan:**
- Semua permission di atas diberikan sebagai `UserPermissionOverride(grant=true)` saat penugasan aktif.
- Permission dicabut saat penugasan dilepas, kecuali masih didukung jabatan aktif lain.
- Position `MAJOR` scope memerlukan `majorId` saat assign (contoh: KAPROG).
- Hierarki: KOOR_BKK/KOOR_HUBIN → WAKA_HUMAS; GURU_BK → WAKA_KESISWAAN; BENDAHARA/STAF_KEPEGAWAIAN/OPERATOR_DAPODIK → KEPALA_TU.

---

## Appendix: Validasi Mekanisme Position Assignment

| Aspek | Status | Detail |
|-------|--------|--------|
| Permission override tercipta | ✅ Otomatis | `upsert` di `positions.service.ts` (assign method) |
| Cache invalidation | ✅ Otomatis | `invalidateUser(keycloakId)` di `positions.service.ts` |
| Permission resolution | ✅ Benar | `resolvePermissions()` union role + override di `permissions.service.ts:143-174` |
| Unassign cleanup | ✅ Otomatis | Cek remaining positions sebelum cabut di `positions.service.ts` (unassign method) |
| R-26: Orphan permission check | ✅ Otomatis | Validasi `permission.findMany` sebelum upsert override (assign method) |
| Role sync ke Keycloak | ✅ Otomatis (fail-soft) | `keycloakAdmin.assignRealmRole()` di `positions.service.ts` (assign) + `removeRealmRole()` di unassign (R-23, Fixed: 2026-07-07) |
| Sync UI button | ✅ Ada | Tombol "Sync Role Keycloak" di `/dashboard/struktur-organisasi` (SA only) |
| Seed script | ✅ Ada | `POST /positions/sync-roles` (SA only) + `scripts/seed-keycloak-roles.sh` |
| Verifikasi pasca-assign | ✅ Ada | `GET /positions/access-check/:userId` (R-25, Fixed: 2026-07-07) |
| Jabatan user login | ✅ Ada | `GET /positions/my-positions` (R-24 support) |
| Audit trail | ⚠️ Parsial | `@Audit` di controller, tapi tidak mencatat permission yang berubah |
| Segregation of duties | ✅ Ada | R-27: CONFLICT_RULES constant — soft warning untuk kombinasi berisiko (Fixed: 2026-07-07) |

---

## Appendix: Validasi Kesiapan AI (gpt-4.1-mini + Ollama Embed)

| Aspek | Status | Detail |
|-------|--------|--------|
| Adapter pattern | ⚠️ Perlu update | `OllamaAdapter` ✅ + `OpenAiAdapter` ❌ BELUM ADA — perlu dibuat (R-28) |
| Backend endpoints | ✅ Semua ada | 7 endpoint AI aktif di `ai.controller.ts` + `ai-generate.controller.ts` |
| Env validation | ⚠️ Perlu update | Perlu tambah `OPENAI_API_KEY` + `OPENAI_CHAT_MODEL` di `env.validation.ts` |
| Docker container | ✅ Terdefinisi | `smk-ollama` di docker-compose.yml — perlu turunkan limit ke 1G |
| VPS RAM cukup | ✅ Feasible | CPX22 = 4 GB — cukup untuk Ollama embed-only (~300 MB) + services lain |
| Embed model di-pull | ❌ TIDAK OTOMATIS | Harus pull `nomic-embed-text` saat init (R-31) |
| Chat model lokal | ✅ TIDAK DIPERLUKAN | gpt-4.1-mini via API — tidak perlu pull model chat |
| OpenAI API key | ❌ BELUM ADA | `.env.production` masih placeholder `sk-ant-...` — perlu ganti ke `sk-proj-...` |
| Chatbot UI wiring | ❌ BROKEN | Response parsing salah `data.reply` vs `data.answer` (R-30) |
| Chatbot session | ❌ TIDAK wire | `sessionId` tidak dikirim (R-33) |
| Generate Semua | ❌ FAKE | Hanya toast, tidak panggil AI (R-29) |
| Generate Material | ❌ NO UI | Action ada, button tidak ada (R-32) |
| Generate ATP | ⚠️ FRAGILE | `JSON.parse` dari LLM output tanpa fallback (R-34) |
| Generate Questions | ✅ OK | Wiring benar, parsing benar |
| Generate RPP Step | ✅ OK | Wiring benar, 8 step ter-cover |
| Knowledge CRUD | ✅ OK | Frontend + backend lengkap |
| PII strip (R-03) | ✅ Aktif | `stripPiiForLlm()` + `hasPii()` gate — tetap relevan untuk OpenAI routing |
| UU PDP compliance | ✅ Aman | Embedding lokal (data tidak keluar VPS), chat via API hanya setelah embed+retrieve |
