# Wave 8 Cross-Phase Operational Trust - Independent Source Review

Tanggal: 2026-08-22

Branch: `fix/wave8-cross-phase-operational-trust-20260822`

Baseline: `origin/develop@557340dabdd4c21881939159ca4143bde8056a9b`

Peran: independent reviewer, review-only

## Verdict

**FOLLOW-UP REQUIRED IN WAVE 8 - NOT APPROVED FOR GIT PACKAGING**

Automated verification, scope containment, penghapusan legacy student-create, dan
perbaikan error-state dasar memiliki arah yang benar. Namun masih ada empat P1 yang
membuat UI/API menyatakan kemampuan atau state yang tidak sesuai kondisi sebenarnya,
serta tiga P2 ketahanan operasional.

Tidak diperlukan Prompt Architect baru. Temuan harus ditutup pada branch Wave 8 yang
sama, lalu dikirim untuk re-review source.

## Findings

### P1-R01 - UI masih menawarkan KEPALA_SEKOLAH sebagai role identitas

`KEPALA_SEKOLAH` sudah menjadi position code period-bound dan hanya diberikan melalui
Appointment Governance. `PrimaryRoleSchema` backend hanya menerima enam role identitas.
Namun Users UI memasukkan `KEPALA_SEKOLAH` ke `ROLES` dan memakai array yang sama untuk
dropdown perubahan role.

Evidence:

- `apps/web/src/app/dashboard/users/_components/UsersClient.tsx:47-55`
- `apps/web/src/app/dashboard/users/_components/UsersClient.tsx:348-357`
- `apps/web/src/app/dashboard/users/page.tsx:40`
- `packages/auth/src/index.ts:13-30`
- `apps/api/src/users/dto/update-user.dto.ts:1-6`

Impact:

- Super Admin melihat tindakan yang secara kontrak selalu ditolak 400;
- UI kembali mencampur identity role dengan jabatan periodik;
- klaim W8-05 authority parity belum benar.

Required fix:

1. gunakan enam `PRIMARY_ROLES` sebagai satu-satunya opsi mutasi role;
2. bila legacy position-role perlu ditemukan, pisahkan filter audit/legacy dari opsi
   mutasi dan beri label bahwa jabatan dikelola melalui Struktur Organisasi;
3. tambah behavioral test bahwa `KEPALA_SEKOLAH` tidak pernah menjadi pilihan perubahan
   role dan appointment tidak ditulis lewat Users UI.

### P1-R02 - Kalender aktif menampilkan koleksi lintas tahun sebagai satu tahun ajaran

Page mengambil `/school/calendar` tanpa `academicYearId`, lalu meneruskan seluruh event
ke client yang memberi header `Daftar Agenda - T.A. {activeYear}`. Backend memang
mengembalikan semua tahun bila filter tidak dikirim.

Evidence:

- `apps/web/src/app/dashboard/kalender/page.tsx:25-29`
- `apps/web/src/app/dashboard/kalender/page.tsx:48-54`
- `apps/web/src/app/dashboard/kalender/_components/KalenderClient.tsx:139-142`
- `apps/api/src/school-config/school-config.service.ts:428-441`

Impact:

- agenda tahun lama dapat ditampilkan seolah milik tahun aktif;
- empty state, jumlah, dan operasi edit/delete tidak lagi period-truthful;
- operator berisiko mengubah agenda dari periode yang salah.

Required fix:

1. resolve active year lebih dahulu dan fetch kalender memakai exact
   `academicYearId`;
2. jika tidak ada tahun aktif, tampilkan archive/read-only yang berlabel jelas dan
   menyertakan identitas tahun tiap event, atau tampilkan setup state tanpa mencampur
   data;
3. tambah page/service behavioral test dengan dua tahun dan pastikan tidak ada event
   cross-year pada active-year view.

### P1-R03 - Mode kalender yang disebut read-only masih mengizinkan delete

