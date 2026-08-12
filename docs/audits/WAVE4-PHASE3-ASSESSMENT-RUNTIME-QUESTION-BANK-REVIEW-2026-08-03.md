# Wave 4 Phase 3 Assessment Runtime and Question Bank Review

Tanggal review: 2026-08-06
Branch: `feat/wave4-assessment-runtime-question-bank-20260806`
Baseline: `origin/develop@e7dc3d0`
Mode: independent review only

## Verdict

`STAGING FOLLOW-UP EVIDENCE COMPLETE - READY FOR FINAL REVIEW`

Source sudah jauh lebih aman daripada baseline, khususnya snapshot soal, pemisahan
kunci jawaban, attempt server-side, idempotensi baris Grade, strict provider schema,
lease/fencing AI, durable outbox worker, CSV identity/FK, dan notification recovery.
Follow-up ketujuh tetap menutup seluruh temuan source dan approval packaging sebelumnya
tetap valid. Runtime staging pada SHA `3c69a00c6c8c080a93d59e9208fe7ddac0bd34fd`
membuktikan alur inti GURU -> SISWA -> koreksi -> Gradebook, privasi kunci jawaban,
responsive mobile, outbox, dan dua hotfix terakhir. Follow-up 2026-08-12 pada SHA
`4842278f41528f059d84f766f8a69b55106ed37c` menutup provider matrix, negative authority
API, quality sampling, cleanup, dan evidence report packaging. Final staging sign-off
tetap keputusan reviewer, tetapi blocker evidence yang tercatat pada re-review 2026-08-11
sudah dilengkapi.

Confidence: **0.97**.

## Independent Staging Follow-up Closure - 2026-08-12 (Latest)

### Bounded verdict

- **Provider matrix Bank Soal:** `PASS`.
- **Negative authority API controls:** `PASS`.
- **Quality sampling:** `PASS`.
- **Evidence packaging:** `READY`, pending merge of this docs-only artifact into
  `develop` and promotion to `staging`.
- **Main/production promotion:** `HOLD` until reviewer grants final main gate.

### Closure evidence

- PR #474 merged to `develop` with CI green and merge commit
  `748ebd2eb9568488b03bebe969964dda4da500dc`.
- PR #475 merged to `staging` with CI green and merge commit
  `4842278f41528f059d84f766f8a69b55106ed37c`.
- Deploy run `31555792343` completed successfully for SHA
  `4842278f41528f059d84f766f8a69b55106ed37c`.
- VPS staging checkout `/opt/diis-staging/smart-ai-school`: same SHA; health `ok`.
- Production checkout `/home/appuser/smart-ai-school`: read-only SHA
  `8d03902dc29d6faa1e91137a08155ef56d546afb`; production was not modified.
- Branch protection verified restored:
  - `develop`: `required_approving_review_count=1`;
  - `staging`: `required_approving_review_count=1`.
- Open PR list at closure: empty.

### Provider matrix result

- OpenAI default Bank Soal draft generation returned 201, model `gpt-4.1-mini`, one item,
  and generation id present.
- Forced Ollama Bank Soal draft generation returned 201, model `ollama`, one item, and
  generation id present after PR #474/#475 normalized provider subject output to the
  authoritative teacher context.
- Controlled invalid OpenAI credential test returned 503 `AI_PROVIDER_AUTH_FAILED`, did
  not create canonical questions, and staging env was restored immediately afterward.
- Redis/provider cleanup verified no forced circuit state or invalid key placeholder
  remained.

### Negative authority API result

Direct authenticated server-boundary checks returned fail-closed 403 for:

- SISWA against question draft generation and assessment session creation;
- ORANG_TUA against question draft generation and assessment session creation;
- GURU without matching TeachingAssignment against question draft generation and
  assessment session creation.

Responses did not expose answer key, guide answer, rubric internals, teacher ID, or
private resource details.

### Quality sampling result

- Matrix: 2 majors x 6 subjects = 12 combinations.
- Subjects: Matematika, Bahasa Indonesia, Bahasa Inggris, Administrasi Infrastruktur
  Jaringan, Keamanan Jaringan Dasar, Troubleshooting Jaringan.
- Minimum per combination: 10 questions.
- Actual: 120 questions reviewed.
- Result: 12/12 combinations PASS; 0 failed combinations; 0 wrong keys observed; 0 hard
  answer leaks; 0 real PII; 0 rejected batches.

### Packaging instruction

Stage exactly:

- `docs/audits/WAVE4-PHASE3-ASSESSMENT-RUNTIME-QUESTION-BANK-REVIEW-2026-08-03.md`
- `docs/audits/WAVE4-PHASE3-ASSESSMENT-RUNTIME-QUESTION-BANK-STAGING-QA-2026-08-11.md`

This is a docs/evidence-only package. Do not include source, cache, fixture dumps,
credentials, screenshots, or runtime temp files.

## Independent Staging Re-review - 2026-08-11 (Superseded by 2026-08-12 Follow-up Closure)

### Bounded verdict

- **Core functional staging flow:** `PASS`.
- **Final staging sign-off:** `FOLLOW-UP REQUIRED`.
- **Main/production promotion:** `HOLD`.
- **Source/code remediation:** tidak diperlukan kecuali follow-up QA menemukan defect
  baru. Kekurangan saat ini adalah evidence/runtime closure, bukan temuan source baru.

### Findings

#### P1-S1 - Provider matrix Bank Soal belum dibuktikan pada endpoint nyata

Laporan staging hanya membuktikan satu AI generation pada `Produktif TKJ` yang
menghasilkan empat tipe soal. Laporan tidak mengikat generation tersebut ke provider
aktual, tidak membuktikan forced Ollama pada endpoint Bank Soal, dan tidak membuktikan
failure path ketika provider gagal atau output ditolak. Ini belum memenuhi remaining
runtime gate reviewer untuk OpenAI + Ollama serta tidak cukup untuk memastikan tidak ada
canonical Question kosong/duplikat atau ledger palsu pada failure.

Required narrow QA:

1. jalankan satu generation Bank Soal nyata melalui OpenAI dan rekam provider/model dari
   audit yang sudah di-redact;
2. buka circuit staging sesuai protokol yang disetujui, jalankan payload Bank Soal yang
   sama melalui Ollama, lalu bersihkan seluruh circuit/probe/notice key;
3. lakukan satu controlled provider/output failure dan buktikan UI dapat retry, tidak ada
   canonical Question baru, generation status truthful, dan tidak ada answer/PII leak;
4. kembalikan provider staging ke `openai/closed` dan rekam safe counts/status saja.

#### P1-S2 - Negative authority baru dibuktikan lewat visibility UI

SISWA dan ORANG_TUA memang tidak melihat authoring surface, tetapi laporan menyatakan
direct internal API proof tidak dijalankan. Hidden UI bukan boundary authorization.
Selain itu belum ada proof GURU lain tanpa TeachingAssignment aktif ditolak terhadap
Bank Soal/session milik fixture GURU.

Required narrow QA:

- gunakan sesi role yang sudah tersedia dan panggil endpoint authoring melalui jalur
  aplikasi yang sah, bukan URL proxy publik mentah;
- buktikan SISWA, ORANG_TUA, dan GURU tanpa assignment yang sesuai menerima 403/fail
  closed untuk generate/accept question, create/activate session, dan correction;
- pastikan respons tidak memuat question key, guide answer, rubric internal, teacher ID,
  atau detail resource lain.

#### P2-S1 - Quality sampling belum memenuhi acceptance reviewer

Evidence hanya mencakup satu mapel produktif, satu jurusan, dan empat soal. Reviewer
sebelumnya menetapkan sampling minimal tiga mapel umum dan tiga mapel produktif pada dua
jurusan, minimal sepuluh soal per kombinasi, dinilai manusia dengan rubrik alignment TP,
ketepatan kunci, kejelasan, difficulty, relevansi jurusan, dan ambiguitas. Karena itu QA
saat ini membuktikan operability, belum membuktikan kualitas keluaran secara representatif.

Sampling dapat dilakukan tanpa membuat banyak laporan: tambahkan satu tabel ringkas ke
laporan QA yang sama berisi kombinasi, provider, jumlah accepted/edit ringan/rejected,
reason code, kunci salah, hard validation leak, dan catatan guru. Target tetap: nol kunci
salah/hard leak dan minimal 90% accepted setelah edit ringan.

#### P2-S2 - Evidence final belum permanen di Git

`WAVE4-PHASE3-ASSESSMENT-RUNTIME-QUESTION-BANK-STAGING-QA-2026-08-11.md` masih untracked
di worktree reviewer dan tidak ditemukan pada `origin/staging`. Bukti QA tidak boleh hanya
berada di satu worktree lokal sebelum main gate.

Required packaging:

- setelah P1-S1, P1-S2, dan P2-S1 ditutup, perbarui laporan QA yang sama;
- stage laporan QA dan reviewer report ini dengan explicit file list;
- buat docs/evidence PR ke `develop`, promote ke `staging`, tunggu CI dan staging deploy
  bila exact staging tree menjadi syarat main gate;
- baru buat promotion PR dari latest `origin/staging` ke `main`.

### Evidence independently confirmed

- GitHub deploy run `31471578245`: success pada branch staging dan SHA
  `3c69a00c6c8c080a93d59e9208fe7ddac0bd34fd`.
- VPS staging checkout: SHA yang sama; `smk-staging-api` healthy dan
  `smk-staging-web` running.
- `origin/develop`: `17d312c570408d30f38cbc6970b2eec865d4fcd5`.
- `origin/staging`: `3c69a00c6c8c080a93d59e9208fe7ddac0bd34fd`.
- `origin/main`: tetap `8d03902dc29d6faa1e91137a08155ef56d546afb`.
- PR #458/#459 dan #460/#461 merged dengan Build, Lint & Type Check, dan Unit Tests
  hijau. Diff hotfix sempit dan sesuai akar masalah.
- Branch protection `develop` dan `staging`: approval wajib kembali `1`.
- Tidak ada PR GitHub terbuka saat re-review.

### Accepted staging evidence

- OpenAI-path operability menghasilkan empat tipe soal dan masuk Bank Soal kanonik.
- Session Studio, activation, randomized student attempt, submit, manual essay correction,
  Grade UH `98`, dan `sourceAssessmentSessionId` terhubung end-to-end.
- Kunci jawaban/guide tidak bocor pada student payload sebelum submit.
- Outbox selesai `emitted=2`, tanpa pending/dead-letter.
- Desktop dan mobile `390x844` usable tanpa horizontal overflow.
- Final log sweep bersih dari error yang dicantumkan laporan.
- Temporary credential/scratch dan runtime disposable dibersihkan; fixture staging PII-safe
  boleh dipertahankan sesuai protokol QA Director.

### Next gate

Jangan meminta prompt Architect baru dan jangan membuat Wave 4.1. Kirim langsung ke
eksekutor sebagai follow-up QA sempit pada scope Wave 4 yang sama. Setelah satu laporan
terintegrasi menutup provider matrix, negative authority, quality sampling, dan evidence
packaging, kembali ke reviewer untuk final staging sign-off. Production tetap tidak boleh
dimutasi selama follow-up ini.

## Independent Re-review Follow-up 7 - 2026-08-11 (Source Gate, superseded by staging re-review)

Verdict: `APPROVED FOR EXPLICIT GIT PACKAGING`.

### Final closure yang diterima

- **P2-R22 closed:** `createAssessmentSessionRequestGate()` memiliki Set synchronous per
  filter key dan membungkus `loadSessionPage()` itu sendiri. Karena initial effect, retry,
  dan append semuanya melewati fungsi tersebut, request kedua same-key berhenti sebelum
  server action. Filter berbeda tetap dapat berjalan dan stale response tetap ditolak
  oleh request ID + current filter key (`assessment-workspace-mappers.ts:60-82`,
  `AkademikWorkspace.tsx:129-246`).
