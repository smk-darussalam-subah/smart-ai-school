# Prompt Architect - Wave 5 P1/P2 Source and E2E Closure

Tanggal: 2026-08-15
Status: final, source-verified same-branch Executor follow-up
Branch wajib: `feat/wave5-phase4-continuous-operations-20260813`
Base awal: `origin/develop@5afc7ccaec9edcacfa9a0a5d69fc39cbaade66e4`
Verdict input: `FOLLOW-UP REQUIRED IN WAVE 5`

## Keputusan Arsitektur

Follow-up ini tetap berada dalam Wave 5 dan branch yang sama. Tidak ada Wave 5.1, schema
baru, dependency baru, notification engine baru, atau perubahan governance baru.

Enam P1 dan tiga P2 reviewer wajib ditutup dalam satu batch terarah. Fondasi yang sudah
benar tetap dipertahankan: `AssessmentSession + RemedialParticipant`, exact
TeachingAssignment, one-response-per-session, successor retry, report/grade advisory lock,
NotificationLog durable rows, partial unique notification index, announcement `SKIP LOCKED`,
AI provider/RAG/PII routing, dan header-only kiosk API.

### Koreksi policy KKTP

System default 75 telah disetujui sebagai policy eksplisit dengan provenance. Karena itu:

- dilarang memakai angka 75 langsung pada keputusan operasional;
- gunakan satu resolver server authoritative: participant snapshot untuk remedial,
  `LmsModule.kktp` untuk regular assessment, exact `KktpConfig` untuk konteks Grade, lalu
  `system_default=75` dengan provenance eksplisit;
- `unconfigured` hanya berlaku bila subject/year/semester atau konteks authoritative tidak
  dapat ditentukan, bukan hanya karena row `KktpConfig` tidak ada;
- UI merender nilai dan provenance dari API, tidak menghitung fallback sendiri.

Dengan demikian P1-R14 tetap valid untuk dashboard hardcode dan resolver yang terduplikasi,
tetapi tidak boleh ditutup dengan menghapus policy default yang sudah disetujui.

## Target Terukur

Follow-up dinyatakan siap re-review hanya bila:

1. P1 closure: **6/6** dengan positive, negative, concurrency, dan ownership proof.
2. P2 closure: **3/3** dengan behavior/transport proof, bukan helper assertion saja.
3. Source readiness target untuk Reviewer: **>=95%**, tanpa self-claim approval.
4. Validated E2E target: **>=90%** setelah PostgreSQL concurrency, queue path, dan local
   authenticated browser QA lulus.
5. Tidak ada regression pada 7 focused API suite/182 test dan focused web baseline 5 test.
6. Full API/web tests, type-check, lint, build, Prisma validation, dan diff checks hijau.
7. Tidak ada commit, push, PR, deploy, atau staging mutation sebelum re-review approval.

Angka kesiapan hanya boleh dicantumkan bersama evidence matrix. Test hijau yang mengunci
kontrak salah tidak dihitung sebagai proof.

## Prompt Final Untuk Executor

Salin seluruh blok berikut ke sesi Executor yang sedang mengerjakan branch Wave 5.

````md
Anda adalah Senior Full-Stack Executor untuk DIIS `smart-ai-school`.

### Misi

Tutup seluruh finding `P1-R9` sampai `P1-R14` dan `P2-R15` sampai `P2-R16` dari:

`docs/audits/WAVE5-PHASE4-CONTINUOUS-OPERATIONS-SOURCE-REREVIEW-2026-08-15.md`

Kerjakan pada worktree dan branch existing:

- worktree: `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school-wave5-continuous-operations-20260813`
- branch: `feat/wave5-phase4-continuous-operations-20260813`
- base awal: `5afc7ccaec9edcacfa9a0a5d69fc39cbaade66e4`

Ini follow-up same-wave. Jangan membuat branch/wave baru. Jangan commit, push, PR, merge,
deploy, atau mengakses production secara mutatif. Berhenti pada independent Reviewer gate.

### Gate 0 - Preflight dan batas perubahan

