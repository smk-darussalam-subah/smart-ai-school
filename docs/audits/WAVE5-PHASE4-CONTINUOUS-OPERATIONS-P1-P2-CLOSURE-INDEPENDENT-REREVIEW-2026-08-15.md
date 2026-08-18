# Wave 5 Phase 4 P1/P2 Closure - Independent Source Re-review

Date: 2026-08-15

## Verdict

`FOLLOW-UP REQUIRED IN WAVE 5`

Do not commit, push, open a PR, or promote this branch yet. The implementation closes
several earlier findings, but the claim that all Wave 5 P1/P2 findings are closed is not
supported by the current source and evidence.

No new Prompt Architect decision is required. The remaining work is already specified by
the approved closure prompt and should stay on the same Wave 5 branch.

## Findings

### P1-1 - The parent remedial endpoint is not a dedicated family projection and the parent UI is absent

Evidence:

- `apps/api/src/assessment/dto/assessment.dto.ts:38-50` adds `studentId` to the generic
  `ListAssessmentSessionSchema`, despite the approved contract requiring a dedicated
  family query DTO.
- `apps/api/src/assessment/assessment.service.ts:1900-1914` correctly requires and checks
  an owned child, but then calls the generic `page()` path.
- `apps/api/src/assessment/assessment.service.ts:658-669` selects `SESSION_SELECT`.
- `apps/api/src/assessment/assessment.service.ts:83-96` includes session questions,
  teacher/class metadata, and generic assessment fields.
- `apps/api/src/assessment/assessment.service.ts:547-554` removes answer keys and rubrics,
  but still returns questions and options. It does not return the selected child's required
  participant attempt, outcome, and finalization projection.
- No remedial fetch, state, or compact remedial view exists under
  `apps/web/src/app/dashboard/akademik/_components/ortu/`. `OrtuWorkspace.tsx:99-114`
  has the active-child selector, but it is not connected to remedial data.
- `apps/api/src/__tests__/assessment-u2.spec.ts:433-454` checks only the selected-child
  query filter. It does not recursively reject forbidden fields or prove the A1-to-A2 UI
  switch and stale-response protection.

Impact:

- Parents can receive assessment question content that the family contract explicitly
  forbids.
- Parents do not receive the useful read-only remedial status/outcome promised by the
  workflow.
- The feature is not reachable from the parent dashboard, so the selected-child backend
  filter alone does not complete the user journey.

Required closure:

1. Add a dedicated strict family query DTO and whitelist-only response projection.
2. Return only safe session identity/subject/due date, attempt number, participant/session
   status, finalization time, and pass/needs-retry outcome for the selected child.
3. Add the compact read-only section to the existing parent workspace with loading, empty,
   error, retry, due/overdue, and request sequence/abort protection.
4. Add recursive forbidden-field tests and two-child switch/forged-child/direct-API tests.

### P1-2 - Notification handoff is fire-and-forget, not immediate-before-completion

Evidence:

- `apps/api/src/assessment/assessment.service.ts:395-403`,
  `apps/api/src/finance/finance.service.ts:71-79`, and
  `apps/api/src/announcements/announcements.service.ts:49-57` call
  `enqueueCommittedPendingLogs()` through `void ...catch(...)`.
- Business methods therefore return before the BullMQ handoff is known to have completed.
  A process stop in this window leaves delivery waiting for stale-row recovery.
- Responses do not truthfully expose whether the immediate handoff was `queued` or
  `pending_recovery`.
- Existing tests such as `apps/api/src/__tests__/assessment-u2.spec.ts:499-513` only prove
  that the mock was called. They do not prove that `queue.add` completed before the
  operation returned or that queue failure preserves a committed pending row.
- `apps/api/src/notification/notification.service.ts:101-127` is a useful bounded,
  pending-only handoff implementation; the defect is primarily how callers await and
  report its outcome.

Impact:

The normal path is still exposed to an avoidable five-to-six-minute recovery delay and the
API cannot distinguish immediate queue handoff from delayed recovery. This does not satisfy
P1-R12 even though durable intent is correctly retained.

Required closure:

1. After transaction commit, await one bounded handoff attempt inside fail-soft handling.
2. Queue failure must not roll back the business transaction; return/log an honest
   `pending_recovery` outcome without PII.
3. Prove ordering: commit first, `queue.add` next, operation completion last.
4. Prove unavailable queue, restart recovery, same job ID, duplicate transition, and
   zero/invalid recipient behavior with the real local queue path.

### P1-3 - Remedial transaction/CAS closure remains incomplete

Evidence:

- `createRemedialSession()` builds the canonical question snapshot before entering its
  transaction at `apps/api/src/assessment/assessment.service.ts:2055`; it can become stale
  before session creation.
- The transaction does not acquire the shared academic-year/appointment activation lock
  required by P1-R13 before resolving the active year and assignment.
- Grade locks are acquired by iterating an unordered `findMany()` result at
  `apps/api/src/assessment/assessment.service.ts:2072-2074`; no deterministic lock-key sort
  is applied for multi-grade sessions.
