# Wave 9 Checkpoint B Freeze Invalidation and Help Evidence Media Foundation

Tanggal: 2026-08-28
Branch: `fix/wave9-checkpoint-a-screenshot-media-foundation-20260828`
Baseline entry: `535155c3a6f769a3cbeda7f7dcd56d36b564529b`
Shared-auth production SHA: `76d64c6582fdf959d5868d89f36a3e36ea02beea`
Theme manifest SHA-256: `038f82f39d8419e5e398b6f63bbe6edf2c7b756cfbd06f792163b6a9c3b514f5`

## Verdict Executor

`CHECKPOINT B FREEZE INVALIDATED - CHECKPOINT A FOLLOW-UP SOURCE READY FOR INDEPENDENT REVIEW`

Checkpoint B tidak dilanjutkan ke capture screenshot, PDF, atau deck. Preflight source
menemukan bahwa screenshot final tidak pernah dirender, tidak mempunyai authority per
aset, dan tidak mempunyai private streaming route. PDF privat juga dapat berstatus ready
tanpa ikatan hash, ukuran, frozen SHA, dan hasil privacy/visual review.

Sesuai kontrak Wave 9 V2, temuan produk/Help tersebut membatalkan freeze dan
mengembalikan pekerjaan ke Checkpoint A pada branch yang sama. Tidak ada artefak final
yang dibuat dari baseline yang sudah tidak sah.

## Finding yang Ditutup

### P1 - Screenshot final tidak dapat tampil

- `screenshotIds` sekarang diproyeksikan menjadi block hanya ketika media benar-benar
  ready dan authority aset lulus.
- Help renderer menampilkan screenshot sebagai `figure` dengan alt text, caption,
  dimensi stabil, lazy loading, dan selected-child query yang dipertahankan.
- Registry memuat tepat 40 screenshot dengan viewport contract 1440x900, 1366x768,
  1920x1080, dan 390x844.

### P1 - Authority screenshot bergantung pada topik bersama

- Setiap screenshot memiliki role identitas, Appointment, context, permission,
  selected-child, dan Super Admin recovery contract sendiri.
- Screenshot Guru, Siswa, Orang Tua, Industri, TU, Appointment, dan Super Admin tidak
  saling mewarisi akses hanya karena topiknya sama.
- Parent media membutuhkan selected child yang diverifikasi server; parameter anak
  palsu menghasilkan respons generik 404.

### P1 - Media private tidak mempunyai integrity gate

- Route screenshot baru hanya menerima allowlisted ID dan file regular di private root.
- Path traversal, symlink, file hilang, abort, ukuran berbeda, hash berbeda, tipe file
  tidak sah, dan authority mismatch berhenti fail-closed.
- Response memakai private no-store, same-origin resource policy, no-referrer,
  no-sniff, dan generic 404 yang tidak membocorkan keberadaan aset.
- Streaming PDF diperketat dengan realpath containment, symlink rejection, ukuran,
  SHA-256, frozen application SHA, page count, generation timestamp, privacy review,
  dan visual review.
- PDF final wajib memiliki header, Catalog, xref/startxref, EOF, dan jumlah Page yang
  cocok dengan metadata. Runtime melakukan verifikasi hash dan struktur secara bounded,
  lalu mengirim file sebagai abort-aware stream tanpa menahan seluruh PDF di memori.
- Final validator sekarang memeriksa byte file aktual dan frozen SHA, bukan hanya label
  status `ready`.
- Final mode menolak eksekusi bila application SHA, shared-auth SHA, atau theme
  manifest SHA-256 tidak diberikan; wrapper assertion meneruskan kontrak freeze yang
  sama.
- Setiap label viewport terikat ke dimensi canonical. Metadata atau byte gambar yang
  tidak cocok dengan 1440x900, 1366x768, 1920x1080, atau 390x844 ditolak.

### P1 - Registry panduan tidak satu-per-persona

- Registry sekarang menyediakan satu panduan lengkap dan satu PDF terpisah untuk
  masing-masing dari 23 persona canonical.
