# Wave 7 Phase 6 Semester Closing - Independent Staging Review

Tanggal: 2026-08-22

Target: staging only

Deployed SHA: `65840a5301bc86d1282f13cb64c05a6fc3bfa3e4`

Peran: independent reviewer, review-only

## Verdict

**FOLLOW-UP REQUIRED BEFORE FINAL STAGING SIGN-OFF**

Tidak ditemukan P0/P1 baru pada source atau delivery. Core Wave 7, authority utama,
readiness rendering, dan hotfix hydration telah bekerja pada staging. Namun dua acceptance
gate browser wajib belum memiliki evidence, sehingga Wave 7 belum boleh dipromosikan ke
`main`:

1. KAPROG major-only belum diuji dengan Appointment aktif dan fixture DB-backed.
2. Positive close, immutable historical detail, print view, dan CSV belum diuji pada
   isolated disposable stack yang menjalankan exact candidate SHA.

Selain itu ada empat P2 UI/UX yang sebaiknya ditutup dalam follow-up Wave 7 yang sama.
Tiga berada langsung pada workspace Penutupan Semester; satu adalah dependency shell global
yang kecil dan terukur.

## Delivery Integrity

Reviewer memverifikasi ulang:

- `origin/develop`: `ee7e2ace209cc375563c8aef32c000a56b591a12`;
- `origin/staging`: `65840a5301bc86d1282f13cb64c05a6fc3bfa3e4`;
- `origin/main`: `23e93af414a3b71ff0114ad43f78b833cefaa132`;
- Wave 7 belum menjadi ancestor `main`;
- PR #549 dan #550 merged dengan file scope hanya formatter timestamp, client, dan focused
  test Semester Closing;
- CI PR #549/#550: Build, Lint & Type Check, Unit Tests pass;
- deploy run `32461285227`: success pada exact staging SHA;
- required approvals `develop`, `staging`, dan `main`: 1;
- ruleset `Protect Staging`: active;
- open PR: none.

Hotfix hydration tepat sasaran: formatter memakai timezone aplikasi `Asia/Jakarta` dan hasil
browser pasca-deploy tidak lagi menunjukkan React #418.

## Acceptance Gate Blockers

### G1 - KAPROG major-only browser/API matrix belum terbukti

Ini adalah evidence blocker, bukan bukti privilege escalation. Source dan unit test telah
memfilter KAPROG, tetapi acceptance Wave 7 mewajibkan runtime same-major/cross-major.

Required execution:

1. Gunakan akun sintetis DB-backed yang sudah disetujui atau provision akun baru melalui API
   resmi; jangan memakai akun Keycloak-only.
2. Tetapkan Appointment `KAPROG` aktif dengan scope satu jurusan melalui Appointment
   Governance resmi. Jangan menambah realm role jabatan.
3. Dengan sesi bersih, buktikan readiness dan final report hanya memuat jurusan tersebut.
4. Jalankan direct API negative controls menggunakan resource/filter jurusan lain dan buktikan
   tidak ada school-wide snapshot, class, metric, atau CSV lintas scope.
5. Uji base role GURU + KAPROG dan, bila fixture tersedia, TATA_USAHA + KAPROG.
6. End/supersede Appointment fixture setelah QA atau pertahankan hanya sesuai protokol fixture
   staging; credential tetap lokal, untracked, dan tidak masuk report.

### G2 - Positive close dan historical snapshot browser flow belum terbukti

Shared staging memang tidak boleh ditutup. Prompt Wave 7 secara eksplisit mensyaratkan
positive close pada isolated disposable PostgreSQL + app stack yang menjalankan exact
candidate SHA. Karena hotfix mengubah SHA, proof harus memakai `65840a...` atau SHA follow-up
terbaru yang nantinya dideploy, bukan candidate lama.

Required execution:

1. Jalankan temporary isolated stack dari exact reviewed/deployed SHA dengan PostgreSQL,
   Redis, API, web, dan auth fixture PII-safe.
2. Siapkan readiness melalui service/API resmi; jangan insert `SemesterClosure` langsung.
3. Login sebagai base GURU + Appointment KS aktif dan lakukan positive close dari UI.
4. Buktikan satu closure, semester berikutnya aktif, refresh/back/new session tetap konsisten,
   dan rapid submit tidak menduplikasi closure.
5. Buka `Riwayat -> Lihat laporan` dan buktikan periode, actor, hash, metrics, blocker/warning,
   serta final report berasal dari snapshot yang ditutup.
6. Buktikan print media/preview hanya memuat panel historis, tombol aksi tersembunyi, tabel tidak
   terpotong, dan tidak ada data periode live yang ikut tercetak.
7. Unduh CSV dan buktikan filename period-bound, formula-safe, scope-safe, serta nilainya sama
   dengan detail snapshot.
8. Buktikan mutation closed-period ditolak dan perubahan sah pada periode berikutnya tidak
   mengubah detail/CSV historis.
9. Bersihkan seluruh container, database, network, token, dan credential sementara.

## P2 Findings

### P2-S01 - Provenance internal ditampilkan mentah

`system_default` tampil langsung pada tabel Kepatuhan KKTP. Data audit boleh mempertahankan
kode mentah, tetapi UI operator harus memakai label yang konsisten dengan DIIS.

