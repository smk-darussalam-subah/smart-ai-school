# Wave 7 Phase 6 - Semester Closing Remediation

Tanggal: 2026-08-20

Branch: `feat/wave7-phase6-semester-closing-20260820`

Base: `origin/develop`

Status eksekutor: source follow-up, migration validation, historical report follow-up, automated tests, PostgreSQL disposable matrix, concurrency proof, immutability proof, CSV snapshot proof, dan cleanup disposable selesai. Belum ada commit, push, PR, deploy, atau staging/production mutation.

## Gate Status

- Worktree: `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school-wave7-semester-closing-20260820`
- Prompt: `docs/audits/PROMPT-ARCHITECT-WAVE7-PHASE6-SEMESTER-CLOSING-2026-08-20.md`
- Reviewer reports:
  - `docs/audits/WAVE7-PHASE6-SEMESTER-CLOSING-SOURCE-REVIEW-2026-08-20.md`
  - `docs/audits/WAVE7-PHASE6-SEMESTER-CLOSING-SOURCE-REREVIEW-2026-08-20.md`
- Staged changes: none.
- Production, staging, Keycloak, and shared databases: not touched.
- Recommendation: return to independent reviewer for source/database re-review. Do not Git package until reviewer approval.

## Initial Finding Closure

| Finding | Closure |
|---|---|
| Generic endpoint can deactivate active period | Closed. Generic `isActive` mutation is fail-closed for active academic year/semester, including `true -> true` and `true -> false`. Bootstrap is only allowed when no active year/semester exists. |
| UI reads stable JWT role instead of active Appointment | Closed. Page uses effective dashboard authority from `/auth/me`, `/positions/my-positions`, and view-as resolver. Backend scope also resolves active Appointment authority. |
| Readiness false-ready | Closed. Expected assignment is a union of schedule, approved RPP, LMS, and assessment sources. Report-card completion uses active-student set comparison. |
| Final report unavailable | Closed. Snapshot now includes class heatmap, major heatmap, subject KKTP compliance, and CP/TP/ATP map. |
| Write barrier fail-open | Closed. `AcademicPeriodService` is mandatory in domain services and optional chaining was removed. |
| PostgreSQL proof incomplete | Closed for source/database gate. Real service proof now covers stale hash, blockers, concurrent different keys, same-key/different-payload, closed-period barrier, immutable snapshot, and CSV-from-snapshot. |
| Stale/duplicate/error/history UX | Closed source. Client has synchronous request guard, stale timer, stale check at submit time, error styling, confirmation dialog, and history refresh. |
| Raw idempotency/internal metadata exposed | Closed. Public close/detail projection strips raw key and internal snapshot metadata. |

## Re-review Finding Closure

