# Academic Operational E2E Source Review

Tanggal: 2026-08-13
Branch: `fix/academic-operational-e2e-20260812`
Baseline: `origin/main@3b42efc38c71d5c79e5fea8b168efbbbc900e6de`
Mode: independent source review; tidak ada source, schema, migration, test, atau konfigurasi yang diubah.

## Findings

### P1-1 - Resolver appointment bersama belum fail-closed pada staff/position/tahun ajaran ambigu

**Bukti source**

- `apps/api/src/permissions/permissions.service.ts:61-81` membentuk position code dari seluruh appointment `ACTIVE` yang relasi tahun ajarannya `isActive: true`.
- `apps/api/src/permissions/permissions.service.ts:334-368` memakai pola yang sama untuk permission efektif.
- Query tersebut tidak membuktikan tepat satu tahun ajaran aktif, `staff.deletedAt IS NULL`, atau `position.isActive = true`.
- Resolver Kaprog baru sudah lebih ketat, tetapi Waka Kurikulum/Kepala Sekolah dan guard umum tetap bergantung pada resolver bersama ini.

**Jalur eksekusi dan dampak**

Position code dipakai controller untuk membedakan aktor Waka/KS pada transisi Rapor dan RPP, sedangkan permission appointment digabungkan ke permission efektif. Bila ada dua tahun ajaran aktif, staff sudah soft-delete, atau katalog posisi dinonaktifkan, appointment lama masih dapat memberi authority. Ini melanggar kontrak fail-closed dan berpotensi memperluas akses lintas periode.

**Rekomendasi**

Buat satu resolver appointment aktif authoritative yang dipakai bersama oleh role-code dan permission resolver. Resolver wajib membuktikan satu tahun ajaran aktif, user aktif/tidak terhapus, staff tidak terhapus, posisi aktif, status dan rentang efektif valid, serta scope valid. Tambahkan negative test untuk no/multiple active year, deleted staff, inactive position, expired appointment, dan invalidasi cache setelah perubahan state.

### P1-2 - Super Admin masih menjadi operator pedagogis rutin pada Rapor

**Bukti source**

- `apps/web/src/app/dashboard/rapor/page.tsx:44-47` memberi Super Admin tombol generate, check, publish, dan distribute biasa.
- `apps/api/src/report-cards/report-cards.controller.ts:100-108` menerima Super Admin pada generate.
- `apps/api/src/report-cards/report-cards.controller.ts:117-151` memasukkan Super Admin ke semua transisi normal.
- `apps/api/src/report-cards/report-cards.controller.ts:154-162` menerima Super Admin pada catatan wali.
- `apps/api/src/report-cards/report-cards.service.ts:126-167` menjadikan seluruh kelas dapat dikelola Super Admin.

**Jalur eksekusi dan dampak**

Ini bukan sekadar fallback tersembunyi: SA melihat kontrol normal dan memakai endpoint yang sama dengan wali/Waka/KS/TU, tanpa reason recovery, incident reference, atau audit action yang membedakan pemulihan. Keputusan produk mengikat menyatakan SA hanya recovery dan bukan operator pedagogis rutin.

**Rekomendasi**

Keluarkan SA dari kontrol dan route operasional normal. Bila recovery memang diperlukan, sediakan aksi SA terpisah yang eksplisit, wajib reason dan incident/reference, mencatat before/after serta aktor, dan tidak muncul sebagai workflow rutin.

### P1-3 - Bagian rapor terdistribusi tidak immutable dan memakai formula/scope berbeda dari snapshot

**Bukti source**

