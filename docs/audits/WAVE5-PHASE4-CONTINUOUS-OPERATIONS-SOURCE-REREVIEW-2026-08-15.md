# Wave 5 Phase 4 Continuous Operations - Independent Source Re-review

Date: 2026-08-15
Branch: `feat/wave5-phase4-continuous-operations-20260813`
Base: `origin/develop@5afc7ccaec9edcacfa9a0a5d69fc39cbaade66e4`
Verdict: **FOLLOW-UP REQUIRED IN WAVE 5**

## Executive Summary

The follow-up closes several important source gaps. Remedial candidate selection no longer
uses the forbidden fallback KKTP, student assignment cards are participant-bound, parent and
student remedial list responses are sanitized, report check and remedial finalization now use
the same advisory-lock namespace, finance recipients are normalized and deduplicated,
scheduled announcements have an autonomous claim loop with appointment-aware recipients,
and the public kiosk API no longer accepts query-string tokens.

Source approval is still withheld. The follow-up introduces or leaves six P1 contract gaps:
the finance record button checks a permission that does not exist; the required selected-child
family remedial projection is still absent; Super Admin can take over pedagogical remedial
operations; durable notification rows are not enqueued after commit; remedial create/update
still have active-scope and lifecycle races; and operational analysis/dashboard projections
still classify against a hardcoded KKTP 75.

No application source, database, Git branch, deployment, Keycloak, staging, or production
state was changed during this review. This report is the only reviewer-created artifact.

## Findings

### P1-R9 - Finance record UI checks a nonexistent permission

Evidence:

- `apps/web/src/app/dashboard/keuangan/keuangan-ui.ts:6-8` requires `finance.record`.
- The authoritative permission is `finance.create` in
  `packages/database/prisma/seed-permissions.ts:43` and
  `apps/api/src/finance/finance.controller.ts:42`.
- Repository search finds `finance.record` only in the new helper and its test. The test at
  `apps/web/src/__tests__/wave5-continuous-operations-ui.test.ts:28-29` therefore validates
  the typo instead of the real API contract.

Impact:

TU and SA users with the correct `finance.create` permission cannot see the record-SPP
control. The backend remains callable, but the intended operational workflow is broken.

Required follow-up:

1. Change the helper and behavior test to `finance.create`.
2. Prove TU and SA can record, while GURU/KS/SISWA/ORANG_TUA/INDUSTRI cannot.
3. Keep approval on `finance.approve` for effective SA/KS only.

### P1-R10 - Parent remedial remains cross-child and has no selected-child projection

Evidence:

- `apps/api/src/assessment/dto/assessment.dto.ts:38-49` has no authorized child selector.
- `apps/api/src/assessment/assessment.service.ts:1896-1904` resolves every child and returns
  every matching remedial in one response.
- No Wave 5 parent UI or child-switch implementation exists; the new `RemedialPanel` is a
  teacher authoring surface.
- The previous review explicitly required a selected-child family projection and two-child
  switch proof at
  `docs/audits/WAVE5-PHASE4-CONTINUOUS-OPERATIONS-SOURCE-REVIEW-2026-08-14.md:83-90`.

Impact:

The response is now sanitized, but it still violates the approved child-context workflow and
can mix two children's statuses in one registry. The user cannot reliably tell which active
child is being monitored.

Required follow-up:

1. Add a dedicated child-scoped read contract with server-side ownership validation.
2. Return only status, due date, attempt/completion state, and safe subject/title metadata.
3. Add parent UI switching with no first-child fallback.
4. Add two-child, forged-child, forged-session, and recursive forbidden-field tests.

### P1-R11 - Super Admin can take over pedagogical remedial management

Evidence:

- `apps/api/src/assessment/remedial.controller.ts:51-117` exposes candidate, create, update,
  activate, cancel, finalize, and retry to `SUPER_ADMIN`.
- `packages/database/prisma/migrations/20260813000001_wave5_continuous_operations/migration.sql:343-346`
  grants Super Admin remedial manage plus learner/family permissions.
- `apps/api/src/assessment/assessment.service.ts:264-295` bypasses teacher ownership whenever
  the caller has `SUPER_ADMIN`.
- The approved authority contract states that GURU manages only its own TeachingAssignment
  and SA/KS/WAKA_KURIKULUM provide oversight read without taking over pedagogical
  finalization (`PROMPT-ARCHITECT-WAVE5-PHASE4-CONTINUOUS-OPERATIONS-2026-08-13.md:233-238`).

