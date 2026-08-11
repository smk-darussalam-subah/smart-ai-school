# Prompt Architect Wave 4 Follow-up: Assessment Closure and AI Question Authoring

Tanggal: 2026-08-06
Peran target: Executor
Branch wajib: `feat/wave4-assessment-runtime-question-bank-20260806`
Verdict sumber: `FOLLOW-UP REQUIRED IN WAVE 4`

## Keputusan Director

Director menyetujui schema provenance tambahan untuk AI Bank Soal pada 2026-08-06.
Approval ini mencakup minimum:

- sumber Question `MANUAL | AI_ASSISTED`;
- referensi `aiGenerationId` dari canonical Question;
- TP references yang berasal dari RPP/Modul authoritative;
- cognitive level `C1..C6`;
- stable generation item key dan constraint pendukung yang memang diperlukan agar
  partial accept, retry, dan concurrent accept idempotent;
- context source ID/status/idempotency metadata pada `AiGeneration` bila diperlukan
  untuk membuktikan authority dan lifecycle draft secara terstruktur.

Approval tidak mencakup dependency baru, service/container baru, role Keycloak baru,
raw prompt bebas, pengiriman PII ke cloud, atau pengaktifan kembali endpoint AI legacy.
Jangan meminta approval schema kedua untuk field pendukung yang dibatasi di atas. Catat
exact schema yang dipilih dan alasannya sebelum edit dalam remediation report.

## Verifikasi Prompt Architect

Prompt ini disusun setelah membaca penuh:

- `docs/audits/WAVE4-PHASE3-ASSESSMENT-RUNTIME-QUESTION-BANK-REVIEW-2026-08-03.md`;
- `docs/audits/WAVE4-PHASE3-ASSESSMENT-RUNTIME-QUESTION-BANK-REMEDIATION-2026-08-06.md`;
- branch `feat/wave4-assessment-runtime-question-bank-20260806` pada
  `e7dc3d0d2ff260a0fe90dfbbfeffda190776809c`;
- current dirty diff, schema, migration Wave 4, Assessment, Question Bank, LMS, Grade,
  AI provider/fallback, RPP/Modul, dan teacher CTA paths.

Temuan Reviewer P1-1 sampai P2-2 masih berada dalam Wave 4 yang sama. Jangan membuat
Wave 4.1, branch baru, atau follow-up parsial yang menyisakan finding independen.

## Kritik Arsitektur

Menambahkan hanya `aiGenerationId`, `tpRefs`, dan `cognitiveLevel` belum cukup untuk
idempotency. Satu batch dapat diterima sebagian atau dikirim ulang setelah response
hilang. Karena itu setiap item draft memerlukan key stabil dan database uniqueness
terhadap generation. Sebaliknya, membuat tabel TP baru sekarang juga tidak valid karena
TP masih disimpan di `Rpp.body` dan `LmsModule.tp`; jangan mengarang foreign key TP.

`AiGeneration` existing adalah audit umum dengan `prompt/output` string dan jalur Modul
Ajar menulisnya fail-soft. Untuk AI Question Draft, generation record adalah bagian dari
authority/idempotency dan harus berhasil dipersist sebelum draft dapat diterima. Jangan
mengubah kontrak Modul Ajar existing menjadi fail-closed sebagai efek samping.

Migration provenance harus terpisah dan tercatat dari
`20260806000001_wave4_assessment_runtime_question_bank`. Jangan menyisipkan diam-diam ke
migration pertama. Kedua migration wajib diuji berurutan pada PostgreSQL disposable.

## Final Prompt Executor

