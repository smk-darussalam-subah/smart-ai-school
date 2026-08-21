# Wave 7 Phase 6 Semester Closing - Independent Source Re-review

Tanggal: 2026-08-20
Branch: `feat/wave7-phase6-semester-closing-20260820`
Mode: reviewer-only; tidak ada perubahan source, Git, staging, atau production

## Verdict

**FOLLOW-UP REQUIRED IN WAVE 7 - NOT APPROVED FOR EXPLICIT GIT PACKAGING**

Follow-up menutup sebagian besar finding pertama secara nyata. Generic period mutation sudah
fail-closed, Appointment authority sudah masuk ke page/backend, dependency write barrier sudah
wajib, public closure response sudah diminimalkan, close UX membaik, dan disposable PostgreSQL
telah menjalankan real service close plus pre-migration restore rehearsal.

Namun final report dan readiness masih mempunyai gap yang dapat menghasilkan laporan resmi
keliru atau scope akses terlalu luas. Ditemukan lima P1 dan dua P2 tersisa.

## Closure Matrix Review Sebelumnya

| Finding sebelumnya | Status re-review |
|---|---|
| Generic endpoint dapat mematikan periode aktif | Closed source/test |
| UI hanya membaca stable JWT role | Partially closed; Appointment terbaca, view-as belum dihormati |
| Readiness false-ready | Partially closed; union/set comparison ada, orphan dan overlap belum lengkap |
| Final report tidak tersedia | Partially closed; struktur tersedia, sumber nilai dan mapping kurikulum belum canonical |
| Write barrier optional/fail-open | Closed source/test |
| PostgreSQL/runtime proof tidak lengkap | Partially closed |
| Stale/duplicate/error/history UX | Partially closed |
| Public response membawa metadata internal | Closed source/test |

## Findings

### P1-R01 - Final report menghitung nilai mentah, bukan snapshot Rapor resmi

`reportRows.grades` dari ReportCard distributed sudah diambil, tetapi tidak dipakai untuk
grade distribution, class/major heatmap, atau KKTP compliance. Implementasi justru membaca
seluruh row `Grade` dan menghitung setiap assignment sebagai satu record. Satu siswa/mapel dapat
memiliki banyak row UH/UTS/UAS, sehingga average, pass rate, dan `belowKktpCount` dapat berbeda
dari nilai akhir berbobot pada dokumen Rapor resmi. Ini melanggar kontrak Wave 6 snapshot dan
ketentuan Wave 7 untuk tidak recompute dokumen dari data hidup.

Evidence:

- `apps/api/src/semester-closing/semester-closing.service.ts:735-741`
- `apps/api/src/semester-closing/semester-closing.service.ts:823-852`
- `apps/api/src/semester-closing/semester-closing.service.ts:965-981`

Required fix:

- Gunakan hanya `grades` dari ReportCard berstatus `distributed` sebagai sumber final score,
  KKTP, dan provenance per siswa/mapel.
- Satu siswa/mapel harus menyumbang tepat satu nilai akhir ke statistik institusi.
- Tambahkan fixture yang memiliki beberapa Grade mentah tetapi satu NA snapshot berbeda, lalu
  buktikan report final mengikuti snapshot Rapor.

### P1-R02 - CP/TP/ATP belum menjadi mapping dan `tpRef` tidak divalidasi

`curriculumMap` hanya menyimpan `cpCount`, `tpCount`, dan panjang array ATP. `curriculumCounts()`
tidak membaca `atp[].tpRef/indikator`, tidak membuktikan referensi ATP menuju TP yang sah, dan
tidak menghasilkan status `Belum terpetakan`. Array ATP dengan shape salah tetap dihitung.
Tabel berjudul “Pemetaan CP/TP/ATP” karena itu masih merupakan counter, bukan mapping yang
diwajibkan W7-10.

Evidence:

- `apps/api/src/semester-closing/semester-closing.service.ts:78-84`
- `apps/api/src/semester-closing/semester-closing.service.ts:1034-1059`
- `apps/web/src/app/dashboard/penutupan-semester/_components/SemesterClosingClient.tsx:155-164`

Required fix:

- Parse kontrak aktif: `cp` string, `tp[]`, dan setiap `atp[].tpRef/indikator`.
- Snapshot PII-minimal harus menyimpan mapping/provenance atau status `Belum terpetakan`, bukan
  isi narasi panjang.
- Invalid/missing `tpRef`, duplicate TP reference, dan legacy keys harus memiliki negative test.

### P1-R03 - Base role TATA_USAHA dapat memperluas scope KAPROG menjadi seluruh sekolah

`isKaprogScopedReader()` menganggap TATA_USAHA sebagai global academic reader. Akun base TU
dengan Appointment KAPROG aktif akan menerima roles `TATA_USAHA + KAPROG` dari RolesGuard,
sehingga helper mengembalikan false. `filterSnapshotForUser()` lalu mengembalikan snapshot
sekolah penuh, bukan snapshot jurusan. Matriks Wave 7 menetapkan TU tidak memiliki authority
final-report global; Appointment KAPROG harus tetap major-scoped.

Evidence:

- `apps/api/src/common/helpers/appointment-scope.helper.ts:11-22`
- `apps/api/src/semester-closing/semester-closing.service.ts:1226-1245`
- `apps/api/src/auth/guards/roles.guard.ts:53-68`

Required fix:

- Tentukan global academic authority dari SA atau Appointment KS/WAKA aktif, bukan base TU.
- Scope KAPROG harus dihitung dari effective appointment set dan fail-closed untuk kombinasi
  GURU+KAPROG, TU+KAPROG, KAPROG+WAKA, expired/suspended, dan multi-major.
