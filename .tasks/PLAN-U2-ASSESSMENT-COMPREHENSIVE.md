# PLAN U2: Soal Formatif-Sumatif Komprehensif (GAP-6)

> **Dibuat:** 2026-07-04
> **Versi:** 1.0
> **Prioritas:** P2-HIGH
> **Estimasi:** 4 jam (estimasi awal; dapat dipecah ke sub-sesi)
> **Branch:** `feat/assessment-comprehensive`
> **Ref:** PLAN-CONSOLIDATED-2026.md §5 U2, GAP-6

---

## 1. KONTEKS & CURRENT STATE

### 1.1 Schema Saat Ini (MVP)

| Model | Fields | Kekurangan |
|---|---|---|
| `Question` | id, teacherId, subject, type (PG/essay/true_false/matching), body, options (JSON), answer, difficulty (easy/medium/hard), tags[] | Tidak ada dukungan multiple correct answers, tidak ada rubrik essay, tidak ada timer |
| `QuestionSet` | id, name, teacherId, questions[] | Tidak ada sharing antar guru, tidak ada import/export |
| `AssessmentSession` | id, moduleId, teacherId, classId, title, type (diagnostik/formatif/sumatif), status (draft/active/completed), questions (JSON), startedAt, completedAt | Tidak ada timer, tidak ada randomisasi urutan |
| `AssessmentResponse` | id, sessionId, studentId, answers (JSON), score, submittedAt | Tidak ada item analysis, tidak ada remedial tracking |

### 1.2 Frontend Saat Ini (MVP)

| Component | Fungsi | Kekurangan |
|---|---|---|
| `QuestionBankEditor` | CRUD soal, AI generate | Tidak ada multiple correct, tidak ada rubrik essay, tidak ada bulk import |
| `SessionFlowModal` | 5-step session wizard | Tidak ada timer config, tidak ada randomize toggle |
| `PenilaianSesiModal` | Preview/monitor sesi | Tidak ada analisis hasil, tidak ada item analysis |

### 1.3 Enum Saat Ini

```
QuestionType:       multiple_choice | essay | true_false | matching
QuestionDifficulty: easy | medium | hard
AssessmentType:     diagnostik | formatif | sumatif
AssessmentSessionStatus: draft | active | completed
```

---

## 2. PRIORITAS IMPLEMENTASI (MINIMUM VIABLE KOMPREHENSIF)

> Berdasarkan Director feedback: implementasi minimum viable komprehensif, bukan semua fitur sekaligus.

### Wave 1: Anti-Cheating + Timer (1.5 jam)
1. Timer per sesi (durasi pengerjaan)
2. Randomisasi urutan soal (anti-cheating)

### Wave 2: Essay Rubrik (1 jam)
3. Essay rubrik penilaian (kriteria + bobot per kriteria)

### Wave 3: Analisis Hasil (1 jam)
4. Analisis hasil dasar (rata-rata, distribusi, % ketuntasan, item analysis)

### Wave 4: Export/Import (0.5 jam)
5. Export/import CSV soal

---

## 3. WAVE 1: TIMER + RANDOMISASI (1.5 JAM)

### 3.1 Schema Changes

```prisma
// Tambah field ke AssessmentSession
model AssessmentSession {
  // ... existing fields ...
  durationMinutes Int?     @map("duration_minutes")  // U2: timer durasi pengerjaan
  randomizeOrder Boolean   @default(false)           @map("randomize_order") // U2: randomisasi urutan soal
}

// Tambah field ke AssessmentResponse
model AssessmentResponse {
  // ... existing fields ...
  startedAt     DateTime? @map("started_at")         // U2: kapan siswa mulai mengerjakan
  timeSpentSec  Int?      @map("time_spent_sec")     // U2: total detik yang dihabiskan
}
```

**Migration:** `20260704000001_u2_assessment_timer_randomize`

### 3.2 Backend Changes

**Files to modify:**
- `packages/database/prisma/schema.prisma` — add 4 fields
- `apps/api/src/assessment/dto/assessment.dto.ts` — add `durationMinutes?`, `randomizeOrder?` to create/update schemas
- `apps/api/src/assessment/assessment.service.ts`:
  - `create()`: accept `durationMinutes`, `randomizeOrder`
  - `startSession()`: set `startedAt` on response when siswa starts
  - `submitResponse()`:
    - Check if timer expired (`startedAt + durationMinutes < now`) → reject if expired
    - Compute `timeSpentSec` from `startedAt` to now
    - If `randomizeOrder`: shuffle question order in the `answers` JSON (store original index for grading)

**Validation logic:**
```typescript
// Timer check on submit
if (session.durationMinutes && response.startedAt) {
  const elapsed = (Date.now() - response.startedAt.getTime()) / 60000;
  if (elapsed > session.durationMinutes + 1) { // +1 min grace
    throw new BadRequestException('Waktu pengerjaan telah habis');
  }
}
```

### 3.3 Frontend Changes

