# Wave 4 Phase 3 Assessment Runtime and Question Bank Remediation

Tanggal: 2026-08-06
Branch: `feat/wave4-assessment-runtime-question-bank-20260806`
Target review: source gate only

## Status

READY FOR INDEPENDENT RE-REVIEW GATE. Tidak ada commit, push, PR, merge, deploy,
staging mutation, production mutation, atau broad staging Git yang dilakukan.

Browser QA tidak dijalankan lokal. Sesuai keputusan Director terbaru, browser QA Wave 4
hanya dilakukan di staging setelah source review, PR, deploy, dan deployed SHA jelas.

## Follow-up 2026-08-10

Reviewer finding P1/P2 tambahan telah ditutup dalam branch yang sama:

- Generate AI dibuat race-safe melalui unique `(teacherId,type,idempotencyKey)`,
  normalized request fingerprint, create-first recovery P2002 di luar transaksi aktif, dan
  DTO `idempotencyKey` wajib.
- Accept AI memakai ledger `AiDraftAcceptance` dengan fingerprint payload. Retry identik
  idempotent; key sama dengan payload berbeda menghasilkan conflict.
- Completion Grade memakai `upsert` unique source, bukan recovery P2002 di transaksi yang
  sudah aborted.
- Event Grade/assessment dipindahkan ke durable `AssessmentEventOutbox` dan didrain setelah
  commit/startup.
- Accept/regenerate/reject draft AI selalu re-resolve source + assignment authority sebelum
  mutasi.
- Lifecycle draft server-side mendukung partial accept, rejected, dan guard regenerate item
  yang sudah accepted.
- JSON Schema provider untuk draft AI dibatasi ke empat bentuk soal dan ditambah bounded
  repair satu kali; Zod/server tetap validator final.
- Bank Soal AI tidak lagi hardcoded empat soal. UI menyediakan source picker Modul/RPP,
  jumlah soal, tujuan asesmen, distribusi tipe/kesulitan/C1-C6, TP, konteks, karakter, dan
  instruksi guru.
- Registry Bank Soal memakai server-side search/filter/pagination; tab Sesi/Koreksi memakai
  registry AssessmentSession tersimpan, bukan hanya jadwal hari ini.
- CSV import memakai durable `QuestionImportRow` keyed by teacher/batch/row dengan full
  content fingerprint.
- Results/koreksi hanya menghitung response yang sudah submitted.
- Web test ditambah helper perilaku untuk source picker, request AI, distribusi, dan registry
  assessment lintas jadwal; tidak hanya substring source.
- Full API suite timeout root cause ditutup: `ai-gateway.spec.ts` mengimpor `AiModule`
  sehingga `NotificationModule` membuat BullMQ Queue/Worker nyata. Assertions sudah PASS,
  tetapi Redis worker handle tetap hidup dan menahan Jest exit. Test factory kini memakai
  mock `NOTIFICATION_QUEUE`/`NOTIFICATION_WORKER` dan menutup semua `TestingModule`.

## Follow-up Narrow Closure 2026-08-10

Reviewer finding P1-R10 sampai P1-R14 dan P2 terarah ditindaklanjuti:

- OpenAI structured output schema untuk draft soal dibuat provider-portable:
  semua object property wajib ada di `required`, `additionalProperties: false`, dan
  matching answer tidak lagi memakai dynamic object key. Provider mengirim matching answer
  sebagai array `{ promptId, matchId }`, lalu backend menormalisasi ke contract kanonik
  sebelum validasi Zod final.
- Test schema tidak lagi sekadar substring. Test sekarang menginspeksi schema JSON,
  memastikan setiap object shape memiliki daftar `required` yang lengkap, matching answer
  berbentuk object tetap, dan `strict: true` aktif.
- Mapper source Bank Soal mengirim TP reference yang diterima backend (`TP 1`, `TP 2`,
  dst.) dari data Modul/RPP authoritative, bukan teks TP seperti `TP Subnet`.
- Dispatcher `AssessmentEventOutbox` memakai `emitAsync()` dan baru menandai event sebagai
  `emitted` setelah listener async selesai. Payload outbox diberi `deliveryMode: 'outbox'`;
  listener gamifikasi/notifikasi tetap fail-soft untuk event langsung, tetapi melempar balik
  error untuk event outbox agar status menjadi `failed` dan bisa retry.
