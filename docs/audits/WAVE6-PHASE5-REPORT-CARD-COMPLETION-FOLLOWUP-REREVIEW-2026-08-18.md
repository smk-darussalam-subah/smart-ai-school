# Wave 6 Phase 5 Report Card Completion - Follow-up Re-review

Date: 2026-08-18

## Verdict

`FOLLOW-UP REQUIRED IN WAVE 6`

The outbound Web Push P1 and partial-enqueue correctness issue are closed. The service
worker implementation is also materially corrected. Explicit Git packaging remains on
hold because one previously required notification-recipient correction is still absent,
and the service-worker security regression is still tested through source text rather
than executable behavior.

No new Prompt Architect decision is required. Apply the two narrow corrections on
`feat/wave6-report-card-completion-20260818`, then return to independent re-review.

## Remaining Findings

### P2-1 - Rapor WhatsApp intent still persists an unnormalized legacy phone

Evidence:

- `apps/api/src/report-cards/report-cards.service.ts:808-818` only calls `trim()` on
  `student.parent.phone`, then persists the result as an active WhatsApp recipient.
- The established `normalizePhoneE164()` boundary is not imported or called in this
  service.
- `apps/api/src/__tests__/report-cards-activities.spec.ts:89` and `:368` use an already
  international-looking number, so they do not prove local-format normalization or
  invalid legacy-value omission.

Impact:

- Values such as `0812...` remain non-canonical, while malformed historical values can
  become durable pending intents and repeatedly fail in the notification worker.
- Dedupe occurs after the raw value is accepted, so equivalent local and international
  forms are not guaranteed to collapse to the same recipient.

Required closure:

1. Normalize with the shared `normalizePhoneE164()` helper before creating and deduping
   the WhatsApp intent.
2. Omit invalid legacy phone values without logging or returning the raw number. Failure
   to create the optional WhatsApp intent must not roll back valid push/in-app intents.
3. Add tests for local `08...`, existing E.164, equivalent normalized recipients, and
   malformed input omitted while the remaining handoff stays truthful.

### P2-2 - Service-worker URL defense is not covered by behavior-level tests

Evidence:

- `apps/web/public/sw.js:63-79` now correctly rejects protocol-relative URLs and
  backslashes, resolves against the current origin, and falls back to `/dashboard`.
- `apps/web/src/__tests__/academic-operational-ui.test.ts:148-163` only checks that source
  strings exist. It does not execute `safeSameOriginPath()` or either event path.

Impact:

- A future refactor can preserve the asserted strings while changing ordering or usage
  and reopening external navigation. The security contract is therefore not locked by
  the regression suite.

Required closure:

1. Exercise the service worker in a mocked worker/VM environment, or extract a helper
   that the deployed service worker actually consumes and test that helper directly.
2. Prove `/dashboard/rapor` is accepted and normalized, while `//external.example`, an
   absolute external URL, backslash input, malformed/non-string input, and encoded edge
   cases fall back to `/dashboard`.
3. Prove both received push data and `notificationclick` use the sanitized value.

## Findings Closed

### P1 Web Push outbound endpoint boundary - Closed

- `apps/api/src/push/dto/push.dto.ts:72-89` enforces bounded HTTPS provider endpoints,
  rejects credentials and explicit ports, blocks local/private IP literals, and uses a
  constrained provider allowlist.
- `apps/api/src/push/push.service.ts:68-77` revalidates stored endpoints before dispatch
  and removes unsafe legacy rows instead of passing them to `web-push`.
- The focused tests cover accepted provider shapes and rejected HTTP, protocol-relative,
  local/private, spoofed, credential-bearing, explicit-port, and overlong values.

Residual infrastructure note: provider-domain egress should remain constrained at the
network layer where practical. This is defense in depth, not a source blocker after the
new allowlist.

### P2 partial notification handoff - Closed

- `apps/api/src/report-cards/report-cards.service.ts:554-571` now reports `queued` only
  when `queuedCount === intentCount`; partial and failed handoffs report
  `pending_recovery`.
- Focused tests cover full success, thrown failure, partial count, and a missing parent
  phone.

The zero-intent state is not a practical successful distribution path because the
student recipient is mandatory in the current model. No additional `none` status is
required unless that model changes.

### Service-worker implementation - Closed at source level

- `apps/web/public/sw.js:63-79`, `:95`, and `:107` use the same same-origin sanitizer for
  both payload storage and click-time navigation.
- The remaining issue is test quality, not the inspected implementation.

## Independent Verification

Executed against the current uncommitted branch:

- focused API: 3 suites / 103 tests passed;
- focused web: 1 suite / 17 tests passed;
- `git diff --check`: passed;
- no staged changes were present.

The executor's type-check, lint, and build results are consistent with this follow-up.
Schema and migration proof do not need to be repeated because these corrections do not
touch Prisma.

## Readiness

| Area | Assessment |
| --- | --- |
| Core Rapor completion | 97% |
| Notification durability/correctness | 95% |
| Web Push source security | 96% |
| Security regression coverage | 89% |
| Source implementation overall | 95% |
| Ready for explicit Git packaging | No |
| Ready for staging browser QA | No |

After the two P2 corrections, rerun the focused API/web suites, API/web type-check and
lint, builds, `git diff --check`, and the service-worker behavior tests. If those pass and
the diff remains scoped, the expected next verdict is
`APPROVED FOR EXPLICIT GIT PACKAGING`; authenticated push and Rapor distribution QA remain
a separate staging gate after the reviewed SHA is deployed.

## Confidence

Reviewer confidence: **99%**.
