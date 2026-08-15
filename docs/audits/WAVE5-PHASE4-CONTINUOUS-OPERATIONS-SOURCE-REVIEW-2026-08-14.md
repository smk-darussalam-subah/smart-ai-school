# Wave 5 Phase 4 Continuous Operations - Independent Source Review

Date: 2026-08-14
Branch: `feat/wave5-phase4-continuous-operations-20260813`
Base reviewed: `origin/develop@5afc7ccaec9edcacfa9a0a5d69fc39cbaade66e4`
Verdict: **FOLLOW-UP REQUIRED IN WAVE 5**

## Executive Summary

The additive migration, database invariants, strict DTOs, remedial lineage, assessment reuse,
SPP one-winner approval, AI session ownership, and server-side kiosk name masking are useful
progress. The reported PostgreSQL disposable proof is credible and the independent focused
test rerun passed.

Source approval is nevertheless withheld. The current implementation still has multiple P1
gaps against the approved Wave 5 contract: remedial decisions can silently fall back to KKTP
75, historical TeachingAssignments can be used, nonparticipants can see remedial metadata,
the parent projection can expose answer keys, required remedial notifications do not exist,
scheduled announcement delivery has no autonomous driver, finance UI/notification behavior
does not use the effective authority and recipient contract, and the report-check/remedial
finalization boundary remains vulnerable to a time-of-check/time-of-use race.

No source implementation, Git operation, deployment, database mutation, Keycloak mutation,
or infrastructure mutation was performed during this review.

## Findings

### P1-R1 - Remedial still uses a forbidden silent KKTP fallback and accepts historical scope

Evidence:

- `apps/api/src/assessment/assessment.service.ts:200-227` returns `75` with
  `system_default` when neither a source module nor exact `KktpConfig` exists.
- `apps/api/src/assessment/assessment.service.ts:1705-1716` selects a TeachingAssignment
  from the academic year supplied by the caller, without proving it is the single active
  academic year or that the class, teacher, and user are currently active and not deleted.
- `apps/api/src/assessment/assessment.service.ts:288-296` checks only teacher ownership.
- `docs/audits/WAVE5-PHASE4-CONTINUOUS-OPERATIONS-REMEDIATION-2026-08-13.md:32-37`
  explicitly records the fallback as an implemented policy, while the approved prompt at
  `docs/audits/PROMPT-ARCHITECT-WAVE5-PHASE4-CONTINUOUS-OPERATIONS-2026-08-13.md:202-209`
  requires an authoritative source and an actionable blocked state when it is missing.

Impact:

- A student may be classified as remedial or non-remedial using the wrong threshold.
- A teacher can create/manage remedial work from a historical assignment after the school
  has moved to another active academic year.

Required follow-up:

1. Remove `system_default` from every operational remedial decision.
2. Resolve KKTP only from the authoritative source module snapshot or exact KktpConfig.
3. Return an actionable 409/422 when authoritative KKTP is unavailable.
4. Bind candidate/create/update/activate/finalize/retry to the single active academic year,
   active class, valid current TeachingAssignment, and active/non-deleted teacher and user.
5. Add negative tests for missing KKTP, non-75 KKTP, historical assignment, inactive class,
   deleted/inactive teacher, and zero/multiple active academic years.

### P1-R2 - Remedial visibility is not participant-bound end to end

Evidence:

- `apps/api/src/student-dashboard/student-dashboard.service.ts:141-169` lists every active or
  completed session for the student's class. It does not separate regular/remedial purpose
  and does not require a matching `RemedialParticipant`. A nonparticipant classmate therefore
  receives remedial title/status metadata and a false task card.
- `apps/api/src/assessment/assessment.service.ts:68-80` includes raw `questions` in the shared
  session projection.
- `apps/api/src/assessment/assessment.service.ts:305-317` proves the stored snapshot contains
  `answer` and `rubric`.
- `apps/api/src/assessment/assessment.service.ts:1682-1689` sanitizes the SISWA remedial list,
  but `apps/api/src/assessment/assessment.service.ts:1692-1699` returns the raw page to
  ORANG_TUA without the same sanitation.
- There is no parent remedial surface or parent-switch regression in the changed web source;
  the only new remedial panel is the teacher panel.

Impact:

- Nonparticipant students and parents can learn that a remedial exists for their class.
- The authorized parent remedial endpoint can disclose answer keys/rubrics.
- The parent cannot reliably monitor status for the selected child as required.

Required follow-up:

1. Make all student-dashboard assignment queries purpose-aware and participant-bound.
2. Create a dedicated family projection that contains only selected-child status, due date,
   attempt, and completion state; exclude questions, answers, rubric, and raw score.
3. Add a parent child switch without first-child fallback.
4. Test participant/nonparticipant classmates, two-child switching, forged child/session IDs,
   and recursive absence of `answer`, `rubric`, and raw score.

### P1-R3 - The remedial notification lifecycle is missing

Evidence:

- `apps/api/src/assessment/assessment.service.ts:1919-1941` activates a remedial with no
  required assignment notification log.