- Appointment persona tidak dapat diakses hanya dengan stable role GURU/TATA_USAHA;
  position code tetap wajib.
- Wali Kelas, Guru dengan Teaching Assignment, dan Orang Tua memakai context contract
  masing-masing.

### P1 - Evidence tidak terikat consumer dan source yang benar

- Screenshot consumer sekarang mencakup panduan persona dan empat deck yang relevan,
  bukan hanya panduan lengkap.
- PDF persona dan deck sekarang mempunyai contract authority typed yang sama dengan
  screenshot. Validator komposisi membuktikan setiap authority minimal penerima dapat
  mengakses setiap screenshot yang masuk ke artefaknya.
- Screenshot SA-only, KS-only, Teaching Assignment, selected-child, dan modul
  berpermission khusus dikeluarkan dari consumer yang tidak kompatibel; akses screenshot
  tidak dilonggarkan untuk membuat validator lulus.
- Negative matrix mencakup KS/BKK/Hubin terhadap Appointment SA-only, WAKA tanpa Teaching
  Assignment, Orang Tua terhadap screenshot Siswa, dan deck dengan authority campuran.
- Screenshot login ditandai sebagai `shared-auth`; final gate mewajibkan shared-auth SHA
  dan theme manifest SHA-256.
- Screenshot aplikasi tetap terikat exact application SHA.

### P2 - Capture route belum fail-closed

- Parser semantik hanya menerima path DIIS yang diizinkan, fragment sederhana, query
  `studentId` tervalidasi, serta query `view` typed khusus `/dashboard/akademik`.
- URL absolute, protocol-relative, backslash, root nonproduk, query arbitrer, duplicate
  parameter, serta redirect nested plain/encoded ditolak sebelum capture registry atau
  CTA dapat digunakan. Dot-segment mentah, percent-encoded, double-encoded, dan encoded
  slash seperti `/dashboard/%2e%2e%2flogin` diperiksa sebelum `URL` menormalisasi path.
- Matrix adversarial dan jalur internal aman diuji langsung melalui schema dan helper
  produksi, bukan pencarian source string.

### P2 - Consumer dapat lulus hanya dengan screenshot generik

- Delapan varian persona-safe ditambahkan untuk Rapor Siswa, oversight Rapor, pengumuman
  Appointment, identitas Appointment sendiri, Users Staf Kepegawaian, Data Siswa Waka/Guru
  BK, PPDB Waka Humas, serta Kelas Waka Kurikulum/KAPROG.
- Setiap PDF persona wajib mempunyai minimal satu screenshot non-generik yang topiknya
  beririsan dengan kontrak PDF tersebut.
- Setiap topik workflow non-generik yang dijanjikan deck wajib memiliki screenshot sendiri;
  validator tidak lagi menerima bukti hanya dari Login atau Beranda.
- Deck internal dipersempit ke onboarding dan Jadwal yang benar-benar dibuktikan. Deck
  keluarga dipisahkan dari Industri dan wajib memakai selected-child plus permission
  keluarga. Empat deck tetap dipertahankan.
- Negative regression menghapus bukti workflow secara sementara dan membuktikan validator
  menghasilkan `evidence.missing-workflow-screenshot` serta
  `deck.missing-topic-screenshot`.

### P2 - CTA operasional generik dan kehilangan konteks

- Dua puluh sembilan workflow memiliki tepat satu CTA utama berlabel spesifik, termasuk
  `Buka Rapor Resmi`, `Buka Bank Soal`, dan `Buka Penutupan Semester`; topik kontak resmi
  tidak memaksakan CTA workflow.
- CTA memakai anchor Next.js native. Default mobile, touch, dan PWA adalah same-tab.
  Desktop browser dengan fine pointer menampilkan anchor `target="_blank"`, rel aman,
  dan disclosure `membuka tab baru`; tidak ada `window.open()` atau user-agent sniffing.
