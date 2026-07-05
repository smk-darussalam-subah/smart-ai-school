# Wave 2 Zero-Simulasi Resolution Program — GURU Full-Stack Live Data

> **Dibuat:** 2026-07-05 (updated 2026-07-05 dengan scope Wali Kelas + Fase 2 detection)
> **Sumber:** `AUDIT-Zero-Simulasi-Report.md` §2 + investigasi production GURU dashboard
> **Prasyarat:** Zero-Simulasi Wave 1 (P0-P6) sudah merged to main (PR #305, #306)
> **Tujuan:** Menghapus SEMUA hardcoded data arrays + mengaktifkan SEMUA fitur bertanda "menyusul"/"Fase 2" di dashboard GURU, termasuk peran sebagai WALI KELAS

---

## Prompt Sesi Baru (siap tempel)

```
Halo. anda adalah tim profesional Full-Stack engineer expert top global papan atas, Lanjutkan sebagai Senior Full-Stack Engineer DIIS untuk proyek Smart AI School
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
- Wave 2: 14 item ditemukan — 6 hardcoded arrays + 3 "menyusul" features +
  3 wali kelas gaps + 2 infrastructure fixes.

TUGAS: Eksekusi Wave 2 Resolution Plan (.tasks/PLAN-Wave2-Zero-Simulasi.md).
Serial execution per priority tier. Setelah setiap perubahan: tsc + lint + build.

PENTING — KONTEKS PRODUKSI:
- Saat login sebagai GURU di prod, Kehadiran → Rekap Per Sesi menampilkan
  "Rekap per-sesi akan tersedia menyusul" karena SESI_REKAP adalah hardcoded array.
  Backend kehadiran NYATA (POST /attendance) sudah aktif — data absensi tersimpan.
  Yang belum ada adalah endpoint AGREGASI per-sesi (group by class+subject+date).
- Siswa Perlu Perhatian dan Tren 10 Hari juga hardcoded (ATT_ATTENTION, TREND_POINTS).
- PenugasanGuru SELURUHNYA hardcoded (TUGAS_DATA, PENGUMPULAN).
- CP Progress di PembelajaranGuru dan CapaianRapor juga hardcoded.

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

## 1. Wave 2 Register — Comprehensive (14 items)

### Tier 1 — GURU Hardcoded Arrays (CRITICAL: renders fake data in prod)

| # | Component / File | Hardcoded Array | What's Fake | Backend Status | Priority |
|---|-----------------|-----------------|-------------|----------------|----------|
| **W2-01** | `KehadiranGuru.tsx` L17-24 | `SESI_REKAP` (6 rows) | Rekap kehadiran per sesi: tanggal, mapel, kelas, H/I/S/A counts, keterangan | **MISSING** — `/attendance/sessions` aggregation endpoint | P1-CRITICAL |
| **W2-02** | `KehadiranGuru.tsx` L26-31 | `ATT_ATTENTION` (4 students) | Siswa perlu perhatian: nama, kelas, alasan | Derivable from same `/attendance/sessions` | P1-CRITICAL |
| **W2-03** | `KehadiranGuru.tsx` L40 | `TREND_POINTS` (SVG path) | Tren kehadiran 10 hari sparkline | Derivable from `/attendance` data | P1-CRITICAL |
| **W2-04** | `PenugasanGuru.tsx` L23-27 | `TUGAS_DATA` (3 items) | Entire tugas list: judul, mapel, kelas, tenggat, kumpul/dinilai/total | **MISSING** — `/submissions` domain | P1-CRITICAL |
| **W2-05** | `PenugasanGuru.tsx` L29-34 | `PENGUMPULAN` (4 rows) | Submission table: siswa, status, berkas, nilai | **MISSING** — `/submissions` detail | P1-CRITICAL |
| **W2-06** | `PembelajaranGuru.tsx` L48-52 | `MAPEL_PROG` (3 items) | CP progress per mapel: progres %, TP count | **MISSING** — `/cp-progress` endpoint | P2-HIGH |
| **W2-07** | `PembelajaranGuru.tsx` L55-60 | `CP_DATA` (4 items) | Ketercapaian per CP: desc, progres % | Same `/cp-progress` endpoint | P2-HIGH |
| **W2-08** | `CapaianRapor.tsx` L34-39 | `CP_RAPOR` (4 items) | CP progress grid in rapor view | Same `/cp-progress` endpoint | P2-HIGH |

### Tier 2 — "Menyusul" Features (MEDIUM: honest empty now, needs backend later)

| # | Component / File | Feature | Current Text | Backend Needed | Priority |
|---|-----------------|---------|--------------|----------------|----------|
| **W2-09** | `RaporModal.tsx` L201,209 | Muatan Lokal + Ekstrakurikuler sections | "Data muatan lokal akan tersedia menyusul" | `/report-cards` section C+E endpoints | P3-MEDIUM |
| **W2-10** | `RaporModal.tsx` L245-247 | Deskripsi perkembangan kompetensi | "Deskripsi akan tersedia saat rapor diterbitkan" | Section F endpoint (already wired in T2-01, needs prod data) | P3-MEDIUM |
| **W2-11** | `PembelajaranGuru.tsx` L341 | Bank soal & kuis diagnostik | "Kuis diagnostik & bank soal menyusul" | Assessment sessions UI for GURU | P4-LOW |

### Tier 3 — Wali Kelas Specific Gaps

| # | Component / File | Gap | Detail | Priority |
|---|-----------------|-----|--------|----------|
| **W2-12** | `RaporWaliKelas.tsx` | Wali kelas detection | `waliClasses` passed as prop but `isWaliKelas` field from Teacher model unused — need to detect which guru is actually wali kelas for a class | P2-HIGH |
| **W2-13** | `AkademikWorkspace.tsx` L257 | Rapor Kelas tab visibility | Tab always visible to all GURU; should only show for guru with `isWaliKelas=true` or who have wali classes assigned | P2-HIGH |
| **W2-14** | `KehadiranGuru.tsx` L42-53 | Wali kelas cross-class view | Currently filters by `className` prop; wali kelas should see ALL attendance for their homeroom class, not just their subject assignments | P3-MEDIUM |

### Tier 4 — Infrastructure

| # | Item | Gap | Priority |
|---|------|-----|----------|
| **W2-15** | SSE Auth (EventSource + Keycloak Bearer) | `EventSource` can't send headers; SSE endpoint will 401 in prod | P2-HIGH |
| **W2-16** | KsWorkspace empty-state rendering | When `realRekap`/`realMonData` empty, shows empty `<tbody>` instead of centered message | P4-LOW |

---

## 2. Resolution Phases

### Phase W2-A — Backend Endpoints (4 new)

#### W2-A-1: `GET /attendance/sessions` (for W2-01, W2-02, W2-03)

**Jawaban langsung:** Absen kehadiran GURU sudah AKTIF — `POST /attendance` live dan tersimpan di DB.
Yang belum ada adalah **agregasi per-sesi** (group by class+subject+date).

**RBAC:** GURU (own sessions), SUPER_ADMIN, KEPALA_SEKOLAH
**Query:** `classId?`, `subject?`, `from`, `to`
**Service:** Aggregate existing `Attendance` records grouped by date+class+subject:
```sql
SELECT date, class.name, teaching_assignment.subject,
  COUNT(*) FILTER (WHERE status='hadir') as hadir,
  COUNT(*) FILTER (WHERE status='izin') as izin,
  COUNT(*) FILTER (WHERE status='sakit') as sakit,
  COUNT(*) FILTER (WHERE status='alpha') as alpha
FROM attendance
GROUP BY date, class_id, subject
```
**Returns:**
```json
{
  "sessions": [{ "date", "subject", "className", "hadir", "izin", "sakit", "alpha", "total", "pct", "notes" }],
  "attention": [{ "studentName", "className", "subject", "alphaCount", "reason" }],
  "trend": [{ "date", "pct" }]  // 10-day series
}
```
**Files:** Extend `apps/api/src/attendance/attendance.service.ts` + controller

#### W2-A-2: `GET /submissions` + `GET /submissions/:id/details` (for W2-04, W2-05)

**RBAC:** GURU (own assignments), SUPER_ADMIN, KEPALA_SEKOLAH
**Query:** `classId?`, `subject?`, `status?`
**Service:** Aggregate from `AssessmentSession` (type: formatif) + `AssessmentResponse`:
- Tugas list: sessions with their submission counts
- Submission detail: per-student status + score from AssessmentResponse
**Returns:** `{ data: [{ id, title, subject, className, deadline, submitted, graded, total, status }], total }`
**Detail:** `{ students: [{ name, status, fileName, score }] }`
**Files:** New `apps/api/src/submission/` module OR extend `assessment/` module

#### W2-A-3: `GET /analytics/cp-progress` (for W2-06, W2-07, W2-08)

**RBAC:** GURU (own classes), SUPER_ADMIN, KEPALA_SEKOLAH, SISWA (own class)
**Query:** `classId`, `academicYear`, `semester`
**Service:** Aggregate from `Grade` + `AssessmentResponse` + `LmsModuleProgress`:
- Per-mapel progress: average NA per subject → tuntas %
- Per-CP breakdown: group by CP (from RPP body) → achievement %
**Returns:** `{ mapelProgress: [...], cpBreakdown: [...] }`
**Files:** Extend `apps/api/src/analytics/analytics.service.ts`

#### W2-A-4: `GET /teachers/me/wali-classes` (for W2-12, W2-13)

**RBAC:** GURU
**Service:** Query `Teacher.isWaliKelas` + `Class` where `waliKelasTeacherId = teacherId`
**Returns:** `{ classes: [{ id, name, majorCode, grade }] }`
**Files:** Extend `apps/api/src/teacher-attendance/` or new `wali-kelas/` endpoint in student/teacher module

---

### Phase W2-B — Frontend Wiring (8 items)

#### W2-B-1: KehadiranGuru.tsx (W2-01, W2-02, W2-03) — P1-CRITICAL
- Delete `SESI_REKAP` + `ATT_ATTENTION` + `TREND_POINTS` hardcoded arrays
- Add `useEffect` → `fetchAttendanceSessions(classId, from, to)`
- Server action in `actions.ts`
- Render real rekap table from API sessions array
- Render attention list from API attention array (alphaCount > threshold)
- Render sparkline from API trend array (10 data points → SVG polyline)
- Empty-state: "Belum ada data kehadiran per sesi"

#### W2-B-2: PenugasanGuru.tsx (W2-04, W2-05) — P1-CRITICAL
- Delete `TUGAS_DATA` + `PENGUMPULAN` arrays
- Add `useEffect` → `fetchSubmissions(classId, subject)`
- Wire "Tugas Baru" button: link to assessment session creation flow (or disable with honest label)
- Render real tugas list from API data
- Click tugas → fetch submission details → render real submission table
- Replace "Simulasi" toasts with real actions or honest "menyusul" labels
- Empty-state: "Belum ada tugas. Buat sesi asesmen dari modul pembelajaran."

#### W2-B-3: PembelajaranGuru.tsx (W2-06, W2-07) — P2-HIGH
- Delete `MAPEL_PROG` + `CP_DATA` arrays
- Add `useEffect` → `fetchCpProgress(classId, academicYear, semester)`
- Server action in `actions.ts`
- Render real progress or honest empty-state

#### W2-B-4: CapaianRapor.tsx (W2-08) — P2-HIGH
- Delete `CP_RAPOR` array
- Same `fetchCpProgress` endpoint
- Render real CP grid or honest empty-state

#### W2-B-5: Wali Kelas Detection (W2-12, W2-13, W2-14) — P2-HIGH
- Add `GET /teachers/me/wali-classes` call on AkademikWorkspace mount
- Conditionally show "Rapor Kelas" tab only when `waliClasses.length > 0`
- Pass waliClasses to RaporWaliKelas component (already wired from U1)
- KehadiranGuru: add toggle for wali kelas to see cross-subject attendance for their homeroom class

#### W2-B-6: Remaining text/UI fixes (W2-09, W2-10, W2-11, W2-16) — P3/P4
- RaporModal: keep honest empty-states (sections C, E, F) — these are legitimately "menyusul"
- PembelajaranGuru: update "menyusul" text for bank soal
- KsWorkspace: add centered empty-state message for empty tables

---

### Phase W2-C — SSE Auth Fix (Infrastructure, W2-15)

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
W2-A-1 (attendance sessions backend) ──── W2-B-1 (KehadiranGuru: rekap + attention + tren)
W2-A-2 (submissions backend)         ──── W2-B-2 (PenugasanGuru: tugas list + submission detail)
W2-A-3 (cp-progress backend)         ──┬── W2-B-3 (PembelajaranGuru: mapel progress + CP breakdown)
                                       └── W2-B-4 (CapaianRapor: CP grid)
W2-A-4 (wali-classes backend)        ──── W2-B-5 (AkademikWorkspace: tab visibility + wali detection)
W2-C (SSE auth)                      ──── independent
W2-B-6 (text/UI fixes)               ──── independent (frontend only)
```

**Execution order (serial within tier, parallel across tiers):**
1. **P1-CRITICAL:** W2-A-1 → W2-B-1 (Kehadiran), W2-A-2 → W2-B-2 (Penugasan)
2. **P2-HIGH:** W2-A-3 → W2-B-3 + W2-B-4 (CP progress), W2-A-4 → W2-B-5 (Wali kelas), W2-C (SSE auth)
3. **P3-MEDIUM + P4-LOW:** W2-B-6 (text fixes)

---

## 4. Engineering Standards

Same as Zero-Simulasi P0-P6 (see `PLAN-CONSOLIDATED-2026.md` §6):
- Validation per change: `tsc --noEmit` 0, `eslint --max-warnings=0` 0, `next build` 29/29, `jest` green
- Pattern: `realData ?? EMPTY_STATE` (never hardcoded fallback)
- Gitflow: `feat/wave2-*` → staging → main via PR
- Zod DTOs, Prisma enums lowercase, React hooks unconditional
- Import `KKTP_DEFAULT`, `NA_WEIGHTS`, `JP_SLOTS` from lib/ — JANGAN hardcode
- 401 → `redirect('/login?reason=session')` + re-throw `NEXT_REDIRECT`

---

## 5. Definition of Done

- [ ] grep `SESI_REKAP\|ATT_ATTENTION\|TREND_POINTS\|TUGAS_DATA\|PENGUMPULAN\|MAPEL_PROG\|CP_DATA\|CP_RAPOR` in *.tsx = 0 matches
- [ ] All 16 Wave 2 items show real data or honest empty-state
- [ ] 4 new backend endpoints live with correct RBAC:
  - `GET /attendance/sessions` (GURU/KS/SA)
  - `GET /submissions` + `GET /submissions/:id/details` (GURU/KS/SA)
  - `GET /analytics/cp-progress` (GURU/KS/SA/SISWA)
  - `GET /teachers/me/wali-classes` (GURU)
- [ ] SSE auth gap resolved (token-via-query or polyfill)
- [ ] Wali kelas tab visibility conditional on `waliClasses.length > 0`
- [ ] `tsc 0 + eslint 0 + jest green + next build OK`
- [ ] PR merged to staging then main
- [ ] AUDIT-Zero-Simulasi-Report.md updated with Wave 2 closure

---

## 6. Estimasi

| Phase | Scope | Estimasi |
|-------|-------|----------|
| W2-A-1 | `/attendance/sessions` backend | ~3 jam |
| W2-A-2 | `/submissions` backend (new module) | ~4 jam |
| W2-A-3 | `/analytics/cp-progress` backend | ~3 jam |
| W2-A-4 | `/teachers/me/wali-classes` backend | ~1 jam |
| W2-B-1 | KehadiranGuru wiring (3 arrays → real) | ~2 jam |
| W2-B-2 | PenugasanGuru wiring (2 arrays → real) | ~2.5 jam |
| W2-B-3 | PembelajaranGuru wiring | ~1.5 jam |
| W2-B-4 | CapaianRapor wiring | ~1 jam |
| W2-B-5 | Wali kelas detection + tab visibility | ~1.5 jam |
| W2-B-6 | Text/UI fixes | ~0.5 jam |
| W2-C | SSE auth fix | ~1.5 jam |
| **Total** | | **~21.5 jam** |
