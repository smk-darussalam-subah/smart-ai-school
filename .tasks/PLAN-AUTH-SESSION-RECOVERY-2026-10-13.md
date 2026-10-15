# Auth/session recovery — local remediation

Authorized 2026-10-13: bring session/UI remediation forward before main promotion.
Local completion is recorded in `done/AUTH-SESSION-RECOVERY-2026-10-13-DONE.md`.
This does not close staging, production, independent-review or artifact gates.
Checkout base `be600fa4532b39501478e2ad82c4f898e4f65ba6`, tree
`d7a94f51b01cd2063ab7bab5ed8008ee187f0ab1` (same as reviewed staging).
Existing untracked Impeccable artifacts are not owned by this task.

## Acceptance

1. A valid web cookie with an expired/rejected backend token cannot cause a
   login/dashboard redirect loop. Recovery/login stays reachable, with a safe
   local return path. Expiry refresh happens at a writable HTTP boundary before
   protected App Router rendering, not via a new framework/dependency patch.
2. Refresh outcomes are validated, temporary provider failures are retryable and
   distinct from definitive revocation, expired/failed access tokens are never
   exposed as usable. Refresh is proactive for active sessions, within the
   existing 30-minute SSO idle policy; session max age remains eight hours.
3. Concurrent refresh of the same credential is coalesced in-process, with a
   bounded short replay window for parallel requests carrying an old cookie.
   Latest credentials are persisted through the installed NextAuth serializer,
   including chunks, HttpOnly/SameSite/Secure behavior and origin isolation.
   Multi-instance coordination is not fabricated.
4. Cookie-derived proxy requests refresh before forwarding and persist cookies.
   Explicit bearer identity, header allowlists, idempotency, compression/status
   handling and permission/revocation enforcement remain intact. Mutations are
   never automatically replayed after an upstream response.
5. Dashboard recovery uses stable unconditional hooks and hard browser navigation
   where needed. Backend/permission outages are shown honestly, not as an empty
   workload or revoked appointment. Preserve typography/brand/density.
6. Reproduce baseline failures, add negative controls, run focused/full affected
   Web tests, type-check/lint/build, and isolated local browser/HTTP lifecycle
   proof. React #310 closure requires browser behavior, not merely absence of
   conditional hooks in application code.

## Boundaries

No dependencies/schema/Keycloak realm/TTL/roles/infrastructure changes. No Git
commit/push/PR/protection/merge/deployment or staging/production writes. No real
attendance mutation, impersonation, shared SSO logout, or computer sleep.
The previously accepted 47-path package stays mechanically preserved, except a
reviewed auth delta if it intersects; record all intersections explicitly.

## Deliverable

Literal source/test/doc manifest, before/after proof, bounded independent-review
handoff and honest local-vs-staging status. No claim of independent self-review,
production readiness, physical-device GPS or principal exemption closure.
