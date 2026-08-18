# Wave 6 Phase 5 - Report Card Completion Remediation

Date: 2026-08-18

Branch: `feat/wave6-report-card-completion-20260818`

Status: `READY FOR INDEPENDENT SOURCE RE-REVIEW`

This is not a Git packaging, PR, staging, or production sign-off. No commit, push,
PR, deploy, staging mutation, production mutation, Prisma schema change, migration,
base role change, queue creation, scheduler creation, or VAPID secret operation was
performed in this pass.

## Entry Conditions

- Main to develop sync precondition completed through PR #515.
- `origin/main` verified at `ff20b235dd1d5ee5d5e8e4a7220944c10cdbef7d`.
- PR #515 merged to develop as `b09b99fa630baf0adbd94eccb1011ea709b58abd`.
- `origin/main` is an ancestor of `origin/develop`.
- Feature branch created from latest `origin/develop`.
- Approved dependency additions only:
  - API runtime: `web-push`
  - API devDependency: `@types/web-push`

## Explicit Product Manifest

- `apps/api/package.json`
- `package-lock.json`
- `apps/api/src/report-cards/dto/report-card.dto.ts`
- `apps/api/src/report-cards/report-cards.service.ts`
- `apps/api/src/report-cards/report-cards.module.ts`
- `apps/api/src/notification/queue.config.ts`
- `apps/api/src/notification/notification.service.ts`
- `apps/api/src/notification/notification-worker.ts`
- `apps/api/src/notification/notification.module.ts`
- `apps/api/src/notification/notification.listener.ts`
- `apps/api/src/push/dto/push.dto.ts`
- `apps/api/src/push/push.service.ts`
- `apps/api/src/__tests__/report-cards-activities.spec.ts`
- `apps/api/src/__tests__/p16-ai-push.spec.ts`
- `apps/web/public/sw.js`
- `apps/web/src/app/dashboard/akademik/actions.ts`
- `apps/web/src/app/dashboard/akademik/_components/ortu/OrtuWorkspace.tsx`
- `apps/web/src/app/dashboard/akademik/_components/ortu/NilaiOrtu.tsx`
- `apps/web/src/app/dashboard/akademik/_components/ortu/RaporModal.tsx` deleted
- `apps/web/src/app/dashboard/akademik/_components/siswa/SiswaWorkspace.tsx`
- `apps/web/src/app/dashboard/akademik/_components/siswa/NilaiSiswa.tsx`
- `apps/web/src/app/dashboard/rapor/page.tsx`
- `apps/web/src/app/dashboard/rapor/_components/RaporHub.tsx`
- `apps/web/src/components/academic/shared/RaporModal.tsx`
- `apps/web/src/components/shared/PushNotificationToggle.tsx`
- `apps/web/src/__tests__/academic-operational-ui.test.ts`

Untracked historical `.tmp/` files from earlier waves were not modified or staged.

## Remediation Summary

### A. Report list ownership

- `ReportCardsService.findAll()` now composes ownership and user filters through
  `AND`, so `classId`, `studentId`, `status`, year, semester, and search cannot
  replace role ownership.
- GURU `classId` filter is fail-closed against active teacher/wali scope.
- KAPROG class filtering remains constrained by active appointment major scope.
- SISWA and ORANG_TUA are forced to distributed reports only.

### B. Family and student canonical Rapor

- ORANG_TUA no longer opens a local live-grade Rapor modal.
- The local parent Rapor modal was removed.
- ORANG_TUA CTA routes to `/dashboard/rapor?studentId=<selected-child>`.
- SISWA CTA routes to `/dashboard/rapor`.
- The canonical Rapor module reads immutable `ReportCard` snapshots and official
  section endpoints instead of live grades.

### C. Immutable KKTP snapshot

- Report generation resolves KKTP through the existing central resolver.
- Each subject snapshot stores:
  - `kktp`
  - `kktpProvenance`
- Supported provenance is explicit: `module`, `config`, or `system_default`.
- Legacy official snapshots without KKTP are rendered as unavailable, not guessed
  as `75`.
- Draft check is blocked when a legacy draft lacks KKTP snapshot data, forcing a
  refresh before review.

### D. Active-period generation

- Report generation is now fail-closed unless there is exactly one active
  academic year and exactly one active semester.
- The UI no longer allows manual year or semester entry in the generate dialog.
- The generate dialog displays read-only active year and active semester.