- Route CTA menggunakan parser internal yang sama dengan capture. Orang Tua harus membawa
  `studentId` terverifikasi; anak A dan B tidak dapat tertukar. Persona non-parent tetap
  dapat memakai workflow bersama tanpa dipaksa memiliki selected-child.
- Kontrak deep link Akademik sekarang typed dan allowlisted per authority. Guru dan
  KAPROG membuka workspace Teaching Assignment mereka, KS membuka monitoring asesmen,
  WAKA_KURIKULUM membuka operasional kurikulum, dan Super Admin membuka operasional
  akademik; keempat authority tersebut tidak lagi disatukan sebagai satu persona
  `leadership` yang menebak workspace.
- Siswa membuka `Tugas > Remedial`, bukan filter nilai di bawah KKTP. Daftar tersebut
  berasal dari AssessmentSession remedial dan RemedialParticipant milik siswa, memuat
  tenggat serta lifecycle authoritative, memprioritaskan tindakan aktif sebelum riwayat
  tuntas, dan tidak membawa pertanyaan atau jawaban. Proyeksi generik Orang Tua tidak
  diperlebar dengan metadata lifecycle; alur keluarga tetap memakai selected-child
  endpoint yang terpisah dan fail-closed.
- Query duplikat, view tidak dikenal, dan kombinasi view-persona yang tidak sah gagal
  closed ke state default yang tidak memperluas authority. State resolver yang sama
  dipakai katalog Help, server page, dan workspace persona sehingga CTA tidak berhenti
  sebagai query dekoratif.
- Panel CTA berada setelah Tujuan dan sebelum Langkah utama dengan target minimal 44px,
  fokus terlihat, ikon Lucide, serta hanya satu tindakan utama agar panduan tidak bising.

### P2 - Digest source tidak reproducible

- Helper `apps/web/scripts/help-source-manifest.mjs` memiliki manifest literal 34 path,
  mengurutkan path secara ordinal byte UTF-8, menghitung SHA-256 byte aktual, dan
  menyerialisasi `<path><TAB><sha256>` dengan LF tanpa LF penutup.
- Test menjalankan helper sebagai proses terpisah, memeriksa jumlah/path/order/serialisasi,
  lalu menghitung ulang digest agregat. Laporan menggunakan output helper yang sama.

### P2 - Screenshot dan final validator membaca binary penuh

- Screenshot runtime menghitung hash secara incremental, menahan header maksimum 1 MiB
  untuk dimensi, menghormati abort signal, lalu mengirim file melalui stream.
- Inspector sinkron final-mode membaca screenshot dan PDF per chunk 64 KiB. Hash, ukuran,
  dimensi, struktur PDF, page count, tail `startxref`, dan target xref diverifikasi tanpa
  `readFileSync()` binary penuh.
- Pemeriksaan file besar sintetis, pembatalan, standalone streaming, mismatch hash,
  mismatch dimensi, dan PDF lintas chunk telah menjadi behavioral regression.

### P3 - Laporan untracked melewati whitespace check

- Trailing whitespace pada metadata laporan telah dibersihkan.
- Pemeriksaan manifest kini mencakup seluruh tracked dan untracked path secara literal,
  bukan hanya output `git diff --check`.

### P1 - Status Appointment automation berpotensi dinyatakan operasional

Katalog canonical sekarang menyatakan dengan eksplisit bahwa automation aktivasi
Appointment harian di production belum aktif dan masih merupakan prasyarat go-live.
Dokumentasi final tidak boleh menyatakannya sebagai fitur operasional saat ini.

## Privacy dan UX Contract

- Fixture wajib sintetis dan PII-safe.
- Password, temporary credential, pairing code, token, cookie, secret, email, telepon,
  alamat, NIS/NISN, kesehatan, nilai individual, dan data keuangan individual dilarang
  masuk screenshot.
- Metadata gambar dan nama file tidak boleh membawa identitas pengguna.
- UI Help mempertahankan style aplikasi yang ada; perubahan hanya pada evidence media
  rendering dan tidak mengubah skema warna per hari.

## Verifikasi Executor