```text
Anda adalah Executor senior full-stack untuk DIIS smart-ai-school. Lanjutkan pekerjaan
lokal pada branch dan worktree yang SAMA:

- worktree: C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school-wave4-assessment-runtime
- branch: feat/wave4-assessment-runtime-question-bank-20260806
- baseline saat review: origin/develop@e7dc3d0

Jangan membuang, mereset, atau menimpa perubahan existing. Jangan membuat Wave 4.1.
Selesaikan seluruh P1/P2 yang independen dalam satu batch Wave 4. Jangan commit, push,
PR, merge, deploy, atau mengakses production. Berhenti pada independent re-review gate.

### 1. Wajib dibaca sebelum edit

1. AGENTS.md dari repository kanonis bila file tidak tersedia di worktree.
2. docs/WAYS-OF-WORKING.md dan docs/decision-log.md.
3. docs/audits/WAVE4-PHASE3-ASSESSMENT-RUNTIME-QUESTION-BANK-REVIEW-2026-08-03.md.
4. docs/audits/WAVE4-PHASE3-ASSESSMENT-RUNTIME-QUESTION-BANK-REMEDIATION-2026-08-06.md.
5. Migration dan seluruh file source yang dirujuk Reviewer.
6. Provider/fallback/PII contract Wave 3 yang sudah production-verified. Reuse service,
   adapter, circuit, structured-output, dan audit pattern; jangan membuat provider stack
   kedua.

Catat HEAD, merge-base, status, diff stat, dan file manifest. Worktree memang dirty dari
Wave 4; itu bukan alasan membuat worktree baru atau membatalkan perubahan.

### 2. Scope closure wajib

Tutup seluruh finding berikut, bukan hanya AI:

- P1-1 completion/Grade consistency, retry, event exactly-once effect;
- P1-2 authoritative session context dan larangan class fail-open;
- P1-3 reachable essay correction dan truthful manual-pending statistics;
- P1-4 scalable Bank registry dan four-step session studio;
- P1-5 real CSV round-trip dan idempotent import retry;
- P1-6 AI Question Draft end-to-end;
- P2-1 seluruh semantic invariant API;
- P2-2 shared web contract dan microcopy legacy.

Jangan menandai finding deferred bila pekerjaan dapat dilakukan pada branch ini. External
provider/staging availability boleh menjadi gate lingkungan, tetapi source, tests, local
PostgreSQL proof, dan local browser flow yang dapat dijalankan harus dituntaskan dahulu.

### 3. Schema provenance yang telah disetujui

Buat migration additive KEDUA, misalnya:

`packages/database/prisma/migrations/20260806000002_wave4_ai_question_provenance/migration.sql`

Jangan mengubah isi migration `20260806000001` kecuali Reviewer membuktikan SQL-nya salah.
Minimum schema contract:

1. Enum `QuestionSource`: `MANUAL`, `AI_ASSISTED`.
2. Enum `CognitiveLevel`: `C1`, `C2`, `C3`, `C4`, `C5`, `C6`.
3. Additive fields pada `Question`:
   - `source`, default `MANUAL`;
   - nullable `aiGenerationId` UUID;
   - nullable stable `aiItemKey` dengan panjang terbatas;
   - `tpRefs` array dengan default kosong;
   - nullable `cognitiveLevel`;
   - relation/index ke `AiGeneration` bila Prisma cross-schema validation mendukungnya.
4. Reverse relation pada `AiGeneration` dan structured source context fields minimum
   yang dibutuhkan untuk resolve ulang exactly-one `rppId | moduleId`. Existing generation
   rows harus tetap valid dengan nullable fields/backfill aman.
5. Database constraint:
   - `MANUAL` tidak boleh membawa AI generation/item provenance;
   - `AI_ASSISTED` wajib memiliki generation ID, item key, minimal satu TP ref, dan
     cognitive level;
   - satu `(aiGenerationId, aiItemKey)` hanya dapat menghasilkan satu canonical Question;
   - FK deletion policy mempertahankan audit provenance; jangan `SET NULL` bila itu akan
     melanggar invariant AI_ASSISTED.
6. TP belum memiliki normalized entity. Simpan ref stabil yang divalidasi terhadap TP
   authoritative dari `Rpp.body`/`LmsModule.tp`; jangan membuat FK atau tabel TP palsu.

Gunakan raw SQL CHECK/partial unique index bila Prisma tidak dapat mengekspresikan
invariant. Mapping P2002/constraint harus menghasilkan 409 terstruktur, bukan 500.

Generation record untuk endpoint Question Draft harus authoritative dan fail-closed:
draft tidak boleh dapat diterima bila audit generation gagal dipersist. Simpan request
spec dan output strict yang sudah PII-clean serta bounded; jangan simpan secret, credential,
raw provider error, atau data siswa. Pertahankan behavior audit Modul Ajar existing.

Tambahkan keputusan schema ini ke remediation report dan `docs/decision-log.md` secara
ringkas. Jangan menjalankan broad `prisma format` yang membuat churn tidak relevan.

### 4. AI Question Draft endpoint baru

Jangan mengaktifkan `POST /ai/generate-questions`; endpoint itu harus tetap 410 dan punya
regression test. Tambahkan endpoint baru, misalnya `POST /ai/question-drafts`, dengan
permission GURU yang paling sempit dan throttle existing.

Request Zod `.strict()` hanya menerima:

- tepat satu `rppId` atau `moduleId`;
- purpose: diagnostik, formatif, sumatif-uts, sumatif-uas;
- questionCount 1..20;
- distribusi empat tipe yang jumlahnya tepat questionCount;
- distribusi difficulty dan C1..C6 yang jumlahnya tepat;
- TP refs yang dipilih dari source tersimpan;
- context mode: umum, otomatis bila relevan, atau produktif;
- karakter soal terkontrol;
- optional teacher instruction maksimal 500 karakter.

Browser tidak boleh menjadi authority untuk teacher, subject, class, major, academic
year, semester, CP, TP, maupun TeachingAssignment. Backend resolve semuanya dari RPP atau
Modul, memastikan ownership, status/source usability, class, dan active assignment.
Reject unknown/cross-owner/fake TP/mismatch sebelum provider dipanggil.

Gunakan OpenAI sebagai default dan Ollama sebagai fallback melalui provider status,
PII detector/stripper, retry, circuit, dan error mapping Wave 3. PII terdeteksi harus
local-only atau ditolak sesuai existing policy; tidak boleh dikirim ke cloud.

Provider output wajib strict structured JSON untuk empat tipe Question. OpenAI memakai
strict JSON Schema; Ollama memakai portable JSON lalu Zod yang sama. Tidak ada markdown,
code fence, field ekstra, atau browser normalization menjadi domain authority. Bounded
repair maksimal satu kali; kegagalan kedua menghasilkan error jujur tanpa Question write.

Server memberi stable item key setelah output tervalidasi. AI hanya menghasilkan draft;
generation tidak boleh langsung membuat canonical Question.

### 5. Draft review, regenerate, reject, dan accept

Implementasikan satu workflow yang dipakai dari Bank Soal dan Session Studio:

1. Guru mengatur source, tujuan, count, type, difficulty, cognitive level, TP, dan context.
2. Preview menampilkan body, opsi/pairs, key/guide, rationale singkat, rubric, TP refs,
   cognitive level, difficulty, dan warning.
3. Guru dapat edit, regenerate satu item, reject satu item/batch, atau accept sebagian.
4. Regenerate memakai generation/source context authoritative; client tidak mengirim
   ulang raw context sebagai authority.
5. Accept mengulang canonical Question validation setelah edit dan menulis hanya item
   terpilih dalam transaksi.
6. Accepted Question memakai `source=AI_ASSISTED`, generation ID, item key, TP refs, dan
   cognitive level. Ia kemudian diperlakukan sama seperti Question manual.
7. Bila dibuka dari Session Studio, accepted Question otomatis terpilih menggunakan ID
   canonical. Bila dari Bank, ia muncul di registry tanpa duplikasi.

Gunakan idempotency key pada generate/accept boundary yang memerlukannya. Response-lost
retry dan concurrent accept item yang sama harus mengembalikan record existing atau 409
deterministik, tidak membuat Question kedua. Payload berbeda untuk key yang sudah dipakai
harus ditolak, bukan diam-diam overwrite.

### 6. Deterministic quality gate

Sebelum preview/accept, jalankan validator kanonik dan quality lint server-side:

- alignment minimal satu TP authoritative per item;
- body tidak membocorkan jawaban;
- PG 2..6 opsi unik, tepat satu key valid, distraktor tidak identik;
- true/false satu proposisi dan tidak ambigu/negatif ganda;
- matching bijective, ID/label unik, minimal dua pasangan;
- essay memiliki guide answer dan rubric dengan total weight tepat 100;
- positive bounded points dan distribusi sesuai request;
- no exact/near duplicate di batch serta Bank guru;
- panjang/bahasa/kompleksitas sesuai tingkat kelas;
- no PII, prompt injection, KI/KD legacy, markdown, atau unknown field.

Hard validation error memblokir accept. Soft warning terlihat dan membutuhkan keputusan
guru. Second-pass AI critic untuk sumatif boleh sebagai sinyal tambahan, tetapi tidak
menggantikan deterministic validator dan keputusan guru.

Konteks jurusan berasal dari `Class.majorCode` dan `Major` authoritative, bukan asumsi
browser/model. Mode default `otomatis bila relevan`; guru dapat mematikan konteks vokasi.
Jangan hardcode kode jurusan sekolah. Gunakan nama/katalog DB dan teacher instruction
bounded bila perlu konteks produktif khusus.

### 7. Closure P1-1 sampai P2-2 lainnya

Completion dan Grade:

- buat completion plus grading state konsisten/transactional atau lifecycle retryable;
- hanya emit Grade event setelah write yang menang dan commit;
- concurrent complete/sync tidak menggandakan Grade/event;
- manual-pending tidak menyatakan Grade final tersinkron.

Session authority:

- derive teacher/class/subject/year/semester dari module/RPP/assignment authoritative;
- tolak DTO mismatch;
- class wajib untuk student/graded assessment;
- jangan memakai `classId=null` sebagai audience semua siswa tanpa use case dan permission
  eksplisit yang sudah ada.

Essay correction:

- buat tab/queue Koreksi reachable;
- teacher projection minimum memuat response ID, jawaban essay, rubric snapshot, status,
  dan student identity minimum yang berwenang;
- exclude manual-pending dari final-score statistics;
- tampilkan pending count dan completion summary jujur.

Bank dan Session Studio:

- server search/filter/pagination/total, bukan limit 100;
- pertahankan Gradebook dan tab `Nilai | Sesi Asesmen | Bank Soal | Koreksi`;
- wizard `Konteks -> Soal -> Review -> Aktifkan` lengkap dengan diagnostik, formatif,
  sumatif UTS/UAS, points/composition, dan immutable confirmation;
- manual dan AI quick-create memakai editor/validator/picker yang sama serta auto-select ID.

CSV:

- gunakan parser CSV benar yang sudah tersedia; jangan tambah dependency tanpa approval;
- dukung quoted comma/newline/quote/UTF-8 dan formula-injection protection;
- template/import/export round-trip empat tipe;
- max 500 transparan dan 501 hard reject;
- file/batch + row idempotency untuk response-lost retry;
- export tidak diam-diam memotong data.

Strict contracts:

- matching harus bijective;
- rubric total weight tepat 100;
- selection order unik dan total points bounded;
- answer map/key count bounded;
- shared discriminated union sampai web, tanpa `unknown[]` cast;
- ubah microcopy `Bank Soal PG` menjadi `Bank Soal`.

### 8. Automated tests wajib

Tambahkan focused behavioral tests untuk seluruh finding. Minimum AI tests:

- strict DTO, exactly-one source, count/distribution, fake TP, extra fields;
- own active assignment allow; cross-owner/inactive/mismatch deny before provider;
- OpenAI success, quota fallback Ollama, recovery/probe, timeout, both fail;
- PII tidak pernah mencapai mock cloud provider;
- strict valid output untuk empat tipe;
- markdown/extra field/key leak/duplicate/non-bijective/rubric !=100 ditolak tanpa write;
- one repair only;
- generate tidak menulis Question;
- edit/regenerate/reject/accept sebagian;
- accept ulang/response-lost/concurrent accept menghasilkan satu Question per item;
- provenance/source/TP/cognitive fields benar;
- manual Question tetap valid dengan default MANUAL;
- endpoint legacy tetap 410;
- session snapshot tetap sama setelah source Question diedit.

Rerun seluruh suite focused Reviewer, full web tests, types/API/web/database type-check,
API/web lint, API/web build, Prisma validate/generate, dan `git diff --check`. Jangan
mengganti behavioral tests dengan source-string assertions.

### 9. PostgreSQL disposable proof wajib sebelum re-review

Pastikan DATABASE_URL menunjuk copy disposable, bukan staging live atau production.

1. Rekam pre-count PII-minimal untuk migration history, Question, AiGeneration, session,
   response, dan Grade.
2. Apply migration `20260806000001`, lalu migration provenance kedua.
3. Rekonsiliasi post-count dan default/backfill manual Question.
4. Buktikan FK/check/partial unique/index dan mapping error 409.
5. Buktikan concurrent start, submit, complete/sync, CSV row retry, dan AI item accept.
6. Buktikan AI generation milik guru lain tidak dapat diterima.
7. Buktikan rollback aplikasi fixture dan restore schema/database copy yang nyata.

Simpan command, redacted output, dan evidence path. Unit mock bukan pengganti DB proof.

### 10. Browser dan provider QA wajib

Jalankan authenticated QA pada 1440x900 dan 390x844 menggunakan data dummy PII-safe:

- Guru membuka AI generator dari Bank dan Session Studio; keduanya memakai state/editor
  yang sama;
- custom count/type/difficulty/C1-C6/purpose/TP/context;
- preview, edit, regenerate item, reject, accept sebagian, dan auto-select;
- OpenAI success dan forced Ollama fallback pada runtime non-production;
- hard warning tidak dapat dilewati; provider failure tidak membuat empty/duplicate;
- manual Bank pagination, CSV round-trip/retry, four-step session wizard;
- student start/autosave/refresh/resume/submit/duplicate/expire;
- essay correction, completion summary, dan Grade sync;
- negative authority direct API;
- keyboard/focus/loading/cancel/390px overflow/console/network/React #310;
- inspect payload siswa untuk answer-key/rubric leakage dan logs untuk secret/PII.

Quality sampling: minimal 3 mapel umum dan 3 mapel produktif pada sedikitnya 2 jurusan,
10 soal per kombinasi yang diuji. Guru menilai key accuracy, TP alignment, clarity,
difficulty, vocational relevance, dan ambiguity. Target: zero wrong key/hard leak dan
minimal 90% accepted setelah edit ringan. AI self-score bukan bukti kualitas.

Jangan menjalankan forced fallback atau generate QA di production.

### 11. Report dan stop gate

Perbarui, jangan duplikasi report:

`docs/audits/WAVE4-PHASE3-ASSESSMENT-RUNTIME-QUESTION-BANK-REMEDIATION-2026-08-06.md`

Tambahkan:

- bukti approval Director 2026-08-06 untuk provenance schema;
- claim-by-claim P1/P2 closure;
- exact schema/migration SQL dan rationale;
- authority, provider, PII, quality, idempotency, and leakage evidence;
- automated result counts;
- PostgreSQL pre/post/constraint/concurrency/restore evidence;
- browser screenshot/network/log paths;
- quality sampling table dan rejection reasons;
- exact changed-file manifest;
- residual hanya external state nyata, bukan pekerjaan independen yang ditunda.

Jalankan `git status --short`, `git diff --stat`, `git diff --check`, dan
`git diff --cached --check`. Pastikan tidak ada staged changes. Jangan membersihkan
historical untracked artifacts.

Berhenti dan laporkan kalimat tepat:

`STOPPED AT INDEPENDENT RE-REVIEW GATE - NO COMMIT/PUSH/PR/DEPLOY`
```