- Generate AI question draft tidak lagi memakai transaksi panjang/advisory lock sambil
  menunggu provider. Service sekarang membuat claim row `AiGeneration` dengan status
  `generating` sebelum provider dipanggil, memakai unique `(teacherId,type,idempotencyKey)`
  sebagai guard lintas proses, dan caller paralel menunggu row yang sama menjadi `drafted`.
  Test paralel membuktikan dua caller mendapat generation yang sama dan provider hanya
  dipanggil sekali.
- Accept/regenerate/reject draft AI memakai mutex in-process singkat ditambah ledger DB dan
  validasi status/fingerprint server-side. Mutasi tidak memegang koneksi PostgreSQL selama
  kerja provider dan tidak memakai callback transaksi yang meminta koneksi Prisma kedua.
- Import CSV Question Bank memakai advisory lock per `teacherId + batchKey + rowKey`
  sebelum ledger upsert, sehingga retry/paralel row yang sama menjadi idempotent, bukan
  error P2002 sporadis.
- Mutasi tulis Bank Soal untuk GURU sekarang mensyaratkan TeachingAssignment pada tahun
  ajaran aktif. Assignment historis dengan subject sama tidak lagi cukup untuk membuat,
  mengubah, menduplikasi, atau mengimpor soal.
- Registry AssessmentSession di dashboard guru/KS mengambil semua halaman server-side
  dengan limit API 100 per halaman; UI tidak lagi berhenti pada 100 sesi pertama.

## Follow-up P1 Closure 2026-08-10

Reviewer finding P1 terbaru ditutup tanpa commit/push/PR/deploy:

- Risiko pool exhaustion AI ditutup. Jalur generate draft AI tidak lagi menahan satu koneksi
  transaksi lalu memanggil Prisma global dari callback. Pola baru adalah:
  claim `AiGeneration(status=generating)` -> lepas koneksi -> panggil provider -> update
  menjadi `drafted` atau `failed`. Retry/key paralel membaca row yang sama dan menunggu
  hasilnya, sehingga pool kecil tidak timeout dan provider tidak dipanggil ganda.
- P1-R17 lease/fencing ditutup. Claim `generating` menyimpan lease `{ leaseId,
  leaseExpiresAt, leaseSequence }` di metadata request. Row `generating` yang lease-nya
  aktif hanya ditunggu; row yang lease-nya stale dapat direclaim dengan compare-and-set
  pada lease lama. Finalize/failure write memakai fencing `WHERE leaseId = currentLeaseId`,
  sehingga proses lama yang hidup kembali tidak dapat menimpa hasil claimant baru.
- Jika provider gagal setelah claim, generation ditandai `failed` dengan pesan error
  terpotong aman hanya bila lease masih cocok. Retry dengan key yang sama tidak berpura-pura
  sukses dan tetap membandingkan request spec ternormalisasi.
- Assessment outbox sekarang memiliki worker mandiri berbasis interval 30 detik, guard agar
  tidak overlap, backoff eksponensial, reclaim untuk event `emitting` yang stale, dan status
  terminal `dead_letter` setelah batas retry.
- `completeSession()` dan `gradeEssayResponse()` tidak lagi menunggu drain outbox di path
  response. Keduanya men-trigger worker non-blocking setelah transaksi durable selesai.
- P1-R18 ditutup. `NotificationService.notify()` sekarang fail-closed saat queue belum siap.
  Row `sent` tetap idempotent skip, tetapi row `pending` dengan ref yang sama wajib
  direqueue ke BullMQ memakai `jobId` log yang sama. Jika `queue.add()` gagal, row tetap
  `pending` dan error dilempar agar assessment outbox retry, bukan false-success `emitted`.

## Final P2-R11 Closure 2026-08-10

Sisa P2-R11 ditutup dalam branch yang sama, tanpa commit/push/PR/deploy:

- Registry `AssessmentSession` dashboard tidak lagi mengambil maksimum 5.000 data secara
  serial. Initial render memakai halaman pertama dari server, perubahan subject/class/tahun
  ajaran/semester memicu refetch server-side, dan tombol `Muat sesi berikutnya` mengambil
  halaman lanjutan dengan merge by id agar record server terbaru menang.
- DTO/list API assessment menerima filter `subject`, sehingga registry Sesi/Koreksi tidak
  bergantung pada filter browser setelah data dibatasi.
