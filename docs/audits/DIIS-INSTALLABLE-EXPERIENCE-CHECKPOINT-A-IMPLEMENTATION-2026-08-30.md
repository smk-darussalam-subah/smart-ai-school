# DIIS Installable Experience Checkpoint A Implementation

Date completed: 2026-09-22

Role: Executor

Verdict: `FOLLOW-UP SOURCE COMPLETE - INDEPENDENT RE-REVIEW REQUIRED`

Next gate: focused independent re-review of server-verified push delivery and final evidence

## 1. Binding and approved product decisions

- Worktree: `C:/Users/USER/.codex/worktrees/diis-installable-experience-20260921`
- Branch: `feat/diis-installable-experience-20260921`
- Baseline SHA: `5143c28620c7fbf2db356f8eecfe6ac6ca25e559`
- Baseline tree: `3481339b5af93867fd2bfa881c6d2068b160885e`
- Source manifest: 33 literal paths
- Source aggregate SHA-256: `83fc06741f2a3618571c77208e854f0354a4df0be5a874ff852b665d2722a88e`
- Aggregate algorithm: sorted manifest lines in the form `<sha256-or-DELETED><two spaces><path><LF>`
- Final closure-file SHA-256:
  - `apps/api/src/__tests__/p16-ai-push.spec.ts`: `b2f69c50dc0785ebd5c9a25718ee70f3dfdae8a6f9758c5ac2a1b8439f16549a`
  - `apps/api/src/push/dto/push.dto.ts`: `49b93736b62f18340d7294c30ef8d1cb1be7f596e1660dff7d63edd519948f00`
  - `apps/api/src/push/push.controller.ts`: `1f6105f9959b38aa2609cf311d68351b1b87068c0951efa1d160d4a1aa513332`
  - `apps/api/src/push/push.service.ts`: `bd1d896396b940e28203cb75bd14e9f3b28dfaaa2f2ed80003fc3d161e303f3e`
  - `apps/web/public/sw.js`: `e70cfa5060babbc31a6d32ce1a981574d8aebd0e589e349c212ae9d0776f7027`
  - `apps/web/src/lib/push.ts`: `05e96719fac018fc94adb5c6dbe2cdb642ecf688d149b813c5410e7d550b99f4`
  - `apps/web/src/__tests__/pwa-runtime-security.test.ts`: `7be1610aea843fcb43661332bf6c9807a14fec6741eedab14ca320423d8d5ed6`
- Staged files: 0

The Director approved one installable DIIS experience for desktop and mobile browsers,
including Android and iPhone support, with `/dashboard` as the installed start surface.
The public DIIS homepage remains a website. A first-launch introduction belongs only to the
installed experience and is not shown in ordinary browser tabs.

Device behavior is automatic rather than a user-facing choice:

- installed DIIS is treated as a personal-device experience and may offer notifications;
- an ordinary browser tab is treated as shared-device-safe mode, including school lab PCs;
- teachers using a personal PC or phone install DIIS when they need the personal experience;
- logout clears DIIS-owned private state in every mode.

This checkpoint makes no commit, push, PR, staging, main, production, credential, or runtime
mutation.

## 2. Implementation

### 2.1 Install identity and platform foundation

- Replaced duplicate static manifest data with one typed Next.js manifest.
- Bound `id`, `scope`, and `start_url` to the DIIS origin and `/dashboard`.
- Separated the product and institution identity as `DIIS` and `SMK Darussalam Subah` in
  manifest metadata, browser title, and Apple web-app metadata.
- Kept the public homepage independent from installed-app onboarding.
- Registered `/sw.js` globally after page load with scope `/` and `updateViaCache: none`.
- Added deliberate freshness and content-type headers for the service worker, manifest, and
  offline shell.

### 2.2 First-launch welcome and motion

- Added an accessible Radix full-screen welcome shown only when DIIS runs in standalone mode
  and the versioned onboarding marker is absent.
