# Academic Operational E2E Remediation

Tanggal laporan: 2026-08-13
Branch kerja: `fix/academic-operational-e2e-20260812`
Baseline: `origin/main` `3b42efc38c71d5c79e5fea8b168efbbbc900e6de`
Status: **READY FOR INDEPENDENT FOLLOW-UP RE-REVIEW**
Git/deploy: belum commit, push, PR, staging, atau production

## Keputusan Produk yang Mengikat

1. Review Modul Ajar memakai dua tahap: rekomendasi kurikulum oleh Waka Kurikulum atau Kaprog, lalu persetujuan final oleh Kepala Sekolah.
2. Rapor memakai matriks terpisah: wali kelas menyiapkan draft/catatan, Waka Kurikulum memeriksa/mengembalikan, Kepala Sekolah menerbitkan, dan TU/Kepala Sekolah mendistribusikan. Super Admin dapat membantu kewenangan KS untuk publish/distribute serta menjalankan recovery administratif; seluruh bantuan dicatat atas identitas SA sebenarnya.
3. Kaprog memperoleh read dan rekomendasi kurikulum hanya pada jurusan dari appointment aktif; akses harus fail-closed bila scope tidak dapat dibuktikan.
4. Penugasan Mengajar dan Jadwal adalah dua tahap berbeda. Penugasan adalah sumber konteks akademik guru; Jadwal menempatkan penugasan ke waktu dan ruang.

## Alur Operasional Kanonik

1. Super Admin, TU, atau Waka Kurikulum appointment aktif membuat Penugasan Mengajar dari menu **Akademik**.
2. Kandidat harus memiliki identitas `GURU`, User/Teacher/Staff aktif, kelas aktif, mapel canonical aktif, tahun ajaran konsisten, dan beban JP yang sah.
3. Operator dapat melanjutkan ke **Jadwal** untuk menentukan hari, jam pelajaran, ruang, dan memeriksa konflik. Guru tidak perlu memiliki Jadwal untuk memperoleh konteks authoring akademik yang berasal dari Penugasan Mengajar.
4. Guru menggunakan penugasan yang sah untuk Modul Ajar, LMS, asesmen, nilai, absensi, dan Kegiatan Kelas. Wali kelas menggunakan kelas walinya untuk menyiapkan draft Rapor.
5. Modul Ajar bergerak `draft/revision -> submitted -> curriculum_reviewed -> approved`. Waka Kurikulum dan Kaprog hanya menangani tahap rekomendasi; Kepala Sekolah hanya menangani tahap final.
6. Rapor bergerak `draft -> checked -> published -> distributed`; pengembalian `checked -> draft` wajib memiliki alasan.
7. Siswa dan orang tua hanya melihat Rapor `distributed`. Semua media Kegiatan Kelas dibaca lewat API autentikasi, bukan URL publik.

## Implementasi per Menu

### Akademik

- Menambahkan workspace Penugasan Mengajar dengan pencarian, filter, pagination, kandidat terstruktur, create, edit, delete, dan readiness JP.
- Menghapus kebutuhan input UUID manual.
- Menolak kandidat guru/staf nonaktif, kelas/mapel/tahun yang tidak konsisten, pengurangan JP di bawah jadwal, dan penghapusan assignment yang sudah digunakan.
- Waka dual-role mendapat mode **Pengajaran Saya** dan **Operasional Kurikulum** tanpa kehilangan konteks guru.
- Kepala Sekolah tetap read-only untuk setup akademik.
- Assessment assignment candidates berasal dari TeachingAssignment authoritative, bukan keharusan memiliki baris Jadwal.

### Jadwal

- Data dan opsi assignment server-driven, searchable, dan paginated; tidak lagi memuat list besar tetap.
- Form memakai slot JP sekolah, validasi assignment authoritative, serta pesan konflik guru/kelas/ruang yang jelas.
- Mutasi diserialisasi dengan PostgreSQL advisory transaction lock untuk menutup race pemeriksaan konflik.
- Sel tabel yang dapat diedit memakai tombol semantik dan focus state keyboard.