- Gate selalu dilepas melalui `finally`; test menjalankan tiga invokasi same-key paralel,
  membuktikan fetcher hanya sekali, lalu membuktikan key dapat digunakan kembali setelah
  task selesai (`assessment-session-studio.test.ts:186-216`).
- **P2-R23 closed:** `Major.description` di-trim, dibatasi 800 karakter, dan whitespace-only
  dinormalisasi menjadi null pada DTO. Form mengirim nilai trimmed, memakai
  `maxLength=800`, counter, serta helper text yang menjelaskan penggunaan sebagai konteks
  produktif AI (`major.dto.ts:3-16`, `ProfilClient.tsx:155-175,411-429`).
- Fail-closed AI tetap terjadi sebelum claim/ledger/provider, dan batas legacy prompt
  tetap dipertahankan. Tidak ada schema/migration baru pada follow-up terakhir.

### Independent verification final

- API full: **58 suites / 1092 tests pass**.
- Web full: **25 suites / 158 tests pass**.
- API/web type-check: pass.
- Prisma validate: pass dengan dummy non-secret `DATABASE_URL`.
- `git diff --check` dan `git diff --cached --check`: pass.
- Worktree belum staged; banyak file source, migration, test, dan report Wave 4 masih
  bercampur dengan status untracked, sehingga broad staging dilarang.

### Packaging boundary

Executor boleh melanjutkan explicit Git packaging pada branch Wave 4 yang sama dengan
ketentuan:

1. stage hanya manifest Wave 4 yang telah direview, termasuk lima migration, source/test
   baru, decision log, remediation report, dan reviewer report;
2. jangan memakai `git add .` atau `git add -A`;
3. periksa `git diff --cached --stat`, `git diff --cached --check`, dan daftar file staged
   sebelum commit;
4. pastikan tidak ada cache, credential, fixture lokal, dump DB, atau artefak QA ikut;
5. push PR ke `develop` dan tunggu CI hijau; jangan langsung merge/promote tanpa gate
   berikutnya.

### Remaining runtime gates

Setelah PR/CI dan deploy staging pada SHA jelas, masih wajib dilakukan:

- `prisma migrate deploy` dan health proof pada staging;
- browser QA GURU untuk Bank Soal manual/CSV/AI, Session Studio, koreksi esai, serta
  loading/error/retry/mobile;
- negative proof konteks produktif kosong dan authority siswa/guru lain;
- satu alur Question -> Session -> Attempt -> Submit -> Grade -> outbox dengan fixture
  staging PII-safe;
- provider OpenAI dan fallback Ollama sesuai protokol staging yang sudah disetujui.

Tidak ada izin untuk merge ke `staging`, `main`, deploy production, atau mutasi production
dalam verdict source ini.

Bagian setelah ini adalah histori review; status terbaru berada pada Follow-up 7 di atas.

## Independent Re-review Follow-up 6 - 2026-08-11 (Superseded by Follow-up 7)

Verdict tetap `FOLLOW-UP REQUIRED IN WAVE 4`, dengan dua koreksi terakhir yang sangat
sempit. Tidak ada P0/P1 baru.

### Core closure yang diterima

- **P2-R22 core load-more lock diterima:** `sessionAppendInFlightKeyRef` dikunci sinkron
  sebelum server action load-more dan dilepas dalam `finally`. Dua klik load-more untuk
  filter yang sama tidak lagi dapat melewati guard sebelum React render ulang
  (`AkademikWorkspace.tsx:178-244`). Stale response guard tetap berlaku.
- **P2-R23 core fail-closed diterima:** source context memuat `Major.description`,
  menormalisasi dan membatasi legacy text, lalu `assertProductiveContextConfigured()`
  berjalan sebelum `claimQuestionDraftGeneration`. Mode Produktif/Auto Vokasi tanpa
  konteks berhenti 400 sebelum ledger/provider (`ai-generate.service.ts:261-279,
  1028-1065`).
- DTO konfigurasi jurusan menolak deskripsi di atas 800 karakter, dan test membuktikan
  provider/claim tidak dipanggil ketika context kosong.

### P2-R22 masih parsial - lock belum dimiliki request layer bersama

Lock sinkron hanya berada pada `loadMoreSessions()`. `retrySessionRegistry()` dan fetch
page-1 dari effect memanggil `loadSessionPage()` langsung tanpa lock
(`AkademikWorkspace.tsx:178-224,225-246`). Dua klik retry dalam frame yang sama masih
dapat mengirim dua server action; setup effect ganda di development juga tetap membuat
duplicate page-1 work. Test hanya memberi nilai `inFlight=true` ke predicate, belum
membuktikan dua invokasi handler menghasilkan satu pemanggilan fetch.

Required final remediation:

- pindahkan acquire/release synchronous lock ke `loadSessionPage()` agar berlaku untuk
  replace, retry, dan append;
- key lock harus mencakup filter + page + mode, sehingga request filter baru tetap boleh
  berjalan sementara response filter lama ditolak;
- test acquire dua kali dalam tick yang sama: key identik satu fetch, key filter berbeda
  tetap dapat berjalan, dan lock dilepas setelah resolve/reject.

### P2-R23 masih parsial - kontrak 800 karakter belum hadir di UI

API sudah memakai `.max(800)`, tetapi form Jurusan masih tidak memiliki `maxLength`,
counter, atau helper text bahwa deskripsi menjadi konteks AI
(`major.dto.ts:3-8`, `ProfilClient.tsx:409-418`). Admin masih dapat mengetik lebih dari
800 karakter dan baru mengetahui penolakan setelah submit; label "Deskripsi singkat"
juga tidak menjelaskan dampaknya pada Generate Soal. DTO belum melakukan trim, sehingga
whitespace dapat tetap tersimpan walau kemudian dianggap context kosong oleh AI.

Required final remediation:

- gunakan `z.string().trim().max(800)` pada API;
- tambahkan `maxLength={800}`, counter, dan helper copy singkat di form, misalnya
  "Dipakai AI untuk menyesuaikan soal dengan konteks kompetensi jurusan. Hindari data
  pribadi.";
- test whitespace normalization dan batas UI/API 800/801 karakter.

### Verification Follow-up 6

- API full: **58 suites / 1092 tests pass** (reproduced reviewer).
- Web full: **25 suites / 157 tests pass** (reproduced reviewer).
- Shared types type-check: pass (reproduced reviewer).
- `git diff --check` dan `git diff --cached --check`: pass.
- Tidak ada staged change, commit, push, PR, deploy, atau perubahan migration pada
  follow-up ini.

### Gate Decision Follow-up 6

Jangan mengubah core AI/assessment yang sudah diterima. Tutup hanya dua acceptance detail
di atas pada branch yang sama, lalu lakukan re-review final. Jika keduanya bersih, branch
dapat langsung menerima `APPROVED FOR EXPLICIT GIT PACKAGING`; staging browser QA tetap
gate terpisah setelah deploy dan SHA jelas.

Bagian setelah ini adalah histori review; status terbaru berada pada Follow-up 6 di atas.

## Independent Re-review Follow-up 5 - 2026-08-10 (Superseded by Follow-up 6)

Verdict tetap `FOLLOW-UP REQUIRED IN WAVE 4`, sekarang hanya untuk dua P2 sempit.

### Closure yang diterima

- **P2-R19 stale response closed:** page-1 dan load-more membawa request ID serta filter
  key. Response dengan sequence lama atau filter yang sudah berubah tidak boleh menulis
  registry (`AkademikWorkspace.tsx:168-220`,
  `assessment-workspace-mappers.ts:32-58`).
- **P2-R19 false-empty closed:** loading, error + retry, content, dan empty menjadi state
  eksplisit untuk tab Sesi serta Koreksi. Empty tidak lagi tampil mendahului loading/error
  (`AkademikWorkspace.tsx:231-237,393-480`).
- **P2-R20 minimum test strategy accepted:** helper state/query yang diuji bukan salinan
  source-string dan benar-benar dipakai komponen. Test membuktikan sequence/filter stale
  rejection serta prioritas loading/error/empty. Browser interaction penuh tetap menjadi
  staging gate setelah deploy.
- **P2-R21 hardcoded-major mapping removed:** backend memuat nama dan deskripsi jurusan
  dari database sekolah; daftar TKJ/akuntansi/pemasaran tidak lagi menjadi sumber
  kebenaran (`ai-generate.service.ts:890-954,1022-1041`).

### P2-R22 - Double-submit guard belum sinkron

`loadMoreSessions()` memeriksa `sessionLoading` dari state render, sedangkan
`loadSessionPage()` baru memanggil `setSessionLoading(true)` setelah handler dimulai
(`AkademikWorkspace.tsx:178-183,225-228`). Dua klik sangat cepat sebelum React melakukan
render berikutnya masih sama-sama dapat melihat `false` dan memulai dua request. Request ID
mencegah response lama menulis data, tetapi tidak menutup duplicate network work seperti
yang diklaim report. Test saat ini hanya memanggil helper dengan `loading: true`; test itu
tidak mensimulasikan dua pemanggilan dalam tick yang sama.

Required remediation:

- tambahkan synchronous in-flight ref/lock yang di-set sebelum memulai server action dan
  dilepas hanya oleh request current di `finally`;
- gunakan lock yang sama untuk initial/retry/load-more agar retry rapid-click juga aman;
- test dua pemanggilan sebelum state render berubah dan buktikan server action hanya
  dipanggil sekali.

### P2-R23 - Konteks produktif kosong masih hanya diberitahukan kepada AI

Saat `Major.description` kosong, pesan "belum dikonfigurasi" hanya ditambahkan ke prompt
internal lalu generation tetap berjalan generik (`ai-generate.service.ts:1022-1031`).
Guru tidak menerima validasi yang dapat ditindaklanjuti, padahal keputusan P2-R21
mensyaratkan tidak ada silent fallback pada mode `produktif`. Selain itu deskripsi jurusan
belum memiliki batas panjang pada DTO maupun field UI (`major.dto.ts:3-8`,
`ProfilClient.tsx:409-418`), padahal sekarang isinya masuk ke prompt provider.

Required remediation:

- untuk mode `produktif` tanpa deskripsi memadai, kembalikan structured validation error
  atau warning yang terlihat guru dan mengarah ke `Profil Sekolah > Jurusan`; jangan hanya
  berbicara kepada model;
- beri batas dan trimming konsisten pada `Major.description` di API dan UI, serta batasi
  panjang potongan yang masuk prompt;
- jelaskan pada label/helper UI Profil bahwa deskripsi dipakai sebagai konteks AI, tanpa
  meminta admin menulis prompt teknis;
- test blank/whitespace, deskripsi terlalu panjang, mode umum, dan mode produktif valid.

### Verification Follow-up 5

- API full: **58 suites / 1090 tests pass** (reproduced reviewer).
- Web full: **25 suites / 157 tests pass** (reproduced reviewer).
- `git diff --check` dan `git diff --cached --check`: pass.
- Klaim type-check/lint/build/Prisma dari executor konsisten dengan perubahan; reviewer
  tidak menemukan schema/migration tambahan pada follow-up ini.

### Gate Decision Follow-up 5

Kembalikan hanya P2-R22 dan P2-R23 ke branch Wave 4 yang sama. Tidak perlu Prompt
Architect baru dan jangan commit/push dahulu. Setelah dua koreksi serta test sempit lulus,
lakukan satu re-review final untuk keputusan `APPROVED FOR EXPLICIT GIT PACKAGING`.

