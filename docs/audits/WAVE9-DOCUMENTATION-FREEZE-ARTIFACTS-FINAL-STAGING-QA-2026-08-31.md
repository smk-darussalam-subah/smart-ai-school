# Wave 9 Checkpoint B - Final Staging QA Artefak Dokumentasi

Tanggal pelaksanaan: 2026-08-31

Peran: Executor staging QA

Status: **READY FOR INDEPENDENT FINAL STAGING REVIEW**

## 1. Ruang Lingkup dan Batas Klaim

QA ini menutup matriks unduhan aman yang diminta setelah hotfix status PDF. Pemeriksaan
dilakukan terhadap staging yang benar-benar dideploy, menggunakan akun sintetis PII-safe dan
authority aplikasi yang nyata. Laporan ini bukan independent sign-off dan tidak memberi izin
promosi `main` atau production.

Hotfix hanya mengubah tiga file berikut:

1. `apps/web/src/__tests__/help-system.test.ts`;
2. `apps/web/src/app/dashboard/panduan/page.tsx`;
3. `apps/web/src/lib/help/help-projection.ts`.

Tidak ada perubahan pada registry binary, 40 screenshot, 24 PDF, 4 deck, ilustrasi, atau
adoption package. Registry juga tidak memiliki screenshot halaman Help/Panduan. Karena copy lama
tidak berada dalam PDF dan tidak ada screenshot Panduan, dampak hotfix terhadap artefak adalah
**nol** dan regenerasi massal tidak diperlukan.

## 2. Git, Deploy, dan Runtime Binding

| Bukti | Nilai |
|---|---|
| PR source | `#616`, CI hijau |
| Merge `develop` | `4575dea3c81143aff2b6ca7b90423eec50012df7` |
| PR promotion | `#617`, CI hijau |
| Deployed/final staging SHA | `3523911e72cf25d34ad49e24a1c010a5ad32a1a8` |
| Staging application tree | `06a17b54d16c55f7a4a23b5711132a777e7a9e4d` |
| Deploy run | `33330697158`, sukses |
| Main | `76d64c6582fdf959d5868d89f36a3e36ea02beea`, tidak berubah |

Verifikasi runtime:

- checkout VPS staging tepat pada SHA `3523911e...` dan bersih (`dirty=0`);
- `smk-staging-api` berjalan dan sehat;
- `smk-staging-web` berjalan;
- health API menyatakan `status=ok` dan database `up`;
- web staging merespons HTTP 200;
- tree `develop` dan `staging` identik;
- tidak ada mutasi source, binary staging, database, role, schema, migration, atau production
  selama matriks unduhan ini.

## 3. Metode Auth dan Privasi

- Lima akun staging sintetis DB-backed digunakan: `SUPER_ADMIN`, `GURU`, `SISWA`,
  `ORANG_TUA`, dan `INDUSTRI`.
- Sesi dipisahkan dengan federated logout sebelum perpindahan persona.
- Credential sintetis yang sudah stale disegarkan melalui mekanisme admin Keycloak resmi;
  tidak ada perubahan role, profile, permission, realm, atau data akademik.
- Password, cookie, token, email/telepon sintetis, dan identifier login tidak dicatat dalam
  laporan atau evidence permanen.
- `ORANG_TUA` diuji menggunakan anak sintetis yang benar-benar dimiliki. UUID anak tidak
  dipermanenkan di laporan.

## 4. Matriks Unduhan Resmi

Setiap respons positif memiliki:

- HTTP `200`;
- `Content-Type: application/pdf`;
- `Cache-Control: private, no-store, max-age=0, no-transform`;
- `Content-Disposition: attachment` dengan nama file registry;
- `X-Content-Type-Options` yang memuat `nosniff`;
- ukuran byte dan SHA-256 identik dengan registry exact binary.

| Persona | Artefak | Nama file | Ukuran | SHA-256 registry/runtime | Hasil |
|---|---|---|---:|---|---|
| Super Admin | `artifact.super-admin` | `panduan-super-admin.pdf` | 537953 | `b28374d607c5bf4a20f41cedeeeb0627e99061002508f0f35c4ffeb006df792d` | PASS |
| Guru | `artifact.teacher` | `panduan-guru.pdf` | 437566 | `a31e4853559fcead0547d37bb47fa6954598152320d7714f70690b81555b3d12` | PASS |
| Siswa | `artifact.student` | `panduan-siswa.pdf` | 559433 | `37df042987b34a893c24728d156bec4e692b57dc28cae39d511ad0b8dc9c53ff` | PASS |
| Orang Tua | `artifact.parent` | `panduan-orang-tua.pdf` | 467347 | `a200fa16b896abf3e6e5b6810b4f4bb6aa985ee4a8b7e460f90346cf1dcbf85b` | PASS |
| Industri | `artifact.industry` | `panduan-industri.pdf` | 325605 | `61719d6badfca8756ca3214cce9fb955ffd44e31b767a1f38a59ea409b7884f9` | PASS |

Browser juga membuktikan CTA berikut pada halaman `Mulai di sini`:

- Super Admin: `artifact.complete` dan `artifact.super-admin`;
- Guru: `artifact.teacher`, `artifact.wali-kelas`, dan `artifact.guru-assigned` sesuai konteks;
- Siswa: hanya `artifact.student` pada matriks ini;
- Orang Tua: hanya `artifact.parent`, dengan `studentId` anak terverifikasi pada URL unduhan;
- Industri: hanya `artifact.industry`.

Tidak ditemukan error console aplikasi pada lima sesi fresh tersebut.

## 5. Kontrol Negatif dan Failure Drill

| Skenario | Hasil aktual | Status |
|---|---|---|
| Persona meminta PDF milik persona lain | generic `404` untuk seluruh lima persona | PASS |
| Artefak tidak dikenal `artifact.missing` | generic `404` untuk seluruh lima persona | PASS |
| Orang Tua memakai anak palsu | route UI menampilkan `Panduan tidak tersedia`; endpoint PDF generic `404` | PASS |
| Pengguna tanpa login membuka endpoint PDF | `307` menuju `/login` dengan callback endpoint; binary tidak dikirim | PASS |
| Pembatalan unduhan oleh client | stream SA dibatalkan setelah chunk pertama 14753 byte | PASS |
| Unduh ulang setelah pembatalan | HTTP `200`; ukuran dan SHA-256 tetap identik dengan registry | PASS |

Pembatalan hanya dilakukan pada satu persona representatif karena kontrak streaming sama untuk
seluruh artefak. Drill tidak menulis atau memodifikasi binary staging.

## 6. Desktop, Mobile, Console, dan Network

### Desktop 1440 x 900

- viewport aktual: `1440 x 900`;
- `scrollWidth=1425`, tidak melebihi viewport;
- elemen overflow: `0`;
- CTA unduh: tinggi `44px`, berada penuh di dalam viewport;
- console aplikasi: `0` error/warning yang tidak dijelaskan.

### Mobile 390 x 844

- viewport aktual: `390 x 844`;
- `scrollWidth=375`, tidak melebihi viewport;
- elemen overflow: `0`;
- CTA Orang Tua: `374.67 x 44px`, penuh di dalam viewport;
- selected-child tetap diteruskan ke endpoint;
- console aplikasi: `0` error/warning yang tidak dijelaskan.

Satu pesan ekstensi Chrome `Could not establish connection. Receiving end does not exist`
pernah terlihat pada tab lama dan diklasifikasikan sebagai artefak ekstensi, bukan error DIIS.
Tab fresh untuk matriks final tidak memperlihatkan error aplikasi.

Network evidence sesuai matriks HTTP: positif `200`, salah persona/unknown/fake-child `404`,
unauthenticated `307` ke login, header aman tersedia, dan hash binary cocok.

## 7. Freeze dan PR #613

Freeze lama pada PR `#613` mencatat application SHA `380a0708...` dan tree `030ea150...`, tetapi
narasinya masih menyatakan Checkpoint B perlu dimulai. Poin freeze yang masih relevan sudah
dikonsolidasikan di sini:

- artefak dibuat dari aplikasi yang sudah melewati Checkpoint A;
- seluruh binary tetap terikat ke registry hash yang sama;
- hotfix tiga file tidak mengubah screenshot, PDF, deck, atau registry;
- kandidat exact-SHA final sekarang adalah staging SHA `3523911e...` dengan tree
  `06a17b54...`, yang diuji langsung pada matriks ini.

PR `#613` harus ditutup sebagai **superseded**, bukan di-merge apa adanya. Penutupan dilakukan
setelah laporan ini tracked agar provenance freeze tidak hilang.

## 8. Cleanup dan Governance

- Viewport browser dikembalikan ke default.
- Tab QA yang dibuat Executor ditutup.
- Tidak ada screenshot baru, browser state, credential, cookie, token, atau result JSON yang
  masuk manifest Git.
- File `.tmp` tetap untracked dan wajib dibersihkan setelah laporan tidak lagi membutuhkan
  resume evidence.
- Classic protection `develop`, `staging`, dan `main` kembali membutuhkan satu approval dan
  admin enforcement aktif.
- Ruleset `Protect Staging` dan `Protect main` aktif dengan satu required approval.
- Tidak ada PR Wave 9 baru selain PR `#613` yang memang menunggu penutupan superseded.

## 9. Residual Go-Live Gate

Appointment daily activation automation di production belum aktif. Token API dan timer
production tetap prasyarat go-live terpisah. Laporan ini tidak mengklaim appointment activation
harian sudah operasional dan tidak mengizinkan promosi `main` atau perubahan production.

## 10. Executor Assessment dan Reviewer Request

**Executor assessment: seluruh final staging secure-download matrix PASS dan kandidat freeze
exact-SHA siap untuk Independent Final Staging Review.**

Reviewer diminta memverifikasi:

1. SHA/tree/deploy dan zero artifact impact dari hotfix tiga file;
2. lima positive persona download beserta header, filename, size, dan registry hash;
3. wrong-persona, fake-child, missing-artifact, unauthenticated, serta cancel/retry controls;
4. desktop/mobile geometry dan console/network result;
5. laporan ini tracked melalui docs-only Gitflow;
6. PR `#613` ditutup sebagai superseded setelah evidence permanen tersedia;
7. production/main tetap HOLD sampai approval terpisah dan Appointment automation prerequisite
   diputuskan.