- TP Bank Soal AI bersumber dari Modul/RPP authoritative sebagai `tpOptions` dengan ref
  stabil `TP 1`, `TP 2`, dan seterusnya. UI tidak lagi meminta guru mengetik TP bebas untuk
  request AI; helper request menolak ref yang tidak ada pada source terpilih.
- Test web fokus tidak lagi membaca komponen sebagai file teks (`readFileSync`) untuk
  membuktikan perilaku. Test sekarang memakai mapper/helper kontrak: source picker TP,
  request AI, distribusi, pagination merge, dan identitas import.
- CSV Question Bank memakai identitas konten: `batchKey` dari hash normalized subject+rows
  dan `rowKey` dari hash normalized row. Migration hardening menambahkan FK
  `question_import_rows.question_id -> questions.id ON DELETE SET NULL`.
- Race notifikasi lintas-caller ditutup dengan partial unique index active ref di schema
  notification, recovery P2002 yang refetch row pemenang, dan requeue pending memakai jobId
  deterministic. Dry-run PostgreSQL membuktikan insert duplikat pending untuk ref yang sama
  ditolak oleh `notification_logs_ref_active_unique`.
- Recovery notifikasi periodik ditambahkan pada `NotificationService` lewat interval mandiri
  dengan overlap guard; pending log yang belum masuk queue direqueue tanpa menunggu request
  baru dari domain assessment.
- Observability outbox ditambah endpoint reviewer-only `GET /assessment/outbox/health`.
  Response hanya berisi count status, oldest retryable timestamp, dan ringkasan dead letter
  tanpa payload PII.
- Deterministic AI quality lint diperluas: near-duplicate intra-batch, opsi pilihan ganda
  ambigu/duplikat, leakage jawaban, double negative true/false, batas keterbacaan by grade,
  dan katalog konteks umum-produktif sekolah untuk mapel umum/produktif.

## Final P2 Follow-up Closure 2026-08-10

Reviewer menemukan tiga P2 lanjutan setelah P2-R11. Semuanya ditutup dalam branch yang
sama, tanpa commit/push/PR/deploy:

- Race pagination dan false-empty:
  - `AkademikWorkspace` sekarang memakai `requestId + filterKey` untuk setiap request
    registry sesi. Respons stale dari mapel/kelas/tahun/semester/limit lama ditolak
    sebelum mengubah state.
  - `sessionFilterKeyRef` diperbarui saat render, sehingga respons lama tetap ditolak
    meski selesai di antara render filter baru dan effect fetch berikutnya.
  - `Muat sesi berikutnya` memakai guard loading/hasMore agar double-submit tidak
    mengirim dua halaman paralel.
  - Tab `Sesi Asesmen` dan `Koreksi` menampilkan loading/error/retry secara eksplisit
    sebelum empty state. Empty state hanya muncul bila request tidak loading dan tidak
    error.
  - Status loading/error diberi `aria-busy`, `role="status"`, dan `role="alert"` untuk
    aksesibilitas dasar.
- Pengujian UI:
  - Focused web test sekarang menguji state-machine produksi untuk stale response,
    loading-before-empty, error-before-empty, retry eligibility, dan double-submit guard.
  - Test tetap berjalan di Jest node environment tanpa menambah dependency jsdom baru;
    browser/focus manual tetap staging-only gate.
- Konteks produktif sekolah:
  - Prompt AI tidak lagi memakai regex/hardcode tiga kelompok jurusan.
  - `Major.description` yang sudah dikelola lewat konfigurasi jurusan menjadi sumber
    katalog konteks produktif.
  - Bila deskripsi jurusan kosong, request Produktif/Auto Vokasi fail-closed dengan pesan
    untuk guru agar mengisi deskripsi jurusan atau memilih mode Umum. Provider tidak
    dipanggil dan generation generik tidak dibuat.
  - Test membuktikan deskripsi jurusan dipakai dan jurusan tanpa deskripsi tidak lagi
    menerima konteks TKJ/akuntansi/pemasaran hardcoded.

## Final P2-R22/R23 Closure 2026-08-11

Reviewer menemukan dua P2 lanjutan. Keduanya ditutup dalam branch yang sama, tanpa
commit/push/PR/deploy:

- P2-R22 double-submit:
  - Initial page, retry, dan `Muat sesi berikutnya` sekarang memakai satu gate sinkron
    `createAssessmentSessionRequestGate()` per filter key.
  - Gate dikunci sebelum server action/fetch dipanggil, sehingga rapid retry/page-1 dan
    rapid load-more dalam render frame yang sama tidak dapat mengirim request kedua untuk
    filter yang sama.
  - Respons stale tetap ditolak oleh guard `requestId + filterKey`; gate dilepas setelah
    task selesai.
  - Test tidak lagi hanya predicate. Test menjalankan tiga request same-key paralel yang
    mewakili page-1 retry dan load-more, lalu membuktikan fetcher hanya dipanggil sekali.
- P2-R23 konteks produktif:
  - `Major.description` dibatasi 800 karakter dan di-`trim()` pada DTO konfigurasi
    jurusan; whitespace-only menjadi `null`.
  - Form Jurusan di Profil Sekolah memiliki `maxLength=800`, counter karakter, dan
    penjelasan bahwa deskripsi dipakai sebagai konteks produktif AI Bank Soal.
  - Service AI tetap membatasi data legacy sebelum masuk prompt: maksimum 800 karakter
    konteks dan 180 karakter per hint.
  - `GenerateQuestionDrafts` memvalidasi konteks produktif sebelum claim `AiGeneration`.
    Jika deskripsi kosong, guru menerima error actionable; tidak ada provider call,
    tidak ada draft generik, dan ledger generation tidak tercemar.
  - Test membuktikan DTO menolak deskripsi 801 karakter, provider tidak dipanggil saat
    konteks produktif kosong, dan deskripsi panjang tidak bocor melewati batas prompt.

## Scope Closure

Wave ini menutup finding reviewer P1-1 sampai P2-2 dalam branch yang sama:

- P1-1 completion/Grade consistency: completion berjalan transactional, Grade sync
  menggunakan `sourceAssessmentSessionId + studentId`, event hanya dipancarkan setelah
  write menang, dan retry race-safe lewat create lalu P2002 update.
- P1-2 authoritative session context: create/update session menurunkan teacher, class,
  subject, academic year, semester dari Modul/RPP/assignment authoritative dan menolak DTO
  mismatch; class wajib untuk audience siswa/graded assessment.
- P1-3 essay correction: results projection memuat queue koreksi esai minimal, pending
  manual dikeluarkan dari final statistics, dan modal Koreksi Esai reachable dari Monitor,
  Analisis, dan tab Koreksi Penilaian.
- P1-4 Bank registry dan Session Studio: Bank Soal mendukung server search/filter/paging,
  empat tipe soal, dan entry point Penilaian `Nilai | Sesi Asesmen | Bank Soal | Koreksi`.
  Session Studio memakai langkah `Konteks -> Soal -> Review -> Aktifkan` untuk diagnostik,
  formatif, sumatif UTS, dan sumatif UAS.
- P1-5 CSV round-trip/import retry: parser CSV menangani quote/comma/newline, >500 row hard
  reject, import per chunk 100, batch/row key, retry melewati row sukses, dan export mempage
  semua hasil.
- P1-6 AI Question Draft: endpoint legacy tetap 410. Endpoint baru membuat draft dari
  context authoritative, guru dapat edit, regenerate per item, reject batch, accept sebagian,
  lalu canonical `Question` dibuat hanya setelah accept.
- P2-1 semantic invariants: matching bijective, rubric weight total 100, order/poin bounded,
  answer map bounded, duplicate/leakage/PII/legacy markdown terms ditolak server-side.
- P2-2 web contract/microcopy: `AssessmentSessionData.questions` memakai shared question
  union, label Gradebook menjadi `Bank Soal`, bukan `Bank Soal PG`.

## Schema And Migration

Migration 1:

- `packages/database/prisma/migrations/20260806000001_wave4_assessment_runtime_question_bank/migration.sql`
- Adds `AssessmentSession.gradeTarget`.
- Adds `AssessmentResponse.questionOrder`.
- Adds `AssessmentResponse.itemScores`.
- Adds `Grade.sourceAssessmentSessionId`, FK, index, and unique source constraint.

Migration 2:

- `packages/database/prisma/migrations/20260806000002_wave4_ai_question_provenance/migration.sql`
- Adds `QuestionSource` enum: `MANUAL`, `AI_ASSISTED`.
- Adds `CognitiveLevel` enum: `C1..C6`.
- Adds `Question.source`, `aiGenerationId`, `aiItemKey`, `tpRefs`, `cognitiveLevel`.
- Adds nullable source/idempotency metadata on `AiGeneration`.
- Adds FK from accepted AI questions to generation audit.
- Adds CHECK constraints for manual-vs-AI provenance shape.
- Adds unique `(aiGenerationId, aiItemKey)` for partial/concurrent accept idempotency.