Bagian setelah ini adalah histori review; status terbaru berada pada Follow-up 5 di atas.

## Independent Re-review Follow-up 4 - 2026-08-10 (Superseded by Follow-up 5)

Verdict tetap `FOLLOW-UP REQUIRED IN WAVE 4`.

### Closure yang diterima

- Registry assessment sudah memakai API server-side pagination/filter dan tidak lagi
  mengambil 5.000 row serial. API menghitung `total` pada scope guru/reviewer yang sama,
  menerima filter subject/class/year/semester, dan UI memuat halaman berikutnya dengan
  merge by ID (`assessment.service.ts:236-285`, `AkademikWorkspace.tsx:151-209`).
- TP yang dikirim ke AI tidak lagi berupa input bebas. UI membangun pilihan dari Modul/RPP
  yang telah dibaca, dan backend memuat ulang source milik guru serta menolak ref yang
  tidak ada sebelum provider dipanggil (`assessment-workspace-mappers.ts:36-67`,
  `ai-generate.service.ts:879-963`). Ref masih positional (`TP 1`, `TP 2`), sehingga kata
  "stabil" pada report harus dimaknai stabil untuk snapshot generation, bukan ID TP
  permanen lintas edit RPP.
- CSV memakai hash normalized content; ledger import terikat FK ke Question dengan
  `ON DELETE SET NULL`. Backend tetap memverifikasi fingerprint penuh dan mencari
  canonical Question yang identik sebelum membuat row baru.
- Notification active ref dilindungi partial unique index; P2002 merebut row pemenang,
  pending direqueue dengan deterministic job ID, recovery periodik bounded tersedia,
  dan outbox health hanya dapat dibaca reviewer.
- Lint AI menambah pemeriksaan near-duplicate intra-batch, opsi duplikat/ambigu dasar,
  answer leakage, double-negative, dan batas panjang berdasarkan grade. Full suite dan
  type-check yang diulang reviewer tetap hijau.

### P2-R19 - Pagination masih dapat mencampur hasil filter lama dan menyamarkan error

Fetch halaman pertama mempunyai flag `cancelled`, tetapi `loadMoreSessions()` tidak
mempunyai request sequence/filter fingerprint. Jika guru menekan `Muat sesi berikutnya`
lalu mengganti mapel/kelas sebelum response kembali, halaman dari filter lama dapat
di-merge ke registry baru (`AkademikWorkspace.tsx:159-209`). Selain itu `sessionError`
hanya dirender di dalam cabang `savedAssessmentCards.length > 0`; kegagalan saat hasil
kosong justru menampilkan empty state `Belum ada sesi`, dan loading pertama juga belum
dibedakan dari kosong (`AkademikWorkspace.tsx:350-403`).

Required remediation:

- gunakan request ID/filter fingerprint yang sama untuk page-1 dan load-more, lalu abaikan
  response yang tidak lagi cocok dengan filter aktif;
- tampilkan loading, error + retry, dan empty sebagai tiga state yang berbeda;
- render error di luar cabang daftar non-kosong;
- test perubahan filter saat load-more masih pending dan failure pada registry kosong.

### P2-R20 - Test web berubah menjadi helper test, belum menjadi behavioral UI regression

Penghapusan `readFileSync` diterima, tetapi dua suite baru hanya memanggil mapper/helper
langsung (`assessment-session-studio.test.ts:1-119`,
`question-bank-editor-import.test.ts:1-120`). Test tersebut belum membuka komponen,
memicu aksi pengguna, atau membuktikan loading/error/retry, stale response,
double-submit, focus, dan keyboard. Karena P2-R19 lolos dari suite ini, finding behavioral
coverage sebelumnya belum dapat dinyatakan closed.

Required remediation:

- minimal ekstrak state machine/controller async registry dan AI/import ke helper yang
  dipakai komponen, lalu test race/failure/retry/double-submit pada helper yang sama;
- bila menambah test renderer membutuhkan dependency baru, minta approval; jangan
  mengganti behavioral proof dengan source-string assertion;
- setelah deploy, jalankan browser QA staging untuk keyboard/focus/mobile dan network
  failure pada SHA yang jelas.

### P2-R21 - Katalog konteks produktif belum dapat dikelola sekolah

`productiveContextHints()` masih berupa regex dan tiga daftar hardcoded untuk
TKJ/komputer, akuntansi, dan pemasaran (`ai-generate.service.ts:1015-1044`). Jurusan lain
diam-diam mendapat kalimat generik walaupun guru memilih `Produktif`. Ini belum memenuhi
keputusan produk bahwa keterkaitan mapel umum-produktif berasal dari katalog sekolah yang
dapat dikelola, dan report executor saat ini melebihkan kemampuan source.

Required remediation paling sederhana tanpa membuat mesin kurikulum baru:

- gunakan data sekolah authoritative yang sudah dapat dikelola, minimal nama dan
  `Major.description`, plus ringkasan Modul/RPP; jangan menjadikan daftar hardcoded sebagai
  sumber kebenaran;
- bila mode `produktif` dipilih tetapi konteks jurusan belum cukup, beri pesan validasi
  yang dapat ditindaklanjuti, bukan fallback diam-diam;
- jika dibutuhkan mapping per mapel, usulkan perubahan schema/UI kecil secara eksplisit
  dan minta approval sebelum implementasi;
- test jurusan yang dikenal, jurusan baru, mapel umum, mode umum, dan mode produktif tanpa
  konfigurasi.

### Verification Follow-up 4

- API full: **58 suites / 1089 tests pass** (reproduced reviewer).
- Web full: **25 suites / 155 tests pass** (reproduced reviewer).
- API/web/shared-types type-check: pass (reproduced reviewer).
- Prisma validate: pass dengan dummy non-secret `DATABASE_URL` (reproduced reviewer).
- `git diff --check` dan `git diff --cached --check`: pass.
- Migration 40/FK/unique-index PostgreSQL proof di report konsisten dengan source; tidak
  ada indikasi staging/live disentuh.

### Gate Decision Follow-up 4

Jangan membuka wave baru dan jangan commit/push dahulu. Kembalikan hanya P2-R19 sampai
P2-R21 ke branch Wave 4 yang sama. Setelah source dan test sempit diperbaiki, lakukan satu
re-review final; jika bersih, verdict dapat menjadi `APPROVED FOR EXPLICIT GIT PACKAGING`.
Browser/provider QA tetap staging-only setelah PR/deploy dan SHA jelas.

Bagian setelah ini adalah histori review; status terbaru berada pada Follow-up 4 di atas.

## Independent Re-review Follow-up 3 - 2026-08-10 (Superseded by Follow-up 4)

Verdict tetap `FOLLOW-UP REQUIRED IN WAVE 4`, sekarang **hanya karena P2-R11**.

### P1 closure yang diterima

- **P1-R17 closed:** claim `generating` membawa lease ID, expiry, dan sequence. Stale
  reclaim memakai compare-and-set terhadap lease lama; finalize dan failure write juga
  dipagari lease ID (`apps/api/src/ai/ai-generate.service.ts:583-646,694-817`). Lease
  120 detik berada di atas timeout provider yang terpasang, dan claimant lama menerima
  conflict bila fencing menolak finalisasi. PostgreSQL proof membuktikan
  `reclaimed=1`, old finalize `0`, new finalize `1`, dan hasil claimant baru tetap final.
- **P1-R18 closed untuk assessment outbox:** row notification `sent` tetap skip, tetapi
  row `pending` sekarang selalu menjalankan kembali `queue.add` dengan
  `jobId=notificationLog.id`; kegagalan queue dilempar tanpa mengubah pending menjadi
  false-success (`apps/api/src/notification/notification.service.ts:73-135`). Setelah
  crash antara DB create dan queue add, reclaim assessment outbox dapat merequeue job yang
  sama secara idempoten.
- Fondasi worker P1-R16 tetap valid: interval, overlap guard, stale reclaim, backoff,
  dead-letter, dan shutdown cleanup tidak mengalami regresi.

Tidak ada P0/P1 baru yang ditemukan pada source follow-up ketiga.

### P2-R11 - Closure operasional dan kualitas masih wajib

Finding P2 sebelumnya tetap berlaku:

- registry sesi masih bulk-fetch serial sampai hard cap 5.000, bukan pagination/filter
  server-side yang dibuka dari UI;
- TP ref masih disintesis browser, bukan berasal dari source API authoritative
  `{ ref, text }`;
- test Session Studio dan Question Bank masih dominan source-string, belum behavioral
  render untuk keyboard/focus, failure, retry, stale response, dan double-submit;
- CSV masih memakai `filename-totalRows` sebagai batch identity dan QuestionImportRow
  belum mempunyai FK/verification canonical lifecycle;
- deterministic quality lint belum menutup near-duplicate, opsi ambigu/semantik ganda,
  keterbacaan per tingkat, dan katalog mapping mapel umum-produktif yang dapat dikelola
  sekolah.

Tambahan hardening P2 notification:

- `findFirst -> create` notification belum mempunyai unique DB identity untuk
  `refType + refId + recipient + channel`, sehingga caller langsung yang benar-benar
  konkuren masih dapat membuat dua row;
- recovery pending di NotificationService masih startup-only. Jalur assessment outbox
  sudah aman karena retry merequeue pending, tetapi direct notification lain masih perlu
  periodic bounded recovery atau mekanisme setara;
- assessment `dead_letter` belum mempunyai metric/alert/operator surface PII-safe.

### Verification Follow-up 3

- API full: **58 suites / 1085 tests pass** (reproduced reviewer).
- Web full: **25 suites / 158 tests pass** (reproduced reviewer).
- API focused AI/outbox/notification/question: **5 suites / 138 tests pass**.
- API/web type-check: pass.
- Prisma validate: pass dengan dummy non-secret `DATABASE_URL`.
- `git diff --check` dan `git diff --cached --check`: pass.
- PostgreSQL migration/pool/lease proof di report eksekutor konsisten dengan source;
  disposable container sudah dibersihkan dan tidak ada indikasi staging/live disentuh.

### Gate Decision Follow-up 3

P1-R17 dan P1-R18 **approved closed**. Jangan mengubah lagi desain tersebut tanpa finding
baru. Kembalikan hanya **P2-R11** ke branch Wave 4 yang sama. Setelah P2 source/tests dan
PostgreSQL proof terkait selesai, lakukan satu independent re-review final. Bila bersih,
barulah `APPROVED FOR EXPLICIT GIT PACKAGING`; browser/provider QA tetap staging-only
setelah PR, deploy, dan SHA jelas.

Bagian setelah ini adalah histori review; status terbaru berada pada Follow-up 3 di atas.

## Independent Re-review Follow-up 2 - 2026-08-10 (Superseded by Follow-up 3)

Verdict tetap `FOLLOW-UP REQUIRED IN WAVE 4`.

### Closure yang diterima

- **P1-R15 core pool issue closed:** AI generate tidak lagi menahan interactive
  transaction/advisory lock selama provider call. Winner membuat row `generating`, lalu
  provider dipanggil setelah koneksi DB dilepas
  (`apps/api/src/ai/ai-generate.service.ts:245-285,579-655`). PostgreSQL proof
  `connection_limit=2` dengan dua request/key sama,
  satu provider call, satu row, dan tanpa timeout diterima.
- **P1-R16 worker foundation closed:** Assessment outbox sekarang mempunyai interval
  30 detik, overlap guard, shutdown cleanup, due-time/backoff, stale-emitting reclaim,
  dan terminal `dead_letter`
  (`apps/api/src/assessment/assessment.service.ts:48-51,107-128,604-664`). Migration
  mempunyai status check dan index due-time. Queue yang
  benar-benar belum disiapkan juga sekarang melempar error agar listener outbox gagal dan
  dapat diretry (`apps/api/src/notification/notification.service.ts:73-77`).