Evidence:

- `apps/web/src/app/dashboard/penutupan-semester/_components/SemesterClosingClient.tsx:143-150`

Required fix:

- buat formatter/helper teruji;
- tampilkan `system_default` sebagai **Standar sekolah**;
- terjemahkan provenance lain ke label Indonesia yang stabil tanpa mengubah payload audit;
- unknown value harus ditampilkan aman sebagai `Sumber lain`, bukan raw internal string.

### P2-S02 - WAKA/SA/KAPROG melihat form close yang tidak dapat digunakan

Panel `Final Close` dibungkus `canReadFinalReport`, bukan `canCloseSemester`. Akibatnya WAKA
melihat input `TUTUP SEMESTER` dan tombol disabled, padahal matriks produk menetapkan hanya KS
dengan Appointment aktif yang melihat aksi close.

Evidence:

- `apps/web/src/app/dashboard/penutupan-semester/_components/SemesterClosingClient.tsx:580-621`
- Prompt Wave 7 bagian J: KS melihat final close panel.

Required fix:

- render form destructive hanya ketika `canCloseSemester=true`;
- untuk SA/WAKA/KAPROG tampilkan policy note read-only yang ringkas tanpa input/tombol palsu;
- tambahkan behavioral rendering tests untuk KS, SA, WAKA, KAPROG, dan view-as.

### P2-S03 - Permission denied bercampur dengan API/configuration failure

Role negatif menerima pesan `Data penutupan semester tidak dapat dimuat. Periksa izin atau
konfigurasi periode aktif.` Ini fail-closed, tetapi tidak memenuhi kontrak state yang berbeda
untuk permission denied, no data, dan API failure.

Evidence:

- `apps/web/src/app/dashboard/penutupan-semester/page.tsx:14-23`
- `apps/web/src/app/dashboard/penutupan-semester/_components/SemesterClosingClient.tsx:475-480`
- Prompt Wave 7 bagian J item 10.

Required fix:

- lakukan authority gate server-side sebelum readiness fetch atau teruskan typed result state;
- tampilkan access-denied yang jujur untuk TU/SISWA/ORANG_TUA/INDUSTRI;
- bedakan tidak ada periode aktif, API/network error, dan forbidden;
- pastikan tidak ada data readiness yang difetch/render untuk role forbidden;
- tambah route/page behavioral tests dan direct API negative control.

### P2-S04 - Mobile menu target masih 40x40px

Ini bukan kegagalan security atau blocker khusus Semester Closing, tetapi target 40px belum
mencapai standar polish mobile 44px yang dipakai DIIS pada kontrol utama.

Evidence:

- `apps/web/src/components/layout/MobileNav.tsx:22-23`
- browser measurement 390x844 pada laporan QA executor.

Required fix:

- berikan stable `min-h-11 min-w-11` atau ukuran ekuivalen 44x44px;
- pertahankan icon 24px dan aria-label;
- jalankan focused layout test serta smoke pada beberapa dashboard karena komponen bersifat
  global.

## Verified Browser Evidence Accepted

- SUPER_ADMIN school-scope readiness/report/history empty state: accepted.
- active KEPALA_SEKOLAH Appointment close authority rendering: accepted.
- active WAKA_KURIKULUM school report: accepted, dengan P2-S02.
- GURU TeachingAssignment own-readiness only: accepted.
- TU/SISWA/ORANG_TUA/INDUSTRI no data leakage: accepted, dengan P2-S03.
- desktop 1440px dan mobile 390x844 no horizontal overflow: accepted.
- post-hotfix clean console/no React #418: accepted.

## Required One-Batch Follow-up

Tidak diperlukan Prompt Architect baru. Keputusan arsitektur sudah lengkap dan tidak ada
schema/dependency decision baru.

Executor harus menjalankan satu follow-up Wave 7:

1. tutup P2-S01 sampai P2-S04 pada branch hotfix baru dari latest `origin/develop`;
2. focused web tests, full web regression, type-check, lint, build, dan diff checks;
3. explicit packaging dan PR normal ke `develop`, lalu promote ke `staging`;
4. jalankan G1 pada shared staging memakai fixture resmi;
5. jalankan G2 pada isolated exact-SHA stack;
6. re-run desktop/mobile/console untuk surface yang berubah;
7. update satu laporan QA ini dengan evidence PII-safe;
8. commit report melalui docs evidence PR agar tracked pada `develop` dan `staging`;
9. cleanup dan restore protections;
10. kirim ke reviewer untuk final staging sign-off.

Jangan merge `staging -> main` sebelum seluruh G1/G2 dan P2 ditutup serta evidence report
tracked pada staging.

## Confidence

- Delivery/SHA/hotfix integrity: **99%**.
- Core Wave 7 browser flow: **94%**.
- Verdict follow-up: **98%**.
- Current final staging readiness: **82%**.

Kenaikan dari 78% pada laporan executor menjadi 82% mencerminkan verifikasi independen bahwa
hotfix, deploy SHA, branch containment, dan core role flows valid. Nilai tetap ditahan oleh dua
acceptance gate runtime dan empat P2 yang masih terbuka.
