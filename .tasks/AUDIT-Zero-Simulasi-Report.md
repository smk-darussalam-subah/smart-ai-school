# Zero-Simulasi Audit Report — Comprehensive Verification

> **Date:** 2026-07-05
> **Scope:** Systematic audit of all changes from Zero-Simulasi Resolution Program (P0–P6)
> **Method:** Codebase grep + file reads + tsc/build/jest validation

---

## 1. Original 18-Item Register — Status Verification

### Backend Endpoints (4 new)

| Endpoint | Controller | RBAC | Service Method | Status |
|----------|-----------|------|----------------|--------|
| `GET /teacher-attendance/today-summary` | TeacherAttendanceController L64-68 | `@Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH')` + `teacher.attendance.read` | `todaySummary()` L196-262 | **LIVE** — real GPS presensi data |
| `GET /students/me/profile-cv` | StudentController L74-79 | `@Roles('SISWA')` + `student.read` | `profileCv()` L191-274 | **LIVE** — aggregates grades/attendance/XP |
| `GET /assessment/sessions/:id/stream` (SSE) | AssessmentController L59-63 | `@Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'GURU')` + `lms.read` | `streamResults()` L672-771 | **LIVE** — polls every 3s, 2hr max |
| `POST /ai/generate-rpp-step` | AiGenerateController L59-70 | `@Roles('GURU', 'SUPER_ADMIN', 'KEPALA_SEKOLAH')` + `lms.own.manage` + throttle 10/min | `generateRppStep()` L53-60 | **LIVE** — Ollama default, Claude dormant (R-03 gate) |

**Additional server actions added:**
- `fetchAssessmentSession()` — GET single session for preview mode
- `startAssessmentSession()` — PATCH :id/start (draft → active)
- `completeAssessmentSession()` — PATCH :id/complete (active → completed)

### Per-Item Verification

| # | Component | Before | After | Backend | Frontend Wiring | Verdict |
|---|-----------|--------|-------|---------|-----------------|---------|
| S-01 | PenilaianSesiModal preview | Hardcoded PG/essay ("display:flex") | `fetchAssessmentSession()` on mount; question count + status from real data; empty-state when no session | `GET /assessment/sessions/:id` (existing) | `useEffect` → `setSessionData()` → renders count/status | **RESOLVED** |
| S-02 | PenilaianSesiModal monitor | `MONITOR_DATA` (8 fake students) | `EventSource` SSE stream → live KPIs + roster from real responses | `GET /assessment/sessions/:id/stream` (NEW) | `useEffect` opens EventSource → `setLiveData()` → renders KPIs/table | **RESOLVED** |
| S-03 | PenilaianSesiModal sync | `setTimeout` fake | `startAssessmentSession()` / `completeAssessmentSession()` real API calls | `PATCH :id/start` + `PATCH :id/complete` (existing) | `handleSync` async → real activate/complete | **RESOLVED** |
| S-04 | SessionFlowModal | Hardcoded "TP 3.3 Flexbox", "64% 5/8 TP", "82/100" | `session.subject` derived; CP progress conditional on `assessmentSessionId`; feedback "Lihat hasil di Realtime Monitor" | N/A (uses existing session data) | Props from parent `TodayClass` | **RESOLVED** |
| S-05 | KsWorkspace GuruHadirModal + KPI | `SIM_GURU_LIST` fake roster | `fetchTeacherAttendanceToday()` → real roster with check-in status + geofence flag | `GET /teacher-attendance/today-summary` (NEW) | `useEffect` → `setTeacherAtt()` → KPI + modal | **RESOLVED** |
| S-06 | KsWorkspace tren guru | `pcts.map(p=>p+2)` fake approximation | `guru: []` honest empty; `TrenChart` conditionally renders guru line only when non-empty | N/A (needs teacher heatmap endpoint) | `setTrenData({ siswa: pcts, guru: [] })` | **RESOLVED** (empty-state honest) |
| S-07 | KsWorkspace Rekap badge | Always-on "SIMULASI" | Conditional: `realRekap.length > 0 ? "Real-time" : null` | N/A (label logic fix) | Ternary on `realRekap.length` | **RESOLVED** |
| S-08 | KsWorkspace G8 Matriks badge | Always-on "SIMULASI" | Conditional: `realMonData.length > 0 ? "Real-time" : null` | N/A (label logic fix) | Ternary on `realMonData.length` | **RESOLVED** |
| S-09 | ProfileCV | `SIM_PROFILE_CV` hardcoded identity + stats | `fetchProfileCv()` → real name/NIS/email/XP/avg/streak from aggregates | `GET /students/me/profile-cv` (NEW) | `useEffect` → `setProfile()` → all fields from API | **RESOLVED** |
| S-10 | KsWorkspace constants | SIM_KKTP/SCHED/MON/GURU/SUMATIF | All purged: `SumatifItem` interface, `SCHED_CONFIG`, `emptyMonData`/`emptyRekapData` | N/A (dead code removal) | grep `export const SIM_` = 0 matches | **RESOLVED** |
| S-11 | BadgeCelebration | Hardcoded "85" score | Accepts `badge?.score` from props; score hidden when null | N/A (prop wiring) | `const score = badge?.score ?? null` | **RESOLVED** |
| S-12 | ModulAjarForm AI steps (8) | Toast "(SIMULASI)" | `aiGenerateRppStep()` calls real `/ai/generate-rpp-step`; `simLabel` removed | `POST /ai/generate-rpp-step` (NEW) | `startAi(async () => { await aiGenerateRppStep(...) })` | **RESOLVED** |
| S-13 | BerandaKiosk TTS alert | Hardcoded "XI TJKT JP-3 belum ada absensi" | Alert text derived from real `papanRows` cell check | N/A (logic fix) | `papanRows.some((r) => r.cells.some((c) => c !== null))` | **RESOLVED** |
| S-14 | BerandaKiosk absen-per-JP | `SIM_ABSEN_PER_JP` hardcoded array | `absenPerJp={[]}` empty; `SIM_ABSEN_POOL` deleted; `AbsenJpModal` shows empty array | N/A (honest empty) | `const students = []` in modal | **RESOLVED** |
| S-15 | KsWorkspace genSimMonitor fallback | `SIM_MON_GURUS` + `genSimMonitor()` | `emptyRekapData = useMemo(() => [], ...)` | N/A (fallback removal) | `monData = realRekap.length > 0 ? mapped : emptyRekapData` | **RESOLVED** |
| S-16 | ModulLmsForm | "(SIMULASI)" label | Label text cleaned | N/A (text fix) | grep SIMULASI in file = 0 | **RESOLVED** |
| S-17 | LmsPreviewScreen | `SIM_STUDENTS` 6 fake students | `EMPTY_STUDENTS = []`; SIMULASI badge removed | N/A (honest empty) | All `.filter()` / `.map()` on empty array | **RESOLVED** |
| S-18 | siswa-data resolveSchedule | `SIM_SCHEDULE` fallback | Returns `{ schedule: {}, isSim: false }` | N/A (fallback removal) | `resolveSchedule()` returns empty when no API data | **RESOLVED** |