- `apps/api/src/assessment/assessment.service.ts:1981-2100` finalizes a participant and may
  update Grade/outbox, but creates no participant/parent outcome notification.
- No due-reminder claim or reschedule/supersede implementation exists in the assessment
  module; `dueAt` is only stored/read.
- The approved contract requires assignment/outcome notifications and an approximately
  24-hour DB-driven reminder using the existing NotificationLog/BullMQ/recovery mechanism.

Impact:

- Students and parents are not informed when remedial is assigned, nearing due, completed,
  passed, or needs retry.
- Storing a due date does not create continuous operations.

Required follow-up:

1. In the same business transaction, create normalized, deduplicated pending logs for every
   mandatory assignment/outcome delivery.
2. Enqueue after commit with deterministic job IDs and retain pending recovery semantics.
3. Add a PostgreSQL-claimed reminder scanner using the existing application interval/outbox
   pattern; do not create a second queue or scheduler dependency.
4. Prove reschedule supersedes obsolete reminders, cancellation suppresses them, two workers
   claim once, retry is idempotent, and notifications do not contain raw scores.

### P1-R4 - Report check and remedial Grade finalization have a TOCTOU race

Evidence:

- `apps/api/src/report-cards/report-cards.service.ts:406-420` checks for Grade updates before
  entering the transaction used for the report status update.
- `apps/api/src/report-cards/report-cards.service.ts:453-472` then changes the report from
  draft to checked in a separate transaction whose CAS only checks report status.
- `apps/api/src/assessment/assessment.service.ts:2023-2026` checks for a locked report before
  updating Grade, but the report may still be draft at that instant.
- `apps/api/src/assessment/assessment.service.ts:2054-2063` can then update the Grade while a
  concurrent report check is between its read and write.

Race example:

1. Report check sees no newer Grade while report is draft.
2. Remedial finalization sees no checked report and updates Grade.
3. Report check changes the stale draft to checked.

Impact:

A checked report can become stale even though both isolated guards pass.

Required follow-up:

Use one shared serialization boundary for report check/refresh and remedial finalization,
such as a transaction-scoped advisory lock keyed by student/class/year/semester followed by
fresh reads inside the transaction. Add a real PostgreSQL two-connection race proof in both
execution orders.

### P1-R5 - Finance effective authority and recipient rules are incomplete

Evidence:

- `apps/web/src/app/dashboard/keuangan/page.tsx:25-30` derives controls only from session/view
  roles. It does not use `resolveDashboardAuthority()` or effective permissions. An active
  appointment-based Kepala Sekolah remains a stable GURU identity and does not receive the
  approval control even though the API authorizes the appointment dynamically.
- `apps/api/src/finance/finance.service.ts:257-277` inserts raw phone values and gives student
  and parent different refIds. It only removes empty values; it does not normalize or dedupe
  identical recipients.
- The shared E.164 helper already exists at
  `apps/api/src/common/helpers/phone.ts:17-34` but is not used here.

Impact:

- A legitimate KS sees a UI that cannot perform the approved action.
- One physical number can receive duplicate receipts, and differently formatted duplicates
  may bypass the active unique index.

Required follow-up:

1. Gate record/approve UI with effective permission plus the approved actor matrix.
2. Normalize valid recipients to E.164, discard invalid/empty recipients fail-soft with safe
   observability, dedupe by normalized recipient, and use payment UUID plus recipient in the
   deterministic dedupe contract.
3. Add tests for active/suspended/future KS appointment, explicit revoke, same student/parent
   phone, mixed phone formats, empty/invalid numbers, and immediate enqueue plus recovery.

### P1-R6 - Scheduled announcement delivery has an atomic claim but no autonomous driver

Evidence:

- `apps/api/src/announcements/announcements.service.ts:67-134` implements a sound PostgreSQL
  `SKIP LOCKED` claim.
- The only callers are `findAll`, `findOne`, and create/update/publish paths at
  `apps/api/src/announcements/announcements.service.ts:136-137,173-175,185-201,205-253`.
- No application interval, internal automation endpoint, startup recovery, or operator-owned
  trigger invokes the due scanner.
- `apps/api/src/announcements/announcements.service.ts:103-126` resolves broadcast recipients
  from `User.role`. The UI offers `KEPALA_SEKOLAH` as an audience at
  `apps/web/src/app/dashboard/pengumuman/_components/PengumumanForm.tsx:23-34`, but that is a
  period-bound Appointment code, not a stored stable identity role.

Impact:

- A future urgent announcement may never be prepared until somebody happens to open an
  announcement page after its due time.
- A targeted Kepala Sekolah broadcast can produce zero recipients despite an active holder.

Required follow-up:

1. Give the scanner one explicit operational owner using the existing interval/outbox pattern
   permitted by the prompt, with startup and periodic recovery.
2. Resolve audience recipients from stable roles plus active appointments, or remove position
   codes from the audience selector and expose a truthful supported audience model.
3. Normalize/dedupe recipients and prove no early send, due once, restart, two instances,
   zero recipient, archive-before-due, reschedule, and active Appointment targeting.

### P2-R7 - Kiosk transport and security headers are not fully closed