1. Baca lengkap:
   - root `AGENTS.md`;
   - `docs/WAYS-OF-WORKING.md` dan `docs/decision-log.md`;
   - prompt Wave 5 V2 yang menjadi kontrak eksekusi;
   - report remediation/review/follow-up/rereview Wave 5 terbaru;
   - prompt follow-up ini.
2. Rekam `git status --short --branch`, HEAD, base, dan changed-file inventory. Worktree
   memang dirty oleh implementasi Wave 5; jangan revert atau membersihkan file tersebut.
3. Trace setiap finding dari UI -> action -> controller -> service -> transaction -> DB ->
   queue -> response/reload sebelum edit.
4. Buat closure checklist R9-R16. Update status per finding selama pengerjaan.
5. Tidak ada schema/dependency baru. Migration deployed lama tidak boleh diedit. Migration
   Wave 5 `20260813000001_wave5_continuous_operations` masih uncommitted/undeployed dan
   boleh dikoreksi hanya untuk menghapus explicit SA remedial-manage mapping yang
   menyesatkan; rerun disposable PostgreSQL proof setelah perubahan.
6. Jangan mengubah global SUPER_ADMIN wildcard. Business authority remedial harus
   fail-closed di controller dan service, bukan diasumsikan dari permission wildcard.

### P1-R9 - Finance permission parity

1. Ganti `finance.record` menjadi authoritative `finance.create` pada
   `apps/web/src/app/dashboard/keuangan/keuangan-ui.ts` dan seluruh test/callsite.
2. Matriks final:
   - record: SA/TU + effective `finance.create`;
   - approve: SA/KS + effective `finance.approve`;
   - GURU/SISWA/ORANG_TUA/INDUSTRI tidak melihat atau menjalankan record/approve;
   - TU tidak approve dan KS tidak record.
3. Test harus membuktikan kontrak permission dan role sekaligus. Hapus assertion
   `finance.record`; repository search setelah fix harus menghasilkan nol occurrence.
4. Pertahankan create-unpaid, student picker, receipt durability, dan 409 approval race.

Acceptance:

- TU dan SA melihat `Catat Pembayaran` ketika memiliki `finance.create`;
- explicit `grant=false` menyembunyikan aksi dan API tetap 403;
- tidak ada tombol yang pasti menghasilkan 403.

### P1-R10 - Parent selected-child remedial projection

1. Buat query contract remedial khusus, jangan menambah child selector ke generic regular
   assessment DTO. Untuk ORANG_TUA, `studentId` wajib dan harus divalidasi server sebagai
   anak miliknya; backend tidak boleh memilih anak pertama atau mengembalikan semua anak.
2. SISWA tetap resolve own student server-side. GURU/reviewer memakai scope existing dan
   tidak boleh menyalahgunakan family selector.
3. Family DTO wajib whitelist-only. Field yang boleh:
   - session id/title dan subject aman;
   - due date;
   - attempt number;
   - participant/session status;
   - completion/finalization timestamp dan outcome pass/needs-retry.
4. Jangan kirim questions, options, answer key, rubric, sourceGradeId, Grade version,
   source/raw/effective score, recipient, teacher private metadata, atau participant anak lain.
5. Integrasikan ke `OrtuWorkspace` dengan active child selector existing. Saat child berubah,
   fetch hanya `/assessment/remedials?studentId=<selected-owned-id>` dan tampilkan compact
   read-only Remedial section pada screen yang paling relevan (`Beranda` atau `Capaian`),
   tanpa membuat dashboard kedua.
6. Berikan loading, empty, error, retry, due/overdue, passed, dan needs-retry state. Request
   anak lama tidak boleh menimpa anak baru; gunakan abort/sequence guard.
7. Untuk satu anak, UI boleh langsung memakai ID anak tersebut. Untuk multi-child, setiap
   request tetap harus membawa selected ID; API tidak pernah fallback.

Acceptance/test:

- parent A dengan anak A1/A2 mendapat tepat data selected child;
- switch A1 -> A2 mengganti status tanpa row A1 tersisa;
- forged child milik parent lain ditolak fail-closed;
- missing `studentId` untuk parent multi-child tidak mengembalikan gabungan;
- forged session/direct API tidak membocorkan metadata;
- recursive forbidden-field assertion memeriksa seluruh response tree.

### P1-R11 - Pedagogical authority fail-closed