- Kontrak service menyatakan snapshot immutable pada `apps/api/src/report-cards/report-cards.service.ts:4-9`.
- Snapshot utama benar-benar dibangun dari kelas/periode dan NA berbobot pada `apps/api/src/report-cards/report-cards.service.ts:268-348`.
- Namun Muatan Lokal membaca tabel `Grade` hidup dan menghitung rata-rata aritmetik pada `apps/api/src/report-cards/report-cards.service.ts:561-588`.
- Ringkasan kehadiran membaca tabel `Attendance` hidup tanpa `classId` pada `apps/api/src/report-cards/report-cards.service.ts:592-611`.
- Deskripsi perkembangan menghitung ulang seluruh nilai hidup dengan rata-rata aritmetik pada `apps/api/src/report-cards/report-cards.service.ts:615-630`.
- Pengesahan mengambil wali kelas dan KS yang berlaku saat request, lalu selalu mengembalikan `approvedAt: null`, pada `apps/api/src/report-cards/report-cards.service.ts:633-674`.
- `apps/web/src/components/academic/shared/RaporModal.tsx:82-95` mengambil keempat bagian tersebut setiap modal dibuka.

**Jalur eksekusi dan dampak**

Endpoint hanya membuktikan bahwa sebuah ReportCard berstatus `distributed`, lalu menyusun isinya kembali dari data terkini. Perubahan nilai, presensi, kelas, wali, atau pejabat setelah distribusi dapat mengubah rapor historis. Nilai Muatan Lokal juga dapat berbeda dari NA berbobot Gradebook/snapshot. Ini merupakan masalah integritas dokumen akademik, bukan sekadar tampilan.

**Rekomendasi**

Materialisasikan seluruh bagian resmi ke snapshot ReportCard saat draft dibuat/refreshed dan bekukan setelah keluar dari draft. Baca section berdasarkan report-card ID/snapshot, gunakan helper NA berbobot yang sama, simpan aktor/nama/timestamp pengesahan historis, dan cakup `classId` pada attendance. Tambahkan test yang mengubah Grade, Attendance, class teacher, dan appointment KS setelah distribusi lalu membuktikan output rapor tidak berubah.

### P2-1 - Migration akhir masih meninggalkan `report.review` pada Kepala Sekolah

**Bukti source**

- Migration pertama memberi KS `report.review` pada `packages/database/prisma/migrations/20260812000001_academic_operational_permissions/migration.sql:44-67`.
- Migration kedua hanya mencabut `report.manage` dan `rpp.review` dari KS pada `packages/database/prisma/migrations/20260812000002_academic_review_governance/migration.sql:73-83`, lalu memberi KS `report.publish`/`report.distribute` pada baris 91-104.

**Dampak**

Controller saat ini masih menahan KS dari check/return dengan pemeriksaan position code, sehingga ini belum menjadi eskalasi langsung. Namun permission efektif dan tampilan akses tetap lebih luas dari matriks final, serta endpoint baru yang hanya memeriksa permission dapat menghidupkan kembali kewenangan yang salah.

**Rekomendasi**

Cabut `report.review` dari KS dalam migration final dan seed. Tambahkan test hasil migration yang mengunci matriks Waka check/return, KS publish/distribute, TU distribute, dan SA recovery-only.

### P2-2 - Mode tinjau masih memperlihatkan appointment asli pada Sidebar

**Bukti source**

- `apps/web/src/app/dashboard/layout.tsx:35-40` selalu mengambil dan meneruskan appointment asli.
- `apps/web/src/components/layout/Sidebar.tsx:131-135` memang tidak memasukkannya ke authority saat `viewAs` aktif.
- Tetapi `apps/web/src/components/layout/Sidebar.tsx:141-142` tetap menghitung `extraPositionRoles`, dan baris 187-200 menampilkan badge jabatan serta aksi refresh sesi.

**Dampak**

Kontrol backend tidak diwariskan, tetapi mode tinjau tidak lagi merepresentasikan pengalaman role yang dipilih dan membocorkan konteks jabatan asli. Ini bertentangan dengan laporan remediation yang menyatakan appointment asli tidak dibocorkan dalam mode tinjau.

**Rekomendasi**

Saat `viewAs` aktif, jangan teruskan position roles atau jangan render badge/refresh appointment. Tambahkan component test Sidebar dalam mode tinjau, bukan hanya helper authority.

### P2-3 - RaporModal dapat menampilkan section milik siswa sebelumnya saat perpindahan cepat

**Bukti source**