- Added a short 1.8-second branded CSS splash followed by three concise slides: what DIIS is,
  role-aware work, and device privacy.
- Added `Lewati`, `Kembali`, `Berikutnya`, and `Mulai DIIS` controls with 44-pixel targets,
  focus containment, Escape handling, focus restoration, and safe-area-aware spacing.
- `prefers-reduced-motion` bypasses the animated phase and disables decorative motion.
- The animation uses a local DIIS icon and CSS only, so startup does not depend on a network
  video or third-party runtime.

No Higgsfield media generation is claimed in this source gate because no callable Higgsfield
generation surface was available in the execution session. The implementation therefore uses
a deterministic local animation. A future reviewed local Higgsfield master asset may replace
the visual layer, but must preserve reduced-motion, load-time, privacy, and offline guarantees.

### 2.3 Offline and cache privacy

- Added a static Indonesian offline shell containing no account or school data.
- Navigation responses are network-only and never written to Cache Storage.
- API, login, auth, callback, logout, RSC, and prefetch requests are excluded.
- Runtime caching is restricted to same-origin mandatory PWA assets and fingerprinted Next.js
  static assets with matching content types.
- Activation removes only obsolete cache names beginning with `diis-pwa-`.

### 2.4 Explicit and understandable updates

- A new worker waits instead of activating automatically.
- The exact waiting worker supplies a bounded release summary over `MessageChannel`.
- The update notice identifies version/date, new features, fixes, and whether login is needed.
- `Nanti` dismisses the notice; only `Perbarui sekarang` activates the worker and reloads after
  controller change.

### 2.5 Personal notifications and fail-closed routes

- Push controls are available only in the installed experience.
- Ordinary browser mode never reads, removes, or rewrites the origin-scoped push subscription,
  so opening DIIS in a tab cannot disable notifications for an installed DIIS client in the
  same browser profile.
- Installed mode reconciles an existing browser subscription through the authenticated API
  before showing notifications as active. A successful binding is distinguished from a
  superseded request and a generic failure. The active service worker serializes claim, commit,
  logout suppression, and push display across same-origin windows. A claim atomically persists a
  PII-free attempt ID with `signed-out`; the final server result may commit `signed-in` or
  `signed-out` only while that attempt ID still owns the record. A stale attempt receives a
  distinct acknowledgement and performs no mutation, even if its earlier write was delayed or
  `localStorage` is unavailable. An ambiguous acknowledgement is followed by an atomic abort
  scoped to that attempt ID; a stale abort cannot suppress or unsubscribe a newer owner.
  An unacknowledged abort remains `reconcile-failed`, not a claim of successful suppression.
- Push title, body, and tag are normalized and length-bounded.
- Every push payload carries a server-generated HMAC delivery proof bound to the intended user
  and exact browser endpoint. Immediately before displaying private content, the active worker
  submits that proof and its current endpoint through the authenticated same-origin API. The API
  returns `deliver: true` only when the current session still owns the endpoint and the proof is
  valid. Missing proof, logout, account switch, ownership collision, network failure, malformed
  response, or unavailable VAPID configuration suppresses the notification.
- Notification targets fail closed to `/dashboard` unless they match the exact Akademik or
  Rapor allowlist. External, protocol-relative, traversal, encoded traversal, duplicate query,
  API, auth, and unrelated dashboard routes are rejected.
- The report-card notification tag no longer exposes an internal log identifier.

### 2.6 Subscription ownership and logout privacy

- `PushSubscription.endpoint` is globally unique, with an additive migration that retains the
  newest owner for an existing duplicate endpoint.
- API subscription uses one atomic PostgreSQL conditional upsert. The binding order comes from
  the verified JWT `iat`, not a client-provided timestamp, and is stored with the subscription
  key material without a Prisma schema change. Every binding is monotonic: an older request is
  rejected even from the same owner, the same owner may refresh at the same issue time, and a
  different owner may take over only with a strictly newer issue time. Legacy rows are migrated
  on first valid reconciliation.