### Rapor

- Wali kelas menyiapkan/memperbarui snapshot draft; rapor non-draft tidak ditimpa. Super Admin tidak mengambil generate/catatan atau check/return, tetapi dapat membantu publish/distribute dan mengembalikan dokumen non-draft ke draft melalui recovery beralasan serta bereferensi insiden.
- Waka Kurikulum memeriksa atau mengembalikan dengan alasan; Kepala Sekolah menerbitkan; TU/KS mendistribusikan.
- Generate/refresh berjalan atomik dengan advisory transaction lock; transisi, catatan wali, dan refresh memakai kondisi status agar request paralel gagal tertutup atau dilewati dengan benar.
- Permission diperiksa per aksi (`report.review`, `report.publish`, `report.distribute`), bukan dengan kontrak any-permission pada satu endpoint.
- Audit menyimpan ID dan nama lengkap/fallback username serta event status append-only untuk setiap pemeriksaan, pengembalian, penerbitan, dan distribusi.
- Filter kelas memakai endpoint scoped khusus Rapor. Kaprog tidak menerima metadata kelas di luar jurusannya; guru hanya mendapat kelas yang dapat dibaca dan hanya kelas wali ditandai dapat membuat draft.
- Snapshot nilai dibatasi ke kelas rapor dan memakai formula NA berbobot yang sama dengan Gradebook; snapshot kehadiran dibatasi periode semester.
- Siswa/orang tua dan section endpoint tetap fail-closed sebelum status `distributed`.
- Workspace Akademik Kepala Sekolah tidak lagi memiliki list/mutasi Rapor kedua; CTA mengarah ke hub `/dashboard/rapor` sebagai satu-satunya surface operasional.

### Kegiatan Kelas

- List, pencarian, filter kelas/kategori, pagination, create/edit/delete, dan `canManage` berasal dari scope server.
- Media privat menerima JPEG/PNG/WebP maksimal 5 MiB, memvalidasi MIME dan magic byte, memakai opaque object key, dan tidak mengungkap key ke klien.
- Jalur baca media melewati API/BFF autentikasi dan ownership kelas; tidak ada redirect atau fetch URL eksternal.
- URL foto legacy tidak dirender. Guru pencatat dapat mengganti atau menghapus referensinya.
- Upload replacement memakai compare-and-set; object kalah dibersihkan. Penghapusan DB tetap konsisten ketika object cleanup gagal secara fail-soft.
- Runbook staging tersedia di `docs/runbooks/CLASS-ACTIVITY-PRIVATE-MEDIA.md`.

### Review Modul Ajar

- Permission eksplisit: `rpp.curriculum.review` dan `rpp.final.approve`; broad legacy position grants dihapus oleh migrasi.
- Waka Kurikulum merekomendasikan submitted module. Kaprog dapat merekomendasikan hanya modul dalam jurusannya. Kepala Sekolah memutuskan final hanya setelah rekomendasi kurikulum.
- Super Admin tidak menjadi reviewer rutin; hanya membaca dan melakukan archive recovery.
- Status, reviewer, catatan, waktu tiap tahap, dan archive audit disimpan.
- Transisi memakai optimistic status condition. Dialog tetap terbuka bila API gagal.
- Edit, submit, review, dan archive memakai compare-and-swap status agar perubahan paralel tidak menghidupkan aksi dari state lama.
- Rekomendasi kurikulum dan persetujuan final harus dilakukan oleh aktor berbeda, termasuk ketika satu akun memiliki lebih dari satu appointment.
- Workspace lama Kepala Sekolah tidak lagi menyediakan approval satu tahap; seluruh review diarahkan ke `/dashboard/rpp` sebagai surface kanonik.

## Perubahan Lintas Domain

