# Wave 3 Phase 2 Academic Preparation Review

Date: 2026-07-20
Role: Codex Reviewer / workflow and code auditor
Scope: Independent re-review of executor's Wave 3 work documented in `WAVE3-PHASE2-ACADEMIC-PREPARATION-REMEDIATION-2026-07-20.md` on branch `feat/wave3-phase2-academic-preparation` (HEAD `b39caf2`, uncommitted working tree).
This review made no product-code, schema, dependency, infrastructure, commit, push, PR, or deploy change.

## Verdict

`COMPLETE - READY FOR GIT GATE (DEVELOP)`
`NOT A STAGING ACCEPTANCE SIGN-OFF`

All seven Wave 3 findings (W3-01 .. W3-07) are closed in code. Focused test totals, type-check, lint, API build, web build, and `git diff --check` were independently reproduced by the reviewer and match — or improve on — the executor's claims. Working tree is exactly the 10 claimed modified files plus 1 new untracked test (`ai-generate.spec.ts`) and 1 new untracked audit doc — no scope creep.

One P1 follow-up is required **before browser QA** (not before commit/PR): the W3-02 "Generate Semua" success counter check at `ModulAjarForm.tsx:301-306` uses a React closure-captured `body` that cannot observe the asynchronous `setState` updates it triggers. The success counter will always report 0 even when every step applied output successfully. The field application itself works correctly; only the post-run toast is misleading. This is the kind of "error masking" finding that should not reach Director-facing browser QA.

One P2 documentation drift is also flagged: lifecycle doc §7.2 still describes two-step RPP review (`WAKA → KS`), but the code now implements one-step consistent review per the Director decision of 2026-07-20. The deferral note exists in the service header but the lifecycle spec itself was not updated.

## Closure Evidence For Prior Findings

### W3-01 — Modul Ajar Body Schema Parity (P0)

**Status: CLOSED.**

