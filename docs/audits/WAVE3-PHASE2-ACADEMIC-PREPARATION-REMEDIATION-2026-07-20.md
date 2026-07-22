# Wave 3 Phase 2 Academic Preparation Remediation

Date: 2026-07-20
Branch: `feat/wave3-phase2-academic-preparation`
Base: `develop` (`b39caf2`, post-PR #374 SPMB staging QA follow-up)
Status: Code complete; ready for reviewer handoff.

## Source Documents Read

- `AGENTS.md` (outer DIIS workspace)
- `docs/AI_CONTEXT.md`
- `smart-ai-school/AGENTS.md`
- `smart-ai-school/docs/decision-log.md`
- `smart-ai-school/docs/architecture/academic-lifecycle.md` §7 (Fase 2 — Persiapan Akademik)
- `smart-ai-school/docs/audits/WAVE0-STABILIZATION-ACCEPTANCE-CONTRACT-2026-07-16.md`
- `smart-ai-school/docs/audits/PHASE2-COMPREHENSIVE-AUDIT-2026-07-15.md`
- `smart-ai-school/docs/audits/WAVE1-RBAC-OWNERSHIP-PRIVACY-REMEDIATION-2026-07-16.md`
- `smart-ai-school/docs/audits/WAVE2-PHASE0-1-SETUP-ENROLLMENT-REMEDIATION-2026-07-16.md`
- `smart-ai-school/docs/audits/PROMPT-ARCHITECT-WAVE3-PHASE2-ACADEMIC-PREPARATION-2026-07-20.md`

## Plan, Critique, Fixed Plan

The fixed plan applied (per the Prompt Architect's mandated process):

1. **W3-07 (Asia/Jakarta date)** — completed first as it was the smallest and most foundational.
2. **W3-01 (Modul Ajar body schema parity)** — Zod DTO change only (no Prisma schema); prerequisite for W3-02 and W3-03 which depend on the new fields existing.
3. **W3-04 (WAKA one-step reviewer)** — Director decision point resolved with one-step consistent policy; two-step deferred (would require Prisma enum change = ASK FIRST).
4. **W3-05 (PII stripping on AI egress)** — applied existing `stripPiiForLlm` utility to all four `AiGenerateService` methods; audit record stores redacted prompt.
5. **W3-06 (RPP/LMS ownership validation)** — TeachingAssignment validation for GURU create/update RPP; RPP ownership check in LMS manual create; reviewer bypass for KS/SA/WAKA.
6. **W3-02 (AI step generation field mapping)** — each step now maps output to specific body field(s); `Generate Semua` counter only increments when body actually changes.
7. **W3-03 (Real Simpan Draft)** — replaced `setTimeout(800)` fake with `createRpp/updateRpp(submit=false)`; badge state machine dirty/saving/saved/error.

Plan critique adjustments applied:
- **W3-01:** No shared type to `packages/types` (deferred to Wave 8 polish).
- **W3-04:** One-step fallback chosen; two-step documented as deferred.
- **W3-05:** Always redacted audit storage; no dual-storage.
- **W3-06:** `classId + subject + academicYear` required for GURU; no classless RPP for now.
- **Browser QA:** Deferred until staging window is free (SPMB QA priority).

## Closed Findings

### W3-01 (P0) — Modul Ajar Body Schema Parity
**Status:** CLOSED.
**Files:**
- `apps/api/src/rpp/dto/rpp.dto.ts` — `ModulAjarBodySchema` extended with `kegiatan[].pendahuluan/inti/penutup/diferensiasi`, `asesmenDiagnostik/Formatif/Sumatif`, `refleksiGuru/Siswa`, `lampiranUrl`, `durasiMenit`.
- `apps/api/src/__tests__/rpp.spec.ts` — round-trip test asserts all rich fields survive POST → read.

### W3-02 (P0) — AI Step Generation Field Mapping
**Status:** CLOSED (with P1 + P2 polish fixes included).
**Files:**
- `apps/web/src/app/dashboard/akademik/_components/ModulAjarForm.tsx` — `aiGenerateStep()` step config table maps each step output to specific body field(s):
  - Step 2 (CP/TP): parse CP text + TP list (numbered lines → array)
  - Step 4 (Profil): match DIMENSI labels + store uraian
  - Step 5 (Sarana): split first paragraph → sarana, rest → target
  - Step 6 (Kegiatan): write to `kegiatan[0].inti`
  - Step 7 (Asesmen): detect Diagnostik/Formatif/Sumatif headers → split
  - Step 8 (Remedial): detect Pengayaan/Remedial headers → split
  - Step 9 (Refleksi): detect Guru/Siswa headers → split
  - Step 10 (Lampiran): write to `lampiran`
- `handleGenerateSemua` counter only increments when body actually mutates.
- **P1 polish fix:** `aiGenerateStep()` return type changed from `Promise<void>` to `Promise<boolean>`. Each `apply()` function returns `mutated: boolean`. Previous version captured `JSON.stringify(body)` from a stale React render closure that always reported "no change". Closure bug resolved.
- **P2 polish fix:** single-step `aiGenerate()` now branches toast based on `mutated` return value. Previously always showed "berhasil di-generate AI" even when no field was actually written. Three outcomes now distinguished: (a) `mutated=true` → sukses toast; (b) `mutated=false` → "AI tidak menghasilkan perubahan. Coba generate ulang atau sunting manual."; (c) thrown error → error toast with 429 rate-limit handling preserved.

### W3-03 (P0) — Real Simpan Draft Server Save
**Status:** CLOSED.
**Files:**
- `apps/web/src/app/dashboard/akademik/_components/ModulAjarForm.tsx` — `saveDraft()` now calls `createRpp/updateRpp(submit=false)` via `startTransition`. Badge state machine: `dirty` (default for new form, or after any local edit) → `saving` → `saved` (server confirmed) or `error`. Replaces the `setTimeout(800)` fake.

### W3-04 (P1) — WAKA_KURIKULUM One-Step Reviewer
**Status:** CLOSED with documented deferral.
**Policy decision (Director, 2026-07-20):** One-step consistent — WAKA_KURIKULUM can complete review (submitted → approved|revision) the same as KS. Two-step (WAKA initial check → KS final approval) deferred because it would require a new Prisma enum value `reviewed` in `RppStatus` (= schema change = ASK FIRST). Deferred item documented in service comment header.
**Files:**
- `apps/api/src/rpp/rpp.service.ts` — `REVIEWER_ROLES` now includes `WAKA_KURIKULUM`.
- `apps/web/src/app/dashboard/rpp/page.tsx` — page redirect now allows `WAKA_KURIKULUM`.

### W3-05 (P1) — PII Stripping on AI Egress + Redacted Audit
**Status:** CLOSED.
**Files:**
- `apps/api/src/ai/ai-generate.service.ts` — all four methods (`generateQuestions`, `generateMaterial`, `generateAtp`, `generateRppStep`) now call `stripPiiForLlm()` on the prompt before sending to gateway and before writing audit record.
- `apps/api/src/__tests__/ai-generate.spec.ts` — new test suite (4 tests) verifies email/phone/NIS/name-like content is redacted both at gateway egress and audit storage layers.

### W3-06 (P1) — RPP/LMS Ownership Validation
**Status:** CLOSED.
**Files:**
- `apps/api/src/rpp/rpp.service.ts` — new private helper `assertTeachingAssignment()` called in `create()` and `update()` for non-reviewer users. Requires `(classId, subject, academicYear)` triple to match an existing `TeachingAssignment` row.
- `apps/api/src/lms/lms.service.ts` — `create()` now: if `rppId` provided, loads RPP and requires ownership (or reviewer bypass); derives `classId/subject/academicYear` from RPP. If no `rppId`, validates `TeachingAssignment` triple.
- `apps/api/src/__tests__/rpp.spec.ts` — 3 new tests (no classId → BadRequest; unassigned triple → Forbidden; reviewer bypass).
- `apps/api/src/__tests__/lms.spec.ts` — 5 new tests (unassigned → Forbidden; missing classId → Forbidden; own RPP → derive success; other's RPP → Forbidden; missing RPP → NotFound).

### W3-07 (P1) — Teacher Attendance Asia/Jakarta Local Date
**Status:** CLOSED.
**Files:**
- `apps/api/src/teacher-attendance/teacher-attendance.service.ts` — replaced `todayUtcDate()` with `todaySchoolLocalDate()` using `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' })`. No new dependency. Applied to all 4 call sites (checkIn, checkOut, myToday, todaySummary).
- `apps/api/src/__tests__/teacher-attendance.spec.ts` — 2 new edge-case tests using `jest.useFakeTimers()` + `setSystemTime()`:
  - 00:30 WIB (17:30 UTC previous day) → records 2026-07-19 (WIB day)
  - 07:30 WIB (00:30 UTC same day) → records 2026-07-19 (same WIB day)

## Deferred / Accepted Risk

- **W3-04 two-step review** — would require Prisma enum `RppStatus: reviewed` (= schema change). Current one-step is consistent across controller/service/page/sidebar/permission seed. Two-step deferred to a future wave that bundles other schema changes (e.g., report-card return metadata).
- **W3-01 shared type** — frontend `ModulAjarBody` (guru-types.ts) and backend `ModulAjarBody` (rpp.dto.ts) are aligned by hand. A shared type in `packages/types` would prevent future drift but increases surface area; deferred to Wave 8 polish.
- **W3-06 classless RPP** — current policy requires `classId` for GURU RPP creation. If the product later defines classless/general RPP explicitly, `assertTeachingAssignment` needs an `allowClassless` parameter.
- **Browser QA** — Wave 3 has UI changes (ModulAjarForm) that cannot be fully verified by unit tests alone. Manual browser QA per the matrix in PHASE2-COMPREHENSIVE-AUDIT-2026-07-15.md must be executed on staging after this PR merges and staging is free of the SPMB browser QA work.

## Verification

Executed locally on `feat/wave3-phase2-academic-preparation`:

```powershell
npm.cmd --workspace @smk/api test -- rpp.spec.ts lms.spec.ts ai-generate.spec.ts teacher-attendance.spec.ts ai-gateway.spec.ts --runInBand --cacheDirectory=.tmp/jest-cache-wave3
npm.cmd --workspace @smk/api run type-check
npm.cmd --workspace @smk/web run type-check
npm.cmd --workspace @smk/api run lint
npm.cmd --workspace @smk/web run lint
npm.cmd --workspace @smk/api run build
```

Results:
- API focused tests: **5 suites / 69 tests passed** (rpp 14, lms 22, ai-generate 4, teacher-attendance 14, ai-gateway 15).
- API type-check: clean.
- Web type-check: clean.
- API lint: clean.
- Web lint: "No ESLint warnings or errors" (only pre-existing `next lint` deprecation/plugin warning).
- API build: clean.

Web build (`next build`) was not run in the sandbox due to known SIGBUS issues with swc on Windows sandbox — CI on the PR will produce authoritative web build evidence.

## Schema/Dependency Decisions

- **Prisma schema changes:** No.
- **Dependency additions:** No.
- **Migration generated/applied:** No.
- **Zod DTO changes:** Yes (W3-01 `ModulAjarBodySchema` extension) — explicitly allowed per the Wave 3 prompt.

## Positive Controls Preserved

These existing strengths were explicitly preserved (per Wave 3 prompt non-goals):

- RPP state machine (`draft → submitted → approved|revision`) intact; `EDITABLE_STATUSES` unchanged.
- `rpp.reviewed` event emission unchanged; `LmsEventListener` idempotency `by rppId` unchanged.
- Schedule overlap checks and DB exclusion constraint untouched.
- Teacher attendance geofence policy (`outsideGeofence` flag, not reject) untouched.
- Question bank ownership scoping untouched.

## Residual Risk

- **W3-02 markdown splitting heuristics** — the field mapping uses header-based regex splitting for multi-section outputs (asesmen, remedial, refleksi). If the AI returns content without expected headers (e.g., `Diagnostik:` vs `## Diagnostik`), the split may be imperfect and content may end up in a single field. The teacher can still manually edit. Browser QA will validate real AI output behavior.
- **W3-03 saveDraft does not auto-create new editing instance** — when Simpan Draft succeeds on a new (not-yet-persisted) RPP, the form still shows "saved" but does not switch to edit mode automatically. Closing and reopening the dialog will load the persisted draft. This matches existing UX flow (`onClose()` after save) but may need a follow-up to keep the dialog open in edit mode.
- **W3-04 Keycloak role sync** — WAKA access depends on position assignment and Keycloak role synchronization being current. If a WAKA user has not been synced, the `rpp.review` permission may not be effective despite the code change.
- **W3-06 TeachingAssignment availability** — validation requires that TeachingAssignment rows be created during Fase 0 setup. If assignments are missing (data setup incomplete), GURU cannot create RPP at all. The error message is explicit so operators know where to look.

## Recommended Next Wave

Per Wave 0 contract: **Wave 4 — Phase 3 KBM Runtime Integrity**:
- W4-01 Student main workflow (LMS detail/task/session screens, no placeholders)
- W4-02 Assessment timer server-authoritative
- W4-03 Assessment/session strict DTOs (no `z.any()`)
- W4-04 Auto-grade formatif idempotency
- W4-05 Randomized question order persistence
- W4-06 LMS progress monotonic + `locked` server-controlled
- W4-07 SSE monitor reconnect with token refresh

Wave 4 has potential ASK FIRST items: assessment source metadata and assessment snapshot storage may need Prisma schema additions. The executor should flag those before code changes.

## Manual Browser QA Matrix (Post-Merge, Post-Staging)

These scenarios MUST be executed on staging before this work is considered production-ready:

1. **GURU Modul Ajar full round-trip (W3-01/W3-03):** Login GURU → `/dashboard/akademik` → Buat Modul Ajar → Isi SEMUA wizard sections → Simpan Draft → close → refresh → reopen → all fields persist; badge "Tersimpan" only after server save.
2. **GURU AI Generate per step (W3-02):** Click Generate per step 2/4/5/6/7/8/9/10 → target field changes; Generate Semua → counter only increments when field changes.
3. **WAKA Review (W3-04):** Login WAKA_KURIKULUM → `/dashboard/rpp` opens (no redirect) → Review Sekarang → approve/revision works.
4. **WAKA negative test:** Login role without `rpp.review` → `/dashboard/rpp` redirects.
5. **GURU RPP Ownership (W3-06):** Create Modul Ajar with assigned class/subject/year → success. Try unassigned class UUID → Forbidden error.
6. **GURU LMS Link to RPP (W3-06):** Create LMS module with own `rppId` → derived metadata. Try another teacher's `rppId` → Forbidden.
7. **Teacher Attendance 00:30 WIB (W3-07):** Test at 00:30 WIB (or fixture) → check-in records current WIB date, not previous UTC date.
8. **PII in AI prompt (W3-05):** Enter email/phone in RPP context → Generate → inspect audit record in DB → prompt is redacted.

## File Change Summary

**Modified (7 files):**
- `apps/api/src/ai/ai-generate.service.ts`
- `apps/api/src/lms/lms.service.ts`
- `apps/api/src/rpp/dto/rpp.dto.ts`
- `apps/api/src/rpp/rpp.service.ts`
- `apps/api/src/teacher-attendance/teacher-attendance.service.ts`
- `apps/web/src/app/dashboard/akademik/_components/ModulAjarForm.tsx`
- `apps/web/src/app/dashboard/rpp/page.tsx`

**Modified tests (3 files):**
- `apps/api/src/__tests__/rpp.spec.ts`
- `apps/api/src/__tests__/lms.spec.ts`
- `apps/api/src/__tests__/teacher-attendance.spec.ts`

**New tests (1 file):**
- `apps/api/src/__tests__/ai-generate.spec.ts`

**No Prisma schema, dependency, migration, seed, Docker, GitHub Actions, staging, or production changes.**