Migration 3:

- `packages/database/prisma/migrations/20260806000003_wave4_assessment_event_outbox/migration.sql`
- Adds durable `academic.assessment_event_outbox` for post-commit Grade/assessment events.
- Adds retry metadata `next_attempt_at`, `dead_letter_at`, status check value
  `dead_letter`, and index `(status,next_attempt_at)`.

Migration 4:

- `packages/database/prisma/migrations/20260806000004_wave4_question_import_idempotency/migration.sql`
- Adds durable `academic.question_import_rows` for CSV batch/row idempotency.

Migration 5:

- `packages/database/prisma/migrations/20260806000005_wave4_p2_operability_hardening/migration.sql`
- Adds FK `academic.question_import_rows.question_id -> academic.questions.id` with
  `ON DELETE SET NULL` after quarantining orphan references.
- Adds partial unique index `notification.notification_logs_ref_active_unique` for active
  `pending/sent` notification refs after marking duplicate active refs as failed.

`packages/database/prisma/schema.prisma` diff is manual and scoped to Wave 4 fields/models.
No `prisma format` churn is present.

Decision recorded in `docs/decision-log.md`.

## Backend Changes

- Added strict shared assessment/question contracts in `apps/api/src/assessment/assessment-contract.ts`.
- Added runtime helpers in `apps/api/src/assessment/assessment-runtime.ts`.
- Question Bank CRUD/import/export validates `multiple_choice`, `true_false`, `matching`,
  and `essay`.
- GURU Question Bank mutations require active `TeachingAssignment` for the subject.
- Assessment sessions store immutable snapshots from canonical Question IDs.
- Student projection strips answer keys and rubric internals.
- Attempt start persists `questionOrder`; concurrent P2002 returns existing attempt.
- Submit validates against immutable snapshot, stores `itemScores`, and keeps essay/manual
  submissions pending until graded.
- `completeSession()` syncs Grade inside a transaction and emits after commit.
- Completion creates outbox events inside the same durable DB transaction. A non-overlapping
  interval worker drains pending/failed/stale-emitting events with backoff and dead-letter.
- AI draft generation uses idempotent claim-row lease/fencing, not long DB transaction locks.
  Stale claims can be reclaimed; stale processes cannot finalize over a newer lease.
- Notification enqueue requeues existing `pending` logs and throws on queue failure so outbox
  retry remains truthful.
- AI draft endpoints:
  - `POST /ai/question-drafts`
  - `POST /ai/question-drafts/:generationId/items/:itemKey/regenerate`
  - `POST /ai/question-drafts/:generationId/accept`
  - `POST /ai/question-drafts/:generationId/reject`
- Legacy AI question/material/ATP endpoints remain `410 AI_ENDPOINT_DISABLED`.

## Web Changes

- `QuestionBankEditor` supports four question types, CSV import/export, AI draft generation,
  inline draft edit, per-item regenerate, reject all, and accept selected.
- Bank Soal global supports Modul/RPP source picker plus AI question count, purpose,
  type/difficulty/cognitive distribution, TP refs, context mode, character, and teacher
  instruction.
- Bank list supports search/filter/server pagination with truthful total.
- Accepted AI questions auto-select in Session Studio when opened from an assessment flow.
- `PenilaianSesiModal` now uses four-step studio: `Konteks`, `Soal`, `Review`, `Aktifkan`.
- `AkademikWorkspace` Penilaian screen exposes `Nilai`, `Sesi Asesmen`, `Bank Soal`, and
  `Koreksi` entry points without replacing Gradebook.
- `Sesi Asesmen` and `Koreksi` now read saved AssessmentSession registry, not only today's
  schedule.
- `EssayGradingModal` now displays rubric weight as total 100 and refreshes results after save.
- Student assessment flow remains real attempt/resume/autosave/submit, not placeholder.

## Verification

Passed:

- `npx prisma validate --schema packages/database/prisma/schema.prisma`
- `npm.cmd --workspace packages/types run type-check`
- `npm.cmd --workspace packages/types run build`
- `npm.cmd --workspace apps/api run type-check`
- `npm.cmd --workspace apps/web run type-check`
- `npm.cmd --workspace apps/api run lint`
- `npm.cmd --workspace apps/web run lint`
- `npm.cmd --workspace apps/api run build`
- `npm.cmd --workspace apps/web run build`
  - result: 39/39 pages built