### Dead Code Purge Verification

| File | Before | After | Evidence |
|------|--------|-------|----------|
| `siswa-data.ts` | 339 lines (211 SIM_ exports) | 128 lines (utilities only) | `export const SIM_` = 0 matches |
| `ortu-data.ts` | 340 lines (259 SIM_ exports) | 77 lines (utilities only) | `export const SIM_` = 0 matches |
| `KsWorkspace.tsx` | 8 SIM_ constant blocks | All purged; `SumatifItem` interface + `SCHED_CONFIG` | grep `SIM_GURU\|SIM_KKTP\|SIM_MON\|SIM_SCHED\|SIM_SUMATIF` runtime = 0 |
| `RingkasanGuru.tsx` | `simulasi: true` items + fake session block | Removed; `StatusChip` simplified | grep `simulasi: true` = 0 matches |

---

## 2. Newly Discovered Simulation Surfaces (Wave 2)

> **Critical finding:** The Zero-Simulasi Program removed `SIM_`-prefixed constants and visible "SIMULASI" labels, but several components still contain **non-prefixed hardcoded data arrays** that render fake data to users. These were not in the original 18-item register.

| # | Component / File | Hardcoded Array | What's Fake | Backend Status | Risk |
|---|-----------------|-----------------|-------------|----------------|------|
| **W2-01** | `PembelajaranGuru.tsx` L48-60 | `MAPEL_PROG` + `CP_DATA` | CP progress per mapel, ketercapaian percentages | **MISSING** — no `/cp-progress` endpoint | MEDIUM — GURU sees fake progress |
| **W2-02** | `CapaianRapor.tsx` L34-39 | `CP_RAPOR` | CP progress grid in rapor view | **MISSING** — no `/cp-progress` endpoint | MEDIUM — KS/SISWA sees fake CP grid |
| **W2-03** | `PenugasanGuru.tsx` L23-34 | `TUGAS_DATA` + `PENGUMPULAN` | Tugas list + submission table | **MISSING** — no `/submissions` endpoint | HIGH — GURU sees entire fake assignment system |
| **W2-04** | `KehadiranGuru.tsx` L92+ L119+ | `SESI_REKAP` + `ATT_ATTENTION` | Per-session rekap table + attention list | **MISSING** — no `/attendance/sessions` endpoint | MEDIUM — GURU sees fake session rekap |
| **W2-05** | `KsWorkspace.tsx` L999 | `emptyRekapData` / `emptyMonData` | When real API returns empty, no empty-state UI shown | Exists but rendering falls through to empty table rows | LOW — empty `<tbody>` not crash |
| **W2-06** | `PenugasanGuru.tsx` L65 | "Tugas Baru" button | `showToast('Simulasi')` — mentions "Simulasi" in toast text | N/A | LOW — text fix |

