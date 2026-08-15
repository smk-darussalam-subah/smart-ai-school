# Prompt Architect - Wave 5 Phase 4 Continuous Operations

Tanggal: 2026-08-13
Status: final, source-verified Executor handoff
Supersedes: `PROMPT-ARCHITECT-WAVE5-PHASE4-CONTINUOUS-OPERATIONS-2026-08-12.md`
Repository kanonis: `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school`

## Keputusan Scope

Wave 5 menutup Phase 4 Continuous Operations di atas baseline production setelah Wave 4
Assessment Runtime dan paket Academic Operational selesai. Wave ini harus menghasilkan
satu siklus operasional yang utuh:

1. GURU mengenali siswa di bawah KKTP authoritative, menugaskan remedial dengan mesin
   Assessment Runtime yang sama, memonitor, mengoreksi, memfinalisasi, dan menugaskan
   ulang bila belum tuntas;
2. SISWA hanya mengerjakan remedial miliknya dan ORANG_TUA memonitor child aktif tanpa
   kebocoran lintas anak;
3. TU mencatat SPP sebagai `unpaid`, SA/KS menyetujui secara race-safe, dan receipt
   disiapkan secara durable tepat satu kali;
4. pengumuman dikelola berdasarkan permission efektif dan pengumuman terjadwal tidak
   terlihat atau terkirim sebelum waktu efektif;
5. AI Chat dapat digunakan oleh pemilik permission `ai.chat`, memiliki lifecycle sesi
   yang jujur, dan tidak meninggalkan sesi palsu saat provider gagal;
6. public kiosk mempertahankan kegunaan operasional sambil memperkecil exposure nama guru
   dan token.

Semua P0/P1/P2 yang terverifikasi dan masih berada pada boundary di atas diselesaikan
dalam branch yang sama. Jangan membuat Wave 5.1, placeholder, parallel engine, atau
menunda pekerjaan source satu scope ke batch berikutnya. Review, Git packaging, staging
QA, main promotion, dan production verification tetap merupakan gate yang terpisah.

## Baseline Terverifikasi

### Production saat prompt dibuat

- Wave 4 completion: PR `#484`, main SHA
  `3b42efc38c71d5c79e5fea8b168efbbbc900e6de`.
- Academic Operational promotion: PR `#498`, main/production SHA
  `005c9f5b603893729d66f086714caf1ee41df75e`.
- Production deploy run `31684183048`: success.
- Production API health: `status=ok`, database/memory checks `up`.
- Academic Operational staging runtime candidate:
  `13ebd771f422c7876636f2773104d5eaa5f8e6a3`.
- Final staging branch SHA setelah report packaging:
  `c23b0edc0e46d7717c447d73be4c5d0f1cca3900`.
- Approval protection `develop`, `staging`, dan kedua lapis protection `main` kembali
  bernilai `1` setelah promotion.

SHA di atas adalah binding audit, bukan baseline yang boleh diasumsikan tetap. Executor
wajib fetch dan memverifikasi ulang seluruh ref sebelum membuat worktree.

### Git precondition

Pada inspeksi 2026-08-13:

- `origin/main` = `005c9f5b603893729d66f086714caf1ee41df75e`;
- `origin/staging` = `c23b0edc0e46d7717c447d73be4c5d0f1cca3900`;
- `origin/develop` = `b85f8b9b386a50b4a932fce8f7e3b3c99f1c3d73`;
- `origin/develop...origin/main` = `0 7`.

Artinya `develop` tidak memuat merge commit production terbaru. Prompt ini harus
dipaketkan melalui branch berbasis `origin/main` menuju `develop`, sehingga ancestry
tersinkron sebelum Executor mulai. Executor tetap wajib membuktikan:

```powershell
git fetch origin --prune
git merge-base --is-ancestor origin/main origin/develop
git rev-list --left-right --count origin/develop...origin/main
```

Jangan membuat branch implementasi dari `develop` bila check pertama belum exit `0`.

### Dokumen wajib dibaca lengkap

