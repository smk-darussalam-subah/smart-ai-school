# Wave 5 Phase 4 P1/P2 Closure - Final Independent Re-review

Date: 2026-08-15

## Verdict

`FOLLOW-UP REQUIRED IN WAVE 5`

Do not commit, push, open a PR, or deploy this branch yet.

The latest follow-up validly closes most of the previous findings. The family endpoint is
now separate, ordinary remedial mutation ownership is fail-closed, notification handoff is
awaited after commit, draft update uses a real version check, grade locks are ordered, and
the AI Chat mounted guard is reset during effect replay. However, two P1 implementation
gaps and one P2 family-contract gap remain.

No new Prompt Architect decision is required. These are narrow corrections to the approved
Wave 5 contract and should remain on the same branch.

## Findings

### P1-1 - The real academic-year cutover acquires the shared lock after mutating year state

Evidence:

- Remedial mutations correctly acquire `APPOINTMENT_ACTIVATION_LOCK_KEY` before resolving
  their active assignment in `apps/api/src/assessment/assessment.service.ts:301-305` and
  the mutation transactions.
- The other side of the protocol is ordered incorrectly. In
  `apps/api/src/school-config/school-config.service.ts:128-136`, academic-year creation
  first sets all years/semesters inactive and creates the new year, then acquires the
  appointment activation lock.
- The same ordering exists in `apps/api/src/school-config/school-config.service.ts:171-179`
  for academic-year update.
- `oldActiveYear` is also read before entering and locking the transaction at
  `school-config.service.ts:121-124` and `:165-168`.
- The reported PostgreSQL proof only shows that remedial creation waits while the advisory
  lock is directly held. It does not exercise the actual `createAcademicYear()` or
  `updateAcademicYear()` ordering.

Why this still races:

1. Cutover transaction updates academic-year rows and then waits for the advisory lock.
2. A remedial transaction already holding that lock can still see the previous committed
   year as active under PostgreSQL MVCC.
3. The remedial transaction can create and commit an old-year session.
4. Cutover then acquires the lock and commits the new active year.

The existence of a shared lock key is therefore insufficient; both workflows must acquire
it before any authoritative read or mutation.

Required closure:

1. In both academic-year create and update paths, acquire the activation lock as the first
   operation inside the transaction.
2. Re-read the current active year inside that locked transaction.
3. Only then deactivate years/semesters, create or update the target year, and apply
   appointment activation.
4. Run a real two-connection proof through `SchoolConfigService` in both orders. Verify no
   remedial session is committed against the superseded context.

### P1-2 - `skipDuplicates` can produce phantom notification IDs and a false handoff result

Evidence:

- Remedial, finance, and announcement notification rows preallocate random UUIDs, call
  `createMany(..., skipDuplicates: true)`, then return every proposed UUID for enqueue.
  Examples:
  - `apps/api/src/assessment/assessment.service.ts:241-246`;
  - `apps/api/src/assessment/assessment.service.ts:2447-2453`;
  - `apps/api/src/finance/finance.service.ts:306-328`;
  - `apps/api/src/announcements/announcements.service.ts:244-263`.
- The partial unique index rejects a duplicate active ref/recipient/channel, but the new
  random UUID for that skipped row never exists.
- `NotificationService.enqueueCommittedPendingLogs()` queries by those proposed UUIDs. It
  cannot find or requeue the existing pending winner row.
- The due-reminder scanner routinely revisits active sessions in its time window. On a
  repeated scan, it can create zero rows but attempt handoff with phantom IDs and report an
  internally inconsistent `pending_recovery` result.
- Current tests cover duplicate input IDs to the handoff method and `notify()` P2002
  recovery, but not `createMany(skipDuplicates)` followed by immediate handoff of the
  existing winning row.

Impact:

- A healthy queue can be bypassed for the existing pending row.
- The operation can report `pending_recovery` even when no newly requested pending row
  exists, contradicting the truthful handoff contract.
- Repeated due scans can produce misleading operational health data.

Required closure:

1. After `createMany`, resolve the actual pending rows by deterministic
   refType/refId/recipient/channel keys and enqueue their real persisted IDs.