- Dashboard authority menggabungkan stable role dan appointment aktif, fail-closed ketika `/auth/me` gagal, serta tidak membocorkan appointment asli dalam mode tinjau role.
- Kaprog scope helper hanya mengakui appointment `ACTIVE`, tahun ajaran aktif tunggal, tanggal efektif, user/staff aktif, dan major scope yang valid.
- Nilai dan absensi memverifikasi assignment, periode, kelas, siswa aktif, serta membership sebelum mutasi.
- Penilaian esai mengunci response row dalam transaksi untuk mencegah lost update.
- Mutasi role pengguna dibatasi ke Super Admin aktif serta melindungi akun sendiri dan identitas privileged.
- Error pengambilan data tampil eksplisit; empty state tidak lagi menyamarkan kegagalan API.
- Mobile navigation memiliki accessible dialog title; flow sesi tidak mengklaim state lokal sebagai data tersimpan.
- Identitas guru pada mode Waka dual-role diselesaikan dari Keycloak identity melalui endpoint authoritative, bukan pencocokan nama/email di browser.
- KAPROG melihat label jurusan appointment aktif pada workspace, sedangkan opsi guru/kelas/mapel/tahun dibatasi ke scope yang sama.
- Publish/distribute Rapor, archive Modul Ajar, dan delete Kegiatan Kelas memakai dialog konfirmasi terstruktur yang menahan dialog ketika API gagal.

## Penutupan Follow-up Review 2026-08-13

Enam finding pada independent source review ditutup dalam branch dan wave yang sama:

1. Resolver appointment hanya mengakui tepat satu tahun ajaran aktif, User/Staff/Position aktif dan tidak terhapus, rentang efektif yang sah, serta scope NONE/MAJOR yang konsisten. Konfigurasi tahun ajaran kosong/ganda dan query error tidak menambahkan hak jabatan.
2. Super Admin ditolak eksplisit dari endpoint transisi Rapor rutin. Generate dan catatan tetap hanya untuk wali kelas. Jalur SA tunggal adalah `PATCH /report-cards/:id/recovery` dengan alasan minimal 10 karakter, referensi insiden, compare-and-swap, dan audit append-only.
3. Seluruh section resmi Rapor dibaca atomik dari satu `ReportCard` snapshot. Identitas siswa, NIS, kelas, dan wali kelas dibekukan; nilai Muatan Lokal memakai `average` NA berbobot yang sudah tersimpan; presensi dan aktor penerbit tidak lagi dibaca dari tabel atau appointment hidup.
4. Migrasi menghapus `report.review` dari Kepala Sekolah dan menambahkan `report.recover`. PostgreSQL fresh-database proof membuktikan grant KS tersebut berjumlah nol.
5. Sidebar menyembunyikan jabatan appointment asli saat mode tinjau. Helper murni dan unit test membuktikan jabatan tambahan hanya terlihat dalam mode normal.
6. `RaporModal` memakai satu request section resmi, reset state per siswa/periode, request sequence guard, loaded-key guard, serta error state. Respons request lama tidak dapat menimpa siswa yang baru dibuka.

### Penutupan Re-review Lanjutan

Tiga finding lanjutan juga ditutup dalam branch yang sama:

1. Token multi-role yang memuat `SUPER_ADMIN` selalu ditolak dari generate/catatan wali serta check/return Waka pada controller dan service boundary. API tidak lagi menandai kelas sebagai `canManageDraft` untuk SA+GURU; hub Rapor dan tab Rapor Kelas di workspace Akademik juga menyembunyikan kontrol pedagogis tersebut. Sesuai keputusan Director terbaru, SA tetap dapat membantu publish/distribute dan recovery administratif. Guru wali tanpa SA tetap dapat bekerja normal.
2. Catatan wali memakai optimistic version CAS berbasis `expectedUpdatedAt`. DTO mewajibkan timestamp ISO, query mengunci `id + draft + updatedAt`, dan timestamp baru dipajukan sekurang-kurangnya satu milidetik. Konflik mengembalikan 409 dan kedua surface UI mengirim versi yang dibaca serta menutup editor setelah sukses agar versi berikutnya dimuat ulang.
3. Setiap update jurusan yang berhasil menginvalidasi seluruh cache permission. Invalidasi terjadi setelah write sukses, sehingga deactivation, perubahan kode, atau perubahan identitas scope segera memaksa permission appointment dihitung ulang; kegagalan update tidak membersihkan cache tanpa alasan.