`apps/web/src/components/academic/shared/RaporModal.tsx:75-96` menyimpan section B/D/F/G, tetapi tidak mereset state saat identitas rapor berubah dan tidak memakai request-id/abort guard. Bagian tetap dirender saat `sectionsLoading` pada baris 181-268.

**Dampak**

Ketika operator menutup/membuka siswa lain atau respons lama selesai lebih akhir, data siswa sebelumnya dapat terlihat di bawah judul siswa baru atau menimpa respons terbaru.

**Rekomendasi**

Reset semua section ketika key rapor berubah, render section hanya untuk key aktif, dan gunakan request-id atau AbortController. Tambahkan test respons A selesai setelah respons B serta close/reopen.

## Hal Yang Terverifikasi Benar

- TeachingAssignment dan Jadwal tetap dua tahap; schedule memakai assignment authoritative, JP readiness, transaction/advisory lock, dan pemeriksaan konflik.
- Author Modul Ajar diturunkan dari identity Keycloak ke teacher dan membutuhkan TeachingAssignment aktif; alur `submitted -> curriculum_reviewed -> approved`, actor separation, CAS, Kaprog major scope, dan archive recovery tersedia.
- Rapor utama memakai snapshot kelas, formula NA berbobot bersama, rentang semester, transaksi generate, status CAS, reason, event history, serta distributed-only pada list keluarga.
- Kaprog helper baru membuktikan appointment aktif, satu tahun aktif, user/staff/major aktif, dan scope jurusan; options dan query terkait mengikuti scope tersebut.
- Media Kegiatan Kelas memakai storage private, opaque object key, validasi MIME/magic byte/5 MiB, SigV4, timeout, redirect denial, `no-store`, BFF authenticated, ownership/scope, CAS replacement, dan tidak merender legacy external URL.
- Workspace KS untuk setup assignment/schedule bersifat read-only dan mengarahkan operasi Rapor ke hub kanonik.
- Dua migration bersifat additive dan source trigger menolak RPP tanpa konteks TeachingAssignment yang cocok.

## Verifikasi Reviewer

| Gate | Hasil |
|---|---|
| API full test | PASS - 60 suite / 1.172 test |
| Web full test | PASS - 31 suite / 182 test |
| API type-check | PASS |
| Web type-check | PASS |
| Database type-check | PASS |
| Types type-check/build | PASS |
| API lint | PASS |
| Web lint | PASS; hanya warning deprecation/plugin Next lint yang sudah dikenal |
| API build | PASS |
| Web production build | PASS - 39/39 halaman; trace-copy warning karena junction reviewer, exit 0 |
| Prisma validate | PASS dengan DATABASE_URL dummy |
| `git diff --check` | PASS |
| `git diff --cached --check` | PASS; tidak ada staged changes |
| PostgreSQL disposable migration/runtime | NOT RUN - Docker daemon reviewer tidak tersedia |
| Authenticated browser QA | NOT RUN - sesuai gate setelah candidate SHA dideploy ke staging |

Full test awal sempat membaca build paket internal lama dari dependency worktree. Setelah deklarasi `@smk/types` branch ini dibangun ke dependency reviewer, API dan web full suite lulus dengan angka yang sama seperti laporan executor. Ini bukan finding source.

## Residual Risk Dan Test Gap

- Fresh PostgreSQL `42/42` dan trigger proof masih berasal dari evidence executor; reviewer tidak dapat mereproduksi karena Docker daemon tidak tersedia.
- Staging-copy pre/post reconciliation dan restore rehearsal tetap wajib sebelum deploy staging karena fresh database tidak membuktikan klasifikasi data historis.
- Authenticated browser QA per role, mobile, keyboard/focus, direct negative endpoints, media object lifecycle, dan concurrent mutation tetap wajib pada deployed SHA.
- Diff sangat besar dan mixed-domain; explicit packaging harus mengikuti manifest yang direview dan tidak boleh memakai broad add.

## Initial Verdict

Initial review result: follow-up was required.

Tiga P1 dan tiga P2 di atas harus ditutup pada branch/wave yang sama, lalu dikirim kembali untuk re-review source. Belum boleh explicit Git packaging, PR, staging, main, atau production.