- A delayed request from an older authenticated account cannot reclaim an endpoint after a
  newer account has bound it. The downgrade sequence `B@200 -> B@100 -> A@150` retains B at
  generation 200; equal issue times fail closed to the current owner.
- A delayed cleanup from the previous account cannot delete an endpoint already rebound to a
  new account because deletion requires both the old owner and exact endpoint.
- Manual notification disable is shown as successful only when either the server binding is
  removed or the browser subscription is actually revoked. If both fail, the control remains
  active and presents a retryable error.
- All visible logout surfaces use one bounded coordinator.
- Logout attempts backend and browser unsubscribe, removes DIIS PWA caches, removes DIIS-owned
  user local/session state, and deletes discoverable DIIS-owned IndexedDB databases.
- IndexedDB cleanup requests other DIIS contexts to close databases, retries once within a
  bounded window, verifies final absence, and reports blocked, error, or timeout as incomplete
  instead of treating those outcomes as success.
- Logout checks actual HTTP status, Cache Storage deletion booleans, and browser unsubscribe
  booleans. Cleanup is never marked complete merely because the promises settled.
- Before cleanup, logout persists a PII-free `signed-out` delivery guard shared with the service
  worker. The worker suppresses push by default and displays notifications only after a verified
  account reconciliation persists `signed-in`. Direct force commands can only set `signed-out`;
  they invalidate any in-flight reconciliation. Legacy plain-text `signed-in` cache records are
  treated as `signed-out` by the new protocol. The guard cache is retained while other DIIS
  caches are cleared, and every push event reads the latest persistent guard in the same ordered
  worker queue instead of trusting an earlier in-memory state.
- Cache persistence alone is not proof that the active worker understands the guard. The client
  requires a bounded, versioned `MessageChannel` acknowledgement from the active worker. A waiting
  worker is never accepted as proof. A legacy or non-responsive worker triggers browser
  unsubscribe plus service-worker unregister for `signed-out`; `signed-in` fails closed.
- If registration lookup fails, durable cache state is not trusted. Navigation is blocked with a
  retryable message unless either acknowledged local suppression or actual server/browser
  subscription suppression is proven.
- Theme, language, and generic onboarding completion remain; unrelated products are untouched.
- Federated logout proceeds after bounded cleanup only when local delivery suppression or actual
  server/browser subscription suppression is proven. Concurrent logout attempts coalesce to one
  cleanup plus at most one navigation.

### 2.7 Consolidated independent-review closure

The independent review passes found material issues in ownership, cleanup, ordering, and delivery
identity. The consolidated remediation touches only the following sixteen paths needed to close them:

- `apps/api/src/push/push.service.ts`
- `apps/api/src/push/push.controller.ts`
- `apps/api/src/push/dto/push.dto.ts`
- `apps/api/src/__tests__/p16-ai-push.spec.ts`
- `apps/api/src/__tests__/pwa-push-ownership-migration.spec.ts`
- `apps/web/src/app/dashboard/akademik/actions.ts`
- `apps/web/public/sw.js`
- `apps/web/src/components/shared/LogoutButton.tsx`
- `apps/web/src/lib/push.ts`
- `apps/web/src/components/shared/PushNotificationToggle.tsx`
- `apps/web/src/lib/pwa-preferences.ts`
- `apps/web/src/lib/pwa-logout.ts`
- `apps/web/src/__tests__/pwa-runtime-security.test.ts`
- `apps/web/src/__tests__/academic-operational-ui.test.ts`
- `packages/auth/src/index.ts`
- `packages/auth/src/__tests__/auth.test.ts`

