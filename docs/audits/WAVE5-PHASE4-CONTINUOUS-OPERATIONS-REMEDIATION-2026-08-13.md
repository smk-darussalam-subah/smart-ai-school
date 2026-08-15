# Wave 5 Phase 4 Continuous Operations Remediation

Date: 2026-08-13
Branch: `feat/wave5-phase4-continuous-operations-20260813`
Base: `origin/develop`
Status: Ready for reviewer source/runtime gate. No commit, push, PR, deploy, staging mutation, or production mutation performed.

Update 2026-08-14: this initial report has been superseded by
`docs/audits/WAVE5-PHASE4-CONTINUOUS-OPERATIONS-P1-FOLLOWUP-REMEDIATION-2026-08-14.md`
after reviewer P1/P2 follow-up. Use the 2026-08-14 follow-up report for current gate status and verification counts.

## Scope Implemented

This remediation follows the revised Director approval for one additive consolidated Wave 5 migration and same-branch implementation.

Implemented:

- `NotificationLog.refId` changed from UUID-shaped storage to `varchar(180)` with related indexes rebuilt, including partial unique `notification_logs_ref_active_unique`.
- `Announcement.deliveryPreparedAt` and due-scan index added. Due announcement preparation now uses this marker for atomic claim and pending notification-log creation. `broadcastQueuedAt` was not introduced.
- Effective or prepared announcements are immutable for content, audience, category, priority, and schedule. Pin/archive remain controlled by authority.
- `AssessmentSession` now supports `purpose`, nullable `teachingAssignmentId`, `dueAt`, `instructions`, and cancelled lifecycle. `moduleId` is nullable only to support remedial sessions from manual Grade.
- Database constraint enforces regular sessions with `moduleId` and remedial sessions with `teachingAssignmentId`.
- New sessions are required by service and database trigger to carry an exact TeachingAssignment context. Legacy backfill only uses deterministic one-match mapping by teacher, class, subject, and academic year.
- Added only `RemedialParticipant`; no second remedial assignment model was created.
- `RemedialParticipant` stores session/student/source Grade relations, lifecycle, retry lineage, source score snapshot, source `Grade.updatedAt` snapshot, raw/effective score, KKTP value/provenance, timestamps, indexes, unique constraints, and score range checks.
- Existing unique `(sessionId, studentId)` on `AssessmentResponse` is preserved.
- Remedial retry creates a successor remedial session and participant atomically instead of weakening response uniqueness.
- Added exactly four remedial permissions:
  - `academic.remedial.manage`
  - `academic.remedial.read`
  - `remedial.own.read`
  - `remedial.child.read`
- Added `announcement.manage` for `TATA_USAHA` and `ai.chat` for `GURU`.
- Preserved appointment permissions for `WAKA_KESISWAAN` and `WAKA_HUMAS` announcements.
- Removed `finance.approve` from `BENDAHARA`.
- Remedial grade policy:
  - passed remedial updates source Grade to exact KKTP after teacher finalization;
  - remedial never lowers an existing Grade;
  - failed remedial does not update Grade;
  - source Grade change after assignment returns conflict;
  - initial implementation allowed explicit `system_default` KKTP provenance; the 2026-08-14 follow-up tightens remedial creation/finalization so remedial no longer silently falls back to KKTP 75.
- SPP manual create remains unpaid; approval is one-winner and creates pending notification logs without event-emitter reliance.
- AI chat now uses persistent owner-scoped chat sessions without creating an empty session before provider success.
- Kiosk token handling avoids token query leakage by accepting `x-diis-kiosk-token` and masks teacher names.
- Report-card check blocks stale drafts when Grade data changed after draft generation.

## Explicit File Manifest

Tracked changed files:

- `apps/api/src/__tests__/ai-chat-history.spec.ts`
- `apps/api/src/__tests__/ai-chatbot.spec.ts`
- `apps/api/src/__tests__/announcements.spec.ts`
- `apps/api/src/__tests__/assessment-u2.spec.ts`
- `apps/api/src/__tests__/event-wiring.spec.ts`
- `apps/api/src/__tests__/finance.spec.ts`
- `apps/api/src/__tests__/report-cards-activities.spec.ts`
- `apps/api/src/__tests__/sma48-claude-adapter.spec.ts`
- `apps/api/src/ai/ai.controller.ts`
- `apps/api/src/ai/ai.service.ts`
- `apps/api/src/announcements/announcements.controller.ts`
- `apps/api/src/announcements/announcements.service.ts`
- `apps/api/src/announcements/dto/announcement.dto.ts`
- `apps/api/src/assessment/assessment.module.ts`
- `apps/api/src/assessment/assessment.service.ts`
- `apps/api/src/assessment/dto/assessment.dto.ts`
- `apps/api/src/events/events.types.ts`
- `apps/api/src/finance/dto/create-spp.dto.ts`
- `apps/api/src/finance/dto/list-spp.dto.ts`
- `apps/api/src/finance/finance.service.ts`
- `apps/api/src/public-kiosk/public-kiosk.controller.ts`
- `apps/api/src/public-kiosk/public-kiosk.service.ts`
- `apps/api/src/report-cards/report-cards.service.ts`
- `apps/web/src/app/dashboard/ai/_components/AiClient.tsx`
- `apps/web/src/app/dashboard/ai/page.tsx`
- `apps/web/src/app/dashboard/akademik/_components/AkademikWorkspace.tsx`
- `apps/web/src/app/dashboard/akademik/actions.ts`
- `apps/web/src/app/dashboard/akademik/page.tsx`
- `apps/web/src/app/dashboard/keuangan/_components/KeuanganTable.tsx`
- `apps/web/src/app/dashboard/keuangan/page.tsx`
- `apps/web/src/app/dashboard/pengumuman/_components/PengumumanForm.tsx`
- `apps/web/src/app/dashboard/pengumuman/_components/PengumumanList.tsx`
- `apps/web/src/app/dashboard/pengumuman/page.tsx`
- `apps/web/src/app/ruang-guru/[token]/page.tsx`
- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/seed-permissions.ts`

New files:

- `apps/api/src/assessment/remedial.controller.ts`
- `apps/web/src/app/dashboard/akademik/_components/RemedialPanel.tsx`
- `packages/database/prisma/migrations/20260813000001_wave5_continuous_operations/migration.sql`
- `docs/audits/WAVE5-PHASE4-CONTINUOUS-OPERATIONS-REMEDIATION-2026-08-13.md`

No dependency, package-lock, Docker, Keycloak, scheduler, production, or deployment file changes were made.

## Verification

Automated gates:

- API type-check: pass.
- Web type-check: pass.
- API lint: pass.
- Web lint: pass, with existing Next lint deprecation/plugin warning only.
- API build: pass.
- Web build: pass, 39/39 pages.
- Focused API regression: 8 suites / 199 tests pass.
- Full API suite: 60 suites / 1,210 tests pass.
- Focused web regression: 3 suites / 23 tests pass.
- Full web suite: 32 suites / 186 tests pass.
- Prisma validate: pass.
- `git diff --check`: pass.
- `git diff --cached --check`: pass.

Focused API command covered finance, event wiring, announcements, assessment/remedial, report cards, public kiosk, and AI chat history/session behavior.

## PostgreSQL Disposable Runtime Proof

Disposable container:

- Image: `pgvector/pgvector:pg16`
- Database: `diis_wave5`
- Port: `55435`
- Cleanup: container removed after proof.

Migration proof:

- `prisma migrate deploy` applied all 43 migrations from a blank PostgreSQL database, including `20260813000001_wave5_continuous_operations`.
- First attempt against plain `postgres:16-alpine` correctly failed because `pgvector` extension was unavailable; proof was rerun with pgvector image.
- A real trigger defect was found and fixed: the shared academic context trigger referenced `NEW.teaching_assignment_id` while running against old tables that do not have that column. The final trigger branches on `TG_TABLE_NAME` before reading assessment-only columns.

Database invariant proof:

- Verified `notification.notification_logs.ref_id` is `varchar(180)`.
- Verified notification ref indexes exist, including `notification_logs_ref_active_unique`.
- Verified `announcements_due_scan_idx` exists.
- Verified `assessment_sessions_purpose_context_ck` exists.
- Verified notification active partial unique rejects duplicate pending notification for the same `refType/refId/recipient/channel`.
- Verified regular assessment without module fails closed.
- Verified remedial assessment without TeachingAssignment fails closed.
- Verified valid regular and remedial sessions insert with exact TeachingAssignment.
- Verified duplicate `AssessmentResponse(sessionId, studentId)` is rejected.
- Verified duplicate open `RemedialParticipant` for the same source Grade is rejected.
- Verified retry lineage allows successor participant after prior participant moves to `needs_retry`.
- Verified announcement due claim with two parallel claimers returns `1,0` and marks exactly one row prepared.
- Verified finance unpaid approval with two parallel writers returns `1,0` and leaves one paid row.

Final proof query result:

```text
wave5-sql-proof-pass | notification_logs=1 | assessment_sessions=3 | remedial_participants=2
announcement claim-results=1,0 | prepared_count=1
finance-approve-results=1,0 | status=paid | approved_once=true
```

## Local Browser QA Status

Authenticated local browser QA was not completed and is not claimed.

Reason:

- The repository documents local full-stack QA through Docker, NextAuth, and Keycloak, but this worktree does not include the referenced local env templates (`infrastructure/docker/.env.example`, `apps/web/.env.local.example`) or a ready PII-safe local Keycloak fixture account.
- Browser/Chrome automation tools were not callable in this Codex tool context; only Node REPL discovery was available.
- Starting an unauthenticated local browser smoke would only prove public redirects/static rendering and would not validate Wave 5 authenticated workflows.

Recommendation:

- Reviewer should treat source, automated tests, and PostgreSQL disposable proof as complete for this gate.
- Authenticated browser QA should be run after reviewer approval using the established staging-only auth fixture protocol, or a properly provisioned local Keycloak fixture if the reviewer explicitly requires local-only browser evidence.

## Reviewer Gate Notes

Items for reviewer focus:

- Confirm one consolidated additive migration only, with no old migration edits.
- Inspect the shared academic trigger branch safety for RPP/LMS/Assessment.
- Confirm no `broadcastQueuedAt`, scheduler, notification queue, assessment engine, or second remedial assignment model was introduced.
- Confirm remedial permissions and finance/announcement permission corrections match the approved matrix.
- Confirm remedial retry does not weaken `AssessmentResponse(sessionId, studentId)` uniqueness.
- Confirm local browser QA is explicitly not claimed.

No changes are staged. Git packaging remains held until reviewer approval.
