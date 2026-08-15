# Wave 5 Phase 4 Continuous Operations - P1/P2 Closure

Tanggal: 2026-08-15
Branch: feat/wave5-phase4-continuous-operations-20260813
Worktree: C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school-wave5-continuous-operations-20260813

## Status

Status eksekutor: READY FOR REVIEWER GATE.

Tidak ada commit, push, PR, deploy, perubahan staging, perubahan production, atau shutdown mesin pada pass ini.

## Input Review

Follow-up ini menutup temuan dari:

- docs/audits/WAVE5-PHASE4-CONTINUOUS-OPERATIONS-SOURCE-REREVIEW-2026-08-15.md
- docs/audits/WAVE5-PHASE4-CONTINUOUS-OPERATIONS-P1-P2-CLOSURE-INDEPENDENT-REREVIEW-2026-08-15.md
- docs/audits/WAVE5-PHASE4-CONTINUOUS-OPERATIONS-P1-P2-CLOSURE-FINAL-REREVIEW-2026-08-15.md
- docs/audits/PROMPT-ARCHITECT-WAVE5-P1-P2-SOURCE-E2E-CLOSURE-2026-08-15.md

Temuan yang ditutup pada pass ini:

- P1: Parent remedial belum lengkap dan belum privacy-safe.
- P1: Immediate notification belum benar-benar immediate dan status handoff belum jujur.
- P1: Race closure belum tuntas untuk academic-year cutover, grade locks, draft CAS, dan matrix PostgreSQL dua koneksi.
- P2: AI Chat mounted guard dapat false setelah React Strict Mode effect replay.
- P1: Cutover lock masih salah urutan di aktivasi tahun ajaran.
- P1: Phantom notification IDs dari `createMany(skipDuplicates)` diikuti enqueue UUID usulan.
- P2: Family projection belum exact whitelist dan masih membawa status `cancelled` yang tidak mungkin muncul.
- P2: React key kartu remedial orang tua tidak unik setelah ID internal dihapus dari respons keluarga.

Temuan yang sudah tertutup pada pass sebelumnya tetap dipertahankan:

- UI SPP memakai permission resmi `finance.create`.
- Mutasi remedial hanya untuk GURU owner; SA/KS/WAKA read-only oversight.
- Resolver KKTP terpusat.
- Filter kelas Keuangan.
- Token kiosk lewat query string ditolak.

## Perbaikan Source

### Parent Remedial Privacy

- Generic remedial list tidak lagi menerima `studentId` dan tidak lagi melayani role ORANG_TUA.
- Endpoint keluarga baru `GET /assessment/remedials/family` hanya untuk ORANG_TUA dengan permission `remedial.child.read`.
- DTO family strict: `studentId` wajib UUID, field ekstra ditolak.
- Service memvalidasi selected child terhadap relasi parent sebelum query.
- Proyeksi parent memakai allowlist:
  - sesi: `title`, `type`, `status`, `subject`, `dueAt`, `academicYear`, `semester`, `participant`;
  - participant: `status`, `attemptNumber`, `outcome`.
- Field soal, opsi, jawaban, rubrik, source score, raw score, dan effective score tidak ikut dikirim.
- Field internal seperti session ID, participant ID, source Grade ID, retry lineage, dan timestamps lifecycle tidak ikut dikirim.
- Query keluarga hanya menerima status `active` dan `completed`; status `cancelled` tidak lagi menjadi kontrak respons keluarga.
- `OrtuWorkspace` menampilkan panel remedial anak terpilih dengan stale-response guard saat child switch.

### Immediate Notification Handoff

- `NotificationService.enqueueCommittedPendingLogs()` tetap fail-closed jika queue tidak siap.
- Remedial assignment, due reminder, remedial result, payment receipt, dan scheduled announcement sekarang menunggu bounded post-commit enqueue.
- Setelah `createMany({ skipDuplicates: true })`, service mengambil ulang row `NotificationLog` pending yang benar-benar tersimpan berdasarkan `(refType, refId, recipient, channel)`.
- Enqueue selalu memakai ID row database aktual, termasuk existing pending row dari request sebelumnya; UUID usulan yang tidak tersimpan tidak pernah dikirim ke queue.
- Operasi domain tetap tidak rollback setelah commit, tetapi response melaporkan status handoff:
  - `none`;
  - `queued`;
  - `pending_recovery`.
- Jika BullMQ/NotificationService gagal setelah commit, durable `NotificationLog` tetap pending dan response jujur menyatakan `pending_recovery`.

### Race Closure

