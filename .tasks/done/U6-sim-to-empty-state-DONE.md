# U6 — SIM-to-EmptyState Refactoring (7 Components)

**Ref:** SIM-1 through SIM-6 | **Source plans:** PLAN-LIFECYCLE Task 6 + PLAN-NEXT-SESSION FASE B (merged)
**Priority:** P3-MEDIUM

**Mulai:** 2026-07-04 | **Selesai:** 2026-07-04 | **Durasi aktual:** ~1 jam

---

## Summary

Refactored 7 SIM constant fallbacks to honest empty states for components whose backends are fully wired. Pattern: `realData ?? SIM_CONSTANT` → `realData ?? EMPTY_STATE`.

---

## Components Refactored

| # | Component | SIM Constant Removed | New Empty State |
|---|---|---|---|
| 1 | KS Health Score | `SIM_HEALTH` | "Skor belum tersedia — menunggu data nilai dan kehadiran" |
| 2 | KS Tren Kehadiran fallback | `SIM_TREN_SISWA/GURU` (6 arrays) | "Belum ada data tren kehadiran" |
| 3 | KS RPP Turnaround | `SIM_RPP_SLOW` | Hardcoded `0` (computed value placeholder) |
| 4 | Siswa Daily Quest fallback | `SIM_DAILY_QUEST` | `{ title: 'Daily Quest', tasks: [] }` |
| 5 | Siswa Calendar fallback | `SIM_KALENDER` | `[]` (empty array) |
| 6 | Ortu Timeline fallback | `SIM_TIMELINE` | "Timeline pembelajaran akan tersedia menyusul" |
| 7 | Ortu Timeline "Contoh" badge | "Contoh" badge | Removed entirely |

## Files Changed

- `KsWorkspace.tsx` — Removed 8 SIM constant definitions (SIM_HEALTH, SIM_TREN_*, SIM_RPP_SLOW), replaced health score gauge with empty state, replaced tren fallback with empty state, hardcoded RPP turnaround to 0
- `siswa/SiswaWorkspace.tsx` — Removed SIM_DAILY_QUEST and SIM_KALENDER imports, replaced fallbacks with empty objects/arrays, added SiswaKalenderEvent type import for proper typing
- `ortu/CapaianOrtu.tsx` — Removed SIM_TIMELINE import, removed "Contoh" badge, replaced timeline section with conditional (real data or empty state)

## SIM Constants Intentionally KEPT (genuinely Fase 2)

| Component | Reason |
|---|---|
| SIM_SUMATIF | Used as type anchor `typeof SIM_SUMATIF` for real assessment data |
| SIM_KKTP_DATA | Used as initial values before backend fetch completes |
| SIM_SCHED_CONFIG/CONFLICTS | Deferred feature (GAP-1 manual scheduling) |
| SIM_GURU_LIST | Used in filter dropdown |
| SIM_MON_GURUS | Used in genSimMonitor fallback |
| ModulAjarForm AI Generate | Needs AI gateway per-step |
| BadgeCelebration "Contoh" | Needs real badge trigger event |
| Kiosk TTS/Absen "Fase 2" | Needs WebSocket/realtime modules |

---

## Validation

```
tsc --noEmit → 0 errors
eslint --max-warnings=0 → 0 errors, 0 warnings
next build → 29/29 pages OK
```

## Status: ✅ DONE