- API full tests:
  - command: `npm.cmd --workspace apps/api test -- --runInBand`
  - result: 58 suites / 1092 tests passed
- API open-handle regression:
  - command: `npm.cmd --workspace apps/api test -- --runInBand --detectOpenHandles apps/api/src/__tests__/ai-gateway.spec.ts`
  - result: 1 suite / 30 tests passed; no open-handle warning after BullMQ worker mock.
- API focused follow-up:
  - command: `npm.cmd --workspace apps/api test -- --runInBand apps/api/src/__tests__/ai-generate.spec.ts apps/api/src/__tests__/assessment-u2.spec.ts apps/api/src/__tests__/question-bank.spec.ts apps/api/src/__tests__/notification.spec.ts apps/api/src/__tests__/ai-gateway.spec.ts`
  - result: 5 suites / 138 tests passed
- Web full tests:
  - command: `npm.cmd --workspace apps/web test -- --runInBand`
  - result: 25 suites / 158 tests passed
- Web focused follow-up:
  - command: `npm.cmd --workspace apps/web test -- --runInBand apps/web/src/__tests__/assessment-session-studio.test.ts apps/web/src/__tests__/question-bank-editor-import.test.ts`
  - result: 2 suites / 9 tests passed; focused files no longer use `readFileSync`
    source-string assertions.
- API focused P2-R11 follow-up:
  - command: `npm.cmd --workspace apps/api test -- --runInBand apps/api/src/__tests__/ai-generate.spec.ts apps/api/src/__tests__/assessment-u2.spec.ts apps/api/src/__tests__/notification.spec.ts apps/api/src/__tests__/question-bank.spec.ts`
  - result: 4 suites / 112 tests passed
- API focused final P2 follow-up:
  - command: `npm.cmd --workspace apps/api test -- --runInBand apps/api/src/__tests__/ai-generate.spec.ts apps/api/src/__tests__/school-config.spec.ts`
  - result: 2 suites / 88 tests passed
- Web focused final P2 follow-up:
  - command: `npm.cmd --workspace apps/web test -- --runInBand apps/web/src/__tests__/assessment-session-studio.test.ts`
  - result: 1 suite / 6 tests passed
- PostgreSQL disposable migration dry-run:
  - image/container: `pgvector/pgvector:pg16`, container `diis-wave4-dryrun-20260810`
  - database: `diis_wave4`, user `diis_dryrun`, host port `55441`
  - command: `npx prisma migrate deploy --schema packages/database/prisma/schema.prisma`
  - result: 40 migrations applied successfully, including:
    - `20260806000001_wave4_assessment_runtime_question_bank`
    - `20260806000002_wave4_ai_question_provenance`
    - `20260806000003_wave4_assessment_event_outbox`
    - `20260806000004_wave4_question_import_idempotency`
    - `20260806000005_wave4_p2_operability_hardening`
  - post-check tables present:
    - `academic.assessment_event_outbox`
    - `academic.question_import_rows`
    - `ai_knowledge.ai_draft_acceptances`
    - `ai_knowledge.ai_generations`
  - post-check indexes present:
    - `ai_generations_teacher_id_type_idempotency_key_key`
    - `ai_draft_acceptances_ai_generation_id_idempotency_key_key`
    - `question_import_rows_teacher_id_batch_key_row_key_key`
    - `grades_source_assessment_session_id_student_id_key`
- PostgreSQL disposable P2-R11 schema proof:
  - image/container: `pgvector/pgvector:pg16`, container
    `diis-wave4-p2-proof-20260810`
  - database: `diis_wave4_p2`, host port `55445`
  - migration status: 40 migrations applied and database schema up to date
  - FK present: `question_import_rows_question_id_fkey`
  - unique active ref index present: `notification_logs_ref_active_unique`
  - duplicate pending notification insert for the same `(ref_type, ref_id, recipient,
    channel)` failed with unique violation, proving cross-caller dedupe at the database
    boundary
  - cleanup: container removed with `docker rm -f diis-wave4-p2-proof-20260810`
