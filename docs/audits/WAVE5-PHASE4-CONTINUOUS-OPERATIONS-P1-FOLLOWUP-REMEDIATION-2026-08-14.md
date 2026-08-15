# Wave 5 Phase 4 Continuous Operations P1 Follow-up Remediation

Date: 2026-08-14
Branch: `feat/wave5-phase4-continuous-operations-20260813`
Base: `origin/develop`
Status: Ready for reviewer source re-review. No staged change, commit, push, PR, deploy, staging mutation, or production mutation was performed.

## Reviewer Findings Addressed

### P1-1 Remedial KKTP and Historical TeachingAssignment

Closed in source.

- Remedial candidate/session creation no longer silently falls back to system KKTP 75.
- Remedial now requires authoritative KKTP from module source or school config. Missing KKTP returns `409 Conflict`.
- Remedial TeachingAssignment validation now requires the active academic year, active class, active teacher, active user, and exact teacher ownership for non-Super Admin users.
- The remedial finalization/retry path revalidates the same current assignment inside the transaction.

Key files:

- `apps/api/src/assessment/assessment.service.ts`
- `apps/api/src/__tests__/assessment-u2.spec.ts`

### P1-2 Participant-bound Remedial Visibility

Closed in source.

- Student dashboard regular assessments remain class-bound.
- Remedial assessments are now visible only when the current student is an explicit non-cancelled `RemedialParticipant`.
- Student/parent dashboard projection no longer selects raw questions, answer keys, rubric, or scoring snapshot for assignment cards.

Key files:

- `apps/api/src/student-dashboard/student-dashboard.service.ts`
- `apps/api/src/__tests__/student-dashboard.spec.ts`

### P1-3 Remedial Assignment, Result, and Due Reminder Notifications

Closed in source.

- Remedial activation creates participant-bound pending notification logs for assignment.
- Remedial finalization creates participant-bound pending notification logs for result.
- A bounded remedial due-reminder scanner runs on startup and interval, only for active remedial sessions due in the next 24 hours.
- Notification recipients are E.164-normalized, deduped, and skip invalid legacy numbers without logging raw phone values.
- Notification refIds include session, participant, event suffix, and recipient so repeat scans are idempotent under the existing partial unique index and BullMQ pending-log recovery.

Key files:

- `apps/api/src/assessment/assessment.service.ts`
- `apps/api/src/__tests__/assessment-u2.spec.ts`

### P1-4 Report Card Versus Remedial Finalization Race

Closed in source.

- Report-card transition now acquires the same transaction-scoped advisory lock namespace used by remedial finalization for the affected student/class/year/semester grade snapshot.
- Report-card transition rereads the report inside the transaction after the lock before stale-grade validation.
- Remedial finalization locks the source Grade/report snapshot before checking source freshness and before Grade update.

Key files:

- `apps/api/src/report-cards/report-cards.service.ts`
- `apps/api/src/assessment/assessment.service.ts`
- `apps/api/src/__tests__/report-cards-activities.spec.ts`

### P1-5 Finance Effective Authority and Payment Recipient Hygiene

Closed in source.

- Finance page now derives access from `resolveDashboardAuthority`.
- Record SPP is limited to users with `finance.record` and stable `SUPER_ADMIN` or `TATA_USAHA`.
- Approve SPP is limited to users with `finance.approve` and effective `SUPER_ADMIN` or `KEPALA_SEKOLAH`, so appointment-aware KS can approve and BENDAHARA no longer gets approval UI.
- Payment notification recipients are normalized/deduped after E.164 conversion and invalid legacy numbers are skipped without raw PII in logs.

Key files:

- `apps/web/src/app/dashboard/keuangan/page.tsx`
- `apps/web/src/app/dashboard/keuangan/keuangan-ui.ts`
- `apps/web/src/app/dashboard/keuangan/_components/KeuanganTable.tsx`
- `apps/api/src/finance/finance.service.ts`
- `apps/api/src/__tests__/finance.spec.ts`
- `apps/api/src/__tests__/event-wiring.spec.ts`

### P1-6 Scheduled Announcement Trigger and Appointment Audience

Closed in source.

- `AnnouncementsService` now has an autonomous startup/interval due scanner that calls the existing atomic `deliveryPreparedAt` claim path.
- `announcement.manage` is resolved through `PermissionsService`; legacy manager fallback by `KEPALA_SEKOLAH` role was removed.
- Non-manager visibility includes active appointment codes from `PermissionsService.getActivePositionCodes`.
- Scheduled broadcast recipients for position audiences such as `KEPALA_SEKOLAH` are resolved from active `Appointment` holders in the active academic year, not from historical stable roles.

Key files:

- `apps/api/src/announcements/announcements.service.ts`
- `apps/api/src/announcements/announcements.controller.ts`
- `apps/api/src/__tests__/announcements.spec.ts`

## P2 Follow-up

### Kiosk Token Query Leakage

Closed in source.

- Public kiosk endpoint now accepts only `x-diis-kiosk-token`.
- Query-string token fallback was removed.
- Response sets no-store/no-referrer/noindex headers.

Key files:

- `apps/api/src/public-kiosk/public-kiosk.controller.ts`
- `apps/api/src/public-kiosk/public-kiosk.service.ts`
- `apps/api/src/__tests__/public-kiosk.spec.ts`
- `apps/web/src/app/ruang-guru/[token]/page.tsx`

### UI/Test Gaps

Improved for source gate.

- AI Chat has deterministic query prefill, abort cleanup, single-flight sending, multiline Shift+Enter, and failure recovery that restores the user question.
- Keuangan exposes month/year filters and uses effective authority helpers.
- Pengumuman list labels future scheduled announcements as `Terjadwal` until delivery is prepared.
- Wave 5 web tests now import and exercise runtime helper functions instead of only searching source text.

Key files:

- `apps/web/src/app/dashboard/ai/ai-chat-ui.ts`
- `apps/web/src/app/dashboard/ai/page.tsx`
- `apps/web/src/app/dashboard/ai/_components/AiClient.tsx`
- `apps/web/src/app/dashboard/keuangan/keuangan-ui.ts`
- `apps/web/src/app/dashboard/pengumuman/pengumuman-ui.ts`
- `apps/web/src/__tests__/wave5-continuous-operations-ui.test.ts`

## PostgreSQL Disposable Runtime Proof

Runtime proof was executed locally against a disposable PostgreSQL container.

- Image: `pgvector/pgvector:pg16`
- Database: `diis_wave5`
- Container: `diis-wave5-pg-46199338`
- Port: `50165`
- Cleanup: container removed after proof.

Command result summary:

```text
43 migrations found in prisma/migrations
All migrations have been successfully applied.
migrations=43
ref_id_type=character varying:180
session_ck=1
remedial_table=1
announcement_due_idx=1
notification_ref_unique=1
cleanup=diis-wave5-pg-46199338
```

This proves the consolidated Wave 5 migration applies cleanly from an empty PostgreSQL+pgvector database and that the critical columns, constraints, table, and indexes exist after deploy.

## Verification

Automated checks rerun after the P1 follow-up:

- API focused regression:
  - `assessment-u2.spec.ts`
  - `student-dashboard.spec.ts`
  - `announcements.spec.ts`
  - `finance.spec.ts`
  - `public-kiosk.spec.ts`
  - `report-cards-activities.spec.ts`
  - Result: 6 suites / 157 tests pass.
- Additional API event/announcement regression: 2 suites / 47 tests pass.
- Full API suite: 61 suites / 1,220 tests pass.
- Web focused regression: 4 suites / 34 tests pass before helper extraction.
- Wave 5 UI helper regression: 1 suite / 5 tests pass.
- Full web suite: 33 suites / 191 tests pass.
- API type-check: pass.
- Web type-check: pass.
- API lint: pass.
- Web lint: pass, with existing Next lint deprecation/plugin warning only.
- API build: pass.
- Web build: pass, 39/39 pages.
- Prisma validate: pass with local placeholder `DATABASE_URL`.
- `git diff --check`: pass.
- `git diff --cached --check`: pass.

## Explicit Changed File Manifest

Tracked changed files:

- `apps/api/src/__tests__/ai-chat-history.spec.ts`
- `apps/api/src/__tests__/ai-chatbot.spec.ts`
- `apps/api/src/__tests__/announcements.spec.ts`
- `apps/api/src/__tests__/assessment-u2.spec.ts`
- `apps/api/src/__tests__/event-wiring.spec.ts`
- `apps/api/src/__tests__/finance.spec.ts`
- `apps/api/src/__tests__/public-kiosk.spec.ts`
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
- `apps/api/src/student-dashboard/student-dashboard.service.ts`
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

- `apps/api/src/__tests__/student-dashboard.spec.ts`
- `apps/api/src/assessment/remedial.controller.ts`
- `apps/web/src/__tests__/wave5-continuous-operations-ui.test.ts`
- `apps/web/src/app/dashboard/ai/ai-chat-ui.ts`
- `apps/web/src/app/dashboard/akademik/_components/RemedialPanel.tsx`
- `apps/web/src/app/dashboard/keuangan/keuangan-ui.ts`
- `apps/web/src/app/dashboard/pengumuman/pengumuman-ui.ts`
- `docs/audits/WAVE5-PHASE4-CONTINUOUS-OPERATIONS-REMEDIATION-2026-08-13.md`
- `docs/audits/WAVE5-PHASE4-CONTINUOUS-OPERATIONS-SOURCE-REVIEW-2026-08-14.md`
- `docs/audits/WAVE5-PHASE4-CONTINUOUS-OPERATIONS-P1-FOLLOWUP-REMEDIATION-2026-08-14.md`
- `packages/database/prisma/migrations/20260813000001_wave5_continuous_operations/migration.sql`

No dependency, package-lock, Docker, Keycloak, scheduler, deployment, staging, production, or main-branch changes were made.

## Gate Position

Ready for reviewer source re-review.

Still not claimed:

- Git packaging.
- PR/develop promotion.
- Staging deployment.
- Staging browser QA.
- Production/main promotion.

Those gates remain blocked until reviewer approves this source follow-up.