## Reviewer Handoff Setelah Eksekusi

Gunakan Reviewer independen dan laporan review yang sama. Reviewer wajib mengulang
seluruh gate R0-R10, memeriksa migration kedua dan approval evidence, serta memberi
verdict `APPROVED FOR EXPLICIT GIT PACKAGING` hanya bila source, PostgreSQL, provider,
browser, authority, PII, quality sampling, concurrency, dan cleanup evidence lulus.

## Confidence

Confidence Prompt Architect: **96%**.

Dasar:

- seluruh review dan dirty source branch diperiksa;
- schema existing menunjukkan TP belum normalized dan `AiGeneration` dapat direuse;
- stable AI item key plus database uniqueness menutup retry/concurrency yang tidak
  diselesaikan oleh `aiGenerationId` saja;
- provider OpenAI/Ollama, strict output, PII routing, dan audit Wave 3 tersedia untuk
  dipakai ulang tanpa mengaktifkan endpoint legacy.

## Risk Notes

- Cross-schema relation Prisma harus dibuktikan dengan validate/generate dan PostgreSQL;
  bila Prisma tidak dapat mengekspresikannya, gunakan raw SQL FK plus scalar field dan
  dokumentasikan trade-off, bukan menghapus provenance.
- `AiGeneration.output` existing dipotong pada jalur Modul Ajar. Question Draft tidak
  boleh bergantung pada payload terpotong; simpan bounded strict draft secara utuh pada
  jalur baru tanpa mengubah behavior Modul Ajar secara tidak sengaja.
- Production readiness tetap terpisah dari source/re-review approval. Prompt ini tidak
  memberi izin Git packaging, staging promotion, atau production mutation.