## Confidence

- Source correctness: **0.91** untuk temuan dan jalur yang diperiksa; readiness implementasi saat ini **0.76** karena tiga P1 belum ditutup.
- UI/UX source readiness: **0.79**.
- Migration readiness: **0.78**; source/fresh proof kuat, tetapi reviewer belum mereproduksi PostgreSQL dan staging-copy reconciliation belum ada.

## Follow-up Re-review - 2026-08-13

### Status Enam Finding Awal

1. **Appointment fail-closed: CLOSED secara query.** `PermissionsService` sekarang mensyaratkan tepat satu tahun ajaran aktif, user/staff aktif dan tidak terhapus, position aktif, tanggal efektif, serta scope major yang valid. Role-code dan permission resolver memakai kontrak filter yang sama.
2. **SA recovery-only: PARTIALLY CLOSED.** Route transisi rutin menolak SA dan recovery sudah dipisahkan, tetapi kombinasi stable role `SUPER_ADMIN + GURU` masih dapat memakai generate/catatan rutin; lihat finding baru P1-F1.
3. **Rapor historis: CLOSED.** Satu query ReportCard mengembalikan section resmi dari snapshot; endpoint individual lama mendelegasikan ke jalur yang sama. Muatan Lokal memakai `average` berbobot tersimpan, attendance memakai JSON snapshot, dan pengesahan memakai stempel penerbit tersimpan.
4. **Permission KS: CLOSED.** Migration kedua mencabut `report.review` dari KS dan hanya memberi Waka Kurikulum permission tersebut. Permission recovery terpisah tersedia.
5. **Mode tinjau: CLOSED.** Appointment asli tidak digabung ke authority dan helper Sidebar mengembalikan daftar kosong saat `viewAs` aktif.
6. **RaporModal race: CLOSED secara source.** State direset per key, satu request atomik dipakai, sequence/loaded-key guard menolak respons lama, dan error terlihat. Test saat ini masih dominan source-contract, sehingga browser race proof tetap gate staging.

### P1-F1 - Akun multi-role `SUPER_ADMIN + GURU` masih dapat menjadi operator Rapor rutin

**Bukti source**

- Model autentikasi menerima beberapa stable role; contoh eksplisit tersedia pada `packages/auth/src/__tests__/auth.test.ts:365-372`.
- Generate hanya memakai `@Roles('GURU')` dan `report.wali.manage` pada `apps/api/src/report-cards/report-cards.controller.ts:113-121`.
- Catatan wali memakai kontrak identik pada `apps/api/src/report-cards/report-cards.controller.ts:179-187`.
- `PermissionsService.hasPermission()` memberi wildcard kepada setiap token yang memuat `SUPER_ADMIN` pada `apps/api/src/permissions/permissions.service.ts:54-58`.
- `assertDraftManager()` hanya memastikan token juga memuat `GURU` dan memiliki identity guru/wali pada `apps/api/src/report-cards/report-cards.service.ts:543-552`; tidak ada explicit SA denial.
- UI juga menghitung `canGenerate` dari permission wildcard dan keberadaan role GURU pada `apps/web/src/app/dashboard/rapor/page.tsx:44`.

**Jalur eksekusi dan dampak**

Token `['SUPER_ADMIN', 'GURU']` lolos RolesGuard melalui GURU, lolos permission melalui wildcard SA, lalu dapat generate/refresh snapshot dan menulis catatan bila identitas tersebut terhubung sebagai wali kelas. Ini melanggar keputusan produk bahwa keberadaan role SA harus membatasi akun tersebut ke recovery-only, termasuk direct API. Penolakan eksplisit baru ada pada endpoint status transition.

**Rekomendasi**

Tambahkan explicit deny `SUPER_ADMIN` sebelum generate dan update notes, idealnya juga di service boundary agar kontrak tidak bergantung pada dekorator. UI harus mensyaratkan GURU **dan bukan** SA. Tambahkan negative test controller/service dan UI authority untuk `SUPER_ADMIN + GURU`, sementara GURU wali biasa tetap lulus.