1. Mutation remedial hanya menerima role `GURU` dengan
   `academic.remedial.manage`. Hapus `SUPER_ADMIN` dari controller mutation/candidate role
   list. Read endpoint tetap menerima oversight sesuai effective permission.
2. Service mutation tidak boleh memiliki bypass `SUPER_ADMIN`. Selalu resolve Teacher dari
   actor dan cocokkan `TeachingAssignment.teacherId`.
3. Akun multi-role `SUPER_ADMIN+GURU` hanya boleh mengelola TeachingAssignment miliknya
   sendiri; tidak boleh mengelola guru lain.
4. SA, active KS, dan active WAKA_KURIKULUM hanya boleh read oversight. Mereka tidak boleh
   candidate/create/update/activate/cancel/finalize/retry.
5. Jangan membuat recovery command pada follow-up ini. Recovery pedagogis memerlukan
   keputusan governance baru, reason-required command, dan audit contract terpisah.
6. Hapus explicit SA remedial permission inserts dari migration Wave 5 current untuk
   kejujuran catalog, tetapi jangan mengubah global wildcard atau migration deployed.

Acceptance/test matrix:

- GURU owner: seluruh lifecycle allowed;
- GURU unrelated: 403 untuk setiap mutation dan forged assignment/session/participant;
- SA, KS, WAKA: list/detail read allowed sesuai appointment, semua mutation 403;
- SA+GURU owner: own lifecycle allowed; other-teacher lifecycle 403;
- audit actor tetap identitas user sebenarnya.

### P1-R12 - Immediate enqueue plus durable recovery

1. Pending `NotificationLog` tetap dibuat di transaksi bisnis dengan deterministic ref dan
   partial unique index existing.
2. Preallocate stable log UUID atau gunakan mekanisme setara agar ID row yang benar diketahui
   setelah commit. `createMany()` count saja tidak cukup untuk immediate enqueue.
3. Tambahkan API internal/public method terkontrol pada `NotificationService`, misalnya
   `enqueueCommittedPendingLogs(ids)`, yang:
   - dedupe dan membatasi daftar ID;
   - query hanya row `pending` yang benar-benar ada;
   - enqueue BullMQ memakai `jobId=notificationLog.id`;
   - tidak membuat row kedua;
   - tidak menerima recipient/body dari client;
   - menghasilkan log PII-safe.
4. Setelah transaksi commit, panggil method tersebut untuk:
   - remedial assignment, result, dan due reminder;
   - finance payment receipt;
   - urgent/darurat scheduled announcement.
5. Queue unavailable/failure setelah commit tidak boleh menggulung balik atau memalsukan
   kegagalan business transition. Row tetap pending dan response/report menyatakan
   `queued` atau `pending_recovery` secara jujur. Startup/interval recovery tetap fallback.
6. Jangan memendekkan `STALE_MINUTES` sebagai pengganti immediate enqueue. Jangan membuat
   queue, scheduler, outbox, atau dependency kedua.

Acceptance/test:

- healthy queue: `queue.add` terjadi segera setelah commit dan sebelum operation selesai;
- queue failure: business state + pending row tetap committed, tanpa duplicate row;
- restart/stale recovery mengantrekan row yang sama dengan job ID sama;
- duplicate concurrent transition menghasilkan satu active ref/recipient/channel;
- zero/invalid recipient tidak membuat row/job;
- normal path tidak menunggu recovery 5-6 menit.

Gunakan mock queue untuk deterministic unit proof dan existing local Redis/BullMQ untuk
runtime proof bila tersedia. Jangan mengklaim external WA delivered; yang dibuktikan adalah
durable row, immediate queue handoff, retry/recovery, dan worker state.

### P1-R13 - Remedial transaction and CAS closure

1. `createRemedialSession()` harus memindahkan/repeat seluruh authoritative validation ke
   dalam satu interactive transaction:
   - acquire shared academic-year/appointment activation lock existing;
   - resolve tepat satu active academic year;
   - re-read exact TeachingAssignment, class, teacher, dan user active/nondeleted;
   - acquire report-grade advisory locks dalam urutan deterministic untuk seluruh Grade;
   - re-read source Grade score+updatedAt, KKTP context, report status, dan open lineage;
   - validate canonical questions untuk teacher/subject yang sama;
   - baru create session, participant, dan pending logs.
