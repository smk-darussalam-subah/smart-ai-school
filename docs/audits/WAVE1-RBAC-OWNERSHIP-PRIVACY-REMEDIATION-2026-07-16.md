# Wave 1 RBAC Ownership Privacy Remediation - 2026-07-16

## Scope

Executor: Codex, from Prompt Architect Wave 1 handoff.

Wave 1 was limited to cross-cutting RBAC, ownership, privacy, PDP consent propagation, permission mismatch, and negative tests. No schema, dependency, seed, Docker, CI, staging, production, full report-card pipeline, RPP body workflow, LMS/assessment overhaul, or semester-close workflow was changed.

## Closed Items

- W1-01 GURU over-read reduced:
  - `/students`, `/students/:id`, `/students/:id/grades`, and `/students/:id/attendance` now scope GURU access to classes from teaching assignments.
  - Report-card section endpoints now scope GURU to assigned student classes.
  - Class activities now scope reads by role: GURU assigned classes, SISWA own class, ORANG_TUA child classes, elevated roles all.
- W1-02 PDP consent propagation:
  - `assignParent()` now writes `consentAt` to both student user and parent user in the same DB transaction that binds `student.parentId`.
- W1-03 Permission and role mismatch:
  - `@RequirePermission()` now supports alternatives, allowing endpoints to accept correct own/child permissions without duplicating controllers.
  - Finance list/history accepts `finance.read`, `finance.own.read`, or `finance.child.read`.
  - Student own/child routes use `student.own.read`, `student.child.read`, `grade.own.read`, `grade.child.read`, `attendance.own.read`, and `attendance.child.read` where applicable.
  - Student dashboard SPP/CP/leaderboard/teachers/timeline gates now use own/child domain permissions.
  - Analytics student-level endpoints accept own/child grade/attendance permissions.
  - WA child log endpoint accepts parent child permission while service ownership still verifies child binding.
  - RPP review allows `WAKA_KURIKULUM` through RolesGuard only with `rpp.review`.
  - Report-card status transition allows `WAKA_KURIKULUM` review actions only with `report.review`; distribute remains SA/KS/TU only.
- W1-04 Distributed report privacy:
  - SISWA/ORANG_TUA report-card list queries now force `status = distributed` after query filters, so `?status=draft` cannot override privacy.
  - Report-card section endpoints require a distributed report-card for SISWA/ORANG_TUA in the requested year/semester.
- W1-05 Class activity ownership:
  - Update/delete require `activity.manage`.
  - GURU create/update can only target assigned classes.
  - GURU update/delete remains owner-only; SUPER_ADMIN can bypass ownership.
- W1-06 Finance create/approve semantics:
  - Create records start as `unpaid`, do not set `paidAt`, and do not emit `payment.received`.
  - Approve sets `status = paid`, `paidAt`, `approvedBy`, `approvedAt`, then emits `payment.received`.
  - SISWA/ORANG_TUA reads remain service-owned to self/child.
- W1-07 Parent multi-child privacy binding:
  - Parent dashboard child selector now carries original `studentId`.
  - Nilai, attendance, SPP, and WA log props are filtered by active child when payload includes `studentId`, preventing stale first-child data from rendering under another child.
- W1-09 Permission override deny path:
  - POST grant endpoint now honors `grant: false` by writing a revoke override, matching resolver semantics that deny overrides remove role-granted permissions.
- W1-10 Positions transaction consistency:
  - Assign creates `staffPosition` and applies valid permission overrides inside one DB transaction.
  - Unassign deletes `staffPosition`, calculates remaining active permission support, and removes unsupported overrides inside one DB transaction.
  - Keycloak role sync/removal remains after DB commit and fail-soft.

## Deferred

- W1-08 Period/org permission gates are deferred because the current permission catalog has no specific `school.period.*`, `school.profile.*`, `school.major.*`, or `school.calendar.*` permissions. Adding those would require seed/catalog approval, which was explicitly out of scope. Existing role gates remain in place.
- Parent dashboard data completeness for non-first child is still limited by some server fetches that are still first-child based or aggregate endpoints. This Wave 1 patch prevents cross-child leakage at the UI binding layer; richer per-child client refresh can be handled in a later UX/data wave.
- No browser/staging manual QA was run in this workspace turn.

## Verification

- `npm.cmd --workspace @smk/api test -- --runInBand --cacheDirectory ../../.tmp/jest-cache src/__tests__/permissions.spec.ts src/__tests__/student.spec.ts src/__tests__/finance.spec.ts src/__tests__/report-cards-activities.spec.ts src/__tests__/wa-log.spec.ts src/__tests__/analytics.spec.ts src/__tests__/positions.spec.ts`
  - PASS: 7 suites, 168 tests.
- `npm.cmd --workspace @smk/api run type-check`
  - PASS.
- `npm.cmd --workspace @smk/web run type-check`
  - PASS.
- `npm.cmd --workspace @smk/api run lint`
  - PASS.
- `npm.cmd --workspace @smk/web run lint`
  - PASS, with existing Next lint deprecation/plugin warning.

Initial root `npm.cmd run test -- ...` and root `npm.cmd run type-check` via Turbo returned nonzero without actionable package output, so package-level verification was used for clear evidence.

## Schema Dependency Seed Migration

- Schema changes: No.
- Dependency changes: No.
- Seed/catalog changes: No.
- Migration generated/applied: No.

## Residual Risk

- Position transaction behavior is covered by unit tests but not by an integration test against a real database transaction.
- Report-card section privacy now checks distributed status for SISWA/ORANG_TUA, but the section data itself still reads live grade/attendance data rather than immutable report snapshots; full report snapshot correctness remains Wave 6.
- WAKA access depends on position role synchronization and effective permission overrides being present for `rpp.review` and `report.review`.
- School period/org endpoints still need a future permission catalog decision before replacing role-only gates.

## Next Wave Recommendation

Proceed to the next Prompt Architect wave only after reviewing the deferred school-config permission catalog decision. If the next wave touches report cards, prioritize snapshot-vs-live section consistency and browser QA for SISWA/ORANG_TUA distributed privacy.