### P2-F2 - Update catatan wali belum memakai compare-and-swap versi dokumen

**Bukti source**

- `UpdateNotesSchema` hanya membawa `notes` pada `apps/api/src/report-cards/dto/report-card.dto.ts:31-34`.
- Service membaca status, lalu `updateMany` hanya mengunci `id` dan `status: 'draft'` pada `apps/api/src/report-cards/report-cards.service.ts:521-539`.
- Test hanya membuktikan konflik bila status berubah, bukan dua penyimpanan catatan pada draft yang sama, pada `apps/api/src/__tests__/report-cards-activities.spec.ts:356-366`.

**Jalur eksekusi dan dampak**

Dua wali/tab yang membaca versi draft sama dapat mengirim catatan berbeda. Kedua update tetap menemukan status `draft`, keduanya sukses, dan penulis terakhir menimpa catatan sebelumnya tanpa konflik. Ini tidak memenuhi klaim remediation bahwa catatan memakai CAS.

**Rekomendasi**

Kirim `expectedUpdatedAt` atau revision dari UI, sertakan pada kondisi `updateMany`, dan kembalikan 409 saat count nol. Tambahkan concurrency test yang membuktikan hanya satu dari dua update dengan versi awal yang sama dapat sukses.

### P2-F3 - Menonaktifkan jurusan tidak menginvalidasi cache permission appointment

**Bukti source**

- Permission efektif disimpan selama lima menit pada `apps/api/src/permissions/permissions.service.ts:20-35`.
- Resolver baru benar-benar menolak major nonaktif pada `apps/api/src/permissions/permissions.service.ts:340-366`, tetapi hanya dijalankan saat cache miss.
- `SchoolConfigService.updateMajor()` dapat mengubah `isActive`, namun setelah update tidak memanggil `PermissionsService.invalidateAll()` pada `apps/api/src/school-config/school-config.service.ts:85-95`.

**Jalur eksekusi dan dampak**

Jika permission KAPROG sudah tercache lalu jurusannya dinonaktifkan, `/auth/me` dan consumer permission dapat tetap melihat permission appointment hingga TTL berakhir. RolesGuard yang membaca position code secara langsung membatasi mayoritas route saat ini, tetapi kontrak permission efektif tetap stale dan dapat menyesatkan UI atau consumer yang hanya memakai permission.

**Rekomendasi**

Invalidasi seluruh permission cache setelah perubahan major yang berhasil, setidaknya saat `isActive` atau identitas scope berubah. Tambahkan test `warm cache -> updateMajor(isActive:false) -> next permission resolution queries DB and denies`.

### Verification Re-review

| Gate | Hasil aktual reviewer |
|---|---|
| API full test | PASS - 60 suite / 1.181 test |
| Web full test | PASS - 32 suite / 185 test |
| API/web/database/types type-check | PASS |
| API lint | PASS |
| Web lint | PASS; hanya warning deprecation/plugin Next lint yang sudah dikenal |
| API build | PASS |
| Web production build | PASS - 39/39 halaman; trace-copy warning karena junction reviewer, exit 0 |
| Prisma validate | PASS dengan DATABASE_URL dummy |
| `git diff --check` | PASS |
| `git diff --cached --check` | PASS; tidak ada staged changes |
| PostgreSQL disposable | NOT RUN - Docker daemon reviewer tidak tersedia; evidence 42/42 dan backfill tetap berasal dari executor |
| Authenticated browser QA | NOT RUN - tetap gate setelah candidate SHA dideploy ke staging |

### Follow-up Verdict

Follow-up review result: additional remediation was required.

Enam temuan awal hampir seluruhnya tertutup, tetapi P1-F1 dan dua P2 baru di atas masih berada dalam scope Rapor/appointment yang sama. Tutup ketiganya pada branch yang sama, tambahkan negative/concurrency/cache tests yang relevan, lalu lakukan re-review sempit sebelum explicit Git packaging.

### Follow-up Confidence