### Koreksi Matriks Bantuan Super Admin

Keputusan Director terakhir menggantikan asumsi SA recovery-only:

1. `SUPER_ADMIN` dan `SUPER_ADMIN + GURU` dapat membantu tindakan Kepala Sekolah berupa `publish` dan `distribute`, serta tetap memiliki recovery administratif.
2. Keberadaan SA tidak memberikan `check/return` milik Waka Kurikulum dan tidak memberikan `generate/catatan` milik wali kelas.
3. UI, controller, dan service memakai matriks yang sama. Service memeriksa permission serta active appointment untuk aktor reguler dan memiliki jalur bantuan SA yang terbatas hanya pada publish/distribute.
4. `publishedBy`, `distributedBy`, nama aktor, dan status event menyimpan identitas SA aktual. Tidak ada impersonasi Kepala Sekolah.

## Matriks Kewenangan

| Domain | Guru/Wali | Waka Kurikulum | Kaprog | Kepala Sekolah | TU | Super Admin |
|---|---|---|---|---|---|---|
| Penugasan Mengajar | Read milik sendiri | CRUD operasional | Read jurusan | Read | CRUD operasional | CRUD/recovery |
| Jadwal | Read milik sendiri | CRUD operasional | Read jurusan | Read | CRUD operasional | CRUD/recovery |
| Modul Ajar | Author milik assignment | Rekomendasi kurikulum | Rekomendasi jurusan | Persetujuan final | Tidak review | Read/archive recovery |
| Rapor | Wali menyiapkan draft/catatan | Check/return | Read jurusan | Publish/distribute | Distribute | Bantu publish/distribute + recovery |
| Kegiatan Kelas | Create/manage milik sendiri, read kelas | Read sesuai domain | Read jurusan | Read | Read operasional | Recovery |

## Verification Source

- Focused Rapor SA authority matrix API: **1 suite / 57 test passed**.
- Focused Academic operational UI matrix: **1 suite / 14 test passed**.
- Focused final follow-up API: **3 suite / 130 test passed**.
- Focused final follow-up web: **1 suite / 14 test passed**.
- API full test: **60 suite / 1195 test passed**.
- Web full test: **32 suite / 186 test passed**.
- API, web, database, dan types type-check: passed.
- API lint: passed.
- Web lint: passed; hanya warning existing Next lint deprecation/plugin.
- API build: passed.
- Web production build: compile, type/lint validation, dan static generation **39/39 passed**. Warning penyalinan standalone berasal dari junction dependency sementara Windows, bukan source atau compile failure.
- Prisma validate: passed dengan syntactic dummy `DATABASE_URL`; tidak melakukan mutasi database.
- PostgreSQL 16 + pgvector disposable database: **42/42 migration applied** dari database kosong.
- Runtime catalog proof terbaru: tiga assignment-context trigger aktif, empat kolom identitas snapshot tersedia, `incident_reference` tersedia, empat permission Rapor termasuk `report.recover` tersedia, dan grant `KEPALA_SEKOLAH -> report.review` berjumlah **0**.
- Fixture PostgreSQL PII-sintetis membuktikan SQL backfill historis mengisi nama siswa, NIS, kelas, dan wali kelas tanpa membaca data di luar relasi rapor.
- PostgreSQL CAS fixture membuktikan dua update catatan dengan versi awal identik menghasilkan `first_writer=1`, `second_writer=0`, dan mempertahankan catatan penulis pertama.
- Runtime negative proof: insert RPP berkelas tanpa TeachingAssignment ditolak oleh database trigger dengan pesan invariant yang diharapkan.
- Docker Compose config `--no-interpolate --quiet`: passed.
- `git diff --check` dan cached diff check: passed.
- Tidak ada staged changes.