### E. Durable distribution intent

- Distribution creates pending `NotificationLog` rows inside the report transition
  transaction.
- Created intents are PII-minimal and generic:
  - student push recipient: internal user UUID
  - parent push recipient: internal user UUID
  - parent WhatsApp recipient: phone only when present
- After commit, the service calls `enqueueCommittedPendingLogs(ids)`.
- If queue handoff fails, the report remains distributed and response exposes
  `notificationHandoff.status = pending_recovery`.
- The existing `report.distributed` event remains observer-only and no longer
  creates duplicate notification side effects.

### F. Actual Web Push and in-app history

- Notification queue job type now supports channel `push`.
- Notification worker routes push jobs to `PushService` instead of the WhatsApp or
  email adapter.
- `PushService` dispatches Web Push using approved `web-push` dependency and
  existing VAPID environment variables.
- Push payload is generic, same-origin, and routes to `/dashboard/rapor`.
- Stale or malformed subscriptions are cleaned up.
- `findMyNotifications()` is now user-bound by resolved internal user ID and
  `channel = push`; it no longer searches phone/email recipients.
- SISWA and ORANG_TUA workspaces pass `fetchMyNotifications` into the push toggle.
- `apps/web/public/sw.js` now handles `push` and `notificationclick` with safe JSON
  fallback and same-origin navigation.

## Reviewer Follow-up Closure

Follow-up executed after
`WAVE6-PHASE5-REPORT-CARD-COMPLETION-SOURCE-REVIEW-2026-08-18.md`.

### P1. Push endpoint outbound bounds

- `SubscribeSchema` and `UnsubscribeSchema` now use a shared `PushEndpointSchema`.
- Endpoint input is trimmed and capped at `2048` characters.
- Only HTTPS Web Push provider hosts are accepted:
  - `android.googleapis.com`
  - `fcm.googleapis.com`
  - `fcmregistrations.googleapis.com`
  - `notify.windows.com` subdomains
  - `push.apple.com` subdomains
  - `updates.push.services.mozilla.com`
- Credential-bearing URLs, explicit non-default ports, localhost, `.localhost`,
  private/local IP literals, protocol-relative values, and arbitrary domains are
  rejected.
- `PushService` revalidates stored subscription endpoints before outbound
  dispatch; unsafe legacy rows are deleted as malformed subscriptions and are not
  passed to `web-push`.
- Focused tests cover valid FCM input, trimming, protocol-relative rejection,
  localhost/loopback rejection, arbitrary host rejection, credential/port rejection,
  provider suffix-spoofing rejection, max-length rejection, and unsafe
  stored-endpoint cleanup before dispatch.

### P2. Service worker notification URL validation

- `apps/web/public/sw.js` now routes all notification URLs through
  `safeSameOriginPath()`.
- The helper rejects protocol-relative URLs such as `//example.com`, rejects
  backslash-bearing paths, and normalizes allowed paths through
  `new URL(candidate, self.location.origin)`.
- The same helper is applied during `push` payload handling and
  `notificationclick`, so old notification data cannot bypass the guard.

### P2. Distribution handoff status consistency

- Report distribution now returns `queued` only when
  `queuedCount === intentCount`.
- Partial queue handoff returns `pending_recovery` with the actual bounded
  `queuedCount`.
- Queue exceptions still return `pending_recovery` with `queuedCount = 0`.
- Focused tests cover full queue success, queue failure, partial queue handoff,
  and parent-without-phone push-only intent.

## Second Reviewer Follow-up Closure

Follow-up executed after
`WAVE6-PHASE5-REPORT-CARD-COMPLETION-FOLLOWUP-REREVIEW-2026-08-18.md`.

### P2. WhatsApp recipient normalization for Rapor distribution

- Report distribution now normalizes the parent WhatsApp recipient with the shared
  backend `normalizePhoneE164()` helper.
- Invalid legacy phone values are ignored fail-softly; student/parent push intents
  are still created and queued.
- Focused tests cover:
  - local `08...` input normalized to `+62...`;
  - existing E.164 input preserved;
  - equivalent formatted values using one normalized recipient so existing pending
    rows are requeued instead of duplicated;
  - invalid legacy phone skipped without cancelling push/in-app notification
    intent.

### P2. Behavioral service-worker URL safety test