- Source correctness review confidence: **0.95**; readiness implementasi saat ini **0.87**.
- UI/UX source readiness: **0.90**.
- Migration readiness: **0.91** berdasarkan source dan evidence executor; PostgreSQL reviewer serta staging-copy reconciliation belum dijalankan.

## Final Follow-up Re-review - 2026-08-13

### Finding

#### Director Decision Override

Director menegaskan bahwa `SUPER_ADMIN`, termasuk akun `SUPER_ADMIN + GURU`, boleh membantu Kepala Sekolah. Keputusan ini menggantikan asumsi prompt final bahwa setiap SA harus recovery-only. Untuk Rapor, bantuan tersebut dipetakan ke kewenangan Kepala Sekolah: `publish`, `distribute`, dan recovery administratif. Kewenangan pedagogis wali kelas (`generate`, catatan) serta pemeriksaan Waka Kurikulum (`check`, `return`) tetap merupakan tanggung jawab aktor masing-masing dan tidak otomatis diperoleh hanya karena role SA.

#### P1-F1 - Matriks bantuan Super Admin pada Rapor belum konsisten end-to-end

**Bukti source**

- UI hanya menampilkan `publish` bagi appointment Kepala Sekolah dan `distribute` bagi Kepala Sekolah/TU pada `apps/web/src/app/dashboard/rapor/page.tsx:45-48`; SA tidak memperoleh jalur bantuan KS.
- Controller menolak setiap token yang memuat `SUPER_ADMIN` sebelum semua transisi rutin pada `apps/api/src/report-cards/report-cards.controller.ts:132-168`, sehingga SA tidak dapat membantu `publish/distribute` melalui API.
- Sebaliknya, `ReportCardsService.transition()` menjalankan semua aksi tanpa matriks aktor pada `apps/api/src/report-cards/report-cards.service.ts:376-459`. SA dapat melakukan `check/return` yang merupakan kewenangan Waka, selain `publish/distribute` milik KS/TU.
- Unit test service menggunakan fixture `SA` untuk `check`, `return`, `publish`, dan `distribute` pada `apps/api/src/__tests__/report-cards-activities.spec.ts:198-245`, sedangkan test controller mengharapkan SA ditolak total pada baris 568-573. Dua boundary tersebut mengunci kontrak yang saling bertentangan.

**Jalur eksekusi dan dampak**

Keputusan Director tidak dapat dijalankan melalui UI/API karena SA ditolak total pada controller, tetapi direct service terlalu luas dan dapat memberi SA tugas pemeriksaan Waka. Hasilnya bukan least-privilege maupun alur bantuan KS yang operasional.

**Rekomendasi same-branch**

Terapkan satu matriks yang sama pada UI, controller, dan service: Waka Kurikulum untuk `check/return`; Kepala Sekolah **atau SA yang membantu KS** untuk `publish`; Kepala Sekolah/TU **atau SA yang membantu KS** untuk `distribute`; wali kelas non-SA untuk `generate/catatan`; dan SA untuk recovery administratif. Semua aksi SA harus menyimpan actor identity yang sebenarnya agar audit tidak berpura-pura dilakukan KS. Ganti fixture test sesuai matriks dan tambahkan test SA/SA+GURU pada masing-masing aksi yang diizinkan serta ditolak.

### Status Tiga Finding Terakhir

1. **Matriks Super Admin: PARTIALLY CLOSED setelah keputusan Director diperjelas.** Generate dan catatan sudah benar-benar tidak diberikan otomatis kepada SA/SA+GURU. Namun bantuan SA untuk aksi KS belum tersedia pada UI/controller, sementara service masih membolehkan aksi Waka secara berlebihan.
2. **CAS catatan wali: CLOSED.** DTO mewajibkan timestamp ISO, kedua UI mengirim `updatedAt` dari Rapor yang dibaca, service mengunci `id + draft + updatedAt`, memajukan versi, dan memberi 409 pada konflik. Setelah sukses, workspace memuat ulang data dan hub menutup detail pada route yang telah direvalidasi. Unit test membuktikan penulis kedua dengan versi awal yang sama gagal; proof PostgreSQL `first_writer=1`, `second_writer=0` berasal dari executor dan tidak direproduksi reviewer karena Docker tidak tersedia.
3. **Invalidasi cache jurusan: CLOSED.** `updateMajor()` menunggu write berhasil sebelum `invalidateAll()`. P2025/P2002 tidak menginvalidasi cache. Test permission membuktikan cache hangat dibaca sekali, lalu setelah invalidasi resolver query ulang dan permission hilang.

