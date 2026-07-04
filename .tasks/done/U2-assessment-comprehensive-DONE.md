# U2 — Soal Formatif-Sumatif Komprehensif (GAP-6)

**Ref:** GAP-6 | **Source plans:** PLAN-U2-ASSESSMENT-COMPREHENSIVE | **Estimasi:** 4 jam
**Priority:** P1-HIGH

**Mulai:** 2026-07-04 | **Branch:** `feat/assessment-comprehensive`
**Selesai:** 2026-07-04 | **Durasi aktual:** ~3.5 jam

---

## Files changed

### Schema (Task 0)
- `packages/database/prisma/schema.prisma` — 5 new backward-compatible fields:
  - AssessmentSession: `durationMinutes Int?`, `randomizeOrder Boolean @default(false)`
  - AssessmentResponse: `startedAt DateTime?`, `timeSpentSec Int?`
  - Question: `rubric Json? @db.JsonB`
- `packages/database/prisma/migrations/20260704000001_u2_assessment_comprehensive/migration.sql` — Migration SQL

### Wave 1: Timer + Randomisasi
- `apps/api/src/assessment/dto/assessment.dto.ts` — Added durationMinutes, randomizeOrder, startedAt fields + GradeEssaySchema
- `apps/api/src/assessment/assessment.service.ts` — Extended SESSION_SELECT, create/update persist, startResponse() (Fisher-Yates shuffle), submitResponse() timer enforcement (+1min grace)
- `apps/api/src/assessment/assessment.controller.ts` — POST :id/start-response (SISWA), PATCH :id/responses/:responseId/grade-essay (GURU/KS)
- `apps/web/src/app/dashboard/akademik/_components/AssessmentTimer.tsx` (NEW — 67 lines) — Countdown timer with visual cues
- `apps/web/src/app/dashboard/akademik/_components/SessionFlowModal.tsx` — Timer config + randomize toggle in Step 5
- `apps/web/src/app/dashboard/akademik/actions.ts` — 6 new server actions (startAssessmentResponse, submitAssessmentResponse, gradeEssayResponse, fetchSessionAnalysis, exportQuestionsCsv, importQuestionsCsv)

### Wave 2: Essay Rubrik
- `apps/api/src/question-bank/dto/question.dto.ts` — Added rubric field to Create/Update schemas
- `apps/api/src/question-bank/question-bank.service.ts` — Added rubric to QUESTION_SELECT, persist in create/update
- `apps/api/src/assessment/assessment.service.ts` — gradeEssayResponse() with weighted scoring: sum(score*weight)/sum(maxScore*weight)*100
- `apps/web/src/app/dashboard/akademik/_components/EssayGradingModal.tsx` (NEW — 230 lines) — Manual essay grading with rubric criteria inputs
- `apps/web/src/app/dashboard/akademik/_components/QuestionBankEditor.tsx` — Rubric builder UI (add/remove criteria, weight indicator)

### Wave 3: Analisis Hasil
- `apps/api/src/assessment/assessment.service.ts` — getSessionAnalysis() with:
  - Summary stats: avg, median, min, max, ketuntasan pct (KKTP=75, ref lib/academic.ts)
  - Score distribution: 6 buckets (0-50, 51-60, 61-70, 71-80, 81-90, 91-100)
  - Per-question item analysis: difficultyIndex (correctCount/total), discriminationIndex (point-biserial correlation)
- `apps/api/src/assessment/assessment.controller.ts` — GET :id/analysis (GURU/KS/SA)
- `apps/web/src/app/dashboard/akademik/_components/SessionAnalysisPanel.tsx` (NEW — 247 lines) — CSS bar chart, ketuntasan gauge, item analysis table
- `apps/web/src/app/dashboard/akademik/_components/PenilaianSesiModal.tsx` — Added "Analisis" mode toggle
- `apps/web/src/app/dashboard/akademik/_components/guru-types.ts` — Added assessmentSessionId? to TodayClass
- `apps/web/src/app/dashboard/akademik/_components/AkademikWorkspace.tsx` — Updated mode type
- `apps/web/src/app/dashboard/akademik/_components/SessionFlowModal.tsx` — Updated mode type

### Wave 4: Export/Import CSV
- `apps/api/src/question-bank/dto/question.dto.ts` — Added ImportQuestionsSchema
- `apps/api/src/question-bank/question-bank.service.ts` — exportQuestionsCsv() (CSV with proper escaping), importQuestionsCsv() (parse + validate + bulk create)
- `apps/api/src/question-bank/question-bank.controller.ts` — GET export (before :id), POST import
- `apps/web/src/app/dashboard/akademik/_components/QuestionBankEditor.tsx` — Export CSV button (Blob download), Import CSV button (file picker + client-side CSV parser + preview)

---

## Scope completed