- Remedial create/update/activate/cancel/finalize/retry mengambil shared academic-year cutover lock yang sama dengan appointment due activation.
- Aktivasi tahun ajaran di `SchoolConfigService` mengambil shared advisory lock sebelum membaca tahun ajaran aktif lama dan sebelum mengubah `AcademicYear.isActive` / `Semester.isActive`.
- Grade snapshot lock diambil deterministik berdasarkan key `report-grade:<student>:<class>:<year>:<semester>`.
- Question snapshot untuk remedial create/retry/update dibangun ulang di dalam transaksi.
- Draft update memakai CAS terhadap `updatedAt` yang dibaca saat request masuk. Jika transaksi harus menunggu dan row sudah berubah, request kedua menjadi 409.
- Report-card check dan remedial finalize memakai lock grade-snapshot yang sama, sehingga draft rapor tidak dapat disahkan dari nilai lama saat finalisasi remedial bersamaan.

### AI Chat Strict Mode

- `setupAiChatMountedGuard()` mengembalikan `mountedRef.current = true` pada setup effect.
- Cleanup tetap abort send/history controller.
- Test mengunci urutan React Strict Mode: setup, cleanup, setup ulang, lalu cleanup akhir.

### Parent Remedial Card Identity

- `RemedialOrtu` tidak lagi merakit React key dari field parsial dan fallback index.
- Helper `buildFamilyRemedialCardEntries()` membuat key dari exact public projection yang privacy-safe.
- Semua field publik yang membedakan kartu dimasukkan: tahun ajaran, semester, type, status, mapel, judul, due date, status participant, attempt number, dan outcome.
- Exact duplicate public payload diberi occurrence suffix lokal agar React key tetap unik tanpa membuka participant ID atau ID internal lain.

## PostgreSQL Disposable Proof

Environment:

- Container: `diis-wave5-pg`
- Image: `pgvector/pgvector:pg16`
- Database URL: `postgresql://diis:diis@localhost:55435/diis_wave5?schema=public`

Migration proof:

```text
prisma migrate deploy --schema packages/database/prisma/schema.prisma
43/43 migrations applied successfully
```

Initial runtime matrix for race/lifecycle proof:

```json
{
  "createRace": {
    "fulfilled": 1,
    "rejected": 1,
    "participantCount": 1,
    "sessionCount": 1
  },
  "twoDraftUpdates": {
    "fulfilled": 1,
    "rejected": 1
  },
  "cancelUpdate": {
    "updateAfterCancel": "ConflictException",
    "updateThenCancelStatus": "cancelled"
  },
  "reportFinalize": {
    "finalizeAfterCheck": "ConflictException",
    "checkAfterFinalize": "ConflictException"
  },
  "cutoverCreate": {
    "beforeReleaseParticipants": 0,
    "blockedMs": 664
  },
  "parentFamilyProjection": "superseded by final exact-whitelist proof below",
  "notificationEnqueueCalls": 1
}
```

Final targeted PostgreSQL proof for reviewer follow-up:

```json
{
  "cutoverLock": {
    "activeWhileBlocked": "2026/2027",
    "activeAfterRelease": "2027/2028"
  },
  "phantomNotification": {
    "existingLogId": "2549bc25-4e93-4a3b-a4b6-ef34089b5493",
    "enqueuedIds": [
      "2549bc25-4e93-4a3b-a4b6-ef34089b5493"
    ],
    "handoff": {
      "status": "queued",
      "requestedCount": 1,
      "queuedCount": 1
    }
  },
  "familyProjection": {
    "total": 1,
    "itemKeys": [
      "title",
      "type",
      "status",
      "subject",
      "dueAt",
      "academicYear",
      "semester",
      "participant"
    ],
    "participantKeys": [
      "status",
      "attemptNumber",
      "outcome"
    ]
  }
}
```

Interpretasi:

- Dua create remedial paralel untuk source Grade yang sama menghasilkan tepat satu sesi dan satu participant.
- Dua update draft paralel menghasilkan satu sukses dan satu reject.
- Update setelah cancel menghasilkan `ConflictException`.
- Cancel setelah edit draft menghasilkan status final `cancelled`.
- Rapor check sebelum finalize menahan finalisasi remedial.
- Finalisasi remedial sebelum rapor check menahan pengesahan rapor dari draft lama.
- Create remedial tertahan oleh shared cutover lock; sebelum lock dilepas belum ada participant baru.
- Aktivasi tahun ajaran tertahan oleh shared cutover lock sebelum tahun aktif lama berubah.
- Existing pending notification row langsung diantrekan memakai ID aktual dari database, bukan UUID usulan.
- Parent remedial projection hanya mengandung exact whitelist aman dan tidak memuat ID internal, timestamps lifecycle, materi soal, atau nilai.
- Immediate notification handoff terpanggil setelah commit dan melaporkan status yang sesuai.

Cleanup proof:

- Container disposable `diis-wave5-pg` sudah dihapus.
- Script proof sementara `.tmp/wave5-p1p2-postgres-matrix.ts` sudah dihapus.
- Script proof sementara `.tmp/wave5-final-followup-postgres.ts` sudah dihapus.
- Artefak historis `.tmp` lain tidak dibersihkan karena berada di luar scope.