### Regression Check

- Appointment resolver tetap fail-closed dan permission KS `report.review` tetap dicabut oleh migration final.
- Jalur recovery SA tetap terpisah, mewajibkan alasan/referensi insiden, dan teruji. Keputusan baru juga membutuhkan jalur bantuan KS yang teraudit untuk publish/distribute.
- Section Rapor tetap berasal dari satu snapshot historis resmi, bukan data hidup.
- Mode tinjau tetap menyembunyikan appointment asli.
- `RaporModal` tetap memakai reset, request sequencing, dan loaded-key guard.
- Kontrak catatan lama tanpa `expectedUpdatedAt` tidak ditemukan pada hub maupun workspace Akademik.
- Guru wali biasa tetap dapat generate dan menyimpan catatan. Family tetap distributed-only. Matriks Waka/KS/TU di controller sudah tepat untuk aktor reguler, tetapi belum memuat bantuan SA sesuai keputusan Director.

### Final Verification

| Gate | Hasil aktual reviewer |
|---|---|
| API full test | PASS - 60 suite / 1.191 test |
| Web full test | PASS - 32 suite / 186 test |
| API/web/database/types type-check | PASS |
| API lint | PASS |
| Web lint | PASS; hanya warning deprecation/plugin Next lint yang sudah dikenal |
| API build | PASS |
| Web production build | PASS - 39/39 halaman; trace-copy warning karena junction reviewer, exit 0 |
| Prisma validate | PASS dengan DATABASE_URL dummy |
| `git diff --check` | PASS |
| `git diff --cached --check` | PASS; tidak ada staged changes |
| PostgreSQL disposable | NOT RUN - Docker daemon reviewer tidak tersedia; evidence 42/42 dan CAS runtime berasal dari executor |
| Authenticated browser QA | NOT RUN - tetap gate setelah candidate SHA dideploy ke staging |

### Final Verdict

Final follow-up result at that point: remediation of the SA authority matrix was required.

Dua finding teknis lainnya sudah tertutup, tetapi P1-F1 belum menerapkan keputusan Director secara konsisten: SA tidak dapat membantu aksi KS melalui UI/API, sementara direct service memberi kewenangan Waka yang terlalu luas. Perbaikannya tetap sempit dan harus dilakukan pada branch yang sama sebelum explicit Git packaging.

### Final Confidence

- Source correctness review confidence: **0.98**; readiness implementasi saat ini **0.93** karena matriks authority SA belum konsisten antar-boundary.
- UI/UX source readiness: **0.96**; source UI untuk recovery-only dan CAS sudah konsisten, browser staging belum dijalankan.
- Migration readiness: **0.93**; source, Prisma, dan evidence executor kuat, tetapi PostgreSQL reviewer dan staging-copy reconciliation belum direproduksi.

## Rapor SA Authority Matrix Re-review - 2026-08-13

### Findings

Tidak ditemukan P0, P1, atau P2 baru pada scope matriks kewenangan Rapor Super Admin.

### Matriks Terverifikasi

| Aktor | Generate/catatan | Check/return | Publish | Distribute | Recovery |
|---|---:|---:|---:|---:|---:|
| Wali kelas | Ya | Tidak | Tidak | Tidak | Tidak |
| Waka Kurikulum | Tidak | Ya | Tidak | Tidak | Tidak |
| Kepala Sekolah | Tidak | Tidak | Ya | Ya | Tidak |
| Tata Usaha | Tidak | Tidak | Tidak | Ya | Tidak |
| Super Admin / SA+GURU | Tidak | Tidak | Ya | Ya | Ya |