Saat active-year lookup gagal, copy menyatakan agenda berada dalam mode baca saja.
Tambah dan edit dinonaktifkan, tetapi tombol hapus tetap aktif dan `remove()` tetap
memanggil mutation.

Evidence:

- `apps/web/src/app/dashboard/kalender/page.tsx:42-46`
- `apps/web/src/app/dashboard/kalender/_components/KalenderClient.tsx:115-123`
- `apps/web/src/app/dashboard/kalender/_components/KalenderClient.tsx:156-171`
- `apps/web/src/app/dashboard/kalender/_components/KalenderClient.tsx:208-230`

Impact:

- failure pada konfigurasi periode justru masih memungkinkan destructive mutation;
- UI dan capability aktual bertentangan;
- agenda historis dapat terhapus ketika operator mengira halaman read-only.

Required fix:

1. turunkan satu capability `canMutateCalendar` dari active-year success;
2. gunakan capability yang sama untuk create, edit, delete, dialog, dan action guard;
3. ubah empty copy agar tidak menyuruh klik Tambah Agenda ketika mutation disabled;
4. tambah behavioral test read-only untuk ketiga mutation entry point.

### P1-R04 - Respons GET 2xx tanpa body dianggap sukses dengan data null

`parseBody()` menandai body kosong sebagai bukan malformed, lalu `apiFetchResult<T>()`
mengembalikan `status: success` dengan `data: null as T`. Caller seperti Users dan
Jadwal kemudian langsung membaca properti dari payload tersebut.

Evidence:

- `apps/web/src/lib/api.ts:135-142`
- `apps/web/src/lib/api.ts:165-181`
- `apps/web/src/app/dashboard/users/page.tsx:69-84`
- `apps/web/src/app/dashboard/jadwal/page.tsx:77-92`

Impact:

- proxy/upstream yang menghasilkan 200 kosong berubah menjadi runtime exception atau
  state palsu;
- kontrak W8-07 belum benar-benar fail-closed.

Required fix:

1. untuk helper GET JSON, body kosong harus menjadi `unavailable`/invalid response;
2. pertahankan `[]`, `{}`, dan explicit `null` JSON sebagai payload valid hanya bila
   caller memang mengizinkannya;
3. tambah test 200 empty body, 204, literal `null`, dan whitespace-only;
4. jangan mengubah kontrak `apiMutate()` yang memang boleh menerima 204.

### P2-R05 - createMajor belum menerjemahkan race unique menjadi 409

Precheck case-insensitive membantu UX normal, tetapi dua create paralel masih dapat
lolos precheck. Database unique akan menolak salah satu dengan P2002, sementara
`createMajor()` tidak menerjemahkannya dan berpotensi mengembalikan 500. Jalur update
sudah menangani P2002 dengan benar.

Evidence:

- `apps/api/src/school-config/school-config.service.ts:81-88`
- `apps/api/src/school-config/school-config.service.ts:106-116`

Required fix:

- catch P2002 pada create dan kembalikan `ConflictException` 409;
- tambah concurrent duplicate test atau minimal P2002 translation test.

### P2-R06 - Search Users memicu navigasi server pada setiap karakter

Input memanggil `setParams()` langsung dari `onChange`, sehingga setiap karakter
menjalankan URL replacement dan server refetch. Untuk registry operator, ini
meningkatkan request burst, flicker, dan risiko respons terasa tertinggal.

Evidence:

- `apps/web/src/app/dashboard/users/_components/UsersClient.tsx:270-280`

Required fix:

- gunakan debounce stabil sekitar 300-400 ms atau explicit search submit;
- pertahankan local input selama navigation pending;
- reset page hanya setelah query efektif berubah;
- tambah fake-timer behavioral test untuk request count.

### P2-R07 - Cutover lock auto-schedule dilepas sebelum snapshot dibaca