### P1-R17 - Claim `generating` tidak mempunyai lease, fencing, atau crash recovery

`AiGeneration` hanya menyimpan `status`, tanpa `updatedAt`, `leaseExpiresAt`, owner token,
atau attempt/version (`packages/database/prisma/schema.prisma:1680-1701`). Bila proses
mati setelah create/update claim dan sebelum status diubah menjadi `drafted`/`failed`,
row akan tetap `generating`. Request berikutnya hanya polling 60 detik lalu 409, dan
setiap retry akan mengulang keadaan yang sama (`ai-generate.service.ts:588-655`). Dengan
demikian idempotency key dapat terkunci permanen.

Menambahkan stale timeout saja juga belum cukup: worker lama dapat kembali setelah claim
direbut dan menimpa output worker baru karena final update hanya memakai `where: { id }`
(`ai-generate.service.ts:264-273`). Ini memerlukan fencing agar hasil claimant lama tidak
boleh menang.

Required remediation:

- simpan `claimToken`/version dan `leaseExpiresAt` atau metadata ekuivalen pada generation;
- claim/reclaim harus atomic dan hanya boleh merebut lease yang kedaluwarsa;
- final success/failure memakai CAS `id + status=generating + claimToken/version`; hasil
  claimant lama dibuang bila CAS gagal;
- bila provider dapat melewati lease, gunakan lease konservatif dengan heartbeat atau
  aturan renewal yang tidak membuka overwrite;
- test PostgreSQL: crash setelah claim, stale reclaim, claimant lama selesai terlambat,
  hanya claimant baru yang boleh finalisasi, dan changed payload tetap 409.

### P1-R18 - Row notifikasi `pending` dapat dianggap terkirim tanpa pernah masuk queue

`notify()` menjalankan pola `find pending/sent -> create pending -> queue.add`
(`apps/api/src/notification/notification.service.ts:81-106`). Jika proses mati setelah
row `pending` dibuat tetapi sebelum `queue.add`, restart dalam kurang dari lima menit
tidak mengambil row tersebut karena startup recovery hanya memilih pending yang sudah
stale (`:39-65`). Setelah outbox merebut event stale, `notify()` menemukan row pending dan
langsung return (`:82-90`), sehingga outbox dapat berubah menjadi `emitted` walau job
notifikasi tidak pernah ada. Recovery notification juga hanya berjalan saat startup,
bukan periodik.

Pola `findFirst -> create` juga belum dilindungi unique constraint sehingga dua caller
konkuren masih dapat membuat dua log untuk identity yang sama. Dead-letter assessment
sudah tersimpan, tetapi belum mempunyai alert/operator surface.

Required remediation:

- gunakan identity notification yang unik dan atomic untuk
  `refType + refId + recipient + channel` ketika ref tersedia;
- bila row existing berstatus `pending`, jangan hanya skip: pastikan `queue.add` dengan
  deterministic `jobId=log.id` dijalankan kembali secara idempotent;
- buat recovery pending bounded yang periodik atau satukan enqueue recovery dengan retry
  outbox; startup-only tidak cukup;
- tambah crash-point proof: mati setelah DB create sebelum queue add, restart cepat,
  eventual queue tepat sekali, lalu outbox emitted; uji juga dua instance konkuren;
- dead-letter harus terlihat oleh operator/admin atau minimal menghasilkan metric/alert
  tanpa memuat PII.

### P2-R11 tetap terbuka

Perubahan follow-up ini tidak menutup registry sesi yang masih bulk-fetch sampai 5.000,
TP ref yang disintesis browser, source-string UI tests, batch CSV berbasis filename/count
tanpa FK canonical, dan deterministic AI quality/context catalog. Required remediation
tetap seperti bagian P2-R11 pada review sebelumnya.

### Verification Follow-up 2

- API full: **58 suites / 1082 tests pass** (reproduced reviewer).
- Web full: **25 suites / 158 tests pass** (reproduced reviewer).
- API focused AI/outbox/notification/question: **5 suites / 135 tests pass**.
- API/web type-check: pass.
- Prisma validate: pass setelah reviewer memberi dummy non-secret `DATABASE_URL`.
- Klaim migration 39 file dan pool/outbox DB proof dari report eksekutor konsisten dengan
  source; tidak ada indikasi DB staging/live disentuh.

### Gate Decision Follow-up 2

Belum `APPROVED FOR EXPLICIT GIT PACKAGING`. Kembalikan **P1-R17, P1-R18, dan P2-R11**
ke branch Wave 4 yang sama. Tidak perlu Prompt Architect baru: finding sempit dan masih
berada dalam contract reliability/operability Wave 4. Setelah remediation dan proof
PostgreSQL crash-window selesai, kembali ke independent re-review. Browser/provider QA
tetap staging-only setelah PR, deploy, dan SHA jelas.

Bagian setelah ini adalah histori review; status terbaru berada pada Follow-up 2 di atas.

## Independent Re-review Follow-up 2026-08-10 (Superseded by Follow-up 2)

Verdict tetap `FOLLOW-UP REQUIRED IN WAVE 4`.

### Closure yang diterima

- **P1-R10 closed at source:** recursive schema test membuktikan semua object provider
  memiliki `additionalProperties: false` dan semua properties required. Matching answer
  memakai array `{ promptId, matchId }` lalu dinormalisasi ke contract kanonik
  (`apps/api/src/ai/ai-generate.service.ts:1039-1161`,
  `apps/api/src/__tests__/ai-generate.spec.ts:357-379`). Real OpenAI/Ollama tetap gate
  staging, bukan source gate.
- **P1-R11 core mismatch closed:** source picker sekarang mengirim `TP 1`, `TP 2`, bukan
  teks TP (`apps/web/src/app/dashboard/akademik/_components/assessment-workspace-mappers.ts:27-52`).
  Sisa authority/source-option contract dicatat sebagai P2-R11 di bawah.
- **P1-R12 async-wait portion closed:** dispatcher memakai `emitAsync()` dan listener
  gamification/notification melempar ulang kegagalan untuk `deliveryMode: outbox`
  (`assessment.service.ts:580-620`, `gamification.listener.ts:36-53`,
  `notification.listener.ts:189-214`).
- **P1-R13 two-request race improved:** advisory lock dan unique constraints mencegah
  duplicate generation/accept pada bukti dua request. Import row memakai transaction
  client yang sama dengan lock (`question-bank.service.ts:283-369`).
- **P1-R14 basic PostgreSQL proof accepted:** report mencatat 39 migration applied dan
  proof start, submit, Grade, import, generation, serta acceptance. Active-year authority
  Bank Soal juga sudah benar (`question-bank.service.ts:59-73`).

### P1-R15 - AI advisory lock dapat menghabiskan connection pool

`withAdvisoryLock()` membuka interactive transaction dan mengambil
`pg_advisory_xact_lock`, tetapi callback tidak menerima atau memakai `tx`; seluruh query
di dalam callback tetap memakai `this.prisma` (`apps/api/src/ai/ai-generate.service.ts:
997-1005`, dipanggil dari `:251-288`, `:291-426`, `:429-579`). Artinya satu request
menahan koneksi transaksi lalu meminta koneksi kedua dari pool. Beberapa key berbeda
dapat memenuhi pool dengan transaksi pemegang lock sehingga semua callback menunggu
koneksi yang tidak tersedia.

Reviewer mereproduksi pola yang sama pada PostgreSQL disposable dengan
`connection_limit=2`: dua lock berbeda sama-sama gagal setelah sekitar 3.2 detik dengan
`Timed out fetching a new connection from the connection pool`. Test unit sekarang
men-serialisasi mock `$transaction` (`ai-generate.spec.ts:401-440`), sehingga tidak
memodelkan pemakaian dua koneksi ini. Container disposable sudah dibersihkan.

Required remediation:

- jangan tahan interactive transaction sambil callback memakai client Prisma global;
- untuk generate, rekomendasi utama adalah reservation row singkat berstatus
  `generating` + request fingerprint + unique idempotency key, commit, baru provider
  dipanggil oleh pemenang; finalisasi dengan version/CAS dan recovery untuk reservation
  stale;
- untuk accept/regenerate/reject, gunakan transaksi singkat dengan query melalui `tx`
  yang sama atau versioned CAS. Provider regenerate tidak boleh dipanggil di dalam
  transaksi panjang; reserve versi item dahulu, lalu finalisasi CAS;
- tambah PostgreSQL service proof dengan pool kecil untuk key sama dan key berbeda,
  termasuk jumlah provider call, timeout, stale reservation, dan recovery.

### P1-R16 - Outbox belum mempunyai eventual retry yang mandiri dan consumer-safe

Dispatcher hanya dipanggil saat startup dan setelah operasi asesmen tertentu
(`assessment.service.ts:100-104,399,993`). Tidak ada worker/poller terjadwal untuk
event `failed`; bila listener gagal dan tidak ada operasi asesmen berikutnya, event dapat
diam tanpa retry. Retry juga tidak mempunyai `nextAttemptAt`/backoff/dead-letter yang
operasional.

Selain itu `NotificationService.notify()` menganggap queue yang belum terinisialisasi
sebagai sukses dengan log lalu `return`, dan dedupe hanya mencari status `sent` sebelum
membuat row `pending` baru (`apps/api/src/notification/notification.service.ts:73-105`).
Dengan demikian `emitAsync()` masih dapat menandai outbox `emitted` walau notification
tidak pernah diantrikan; pada partial failure/retry, row pending ganda juga masih mungkin.

Required remediation:

- jalankan dispatcher melalui worker/poller bounded yang hidup independen dari request,
  dengan lease, exponential backoff, `nextAttemptAt`, batas attempt, dead-letter/alert,
  dan shutdown bersih;
- delivery dari outbox harus gagal bila queue tidak tersedia; pertahankan fail-soft hanya
  untuk event legacy non-outbox;
- pisahkan delivery state per consumer/effect atau buktikan idempotensi DB untuk status
  pending/sent, bukan hanya `sent`;
- tambah integration proof: listener/queue gagal, request utama tetap commit, tidak ada
  aktivitas asesmen baru, worker retry kemudian sukses tepat sekali, termasuk restart dan
  stale lease.

### P2-R11 - Operability dan quality closure masih parsial

- Registry sesi sekarang melewati 100 record, tetapi server page mengunduh seluruh page
  secara serial sampai hard cap 50 page/5.000 record pada setiap render
  (`apps/web/src/app/dashboard/akademik/page.tsx:52-74`). Ini bukan pagination/filter
  server-side yang ergonomis dan dapat memperlambat dashboard seiring histori bertambah.
- TP ref masih disintesis dari index di browser dan LMS selalu diberi `TP 1`
  (`assessment-workspace-mappers.ts:27-52`). Payload sudah cocok hari ini, tetapi ref dan
  display text belum berasal dari satu API authoritative `{ ref, text }`, sehingga copy
  contract browser/backend dapat drift.
- Test Session Studio dan CSV/draft masih membaca source sebagai string untuk sebagian
  besar kontrak UI (`assessment-session-studio.test.ts:7-32`,
  `question-bank-editor-import.test.ts:5-45`), belum membuktikan open/input/next/back,
  keyboard/focus, failure, retry, stale response, atau double submit melalui render.
- CSV masih memakai `filename-totalRows` sebagai `batchKey`
  (`QuestionBankEditor.tsx:624-630`). `QuestionImportRow` tidak mempunyai FK ke Teacher
  atau Question (`schema.prisma:1525-1541`; migration `20260806000004...`), sehingga
  replay sesudah Question terhapus dapat dilaporkan sukses tanpa canonical row.