- [x] **Timer enforcement:** Server-side check with +1min grace period; client-side countdown (AssessmentTimer)
- [x] **Randomisasi:** Fisher-Yates shuffle in startResponse(); each student gets unique question order
- [x] **Essay rubrik:** Rubric JSON field on Question; weighted scoring formula; grading modal with per-criteria inputs
- [x] **Analisis Hasil:** Item analysis (difficulty + discrimination), score distribution, ketuntasan gauge
- [x] **Export CSV:** Download all questions as CSV with proper escaping
- [x] **Import CSV:** Client-side CSV parser → server validates + bulk creates → result preview

---

## Bukti Runtime

```
API tsc --noEmit → EXIT_CODE: 0 (0 errors)
Web tsc --noEmit → EXIT_CODE: 0 (0 errors)

API eslint --max-warnings=0 → EXIT_CODE: 0 (0 errors)
Web next lint → "No ESLint warnings or errors"

next build → success: 29/29 pages generated
  Generating static pages (0/29) → (29/29) ✓

API jest → 52 suites, 841 tests, all passed
Web jest → 3 suites, 39 tests, all passed
```

---

## Validation checklist

- [x] `tsc --noEmit` = 0 errors (both API and web)
- [x] `eslint --max-warnings=0` = 0 errors (API), `next lint` clean (web)
- [x] `next build` = 29/29 pages OK
- [x] `jest` = all pass (API: 841/841, Web: 39/39)
- [x] Schema: all new fields nullable/default (backward compatible)
- [x] KKTP_DEFAULT: constant 75 in backend with comment referencing lib/academic.ts
- [x] React Hooks: no conditional useMemo (error #300 avoided)
- [x] 401 redirect: apiCall pattern with NEXT_REDIRECT re-throw
- [x] Zod DTOs (not class-validator)
- [x] Conventional commits: feat(assessment): U2 wave N — desc
- [x] Gitflow: feat/ branch pushed → PR staging ready

---

## Commits

1. `0522dae` feat(assessment): U2 wave 1 — timer + randomisasi (anti-cheating)
2. `03b9b03` feat(assessment): U2 wave 2 — essay rubrik (rubric field, grading modal, weighted scoring)
3. `f08ab57` feat(assessment): U2 wave 3 — analisis hasil (item analysis, score distribution, ketuntasan)
4. `a4a798c` feat(assessment): U2 wave 4 — export/import CSV (bulk question management)
5. `1b8fd01` fix(assessment): U2 tsc fix — cast essayScores to JsonValue for Prisma compatibility

---

## Catatan / deviasi

1. **PenilaianSesiModal remains SIMULASI for preview/monitor modes** — The analysis mode uses real backend data via fetchSessionAnalysis(). The preview and monitor modes still use SIMULASI mock data as they were before U2. Full wiring requires the session flow to connect to real assessment session IDs.

2. **KKTP_DEFAULT in backend** — The backend (NestJS) cannot import from the Next.js lib/academic.ts. Used constant 75 with comment referencing the source. This is documented in the code.

3. **AssessmentTimer component** — Created but not yet wired into a siswa assessment-taking component (no siswa assessment UI exists yet). The timer is ready for integration when the siswa assessment flow is built.

4. **CSV import parser** — Client-side CSV parser handles quoted fields with escaped double-quotes. Options/tags fields support both JSON-encoded and pipe/comma-separated formats.

5. **Discrimination index** — Uses point-biserial correlation formula: r_pb = (M1 - M0) / Sy * sqrt(p * q). Returns 0 when all students get the same score or when p=0 or p=1.

---

## U7: Staging QA Regression Checks

### Automated checks (passed)
- [x] tsc --noEmit = 0 errors (API + web)
- [x] eslint = 0 errors (API + web)
- [x] next build = 29/29 pages
- [x] jest = 841 API + 39 web tests pass
- [x] No new SIMULASI constants introduced in U2 code (analysis mode uses real backend)
- [x] Schema migration backward compatible (all fields nullable/default)

### Manual QA (requires staging deployment)
- [ ] GURU creates assessment session with timer + randomize → verify durationMinutes/randomizeOrder persisted
- [ ] SISWA starts response → verify startedAt recorded, shuffled questions returned
- [ ] SISWA submits after timer expires → verify ConflictException
- [ ] GURU grades essay with rubric → verify weighted score calculation
- [ ] GURU views analysis panel → verify item analysis, score distribution, ketuntasan
- [ ] GURU exports CSV → verify download contains all questions
- [ ] GURU imports CSV → verify questions created, errors reported
- [ ] 119-case U7 protocol (per PLAN-U7-STAGING-QA.md) — requires browser testing on staging URL

---

## Status: ✅ DONE

Code complete, type-safe, lint-clean, build-green, all tests pass. Branch pushed to origin. Pending staging deployment for runtime verification with real data.
