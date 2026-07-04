# U3-U5 — B-Endpoint Wiring (KKTP, Ortu Wali Kelas, Siswa Calendar)

**Ref:** GAP-2 (KKTP), GAP-3 (Ortu Wali Kelas), GAP-4 (Siswa Calendar) | **Source plans:** PLAN-LIFECYCLE Task 3+4+5 ≡ PLAN-NEXT-SESSION A3+A2+A1 (exact duplicates — merged)
**Priority:** P2-HIGH

**Mulai:** 2026-07-04 | **Selesai:** 2026-07-04 | **Durasi aktual:** ~1.5 jam total

**Consolidation note:**
These 3 tasks were exact duplicates between PLAN-LIFECYCLE and PLAN-NEXT-SESSION. Merged into single execution batch since they are independent (different files, no collision).

---

## U3: Wire B5 KKTP "Simpan" (GAP-2)

**Files changed:**
- `KsWorkspace.tsx` — `KktpKs` component:
  - Added imports: `fetchKktpConfigs`, `saveKktpConfig` from actions
  - Added `academicYear` and `semester` props
  - Added `useEffect` to fetch existing KKTP configs on mount
  - Replaced SIM toast handler with real `saveKktpConfig()` loop using `useTransition`
  - Removed "SIMULASI — backend /kktp-config belum tersedia" amber banner
  - Added loading state ("Memuat konfigurasi KKTP...")
  - Added saving state ("Menyimpan..." on button)
  - Values now load from backend first, then user overrides apply

**Bukti Runtime:** tsc 0 · eslint 0 · build 29/29 OK

---

## U4: Wire B4 Ortu Wali Kelas Contact (GAP-3 simplified)

**Files changed:**
- `ortu/BerandaOrtu.tsx`:
  - Added imports: `useEffect`, `useState`, `UserCircle`, `Phone`, `Mail` icons
  - Added import: `fetchTeachers` from actions
  - Added `useEffect` to fetch teachers on mount, pick first (wali kelas)
  - Added new "Wali Kelas" section (section 9) with:
    - Avatar with initial
    - Name + subject display
    - Clickable phone (`tel:`) and email (`mailto:`) links
    - Empty state: "Wali kelas akan tersedia menyusul"

**Bukti Runtime:** tsc 0 · eslint 0 · build 29/29 OK

---

## U5: Wire B2 Siswa Personal Calendar (GAP-4)

**Files changed:**
- `siswa/SiswaWorkspace.tsx`:
  - Added import: `fetchPersonalCalendar` from actions
  - Added `realCalendar` state
  - Added `useEffect` to fetch personal calendar on mount
  - Changed JadwalSiswa `kalender` prop: `SIM_KALENDER` → `realCalendar ?? SIM_KALENDER`
  - When API returns schedule data, it replaces SIM fallback
  - When API returns empty/null, SIM_KALENDER remains as fallback (will be refactored in U6)

**Bukti Runtime:** tsc 0 · eslint 0 · build 29/29 OK

---

## Combined Validation

```
tsc --noEmit --project apps/web/tsconfig.json → EXIT_CODE: 0 (0 errors)
eslint --max-warnings=0 → EXIT_CODE: 0 (0 errors, 0 warnings)
next build → 29/29 pages OK
```

---

## Status: ✅ DONE (all 3 tasks)

All B-endpoints now wired to their respective frontend components. Backend endpoints + server actions already existed (T3-02); only frontend consumption was missing.