1. `C:\Users\USER\Documents\Claude\Projects\DIIS\AGENTS.md`
2. `C:\Users\USER\Documents\Claude\Projects\DIIS\docs\AI_CONTEXT.md`
3. `AGENTS.md` repo jika tracked pada baseline terbaru
4. `docs/WAYS-OF-WORKING.md`
5. `docs/decision-log.md`
6. `docs/architecture/academic-lifecycle.md`
7. `docs/audits/ACADEMIC-OPERATIONAL-E2E-REMEDIATION-2026-08-12.md`
8. `docs/audits/ACADEMIC-OPERATIONAL-E2E-SOURCE-REVIEW-2026-08-13.md`
9. `docs/audits/ACADEMIC-OPERATIONAL-E2E-STAGING-BROWSER-QA-2026-08-13.md`
10. prompt ini.

Dokumen historis `academic-lifecycle-review`, `PHASE4-COMPREHENSIVE-AUDIT`, dan Wave 4
completion tidak tracked pada `origin/main@005c9f5`; gunakan hanya sebagai supplemental
context bila tersedia. Jangan menjadikannya source of truth atau mengambilnya dari
checkout kotor tanpa memverifikasi setiap klaim terhadap source current.

### Source paths minimum

- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/seed-permissions.ts`
- migration Appointment, Wave 4, dan Academic Operational terbaru
- `apps/api/src/assessment/**`, `question-bank/**`, `grade/**`, `kktp-config/**`
- `apps/api/src/finance/**`, `notification/**`, `announcements/**`
- `apps/api/src/ai/ai.controller.ts`, `ai.service.ts`, `dto/chat.dto.ts`
- `apps/api/src/public-kiosk/**`, `school-config/**`
- `apps/api/src/permissions/permissions.service.ts`
- `apps/api/src/report-cards/**`, `teaching-assignment/**`
- `apps/web/src/app/dashboard/akademik/**`
- `apps/web/src/app/dashboard/keuangan/**`, `pengumuman/**`, `ai/**`
- `apps/web/src/app/dashboard/_components/BerandaKiosk.tsx`
- `apps/web/src/app/ruang-guru/[token]/**`
- `apps/web/src/lib/dashboard-authority.ts`, `permissions.ts`, `academic.ts`
- seluruh focused test terkait.

## Temuan Terverifikasi Yang Wajib Ditutup

### P1 - Remedial belum menjadi workflow dan KKTP masih tidak konsisten

- Belum ada model/lifecycle remedial, target subset siswa, attempt lineage, due date,
  monitoring, finalization, atau child-bound read model.
- `AssessmentService.getSessionAnalysis()` masih memakai `KKTP_DEFAULT = 75`.
- Inspeksi source menemukan 71 referensi default/hardcoded KKTP pada 20 file API/web.
  Tidak semuanya bug, tetapi semua keputusan operasional ketuntasan/remedial harus membaca
  nilai authoritative per konteks, bukan angka global.
- `AssessmentSession` class-wide; remedial tidak boleh terlihat oleh nonparticipant.

### P1 - SPP approval dan receipt belum transactionally durable

- `approve()` masih `findUnique -> update -> EventEmitter`, sehingga dua approver dapat
  menang bersamaan dan proses mati setelah commit dapat kehilangan receipt handoff.
- Create DTO masih menerima status bisnis dan receipt number walau create dipaksa unpaid.
- `NotificationLog.refId` bertipe UUID, sedangkan callsite existing memakai composite
  seperti `<uuid>:ortu`, `<uuid>:status:<value>`, dan `<uuid>:<timestamp>`.
- Recipient kosong masih dapat mencapai listener; payment parent branch menggunakan
  composite `refId` yang tidak kompatibel dengan kolom.
- UI masih mengambil snapshot maksimum 100 dan melakukan pencarian/filter lokal.
- Historical `BENDAHARA finance.approve` bertentangan dengan matriks SA/KS final.

### P1 - Announcement scheduled delivery dan authority drift

- Controller/service/UI masih hardcoded SA/KS walau permission dan Appointment dapat
  memberi `announcement.manage` kepada TU/WAKA yang sah.
- Future `scheduledAt` langsung memancarkan `announcement.published`, sehingga urgent atau
  darurat dapat diproses sebelum waktu efektif.
- UI date-only kehilangan jam-menit WIB dan manager list terbatas pada 100 row client-side.
- Belum ada claim DB yang membuktikan restart/multi-instance/exactly-once.

### P1 - AI Chat UI dan session lifecycle tidak sesuai backend

- API memakai `ai.chat`, tetapi halaman hanya menerima SUPER_ADMIN.
- History backend berbentuk `{ sessionId, messages }`; client memeriksa array langsung.
- Client tidak menolak `res.ok=false`, sehingga provider failure dapat menjadi jawaban
  kosong/palsu.
- Session dibuat sebelum provider berhasil; kegagalan dapat meninggalkan sesi kosong.
- Belum ada session list/new/delete; `ChatSession.updatedAt` tidak dipastikan bergerak.
- `BerandaKiosk` mengirim `?q=...`, tetapi composer tidak membaca query tersebut.

### P2 - Public kiosk privacy contract belum lengkap

- API publik masih mengirim nama guru penuh.
- Next meneruskan token ke API melalui query string; token berisiko masuk access log.
- Halaman belum mengunci noindex/nofollow/no-referrer secara eksplisit.
- Prosedur rotasi berkala/insiden belum menjadi kontrak teruji.

### P2 - Operational list/error/mobile UX

- SPP dan pengumuman tidak memberi server-side search/filter/pagination yang utuh.
- Beberapa mutation path masih dapat berakhir tanpa feedback sukses/gagal stabil.
- Workflow baru wajib usable pada 1440x900 dan 390x844 tanpa page-level overflow.

## Regression Contract Academic Operational

Wave 5 tidak boleh merusak baseline yang baru dipromosikan:

1. TeachingAssignment adalah konteks mengajar authoritative; Schedule hanya penempatan
   waktu. GURU tanpa TeachingAssignment tidak boleh mendapat akses authoring/remedial
   hanya karena mempunyai schedule atau role GURU.
2. Appointment adalah source hak jabatan. Resolver tetap fail-closed pada zero/multiple
   active academic year, user/staff terhapus, position/major nonaktif, status/rentang
   tidak valid, atau cache stale.
3. Matriks Rapor final tetap:
   - wali kelas: generate dan catatan;
   - WAKA_KURIKULUM: check/return;
   - KS: publish/distribute;
   - TU: distribute;
   - SA/SA+GURU: bantuan KS untuk publish/distribute dan recovery administratif, bukan
     generate/catatan/check/return.
4. Aksi bantuan SA mencatat identitas SA asli.
5. Rapor resmi membaca satu snapshot historis; family hanya melihat distributed.
   Remedial tidak boleh mengubah rapor checked/published/distributed secara diam-diam.
6. Catatan wali tetap memakai optimistic concurrency dan 409 pada stale write.
7. Kegiatan Kelas media tetap private/authenticated dan scope kelas/appointment tetap
   berlaku. Wave 5 tidak mengubah media provisioning.
8. Modul Ajar tetap dua tahap WAKA recommendation -> KS final decision.
9. Wave 4 Question Bank, immutable active/attempted snapshots, answer-key privacy,
   grading, Grade idempotency, AI provenance, dan assessment outbox tetap utuh.
10. Own/child scope dan multi-child selector tetap fail-closed tanpa fallback anak pertama.

## Keputusan Arsitektur

### Remedial: dua pintu masuk, satu mesin

- Entry point 1: `Penilaian > Analisis Hasil > Buat Remedial`.
- Entry point 2: tab `Penilaian > Remedial` untuk registry dan create.
- Keduanya memakai satu API/domain, canonical Question Bank, AssessmentSession snapshot,
  player, autosave, timer, response, correction, dan grading engine Wave 4.
- Candidate resolver mengikat TeachingAssignment valid untuk tahun ajaran aktif, kelas
  aktif, teacher/user yang masih aktif dan tidak terhapus, mapel, semester, source
  Grade/session, dan KKTP authoritative. Model TeachingAssignment tidak memiliki flag
  `isActive`; jangan mengarang flag atau memakai istilah itu sebagai shortcut validasi.
- Source assessment memakai snapshot `LmsModule.kktp`; Grade manual memakai exact
  `KktpConfig(subject, academicYear, semester)` dan published LmsModule context yang sah.
- Tidak ada silent fallback 75 pada keputusan remedial. Missing configuration adalah
  blocked state yang actionable.
- Assignment lifecycle: `draft -> active -> completed`; `draft|active -> cancelled`.
- Participant lifecycle: `assigned -> in_progress -> submitted -> passed|needs_retry`;
  retry membuat successor attempt dan mempertahankan lineage.
- Finalization oleh guru: raw score tidak hilang; lulus mengubah source Grade menjadi tepat
  KKTP, belum lulus tidak mengubah Grade. Finalisasi tidak boleh menurunkan nilai.
- Semua transition memakai conditional write/CAS dan 409 pada stale/concurrent request.

### Notification durability

- Gunakan `NotificationLog`, BullMQ, dan recovery worker existing; jangan menambah queue
  atau scheduler dependency.
- Business transition dan pending log wajib berada dalam transaksi yang sama bila delivery
  merupakan konsekuensi wajib.
- Enqueue setelah commit memakai deterministic job ID. Pending recovery harus menutup
  crash gap tanpa mengulang business transition.
- Recipient kosong dilarang; nomor dinormalisasi/dideduplikasi sebelum insert.
- Announcement due scanner boleh mengikuti pola outbox/interval existing, tetapi source of
  truth dan atomic claim tetap PostgreSQL.

### Authority final

- Announcement read: `announcement.read`; mutation: effective `announcement.manage`;
  hard delete: `announcement.delete` SA-only.
- Finance record: SA/TU + `finance.create`; approve: SA/KS + `finance.approve`.
- AI Chat: `ai.chat`; default grant SA wildcard, SISWA, dan GURU. Role lain hanya melalui
  explicit effective permission; `grant=false` tetap menang.
- Remedial manage: GURU hanya pada TeachingAssignment miliknya. SISWA own read/attempt,
  ORANG_TUA child read, SA/KS/WAKA_KURIKULUM oversight read tanpa mengambil alih
  pedagogical finalization.

### Public kiosk

- Default public display memakai first-name plus initial yang konsisten dan tidak mengirim
  full legal name.
- Token internal Next-to-API dikirim lewat private header atau mekanisme setara, bukan
  query API. URL public tetap opaque; no-referrer/no-store/noindex mengurangi propagation.
- Rotation membuat token lama invalid dan token baru valid; token aktual tidak pernah
  masuk report, screenshot, console, atau log evidence.

## Approval Schema Tunggal

Schema/data migration diperlukan dan **belum boleh diinferensikan sebagai disetujui**.
Executor harus meminta persetujuan satu kali sebelum edit Prisma/migration dengan teks:

> Setujui satu migration Wave 5 yang additive dan terkonsolidasi: ubah
> NotificationLog.refId UUID menjadi varchar(180) dengan cast aman; tambah
> Announcement.broadcastQueuedAt dan due-scan index; tambah purpose regular/remedial pada
> AssessmentSession; tambah RemedialAssignment dan RemedialParticipant beserta relation,
> lifecycle timestamps, retry lineage, score/KKTP snapshots, check/index/unique constraints;
> serta permission/data correction untuk remedial, TU announcement.manage, GURU ai.chat,
> WAKA_KURIKULUM remedial oversight, dan pencabutan BENDAHARA finance.approve. Setujui
> policy nilai: remedial lulus memperbarui source Grade menjadi tepat KKTP setelah
> finalisasi guru; remedial belum lulus tidak mengubah Grade. Tidak ada dependency baru,
> migration lama tidak diedit, dan data Grade legacy tidak ditebak.

Sebelum jawaban, Executor tetap mengerjakan inventory, plan, non-schema fixes independen,
test design, dan draft SQL. Setelah approval, pekerjaan dilanjutkan sampai source lengkap
dalam branch yang sama; approval bukan alasan membuat batch lanjutan.

## Draft Prompt

Implementasikan remedial, perbaiki SPP, pengumuman, AI Chat, dan kiosk. Tambahkan schema,
UI, tests, dan report.

## Kritik Draft

Draft tersebut ditolak karena tidak mengunci baseline production, TeachingAssignment,
Appointment, matriks Rapor, ownership participant, KKTP authority, score policy, crash
gap NotificationLog, race SPP, scheduled claim, AI orphan session, public token/name
privacy, migration proof, browser QA, maupun stop gate. Draft juga memungkinkan engine
remedial kedua dan pekerjaan tertunda ke wave kecil berikutnya.

## Prompt Final Untuk Executor

Salin seluruh blok berikut ke sesi Executor baru.

````md
Anda adalah Senior Full-Stack Executor untuk DIIS `smart-ai-school`.

### Misi

Selesaikan **Wave 5 - Phase 4 Continuous Operations** secara penuh dalam satu branch:
remedial berbasis Assessment Runtime Wave 4, SPP approval/receipt durability, scheduled
announcement, AI Chat operability, public kiosk privacy, authorization, migration,
automated proof, local PostgreSQL proof, dan local browser QA.

Jangan commit, push, PR, merge, deploy, atau mengakses production secara mutatif sebelum
Reviewer memberi verdict `APPROVED FOR EXPLICIT GIT PACKAGING`.

### Gate 0 - Baseline dan plan

1. Baca lengkap dokumen, source paths, temuan, keputusan arsitektur, approval schema,
   non-goals, dan regression contract pada
   `docs/audits/PROMPT-ARCHITECT-WAVE5-PHASE4-CONTINUOUS-OPERATIONS-2026-08-13.md`.
2. Fetch/prune; inspect status, refs, log, merge-base, dan ahead/behind tanpa mengubah file.
3. Buktikan `origin/develop` memuat `origin/main`. Jika gagal, berhenti sebelum branch dan
   minta authorized synchronization; jangan force-push atau merge protected branch sendiri.
4. Buat worktree/branch bersih dari latest `origin/develop`, misalnya
   `feat/wave5-phase4-continuous-operations-20260813`.
5. Inventarisasi UI -> action -> controller -> service -> transaction -> DB -> queue ->
   reload state untuk kelima domain.
6. Buat plan, kritik plan terhadap scope/security/privacy/concurrency/UX/tests, perbaiki
   plan, lalu langsung implementasi. Jangan berhenti pada proposal.
7. Jangan membersihkan untracked historical artifacts, memakai `git add .`/`git add -A`,
   hard reset, atau mengubah file pengguna yang tidak relevan.

### Gate 1 - Schema approval

Kirim satu approval request persis dari bagian `Approval Schema Tunggal`. Jangan edit
Prisma/migration/permission data sebelum approval. Setelah approval, gunakan satu migration
baru additive; jangan edit migration deployed, jangan `db push`, jangan menambah dependency.

### A - Remedial domain dan authority

1. Implement model, enum, relation, FK, check/index/unique constraints dan permission yang
   disetujui. Reuse AssessmentSession/Response, Question Bank, snapshots, player, grading,
   Grade idempotency, dan outbox Wave 4.
2. Candidate resolver hanya memberi Grade di bawah KKTP dalam TeachingAssignment GURU
   yang cocok dengan active academic year, kelas aktif, serta teacher/user valid dan tidak
   terhapus, untuk class/subject/semester yang sama dan tanpa open participant lain.
3. Hilangkan hardcoded 75 dari seluruh keputusan operasional yang menentukan
   ketuntasan/remedial. API mengirim KKTP authoritative; UI hanya merender. Jangan mengubah
   snapshot Rapor historis atau field input Modul Ajar yang memang menyimpan nilai.
4. Tambahkan strict Zod API untuk paginated list/detail/candidates/create/update/activate/
   cancel/finalize/retry. Validasi UUID, bounded arrays/text, tanggal, dan cross-field.
5. Tolak forged student/Grade/question/module/class/assignment/period/response/attempt.
6. Aktivasi atomik menyiapkan session target-only dan pending notification logs. Hanya
   peserta terpilih dapat list/start/autosave/submit; nonparticipant tidak mendapat metadata.
7. Objective auto-score; mixed/essay menunggu koreksi guru. Finalize mengunci participant
   dan Grade, menerapkan policy nilai, mencatat aktor, menyiapkan notifikasi, dan 409 pada
   duplicate/concurrent/stale.
8. Retry hanya dari `needs_retry`, increment attempt atomik, preserve lineage, dan tidak
   membuat dua attempt terbuka. Cancel tidak menghapus history.
9. Finalization 409 bila matching Rapor checked/published/distributed. Draft boleh refresh
   hanya melalui shared server method dan harus teruji konsisten.
10. Due reminder sekitar 24 jam memakai DB-driven idempotent scanner; reschedule
    supersede reminder lama. Notification assignment/outcome tidak memuat raw score.

### B - Remedial UI/UX

1. Pertahankan `Penilaian`/Gradebook. Gunakan dua entry point, satu workflow: CTA analisis
   dan tab Remedial menuju domain/wizard yang sama.
2. Reuse Question Bank picker/quick-create dan canonical IDs. Session snapshot tetap
   immutable; answer key tidak menjadi client-authoritative state.
3. Wizard: `Sumber & Peserta -> Soal -> Jadwal -> Periksa & Tugaskan`; state bertahan saat
   maju/mundur/picker, default tidak memilih seluruh siswa.
4. Tampilkan source score, KKTP, attempt, eligibility reason, due date, status koreksi,
   pass/retry, search/filter/pagination server-side, dan aksi yang sesuai state.
5. SISWA memakai player existing. ORANG_TUA mendapat child-bound read-only status tanpa
   answer/key/rubric/raw score; switch child tidak fallback ke anak pertama.
6. Ikuti Tailwind/shadcn/Lucide existing, compact operational layout, semantic labels,
   keyboard/focus/reduced-motion, stable dimensions, mobile sheet/list, tidak ada nested
   interactive control atau page-level overflow 390 px.

### C - Finance SPP

1. Create DTO tidak menerima status/receipt; create selalu unpaid tanpa notification.
2. Approval memakai conditional transactional one-winner: concurrent approver menghasilkan
   satu sukses, satu 409, satu receipt, satu set pending logs.
3. Receipt number deterministic/unique server-side, max 50, tanpa `count()+1` race.
4. Transaksi approval hanya membuat log untuk nomor student/parent yang normalized,
   nonempty, unique; gunakan payment UUID yang sama dan recipient sebagai bagian dedupe.
5. Enqueue setelah commit; buktikan recovery pending log menutup queue/crash gap.
6. Selaraskan bounded string `refId` dan seluruh existing composite callsite; proof dengan
   PostgreSQL, bukan mock-only.
7. Tegakkan SA/TU record, SA/KS approve, cabut stale BENDAHARA grant, dan pastikan UI
   memakai effective permission tanpa tombol yang pasti 403.
8. Implement server-side search nama/NIS, filter periode/status/student/class yang masuk
   akal, pagination/total, dan ownership sebelum filter user.
9. UI memakai student picker, current month/year WIB, review/confirmation, pending state,
   success/error/409 jujur; jangan tampilkan raw UUID/Prisma error.

### D - Announcement

1. Gunakan effective `announcement.manage`, bukan hardcoded manager role; delete tetap
   `announcement.delete` SA-only. Test TU, active/future/expired/suspended Appointment,
   inactive scope, multiple active year, dan grant=false.
2. Draft editable; immediate publish langsung efektif; future publish menjadi Terjadwal,
   hidden dari audience, dan tidak membuat required delivery sebelum due.
3. UI `datetime-local` dengan label WIB; backend simpan UTC dan validasi minute precision.
4. Implement DB-driven atomic due claim + pending logs + `broadcastQueuedAt`; exactly once
   pada dua instance, restart, retry, reschedule, archive-before-due, zero recipient.
5. Ordinary announcement tidak broadcast WA; urgent/darurat hanya ke normalized audience.
6. Gunakan server search/filter/status/category/pagination dan feedback mutation stabil.

### E - AI Chat

1. Gate page/API/control dengan effective `ai.chat`; GURU dan SISWA sesuai permission,
   explicit deny tetap menolak. Jangan memberi SA browse-all chat user.
2. Implement own-scoped paginated session list, history, new, continue, delete confirmation.
3. New session baru dibuat setelah provider sukses; create session + two messages atomik.
   Existing session diverifikasi ownership sebelum provider call dan `updatedAt` disentuh
   saat save.
4. Provider/embed/RAG failure tidak membuat orphan/empty assistant/false success; return
   stable sanitized error, pertahankan pertanyaan, dan sediakan retry.
5. Fix `{ messages }`, `res.ok`, stale localStorage, duplicate send/loading race, stable
   message key, abort/unmount, serta `?q=` sebagai prefill tanpa auto-send.
6. Preserve PII-local routing, cloud sanitization, published-only knowledge, source labels,
   throttling, dan no secret/PII log.
7. Desktop history rail dan mobile sheet; Enter kirim, Shift+Enter baris baru, keyboard
   focus, long-text wrap, empty/error/loading states.

### F - Public kiosk

1. Transform nama guru ke first-name + initial secara server-side pada public payload.
2. Pindahkan transport token Next-to-API ke private header/equivalent; jangan menaruh token
   pada query API atau evidence.
3. Tambah noindex/nofollow, no-referrer, no-store, dan security headers yang relevan.
4. Salah/token lama memberi generic invalid state tanpa echo. Buktikan rotation
   old-invalid/new-valid dan dokumentasikan prosedur tanpa token aktual.
5. Preserve refresh/fullscreen/schedule/agenda; tidak ada student PII atau row attendance.

### G - Automated dan PostgreSQL gates

API tests wajib mencakup KKTP non-75/missing; TeachingAssignment ownership; forged IDs;
participant-only list/start/autosave/submit; objective/mixed/essay; pass/fail/retry/cancel;
Rapor status block; concurrent activate/finalize/retry; reminder reschedule; SPP one-winner,
receipt/log/recovery; announcement effective permission/no-early-send/two-worker claim;
AI cross-owner/provider failure/no orphan/ordering/PII; kiosk transform/header/rotation;
dan regression Academic Operational/Wave 4.

Web tests wajib mencakup shared remedial entry points/wizard/player, parent switching,
finance/announcement server pagination dan errors, AI session/history/prefill/retry,
permission negatives, accessible focus, nested control, dan mobile overflow.

Minimal checks dari repo root:

```powershell
npm.cmd --workspace @smk/api run test -- --runInBand --cacheDirectory=.tmp/jest-cache-wave5
npm.cmd --workspace @smk/web run test -- --runInBand
npm.cmd --workspace @smk/api run type-check
npm.cmd --workspace @smk/web run type-check
npm.cmd --workspace @smk/database run type-check
npm.cmd --workspace @smk/types run type-check
npm.cmd --workspace @smk/api run lint
npm.cmd --workspace @smk/web run lint
npm.cmd --workspace @smk/api run build
npm.cmd --workspace @smk/web run build
```
````

Jalankan focused tests terlebih dahulu dan laporkan exact suites/tests. PostgreSQL disposable
copy wajib membuktikan Prisma validate/generate, pre/post PII-minimal counts, migrate deploy,
columns/enums/FK/check/index/unique, actual concurrent transactions, migration idempotency,
serta rollback melalui snapshot/restore. Dilarang memakai staging live, production, real
student data, atau `db push`.

### H - Local browser QA

Gunakan dummy PII-safe dan notification log provider. QA 1440x900 dan 390x844:

1. GURU dengan TeachingAssignment membuat remedial dari analisis KKTP non-75 dan registry,
   memilih dua peserta dan canonical questions, lalu activate.
2. Peserta start/autosave/reload/resume/submit; nonparticipant sekelas ditolak pada UI,
   direct URL, dan API.
3. GURU koreksi mixed essay, finalisasi pass/fail, retry, dan verifikasi Grade/lineage.
4. ORANG_TUA dua anak switch child tanpa leakage; notifications tepat satu dan tanpa score.
5. TU record SPP; SA/KS concurrent approve: satu success, satu 409, satu receipt/log set.
6. Finance row di luar 100 pertama dapat dicari.
7. TU dan active WAKA membuat urgent future announcement; tidak terlihat/terkirim dini,
   due exactly once; reschedule/archive/ordinary cases benar.
8. GURU/SISWA memakai AI Chat: prefill, new/switch/delete, refresh history, provider
   failure/retry, explicit denied override.
9. Kiosk incognito: privacy-safe teacher name, no student PII, noindex/no-referrer,
   old token invalid setelah rotation.
10. Periksa responsive, focus, reduced motion, console/network, token/phone/secret/answer-key/
    NISN/PII log. Screenshot harus redacted dan tidak boleh memuat token/PII.

### I - Self-review, report, stop

Trace setiap aksi UI ke API/transaction/DB/queue/reload. Cari dan perbaiki seluruh P0/P1/P2
satu scope: auth bypass, cross-child/class/session leak, answer exposure, unbounded query,
hardcoded role/KKTP/date, swallowed error, fire-and-forget required effect, race, duplicate
job, empty recipient, raw Prisma error, token/PII log. Ulangi gates setelah perbaikan.

Buat:
`docs/audits/WAVE5-PHASE4-CONTINUOUS-OPERATIONS-REMEDIATION-2026-08-13.md`

Report wajib memuat base SHA/ancestry, finding closure matrix, schema approval/migration,
state/authority/ownership/score contracts, transaction/concurrency/recovery proof, exact
test/build counts, PostgreSQL pre/post/index/restore, browser matrix/evidence, privacy log
scan, explicit changed-file list, dan residual hanya external gate/non-goal.

Terakhir jalankan status, diff stat, `git diff --check`, dan cached diff check. Pastikan
tidak ada staged changes. Berhenti pada Reviewer gate dan akhiri dengan:

`STOPPED AT REVIEW GATE - NO COMMIT/PUSH/PR/DEPLOY`

```

## Non-Goals Terkunci

- Tidak membuat assessment editor/player/Question Bank kedua.
- Tidak membuat tariff master, bulk billing, payment gateway, accounting, refund, atau
  waived workflow baru.
- Tidak membuat notification center atau queue/scheduler kedua.
- Tidak mengubah provider/prompt Modul Ajar/AI Question provenance kecuali regression
  langsung Wave 5.
- Tidak membuat AI auto-remedial atau auto-select peserta tanpa konfirmasi guru.
- Tidak mengubah pipeline actor Rapor, snapshot resmi, media Kegiatan, atau lifecycle RPP.
- Tidak menambah base role atau mengembalikan jabatan ke Keycloak.
- Tidak mengubah Docker, infrastructure, secret, staging, atau production pada source run.

## Self-Critique Prompt Final

Checklist hasil self-review Prompt Architect:

- Baseline mengacu production terbaru dan memisahkan Wave 4 dari Academic Operational: ya.
- Main/develop ancestry menjadi precondition, bukan asumsi: ya.
- Semua temuan lama diverifikasi ulang terhadap source current: ya.
- Temuan tambahan KKTP lintas UI dimasukkan tanpa merusak snapshot Rapor: ya.
- TeachingAssignment, Appointment fail-closed, matriks SA Rapor, dan privacy media menjadi
  regression contract: ya.
- Schema dan score policy meminta approval eksplisit satu kali: ya.
- Satu mesin authoring/player, ownership dan answer privacy dikunci: ya.
- Concurrency, crash recovery, PostgreSQL, browser desktop/mobile, dan negative matrix
  mempunyai acceptance proof: ya.
- Tidak ada dependency, production mutation, atau implicit Git delivery: ya.
- Executor diwajibkan menyelesaikan seluruh same-scope finding sebelum Reviewer: ya.

## Confidence Dan Risiko

Confidence Prompt Architect: **97%**.

Risiko utama yang tetap harus dibuktikan Executor:

1. migration `NotificationLog.refId` dan remedial constraints pada PostgreSQL nyata;
2. score policy dan interaksi Grade dengan Rapor draft/non-draft;
3. two-worker announcement claim serta queue recovery;
4. provider-failure AI tanpa orphan session;
5. responsive browser flow remedial yang tetap memakai shared authoring/player.

Kelima risiko tersebut tidak boleh diterima berdasarkan unit mock saja dan tidak boleh
dipindahkan ke wave berikutnya.
```