2. Helper yang dipakai di transaction wajib menerima `Prisma.TransactionClient`; jangan
   diam-diam kembali memakai root Prisma di tengah transaction.
3. `updateRemedialSession()` wajib re-read owner/current assignment di transaction dan
   melakukan conditional `updateMany` dengan minimal `id + purpose=remedial + status=draft
   + teacherId`. `count !== 1` menjadi stable 409; jangan unconditional update by id.
4. Activate/cancel/update harus mempunyai one-winner semantics. Late update tidak boleh
   mengubah title/questions/due date sesudah active/cancelled.
5. Pertahankan shared lock namespace dengan report check/finalize dan deterministic lock
   ordering untuk mencegah deadlock.

PostgreSQL dua-koneksi wajib membuktikan:

- report check menang -> finalize menunggu lalu 409, Grade tidak berubah;
- finalize menang -> report check menunggu lalu stale-draft 409;
- activate menang -> late update 409 dan snapshot tetap;
- cancel menang -> late update 409;
- dua update draft -> tepat satu outcome sesuai expected state/CAS;
- create berhadapan dengan academic-year cutover tidak menghasilkan session pada context
  invalid atau multiple-active-year.

Unit mock tidak dapat menggantikan proof ini.

### P1-R14 - One authoritative KKTP resolver

1. Jangan menghapus approved `system_default=75`. Hapus hardcode lokal dan resolver yang
   terduplikasi.
2. Buat/reuse satu server resolver yang mengembalikan `{ value, provenance }`:
   - remedial participant/card: immutable `RemedialParticipant.kktpValue/provenance`;
   - regular assessment: `LmsModule.kktp`;
   - Grade/analysis context: exact `KktpConfig`, lalu explicit system default 75;
   - missing subject/year/semester: `unconfigured`, tidak menebak.
3. `getSessionAnalysis()` wajib memanggil resolver, bukan menginisialisasi literal 75.
4. `StudentDashboardService` wajib select participant snapshot untuk remedial dan module
   threshold untuk regular. Jangan gunakan `KKM_DEFAULT` untuk semua session.
5. Audit seluruh projection yang berubah pada Wave 5; perbaiki hanya keputusan ketuntasan
   yang berada di path ini. Jangan sweeping refactor placeholder/input/test fixture/Rapor
   historical snapshot.
6. API mengirim provenance; UI menampilkan label ringkas bila source default sistem.

Acceptance/test:

- module KKTP 80 -> analysis/card memakai 80;
- config KKTP 72 -> Grade-context analysis memakai 72;
- no config tetapi context lengkap -> 75 dengan `system_default` eksplisit;
- remedial participant snapshot 68 tetap 68 walau config kemudian berubah;
- context tanpa subject/year/semester tidak diklasifikasikan diam-diam.

### P2-R15 - AI Chat stale-response immunity

1. Setiap new/switch/delete/session-history load harus abort request send/history sebelumnya
   atau membuat responsnya ineligible melalui monotonic request epoch.
2. Capture epoch dan intended session ID pada awal request. Sebelum setiap state update,
   pastikan component masih mounted, epoch masih current, dan active session masih cocok.
3. Old send tidak boleh mengganti `sessionId`, messages, source, error, atau loading state
   milik percakapan baru.
4. Delete active session saat send berlangsung harus abort dan tidak menghidupkan kembali
   session yang dihapus.
5. Tombol session boleh dinonaktifkan saat send atau mendukung switch-with-abort; pilih satu
   contract yang jelas dan test.
6. Karena Jest web memakai Node environment dan tidak memiliki DOM test dependency baru,
   ekstrak request coordinator/reducer deterministik ke helper yang benar-benar dipakai
   `AiClient`. Test deferred promises/out-of-order completion pada coordinator, lalu buktikan
   integrasi component melalui local browser QA. Jangan menambah dependency.

### P2-R16 - Finance class filter and kiosk transport proof

Finance:

1. Tambahkan `classId` ke page search params, URL state, `filters` props, dan request API.
2. Gunakan class catalog endpoint existing; jangan hardcode kelas atau menyimpulkan opsi
   hanya dari current payment page.