| Finding | Closure | Evidence |
|---|---|---|
| P1-R01 final statistics counted live `Grade` rows | Closed. Final report statistics now use only `ReportCard.grades` from distributed report-card snapshots. A student/subject contributes at most one final score. Malformed or duplicate snapshot grades become readiness blockers. | `apps/api/src/semester-closing/semester-closing.service.ts`, `apps/api/src/__tests__/semester-closing.spec.ts` |
| P1-R02 CP/TP/ATP map was only counts | Closed. Curriculum snapshot now parses `cp`, `tp[]`, and `atp[].tpRef/indikator`; stores PII-minimal TP refs, mapped/unmapped ATP counts, and invalid reason codes. Legacy KI/KD/KD keys, missing TP refs, unknown TP refs, missing indicators, and duplicate TP refs are fail-closed via readiness blocker. | `apps/api/src/semester-closing/semester-closing.service.ts`, `apps/web/src/app/dashboard/penutupan-semester/_components/SemesterClosingClient.tsx` |
| P1-R03 base TU + active KAPROG could see school snapshot | Closed. Closure detail/export filtering uses active Appointment codes. `SUPER_ADMIN` and active KS/WAKA remain school-scope; active KAPROG, including base TU + KAPROG, is filtered to major snapshots. | `apps/api/src/semester-closing/semester-closing.service.ts`, `apps/api/src/__tests__/semester-closing.spec.ts` |
| P1-R04 orphan/null-class/missing-subject and cross-year overlap could pass | Closed. Source coverage checks exact-period sources before active-class filtering and classifies missing class, class outside period, inactive class, out-of-scope class, missing subject, and missing TeachingAssignment. Semester overlap check is global across academic years. | `apps/api/src/semester-closing/semester-closing.service.ts`, `apps/api/src/__tests__/semester-closing.spec.ts` |
| P1-R05 PostgreSQL proof matrix incomplete | Closed. Matrix proof on disposable PostgreSQL now covers stale hash, key berbeda, blocker rollback, closed-period mutation barrier, snapshot immutability after live data/config mutation, and CSV-from-snapshot. | PostgreSQL section below |
| P2-R01 view-as still showed real Appointment capability | Closed source. Page capability uses `resolveDashboardAuthority`; view-as suppresses position roles and helper tests prove final-report/close controls disappear when viewed as ordinary GURU. | `apps/web/src/app/dashboard/penutupan-semester/page.tsx`, `apps/web/src/app/dashboard/penutupan-semester/semester-closing-ui.ts`, `apps/web/src/__tests__/semester-closing-ui.test.ts` |
| P2-R02 stale timeout and dialog focus incomplete | Closed source. Client updates stale age on a timer, re-checks staleness immediately before close, and uses the app's Radix dialog primitive for focus trap, Escape, initial focus, and focus restore. Browser focus proof remains staging/disposable QA gate. | `apps/web/src/app/dashboard/penutupan-semester/_components/SemesterClosingClient.tsx` |

## Final Re-review Follow-up Closure

| Finding | Closure | Evidence |
|---|---|---|
| P1-F01 historical final report and print view were not operational | Closed. Web now has a typed detail action for `GET /semester-closing/closures/:id`, each history row exposes `Lihat laporan`, and the selected report renders `SemesterClosure.snapshot` with period identity, close timestamp, actor, public hash, metrics, blockers, warnings, and final-report tables. A real browser print command calls `window.print()` and a print stylesheet isolates the historical report panel. Successful close keeps the returned closure payload, switches to history, and presents the report/export handoff. Backend detail now returns semester metadata consistently with close/list. | `apps/api/src/semester-closing/semester-closing.service.ts`, `apps/web/src/app/dashboard/penutupan-semester/actions.ts`, `apps/web/src/app/dashboard/penutupan-semester/_components/SemesterClosingClient.tsx`, `apps/web/src/__tests__/semester-closing-ui.test.ts` |
| P2-F02 CSV filename used UUID fragment | Closed. CSV filename now derives from academic-year code and semester number, with filename segment sanitization and no UUID fragment. The web test locks `laporan-penutupan-semester-2026-2027-semester-1.csv`. CSV contents remain formula-safe and snapshot-backed. | `apps/web/src/app/dashboard/penutupan-semester/semester-closing-ui.ts`, `apps/web/src/__tests__/semester-closing-ui.test.ts` |

## Schema and Migration

Migration `20260820000001_wave7_semester_closing` remains the single additive Wave 7 migration:

- Adds immutable `school.semester_closures`.
- Adds unique `semesterId`, nullable unique `nextSemesterId`, academic-year binding, actor user id, `closedAt`, `readinessVersion`, deterministic `readinessHash`, unique `idempotencyKey`, and PII-minimal JSON snapshot.
- Adds relation/index/FK support.
- Adds partial unique indexes:
  - `academic_years_single_active_idx`
  - `semesters_single_active_idx`
- Adds checks:
  - `academic_years_date_order_check`
  - `semesters_number_check`
  - `semesters_date_order_check`
  - `semester_closures_not_self_next_check`
- Adds permissions:
  - `academic.period.read`
  - `academic.period.manage`
  - `academic.semester.close`
  - `academic.final-report.read`

