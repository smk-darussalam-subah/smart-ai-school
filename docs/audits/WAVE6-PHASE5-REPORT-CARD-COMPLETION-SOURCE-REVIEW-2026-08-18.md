# Wave 6 Phase 5 Report Card Completion - Independent Source Review

Date: 2026-08-18

## Verdict

`FOLLOW-UP REQUIRED IN WAVE 6`

Do not commit, push, open a PR, or deploy this branch yet. The core Rapor ownership,
snapshot, active-period, canonical family view, and durable notification design are
materially improved, but one P1 outbound-security gap and two P2 correctness gaps remain.

No new Prompt Architect decision is required. Keep the corrections on
`feat/wave6-report-card-completion-20260818`.

## Findings

### P1-1 - Authenticated users can store an arbitrary outbound Web Push endpoint

Evidence:

- `apps/api/src/push/dto/push.dto.ts:5-11` accepts any value passing `z.string().url()`.
- `apps/api/src/push/push.service.ts:55-74` persists that endpoint for the authenticated
  user without a protocol or destination safety policy.
- `apps/api/src/push/push.service.ts:86-126` later passes the stored endpoint to
  `web-push`, creating a real server-side outbound request path.

Impact:

- Activating server-side Web Push turns the previously passive endpoint field into an SSRF
  boundary. An authenticated account can register an HTTPS endpoint targeting loopback,
  link-local, private-network, or credential-bearing URLs and cause the API worker to
  connect when a push notification is processed.
- DTOs also have no practical size bounds for endpoint and key material.

Required closure:

1. Parse and canonicalize the endpoint at the API boundary.
2. Require HTTPS, reject credentials, fragments, localhost/local domains, loopback,
   private/link-local IP literals, and malformed ports.
3. Add bounded lengths for endpoint, `p256dh`, and `auth`.
4. Revalidate stored legacy endpoints immediately before dispatch; delete or quarantine
   unsafe rows rather than connecting to them.
5. Add negative tests for HTTP, protocol-relative/malformed URLs, localhost, IPv4/IPv6
   loopback, private/link-local ranges, credentials, and overlong input, plus a positive
   real-world push endpoint shape.

If DNS names resolving to private addresses are in scope, enforce the same rule through
network egress controls or a documented resolution-aware policy; DTO checks alone do not
eliminate DNS rebinding.

### P2-1 - Service-worker navigation accepts protocol-relative external URLs

Evidence:

- `apps/web/public/sw.js:76` treats every string beginning with `/` as same-origin safe.
- A value such as `//example.invalid/path` passes that check but is a protocol-relative
  external URL when used by `navigate()` or `openWindow()`.
- The current test at `apps/web/src/__tests__/academic-operational-ui.test.ts:148-160`
  asserts the weak source string rather than executable URL normalization behavior.

Required closure:

1. Resolve the candidate with `new URL(value, self.location.origin)` and accept it only
   when `resolved.origin === self.location.origin`.
2. Store and open the normalized absolute or pathname URL only after that comparison.
3. Add behavior-level tests for `/dashboard/rapor`, `//external.example`, absolute external
   URLs, malformed input, and safe fallback to `/dashboard`.

### P2-2 - Distribution handoff and WhatsApp recipient are not fully truthful/canonical

Evidence:

- `apps/api/src/report-cards/report-cards.service.ts:554-565` initializes handoff status as
  `queued` and never changes it when `queuedCount < intentCount` without an exception.
- Existing tests cover full success and thrown queue failure, but not a partial handoff.
- `apps/api/src/report-cards/report-cards.service.ts:802-812` trims the parent phone but does
  not use the established `normalizePhoneE164()` boundary used by finance, announcements,
  and remedial notifications.

Impact:

- The API can return a contradictory `queued` status with fewer queued jobs than durable
  intents.
- Legacy local-format or malformed parent numbers can be persisted as active notification
  intents and repeatedly fail in the WhatsApp adapter.

Required closure:

1. Set `pending_recovery` whenever `queuedCount !== intentCount`; define a truthful `none`
   result if no intent exists.
2. Add a partial-count test in addition to success and thrown-failure tests.
3. Normalize valid parent phones with `normalizePhoneE164()` before dedupe/persistence and
   skip invalid legacy values without logging the raw number.
4. Test local `08...`, existing E.164, duplicate normalized recipients, and invalid input.

## Confirmed Improvements

- Rapor list filters are intersected with role ownership instead of overwriting it.
- GURU class filters fail closed against active scope.
- SISWA and ORANG_TUA are constrained to distributed official snapshots.
- Family and student entry points use the canonical Rapor module.
- Generation requires exactly one active academic year and one active semester.
- KKTP value and provenance are persisted in new snapshots; legacy snapshots are not
  silently interpreted as KKTP 75.
- Distribution intents are created in the same transaction as the state transition and
  use internal user UUIDs for push/in-app recipients.
- The existing notification queue is extended rather than duplicated.
- The report event listener is observer-only, avoiding duplicate side effects.
- No Prisma schema, migration, base-role, scheduler, or queue topology change was found.
- Dependency changes are limited to the approved `web-push` runtime package and its types.

## Independent Verification

Executed against the current uncommitted branch:

- focused API: 3 suites / 103 tests passed;
- focused web: 1 suite / 17 tests passed;
- `git diff --check`: passed;
- `git diff --cached --check`: passed;
- no staged changes were present.

The executor's full-suite, builds, type-check, Prisma, and disposable PostgreSQL/Redis
evidence are consistent with the inspected implementation. The findings above are boundary
cases not exercised by the current happy-path tests.

## Readiness

| Area | Assessment |
| --- | --- |
| Core Rapor completion | 96% |
| Notification durability | 91% |
| Web Push security/readiness | 78% |
| Source implementation overall | 91% |
| Ready for explicit Git packaging | No |
| Ready for staging browser QA | No |

After these same-wave corrections, rerun the affected API/web suites, type-check, lint,
build, dependency audit, and clean diff gates. PostgreSQL migration proof does not need to
be repeated if schema and migration files remain unchanged; a focused notification queue
runtime proof should cover partial handoff, invalid phone omission, unsafe endpoint refusal,
and valid push dispatch.

## Confidence

Reviewer confidence: **98%**.
