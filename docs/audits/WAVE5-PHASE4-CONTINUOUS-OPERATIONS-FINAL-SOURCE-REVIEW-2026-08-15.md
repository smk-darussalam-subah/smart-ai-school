# Wave 5 Phase 4 Continuous Operations - Final Source Review

Date: 2026-08-15

## Verdict

`FOLLOW-UP REQUIRED IN WAVE 5`

The three findings in the executor's latest follow-up are closed at source level:

- academic-year cutover now acquires the shared advisory lock before reading or mutating
  active-year state;
- notification handoff resolves and queues persisted pending `NotificationLog` IDs after
  `createMany({ skipDuplicates: true })`;
- the family remedial endpoint returns the documented privacy-safe whitelist and rejects
  the unreachable `cancelled` query state.

One narrow P2 UI correctness issue remains. Do not open the Git packaging gate until it is
fixed and its focused test is added. No new Prompt Architect decision is required.

## Finding

### P2-1 - Family remedial cards can receive duplicate React keys

Evidence:

- `apps/web/src/app/dashboard/akademik/_components/ortu/RemedialOrtu.tsx:141`
  builds a row key from academic year, semester, subject, title, and attempt number.
- Those values are not a unique identity. Two independent source grades can legitimately
  produce remedial sessions with the same title, subject, year, semester, and attempt
  number.
- The privacy-safe API intentionally no longer returns session or participant IDs, so the
  UI cannot rely on an internal identifier.
- Current focused web tests cover stale-response handling but do not prove unique list keys.

Impact:

- React can report duplicate keys and reconcile one card against the wrong sibling after a
  refresh, filter change, or child switch.
- The displayed status or due date can therefore become stale even though the API response
  is correct.

Required closure:

1. Make the render key unique without re-exposing an internal database ID. The narrowest
   acceptable fix is to append the page-local `index` unconditionally to the existing
   privacy-safe composite key.
2. Add a focused helper/render test with two otherwise identical remedial cards and prove
   that their keys are distinct.
3. Re-run the focused web suite, API/web type-check, and diff checks. Backend and migration
   proofs do not need to be repeated if no backend file changes.

## Confirmed Closed

### Cutover lock

- `createAcademicYear()` and `updateAcademicYear()` acquire the appointment activation lock
  as the first authoritative operation inside the transaction.
- The old active year is read only after the lock is held.
- Deactivation and appointment cutover remain in the same transaction.
- Unit assertions verify lock invocation precedes the active-year read and update.
- The executor report includes a two-connection PostgreSQL proof showing the active year
  stays unchanged while the lock is held and changes only after release.

### Persisted notification IDs

- Assessment, finance, and announcement flows re-query pending rows by
  `(refType, refId, recipient, channel)` after deduplicated insertion.
- Immediate enqueue receives persisted IDs, including an existing pending winner, rather
  than proposed UUIDs that may have been skipped.
- Queue failure remains fail-soft for the business transaction and is reported truthfully
  as `pending_recovery`.
- Focused tests cover existing pending IDs in remedial assignment, due reminder, result,
  payment, and announcement flows.

### Family privacy contract

- The endpoint is parent-only and requires a selected child owned by the authenticated
  parent.
- Query input is strict and accepts only `active` or `completed` session status.
- Output excludes internal IDs, lifecycle timestamps, retry lineage, question content,
  answer material, rubrics, and scores.
- Returned fields match the documented allowlist for the session and participant summary.

## Independent Verification

Executed against the current uncommitted Wave 5 worktree:

- focused API: 6 suites / 158 tests passed;
- focused web: 1 suite / 9 tests passed;
- API type-check: passed;
- web type-check: passed;
- source inspection of cutover ordering, notification ID reconciliation, parent projection,
  controller boundary, and associated tests: completed.

The test run produced only existing `ts-jest` warnings about compiled JavaScript from local
workspace package output; there were no assertion failures.

## Readiness

| Area | Assessment |
| --- | --- |
| Latest backend P1 closure | 100% |
| Family privacy contract | 98% |
| Source implementation overall | 97% |
| Ready for explicit Git packaging | No, one narrow P2 remains |
| Ready for staging browser QA | No, packaging has not opened |

After the P2 correction and focused re-verification, the expected next verdict is
`APPROVED FOR EXPLICIT GIT PACKAGING`. Staging browser QA remains a separate gate and must
use the saved PII-safe role/session protocol after a reviewed SHA is deployed.

## Confidence

Reviewer confidence: **98%**.
