# Wave 9 Checkpoint A Help Evidence Media Foundation Staging QA

Tanggal: 2026-08-28

## Verdict Executor

`AFFECTED STAGING BROWSER MATRIX PASS - READY FOR INDEPENDENT STAGING REVIEW`

Tidak ditemukan defect produk P0/P1/P2 pada matriks browser yang terpengaruh oleh
follow-up Help, deep link, selected-child, dan Remedial Saya. Reviewed source telah
dideploy pada staging dan cocok dengan checkout runtime. Checkpoint B belum dimulai:
tidak ada screenshot final, PDF, deck, promosi `main`, atau perubahan production dalam
QA ini.

## Exact-SHA Binding

| Evidence | Nilai |
| --- | --- |
| Feature source SHA | `cc8d5f49347374e7bd38b947975726ef03988ed8` |
| Develop merge SHA | `c1b0a83108b4129616a3d16051e2df8d25b4f35d` |
| Staging/deployed application SHA | `eda0541ba6b5612e1640b4845220a314bc517822` |
| Deploy workflow | `33180554979` - success |
| Production/main SHA, tidak berubah | `76d64c6582fdf959d5868d89f36a3e36ea02beea` |
| Shared-auth production SHA | `76d64c6582fdf959d5868d89f36a3e36ea02beea` |
| Theme manifest SHA-256 | `038f82f39d8419e5e398b6f63bbe6edf2c7b756cfbd06f792163b6a9c3b514f5` |
| Source manifest | 34 file |
| Source manifest digest | `33f3869e6e2aefed431874eac85ac8a211a11d79171ff6a86e760d7793d83ae3` |

`origin/develop` dan `origin/staging` mempunyai tree yang identik. Checkout VPS
`/opt/diis-staging/smart-ai-school` berada tepat pada SHA staging tersebut. Tidak ada
PR terbuka saat pemeriksaan akhir.

## Runtime Preflight

- Public staging API health: `200`, status `ok`, database `up`.
- `smk-staging-api`: `running/healthy`.
- `smk-staging-web`: `running`.
- Prisma: 45 migration ditemukan dan schema database dinyatakan up to date.
- Deploy workflow selesai sukses dengan head SHA yang sama dengan checkout VPS.
- Approval klasik `develop`, `staging`, dan `main` kembali `1`.
- Ruleset `Protect Staging` dan `Protect main` aktif dan masing-masing mewajibkan satu
  approval.

## Fixture dan Authentication

- QA memakai akun federated Keycloak sintetis dan PII-safe yang sudah disetujui untuk
  staging; tidak ada mock auth atau API bypass.
- Role dan authority berasal dari database staging nyata, termasuk Appointment aktif,
  Teaching Assignment, dua anak milik orang tua, dan dua lifecycle remedial siswa.
- Password fixture yang telah stale dirotasi melalui administrasi Keycloak resmi tanpa
  mengubah realm role, Appointment, Teaching Assignment, atau data akademik.
- Credential hanya disimpan pada registry lokal reusable yang dibatasi aksesnya. Tidak
  ada password, token, cookie, username, UUID internal, atau data personal dalam laporan.
- Login federated dan pergantian locale Indonesia/English tetap berfungsi.

## Persona Matrix

| Persona | Jalur dan CTA | Hasil runtime |
| --- | --- | --- |
| Super Admin | Bank Soal dan Asesmen -> `Buka Operasional Akademik` | Membuka workspace Akademik di tab baru pada desktop; source Help tetap terbuka. |
| Kepala Sekolah | CTA `Buka Monitoring Asesmen` | Mendarat pada monitoring asesmen, bukan Bank Soal; menu manajemen user tidak melebar ke persona ini. |
| WAKA Kurikulum | CTA `Buka Operasional Kurikulum` | Mendarat pada operasional kurikulum/review modul; tidak memakai workspace KS. |
| KAPROG | CTA `Buka Bank Soal` | Mendarat pada Bank Soal dalam konteks program keahlian/Teaching Assignment yang sah. |
| GURU | CTA Bank Soal, Modul Ajar, dan Remedial | Ketiga deep link membuka subfitur yang dinamai, bukan hanya halaman Akademik default. |
| SISWA | CTA `Buka Remedial Saya` | Mendarat pada Tugas > Remedial. Item `Perlu ulang` diprioritaskan sebelum `Tuntas`; tenggat dan lifecycle tampil. |
| ORANG_TUA | CTA `Buka Status Remedial Anak` | Membawa anak terpilih secara exact dan membuka proyeksi remedial keluarga yang benar. |

## Selected-Child dan Privacy Matrix

- Akun orang tua memiliki dua anak sintetis yang berbeda.
- Child switch resmi menampilkan kedua anak, lalu memperbarui seluruh link Help dengan
  anak yang dipilih.
- Memilih anak A dan membuka Help mempertahankan anak A pada CTA serta workflow tujuan.
  Data anak B tidak tercampur.