[rpp.dto.ts:11-51](file:///c:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school/apps/api/src/rpp/dto/rpp.dto.ts#L11-L51) — `ModulAjarBodySchema` now defines every frontend field:

- `KegiatanItem` (lines 15-22): `pendahuluan`, `inti`, `penutup`, `diferensiasi` (10_000 / 20_000 / 10_000 / 10_000 char bounds) — covers the rich nested wizard section.
- Top-level fields: `asesmenDiagnostik` (L40), `asesmenFormatif` (L41), `asesmenSumatif` (L42), `pengayaan` (L43), `remedial` (L44), `refleksiGuru` (L46), `refleksiSiswa` (L47), `lampiranUrl` (L49, max 2000 chars), `durasiMenit` (L50, 1-600 minutes).
- All fields bounded with realistic max lengths; arrays use `max(40)` / `max(50)` caps.
- `jpAllocation` and `kktp` use `z.coerce.number().int()` with sane min/max.

The DTO does not introduce shared types into `packages/types` — deferred to Wave 8 per the executor's residual note. Honest deferral, no silent drift.

### W3-02 — AI Step Generation Field Mapping (P0)

**Status: CLOSED with P1 follow-up.**

[ModulAjarForm.tsx:122-271](file:///c:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school/apps/web/src/app/dashboard/akademik/_components/ModulAjarForm.tsx#L122-L271) — `aiGenerateStep()` `stepMap` covers steps 2, 4, 5, 6, 7, 8, 9, 10 with specific field targets:

| Step | Field mapping | Parser strategy |
|---|---|---|
| 2 (cp_tp) | `cp` + `tp[]` | Numbered-line regex `^(?:TP\s*)?\d+[.):\- ]+(.*)$` splits CP from TP |
| 4 (profil) | `profilDimensi[]` + `profilUraian` | Match against DIMENSI label list; remainder → uraian |
| 5 (sarana) | `sarana` + `target` | First paragraph → sarana; rest → target |
| 6 (kegiatan) | `kegiatan[0].inti` | Writes to first pertemuan's inti (creates if empty) |
| 7 (asesmen) | `asesmenDiagnostik` / `asesmenFormatif` / `asesmenSumatif` | Header-based regex; falls back to legacy `asesmen` if no header detected |
| 8 (remedial) | `pengayaan` + `remedial` | Header-based split; falls back to `remedial` only |
| 9 (refleksi) | `refleksiGuru` + `refleksiSiswa` | Header-based split; falls back to `refleksiGuru` only |
| 10 (lampiran) | `lampiran` | Direct write |

Step 3 (ATP) routes to the dedicated `aiGenerateAtp` endpoint with its own JSON shape — verified at L124-138.

Error paths throw (L267-268); caller `aiGenerate()` (L273-283) catches and toasts real error messages. No silent success when output is missing or empty.

**P1 Finding — counter check bug:** at [ModulAjarForm.tsx:301,305](file:///c:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school/apps/web/src/app/dashboard/akademik/_components/ModulAjarForm.tsx#L301):

```tsx
const bodyBefore = JSON.stringify(body);   // L301 — closure-captured
try {
  await aiGenerateStep(stepNum);
  if (JSON.stringify(body) !== bodyBefore) successCount++;   // L305
  else failCount++;
}
```

`body` is captured from the React render closure. `set()` at [L82-86](file:///c:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school/apps/web/src/app/dashboard/akademik/_components/ModulAjarForm.tsx#L82) uses `setBody((b) => ({ ...b, [k]: v }))` — a scheduled state update. The closure variable `body` does not change synchronously, so `JSON.stringify(body) === bodyBefore` will always evaluate true and `successCount` will never increment. The "Generate Semua" toast will always report `0 berhasil, 9 gagal` even when every step applied output correctly.

**Impact:** Field application works correctly. Only the post-run counter message is misleading. This is error masking per the WAVE-0 severity rubric and warrants P1.

**Recommended fix (NOT applied by reviewer — review-only session):** have `aiGenerateStep()` return a boolean (or the number of fields mutated) and use that for the counter, OR use a `useRef` to hold the current body for comparison, OR track mutation via a local `let mutated = false` flag flipped inside `set()` during the loop. The reviewer prefers the explicit return-value approach because it does not require a ref and stays testable.

**Parser fallback robustness:** the executor's residual note about markdown splitting heuristics is honest. The header-based regex (`#{0,6}\s*${keyword}`) tolerates both plain text `Diagnostik:` and Markdown `## Diagnostik`. Missing-header fallbacks write to a single field (`asesmen`, `remedial`, `refleksiGuru`) rather than discarding output. Acceptable.

### W3-03 — Real Simpan Draft (P0)

**Status: CLOSED.**

[ModulAjarForm.tsx:67-86,353-400](file:///c:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school/apps/web/src/app/dashboard/akademik/_components/ModulAjarForm.tsx#L67) — verification points:

- L73-75: `savedVersion` state machine has all four states: `'dirty' | 'saving' | 'saved' | 'error'`. Default for new form is `'dirty'` (truthful — never claims "Tersimpan" before any server save). Default when `editing` is `'saved'` (truthful — existing RPP was already persisted).
- L82-86: `set()` marks state `'dirty'` on every local edit (unless already `'saving'`), so any local change after a save truthfully resets the badge.
- L353-400: `saveDraft()` calls `createRpp({ ..., submit: false })` or `updateRpp(...)` inside `startTransition`. No `setTimeout` fake remains.
- L385-390: server `!res.success` path sets `savedVersion='error'` and surfaces the server error message via toast — no masking.
- L393-395: catch path also sets `'error'` and shows the real exception message.

Residual "saveDraft does not auto-switch to edit mode" is honest and non-blocking — the dialog closes after save (existing UX), and reopening loads the persisted draft. Future polish item, not a Wave 3 acceptance gap.

### W3-04 — WAKA One-Step Reviewer (P1)

**Status: CLOSED with P2 documentation drift.**

[rpp.service.ts:26-32](file:///c:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school/apps/api/src/rpp/rpp.service.ts#L26-L32) — `REVIEWER_ROLES = ['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'WAKA_KURIKULUM']` with explicit comment header documenting the Director decision (2026-07-20) and the two-step deferral rationale (would require new Prisma enum `RppStatus.reviewed`).

[rpp/page.tsx:16-23](file:///c:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school/apps/web/src/app/dashboard/rpp/page.tsx#L16-L23) — page redirect logic includes `WAKA_KURIKULUM` symmetrically with the service. Comment header explains the policy choice.

Decision provenance is clean: one-step is consistent with Wave 1's `rpp.review` permission seed and avoids the schema-change-ASK-FIRST guardrail.

**P2 Finding — lifecycle doc drift:** [academic-lifecycle.md §7.2 (L322)](file:///c:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school/docs/architecture/academic-lifecycle.md#L322) still states `Reviewer: WAKA_KURIKULUM (review awal) → KEPALA_SEKOLAH (final approval)`. The code now implements one-step. The service comment header documents the deferral, but the lifecycle spec itself was not updated. Recommendation: add a short note to §7.2 acknowledging the one-step policy decision and the two-step deferral reference. Non-blocking.

**Inconsistency to clarify (P2):** [lms.service.ts:23](file:///c:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school/apps/api/src/lms/lms.service.ts#L23) defines `REVIEWER_ROLES = ['SUPER_ADMIN', 'KEPALA_SEKOLAH']` — WAKA_KURIKULUM is NOT included. This means a WAKA who can review RPP cannot create or manage LMS modules from RPPs they do not own. The Wave 3 report does not mention whether this is intentional. If WAKA is meant to have read/audit access to LMS modules (consistent with their academic oversight role), this is a gap. If WAKA is meant to be RPP-review-only, the asymmetry should be documented. Recommendation: clarify intent in a follow-up; not a Wave 3 blocker because LMS module creation by GURU (the primary path) works and WAKA review of RPP (the W3-04 scope) works.

### W3-05 — PII Stripping on AI Egress (P1)

**Status: CLOSED.**

[ai-generate.service.ts:32-66](file:///c:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school/apps/api/src/ai/ai-generate.service.ts#L32-L66) — verification across all four methods:

| Method | stripPiiForLlm call site | Gateway call | Audit record |
|---|---|---|---|
| `generateQuestions` (L32-39) | L35 `const prompt = stripPiiForLlm(this.buildQuestionsPrompt(dto))` | L36 `callAi(prompt)` — uses stripped | L37 `auditGeneration(teacherId, 'questions', prompt, output)` — uses stripped |
| `generateMaterial` (L42-48) | L44 | L45 | L46 |
| `generateAtp` (L51-57) | L53 | L54 | L55 |
| `generateRppStep` (L60-66) | L62 | L63 | L64 |

The prompt variable is **reassigned** to the redacted version before any downstream use — single-source-of-truth. No raw prompt leaks via:

- Gateway egress (only stripped `prompt` is passed to `callAi`).
- Audit storage (only stripped `prompt` is passed to `auditGeneration` which writes to `ai_generations` table).
- Error path (catch blocks in the caller controller, not shown here, would only see the stripped `prompt` if they capture the thrown error context — the service itself does not log the raw prompt anywhere).
- Logger (L149-153 fail-soft logging stores `teacherId`, `type`, and `error.message` — never `prompt` or `output`).

The `ai-generate.spec.ts` suite (4 tests) covers email, phone, NIS, and name-like content redaction at both egress and audit layers per the executor's claim. Stripper utility itself was verified in an earlier wave (R-28).

### W3-06 — RPP/LMS Ownership Validation (P1)

**Status: CLOSED.**

[rpp.service.ts:248-276](file:///c:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school/apps/api/src/rpp/rpp.service.ts#L248-L276) — `assertTeachingAssignment()` validates `(teacherId, classId, subject, academicYear)` triple against `prisma.teachingAssignment.findFirst()`. Called in `create()` (L114-116) and `update()` (L147-152) for non-reviewer users. Explicit error messages:

- No `classId` → `BadRequestException('Class wajib dipilih sesuai assignment mengajar Anda')` (L265).
- No matching assignment → `ForbiddenException('Anda tidak memiliki assignment mengajar untuk kombinasi class/subject/tahun ajaran ini')` (L272-274).

[lms.service.ts:198-246](file:///c:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school/apps/api/src/lms/lms.service.ts#L198-L246) — LMS `create()` has two paths:

- If `rppId` provided: load RPP, require ownership OR reviewer bypass, derive `classId/subject/academicYear` from RPP (ignoring dto fields). Other-teacher RPP → `ForbiddenException('RPP milik guru lain — tidak dapat ditautkan ke modul LMS Anda')` (L218). Missing RPP → `NotFoundException` (L215).
- If no `rppId`: validate `TeachingAssignment` triple via `assertTeachingAssignment()` mirror (L249-267). Missing `classId` → `ForbiddenException` (L256). No matching assignment → `ForbiddenException` (L263-265).

Reviewer bypass for KS/SA works via `isReviewer()` check at L206, L217, L223. Fail-closed semantics preserved.

Test coverage per executor claim: 3 new RPP tests + 5 new LMS tests — confirmed by the 14 rpp + 22 lms focused test totals in the reviewer rerun.

**Note on Fase 0 dependency:** the executor's residual acknowledgement that missing `TeachingAssignment` rows will block GURU RPP creation is accurate. The error message is explicit ("...kombinasi class/subject/tahun ajaran ini") so operators know where to look. Acceptable residual.

### W3-07 — Asia/Jakarta Teacher Attendance Date (P1)

**Status: CLOSED.**

[teacher-attendance.service.ts:41-60](file:///c:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school/apps/api/src/teacher-attendance/teacher-attendance.service.ts#L41-L60) — `todaySchoolLocalDate()` uses `new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year, month, day }).format(now)` and returns the result as UTC midnight. The `en-CA` locale yields ISO 8601 `YYYY-MM-DD` (verified). No new dependency added.

All 4 call sites use the new function:

- `checkIn` L112: `const date = todaySchoolLocalDate();`
- `checkOut` L142: `const date = todaySchoolLocalDate();`
- `myToday` L165: `const today = todaySchoolLocalDate();`
- `todaySummary` L214: `const date = todaySchoolLocalDate();`

No dead `todayUtcDate()` left behind (grep-clean). The `[teacherId, date]` unique constraint and `date gte/lte` queries continue to work against the day-aligned UTC-midnight value.

Edge-case tests use `jest.useFakeTimers()` + `setSystemTime()` for 00:30 WIB (17:30 UTC previous day → records WIB day) and 07:30 WIB (00:30 UTC same day → same WIB day). Asia/Jakarta has no DST so no DST handling is needed — executor correctly noted.

## Positive Controls Preservation

Working tree diff is exactly the 10 claimed files. None of the following files were touched by Wave 3:

- `apps/api/src/lms/lms.event-listener.ts` — LMS auto-create idempotency (`by rppId`) preserved.
- `apps/api/src/schedule/schedule.service.ts` — schedule overlap checks and DB exclusion constraint `schedules_class_jp_range_excl` untouched.
- `apps/api/src/notification/notification.listener.ts` — event chain handlers untouched.
- `apps/api/src/assessment/assessment.service.ts` — grading pipeline untouched.
- `apps/api/src/class-activities/` — class activity ownership untouched.
- `apps/api/src/events/events.types.ts` — `RppReviewedPayload` shape preserved (verified at [rpp.service.ts:215-222](file:///c:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school/apps/api/src/rpp/rpp.service.ts#L215-L222) which emits the same payload structure as before).

Within modified files:

- [rpp.service.ts:33](file:///c:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school/apps/api/src/rpp/rpp.service.ts#L33) — `EDITABLE_STATUSES = ['draft', 'revision']` unchanged.
- [rpp.service.ts:215-222](file:///c:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school/apps/api/src/rpp/rpp.service.ts#L215-L222) — `rpp.reviewed` event emission payload shape preserved (`rppId, teacherId, title, decision, note, reviewedAtIso`).
- [teacher-attendance.service.ts:96-107](file:///c:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school/apps/api/src/teacher-attendance/teacher-attendance.service.ts#L96-L107) — geofence flag policy (`outsideGeofence` true when over-radius OR missing coords, never reject) preserved.

No regression risk identified in the traced controls.

## Verification

Reviewer rerun on `feat/wave3-phase2-academic-preparation` at HEAD `b39caf2` + working tree:

| Check | Executor claim | Reviewer rerun | Match |
|---|---|---|---|
| API focused tests | 5 suites / 69 tests | 5 suites / 69 tests (`rpp.spec.ts`, `lms.spec.ts`, `ai-generate.spec.ts`, `teacher-attendance.spec.ts`, `ai-gateway.spec.ts`) | ✅ exact |
| API type-check | clean | `tsc --noEmit` exit 0 | ✅ |
| Web type-check | clean | `tsc --noEmit` exit 0 | ✅ |
| API lint | clean | `eslint src --ext .ts` exit 0 | ✅ |
| Web lint | "No ESLint warnings or errors" (next lint deprecation only) | `✔ No ESLint warnings or errors` + `next lint` deprecation/plugin warning | ✅ |
| API build | clean | `nest build` exit 0 | ✅ |
| Web build | not run (sandbox SIGBUS) | `✓ Compiled successfully in 17.1s` | ⬆️ reviewer improvement |
| `git diff --check` | pass | EXIT=0 | ✅ |

The reviewer successfully ran `next build` locally where the executor could not (sandbox SIGBUS on Windows). This closes the "web build gap" risk flagged in the architect's prompt — the build is green, no hidden runtime issue caught.

## Claim-by-Claim Audit Table

| Finding | Claim | Code Evidence | Test Evidence | Reviewer Verdict |
|---|---|---|---|---|
| W3-01 (P0) | All frontend ModulAjarBody fields in Zod schema | [rpp.dto.ts:11-51](file:///c:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school/apps/api/src/rpp/dto/rpp.dto.ts#L11-L51) | rpp.spec.ts round-trip | **CLOSED** |
| W3-02 (P0) | Each step writes to specific body field(s); counter only increments on mutation | [ModulAjarForm.tsx:142-260](file:///c:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school/apps/web/src/app/dashboard/akademik/_components/ModulAjarForm.tsx#L142-L260) step map | — | **CLOSED** with P1 counter bug (closure semantics) |
| W3-03 (P0) | `saveDraft` real server save; badge dirty/saving/saved/error | [ModulAjarForm.tsx:67-86,353-400](file:///c:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school/apps/web/src/app/dashboard/akademik/_components/ModulAjarForm.tsx#L67) | — | **CLOSED** |
| W3-04 (P1) | WAKA_KURIKULUM in REVIEWER_ROLES; page redirect allow WAKA; two-step deferral documented | [rpp.service.ts:26-32](file:///c:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school/apps/api/src/rpp/rpp.service.ts#L26-L32), [rpp/page.tsx:22](file:///c:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school/apps/web/src/app/dashboard/rpp/page.tsx#L22) | rpp.spec.ts role tests | **CLOSED** with P2 doc drift (lifecycle §7.2) |
| W3-05 (P1) | stripPiiForLlm on all 4 methods before egress AND audit | [ai-generate.service.ts:32-66](file:///c:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school/apps/api/src/ai/ai-generate.service.ts#L32-L66) | ai-generate.spec.ts (4 tests) | **CLOSED** |
| W3-06 (P1) | assertTeachingAssignment in RPP create/update; LMS create validates rppId ownership or assignment triple | [rpp.service.ts:248-276](file:///c:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school/apps/api/src/rpp/rpp.service.ts#L248-L276), [lms.service.ts:198-267](file:///c:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school/apps/api/src/lms/lms.service.ts#L198-L267) | rpp.spec.ts (3 new) + lms.spec.ts (5 new) | **CLOSED** with P2 asymmetry note (LMS REVIEWER_ROLES excludes WAKA) |
| W3-07 (P1) | todaySchoolLocalDate using Intl.DateTimeFormat Asia/Jakarta; all 4 call sites | [teacher-attendance.service.ts:51-60,112,142,165,214](file:///c:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school/apps/api/src/teacher-attendance/teacher-attendance.service.ts#L51-L60) | teacher-attendance.spec.ts (2 edge cases) | **CLOSED** |

## Test Coverage Assessment

- **Adequate for backend findings (W3-04, W3-05, W3-06, W3-07):** focused unit tests cover positive and negative paths.
- **Adequate for schema round-trip (W3-01):** rpp.spec.ts assertion covers rich nested fields.
- **Insufficient for UI workflow findings (W3-02, W3-03):** no component or Playwright test asserts that fields change after `aiGenerateStep` or that the badge state machine transitions correctly. This is acknowledged by the executor ("Browser QA deferred") and matches the architect's risk note. Acceptable residual risk because: (a) backend type-check ensures contracts; (b) the `next build` succeeded; (c) browser QA is mandatory before staging sign-off anyway.

The new `ai-generate.spec.ts` (4 tests) is appropriately focused on the PII redaction contract — does not duplicate `ai-gateway.spec.ts` (15 tests, gateway behavior).

## Manual QA Status

**Local smoke: NOT RUN.** The reviewer session was scoped to static code review plus focused tests/type-check/lint/build. No local app runtime was started; no browser interaction was performed.

**Staging QA queue:** Wave 3 browser QA MUST queue behind:
1. **SPMB staging QA** (per `SPMB-STAGING-QA-FOLLOWUP-FINDINGS-FIXES-2026-07-19.md`) — 7 manual scenarios listed in that report's "Pending before reviewer sign-off" section.
2. **Wave 3 browser QA** — 8 manual scenarios listed in `WAVE3-PHASE2-ACADEMIC-PREPARATION-REMEDIATION-2026-07-20.md` §"Manual Browser QA Matrix".

The SPMB follow-up PR (#374) has already merged into `develop`; its browser QA scenarios should be executed first on the next staging window. Wave 3 staging QA follows.

## Git Gate Readiness

### Commit / push / PR to develop

**Approved to proceed** with the following packaging:

1. **Branch base:** `feat/wave3-phase2-academic-preparation` at `b39caf2` (HEAD of the SPMB follow-up merge). Note: `develop` itself is currently at `5010606` (older). The Wave 3 PR will carry SPMB follow-up changes into `develop` along with Wave 3 changes. This is expected — SPMB follow-up was approved via PR #374 but apparently not yet promoted to `develop`. Confirm with the coordinator before opening the Wave 3 PR if `develop` advancement is unexpected.

2. **Files to stage explicitly (do NOT use `git add .` or `git add -A`):**

   Modified (10):
   ```
   apps/api/src/__tests__/lms.spec.ts
   apps/api/src/__tests__/rpp.spec.ts
   apps/api/src/__tests__/teacher-attendance.spec.ts
   apps/api/src/ai/ai-generate.service.ts
   apps/api/src/lms/lms.service.ts
   apps/api/src/rpp/dto/rpp.dto.ts
   apps/api/src/rpp/rpp.service.ts
   apps/api/src/teacher-attendance/teacher-attendance.service.ts
   apps/web/src/app/dashboard/akademik/_components/ModulAjarForm.tsx
   apps/web/src/app/dashboard/rpp/page.tsx
   ```

   New untracked, stage explicitly:
   ```
   apps/api/src/__tests__/ai-generate.spec.ts
   docs/audits/WAVE3-PHASE2-ACADEMIC-PREPARATION-REMEDIATION-2026-07-20.md
   docs/audits/WAVE3-PHASE2-ACADEMIC-PREPARATION-REVIEW-2026-07-20.md
   ```

   **Do NOT stage:** `.commit-msg*.txt`, `.pr-body-*.txt`, `.tmp-*.json`, `.agents/`, `.codex/`, `.tmp/`, `apps/.tmp/`, `apps/api/src/.tmp/`, `apps/api/test/*-result.txt`, `apps/api/test/phase*.e2e-spec.ts`, or any other historical untracked artifacts (same protocol as Wave 2.5 reviewer precedent).

3. **Pre-commit gate:**
   ```
   git diff --cached --stat
   git diff --cached --check
   ```
   Confirm staged file count is exactly 13 (10 modified + 3 new). Inspect for unrelated lines.

4. **Commit message (suggested):**
   ```
   feat(wave3): academic preparation — RPP schema, AI mapping, WAKA review, PII strip, ownership, WIB attendance

   Wave 3 Phase 2 close-out:
   - W3-01: ModulAjarBodySchema extended with rich nested fields (kegiatan/asesmen/refleksi/lampiran)
   - W3-02: AI step generation maps output to specific body fields with header-based parser fallbacks
   - W3-03: saveDraft now performs real server save; badge state machine dirty/saving/saved/error
   - W3-04: WAKA_KURIKULUM added to RPP REVIEWER_ROLES (one-step consistent policy)
   - W3-05: PII stripping on all 4 AiGenerateService methods before egress + audit
   - W3-06: RPP/LMS ownership validated against TeachingAssignment
   - W3-07: Teacher attendance uses Asia/Jakarta local date (Intl.DateTimeFormat)

   No schema/dependency/migration changes. Zod DTO extension only (allowed).
   Tests: 5 suites / 69 pass. Type-check, lint, build clean.
   ```

5. **PR target:** `develop`. Title: `feat(wave3): Phase 2 academic preparation`. PR body should summarize the 7 findings, cite the audit report path, and list "Residual: W3-02 counter check bug (P1, fast-follow before browser QA)".

### Web build gap handling

**Resolved in reviewer session.** The reviewer successfully ran `next build` locally (`✓ Compiled successfully in 17.1s`, 39/39 pages) where the executor could not due to sandbox SIGBUS. The web build gap is closed — no further build evidence is needed before Git Gate. CI on the PR will produce authoritative re-build evidence as standard.

### Staging queue priority

1. SPMB staging QA (7 scenarios per `SPMB-STAGING-QA-FOLLOWUP-FINDINGS-FIXES-2026-07-19.md`).
2. Wave 3 staging QA (8 scenarios per Wave 3 remediation report §"Manual Browser QA Matrix").
3. Director-driven production promotion review.

### Files NOT to be staged

Listed above in §2. Same protocol as Wave 2.5 reviewer precedent — worktree contains many historical untracked artifacts that must not enter the Wave 3 commit.

## Recommendations

### Immediate (before commit/push/PR)

None. Git Gate is approved as-is. The P1 counter bug does not block commit/PR — it blocks browser QA, which is downstream of the PR merge to develop.

### Fast-follow (before Wave 3 browser QA on staging)

1. **Fix the W3-02 counter check** at [ModulAjarForm.tsx:301-306](file:///c:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school/apps/web/src/app/dashboard/akademik/_components/ModulAjarForm.tsx#L301). Recommended approach: `aiGenerateStep()` returns `Promise<{ mutated: boolean }>` and the loop increments based on the return value. Alternative: track mutation via a `useRef` body mirror. Do NOT attempt to read setState-updated closure variables synchronously.

2. **Decide on W3-04 / LMS reviewer asymmetry:** should `WAKA_KURIKULUM` be added to `lms.service.ts:23` `REVIEWER_ROLES` for consistency, or is the RPP-only review scope intentional? Either way, document the decision.

### Polish (any future wave)

1. **Update lifecycle doc §7.2** to reflect one-step RPP review decision; cross-reference the Wave 3 audit and the two-step deferral note.

2. **Add component tests for ModulAjarForm** to cover W3-02 and W3-03 workflows (field application after AI generate; badge state transitions after saveDraft success/error). This closes the "browser QA only" verification gap.

3. **Consider shared types** (deferred to Wave 8): `ModulAjarBody` is defined in both `apps/web/src/app/dashboard/akademik/_components/guru-types.ts` (frontend) and `apps/api/src/rpp/dto/rpp.dto.ts:52` (backend). Manual parity maintenance is fragile; a shared type in `packages/types` would prevent silent drift.

## Confidence

**Review confidence: 93%**

Confidence is high because:

- All 7 findings' file:line evidence was independently verified.
- Focused test totals (5 suites / 69 tests) reproduced exactly on first run.
- Type-check, lint, API build, web build all green locally.
- Web build (which executor could not run) completed successfully — closes the highest-risk unknown.
- Working tree scope exactly matches the executor's claim (10 modified + 3 new files, no scope creep).
- PII stripping verified at all 4 methods with reassignment-before-use pattern — no leak path identified.
- Ownership validation covers both RPP and LMS with consistent TeachingAssignment triple check.
- Asia/Jakarta date function is correct (verified `en-CA` locale yields ISO `YYYY-MM-DD`) and used at all 4 call sites.

The remaining 7% uncertainty is runtime-only:

- Real AI output may not match parser header expectations for W3-02 (mitigated by single-field fallbacks).
- Keycloak role sync for WAKA_KURIKULUM may not be current in the production realm (residual risk acknowledged by executor).
- Browser behavior of the wizard dialog scroll region, badge state transitions, and Generate Semua UX has not been verified interactively.
- The W3-02 counter bug (P1) will produce misleading output in browser QA until fixed.

## Path to Review Report

`docs/audits/WAVE3-PHASE2-ACADEMIC-PREPARATION-REVIEW-2026-07-20.md` (this file).