| Gate | Hasil |
| --- | --- |
| Focused Help tests | 4 suite / 44 test pass |
| Focused Student Dashboard API | 1 suite / 3 test pass |
| Standalone trace smoke | 30/30 pass pada `.next/standalone` |
| Full API tests | 66 suite / 1.304 test pass; 1 suite / 4 test skip existing |
| Full Web tests | 47 suite / 353 test pass |
| API type-check, lint, build | pass |
| Web type-check | pass |
| Web lint | pass; hanya warning deprecation/plugin existing |
| Fresh Web build | pass, 49/49 halaman |
| Screenshot private trace | pass |
| PDF private trace | pass |
| Synthetic file cleanup | pass; hanya README tersisa |
| `git diff --check` | pass |
| Staged changes | 0 |

Dependency diinstal lokal dengan lockfile existing dan `--ignore-scripts`; tidak ada
dependency atau lockfile yang diubah.

Final evidence refresh dilakukan pada `2026-08-28 20:46:10 +07:00`, setelah seluruh
perbaikan source selesai. Snapshot tersebut memuat tepat 34 file source dengan digest
manifest SHA-256
`33f3869e6e2aefed431874eac85ac8a211a11d79171ff6a86e760d7793d83ae3`.
Fresh production build pada snapshot ini selesai dengan exit code 0. Tidak ada edit
source setelah evidence refresh; perubahan berikutnya hanya pembaruan laporan ini.

Digest dapat direproduksi dengan aturan berikut: urutkan path source secara ordinal,
hitung SHA-256 lowercase untuk byte setiap file, serialisasikan setiap baris sebagai
`<path><TAB><sha256>` dengan pemisah LF tanpa LF penutup, lalu hitung SHA-256 atas byte
UTF-8 hasil serialisasi. Ledger input canonical:

| Path | SHA-256 |
| --- | --- |
| `apps/api/src/__tests__/student-dashboard.spec.ts` | `8c0d62b5cee18b609cb409607b43900de83b01bcd7fec111c71b6ed38d6ab779` |
| `apps/api/src/student-dashboard/student-dashboard.service.ts` | `6b3753a255c993ac46dee0785fa4db75fce378d110ae1523288e8bc5119773e2` |
| `apps/web/next.config.js` | `e21f90e858ffbd05fe91f6968b28badc4935474b8e4d909a388dfce1a87b46fd` |
| `apps/web/private/help-screenshots/README.md` | `bc0af8b59c9d0bb69fb4ec7e71862d2f37f559c88c9518d975d2292f444bcdad` |
| `apps/web/scripts/help-source-manifest.mjs` | `577cfc15e95532e2f64c862d4e08d2dafb92c12da6bfb6fcde29c919bd1a6b33` |
| `apps/web/src/__tests__/help-artifact-route.test.ts` | `6f3ffa69debda96f5048a4ca0e4f32291d86786ee57e0b4103c7835f187e75c1` |
| `apps/web/src/__tests__/help-screenshot-route.test.ts` | `ba32ff1d570141ec3661ad02148f7fb2d07cd170c74a5786e4fba5c2158e9fe3` |
| `apps/web/src/__tests__/help-system.test.ts` | `c970867126f353a0006b5dc519ed533dcdb62782999629174d5b30aac9178954` |
| `apps/web/src/__tests__/help-topic-content.test.ts` | `d6fe7650d963b80bb96df578d1af027e93a64a7a84a15224a64bfa678b5ca709` |
| `apps/web/src/app/api/help/artifacts/[id]/route.ts` | `2c0988ea38620b6e00a9e2dfbdb9be342ff28b4b7bbf37210094b1e295fbb02f` |
| `apps/web/src/app/api/help/screenshots/[id]/route.ts` | `0b3d6e68a84582ee2fb3f90308b51eee3234ecd7122d112fcf0c74d4eb825a32` |
| `apps/web/src/app/dashboard/akademik/_components/AkademikWorkspace.tsx` | `c58cad37ec65292a5262f737b830989b2a24eeb97480d7db498783ceff8c4549` |
| `apps/web/src/app/dashboard/akademik/_components/KsWorkspace.tsx` | `440dd814c60bcef9210833fbb33c03961081c477e191619fa9d87c25b7c16eb0` |
| `apps/web/src/app/dashboard/akademik/_components/ortu/BerandaOrtu.tsx` | `8f40e75bcbaa5c704a33e509ad55c60cce535fb802915285f624f51d7897297b` |
| `apps/web/src/app/dashboard/akademik/_components/ortu/OrtuWorkspace.tsx` | `c8d3f3acd7cb174e8ff1880f1f62e20aea54da4f89916e9052e126969e27b562` |
| `apps/web/src/app/dashboard/akademik/_components/siswa/NilaiSiswa.tsx` | `0a24c268bcd69d183b6948e8058485e01bffcd7d1ddb12c444d44b37da31c913` |
| `apps/web/src/app/dashboard/akademik/_components/siswa/SiswaWorkspace.tsx` | `ee9fc42ddc4f47daaf910ea0130d4f8585f7a3867d0fc784bd37e4cd539d21e8` |
| `apps/web/src/app/dashboard/akademik/_components/siswa/TaskDetailModal.tsx` | `bca7aaf7f2751b933424e0a7b56de181f8d8c7db38c17699a1b16bc75a01a9a0` |
| `apps/web/src/app/dashboard/akademik/_components/siswa/TugasSiswa.tsx` | `8d1cee1cffd8966f3b2a62c4bfdf913030aebc97fd7d8e2132195282f2923a99` |
| `apps/web/src/app/dashboard/akademik/_components/siswa/siswa-types.ts` | `bde3cc83df0741de8b6efdee7e9892757eb9bf16659085e4f6875256aa5913ea` |
| `apps/web/src/app/dashboard/akademik/page.tsx` | `ebffe66bd6f170b4696f36140ea4b210ccb1ade99e654b535d01467c704a8793` |
| `apps/web/src/app/dashboard/panduan/[slug]/page.tsx` | `2476365132d81b3a2bd172b019e0c88894f74f8b78d772d605af39250b50efa5` |
| `apps/web/src/app/dashboard/panduan/_components/HelpTopicContent.tsx` | `2f42346505b9eb583c38c8bdfe5c933c77cae1b53bfa68dc68aeaa29085cbe65` |
| `apps/web/src/app/globals.css` | `2ce6729ff0beb1fa7a3c4c65a0250f3616d1f6ff5eb44ffcdaf9d7ab6d8dea9b` |
| `apps/web/src/lib/academic-workflow-deep-link.ts` | `c9f7b18a9ab905b706cdca59936764918e048b36dc8e385872b442bb0e7dd669` |
| `apps/web/src/lib/help/help-artifacts.ts` | `04a3d05e2225284df376a952c84f05f53c77bbbaadebfde936ff158f42a3d401` |
| `apps/web/src/lib/help/help-catalog.ts` | `33b0f3fedf4ba1d21d0a742a6488db97e8a939748a4d6372cb739942a93ff12f` |
| `apps/web/src/lib/help/help-evidence-authority.ts` | `d972ea4635a3b416c1b881eeae2722eee06629ad2bb2be359ffd5696016f3754` |
| `apps/web/src/lib/help/help-evidence.ts` | `95bf66424e0a1b79f93f1a368c883568d2b3732d979ce5ed9c58facfa5801bdf` |
| `apps/web/src/lib/help/help-links.ts` | `2ed104c9bf27e74ab1874a391425cde0161a49ac43c9cf632c823d9621383abb` |
| `apps/web/src/lib/help/help-projection.ts` | `1f77a724c2373e10a2cf2ba524095f43617182d340d8a5bc13b8feef5ee11a23` |
| `apps/web/src/lib/help/help-schema.ts` | `d5715e14dc307ae1540c9c97f75de9654458f3eb49bc6392e49f2c7072b7adbe` |
| `apps/web/src/lib/help/help-screenshots.ts` | `d2afbaad69edbdb647982e70b4e14f47e54050228184dd8564a62202b4e6551e` |
| `apps/web/src/lib/help/help-validation.ts` | `adb3e5f53b7e50a03897c9cd29c186376506794b61512972134a740fd0b07398` |