- The service worker URL guard remains implemented through `safeSameOriginPath()`.
- The web test now executes `apps/web/public/sw.js` inside a sandboxed service
  worker harness and triggers real `push` plus `notificationclick` handlers.
- Behavioral coverage proves:
  - internal paths are preserved;
  - protocol-relative URLs fall back to `/dashboard`;
  - external absolute URLs fall back;
  - backslash-bearing paths fall back;
  - malformed encoded paths fall back;
  - missing payload and malformed JSON fall back;
  - click navigation uses the same sanitization path.

## Verification

### Automated source gates

- API focused follow-up: `3 suites / 107 tests` pass.
  - `p16-ai-push.spec.ts`
  - `report-cards-activities.spec.ts`
  - `notification.spec.ts`
- API full from the initial source pass before this follow-up: `61 suites / 1241
  tests` pass.
- Web focused: `1 suite / 18 tests` pass.
- Web full from the initial source pass before this follow-up: `33 suites / 200
  tests` pass.
- API type-check: pass.
- Web type-check: pass.
- API lint: pass.
- Web lint: pass, with existing Next lint deprecation/plugin notice.
- API build: pass.
- Web build: pass, `39/39` pages generated.
- Prisma validate: pass with dummy non-secret `DATABASE_URL`.
- `git diff --check`: pass.
- `git diff --cached --check`: pass.
- No staged changes.

### PostgreSQL and Redis disposable proof

Runtime containers used only for disposable local proof:

- PostgreSQL: `diis-wave6-pg`, local port `55446`, image `pgvector/pgvector:pg16`.
- Redis: `diis-wave6-redis`, local port `56386`, image `redis:7-alpine`.

Proof sequence:

1. Applied all official Prisma migrations to a clean PostgreSQL database.
2. `43 migrations found` and all were successfully applied.
3. Ran a temporary service-level runtime proof against the disposable database and
   Redis queue.
4. Seeded only synthetic records for one wali kelas, one student, one parent, one
   active class, one active period, one teaching assignment, one grade, and one KKTP
   config.
5. Generated report draft through `ReportCardsService.generate`.
6. Confirmed subject snapshot stores `kktp = 72` and `kktpProvenance = config`.
7. Confirmed ORANG_TUA cannot read the report before distribution:
   `Rapor belum dibagikan untuk periode ini`.
8. Ran check, publish, and distribute transitions through service authority mocks.
9. Confirmed distributed family official section reads `snapshotStatus = distributed`.
10. Confirmed distribution handoff returned:
    - `status = queued`
    - `intentCount = 3`
    - `queuedCount = 3`
11. Confirmed committed log channels were exactly:
    - `push`
    - `push`
    - `whatsapp`
12. Confirmed BullMQ had `3` queued jobs with deterministic log IDs.
13. Confirmed notification bodies did not contain the synthetic NIS.

Cleanup:

- Temporary proof script was deleted.
- `diis-wave6-pg` and `diis-wave6-redis` were stopped and removed.
- No staging or production database was accessed.

## Known Non-Source Gates

Authenticated browser QA is intentionally not claimed in this source pass. Per the
current project protocol, browser QA for real auth/session behavior should run on
staging after the reviewed candidate SHA is deployed.

Staging QA must still prove:

- GURU can generate only active-period draft reports for owned classes.
- Forged class filter for GURU is denied.
- WAKA/KS/TU/SA report transitions respect effective authority.
- ORANG_TUA with multiple children only opens the selected child's canonical Rapor.
- SISWA CTA opens own canonical Rapor.
- Distributed report displays immutable KKTP snapshot after KKTP config changes.
- Queue failure shows pending recovery honestly.
- Web Push works with real browser subscription and VAPID staging config without
  exposing endpoint, keys, or secrets.
- Mobile viewport has no overlap on Rapor hub, family dashboard, and push toggle.

## Reviewer Focus

Please review:

- Whether the source scope stays inside Wave 6 and approved dependency changes.
- Whether report ownership filters are always intersected with role ownership.
- Whether family/student UI no longer renders live-grade reports as official Rapor.
- Whether KKTP snapshot and legacy no-guess behavior are sufficient.
- Whether distribution intent is durable, generic, and recoverable.
- Whether Web Push dispatch uses existing queue/log/subscription primitives without
  creating a second notification center or queue.
- Whether staging browser QA can proceed after source sign-off and Git packaging.