- Quality lint baru menolak duplicate normalized di dalam batch, exact raw-body duplicate
  di DB, dan answer-text leakage untuk pilihan ganda
  (`ai-generate.service.ts:926-978`). Near-duplicate, opsi semantik ganda/ambigu,
  keterbacaan per tingkat, dan mapping mapel umum ke konteks produktif yang dapat dikelola
  sekolah belum deterministik; `majorName` saat ini hanya menjadi instruksi prompt.

Required remediation:

- ubah registry sesi menjadi pagination/filter URL server-side dengan truthful total;
- expose source options authoritative `{ ref, text }` dari backend dan render text sambil
  mengirim ref;
- tambah React behavior tests untuk workflow kritis, bukan source-string assertions;
- gunakan digest SHA-256 konten file/normalized rows sebagai batch identity dan tambahkan
  FK/verification canonical row yang sesuai lifecycle delete;
- implement deterministic quality lint dengan reason code yang dapat diedit guru, serta
  katalog context mapping sekolah untuk mapel umum-produktif. Tetap perlakukan AI sebagai
  draft, bukan canonical Question otomatis.

### Latest Verification

- API full: **58 suites / 1080 tests pass** (reproduced reviewer).
- Web full: **25 suites / 158 tests pass** (reproduced reviewer).
- API focused: **4 suites / 116 tests pass**.
- Web focused: **2 suites / 10 tests pass**.
- API/web type-check: pass.
- Open-handle regression: **30/30 pass**, tanpa warning open handle.
- `git diff --check` dan `git diff --cached --check`: pass; tidak ada staged changes.
- PostgreSQL pool probe: failure reproduced as described in P1-R15; disposable container
  removed after proof.

### Latest Gate Decision

Belum `APPROVED FOR EXPLICIT GIT PACKAGING`. Kembalikan **P1-R15, P1-R16, dan P2-R11**
ke branch Wave 4 yang sama. Setelah source dan PostgreSQL proof lulus, lakukan re-review
independen lagi. Browser/provider QA tetap staging-only setelah PR, deploy, dan SHA jelas.

Bagian setelah ini dipertahankan sebagai histori review. Bila ada perbedaan status,
bagian **Latest** di atas yang berlaku.

## Independent Re-review 2026-08-10

Verdict tetap `FOLLOW-UP REQUIRED IN WAVE 4`.

Follow-up menutup banyak finding lama secara nyata: unique generation/acceptance ledger,
upsert Grade, reload authority, lifecycle status, CSV row ledger, submitted-only
statistics, server-side Bank pagination, dan migration apply semuanya tersedia. Akan
tetapi klaim `READY FOR INDEPENDENT RE-REVIEW` belum dapat dinaikkan menjadi source
approval karena temuan berikut.

### P1-R10 - OpenAI strict schema draft soal tidak valid untuk provider default

`questionDraftJsonSchema()` memakai `strict: true`, tetapi tidak memasukkan
`description` rubrik dan `guideAnswer` esai ke daftar `required`
(`apps/api/src/ai/ai-generate.service.ts:981-990,1037-1046`). Bentuk jawaban matching
juga memakai object dengan `additionalProperties: { type: 'string' }`
(`ai-generate.service.ts:1026-1035`). Kontrak Structured Outputs OpenAI mewajibkan semua
field object berada di `required` dan setiap object memakai `additionalProperties:
false`. Karena OpenAI adalah provider default, request valid dapat ditolak provider
sebelum menghasilkan draft.

Test sekarang hanya mencari nama empat tipe di string schema
(`apps/api/src/__tests__/ai-generate.spec.ts:333-356`), sehingga schema invalid tetap
hijau.

Required remediation:

- buat satu provider-portable shape; field optional memakai union `null` atau selalu
  required;
- ubah matching mapping dinamis menjadi array object ber-field tetap, lalu konversi ke
  contract kanonik setelah validasi;
- tambah schema conformance test rekursif dan real OpenAI/Ollama provider proof setelah
  deploy staging.

Referensi provider: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs),
bagian "All fields must be required" dan "additionalProperties: false must always be set
in objects".

### P1-R11 - Source picker mengirim teks TP, backend meminta ID referensi TP

Mapper UI menghasilkan `tpRefs` berupa isi TP, misalnya `TP Subnet` atau `TP Routing`
(`apps/web/src/app/dashboard/akademik/_components/assessment-workspace-mappers.ts:27-52`).
Backend justru membentuk ID authoritative `TP 1`, `TP 2` dan menolak nilai lain
(`apps/api/src/ai/ai-generate.service.ts:674-743`). Dengan demikian entry point
`Penilaian -> Bank Soal -> Generate AI` dapat gagal pada sumber yang valid.

Test mapper saat ini mengunci kontrak yang salah sebagai expected output
(`apps/web/src/__tests__/assessment-session-studio.test.ts:65-107`).

Required remediation:

- source option membawa `{ ref, text }[]`; UI menampilkan `text`, payload hanya mengirim
  `ref`;
- jangan membuat ref dari teks atau index browser; ambil option authoritative dari API;
- tambah integration/component test yang mengalirkan source picker sampai DTO backend.

### P1-R12 - Assessment outbox menandai sukses sebelum consumer async selesai

Dispatcher memakai `eventEmitter.emit()` lalu langsung mengubah status menjadi `emitted`
(`apps/api/src/assessment/assessment.service.ts:580-619`). `emit()` tidak menunggu
listener async. Listener gamifikasi/notifikasi juga menangkap error sendiri dan tidak
meneruskannya, misalnya `gamification.listener.ts:36-52`. Akibatnya side effect dapat
gagal tetapi row outbox sudah permanen berstatus sukses. Retry hanya dijalankan saat
startup atau operasi assessment berikutnya, bukan worker terjadwal.

Independent probe EventEmitter2 membuktikan `emit()` mengembalikan `true` ketika listener
async belum selesai. Ini bukan durable delivery walaupun row outbox durable.

Required remediation:

- pakai worker/poller bounded dengan lease, backoff, retry schedule, dan dead-letter;
- await delivery (`emitAsync` hanya cukup bila listener tidak swallow error), lalu tandai
  delivered setelah consumer benar-benar sukses;
- pastikan setiap consumer idempotent; bila satu event mempunyai beberapa side effect,
  simpan delivery state per consumer agar retry tidak mengulang effect yang sudah sukses;
- test injected listener failure, process restart, stale lease, dan eventual retry pada
  PostgreSQL.

### P1-R13 - Generate dan lifecycle draft belum linearizable pada request konkuren

Generate memanggil provider pada `ai-generate.service.ts:270-281`, baru mencoba unique
insert pada `:556-607`. Unique index mencegah dua row, tetapi dua request serentak tetap
memanggil dan menagih provider dua kali. Test race hanya menyuntikkan P2002 sesudah satu
provider call; bukan dua request konkuren (`ai-generate.spec.ts:358-376`).

Regenerate membaca status/output, memanggil provider, lalu melakukan update tanpa CAS
(`ai-generate.service.ts:433-503`). Accept dan reject juga tidak mengunci generation row;
reject menghitung accepted item di luar transaksi (`:508-551`). Accept, regenerate, dan
reject yang berpapasan dapat menimpa output/status atau menerima versi item yang berbeda.

Required remediation:

- reserve idempotency key sebelum provider call dengan status `generating`, fingerprint,
  dan recovery state; request lain menunggu/membaca hasil yang sama;
- serialisasikan mutation per generation dengan row/advisory lock atau versioned CAS;
- regenerate mendapat idempotency key dan versi item; accept hanya menerima versi yang
  direview guru;
- buktikan concurrent generate/accept/regenerate/reject pada PostgreSQL nyata.

### P1-R14 - Bukti concurrency PostgreSQL masih belum memenuhi reviewer contract

Migration apply disposable berhasil, tetapi report hanya membuktikan table/index hadir
(`WAVE4-PHASE3-ASSESSMENT-RUNTIME-QUESTION-BANK-REMEDIATION-2026-08-06.md:175-193`).
Belum ada concurrent HTTP/service proof untuk start, submit, complete, Grade/outbox,
AI accept/regenerate/reject, response-lost retry, dan import row race. Reviewer contract
secara eksplisit menyatakan unit mock tidak cukup untuk klaim uniqueness/race.

### P2-R10 - Operability dan quality closure masih overstated

- Question Bank menyebut assignment "active", tetapi service hanya mencari
  `teacherId + subject` tanpa academic year aktif
  (`apps/api/src/question-bank/question-bank.service.ts:59-66`). Assignment historis
  masih memberi mutation authority.
- Registry sesi server page hanya memuat `/assessment/sessions?limit=100` sekali
  (`apps/web/src/app/dashboard/akademik/page.tsx:214-222`), lalu pagination/filter terjadi
  pada data tersebut. Sesi ke-101 tidak terjangkau dari registry.
- Test UI masih membaca source component sebagai string untuk wizard, tombol, CSV, dan
  draft flow (`assessment-session-studio.test.ts:7-32` dan
  `question-bank-editor-import.test.ts:5-45`), bukan interaksi render/failure state.
- Duplicate check Bank AI hanya exact query/case-sensitive terhadap DB
  (`apps/api/src/ai/ai-generate.service.ts:868-881`); warning kualitas tetap berasal dari
  provider. Belum ada deterministic near-duplicate, ambiguitas benar/salah, tingkat
  bahasa per kelas, atau katalog keterkaitan mapel umum-produktif yang dikelola sekolah.
- CSV `batchKey` masih `filename-totalRows`
  (`QuestionBankEditor.tsx:624-630`), bukan digest konten. `QuestionImportRow` juga tidak
  memiliki FK Question/Teacher; retry setelah Question dihapus dapat dianggap sukses
  tanpa canonical Question.

Required remediation:

- tetapkan policy authority: mutation baru wajib assignment tahun aktif/source year;
  historical questions tetap readable/reusable tanpa memberi authority baru;
- registry sesi memakai action pagination/filter server-side dengan truthful total;
- ganti test string dengan React behavior tests untuk open, input, next/back, retry,
  failure, focus, dan stale response;
- tambah deterministic quality lint serta configurable curriculum-context mapping;
- gunakan SHA-256 isi file sebagai batch identity dan FK/verification canonical row.

## Re-review Acceptance Matrix 2026-08-10

| Area | Status | Evidence |
|---|---|---|
| Answer-key confidentiality | PASS source | Student projection tetap menghapus key/guide answer dan meminimalkan matching. |
| Strict question contract | PASS source | Empat union, bijection, rubrik 100, bounds, dan snapshot immutable tersedia. |
| Core attempt/submit/Grade | PASS source, runtime race pending | CAS submit dan Grade upsert tersedia; full concurrency matrix belum dijalankan. |
| PostgreSQL migration apply | PASS | Reviewer menerapkan 39 migration pada DB disposable dan memverifikasi tiga table baru; DB kemudian dihapus. |
| AI provider contract | FAIL P1 | OpenAI strict schema melanggar required/additionalProperties contract. |
| Bank AI UI-to-API | FAIL P1 | TP text dikirim sebagai TP ref. |
| Durable event effects | FAIL P1 | Event async ditandai emitted sebelum consumer selesai. |
| AI lifecycle concurrency | FAIL P1 | Provider pre-reservation dan mutation tanpa lock/version. |
| Bank/session operability | PARTIAL P2 | Bank paging ada; session capped 100 dan test UI belum behavioral. |
| Browser/provider/quality QA | DEFERRED | Sesuai keputusan Director: staging-only setelah source fix, PR, deploy, dan SHA jelas. |