- Memilih anak B menghasilkan empty state yang benar untuk anak B, tanpa data anak A.
- `studentId` milik pihak lain menghasilkan pesan generik bahwa panduan tidak tersedia;
  tidak ada nama anak, keberadaan resource, metadata internal, atau CTA yang bocor.
- Direct unauthenticated Help route kembali ke login. Context anak tidak dipercaya atau
  diteruskan sebelum ownership terverifikasi, sehingga jalur pre-auth tetap fail-closed.
- Proyeksi siswa/orang tua tidak membawa kunci jawaban, rubrik, jawaban soal,
  `sourceGradeId`, `sessionId`, `participantId`, atau UUID internal.

## Desktop, Mobile, dan Interaction

### Desktop 1440 x 900

- CTA desktop adalah anchor asli dengan `target="_blank"`,
  `rel="noopener noreferrer"`, dan disclosure `membuka tab baru`.
- Klik dan keyboard `Enter` masing-masing membuka tepat satu tab baru. Tab sumber Help
  tetap tersedia.
- `Tab` memindahkan fokus ke link valid berikutnya; `Shift+Tab` mengembalikan fokus ke
  CTA. Fokus terlihat dan tidak terjebak.
- Target CTA minimal 44 px dan tidak ada horizontal overflow.

### Mobile 390 x 844

- Hanya CTA same-tab yang terlihat; varian desktop new-tab tersembunyi.
- Klik tidak menambah jumlah tab dan membuka workflow pada tab yang sama.
- Context anak tetap dipertahankan pada href dan workflow tujuan.
- Lebar dokumen tepat 390 px, tanpa horizontal overflow.
- Seluruh link, tombol, dan input yang terlihat memenuhi target minimum 44 px.
- Hierarki judul, body, dan CTA tetap terbaca tanpa overlap.

### PWA Boundary

Kontrak PWA same-tab telah ditutup oleh regression source yang direview. QA live ini
membuktikan perilaku mobile/touch pada Chrome staging, tetapi tidak mengklaim sesi
installed-PWA karena browser QA tidak memiliki instalasi PWA reusable yang dapat
diverifikasi. Tidak ada user-agent sniffing atau `window.open()` pada kontrak CTA.

## Console dan Network

- Fresh Help reload: 37 network event, tanpa HTTP `>=400` dan tanpa loading failure.
- Fresh family remedial workflow: 29 network event, tanpa HTTP `>=400`, loading failure,
  console warning, atau console error.
- Satu pesan `Could not establish connection. Receiving end does not exist.` pada tab
  lama dibuktikan berasal dari ekstensi browser. Fresh tabs aplikasi tidak
  mereproduksinya dan tidak ada request aplikasi yang gagal.

## Evidence Hygiene dan Cleanup

- Screenshot mobile hanya dipakai untuk inspeksi layout selama QA, tidak dipertahankan
  sebagai artefak final karena freeze Checkpoint B belum sah.
- Seluruh tab tambahan staging/auth yang dibuat untuk matrix ditutup. Satu tab Help
  sintetis yang menjadi tab terakhir pada jendela ekstensi Chrome tidak dapat ditutup
  tanpa menutup jendela browser pengguna; tab itu tidak memuat credential atau PII.
  Debugger sudah terlepas sehingga emulasi viewport QA tidak lagi aktif.
- Script inspeksi fixture, salinan credential sementara, file reset password, screenshot
  sementara, serta salinannya di host/container staging dibersihkan.
- Registry fixture reusable tetap dipertahankan agar QA berikutnya dapat langsung
  targeted tanpa setup ulang.
- Tidak ada source aplikasi, database schema, migration, Keycloak role, shared auth,
  staging deployment, production, atau `main` yang dimutasi oleh QA browser.

## Freeze Candidate

Checkpoint A dapat diajukan ke Independent Staging Reviewer dengan kandidat freeze:

- application staging SHA: `eda0541ba6b5612e1640b4845220a314bc517822`;
- shared-auth production SHA: `76d64c6582fdf959d5868d89f36a3e36ea02beea`;
- theme manifest SHA-256:
  `038f82f39d8419e5e398b6f63bbe6edf2c7b756cfbd06f792163b6a9c3b514f5`;
- source manifest digest:
  `33f3869e6e2aefed431874eac85ac8a211a11d79171ff6a86e760d7793d83ae3`.

Freeze baru sah setelah reviewer independen memastikan tidak ada P0/P1/P2 dan laporan
ini dipermanenkan melalui Gitflow. Screenshot final, PDF, dan deck tetap dilarang sebelum
freeze tersebut diberikan.

## Go-Live Boundary

Automation aktivasi Appointment harian di production masih belum aktif dan tetap
menjadi prasyarat go-live. Laporan ini tidak menyatakan automation tersebut sudah
operasional.