Impact:

A Super Admin can finalize a teacher's remedial result and change the canonical Grade despite
not owning the TeachingAssignment. This breaks pedagogical accountability and the stated
separation between operational recovery and academic judgment.

Required follow-up:

1. Restrict all pedagogical mutations to the current TeachingAssignment owner.
2. Keep SA/active KS/active WAKA_KURIKULUM read-only oversight.
3. If administrative recovery is genuinely required, define a separate, explicitly approved,
   reason-required and fully audited recovery command rather than silently bypassing ownership.
4. Add direct API and service negatives for SA/KS/WAKA finalization and forged assignment IDs.

### P1-R12 - Notification rows are durable but are not enqueued after commit

Evidence:

- Remedial assignment/result/reminder paths use direct `notificationLog.createMany()` at
  `apps/api/src/assessment/assessment.service.ts:208-220,2166-2174,2337-2348`.
- Finance and announcement paths do the same at
  `apps/api/src/finance/finance.service.ts:267-276` and
  `apps/api/src/announcements/announcements.service.ts:193-216`.
- None of these services calls `NotificationService.notify()` or otherwise enqueues the newly
  committed log IDs.
- `apps/api/src/notification/notification.service.ts:18-20,107-112` only recovers rows older
  than five minutes on a one-minute interval.
- The approved finance contract requires enqueue after commit with pending-log recovery as
  the crash fallback, not as the normal delivery path.

Impact:

Assignment, result, due-reminder, urgent announcement, and payment receipt notifications wait
roughly five to six minutes before even entering BullMQ. A healthy queue is bypassed during
normal operation, so the implementation does not meet the intended immediate-plus-recovery
delivery contract.

Required follow-up:

1. Commit the deterministic pending rows in the business transaction.
2. After commit, enqueue each row by its deterministic log ID.
3. Preserve startup/periodic pending recovery for process-crash and queue-failure gaps.
4. Prove normal immediate enqueue, queue failure with durable pending row, restart recovery,
   recipient dedupe, and exactly-once active ref behavior.

### P1-R13 - Remedial create/update still have active-scope and lifecycle races

Evidence:

- `createRemedialSession()` validates active assignment, Grade freshness, and report status
  before entering its transaction (`assessment.service.ts:1997-2068`) and does not repeat
  those checks after transaction start (`2070-2096`).
- `updateRemedialSession()` reads `status=draft` and validates the assignment before its
  transaction (`2099-2116`), but then performs an unconditional update by `id`
  (`2117-2137`). A concurrent activation/cancellation can therefore be followed by a late
  edit of questions or due date.
- The database trigger proves TeachingAssignment field consistency, but does not prove the
  assignment's academic year is still the single active year or that class/user/teacher are
  still active.
- The prior required two-connection PostgreSQL proof for report-check versus remedial
  finalization was not executed; the follow-up report records migration apply only.

Impact:

A year cutover or assignment deactivation can race session creation, and an activated session
can be mutated by a request that observed it as draft earlier. The shared report/finalization
lock is directionally sound but remains unproven under real concurrent PostgreSQL sessions.

Required follow-up:

1. Revalidate active year, assignment, class, teacher/user, Grade freshness, and report state
   inside the create transaction under the appropriate shared lock.
2. Make update a conditional `status=draft` CAS and return 409 when it loses.
3. Add real PostgreSQL two-connection proofs for report-check/finalize in both orders and for
   update-versus-activate/cancel.

### P1-R14 - Operational KKTP fallback 75 still affects analysis and dashboard data

Evidence:

- `apps/api/src/assessment/assessment.service.ts:1595-1612` still initializes session analysis
  with `{ value: 75, provenance: 'system_default' }` and uses it for ketuntasan.
- `apps/api/src/student-dashboard/student-dashboard.service.ts:164-176` assigns
  `KKM_DEFAULT` to every assessment assignment, including remedial sessions whose
  participant already stores an authoritative `kktpValue` snapshot.
- The approved contract states all operational ketuntasan/remedial decisions must use the
  authoritative contextual value, not a global number.

Impact:

Candidate creation is improved, but teacher analysis and student/family task projections can
still report the wrong completion threshold whenever the school's contextual KKTP is not 75.

Required follow-up:

1. Make analysis fail closed or report `unconfigured` when no authoritative KKTP exists.
2. For remedial cards, read the participant's immutable `kktpValue` snapshot.
3. For regular sessions, use module/config authority without a silent global fallback.
4. Add non-75 and missing-KKTP tests for analysis and dashboard projections.

### P2-R15 - AI Chat can apply an old response after session switch

Evidence:

- `apps/web/src/app/dashboard/ai/_components/AiClient.tsx:124-129` starts a new chat without
  aborting the active send.
- Session buttons call `loadHistory()` without request sequencing at `205-208` and remain
  usable while a send is in flight.
- The old response can later set `sessionId`, append messages, and overwrite the newly chosen
  conversation (`147-178`).
- The new web tests cover only pure key/prefill helpers, not component session switching,
  stale responses, failure recovery, or unmount behavior.

Required follow-up:

Abort or sequence sends/history loads on new/switch/delete, and add component behavior tests
for out-of-order completion and session deletion during an active request.

### P2-R16 - Remaining operational filter and kiosk transport proof gaps

Evidence:

- The finance API supports `classId`, but `apps/web/src/app/dashboard/keuangan/page.tsx:33-56`
  and `KeuanganTable.tsx:158-187` do not expose or forward a class filter as required by the
  approved server-side filter contract.
- The kiosk controller declares no-store/no-referrer/noindex headers, but the focused test
  calls the controller method directly and does not prove actual HTTP response headers.
- The Next kiosk page uses metadata and fetch options, but there is no route-level test that
  verifies its response headers or that a regenerated token invalidates the old link.

Required follow-up:

Add the class filter and transport-level kiosk/rotation tests. Final rendering and mobile proof
remain correctly reserved for staging browser QA.

## Confirmed Improvements

- Candidate/session remedial KKTP resolution no longer silently falls back to 75.
- Current-assignment checks now include active academic year, class, teacher, and user.
- Student dashboard session visibility is purpose-aware and participant-bound.
- Student and parent remedial list results sanitize question answers and rubrics.
- Report check and remedial finalization use the same advisory-lock key.
- Payment recipients are E.164-normalized and deduplicated.
- Announcement due claiming uses PostgreSQL `SKIP LOCKED` and active Appointment recipients.
- Query-string kiosk token acceptance was removed from the public API.
- AI Chat now has query prefill, multiline input, single-flight send, and unmount abort basics.
- The consolidated migration still applies cleanly according to the executor's disposable
  PostgreSQL evidence.

## Independent Verification

- Focused API rerun: **7 suites / 182 tests passed**.
- Focused Wave 5 web helper rerun: **1 suite / 5 tests passed**.
- API type-check: passed.
- Web type-check: passed.
- `git diff --check`: passed.
- `git diff --cached --check`: passed; no staged changes.
- The first Jest attempt failed only because the default Windows temp cache was not writable
  in the reviewer sandbox. The rerun used an isolated workspace cache, passed, and that cache
  was removed without touching historical untracked files.

The passing tests do not contradict the findings: several tests encode the incorrect
`finance.record` contract, while selected-child, SA mutation negatives, immediate queueing,
and real PostgreSQL race proofs are absent.

## Gate Decision

| Gate | Decision |
|---|---|
| Follow-up source correctness | **FAIL - P1 remains** |
| Automated focused tests | **PASS, coverage gaps remain** |
| PostgreSQL migration apply | **PROVISIONAL PASS** |
| PostgreSQL concurrency proof | **INCOMPLETE** |
| Explicit Git packaging | **HOLD** |
| Staging browser QA | **NOT YET OPEN** |
| Main/production | **OUT OF SCOPE / HOLD** |

## Recommendation

Return this report directly to the same Wave 5 executor and branch. The approved contract is
sufficient; a new Prompt Architect round is not needed unless the Director wants to grant SA
an explicit remedial recovery authority, which would be a new governance decision.

After the P1/P2 follow-up, rerun source review, real PostgreSQL concurrency and notification
queue/recovery proofs, then explicit Git packaging. Only after a reviewed SHA is deployed may
authenticated staging browser QA begin using the saved PII-safe fixture/auth protocol. Do not
request new staging credentials and do not mutate production.

## Confidence

Reviewer confidence: **0.98**.

Estimated current readiness:

- migration/schema: **90%**;
- source contract: **72%**;
- validated end-to-end runtime: **55%**;
- ready for Git packaging: **No**;
- ready for staging sign-off: **No**.
