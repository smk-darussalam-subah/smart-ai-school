# Wave 2 Zero-Simulasi Resolution Program — Non-Prefixed Hardcoded Data Purge

> **Dibuat:** 2026-07-05
> **Sumber:** `AUDIT-Zero-Simulasi-Report.md` §2 (Wave 2 findings)
> **Prasyarat:** Zero-Simulasi P0-P6 sudah merged to main (PR #305, #306)
> **Tujuan:** Menghapus 6 hardcoded data arrays yang lolos dari audit Wave 1 karena tidak menggunakan prefix `SIM_`

---

## Prompt Sesi Baru (siap tempel)

```
Halo. Lanjutkan sebagai Senior Full-Stack Engineer DIIS untuk proyek Smart AI School
(SMK Darussalam Subah). Saya Kang Sholah — Direktur, Arsitek, & Decision Maker.

SEBELUM mengerjakan apa pun, baca konteks ini dulu:
1. MEMORY.md + seluruh file di folder memory.
2. CLAUDE.md di root repo (stack IMMUTABLE, 7 role, conventions).
3. .tasks/AUDIT-Zero-Simulasi-Report.md — hasil audit Wave 1 + temuan Wave 2.
4. .tasks/PLAN-Wave2-Zero-Simulasi.md — plan ini.

STATUS TERKINI:
- Zero-Simulasi Wave 1 (P0-P6): PRODUCTION (PR #305→staging, #306→main).
  Semua 18 SIM_-prefixed constants purged. 4 backend endpoints live.
  API tsc 0 + jest 854. Web tsc 0 + lint clean + build OK.
- Wave 2: 6 NON-SIM_-prefixed hardcoded arrays ditemukan dalam audit.
  Variabel seperti TUGAS_DATA, MAPEL_PROG, CP_RAPOR, SESI_REKAP.

TUGAS: Eksekusi Wave 2 Resolution Plan (.tasks/PLAN-Wave2-Zero-Simulasi.md).
Serial execution: W2-01 → W2-06. Setelah setiap perubahan: tsc + lint + build.

ATURAN WAJIB:
- Baca CLAUDE.md, lib/academic.ts, lib/bell-times.ts SEBELUM coding.
- Import KKTP_DEFAULT, NA_WEIGHTS, JP_SLOTS dari lib/ — JANGAN hardcode.
- React Hooks: JANGAN conditional useMemo (error #300!).
- Pattern: realData ?? EMPTY_STATE (bukan hardcoded fallback).
- Gitflow: feat/wave2-* → staging → main via PR, CI wajib hijau.
- Validation: tsc 0, eslint 0, next build OK setelah setiap perubahan.
- Hapus hardcoded array → ganti dengan real backend atau honest empty-state.
```

---

## 1. Wave 2 Register — Verified from Audit

| # | Component / File | Hardcoded Array | Lines | What's Fake | Backend Status |
|---|-----------------|-----------------|-------|-------------|----------------|
| **W2-01** | `PembelajaranGuru.tsx` L48-60 | `MAPEL_PROG` + `CP_DATA` | 2 arrays | CP progress per mapel, ketercapaian per CP | **MISSING** — `/cp-progress` endpoint |
| **W2-02** | `CapaianRapor.tsx` L34-39 | `CP_RAPOR` | 1 array | CP progress grid in rapor view | **MISSING** — `/cp-progress` endpoint |
| **W2-03** | `PenugasanGuru.tsx` L23-34 | `TUGAS_DATA` + `PENGUMPULAN` | 2 arrays | Entire tugas list + submission table | **MISSING** — `/submissions` domain |
| **W2-04** | `KehadiranGuru.tsx` L92+ L119+ | `SESI_REKAP` + `ATT_ATTENTION` | 2 arrays | Per-session rekap + attention list | **MISSING** — `/attendance/sessions` endpoint |
| **W2-05** | `KsWorkspace.tsx` empty rendering | N/A | — | Empty table rows when API empty | UI polish |
| **W2-06** | `PenugasanGuru.tsx` L65 | Toast text | — | "Simulasi" in toast message | Text fix |

---

## 2. Resolution Phases

### Phase W2-A — Backend Endpoints (3 new)

> W2-01/W2-02 share `/cp-progress`, W2-03 needs `/submissions`, W2-04 needs `/attendance/sessions`.

#### W2-A-1: `GET /analytics/cp-progress` (for W2-01 + W2-02)

**RBAC:** SUPER_ADMIN, KEPALA_SEKOLAH, GURU (own classes), SISWA (own class)
**Query:** `classId`, `academicYear`, `semester`
**Service:** Aggregate from `Grade` + `AssessmentResponse` + `LmsModuleProgress` to compute CP/TP achievement percentages per mapel.
**Returns:** `{ mapelProgress: [{ mapel, progres, tpCompleted, tpTotal }], cpBreakdown: [{ cp, desc, progres }] }`
**Files:** `apps/api/src/analytics/analytics.service.ts`, `analytics.controller.ts`

#### W2-A-2: `GET /submissions` (for W2-03)

**RBAC:** GURU (own assignments), SUPER_ADMIN, KEPALA_SEKOLAH
**Query:** `classId`, `subject`, `status` (active/graded/all), `page`, `limit`
**Service:** Aggregate from existing `AssessmentSession` (type: formatif/sumatif) + `AssessmentResponse` to build tugas list with submission counts.
**Returns:** `{ data: [{ id, title, subject, className, deadline, submitted, graded, total, status }], total, page, limit }`
**Files:** New `apps/api/src/submission/` module (or extend `assessment/`)

#### W2-A-3: `GET /attendance/sessions` (for W2-04)

**RBAC:** GURU (own sessions), SUPER_ADMIN, KEPALA_SEKOLAH
**Query:** `classId`, `from`, `to`
**Service:** Aggregate `Attendance` records per session (class+subject+date) with H/I/S/A counts + attention list (alpha > threshold).
**Returns:** `{ sessions: [{ date, subject, className, meeting, hadir, izin, sakit, alpha, pct }], attention: [{ name, kelas, mapel, alphaCount }] }`
**Files:** Extend `apps/api/src/attendance/attendance.service.ts`

---

### Phase W2-B — Frontend Wiring (6 items)

#### W2-B-1: PembelajaranGuru.tsx (W2-01)
- Delete `MAPEL_PROG` + `CP_DATA` arrays
- Add `useEffect` → `fetchCpProgress(classId, academicYear, semester)`
- Server action in `actions.ts`
- Render real progress or honest empty-state: "Data progres CP akan tersedia saat nilai aktif"

#### W2-B-2: CapaianRapor.tsx (W2-02)
- Delete `CP_RAPOR` array
- Add `useEffect` → `fetchCpProgress(classId, academicYear, semester)` (same endpoint)
- Render real CP grid or honest empty-state

#### W2-B-3: PenugasanGuru.tsx (W2-03)
- Delete `TUGAS_DATA` + `PENGUMPULAN` arrays
- Add `useEffect` → `fetchSubmissions(classId, subject)`
- Wire "Tugas Baru" button to real create flow (or disable with honest label)
- Render real tugas list + submission table or empty-state
- Fix toast text (W2-06)

#### W2-B-4: KehadiranGuru.tsx (W2-04)
- Delete `SESI_REKAP` + `ATT_ATTENTION` arrays
- Add `useEffect` → `fetchAttendanceSessions(classId, from, to)`
- Render real rekap table + attention list or empty-state

#### W2-B-5: KsWorkspace empty rendering (W2-05)
- Add proper empty-state UI when `realRekap` or `realMonData` is empty array
- Replace empty `<tbody>` with centered "Belum ada data" message

#### W2-B-6: PenugasanGuru toast text (W2-06)
- Replace "Simulasi" text in toast with "Fitur akan tersedia menyusul"

---

### Phase W2-C — SSE Auth Fix (Infrastructure)

The SSE endpoint (`GET /assessment/sessions/:id/stream`) uses `EventSource` which cannot send `Authorization: Bearer` headers. In production with Keycloak Bearer token auth, this will fail.

**Resolution options (pick one):**
1. **EventSource polyfill** — `npm install event-source-polyfill` in apps/web; pass token via custom headers
2. **Token-via-query** — Accept `?token=xxx` on SSE endpoint, validate server-side
3. **Short-lived SSE ticket** — `POST /assessment/sessions/:id/stream-ticket` returns a short-lived (60s) ticket UUID; SSE endpoint validates ticket without Bearer header

**Recommended:** Option 2 (token-via-query) — simplest, no new deps, server-side validation reuses existing token verification.

**Files:** `apps/api/src/auth/` (add query-token guard), `PenilaianSesiModal.tsx` (pass token in URL)

---

## 3. Dependency Graph

```
W2-A-1 (cp-progress backend) ──┬── W2-B-1 (PembelajaranGuru)
                               └── W2-B-2 (CapaianRapor)
W2-A-2 (submissions backend) ──── W2-B-3 (PenugasanGuru) ── W2-B-6 (toast text)
W2-A-3 (attendance sessions) ──── W2-B-4 (KehadiranGuru)
W2-C (SSE auth) ──────────────── independent
W2-B-5 (empty rendering) ─────── independent (frontend only)
```

**Execution order:** W2-A-1 → W2-A-2 → W2-A-3 (backend, serial) → W2-B-1 through W2-B-6 (frontend, can parallel) → W2-C (infra)

---

## 4. Engineering Standards

Same as Zero-Simulasi P0-P6 (see `PLAN-CONSOLIDATED-2026.md` §6):
- Validation per change: `tsc --noEmit` 0, `eslint --max-warnings=0` 0, `next build` 29/29, `jest` green
- Pattern: `realData ?? EMPTY_STATE` (never hardcoded fallback)
- Gitflow: `feat/wave2-*` → staging → main via PR
- Zod DTOs, Prisma enums lowercase, React hooks unconditional

---

## 5. Definition of Done

- [ ] grep `TUGAS_DATA\|PENGUMPULAN\|MAPEL_PROG\|CP_DATA\|CP_RAPOR\|SESI_REKAP\|ATT_ATTENTION` in *.tsx = 0 matches
- [ ] All 6 Wave 2 items show real data or honest empty-state
- [ ] 3 new backend endpoints live with correct RBAC
- [ ] SSE auth gap resolved
- [ ] `tsc 0 + eslint 0 + jest green + next build OK`
- [ ] PR merged to staging then main
- [ ] AUDIT-Zero-Simulasi-Report.md updated with Wave 2 closure

---

## 6. Estimasi

| Phase | Estimasi |
|-------|----------|
| W2-A (3 backend endpoints) | ~6 jam |
| W2-B (6 frontend wirings) | ~4 jam |
| W2-C (SSE auth) | ~1.5 jam |
| **Total** | **~11.5 jam** |