- PostgreSQL disposable concurrency proof:
  - image/container: `pgvector/pgvector:pg16`, container
    `diis-wave4-concurrency-20260810`
  - database: `diis_wave4`, user `diis_dryrun`, host port `55442`
  - migration deploy result: 39 migrations applied successfully
  - assessment start duplicate attempt:
    `{ fulfilled: 1, rejected: ["P2002"], count: 1 }`
  - assessment submit compare-and-set:
    `{ updateCounts: [1, 0], submittedRows: 1 }`
  - Grade source idempotency:
    `{ fulfilled: 1, rejected: ["P2002"], count: 1 }`
  - raw QuestionImportRow unique proof:
    `{ fulfilled: 1, rejected: ["P2002"], count: 1 }`
  - service-style QuestionImportRow advisory lock proof:
    `{ fulfilled: 2, rejected: [], count: 1 }`
  - raw AiGeneration unique proof:
    `{ fulfilled: 1, rejected: ["P2002"], count: 1 }`
  - service-style AiGeneration claim-row proof:
    `{ fulfilled: 2, rejected: [], providerCalls: 1, count: 1 }`
  - raw AiDraftAcceptance unique proof:
    `{ fulfilled: 1, rejected: ["P2002"], count: 1 }`
  - service-style AI lifecycle acceptance ledger proof:
    `{ fulfilled: 2, rejected: [], count: 1 }`
  - accepted Question provenance idempotency:
    `{ fulfilled: 1, rejected: ["P2002"], count: 1 }`
  - cleanup: container stopped with `docker stop diis-wave4-concurrency-20260810`
- PostgreSQL disposable pool-exhaustion regression proof:
  - image/container: `pgvector/pgvector:pg16`, container
    `diis-wave4-pool-proof-20260810`
  - database: `diis_wave4_pool`, host port `55444`
  - migration deploy result: 39 migrations applied successfully
  - connection string included `connection_limit=2&pool_timeout=2`
  - concurrent same-key AiGeneration claim-row proof:
    `{ "ok": true, "durationMs": 1240, "providerCalls": 1, "resultCount": 2, "rowCount": 1, "statuses": ["drafted"] }`
  - outbox retry/dead-letter schema proof:
    `{ "ok": true, "initialStatus": "pending", "initialAttempts": 0, "hasNextAttempt": true, "finalStatus": "dead_letter", "finalAttempts": 5, "hasDeadLetter": true, "invalidRejected": true }`
  - cleanup: container removed with `docker rm -f diis-wave4-pool-proof-20260810`
- PostgreSQL disposable AI lease/fencing proof:
  - image/container: `pgvector/pgvector:pg16`, container
    `diis-wave4-lease-proof-20260810`
  - database: `diis_wave4_lease`, host port `55445`
  - migration deploy result: 39 migrations applied successfully
  - connection string included `connection_limit=2&pool_timeout=2`
  - stale generating row was reclaimed only with matching previous lease:
    `{ "ok": true, "reclaimed": 1, "oldFinalizeRows": 0, "newFinalizeRows": 1, "finalStatus": "drafted", "finalModel": "new-model", "finalOutput": "new output", "finalLeaseId": "new-lease-proof" }`
  - cleanup: container removed with `docker rm -f diis-wave4-lease-proof-20260810`
- `git diff --check`

Notes:

- `next lint` and `next build` still print existing Next lint deprecation/plugin guidance.
  ESLint itself reported no warnings or errors.
- Browser QA was intentionally not executed locally; staging-only browser QA remains a
  post-deploy gate.

## Runtime And Browser QA Gate

Required after source approval and staging deployment:

- Apply both migrations on staging through normal Gitflow/deploy path.
- GURU creates manual four-type questions and AI draft questions from Modul/RPP context.
- OpenAI success and Ollama fallback both produce accepted draft flow or honest failure.
- AI draft edit, regenerate one item, reject, partial accept, retry accept, and concurrent
  accept do not duplicate canonical Questions.
- Session Studio creates diagnostic, formative UH, sumatif UTS, and sumatif UAS sessions.
- SISWA starts, refreshes, resumes, autosaves, submits, and cannot resubmit.
- Matching network response does not expose answer pair mapping.
- Essay submission remains manual-pending until GURU correction.
- Grade sync is idempotent under repeated complete.
- LMS progress remains monotonic/completed sticky.
- Desktop 1440px and mobile 390px have no overlap, blank state, or keyboard trap.

## Gate Decision

Ready for independent source re-review.

Not approved by executor for commit, push, PR, staging, main, or production.