- Tambahkan direct detail/export negative test yang membuktikan jurusan lain tidak terlihat.

### P1-R04 - Orphan source dan period overlap masih dapat lolos readiness

Source coverage difilter lebih dahulu ke `classIds` aktif. RPP/assessment dengan `classId=null`,
class nonaktif, atau class di luar roster target tidak pernah masuk `unmappedSources`. Assessment
yang tidak mempunyai subject pada TeachingAssignment maupun LMS juga diabaikan dengan `return`.
Selain itu, overlap hanya dicari dalam `academicYearId` yang sama, padahal date-based period
resolver bersifat global dan semester lintas tahun yang overlap tetap ambigu.

Evidence:

- `apps/api/src/semester-closing/semester-closing.service.ts:485-513`
- `apps/api/src/semester-closing/semester-closing.service.ts:539-582`
- `apps/api/src/semester-closing/semester-closing.service.ts:462-469`

Required fix:

- Query sumber exact period secara mandiri, lalu klasifikasikan mapped, out-of-scope, missing
  class, missing subject, dan missing TeachingAssignment secara eksplisit.
- Periksa overlap terhadap seluruh semester, bukan hanya tahun ajaran yang sama.
- Tambahkan fixtures orphan/null/inactive-class/cross-year overlap; satu anomali wajib membuat
  `ready=false` tanpa mutation.

### P1-R05 - PostgreSQL proof belum mencakup acceptance concurrency/immutability penuh

Proof baru sudah memperbaiki dua kekurangan penting: real service close dipanggil paralel dan
restore kembali ke pre-Wave7 schema. Namun evidence hanya mencakup dua request dengan key sama,
satu closed-write guard, dan presence final-report keys. Belum ada proof PostgreSQL untuk:

- dua close paralel dengan key berbeda;
- stale hash dan same-key/different-payload;
- blocker rollback/no partial transition;
- close versus Grade, ReportCard, Assessment, dan LMS mutation;
- snapshot tetap sama setelah live data/config berubah;
- CSV benar-benar membaca snapshot immutable.

Required fix: perluas satu script/proof disposable yang repeatable untuk seluruh matrix di atas.
Browser authenticated tetap staging/disposable-only sesuai protokol, tetapi proof database ini
harus selesai sebelum packaging karena menguji atomicity inti, bukan tampilan.

### P2-R01 - View-as mode belum diterapkan pada capability halaman

Page mengambil `/auth/me` dan `/positions/my-positions` secara langsung. Ia tidak memakai
`resolveDashboardAuthority()` atau `getActiveViewAs()`, sehingga Appointment asli tetap dipakai
untuk menampilkan Final Close/Capaian/Riwayat saat pengguna sedang mode tinjau role biasa.
Backend tetap memakai authority asli sebagaimana desain, tetapi UI tinjau seharusnya tidak
menampilkan jabatan/kontrol asli.

Evidence:

- `apps/web/src/app/dashboard/penutupan-semester/page.tsx:27-36`
- `apps/web/src/lib/dashboard-authority.ts:25-36`

Required fix: gunakan resolver dashboard shared atau behavior ekuivalen dan tambah test mode
tinjau KS/WAKA/KAPROG/SA tanpa mengubah enforcement backend.

### P2-R02 - Stale timeout dan dialog focus masih belum operasional penuh

Umur preview dihitung dari `Date.now()` hanya saat render. Jika konfirmasi sudah lengkap lalu
tab dibiarkan lebih dari lima menit tanpa state change, tombol dapat tetap memakai hasil render
lama. Dialog memiliki `role`, `aria-modal`, dan Escape, tetapi tidak memiliki initial focus,
focus trap, atau focus restore. Ini belum memenuhi keyboard/focus contract.

Evidence:

- `apps/web/src/app/dashboard/penutupan-semester/semester-closing-ui.ts:32-42`
- `apps/web/src/app/dashboard/penutupan-semester/_components/SemesterClosingClient.tsx:519-554`

Required fix: gunakan expiry timer/deadline yang memicu render dan ref request-time check sebelum
close; gunakan dialog primitive existing atau implement focus lifecycle lengkap. Buktikan pada
component test dan nanti browser 1440/390.

## Independent Verification

Reviewer menjalankan dan memperoleh:

- API focused Semester Closing + School Config: 2 suites / 42 tests pass.
- Web focused Semester Closing: 1 suite / 5 tests pass.
- API type-check: pass.
- Web type-check: pass.
- Prisma validate: pass.
- `git diff --check` dan `git diff --cached --check`: pass.

Full-suite dan disposable PostgreSQL counts pada laporan eksekutor dicatat sebagai executor
evidence; reviewer tidak mengulang seluruh stack/database proof pada sesi ini.

## Recommended Next Gate

1. Tutup P1-R01 sampai P1-R05 dan P2-R01/P2-R02 pada branch Wave 7 yang sama.
2. Jalankan focused tests baru serta full regression.
3. Jalankan integrated PostgreSQL matrix yang repeatable.
4. Kirim untuk final source/database re-review.
5. Setelah approved, lakukan explicit Git packaging. Browser role/UX 1440/390 dan positive close
   tetap dijalankan pada disposable exact SHA atau staging-isolated flow, bukan shared staging DB.

## Confidence

- Finding confidence: **0.98**.
- Source readiness: **88%**.
- Database/concurrency readiness: **84%**.
- Validated E2E readiness: **78%**.
- Explicit Git packaging: **belum disetujui**.
