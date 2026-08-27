# Wave 9 Shared Auth Public Asset Cache Follow-up

Date: 2026-08-27
Role: Executor
Branch: `fix/wave9-shared-auth-cache-bust-20260827`
Base: `origin/main@da37dbf2f32766efef068d937696b352259483a2`
Status: **READY FOR INDEPENDENT SOURCE REVIEW; GIT AND SECOND CUTOVER HOLD**

## Executive Summary

The single approved `Apply DIIS Keycloak Theme` dispatch completed successfully, but the required
post-cutover browser gate found that the locale menu remained visually open over the login form.
No second dispatch, manual theme copy, realm mutation, SSH patch, cache purge, or service restart was
performed.

The failure is a public asset-delivery mismatch, not a missing file in the Keycloak container:

- reviewed source, the mounted container, direct Keycloak origin, and VPS nginx origin returned the
  approved CSS SHA-256 `2ea123a3057543fc59011457d581688ceb529f5f9b70e21ea46dde5efc1599bd`;
- the public auth origin returned an older CSS SHA-256
  `cb1276280f6603df091ed62acee3925b8d2abe7cf3fa14323ab41cb78a28ab3f`;
- the public response carried `Cache-Control: max-age=2592000`, `cf-cache-status: HIT`, and an age of
  110,726 seconds during the proof;
- the public JavaScript already matched the approved SHA-256
  `4d1ab55a352a4ee23d0376d0b80bf23c2a27e6a5430d296425607723ad22eaf2`.

The follow-up uses content-addressed CSS and JavaScript filenames and makes the controlled cutover
verify the hashes returned by the public auth origin. A stale public asset is now a failed cutover
that triggers automatic containment.

## Production Containment

- Successful dispatch: GitHub Actions run `33088461661`.
- Main and production application SHA remain
  `da37dbf2f32766efef068d937696b352259483a2`.
- Previous production SHA remains
  `63809edea0e75eb16e181372a684b2cc48ab916a`.
- Shared Keycloak is healthy and still uses the reviewed mounted five-file bundle.
- Exactly one cutover dispatch has occurred. No rerun or second dispatch was attempted.
- This follow-up is local source work only. It does not authorize Git packaging, deployment, realm
  changes, or another production cutover.

## Browser and Runtime Reproduction

Fresh anonymous OIDC login was tested in an isolated in-app browser session.

Desktop `1440x900`:

- trigger: `aria-expanded=false`;
- menu: `aria-hidden=true`;
- computed menu state: `display=block`, `visibility=visible`, `opacity=1`,
  `pointer-events=auto`;
- menu rectangle: `318.67 x 88.33`;
- locale menu overlapped the login heading: `true`;
- page horizontal and vertical overflow: `false`.

Mobile `390x844` reproduced the same semantic/visual contradiction and overlap. Keyboard behavior
from the reviewed JavaScript remained correct: opening moved focus to the first locale item, Escape
closed semantically and restored focus, and the Indonesian locale rendered the expected heading and
field labels. The browser gate therefore failed specifically on delivered CSS, not on the locale
state machine.

No screenshot was retained because the user Chrome profile could expose password-manager content.
The isolated session used no credentials, cookies, local storage, or real PII.

Public boundary controls after the first cutover remained correct: OIDC discovery returned `200`,
the registered `diis-web` authorization request returned `200`, and an invalid client/callback request
returned `400`.

## Source Remediation

1. Theme assets are now content-addressed:
   - `css/login.2ea123a30575.css`;
   - `js/login.4d1ab55a352a.js`.
2. `theme.properties` points only to those fingerprinted paths.
3. The five-file manifest records the fingerprinted paths and exact full hashes.
4. The exact-tree verifier derives the two asset paths from `theme.properties`, requires a
   12-character lowercase SHA-256 prefix, and proves that each filename prefix matches its content.
5. The controlled remote script reads the public login page, requires exactly one reference for
   each approved asset, downloads each public asset, and compares it with the approved manifest.