P1-IR01 is closed because an ordinary tab does not inspect or mutate the shared subscription.
P1-IR02 and P1-IR04 are closed by typed reconciliation plus a monotonic server-side binding
guard based on verified JWT issue time. P2-IR03 is closed by explicit IndexedDB failure states.
P1-IR05 is closed by checking real HTTP, cache, and unsubscribe outcomes for both logout and
manual disable. The final CAS downgrade finding is closed by applying the generation comparison
to same-owner writes as well as transfers. The final logout finding is closed by a persistent
signed-out guard enforced inside the service worker and by blocking navigation only when no
suppression path can be proven. P1-CR01 is closed by the shared reconciliation generation: a stale
response performs no local mutation, while an active equal-`iat` collision suppresses push and a
behavioral push event proves no additional notification. P1-CR02 is closed by the versioned active
worker acknowledgement and legacy-worker unregister fallback. No unrelated UI, platform policy,
migration, or deployment behavior was tightened. P1-FC01 is closed by the active worker's ordered
claim/apply protocol. A delayed old write cannot finish after a newer claim, stale acknowledgements
do not trigger an old-account fallback, and two windows coordinate without `localStorage`.
P2-AC01 is closed by an ordered worker abort that checks the attempt ID before writing
`signed-out`. Lost claim/apply acknowledgements from an old attempt cannot force the newer
account to `signed-out` or revoke its shared browser subscription. A current attempt whose
acknowledgement is lost remains suppressed when the abort is acknowledged.
The final double-failure finding is closed independently of claim/abort success: even if the
worker still contains account A's local `signed-in` record, a push for A cannot be displayed
while account B is the authenticated browser session. The API checks endpoint ownership and the
HMAC proof at delivery time and fails closed on any session, owner, proof, network, or response
mismatch. The verifier uses the same role and permission surface as push registration, avoiding a
notification regression for Guru, Kepala Sekolah, and Super Admin.

## 3. Verification evidence

### 3.1 Automated checks

| Check | Result |
| --- | --- |
| Full Web on final bytes | 55 suites / 454 tests passed |
| Focused Web PWA runtime | 1 suite / 59 tests passed |
| Focused Web academic service-worker harness | 1 suite / 19 tests passed |
| Focused API push contract | 1 suite / 20 tests passed |
| Delayed old write versus newer collision | Final persistent state `signed-out`; no notification shown after the newer claim |
| Two windows with denied shared storage | Final persistent state `signed-out`; delayed old `bound` returns `reconcile-failed` |
| Lost claim/apply ACK after newer binding | Newer worker state remains `signed-in`; shared subscription remains active; push displays |
| Lost ACK for current attempt | Atomic abort retains `signed-out`; push suppressed |
| Full API on final bytes | 74 active suites / 1,392 tests passed; 2 suites / 11 guarded tests skipped |
| Shared auth | 1 suite / 52 tests passed |
| Web and API type-check | Passed |
| Web and API lint | Passed; only existing Next.js migration notices |
| Web and API production build on final bytes | Passed; Web generated 50/50 static pages |
| Disposable PostgreSQL ownership CAS | 47 migrations; 1 suite / 4 tests passed |
| Impeccable scoped mechanical check | Earlier unchanged-UI follow-up passed with 0 findings |
| Service-worker syntax | Passed on final bytes |
| Prisma validation | Passed on the final manifest with a disposable validation URL |
| Whitespace/diff check | Passed in the final completion sweep |
| Prettier whole-file check | Warned on the three touched PWA files; no broad format-only rewrite was made in this narrow correction |

The full API and Web suites were rerun after the final delivery-verification behavior changed.
The two affected PWA/service-worker suites passed 78/78 on the final bytes, including delayed
write, storage-denied two-window ordering, stale acknowledgement, logout invalidation, legacy
cache, equal-generation collision, lost claim/apply ACK races, double claim/abort failure, and
server-denied delivery for the old account. The focused API suite passed 20/20, including proof
generation, owner/session mismatch, malformed proof, and role-surface parity. Final Web/API
type-check, lint, production build, service-worker syntax, and Prisma validation also passed.
The exact focused commands were `npm test --workspace=apps/web -- --runInBand
--testMatch=**/pwa-runtime-security.test.ts` and the same command with
`academic-operational-ui.test.ts`, followed by `npm run type-check --workspace=apps/web`,
`npm run lint --workspace=apps/web`, and `node --check apps/web/public/sw.js`. Native Windows
Jest needs the CLI `testMatch` override because the existing absolute pattern has mixed
separators in this worktree; the earlier full-Web run used the same override without changing
the out-of-scope configuration.