## Independent Verification 2026-08-10

- API full: **58 suites / 1074 tests pass**.
- Web full: **25 suites / 158 tests pass**.
- API focused AI/assessment/question/provider: **4 suites / 110 tests pass**.
- Web focused session/import: **2 suites / 10 tests pass**.
- API/web/database/types type-check: pass.
- Prisma validate: pass dengan disposable non-secret `DATABASE_URL`.
- `git diff --check`: pass.
- PostgreSQL local disposable: **39 migrations applied**, target tables present, cleanup
  selesai.
- Tidak ada source, Git staging, commit, push, PR, deploy, staging, atau production yang
  diubah oleh reviewer.

## Required Next Sequence 2026-08-10

1. Kembalikan P1-R10 sampai P2-R10 ke branch Wave 4 yang sama; jangan buat Wave 4.1.
2. Dahulukan kontrak TP dan OpenAI schema, kemudian linearize AI lifecycle dan perbaiki
   outbox delivery.
3. Tambah React behavior tests dan PostgreSQL concurrency harness; jalankan full checks.
4. Kembali ke independent source re-review. Hanya bila tidak ada P0/P1/P2, lanjut
   explicit Git packaging.
5. Setelah PR/deploy staging dan SHA jelas, jalankan browser/provider/quality matrix sesuai
   protokol staging yang telah disetujui Director. Jangan promosi main/production.

## Independent Re-review 2026-08-06

Verdict tetap `FOLLOW-UP REQUIRED IN WAVE 4`.

Follow-up menutup banyak struktur source: approval provenance tercatat, migration kedua
additive tersedia, endpoint legacy tetap 410, Session Studio empat tahap dan koreksi
esai sudah mempunyai entry point. Automated checks yang dilaporkan juga dapat
direproduksi. Namun klaim closure P1-1 sampai P2-2 belum akurat karena temuan berikut.

### P1-R1 - Idempotency AI generate/accept belum race-safe

Generate masih memakai pola `findFirst -> provider -> create`
(`apps/api/src/ai/ai-generate.service.ts:250-287`), sedangkan migration hanya membuat
index biasa pada `idempotency_key`, bukan unique constraint
(`20260806000002_wave4_ai_question_provenance/migration.sql:122-126`). Dua request
konkuren dengan key sama dapat memanggil provider dan membuat dua generation.

Perbandingan retry memakai `JSON.stringify()` terhadap JSONB (`ai-generate.service.ts:256`),
yang bukan canonical payload fingerprint. DTO accept mewajibkan `idempotencyKey`, tetapi
service tidak pernah membacanya (`ai-generate.service.ts:297-391`). Dengan demikian
kontrak idempotency accept yang dilaporkan belum benar.

Required remediation:

- unique/partial unique DB constraint yang mencakup teacher + type + idempotency key;
- payload fingerprint SHA-256 dari spec yang dinormalisasi;
- create-first/advisory-lock strategy dan mapping P2002 ke exact retry atau 409 changed
  payload;
- accept key harus benar-benar disimpan/diperiksa atau dihapus dari kontrak bila item
  identity saja yang sengaja menjadi contract;
- PostgreSQL concurrent HTTP proof, bukan mock Promise saja.

### P1-R2 - Penanganan P2002 di dalam transaksi PostgreSQL tidak aman

Completion Grade menangkap P2002 lalu menjalankan update pada transaction client yang
sama (`apps/api/src/assessment/assessment.service.ts:483-509`). Accept AI memakai pola
yang sama: create, catch P2002, lalu find pada transaction yang sama
(`apps/api/src/ai/ai-generate.service.ts:317-381`). Pada PostgreSQL, unique violation
dapat menandai transaksi aborted; query berikutnya tidak boleh diasumsikan tetap dapat
berjalan tanpa savepoint/restart transaksi.

Selain itu event Grade baru dipancarkan setelah commit, tetapi tidak durable
(`assessment.service.ts:391-393,547-552`). Crash setelah commit sebelum emit membuat
Grade tersimpan tanpa event, sedangkan retry completion ditolak karena sesi sudah
completed. Ini belum memenuhi exactly-once effect.

Required remediation:

- hindari exception-driven recovery di transaction yang sudah aborted; gunakan
  conflict-free atomic SQL/upsert, advisory lock, serializable retry, atau transaction
  restart yang eksplisit;
- buat recovery/event delivery durable atau lifecycle sync yang dapat diretry dan
  consumer idempotent;
- buktikan concurrent complete, concurrent accept, injected post-commit failure, dan
  retry pada PostgreSQL disposable.

### P1-R3 - Authority dan lifecycle draft AI dapat menjadi stale/tidak truthful

Generate awal memeriksa ownership dan TeachingAssignment. Namun accept dan regenerate
hanya merekonstruksi context dari `contextSnapshot`
(`ai-generate.service.ts:297-314,405-465,471-508`) dan tidak resolve ulang source record,
ownership, assignment aktif, class, atau TP saat tindakan dilakukan. Draft lama masih
dapat dipakai setelah assignment/source berubah.

Lifecycle juga belum konsisten:

- partial accept langsung mengubah generation menjadi `accepted`;
- status tidak dipakai sebagai guard accept/regenerate;
- item yang telah accepted masih dapat diregenerate, sehingga `generation.output`
  berubah dan tidak lagi menjadi provenance yang sama dengan Question canonical;
- tombol `Tolak semua` hanya menghapus state browser
  (`QuestionBankEditor.tsx:800-810`), tidak mencatat rejection di server.

Required remediation:

- re-resolve source dan authority pada accept/regenerate;
- lifecycle server-side yang jelas, misalnya `DRAFTED/PARTIALLY_ACCEPTED/ACCEPTED/REJECTED`;
- immutable accepted item output atau versioned regeneration;
- reject endpoint/audit yang nyata;
- tindakan pada stale/accepted/rejected draft menghasilkan 409 terstruktur.

### P1-R4 - Provider contract dan quality gate belum sesuai prompt

OpenAI schema menyatakan `question` hanya sebagai object kosong tanpa discriminated
properties atau `additionalProperties: false`
(`apps/api/src/ai/ai-generate.service.ts:789-814`). Ini belum strict schema empat tipe
dan berisiko ditolak provider atau menghasilkan shape yang baru gagal setelah respons.

Jalur Question Draft hanya melakukan satu provider call. Tidak ada bounded repair satu
kali, dan retry rate-limit yang sudah dimiliki jalur Modul Ajar tidak direuse
(`ai-generate.service.ts:662-704`). Quality lint juga baru mendeteksi exact duplicate dan
answer text PG di body (`ai-generate.service.ts:731-783`); belum ada near-duplicate,
true/false ambiguity/double-negative, prompt-injection signal, complexity per grade,
hard-vs-soft warning, atau coverage quality yang diklaim prompt.

Required remediation:

- full portable JSON Schema discriminated per question type;
- satu bounded repair dengan audit attempt; kegagalan kedua tetap fail-closed;
- reuse bounded rate-limit behavior provider existing;
- deterministic hard/soft quality findings yang dibuat server, bukan menerima warning
  buatan provider sebagai authority;
- provider contract tests dan runtime OpenAI/Ollama proof pada payload nyata.

### P1-R5 - AI Bank Soal belum customizable dan entry point Bank belum lengkap

UI selalu mengirim empat soal dengan purpose, distribusi tipe/difficulty/C1-C4,
`auto_vokasi`, dan karakter `konseptual` yang hardcoded
(`apps/web/src/app/dashboard/akademik/_components/QuestionBankEditor.tsx:588-602`). Tidak
ada control guru untuk preference yang dijanjikan.

Entry point `Penilaian -> Bank Soal` membuka editor tanpa `moduleId/rppId`
(`AkademikWorkspace.tsx:368-372`), sementara tombol AI hanya muncul bila salah satu ID
tersedia (`QuestionBankEditor.tsx:246-285,745`). Jadi AI hanya praktis muncul dari
Session Studio/modul tertentu, bukan dari kedua entry point dengan source picker yang
sama.

Required remediation:

- source picker RPP/Modul authoritative pada Bank dan Session Studio;
- controls count/type/difficulty/C1-C6/purpose/TP/context/character/instruction;
- validasi jumlah distribusi sebelum request;
- preference state shared untuk dua entry point dan browser behavior tests.

### P1-R6 - Registry Bank/Sesi/Koreksi belum scalable atau lengkap

Action Bank mendukung pagination, tetapi editor selalu fetch halaman 1 limit 50 tanpa
search/filter/pagination control (`QuestionBankEditor.tsx:291-300`). Tab `Sesi Asesmen`
dan `Koreksi` hanya memakai `todayClasses` (`AkademikWorkspace.tsx:270-304`), sehingga
sesi lama, sesi tidak terjadwal hari ini, dan correction backlog dapat tidak terjangkau.

Required remediation:

- registry Bank server-side search/filter/pagination dengan truthful total;
- registry AssessmentSession nyata untuk Sesi/Koreksi, difilter owner/class/status/year;
- jangan menjadikan jadwal hari ini sebagai database koreksi.

### P1-R7 - CSV batch/row idempotency hanya ada pada DTO

`batchKey` dan `rowKey` diterima DTO tetapi tidak digunakan untuk identity atau
persistensi. Service hanya mencari soal berdasarkan teacher, subject, type, body, dan
difficulty (`apps/api/src/question-bank/question-bank.service.ts:275-325`). Ini dapat
menganggap dua soal dengan stem sama tetapi opsi/kunci berbeda sebagai satu keberhasilan
dan menyebabkan data hilang diam-diam. UI key juga hanya `filename-totalRows`, bukan hash
konten (`QuestionBankEditor.tsx:543-549`).

Required remediation:

- durable batch/row idempotency atau content fingerprint lengkap yang dinormalisasi;
- changed payload untuk key sama harus 409/per-row error;
- exact retry mengembalikan canonical Question existing;
- response-lost dan concurrent row proof pada PostgreSQL.

### P1-R8 - Statistik dan antrean koreksi masih mencampur attempt belum submit

`getResults()` mengambil semua response tanpa filter submitted, menetapkan
`submitted = responses.length`, lalu menghitung `pendingManualCount` sebagai semua yang
bukan final (`apps/api/src/assessment/assessment.service.ts:752-819`). Attempt yang baru
dimulai dapat tampil sebagai koreksi esai pending dengan jawaban kosong, walaupun endpoint
grading akhirnya menolak karena belum submitted.

Required remediation:

- pisahkan started, submitted-auto-final, submitted-manual-pending, dan final;
- correction queue hanya dari response submitted dengan item `manual_pending` nyata;
- tambah behavioral tests untuk in-progress, auto-only, mixed essay, dan completed.

### P2-R1 - Web tests belum behavioral

`assessment-session-studio.test.ts` dan `question-bank-editor-import.test.ts` membaca
file source lalu mencari substring. Tes tersebut tetap hijau bila control tidak bekerja,
state tidak berubah, atau request payload salah. Ganti dengan component/helper behavior
tests untuk wizard transition, preference calculation, pagination, parser round-trip,
retry, edit/regenerate/accept, dan error recovery.

### Re-review Closure Matrix

| Finding awal | Status re-review |
|---|---|
| P1-1 completion/Grade | Partial; transaksi ada, race/event recovery belum valid |
| P1-2 authoritative session context | Source closed; PostgreSQL/browser proof pending |
| P1-3 essay correction | Partial; reachable, queue/statistik masih salah |
| P1-4 registry/Session Studio | Partial; wizard ada, registry masih first-page/today-only |
| P1-5 CSV | Partial; parser/export membaik, idempotency tidak nyata |
| P1-6 AI Question Draft | Partial; endpoints/UI ada, authority/lifecycle/provider/customization belum closed |
| P2-1 semantic invariants | Source substantially closed; DB/runtime proof pending |
| P2-2 shared contract/microcopy | Source closed; browser proof pending |