**`SessionFlowModal.tsx`:**
- Add step "Pengaturan" (between existing steps):
  - Duration input (minutes, nullable = no timer)
  - Randomize toggle (checkbox)
  - KKTP target field (already exists, move here)

**Siswa assessment modal ( AssessmentTaker / inline in ModulSiswa):**
- Show countdown timer if `durationMinutes` is set
- Auto-submit when timer reaches 0
- Questions displayed in randomized order if `randomizeOrder` is true

### 3.4 Validation

- [ ] Create session with timer=30min, randomize=true
- [ ] Siswa starts → countdown timer visible
- [ ] Siswa answers → auto-submit at 30min
- [ ] Verify question order differs between siswa A and siswa B

---

## 4. WAVE 2: ESSAY RUBRIK (1 JAM)

### 4.1 Schema Changes

```prisma
// Tambah field ke Question
model Question {
  // ... existing fields ...
  rubric Json? @db.JsonB   // U2: essay rubrik — Array<{ criteria: string, weight: number, description: string }>
}
```

**Rubrik JSON shape:**
```typescript
interface EssayRubric {
  criteria: Array<{
    id: string;           // "c1", "c2", etc.
    name: string;         // "Pemahaman konsep"
    weight: number;       // 0.3 (30%)
    maxScore: number;     // 100
    description: string;  // "Siswa menunjukkan pemahaman..."
  }>;
}
```

### 4.2 Backend Changes

**`assessment.service.ts`:**
- `submitResponse()`: For essay questions, score remains null (needs manual grading)
- Add `gradeEssayResponse()` method:
  - Teacher submits per-criteria scores
  - System computes weighted total: `sum(criteriaScore * weight) / sum(maxScore * weight) * 100`
  - Updates `answers` JSON with `{ essayScores: { [questionId]: { criteria: {...}, total: number } } }`

### 4.3 Frontend Changes

**`QuestionBankEditor.tsx`:**
- When type=essay: show rubrik builder UI
  - Add criteria row (name, weight, description, maxScore)
  - Remove criteria
  - Weight auto-normalize (warn if total ≠ 1.0)

**New component: `EssayGradingModal.tsx`**
- For teacher post-session: list of essay responses needing manual grading
- Per question: show student's answer + rubrik criteria inputs
- Compute weighted score → save

### 4.4 Validation

- [ ] Create essay question with rubrik (3 criteria, weights 0.3/0.3/0.4)
- [ ] Siswa answers essay
- [ ] Teacher grades: 80/70/90 → weighted = 80*0.3 + 70*0.3 + 90*0.4 = 81
- [ ] Verify score appears in response

---

## 5. WAVE 3: ANALISIS HASIL (1 JAM)

### 5.1 Backend Changes

**Add endpoint: `GET /assessment/sessions/:id/analysis`**

Returns:
```typescript
interface SessionAnalysis {
  sessionId: string;
  totalStudents: number;
  submitted: number;
  pending: number;
  // Score distribution
  avgScore: number;
  minScore: number;
  maxScore: number;
  medianScore: number;
  scoreDistribution: { range: string; count: number }[]; // "0-50", "51-60", etc.
  ketuntasanPct: number; // % siswa >= KKTP
  // Item analysis (per question)
  items: Array<{
    questionId: string;
    questionPreview: string;
    difficultyIndex: number;    // % correct (0-1)
    discriminationIndex: number; // point-biserial (-1 to 1)
    correctCount: number;
    wrongCount: number;
    blankCount: number;
  }>;
}
```

**Implementation in `assessment.service.ts`:**
```typescript
async getSessionAnalysis(sessionId: string, user: AuthUser) {
  // 1. Verify ownership (teacher or reviewer)
  // 2. Fetch all responses
  // 3. Compute aggregate stats
  // 4. Per question: count correct/wrong/blank
  // 5. Difficulty index = correctCount / totalResponses
  // 6. Discrimination index = point-biserial correlation
}
```

### 5.2 Frontend Changes

**New component: `SessionAnalysisPanel.tsx`**
- Shown in `PenilaianSesiModal` when session status=completed
- Score distribution bar chart
- Ketuntasan percentage gauge
- Item analysis table with color-coded difficulty (green=good, amber=too easy/hard)

### 5.3 Validation

- [ ] Complete a session with 10+ responses
- [ ] View analysis: avg, median, distribution chart render
- [ ] Item analysis shows per-question difficulty + discrimination
- [ ] Ketuntasan % matches manual calculation

---

## 6. WAVE 4: EXPORT/IMPORT CSV (0.5 JAM)

### 6.1 Backend Changes

**Add endpoints:**
- `GET /questions/export?subject=X&format=csv` — Export questions as CSV
- `POST /questions/import` — Import questions from CSV (multipart or JSON)

**CSV format:**
```csv
type,body,options,answer,difficulty,tags
multiple_choice,"What is 2+2?","[""1"",""2"",""3"",""4""]","4",easy,"math,arithmetic"
essay,"Explain photosynthesis",,,medium,"biology,plants"
true_false,"The sun is a star.","","true",easy,"science"
```

### 6.2 Frontend Changes