### 3.2 Disposable PostgreSQL proof

- Applied all 47 migrations to disposable PostgreSQL 16 plus pgvector.
- Migration 47 reduced one synthetic duplicate endpoint group from two owners to one newest
  owner and created one global unique endpoint index.
- Migration replay reported 47 migrations and no pending migration.
- Twenty concurrent endpoint upserts retained one row and one owner.
- Wrong-owner unsubscribe removed zero rows; exact-owner unsubscribe removed one.
- The final runtime CAS accepted user B at verified issue time 200, rejected a same-owner B
  downgrade at 100, rejected user A at 150, and retained B at 200 with the newer metadata.
- Pre-migration snapshot restore reproduced the old two-row/composite-constraint state.
- Disposable database, container, network, and volume resources were removed.

The first local PostgreSQL image lacked the required pgvector extension and was discarded
without application mutation. The exact proof then ran successfully on the disposable
pgvector PostgreSQL image. This was a test-environment correction, not a product workaround.

Historical broad Prisma migration drift predates this patch and remains outside this scope.
Only the changed PushSubscription table and migration invariants are claimed.

### 3.3 Fresh browser demonstration

A fresh local runtime was demonstrated in the visible browser before the final push-coordinator
correction. The local login endpoint was rechecked at HTTP 200 after that correction. The public
homepage rendered, and direct navigation to `/dashboard` correctly reached
`/login?callbackUrl=%2Fdashboard`. The login surface showed the separate `DIIS` and
`SMK Darussalam Subah` identity without visible overflow or overlap. The real update panel also
displayed the bounded DIIS PWA 1.0 feature and fix summary, then dismissed cleanly to the login
surface.

Runtime inspection established a secure local context, an active `/sw.js` registration scoped
to `/`, `manifest.webmanifest`, and the expected `diis-pwa-v4-static` cache. The browser was an
ordinary tab (`display-mode: standalone` was false), so no installed-mode screenshot or
authenticated push demonstration is claimed. Actual Android, iPhone/iPad, Windows, and macOS
installation and notification behavior remains the later staging/device matrix.

## 4. Cleanup and non-claims

- No application data, real push subscription, browser permission, remote profile, or deployed
  system was changed.
- No OS install prompt, remote push delivery, App Store, or Play Store publication is claimed.
- Play Store packaging remains a later distribution phase built on the same web application.
- The PostgreSQL container, database, and disposable Docker resources were removed. The local
  demo server remains intentionally active at `http://localhost:3100` so the Director can inspect
  the final browser surface; it is local-only and does not mutate a deployed system.
- Git packaging, staging install matrix, main, production, and public release remain HOLD.

## 5. Literal source manifest

```text
M apps/api/src/__tests__/p16-ai-push.spec.ts
A apps/api/src/__tests__/pwa-push-ownership-migration.spec.ts
M apps/api/src/push/dto/push.dto.ts
M apps/api/src/push/push.controller.ts
M apps/api/src/push/push.service.ts
M apps/web/next.config.js
D apps/web/public/manifest.json
A apps/web/public/offline.html
M apps/web/public/sw.js
M apps/web/src/__tests__/academic-operational-ui.test.ts
M apps/web/src/__tests__/middleware.test.ts
A apps/web/src/__tests__/pwa-runtime-security.test.ts
M apps/web/src/app/dashboard/akademik/_components/ortu/OrtuWorkspace.tsx
M apps/web/src/app/dashboard/akademik/_components/siswa/SiswaWorkspace.tsx
M apps/web/src/app/dashboard/akademik/actions.ts
M apps/web/src/app/globals.css
M apps/web/src/app/layout.tsx
A apps/web/src/app/manifest.ts
M apps/web/src/components/layout/Sidebar.tsx
M apps/web/src/components/layout/TopBar.tsx
A apps/web/src/components/pwa/PwaRuntime.tsx
A apps/web/src/components/pwa/PwaWelcome.tsx
A apps/web/src/components/shared/LogoutButton.tsx
M apps/web/src/components/shared/PushNotificationToggle.tsx
M apps/web/src/lib/push.ts
A apps/web/src/lib/pwa-logout.ts
A apps/web/src/lib/pwa-preferences.ts
A apps/web/src/lib/pwa-runtime.ts
M apps/web/src/middleware.ts
M packages/auth/src/__tests__/auth.test.ts
M packages/auth/src/index.ts
A packages/database/prisma/migrations/20260921000001_push_subscription_global_endpoint_ownership/migration.sql
M packages/database/prisma/schema.prisma
```