## Manifest Source Follow-up

1. `apps/api/src/__tests__/student-dashboard.spec.ts`
2. `apps/api/src/student-dashboard/student-dashboard.service.ts`
3. `apps/web/next.config.js`
4. `apps/web/private/help-screenshots/README.md`
5. `apps/web/scripts/help-source-manifest.mjs`
6. `apps/web/src/__tests__/help-artifact-route.test.ts`
7. `apps/web/src/__tests__/help-screenshot-route.test.ts`
8. `apps/web/src/__tests__/help-system.test.ts`
9. `apps/web/src/__tests__/help-topic-content.test.ts`
10. `apps/web/src/app/api/help/artifacts/[id]/route.ts`
11. `apps/web/src/app/api/help/screenshots/[id]/route.ts`
12. `apps/web/src/app/dashboard/akademik/_components/AkademikWorkspace.tsx`
13. `apps/web/src/app/dashboard/akademik/_components/KsWorkspace.tsx`
14. `apps/web/src/app/dashboard/akademik/_components/ortu/BerandaOrtu.tsx`
15. `apps/web/src/app/dashboard/akademik/_components/ortu/OrtuWorkspace.tsx`
16. `apps/web/src/app/dashboard/akademik/_components/siswa/NilaiSiswa.tsx`
17. `apps/web/src/app/dashboard/akademik/_components/siswa/SiswaWorkspace.tsx`
18. `apps/web/src/app/dashboard/akademik/_components/siswa/TaskDetailModal.tsx`
19. `apps/web/src/app/dashboard/akademik/_components/siswa/TugasSiswa.tsx`
20. `apps/web/src/app/dashboard/akademik/_components/siswa/siswa-types.ts`
21. `apps/web/src/app/dashboard/akademik/page.tsx`
22. `apps/web/src/app/dashboard/panduan/[slug]/page.tsx`
23. `apps/web/src/app/dashboard/panduan/_components/HelpTopicContent.tsx`
24. `apps/web/src/app/globals.css`
25. `apps/web/src/lib/academic-workflow-deep-link.ts`
26. `apps/web/src/lib/help/help-artifacts.ts`
27. `apps/web/src/lib/help/help-catalog.ts`
28. `apps/web/src/lib/help/help-evidence-authority.ts`
29. `apps/web/src/lib/help/help-evidence.ts`
30. `apps/web/src/lib/help/help-links.ts`
31. `apps/web/src/lib/help/help-projection.ts`
32. `apps/web/src/lib/help/help-schema.ts`
33. `apps/web/src/lib/help/help-screenshots.ts`
34. `apps/web/src/lib/help/help-validation.ts`
35. `docs/audits/WAVE9-CHECKPOINT-B-FREEZE-INVALIDATION-HELP-EVIDENCE-MEDIA-FOUNDATION-2026-08-28.md`

## Gate Berikutnya

1. Independent source review atas 35-file manifest ini. Laporan reviewer tetap
   reviewer-owned dan tidak masuk manifest executor secara diam-diam.
2. Jika disetujui, pindahkan exact reviewed patch ke branch baru dari current
   `origin/develop`, verifikasi digest/tree equivalence, lalu explicit Git packaging;
   dilarang broad add.
3. Deploy reviewed SHA ke staging dan ulangi affected Help/persona/browser matrix.
4. Bekukan ulang application SHA, shared-auth SHA, dan theme manifest.
5. Baru lanjut Checkpoint B untuk capture PII-safe, 24 PDF, 4 deck, adoption package,
   deterministic rendering, factual trace, privacy scan, dan final visual QA.

Tidak ada commit, push, PR, deploy, shared Keycloak mutation, database mutation, atau
production change pada follow-up ini.