No old migration was edited. No dependency, base role, Keycloak role, reopen workflow, or amendment workflow was added.

## PostgreSQL Disposable Proof

Environment:

- Container: `diis-wave7-pg-20260820b`
- Image: `pgvector/pgvector:pg16`
- Port: `55433`
- Database: `diis_wave7_matrix`
- Cleanup: container removed after proof.

Migration proof:

- `prisma migrate deploy` applied all 44 migrations through `20260820000001_wave7_semester_closing`.
- `prisma validate`: pass.

Service matrix proof used real `PrismaService`, `PermissionsService`, `AcademicPeriodService`, and `SemesterClosingService` with a synthetic disposable fixture:

```json
{
  "proofPass": true,
  "proof": {
    "staleHashRejected": true,
    "staleHashClosureRows": 0,
    "staleHashKeptActiveSemester": true,
    "blockerRejected": true,
    "blockerRollbackClosureRows": 0,
    "blockerRollbackKeptActiveSemester": true,
    "differentKeyParallelSuccesses": 1,
    "differentKeyParallelFailures": 1,
    "closureRowsAfterRace": 1,
    "activeSemesterAfterClose": 2,
    "sameKeyDifferentPayloadRejected": true,
    "closedPeriodBarrierRejected": true,
    "snapshotAverageBeforeLiveChange": 88,
    "snapshotAverageAfterLiveChange": 88,
    "csvUsesSnapshotAverage": true
  }
}
```

Interpretation:

- Stale readiness hash rejects before mutation.
- Blocker readiness rejects and rolls back without closure row or active-period transition.
- Two concurrent closes with different keys produce exactly one success and one failure.
- Same key with changed payload is rejected.
- Closed semester rejects write-barrier check.
- Closure detail remains immutable after live `ReportCard.grades` and KKTP config are changed.
- CSV export reads the closure snapshot, not live data.

Prior disposable restore proof remains valid:

- A pre-Wave7 migration copy restored without `school.semester_closures`.
- Wave 7 migration row count after restore: 0.
- Active academic year count after restore: 1.

## Automated Verification

- API focused Semester Closing: 1 suite / 11 tests pass.
- Web focused Semester Closing: 1 suite / 8 tests pass.
- Full API: 62 suites / 1262 tests pass.
- Full web: 35 suites / 220 tests pass.
- API type-check: pass.
- Web type-check: pass.
- API lint: pass.
- Web lint: pass, with existing Next lint deprecation/plugin warning only.
- API build: pass.
- Web build: pass, 40 routes generated including `/dashboard/penutupan-semester`.
- Prisma validate: pass with disposable `DATABASE_URL`.
- `git diff --check`: pass.

## Privacy and Security

- Closure snapshot remains aggregate and PII-minimal.
- Final score statistics use distributed Rapor snapshots, not live grade rows.
- KAPROG detail/export is filtered server-side from immutable major snapshots based on active appointment scope.
- Raw idempotency key is not returned to clients.
- CSV export protects formula-leading cells and reads immutable snapshot data.
- Negative roles do not receive final report or close capability from UI or API.
- No secrets, credentials, screenshots, or production data were added.

## Browser QA Boundary

Authenticated browser QA at 1440/390 was not claimed in this source/database follow-up. The source now uses Radix dialog primitives for focus behavior and passes web build, but keyboard/focus behavior must still be proven in a browser after reviewer approval and deployment to a controlled staging/disposable environment.

## Explicit Packaging Notes

If reviewer approves this follow-up, packaging must still use explicit file staging only. Do not use `git add .` or `git add -A`. Do not stage `.tmp`, cache directories, screenshots, scratch files, or unrelated historical artifacts.

## Readiness Estimate

- Source readiness: 98%.
- Database/migration readiness: 98%.
- Automated regression confidence: 98%.
- Validated E2E readiness: 82%, because authenticated browser QA has not yet been executed.
- Recommended next gate: independent source/database re-review.