---

## 3. Cross-Role Consistency Matrix

| Feature | SISWA | ORANG_TUA | GURU | KS/SA |
|---------|-------|-----------|------|-------|
| Profile aggregate | `GET /students/me/profile-cv` ✅ | N/A | N/A | N/A |
| Teacher attendance | N/A | N/A | `GET /teacher-attendance/today` (self) ✅ | `GET /teacher-attendance/today-summary` (all) ✅ |
| Assessment monitor | N/A | N/A | `GET /assessment/sessions/:id/stream` SSE ✅ | Same SSE ✅ |
| AI RPP generation | N/A | N/A | `POST /ai/generate-rpp-step` ✅ | Same ✅ |
| Tugas/Submissions | N/A | N/A | **FAKE** — `TUGAS_DATA` hardcoded ⚠️ | N/A |
| CP Progress | Sees fake CP grid in rapor ⚠️ | N/A | Sees fake progress in PembelajaranGuru ⚠️ | Sees fake CP grid in rapor ⚠️ |
| Kehadiran rekap per-sesi | N/A | N/A | **FAKE** — `SESI_REKAP` hardcoded ⚠️ | N/A |

---

## 4. Infrastructure Configuration

| Item | Status | Evidence |
|------|--------|----------|
| nginx SSE buffering off | **CONFIGURED** | `proxy_buffering off; proxy_cache off; proxy_read_timeout 7200s; X-Accel-Buffering no` on `/stream` route |
| `NEXT_PUBLIC_API_URL` | **SET** in all envs | `.env.production`, `.env.example`, `docker-compose.yml` all set to `https://api.smkdarussalamsubah.sch.id` |
| SSE auth | **GAP** — `EventSource` cannot send `Authorization` header; relies on browser cookie session. Keycloak uses Bearer token, not cookie. SSE endpoint may return 401. | EventSource polyfill needed, or token-via-query-param pattern |

---

## 5. Validation Evidence

| Check | Command | Result |
|-------|---------|--------|
| API tsc | `npx tsc --noEmit` (apps/api) | 0 errors |
| Web tsc | `npx tsc --noEmit` (apps/web) | 0 errors |
| API jest | `npx jest --no-coverage` (apps/api) | 53 suites, 854 tests pass |
| Web lint | `npx next lint` (apps/web) | No ESLint warnings or errors |
| Web build | `npx next build` (apps/web) | All pages generated |
| SIM_ runtime grep | `grep "export const SIM_" *.ts *.tsx` | 0 matches |
| SIM_ import grep | `grep "import.*SIM_" *.tsx` | 0 matches |

---

## 6. Summary

### What's Resolved (18/18 original items)
All 18 items from the Zero-Simulasi register are resolved. Each has either:
- A live backend endpoint feeding real data, OR
- An honest empty-state (no fake fallback data)

### What's Still Simulated (6 newly discovered — Wave 2)
The audit found 6 additional simulation surfaces that were NOT in the original register. These use non-`SIM_`-prefixed variable names (e.g., `TUGAS_DATA`, `MAPEL_PROG`, `CP_RAPOR`) and thus escaped the original grep-based detection.

**Priority for Wave 2:**
1. **W2-03 (PenugasanGuru)** — HIGHEST: entire assignment/submission UI is fake; needs `/submissions` backend domain
2. **W2-01/W2-02 (CP Progress)** — MEDIUM: needs `/cp-progress` aggregation endpoint
3. **W2-04 (KehadiranGuru rekap)** — MEDIUM: needs `/attendance/sessions` aggregation endpoint
4. **W2-05/W2-06** — LOW: rendering edge cases and text fixes

### SSE Auth Gap
The `EventSource` API cannot send custom headers. The SSE endpoint is behind `KeycloakGuard` which expects a Bearer token. In production, the browser session cookie from NextAuth may not be forwarded to the API domain. This needs either:
- An EventSource polyfill that supports headers (e.g., `event-source-polyfill`), OR
- A token-via-query-param pattern (`?token=xxx`), OR
- A cookie-based session bridge between web and API domains