2. Do not calculate requested or pending-recovery counts from proposed IDs that were skipped.
3. Add a runtime/unit case where the active unique row already exists as pending, prove the
   existing row is queued with its original ID, and prove the result counts are coherent.
4. Add repeated due-scan proof showing no duplicate row/job and no false
   `pending_recovery` status.

### P2-1 - Family projection is safer but not yet the exact approved whitelist; cancelled state is unreachable

Evidence:

- `listFamilyRemedials()` no longer returns questions, options, answers, rubrics, or scores.
  This is a major and valid privacy improvement.
- The approved whitelist allows safe session identity/title/subject, due date, attempt,
  participant/session status, finalization/completion time, and outcome.
- The response at `apps/api/src/assessment/assessment.service.ts:833-857` additionally
  exposes `type`, `academicYear`, `semester`, participant `id`, `assignedAt`, `startedAt`,
  and `submittedAt`. In particular, the internal participant ID is unnecessary for the
  read-only parent UI.
- The query at `assessment.service.ts:771-777` always requires a participant whose status is
  not cancelled. Because cancellation marks participants cancelled, cancelled sessions are
  filtered out even though the DTO, response type, and UI explicitly implement a cancelled
  state.
- The recursive test rejects several forbidden content fields, but does not assert the exact
  allowed key set.

Required closure:

1. Return the exact approved whitelist. Remove internal participant IDs and any extra field
   not explicitly required, or obtain a new decision before expanding the contract.
2. Make cancelled state intentionally reachable, or remove the dead cancelled contract and
   document the chosen behavior. The recommended behavior is a short, read-only cancelled
   history entry without participant identifiers.
3. Assert exact top-level and participant key sets, not only a forbidden-field subset.

## Confirmed Closed Items

The following earlier findings are now closed at source level:

- Generic assessment DTO no longer accepts the parent child selector.
- `GET /assessment/remedials/family` is parent-only with a strict selected-child query.
- Parent UI uses the existing active-child selector, aborts stale requests, and provides
  loading, empty, error, retry, due, and overdue states.
- Remedial mutation remains GURU owner-only; oversight roles are read-only.
- Immediate handoff is awaited after business commit and queue failure remains fail-soft.
  Only the duplicate-row identity path above remains open.
- Question snapshot validation is transaction-local.
- Grade advisory locks are acquired in deterministic order.
- Draft updates compare the request's original `updatedAt` and include teacher ownership in
  the conditional update.
- Report/finalize, two-draft-update, and cancel/update behavior is materially improved.
- AI Chat resets `mountedRef.current = true` on every effect setup and retains epoch/abort
  protection.
- The report-card advisory lock correctly uses `$executeRaw` for the void-returning
  PostgreSQL lock function.

## Independent Verification

Executed against the current uncommitted worktree:

- Focused API: 6 suites, 128 tests passed.
- Focused web: 1 suite, 9 tests passed.
- API type-check: passed.
- Web type-check: passed.
- `git diff --check`: passed.
- `git diff --cached --check`: passed; no staged changes.
- Reviewer-created Jest caches were removed by exact path with Windows long-path support.
- Historical/scratch untracked files were not touched.

The executor's full suites, builds, Prisma validation, and 43-migration proof are consistent
with the inspected source. The remaining blockers are contract and concurrency issues that
the current assertions do not exercise.

## Readiness

| Area | Assessment |
| --- | --- |
| Source implementation | 92% |
| P1/P2 closure against approved contract | 86% |
| Validated E2E readiness | 78% |
| Ready for explicit Git packaging | No |
| Ready for staging QA | No |

## Recommended Next Step

Send this report directly to the executor and keep the correction on
`feat/wave5-phase4-continuous-operations-20260813`.

The narrow final follow-up should contain only:

1. correct lock-first ordering and locked active-year read in `SchoolConfigService`;
2. persisted-ID reconciliation after notification `skipDuplicates` plus duplicate/repeated
   scanner proof;
3. exact family response whitelist and intentional cancelled-state behavior;
4. focused tests, the actual SchoolConfig-versus-remedial two-connection proof, full gates,
   migration proof, and clean diff evidence.

After that, request one more independent source re-review. Only a green verdict should open
explicit file-list Git packaging and staging browser QA using the saved PII-safe role/session
protocol.

## Confidence

Reviewer confidence: **98%**.