The report is outside the 33-source aggregate. A later package containing this report would
contain 34 paths before an independent reviewer report is considered.

## 6. Independent review request

Re-review the seven closure paths (`apps/api/src/__tests__/p16-ai-push.spec.ts`,
`apps/api/src/push/dto/push.dto.ts`, `apps/api/src/push/push.controller.ts`,
`apps/api/src/push/push.service.ts`, `apps/web/public/sw.js`,
`apps/web/src/__tests__/academic-operational-ui.test.ts`, and
`apps/web/src/__tests__/pwa-runtime-security.test.ts`) within the 33-path source manifest and
this updated report. Prioritize:

1. browser tabs cannot mutate the shared origin subscription;
2. installed startup reconciles ownership before showing notifications as active;
3. a stale authenticated account cannot reclaim a newer endpoint binding;
4. same-owner requests cannot downgrade the generation before another account takeover;
5. a delayed old `signed-in` write cannot finish after a newer `signed-out` claim, even with two
   windows and denied `localStorage`;
6. a stale acknowledgement is recognized without suppressing the newer account, while an active
   equal-`iat` collision suppresses the old owner's delivery;
7. only the active worker's versioned acknowledgement proves local guard support;
8. a legacy active worker is unsubscribed/unregistered before signed-out suppression succeeds;
9. manual disable and logout inspect actual HTTP, cache, and unsubscribe results;
10. signed-out state suppresses service-worker push before navigation and survives cleanup;
11. logout navigation is blocked only when no suppression path is proven;
12. delayed old-owner unsubscribe cannot delete a rebound endpoint;
13. IndexedDB blocked, error, timeout, and false-success outcomes remain incomplete;
14. an old lost claim/apply acknowledgement cannot suppress or unsubscribe a newer account;
15. the current attempt is signed out by an acknowledged atomic abort;
16. aggregate hash, focused evidence, PostgreSQL proof, and non-claims are accurate.
17. a stale account push is rejected against the current authenticated session even when claim
    and abort acknowledgements both fail, without exposing proof or endpoint data in logs.

Do not begin Git packaging or staging until an independent verdict has no open P0/P1/P2.

## Rekomendasi model untuk tindak lanjut

Task berikutnya: Independent Reviewer melakukan re-review sempit pada tujuh closure path,
server-side delivery proof, double-failure negative control, dan evidence manifest 33 path.

Model / effort: GPT-5.6 Sol (`gpt-5.6-sol`) / high.

Alasan: review harus menguji interaksi race worker dengan otorisasi delivery server yang
melindungi konten privat lintas akun; scope sudah sempit dengan negative control behavioral.

Syarat kualitas: cocokkan manifest/hash, ulang double-failure negative control dan focused
contracts; pastikan sesi yang bukan owner selalu memperoleh `deliver: false`.

Eskalasi bila: bukti PostgreSQL dan kontrak aplikasi bertentangan atau muncul jalur kepemilikan
baru di luar endpoint CAS -> GPT-6 Astra / high.

Sesi laporan ini: model/effort aktual tidak terverifikasi.