## PostgreSQL Disposable Proof

Proof dijalankan pada container lokal disposable `pgvector/pgvector:pg16`, database kosong, port lokal sementara `55439`, dan telah dibersihkan setelah verifikasi. Tidak ada staging/production database atau PII yang digunakan.

1. `prisma migrate deploy` menerapkan seluruh **42 migration** secara berurutan, termasuk TF2, Appointment Wave B/C, Wave 4, dan dua migration Academic Operational.
2. Catalog query membuktikan trigger `rpp_assignment_context_guard`, `lms_assignment_context_guard`, dan `assessment_assignment_context_guard` aktif.
3. Catalog query membuktikan tabel audit status Rapor serta permission `rpp.curriculum.review`, `rpp.final.approve`, `report.publish`, dan `report.distribute` tersedia.
4. Insert negatif RPP dengan konteks kelas tetapi tanpa TeachingAssignment ditolak di database boundary sebelum foreign-key fallback.
5. Follow-up runtime proof membuktikan kolom snapshot/recovery, permission recovery, pencabutan review KS, serta backfill satu rapor historis sintetis. Container dan database disposable dibersihkan setelah verifikasi.
6. Final follow-up menjalankan ulang 42/42 migrasi pada database kosong dan membuktikan version-CAS catatan dengan fixture sintetis: hanya satu update dari dua penulis berbasis versi awal yang sama dapat menang.

Fresh-database proof ini memvalidasi urutan dan sintaks migrasi. Rekonsiliasi data historis pre/post dan restore rehearsal tetap menjadi gate deploy staging-copy ketika candidate SHA sudah tersedia, bukan blocker source packaging.

## Runtime Gate Sebelum Staging Sign-off

### Authenticated Browser QA

Setelah source review dan deploy candidate SHA ke staging:

1. Viewport `1440x900` dan `390x844`.
2. Role: SA, TU, KS, Waka Kurikulum, Waka Kesiswaan, Kaprog, guru pengajar, guru wali-only, siswa, orang tua, dan role negatif.
3. Penugasan tanpa Jadwal tetap membuka authoring; Jadwal kemudian dapat dibuat dari assignment yang sama.
4. Uji create/edit/delete, dependency block, readiness JP, pencarian/pagination, API failure state, keyboard, dan mobile navigation.
5. Uji matriks Rapor lengkap termasuk alasan return, nama aktor, family distributed-only, dan forbidden direct route.
6. Uji dua tahap Modul Ajar, cross-major Kaprog, stale/concurrent decision, archive recovery, dan endpoint negatif.
7. Uji media privat sesuai runbook, termasuk anonymous/cross-class denial dan URL legacy tidak dirender.
8. Pastikan tidak ada secret, PII, object key, atau unexpected 5xx pada evidence/log window.

## Git Gate

Belum boleh commit/push/PR. Setelah independent reviewer menyatakan source approved, lakukan explicit staging dengan daftar file bernama. Dilarang `git add .` atau `git add -A`. Periksa `git diff --cached --stat` dan `git diff --cached --check` sebelum commit.

## Residual Non-blocking

- Migrasi URL foto legacy ke object storage belum otomatis; source memilih fail-closed dan replacement manual oleh pemilik catatan.
- Authenticated browser QA sengaja belum diklaim oleh source verification.
- Fresh-database migration proof belum menggantikan staging-copy pre/post reconciliation dan restore rehearsal sebelum deploy staging.
- Warning `next lint` deprecation/plugin merupakan baseline tooling dan tidak memengaruhi hasil lint source.

## Verdict

Perubahan lokal siap untuk **independent final follow-up re-review**, dengan source confidence internal **98%**, UI/UX source confidence **97%**, dan fresh-database migration confidence **98%**. Ini belum merupakan staging sign-off atau production approval. Staging-copy reconciliation/restore dan authenticated browser QA harus lulus terhadap candidate SHA yang sama sebelum promosi.