### Re-review Gate Boundary

- Schema approval R0: **PASS**, tercatat pada Prompt Architect dan decision log.
- Automated source checks: **PASS**, tetapi coverage gaps di atas tetap berlaku.
- PostgreSQL migration/concurrency/restore: **NOT RUN**.
- Browser/provider/quality QA: **STAGING-ONLY BY DIRECTOR DECISION, NOT RUN**.
- Explicit Git packaging: **HOLD** karena P1/P2 source masih terbuka dan PostgreSQL
  preflight belum lulus.

Source readiness reviewer: **84%**.
E2E readiness reviewer: **55%**.
Kesiapan staging QA: **belum**, sampai source follow-up dan PostgreSQL disposable proof
lulus. Setelah itu explicit packaging dapat direview terpisah untuk deploy staging dan
QA pada SHA yang jelas; staging QA bukan izin production.

## Findings

Bagian berikut mempertahankan temuan review awal dan rationale desain. Status terkini
yang authoritative adalah `Independent Re-review 2026-08-06` dan closure matrix di atas.

### P1-1 - Completion dan sinkronisasi Grade tidak atomik serta tidak retryable

`completeSession()` lebih dahulu mengubah sesi menjadi `completed`, lalu baru
menjalankan sinkronisasi Grade di luar transaksi
(`apps/api/src/assessment/assessment.service.ts:338-370`). Jika TeachingAssignment,
upsert Grade, atau proses lain gagal, sesi sudah completed dan pemanggilan ulang
ditolak oleh guard status active. Ini dapat menghasilkan sesi selesai tanpa Grade.

Sinkronisasi juga melakukan `findUnique -> upsert -> emit` per siswa
(`assessment.service.ts:443-479`). Dua sinkronisasi konkuren dapat sama-sama melihat
Grade belum ada dan memancarkan event ganda walaupun unique index mencegah row ganda.

Required remediation:

- jadikan transisi completion dan pencatatan hasil grading satu unit konsisten;
- atau tambahkan lifecycle/status grading yang eksplisit dan endpoint retry idempotent;
- pastikan event Grade hanya dipancarkan sekali setelah insert yang benar-benar menang;
- buktikan concurrent complete/sync dengan PostgreSQL nyata.

### P1-2 - Konteks sesi belum authoritative dan target kelas masih fail-open

Saat create, backend menerima `classId`, `academicYear`, dan `semester` dari DTO,
kemudian hanya memakai module sebagai fallback
(`assessment.service.ts:151-178`). Tidak ada penolakan bila nilai DTO berbeda dari
module. Akibatnya module satu konteks dapat dipasangkan ke kelas/periode lain selama
TeachingAssignment lolos.

Selain itu `classId = null` dianggap sesi global dan terlihat oleh semua SISWA
(`assessment.service.ts:208-220`). Untuk asesmen bernilai, ini terlalu mudah terjadi
karena kelas tidak diwajibkan.

Required remediation:

- derive subject, academic year, semester, teacher, dan class dari record authoritative;
- bila override memang diperlukan, reject mismatch secara eksplisit;
- wajibkan target kelas untuk sesi yang dikerjakan/masuk Grade, kecuali ada use case
  school-wide terpisah dengan permission dan konfirmasi yang eksplisit.

### P1-3 - Koreksi esai belum menjadi workflow yang dapat dijalankan

Komponen `EssayGradingModal` tersedia
(`apps/web/src/app/dashboard/akademik/_components/EssayGradingModal.tsx:25-32`), tetapi
tidak di-import atau dirender oleh layar aktif. Endpoint hasil juga membuang
`responseId` dan jawaban ketika membentuk response publik guru
(`assessment.service.ts:699-732`), sehingga UI tidak punya data yang dibutuhkan modal.

Konsekuensinya, respons `manual_pending` tidak dapat ditutup dari UI. Sementara itu
completion selalu menampilkan toast "nilai disinkronkan" dan analisis mengubah nilai
`null` menjadi nol (`assessment.service.ts:861-869`), sehingga informasi kepada guru
menjadi tidak benar.

Required remediation:

- sediakan tab/queue `Koreksi` yang reachable dari registry sesi;
- proyeksikan response ID, jawaban esai, rubrik snapshot, status koreksi, dan data siswa
  minimum yang berwenang;
- tampilkan `pendingManualCount` secara jujur setelah completion;
- keluarkan manual-pending dari statistik nilai final sampai koreksi selesai.

### P1-4 - Registry Bank Soal dan authoring sesi belum operasional pada skala nyata

Web selalu mengambil maksimal 100 soal (`apps/web/src/app/dashboard/akademik/actions.ts:344-348`)
dan editor tidak memiliki search/filter/pagination server-side
(`QuestionBankEditor.tsx:255-269`). Import 500 baris dapat membuat sebagian besar soal
langsung tidak terjangkau dari picker.

Authoring sesi juga masih berupa satu panel langsung create/activate, bukan flow empat
tahap `Konteks -> Soal -> Review -> Aktifkan`. UI hanya memetakan Diagnostik dan
Formatif (`PenilaianSesiModal.tsx:50-52`), belum menyediakan Sumatif UTS/UAS. Tidak ada
review total poin/komposisi dan confirmation snapshot immutable. Quick-create Bank
Soal menyimpan lalu reset/reload tanpa auto-select ID hasil create
(`QuestionBankEditor.tsx:349-368`).

Required remediation:

- server-side search, filter, pagination, dan truthful total;
- tab kerja `Sesi | Bank Soal | Koreksi` tanpa mengganti Gradebook yang telah disetujui;
- wizard empat tahap dengan Sumatif UTS/UAS, total poin, komposisi, dan konfirmasi
  immutable snapshot;
- quick-create memakai mesin authoring yang sama lalu auto-select canonical Question ID.

### P1-5 - CSV belum memenuhi round-trip dan retry tanpa duplikasi

Parser memecah input berdasarkan newline sebelum parsing CSV
(`QuestionBankEditor.tsx:433-465`). Field quoted yang mengandung newline akan rusak.
Export juga dibatasi diam-diam ke 500 record
(`apps/api/src/question-bank/question-bank.service.ts:247-263`).

Retry client hanya mengenali row yang respons suksesnya sudah diterima. Bila server
berhasil commit tetapi response terputus, retry akan membuat Question baru karena
tidak ada idempotency key/identity per row. Test CSV saat ini hanya memeriksa string
source (`apps/web/src/__tests__/question-bank-editor-import.test.ts:1-32`), bukan
round-trip parser atau network ambiguity.

Required remediation:

- gunakan parser CSV yang benar untuk quote/comma/newline/UTF-8;
- export seluruh hasil secara paged/streamed atau nyatakan batas secara eksplisit;
- ikat import pada idempotency key file/batch + row dan kembalikan hasil per row;
- test round-trip empat tipe, formula injection, duplicate identity, response-lost retry,
  >500 hard reject, dan malformed nested JSON.

### P1-6 - Initial finding: Bank Soal belum mempunyai AI generation operasional

Pada review awal, Bank Soal hanya menyediakan authoring manual dan CSV. Tidak ada tombol,
server action, atau endpoint baru yang menghasilkan draft soal AI. Kondisi itu merupakan
containment yang disengaja pada AI-0A: UI `Generate AI` dihapus dan endpoint lama
`POST /ai/generate-questions` tetap mengembalikan `410 AI_ENDPOINT_DISABLED`
(`apps/api/src/ai/ai-generate.controller.ts:15-22`). Satu-satunya action AI akademik
yang aktif adalah generator per bagian Modul Ajar berbasis `rppId + section`
(`apps/web/src/app/dashboard/akademik/actions.ts:398-409`).

Follow-up 2026-08-06 telah menambah endpoint dan draft UI baru tanpa mengaktifkan legacy.
Status terkini bukan lagi "tidak ada source", tetapi masih **partial** karena P1-R1,
P1-R3, P1-R4, dan P1-R5 pada re-review di atas. Klaim berkualitas/customizable tetap
belum boleh diberikan sebelum temuan tersebut dan E2E gate ditutup.

Required remediation menggunakan desain authoritative-context pada bagian berikut.

### P2-1 - Strict contract masih memiliki celah semantik

- Matching memastikan key lengkap dan value valid, tetapi tidak memastikan value unik;
  mapping many-to-one masih diterima (`assessment-contract.ts:54-69`).
- Rubrik hanya memastikan ID unik; total bobot tidak divalidasi, sedangkan UI menambah
  setiap kriteria baru dengan bobot 100 (`QuestionBankEditor.tsx:710-723`).
- `QuestionSelectionListSchema` memastikan question ID unik, tetapi tidak memastikan
  `order` unik atau total poin berada dalam batas yang masuk akal
  (`assessment-contract.ts:128-142`).
- `AnswerMapSchema` dan matching answer record tidak punya batas jumlah key
  (`assessment-contract.ts:154-171`).

Tutup seluruh invariant di Zod/API, bukan hanya di UI, dan tambahkan negative tests
untuk oversized nested payload serta kombinasi semantik salah.

### P2-2 - Kontrak web dan microcopy masih menyisakan bentuk legacy

`AssessmentSessionData.questions` tetap `unknown[]` dan di-cast saat render
(`apps/web/src/app/dashboard/akademik/actions.ts:452-463`). Ini melemahkan manfaat shared
type empat tipe soal. Tombol Gradebook juga masih bernama `Bank Soal PG` walaupun bank
sudah mendukung empat jenis (`GradebookPenilaian.tsx:111-114`).

Gunakan shared discriminated union end-to-end dan selaraskan label menjadi `Bank Soal`.

## Recommended AI Question Authoring Design

### Prinsip

Gunakan pola **AI proposes, teacher decides, canonical Question stores**:

1. AI menghasilkan proposal draft, tidak langsung menulis ke Bank Soal.
2. Guru melihat soal, kunci, alasan kunci, rubrik, alignment TP, dan warning kualitas.
3. Guru dapat edit, regenerate satu butir, menerima sebagian, atau menolak.
4. Hanya butir yang diterima dan kembali lulus `QuestionPayloadSchema` yang dibuat
   sebagai canonical `Question`.
5. Aktivasi sesi tetap membuat immutable snapshot dari canonical Question ID.

Ini mempertahankan "dua pintu masuk, satu mesin authoring": generator dapat dibuka dari
Bank Soal maupun langkah Soal pada wizard sesi, tetapi keduanya memakai komponen,
endpoint, validator, dan penyimpanan Question yang sama.

### Endpoint dan authority contract

Tambahkan endpoint baru, misalnya `POST /ai/question-drafts`; jangan hidupkan kembali
endpoint legacy. Request harus `.strict()` dan hanya menerima ID serta preferensi
terbatas:

- tepat satu sumber authoritative: `rppId` atau `moduleId`;
- `purpose`: diagnostik, formatif, sumatif-uts, atau sumatif-uas;
- `questionCount`: 1..20 per request;
- distribusi tipe: PG, benar/salah, menjodohkan, esai;
- distribusi tingkat kesulitan dan level kognitif;
- TP yang dipilih dari TP tersimpan, bukan teks TP dari browser;
- gaya konteks: umum, otomatis sesuai jurusan, atau konteks produktif tertentu;
- optional teacher instruction pendek dan dibatasi, bukan raw prompt bebas.