**`QuestionBankEditor.tsx`:**
- Add "Export CSV" button → triggers download
- Add "Import CSV" button → file picker → upload → preview → confirm

### 6.3 Validation

- [ ] Export 10 questions → CSV downloads correctly
- [ ] Import same CSV → 10 questions created
- [ ] Import CSV with invalid row → error message per row

---

## 7. FILE CHANGE SUMMARY

| File | Wave | Change |
|---|---|---|
| `packages/database/prisma/schema.prisma` | W1+W2 | Add 5 fields (durationMinutes, randomizeOrder, startedAt, timeSpentSec, rubric) |
| `apps/api/src/assessment/dto/assessment.dto.ts` | W1+W2 | Add new fields to Zod schemas |
| `apps/api/src/assessment/assessment.service.ts` | W1-W4 | Timer logic, essay grading, analysis endpoint, import/export |
| `apps/api/src/assessment/assessment.controller.ts` | W3+W4 | Add analysis + import/export endpoints |
| `apps/web/.../QuestionBankEditor.tsx` | W2+W4 | Rubrik builder, import/export buttons |
| `apps/web/.../SessionFlowModal.tsx` | W1 | Timer + randomize config step |
| `apps/web/.../PenilaianSesiModal.tsx` | W3 | Show analysis tab when completed |
| NEW `apps/web/.../EssayGradingModal.tsx` | W2 | Manual essay grading UI |
| NEW `apps/web/.../SessionAnalysisPanel.tsx` | W3 | Analysis charts + item table |
| NEW `apps/web/.../AssessmentTimer.tsx` | W1 | Countdown timer component for siswa |

---

## 8. SEQUENCING & DEPENDENCY GRAPH

```
Wave 1 (Timer + Randomize) ──> independen, mulai dulu
    ↓
Wave 2 (Essay Rubrik)       ──> independen dari W1, bisa paralel
    ↓
Wave 3 (Analisis Hasil)     ──> depends on W1 (session must be complete-able with timer)
    ↓
Wave 4 (Export/Import)      ──> independen, bisa kapan saja
```

**Recommended execution:**
1. Schema migration (all fields at once)
2. Wave 1 + Wave 4 (parallel — beda file)
3. Wave 2
4. Wave 3

---

## 9. ENGINEERING STANDARDS

### 9.1 Konstanta Import
```typescript
import { KKTP_DEFAULT } from '@/lib/academic';  // JANGAN hardcode 75
```

### 9.2 React Hooks
```typescript
// RIGHT — useMemo unconditional
const shuffled = useMemo(() => randomizeOrder ? shuffle(questions) : questions, [questions, randomizeOrder]);
```

### 9.3 Validation Protocol
```
[ ] prisma migrate dev → migration created
[ ] prisma generate → client updated
[ ] tsc --noEmit → 0 errors
[ ] eslint --max-warnings=0 → 0 errors
[ ] next build → 29/29 pages OK
[ ] jest → all tests pass
```

### 9.4 Gitflow
- Branch: `feat/assessment-comprehensive`
- Commit: `feat(assessment): U2 wave N — <description>`
- PR: `feat/assessment-comprehensive` → staging → CI → merge → staging→main

---

## 10. RISK REGISTER

| Risiko | Prob | Dampak | Mitigasi |
|---|---|---|---|
| Timer enforcement unreliable (clock skew) | Sedang | Sedang | Server-side validation + 1 min grace period |
| Rubrik weight tidak sum to 1.0 | Tinggi | Rendah | Auto-normalize di backend + warning di UI |
| Item analysis slow for large sessions | Sedang | Sedang | Limit to first 200 responses; cache results |
| CSV import with malformed data | Tinggi | Sedang | Preview + row-level validation before commit |
| Schema migration breaks existing sessions | Rendah | Tinggi | All new fields nullable/default — backward compatible |

---

## 11. DOCUMENTATION REQUIREMENTS

### Done-Entry Template (per Wave)
```markdown
### U2-Wave N — <description>
**Ref:** GAP-6 | **Estimasi:** <X jam>
**Mulai:** 2026-MM-DD | **Selesai:** 2026-MM-DD | **Durasi:** <X jam>

**Files changed:**
- `path/file.ts` — <ringkasan>

**Scope completed:**
- [ ] <checklist>

**Bukti Runtime:**
<tempel output: tsc, lint, test, build, migration output>

**Status:** ✅ DONE
```

---

## 12. DEFINITION OF DONE

U2 dianggap selesai ketika SEMUA bernilai true:
- [ ] Wave 1: Timer + randomisasi berfungsi (server-side enforcement)
- [ ] Wave 2: Essay rubrik dengan grading manual ter-weight
- [ ] Wave 3: Analisis hasil dengan item analysis
- [ ] Wave 4: Export/import CSV soal
- [ ] Prisma migration applied dan backward compatible
- [ ] tsc 0, eslint 0, build 29/29, jest pass
- [ ] CI: all 3 checks pass
- [ ] Runtime: manual test create session → timer → randomize → essay rubrik → analysis → export/import
- [ ] Done-entry documented per wave