## Verifikasi Otomatis

Focused API:

```text
npm.cmd --workspace apps/api test -- --runTestsByPath src/__tests__/assessment-u2.spec.ts src/__tests__/notification.spec.ts src/__tests__/finance.spec.ts src/__tests__/announcements.spec.ts src/__tests__/public-kiosk.spec.ts src/__tests__/student-dashboard.spec.ts
6 suites / 128 tests pass
```

Focused API after final reviewer follow-up:

```text
npm.cmd --workspace apps/api test -- --runTestsByPath src/__tests__/assessment-u2.spec.ts src/__tests__/notification.spec.ts src/__tests__/finance.spec.ts src/__tests__/announcements.spec.ts src/__tests__/school-config.spec.ts src/__tests__/student-dashboard.spec.ts
6 suites / 158 tests pass
```

Focused Web:

```text
npm.cmd --workspace apps/web test -- --runTestsByPath src/__tests__/wave5-continuous-operations-ui.test.ts
1 suite / 9 tests pass
```

Focused Web after final React-key follow-up:

```text
npm.cmd --workspace apps/web test -- --runTestsByPath src/__tests__/wave5-continuous-operations-ui.test.ts
1 suite / 10 tests pass
```

Prior full-suite baseline before final narrow follow-up:

```text
npm.cmd --workspace apps/api test
61 suites / 1230 tests pass

npm.cmd --workspace apps/web test
33 suites / 195 tests pass
```

Catatan: full API dan full web pass pada baseline Wave 5 sebelum follow-up terakhir. Setelah perubahan final cutover lock, phantom notification ID, dan family exact-whitelist, current evidence yang dijalankan ulang adalah focused affected suites, type-check, lint, build, Prisma validate, disposable PostgreSQL proof, dan diff checks. Full suite tidak diulang pada pass final ini.

Static gates:

```text
npm.cmd --workspace apps/api run type-check
PASS

npm.cmd --workspace apps/web run type-check
PASS

npm.cmd --workspace apps/api run lint
PASS

npm.cmd --workspace apps/web run lint
PASS
Existing warning only: next lint deprecated and Next plugin not detected.

npm.cmd --workspace apps/api run build
PASS

npm.cmd --workspace apps/web run build
PASS, 39/39 pages

DATABASE_URL=postgresql://user:pass@localhost:5432/smk_db?schema=public npx.cmd prisma validate --schema packages/database/prisma/schema.prisma
PASS

git diff --check
PASS

git diff --cached --check
PASS
```

## Files Touched For This Follow-up

Primary follow-up files:

- apps/api/src/assessment/assessment.service.ts
- apps/api/src/assessment/dto/assessment.dto.ts
- apps/api/src/assessment/remedial.controller.ts
- apps/api/src/notification/notification.service.ts
- apps/api/src/announcements/announcements.service.ts
- apps/api/src/finance/finance.service.ts
- apps/api/src/report-cards/report-cards.service.ts
- apps/api/src/__tests__/assessment-u2.spec.ts
- apps/api/src/__tests__/notification.spec.ts
- apps/api/src/__tests__/finance.spec.ts
- apps/api/src/__tests__/announcements.spec.ts
- apps/web/src/app/dashboard/ai/ai-chat-ui.ts
- apps/web/src/app/dashboard/ai/_components/AiClient.tsx
- apps/web/src/app/dashboard/akademik/_components/ortu/OrtuWorkspace.tsx
- apps/web/src/app/dashboard/akademik/_components/ortu/BerandaOrtu.tsx
- apps/web/src/app/dashboard/akademik/_components/ortu/RemedialOrtu.tsx
- apps/web/src/app/dashboard/akademik/_components/ortu/ortu-remedial-ui.ts
- apps/web/src/app/dashboard/akademik/actions.ts
- apps/web/src/__tests__/wave5-continuous-operations-ui.test.ts

Wave 5 branch still contains earlier in-scope files from the same wave. Staging must use explicit file manifest after reviewer sign-off.

## Remaining Gates

- Source reviewer re-review is required before Git packaging.
- No staging browser QA was run in this source-closure pass.
- No Git packaging, commit, push, PR, staging promotion, main promotion, production deploy, or Windows shutdown was performed.

## Reviewer Checklist

- Parent remedial uses selected-child endpoint and does not leak question/answer/rubric/score material.
- Immediate notification response distinguishes `queued` from `pending_recovery`.
- Remedial create/update race is covered by PostgreSQL matrix, not only mocks.
- Shared cutover lock blocks remedial create while appointment due activation lock is held.
- Report-card check and remedial finalization cannot validate stale grade state.
- AI Chat mounted guard survives React Strict Mode effect replay.
- Parent remedial cards have unique React keys without reintroducing internal IDs.