`autoGenerate()` mengambil advisory lock di transaksi yang hanya berisi
`assertWritablePeriodWithCutoverLock()`. Setelah transaksi selesai, lock dilepas;
assignment dan occupancy baru dibaca sesudahnya. Close semester dapat berjalan di
antara validasi dan pembentukan preview.

Evidence:

- `apps/api/src/schedule/schedule.service.ts:448-488`

Impact:

- preview dapat dikembalikan untuk periode yang sudah ditutup beberapa saat setelah
  validasi;
- create berikutnya memang fail-closed, tetapi preview tidak lagi konsisten dengan
  pesan periode-writable.

Required fix:

- baca period, assignments, dan occupancy dalam satu transaksi yang memegang cutover
  lock, lalu lakukan greedy calculation dari snapshot tersebut; atau gunakan pola
  snapshot/recheck yang memberikan kontrak ekuivalen;
- tambah concurrency proof close-vs-preview.

## Test Coverage Gap

Focused tests saat ini memvalidasi DTO dan `apiFetchResult`, tetapi belum merender
Users/Calendar behavior yang justru menyimpan tiga P1 di atas. Follow-up wajib menambah
behavioral tests untuk:

- enam identity-role mutation options;
- calendar active-year scoping;
- read-only create/edit/delete;
- empty 2xx response;
- debounced search;
- createMajor P2002;
- auto-schedule close race.

Source-string scan untuk native dialog boleh dipertahankan sebagai lint-like guard,
tetapi tidak menggantikan interaction/state tests.

## Accepted Work

Reviewer menerima arah dan scope berikut:

- legacy student-create/raw Keycloak UUID/mini-create class dihapus;
- PPDB, single provisioning, dan bulk import tetap menjadi create paths;
- Kalender/Jadwal/Presensi mulai membedakan load failure dari empty data;
- native confirm/alert/prompt di surface yang disentuh diganti dialog/inline state;
- SA-only role/permission controls disembunyikan dari TU;
- Users list memakai server pagination;
- permission-panel stale response guard tersedia;
- strict DTO/calendar range/profile URL hardening tidak memperluas scope;
- tidak ada schema, dependency, infrastructure, Keycloak, secret, staging, atau
  production delta.

## Browser Gate Decision

Tidak tersedianya Docker lokal dan Playwright harness dicatat jujur dan tidak dianggap
PASS. Namun browser candidate QA lokal tidak perlu menjadi syarat sebelum packaging
selamanya.

Setelah seluruh P1/P2 source ditutup dan re-review source APPROVED:

1. lakukan explicit Git packaging;
2. merge ke `develop` melalui CI/review normal;
3. promote exact reviewed application tree ke `staging`;
4. jalankan authenticated browser QA desktop 1440px dan mobile 390px dengan fixture
   staging yang sudah disetujui;
5. uji Kalender, Jadwal, Presensi Guru, Users SA/TU, Data Siswa edit/create-mode picker,
   AI delete, assessment unanswered submit, dan Rapor note failure;
6. capture console/network dan cleanup fixture;
7. jangan menyentuh `main`/production sebelum final staging sign-off.

## Verification Reviewed

- API focused: 3 suites / 74 tests reported pass;
- Web focused: 2 suites / 9 tests reported pass;
- Full API: 63 suites / 1267 tests reported pass;
- Full web: 38 suites / 241 tests reported pass;
- API/web/database/types type-check reported pass;
- API/web lint and build reported pass;
- Prisma validate reported pass;
- reviewer independently inspected the complete source diff and ran
  `git diff --check` successfully;
- browser/runtime evidence remains not executed, as stated by Executor.

## Readiness

- Source readiness: **84%**.
- Automated confidence: **91%**.
- Browser/E2E readiness: **62%**.
- Git packaging readiness: **HOLD**.
- Reviewer verdict confidence: **98%**.

Expected after narrow follow-up and green rerun:

- source readiness: **96-98%**;
- packaging readiness: **APPROVED**, with browser QA remaining staging-only.