6. Public asset mismatch is fail-closed and enters the existing automatic containment path.
7. The containment harness now reproduces a stale public CSS response and proves nonzero failure,
   previous-theme restoration, public-auth recheck, and cleanup.
8. The decision log records content-addressed assets as the durable shared-auth cache contract.

No visual colors, spacing, typography, daily application style, realm role, client, flow, secret,
container definition, dependency, database, or application feature was changed.

## Explicit Review Manifest

The review manifest contains 13 literal path entries, including both sides of each rename:

1. `apps/web/src/__tests__/keycloak-theme.test.ts`
2. `docs/audits/WAVE9-SHARED-AUTH-PUBLIC-ASSET-CACHE-FOLLOWUP-2026-08-27.md`
3. `docs/decision-log.md`
4. `infrastructure/keycloak/diis-login-theme.sha256`
5. `infrastructure/keycloak/scripts/apply-theme-cutover-remote.sh`
6. `infrastructure/keycloak/scripts/test-theme-containment.sh`
7. `infrastructure/keycloak/scripts/test-theme-cutover.sh`
8. `infrastructure/keycloak/scripts/verify-theme-bundle.sh`
9. `infrastructure/keycloak/themes/diis/login/resources/css/login.css` (removed path)
10. `infrastructure/keycloak/themes/diis/login/resources/css/login.2ea123a30575.css`
11. `infrastructure/keycloak/themes/diis/login/resources/js/login.js` (removed path)
12. `infrastructure/keycloak/themes/diis/login/resources/js/login.4d1ab55a352a.js`
13. `infrastructure/keycloak/themes/diis/login/theme.properties`

## Verification

| Gate | Result |
|---|---|
| Exact bundle verifier | PASS, five files; manifest SHA-256 `038f82f39d8419e5e398b6f63bbe6edf2c7b756cfbd06f792163b6a9c3b514f5` |
| Shell syntax | PASS for all four changed shell scripts |
| Cutover contract harness | PASS, 17/17 |
| Containment behavioral harness | PASS, 5/5, including stale public CSS |
| Keycloak theme Jest | PASS, 7/7 |
| Full Web Jest | PASS, 45 suites / 329 tests |
| Web type-check | PASS |
| Web lint | PASS; existing Next.js deprecation/plugin notices only |
| Web production build | PASS, 49/49 static pages |
| Diff check | PASS |
| Staged changes | 0 |

Full Web initially used a dependency junction from an older checkout and failed on unrelated type
artifacts. The junctions were removed from the worktree, `npm ci` installed the exact lockfile, the
required workspace packages were built, and the clean full run then passed as recorded above.

## Runtime Boundary and Remaining Gates

Local disposable Keycloak 24 was **not rerun** in this follow-up because Docker Desktop could not be
started without Windows service privileges. No VPS disposable or shared infrastructure was used as a
substitute. The hermetic bundle, cutover, and containment harnesses passed, but a reviewer with Docker
must rerun the exact-SHA disposable Keycloak/browser proof before packaging approval.

Required next sequence:

1. Independent source review of this diff and report.
2. Disposable Keycloak 24 exact-SHA proof with fresh desktop/mobile browser context.
3. Explicit Git packaging only after reviewer approval.
4. Normal `develop -> staging -> main` Gitflow and exact-SHA verification.
5. New production approval naming the new main SHA, previous production SHA, and new manifest hash.
6. Exactly one newly approved cutover dispatch.
7. Public asset hashes, OIDC/login, Indonesian/English locale, desktop/mobile, health, redacted logs,
   staging browser QA, and independent final sign-off.

The old production approval and successful run must not be reused. Any new failure again prohibits a
second dispatch until investigation, re-review, and fresh production approval.

## Executor Readiness Assessment

The root cause and source closure are high-confidence. Source readiness is estimated at 96%; runtime
readiness remains 75% until disposable and deployed public-origin evidence are independently repeated.
Wave 9 final shared-auth sign-off and Checkpoint B remain blocked.