Backend wajib resolve guru, RPP/module, subject, class, major, academic year, semester,
CP/TP, dan TeachingAssignment dari database. Subject/class/year/major kiriman browser
tidak boleh menjadi authority. PII pada instruction harus mengikuti policy yang sudah
berlaku: tidak boleh ke cloud; route local-only atau reject dengan pesan terstruktur.

OpenAI tetap provider default dan Ollama fallback sesuai kontrak production yang telah
divalidasi. Gunakan structured output:

- OpenAI: strict JSON Schema;
- Ollama: portable JSON format lalu Zod validation yang sama;
- output shape exact, tanpa markdown/code fence/field ekstra;
- bounded repair maksimal satu kali untuk output invalid; setelah itu fail jujur dan
  tidak menyimpan proposal parsial.

### Preferensi guru yang direkomendasikan

UI generator sebaiknya berupa side sheet/wizard ringkas, bukan textarea prompt besar:

- **Sumber materi:** Modul Ajar/RPP dan TP aktif;
- **Tujuan:** diagnostik, latihan, UH, UTS, UAS;
- **Jumlah:** total dan komposisi tipe;
- **Kesulitan:** mudah/sedang/sulit dalam distribusi yang jumlahnya harus tepat;
- **Kognitif:** C1-C6 atau pilihan dasar, aplikasi, analisis, evaluasi;
- **Konteks:** umum, sesuai jurusan otomatis, atau produktif spesifik;
- **Karakter soal:** konseptual, studi kasus, praktik, literasi, numerasi;
- **Bahasa:** ringkas, formal, tingkat kelas, hindari negatif ganda;
- **Acak ulang:** regenerate per butir, bukan harus mengulang satu batch;
- **Jumlah versi:** satu atau beberapa paket ekuivalen untuk mengurangi penyalinan.

Semua numeric/mode preference menggunakan control terstruktur. `Catatan khusus guru`
boleh tersedia maksimal sekitar 500 karakter, diberi indikator larangan data pribadi,
dan tetap divalidasi server-side.

### Keterkaitan mapel umum dan produktif

Konteks jurusan harus berasal dari `Class.majorCode` dan katalog mapping yang dikelola
sekolah, bukan asumsi model. Mode default adalah `otomatis bila relevan`, sehingga AI
tidak memaksakan konteks vokasi pada setiap konsep.

Contoh mapping yang direkomendasikan:

- Bahasa Indonesia: wawancara kerja, CV, surat lamaran, laporan praktik/PKL;
- Bahasa Inggris: job interview, SOP, manual alat, email profesional;
- Matematika: ukuran, toleransi, rasio, estimasi bahan/biaya, statistik mutu;
- Informatika: data, keamanan digital, otomasi, dokumentasi teknis;
- PPKn/Agama: etika kerja, keselamatan, tanggung jawab, budaya industri;
- IPA/IPAS: energi, bahan, lingkungan, pengukuran, keselamatan kerja.

Mapping harus dapat dikonfigurasi WAKA_KURIKULUM/administrator akademik, memiliki
fallback mapel umum, dan tetap dapat dimatikan guru per batch.

### Quality validation sebelum preview

AI output harus melewati validator kanonik dan quality lint deterministik:

- alignment setiap soal terhadap minimal satu TP authoritative;
- body tidak mengandung kunci atau frasa yang membocorkan jawaban;
- PG mempunyai satu jawaban tepat dan distraktor unik/plausible;
- benar/salah berisi satu proposisi dan tidak memakai negatif ganda ambigu;
- matching merupakan bijection dengan label unik;
- esai mempunyai guide answer dan rubrik dengan total bobot tepat 100;
- poin positif, urutan/type distribution sesuai request;
- tidak ada duplikasi exact maupun near-duplicate dalam batch dan Bank Soal guru;
- panjang, bahasa, dan kompleksitas sesuai tingkat kelas;
- tidak mengandung PII, prompt injection, KI/KD legacy, markdown, atau field ekstra;
- sumatif memerlukan coverage TP dan sebaran kesulitan/kognitif yang ditampilkan.

Second-pass AI critic boleh dipakai untuk Sumatif sebagai sinyal tambahan, tetapi tidak
boleh menjadi satu-satunya validator. Penentuan akhir tetap guru.

### Provenance dan schema decision

Untuk audit yang benar, canonical Question yang diterima sebaiknya menyimpan provenance
terstruktur: `source = MANUAL | AI_ASSISTED`, referensi `aiGenerationId`, TP refs, dan
level kognitif. Field tambahan ini memerlukan approval Director dan migration additive
terpisah/tercatat; jangan menyelundupkannya ke migration minimal Wave 4 tanpa approval.

Jika schema belum disetujui, AI draft tetap dapat diimplementasikan secara transient,
tetapi fitur tidak boleh mengklaim traceability penuh hanya dengan tag bebas.

## AI E2E Acceptance Matrix

Source dan unit gate:

- strict DTO menolak raw context, field ekstra, count >20, distribusi tidak seimbang,
  TP palsu, dan ID milik guru lain;
- TeachingAssignment inactive/beda mapel ditolak sebelum provider;
- structured outputs empat tipe lolos validator kanonik;
- malformed provider output, duplicate, leaked answer, rubric !=100, dan matching
  non-bijective ditolak tanpa write;
- OpenAI success, quota fallback Ollama, half-open recovery, timeout, dan kedua provider
  gagal menghasilkan state/error yang jujur;
- accept sebagian menulis hanya Question terpilih; retry tidak menduplikasi;
- AI audit redacted dan tidak memuat PII/secret/raw credential.

PostgreSQL/runtime gate:

- batch accept bersifat transactionally safe dan idempotent;
- concurrent accept/regenerate tidak membuat Question ganda;
- provenance/AiGeneration relation dan rollback terbukti bila schema disetujui;
- snapshot sesi tidak berubah ketika Question sumber kemudian diedit.

Browser QA 1440 px dan 390 px:

- buka generator dari Bank Soal dan wizard sesi, keduanya memakai draft state yang sama;
- custom jumlah/type/difficulty/kognitif/context lalu preview hasil;
- edit, regenerate satu soal, reject, accept sebagian, dan auto-select hasil accepted;
- OpenAI dan forced Ollama menghasilkan output empat tipe yang valid;
- quality warning terlihat dan tidak dapat dilewati untuk hard error;
- provider failure tidak membuat soal kosong/duplikat dan form tetap dapat dicoba ulang;
- keyboard/focus/loading/cancel/mobile/overflow/console/network lulus;
- negative GURU beda assignment dan role non-GURU mendapat 403 walau API dipanggil langsung.

Quality sampling gate:

- gunakan sekurangnya 3 mapel umum dan 3 mapel produktif pada dua jurusan;
- setiap kombinasi menghasilkan minimal 10 soal yang dinilai guru dengan rubrik:
  ketepatan kunci, alignment TP, kejelasan, tingkat kesulitan, relevansi jurusan, dan
  bebas ambiguitas;
- target awal reasonable: tidak ada kunci salah/hard validation leak, minimal 90% soal
  diterima setelah edit ringan, dan seluruh soal yang ditolak memiliki reason tercatat;
- jangan memakai skor AI sendiri sebagai bukti kualitas final.

## Readiness Projection

Setelah follow-up 2026-08-06, penilaian AI Bank Soal adalah:

- kelengkapan source fitur: **70%** (endpoint dan draft UI ada, P1 lifecycle/provider/
  customization/idempotency masih terbuka);
- kesiapan desain/infrastruktur reuse: **85%** karena provider, structured output,
  fallback, audit, Question validator, dan Bank Soal kanonik sudah tersedia;
- kesiapan E2E fitur AI Bank Soal: **20%**, karena belum ada migration/provider/browser/
  quality sampling runtime proof.

Jika desain di atas diimplementasikan dan seluruh source/runtime/browser/quality gate
lulus, proyeksi reasonable:

- kualitas implementasi source: **94-96%**;
- kesiapan E2E: **90-93%**;
- kesiapan production: **88-91%**.

Angka tersebut bukan klaim hasil saat ini dan tidak boleh diberikan hanya berdasarkan
unit test atau direct provider smoke.

## Positive Evidence

- Student projection menghapus answer key/rubric internal dari list/detail/start.
- Submit memakai attempt DB dan server `startedAt`, bukan nilai client.
- `questionOrder` dipersist dan dipakai saat resume.
- Duplicate start/submit ditangani fail-closed pada jalur source.
- Grade mempunyai unique source `session + student`.
- LMS progress dibuat monotonic dan completed tetap sticky.
- SSE reconnect dibatasi dan memperoleh token baru.
- Gradebook lama tetap dipertahankan.
- Infrastruktur OpenAI default, Ollama fallback, structured output, PII routing, dan AI
  audit sudah tersedia untuk direuse; endpoint Bank Soal baru tetap memerlukan kontrak
  dan QA tersendiri.
- Tidak ditemukan perubahan dependency, Docker, Keycloak, systemd, atau production.

## Validation Performed

Reviewer menjalankan:

- `git diff --check`: pass;
- API focused sesuai manifest executor: **8 suites / 150 tests pass**;
- web full: **24 suites / 151 tests pass**;
- types/API/web type-check: pass;
- Prisma validate dengan dummy non-runtime `DATABASE_URL`: pass.

Percobaan awal dengan empat nama suite yang tidak ada menghasilkan `ENOENT`; reviewer
kemudian memetakan nama aktual dan mengulang command resmi executor. Ini bukan source
failure dan tidak dihitung sebagai hasil tes gagal.

## Outstanding Gates

### R0 - Schema approval evidence

Laporan menyebut empat perubahan schema telah approved, tetapi belum mencantumkan
referensi keputusan/approval Director. Tambahkan bukti keputusan yang eksplisit ke
remediation report sebelum packaging. Jangan apply migration sampai bukti ini jelas.

### PostgreSQL runtime

Belum ada proof untuk migration apply, constraint/index, concurrent start, concurrent
submit, concurrent completion/grading, retry, dan restore/rollback rehearsal. Unit mock
tidak menggantikan gate ini.

### Browser QA

Belum ada QA authenticated GURU/SISWA pada desktop 1440 px dan mobile 390 px untuk
authoring, start/resume/autosave/submit, correction, Gradebook sync, negative authority,
network/console, keyboard, dan overflow. Keputusan Director terbaru menetapkan QA ini
staging-only setelah PR/deploy dan SHA jelas. Karena itu QA browser bukan prasyarat source
packaging, tetapi tetap hard gate untuk staging sign-off dan main/production.

## Required Next Sequence

1. Tutup seluruh P1/P2, termasuk AI Bank Soal P1-6, di branch Wave 4 yang sama; jangan
   membuat Wave 4.1. Bila provenance membutuhkan schema baru, dapatkan approval Director
   eksplisit sebelum mengubah schema/migration.
2. Tambah focused behavioral tests, bukan source-string assertions.
3. Jalankan ulang full applicable checks.
4. Jalankan PostgreSQL disposable/staging-copy dry-run dan concurrency proof.
5. Kembali ke reviewer dengan source + PostgreSQL evidence. Bila seluruh P1/P2 source
   tertutup, reviewer dapat memberi `APPROVED FOR EXPLICIT GIT PACKAGING`.
6. Setelah PR/deploy staging dan SHA jelas, jalankan browser QA authenticated, provider
   matrix, dan quality sampling AI memakai protokol auth/fixture staging yang telah
   disetujui Director. Jangan melakukan promosi production.
7. Kembali ke reviewer untuk staging sign-off dengan source, migration, runtime,
   browser, provider, quality, dan cleanup evidence lengkap.

Git packaging, commit, push, PR, staging promotion, dan production tetap **HOLD**.