Evidence:

- `apps/api/src/public-kiosk/public-kiosk.controller.ts:17-22` still accepts `?token=` as a
  fallback. The remediation report states query leakage was removed, but the API contract
  still permits it.
- `apps/web/src/app/ruang-guru/[token]/page.tsx:5-19` adds metadata/no-referrer fetch behavior,
  but no route response proof exists for `Cache-Control: no-store`, `Referrer-Policy`, and
  `X-Robots-Tag` headers.
- The focused kiosk test only exercises the service aggregation and does not test the public
  controller transport contract, token rotation, or response headers.

Required follow-up:

Remove API query-token acceptance, add route-level response headers, and test header-only
transport, generic invalid state, old-invalid/new-valid rotation, no token echo/log, and
PII-free payload.

### P2-R8 - UI and web regression coverage do not meet the Wave 5 acceptance contract

Evidence:

- No web test file is added or changed in the Wave 5 diff, despite substantial new/remodeled
  Remedial, Finance, Announcement, AI Chat, and Kiosk behavior.
- `apps/web/src/app/dashboard/ai/_components/AiClient.tsx:78-99,238-247` does not implement
  `?q=` prefill, abort/unmount protection, or Shift+Enter multiline behavior; it uses a
  single-line Input.
- `apps/web/src/app/dashboard/keuangan/_components/KeuanganTable.tsx:258-264` hardcodes June
  2026 instead of current WIB month/year, while period/class filters accepted by the page/API
  are not exposed in the operational UI.
- `apps/web/src/app/dashboard/pengumuman/_components/PengumumanList.tsx:217-225` labels a
  future scheduled record as already published because status is `published`.

Required follow-up:

Add behavior-based web tests for the exact Wave 5 workflows, then run staging browser QA at
1440x900 and 390x844 using the established PII-safe staging auth fixture protocol. Browser QA
must cover role negatives, child switching, direct URLs, retries, stale state, focus/keyboard,
mobile overflow, console/network cleanliness, and token/phone/answer-key/PII absence.

## Positive Evidence

- Git base is cleanly anchored at the current `origin/develop` reviewed in this worktree.
- No old migration was edited; one new consolidated migration is present.
- No dependency, lockfile, Docker, Keycloak, deployment, or production file change is in the
  Wave 5 diff.
- Strict remedial DTOs, participant/source-Grade relations, retry lineage, response uniqueness,
  one-winner SPP approval, AI owner-scoped sessions, and server-side short teacher names are
  directionally correct.
- Executor PostgreSQL evidence reports all 43 migrations applied from blank pgvector PostgreSQL
  plus actual uniqueness/claim/concurrency proofs.
- Independent rerun: 8 API suites / 199 tests passed.
- Independent rerun: API and web type-check passed.
- Independent `git diff --check` and cached check passed; no staged changes existed.

The green tests do not invalidate the findings: the missing negative cases and UI behavior are
not represented by the current suites.

## Gate Decision

| Gate | Result | Reason |
|---|---|---|
| Source architecture | FOLLOW-UP REQUIRED | Core domain reuse is good, but authoritative scope/read projections are incomplete. |
| Authorization/privacy | BLOCKED | Nonparticipant metadata and parent answer-key exposure remain. |
| Data integrity/concurrency | BLOCKED | KKTP fallback and report/remedial race remain. |
| Notification durability | BLOCKED | Remedial notifications and autonomous announcement driver are missing. |
| Automated evidence | PARTIAL PASS | Existing focused/full suites pass, but required negative/web cases are absent. |
| PostgreSQL migration | PROVISIONAL PASS | Executor disposable proof is strong; rerun after source follow-up changes. |
| Browser/staging | NOT STARTED BY DESIGN | Correctly held for staging-only QA after source approval. |
| Git packaging | HOLD | Do not commit/push/PR until same-branch follow-up is re-reviewed. |

## Recommended Next Step

Send this report directly to the Executor. A new Prompt Architect round is not required because
the approved prompt already decides the authority, KKTP, notification, privacy, concurrency,
and staging-only browser rules. Keep every fix on the same Wave 5 branch.

Executor sequence:

1. Close P1-R1 through P1-R6 first.
2. Add focused API and behavior-based web regressions for every finding.
3. Rerun PostgreSQL disposable migration and real concurrency/claim proofs.
4. Close P2-R7 and P2-R8.
5. Update the remediation report so it no longer claims fallback/query-token behavior as fixed.
6. Stop again at independent re-review with no staged changes.
7. Only after source re-approval: explicit Git packaging, deploy to staging, then authenticated
   browser QA using the stored staging protocol. Do not request new staging credentials or
   mutate production.

## Confidence

Reviewer confidence: **98%**.

Estimated current readiness:

- Migration mechanics: **88%**.
- Source implementation against the approved Wave 5 contract: **64%**.
- E2E runtime readiness: **48%**.
- Ready for Git packaging: **No**.
- Ready for staging QA: **No**.

The lower readiness score is driven by directly traceable authorization, answer-key,
authoritative-KKTP, notification, and concurrency gaps rather than by missing browser evidence
alone.