- `updateRemedialSession()` uses `id + status + purpose` at
  `apps/api/src/assessment/assessment.service.ts:2212-2223`, but no expected version or
  `updatedAt` value. Two concurrent draft updates can both report success, with the last
  writer silently winning. `teacherId` is also absent from the conditional update required
  by the approved contract.
- The disposable proof in the executor report demonstrates only concurrent create,
  activation, and one late update. It does not execute the mandatory two-connection matrix:
  report-check/finalize in both orders, cancel/update, two draft updates, or
  academic-year-cutover/create.

Impact:

The implementation is substantially safer than the previous version, but it does not yet
guarantee one-winner semantics across all approved lifecycle races or safe year cutover.
The current report overstates the PostgreSQL proof.

Required closure:

1. Acquire the shared cutover/activation lock before active-year and assignment resolution.
2. Re-read and validate questions inside the same transaction.
3. Sort all report-grade lock keys deterministically before acquisition.
4. Use a real expected-state CAS for draft edits, such as `expectedUpdatedAt`, and include
   owner/teacher context in the conditional write.
5. Run and record the complete two-connection PostgreSQL matrix in both required orders.

### P2-1 - AI Chat mounted guard is unsafe under React Strict Mode effect replay

Evidence:

- `apps/web/src/app/dashboard/ai/_components/AiClient.tsx:46-57` initializes
  `mountedRef` to `true` and sets it to `false` in cleanup, but the effect setup never resets
  it to `true`.
- Under development Strict Mode effect replay, cleanup can leave the live remounted effect
  with `mountedRef.current === false`, causing response application to be suppressed.
- `apps/web/src/__tests__/wave5-continuous-operations-ui.test.ts:27-31` tests only the pure
  helper, not component mount/unmount/effect replay behavior.

Required closure:

Set `mountedRef.current = true` in effect setup and add a component behavior test that
replays cleanup/setup while a history/send request is controlled. Retain the existing epoch
and abort guards, which are directionally correct.

## Evidence Gaps For Staging Gate

These do not replace the source findings above:

- Kiosk controller source correctly requires `x-diis-kiosk-token` and sets `no-store`,
  `no-referrer`, and `noindex` headers. However,
  `apps/api/src/__tests__/public-kiosk.spec.ts:69-105` uses a mocked service and does not
  prove real SchoolConfig v1-to-v2 rotation, old-token rejection, or all response headers.
- Authenticated browser QA has not run. This is acceptable at the current source gate, but
  it remains mandatory after a reviewed SHA reaches staging. Use the saved staging fixture
  and role-session protocol; do not create production-bound QA credentials.

## Confirmed Improvements

- `finance.create` is now the UI authority for recording SPP; legacy `finance.record` is
  rejected by the helper contract.
- Remedial mutation routes are GURU-only and service ownership revalidates the active
  TeachingAssignment. Oversight roles remain read-only.
- The unified KKTP resolver has explicit provenance and preserves the approved system
  default 75 only for a complete context.
- Finance class filtering is server-side.
- Kiosk query-token transport is rejected and the source sets defensive response headers.
- AI Chat epoch and abort-controller logic is a meaningful improvement apart from the
  Strict Mode lifecycle defect above.

## Independent Verification

Executed on the uncommitted Wave 5 worktree:

- Focused API: 7 suites, 186 tests passed.
- Focused web: 1 suite, 7 tests passed.
- API type-check: passed.
- Web type-check: passed.
- `git diff --check`: passed.
- `git diff --cached --check`: passed; no staged changes.
- Reviewer-created Jest caches were removed with exact paths. Historical untracked files
  were not touched.

The green tests are valid regression evidence, but their present assertions do not cover
the P1 acceptance gaps listed above.

## Readiness

| Area | Assessment |
| --- | --- |
| Source implementation | 84% |
| P1/P2 closure against approved contract | 72% |
| Validated E2E readiness | 66% |
| Ready for explicit Git packaging | No |
| Ready for staging QA | No |

## Recommended Next Step

Send this report directly to the executor. Keep all corrections on
`feat/wave5-phase4-continuous-operations-20260813`, then request one final independent
source re-review. Do not return to Prompt Architect unless a new policy decision is proposed;
the expected behavior is already unambiguous.

Minimum next evidence package:

1. Dedicated parent family DTO/projection plus integrated selected-child UI and privacy tests.
2. Awaited fail-soft immediate queue handoff plus real queue failure/recovery proof.
3. Shared cutover lock, deterministic grade lock order, true draft CAS, and the complete
   two-connection PostgreSQL matrix.
4. AI Chat Strict Mode lifecycle test and fix.
5. Focused/full automated gates, clean migration proof, and explicit diff hygiene.

Only after that re-review is green should the executor perform explicit file-list packaging,
PR/deploy to staging, and the saved authenticated browser QA matrix.

## Confidence

Reviewer confidence: **98%**.