### Bukti End-to-End Source

- UI menahan generate/catatan dan check/return dari setiap authority yang memuat `SUPER_ADMIN`, tetapi memberi publish, distribute, dan recovery sesuai status Rapor pada `apps/web/src/app/dashboard/rapor/page.tsx:44-48` dan `apps/web/src/app/dashboard/rapor/_components/RaporHub.tsx:112-173`.
- Hub menampilkan pemberitahuan bahwa penerbitan, distribusi, dan pemulihan bantuan SA dicatat atas identitas operator pada `apps/web/src/app/dashboard/rapor/_components/RaporHub.tsx:115-120`.
- Controller memeriksa permission spesifik per aksi, menolak SA/SA+GURU dari check/return, dan membolehkan publish/distribute tanpa mengharuskan appointment KS pada `apps/api/src/report-cards/report-cards.controller.ts:128-171`.
- Service mengulang matriks secara independen sebelum membaca atau memutasi Rapor. SA hanya mendapat publish/distribute; guru biasa dengan grant tetapi tanpa appointment KS tetap ditolak pada `apps/api/src/report-cards/report-cards.service.ts:381-505`.
- Bantuan SA menyimpan `user.keycloakId` dan nama asli hasil lookup user/fallback username pada `publishedBy`/`distributedBy`, nama workflow, serta `ReportCardStatusEvent.actorId/actorName`. Recovery tetap endpoint dan transaksi terpisah dengan reason serta incident reference pada `apps/api/src/report-cards/report-cards.service.ts:507-566`.
- Focused test mengunci SA/SA+GURU publish/distribute, penolakan check/return, penolakan generate/catatan, guru tanpa appointment KS, audit actor asli, serta recovery terpisah pada `apps/api/src/__tests__/report-cards-activities.spec.ts`.

### Regression Status

- CAS catatan wali tetap menggunakan `expectedUpdatedAt` dan konflik 409.
- Perubahan jurusan tetap menginvalidasi cache permission hanya setelah write berhasil.
- Section Rapor tetap satu snapshot historis; family tetap hanya menerima status distributed.
- Permission KS `report.review` tetap dicabut; appointment resolver tetap fail-closed.
- Mode tinjau tetap tidak membawa appointment asli dan `RaporModal` tetap menolak stale response.
- Waka, KS, TU, dan wali kelas reguler tetap mengikuti scope masing-masing.

### Verification Matrix

| Gate | Hasil aktual reviewer |
|---|---|
| Focused API matrix | PASS - 1 suite / 57 test |
| Focused web UI | PASS - 1 suite / 14 test |
| API full test | PASS - 60 suite / 1.195 test |
| Web full test | PASS - 32 suite / 186 test |
| API/web/database/types type-check | PASS |
| API lint | PASS |
| Web lint | PASS; hanya warning deprecation/plugin Next lint yang sudah dikenal |
| API build | PASS |
| Web production build | PASS - 39/39 halaman; trace-copy warning karena junction reviewer, exit 0 |
| Prisma validate | PASS dengan DATABASE_URL dummy |
| `git diff --check` | PASS |
| `git diff --cached --check` | PASS; tidak ada staged changes |
| PostgreSQL disposable | NOT RUN pada re-review ini - Docker daemon reviewer tidak tersedia; evidence 42/42 dan CAS runtime tetap berasal dari executor |
| Authenticated browser QA | NOT RUN - tetap gate setelah candidate SHA dideploy ke staging |

### Current Verdict

**APPROVED FOR EXPLICIT GIT PACKAGING**

Matriks keputusan Director kini konsisten pada UI, controller, service, audit, dan test. Approval ini hanya membuka explicit staging file list, commit, push, serta PR menuju `develop`. Ini bukan staging sign-off, main promotion, atau production approval.

### Current Confidence

- Source correctness: **0.98**.
- UI/UX source readiness: **0.97**.
- Migration readiness: **0.93**, karena PostgreSQL reviewer/staging-copy reconciliation belum diulang pada sesi ini.