3. Pilihan `Semua Kelas` menghapus query, perubahan kelas reset page ke 1, refresh/back
   mempertahankan filter, dan mobile tidak overflow.
4. Test memastikan classId diteruskan ke API dan dapat menemukan row di luar page pertama.

Kiosk:

1. Tambahkan Fastify `inject()` transport test pada endpoint nyata:
   - query-only token ditolak;
   - header `x-diis-kiosk-token` diterima;
   - response memuat `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, dan
     `X-Robots-Tag: noindex, nofollow`.
2. Tambahkan stateful rotation proof: token lama valid sebelum regenerate, invalid setelah
   regenerate, token baru valid, dan token tidak muncul di body/error/log evidence.
3. Verifikasi Next public page mengirim token hanya melalui private header ke API dan
   metadata robots/referrer benar. Jalankan local HTTP/curl atau browser response-header
   proof; pemanggilan controller langsung tidak cukup.

### Automated verification

Tambahkan focused tests yang secara eksplisit gagal pada source sebelum follow-up. Minimal:

- finance authority helper/matrix dan class query;
- remedial parent two-child projection + recursive forbidden fields;
- remedial mutation authority matrix termasuk SA+GURU;
- NotificationService immediate enqueue/failure/recovery/idempotency;
- remedial create/update CAS and active-context revalidation;
- KKTP module/config/system-default/snapshot/unconfigured;
- AI request epoch/out-of-order/delete-in-flight;
- Fastify kiosk headers + rotation.

Jalankan focused terlebih dahulu dan catat exact suites/tests, lalu full gates:

```powershell
npm.cmd --workspace @smk/api run test -- --runInBand --cacheDirectory=.tmp/jest-cache-wave5-rereview
npm.cmd --workspace @smk/web run test -- --runInBand
npm.cmd --workspace @smk/api run type-check
npm.cmd --workspace @smk/web run type-check
npm.cmd --workspace @smk/database run type-check
npm.cmd --workspace @smk/types run type-check
npm.cmd --workspace @smk/api run lint
npm.cmd --workspace @smk/web run lint
npm.cmd --workspace @smk/api run build
npm.cmd --workspace @smk/web run build
npm.cmd --workspace @smk/database exec -- prisma validate
npm.cmd --workspace @smk/database run db:generate
```

Gunakan workspace-local cache dan hapus hanya cache yang dibuat sendiri. Jangan menyentuh
historical untracked artifacts.

### PostgreSQL and queue proof

1. Gunakan disposable PostgreSQL copy saja, bukan staging live/production/real student data.
2. Karena migration Wave 5 current mungkin dikoreksi, ulangi clean migrate dari baseline
   sampai seluruh migration, pre/post PII-minimal counts, schema constraints/indexes, dan
   snapshot/restore rollback proof.
3. Jalankan dua koneksi nyata untuk seluruh race matrix R13. Simpan timing/outcome/row-state
   yang redacted dan reproducible.
4. Buktikan NotificationLog pending -> immediate BullMQ job -> worker outcome pada local
   queue existing. Simulasikan queue unavailable lalu recovery row yang sama. Jangan
   mencatat nomor telepon, token, body pesan, secret, atau Redis credential.

### Local authenticated browser QA

Gunakan existing local stack dan dummy PII-safe fixture. Test 1440x900 dan 390x844:

1. TU melihat `Catat Pembayaran`, mencatat unpaid; KS tidak melihat record; SA/KS approve;
   class filter menemukan row di luar page pertama.
2. Parent dua anak membuka Remedial untuk A, switch ke B, melihat hanya B; slow response A
   tidak muncul kembali; forged child/direct URL ditolak.
3. GURU owner create/update/activate/finalize/retry; GURU unrelated ditolak. SA/KS/WAKA
   hanya read dan tidak memiliki mutation control; direct API mutation 403.
4. Healthy queue menunjukkan immediate handoff untuk remedial/receipt/urgent announcement;
   controlled queue failure meninggalkan pending recovery tanpa duplicate business action.
5. KKTP 80, 72, default sistem 75, dan remedial snapshot non-75 tampil konsisten.
6. AI Chat: send lalu switch/new/delete sebelum response; old response tidak mengubah chat
   aktif. Ulangi setelah refresh dan pada mobile.
7. Kiosk: query token tidak bekerja, header transport bekerja, response headers benar,
   old link invalid setelah rotation dan new link valid. Evidence tidak memuat token.
8. Periksa console/network, focus, loading/error/empty states, no nested interactive control,
   long text, dan tidak ada horizontal page overflow 390 px.

Jika local auth/runtime external benar-benar unavailable, jangan menunda source/PostgreSQL
closure. Catat blocker secara presisi dan jangan mengklaim target E2E 90%; Reviewer yang
menentukan apakah packaging boleh dibuka untuk staging QA.

### Self-review dan report

Sebelum berhenti:

1. Trace ulang R9-R16 pada source final.
2. Cari `finance.record`, SUPER_ADMIN remedial mutation bypass, unscoped parent remedial,
   literal KKTP decisions, unconditional remedial update, pending-log-only business paths,
   stale AI state updates, kiosk query token, dan swallowed errors.
3. Perbaiki seluruh P0/P1/P2 same-scope yang ditemukan; jangan membuat batch lanjutan.
4. Ulangi focused tests setelah setiap koreksi penting, lalu full gates sekali pada source
   final.
5. Buat/update:

`docs/audits/WAVE5-PHASE4-CONTINUOUS-OPERATIONS-P1-P2-CLOSURE-2026-08-15.md`

Report wajib memuat:

- HEAD/base dan changed-file inventory;
- closure table R9-R16 dengan file/test/evidence;
- authority dan family projection matrix;
- notification commit/enqueue/recovery sequence;
- KKTP resolver/provenance matrix;
- exact focused/full test counts;
- PostgreSQL two-connection outcomes;
- queue proof;
- browser matrix desktop/mobile;
- privacy/secret/PII scan;
- residual yang benar-benar external saja;
- readiness estimate berbasis evidence, bukan deklarasi approval.

Terakhir jalankan `git status --short`, diff stat, `git diff --check`, dan
`git diff --cached --check`. Pastikan tidak ada staged changes. Jangan menggunakan
`git add .` atau membersihkan file historis.

Berhenti dan akhiri dengan:

`STOPPED AT WAVE 5 INDEPENDENT RE-REVIEW GATE - NO COMMIT/PUSH/PR/DEPLOY`
````

## Non-Goals

- Tidak mengubah policy system default KKTP 75 yang sudah disetujui.
- Tidak menambah schema/migration/dependency kecuali koreksi migration Wave 5 current yang
  belum pernah dipromosikan.
- Tidak membuat recovery pedagogis SA.
- Tidak membuat family dashboard, assessment runtime, notification queue, atau kiosk token
  mechanism kedua.
- Tidak mengubah Wave 4 Question Bank/player/grading, provider AI, Rapor authority, atau
  Academic Operational di luar integration boundary yang disebut.
- Tidak commit/push/PR/deploy atau mengubah branch protection.

## Self-Critique Prompt

- Semua enam P1 diberi source boundary dan acceptance terukur: ya.
- P2 meminta behavior/transport proof, bukan helper-only test: ya.
- Policy KKTP sebelumnya tidak dibatalkan oleh interpretasi reviewer: ya.
- SA wildcard tidak diubah, tetapi business mutation tetap fail-closed: ya.
- Notification normal path dan crash recovery dipisahkan jelas: ya.
- PostgreSQL race diuji dua koneksi dan dua urutan: ya.
- Parent multi-child mengikat selected ID di server dan UI: ya.
- Test, PostgreSQL, queue, browser, privacy, report, dan Reviewer gate terpisah: ya.
- Tidak ada scope creep ke wave/dependency/schema baru: ya.

## Confidence Dan Risiko

Confidence Prompt Architect: **97%**.

Risiko yang tetap harus dibuktikan, bukan diasumsikan:

1. lock ordering create/update versus academic-year/report transitions;
2. queue failure setelah business commit tanpa false failure atau duplicate delivery;
3. selected-child request sequencing pada browser nyata;
4. SA+GURU ownership boundary;
5. Next/Fastify kiosk headers dan token rotation pada transport nyata.
