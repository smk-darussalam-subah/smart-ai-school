# Wave 9 Shared Auth Public Asset Cache Independent Source Review

Date: 2026-08-28
Role: Independent Security and Runtime Reviewer
Branch: `fix/wave9-shared-auth-cache-bust-20260827`
Base: `origin/main@da37dbf2f32766efef068d937696b352259483a2`
Verdict: **APPROVED FOR EXPLICIT GIT PACKAGING**

This verdict approves source packaging only. It does not approve merge, deployment, shared
Keycloak mutation, a second workflow dispatch, production cutover, or Wave 9 final sign-off.

## Findings

No unresolved P0, P1, or P2 finding was found in the reviewed source or disposable runtime.

The remaining limitation is operational rather than a source defect: the next shared-auth cutover
must use a new approval bound to the eventual exact `main` SHA, its first-parent production SHA,
and manifest SHA-256
`038f82f39d8419e5e398b6f63bbe6edf2c7b756cfbd06f792163b6a9c3b514f5`.

## Independent Root-Cause Verification

The public production OIDC login page was inspected read-only without an account or credential.
It returned HTTP 200 and still referenced the stable legacy URLs:

- `css/login.css` returned SHA-256
  `cb1276280f6603df091ed62acee3925b8d2abe7cf3fa14323ab41cb78a28ab3f`,
  `Cache-Control: max-age=2592000`, `cf-cache-status: HIT`, and an age above 114,000 seconds;
- `js/login.js` returned the approved SHA-256
  `4d1ab55a352a4ee23d0376d0b80bf23c2a27e6a5430d296425607723ad22eaf2`.

This independently confirms a stale public CSS response rather than a JavaScript state-machine,
container-mount, or source-content defect.

The renamed CSS and JavaScript are byte-identical to the reviewed legacy assets. Therefore the
change alters public URLs and verification contracts, not the visual design or behavior.

## Adversarial Source Review

The review confirmed:

- `theme.properties` accepts only one `styles` and one `scripts` value;
- filenames require a lowercase 12-character SHA-256 prefix;
- each filename prefix must equal the corresponding full content hash;
- the source tree is exact and rejects missing, extra, wrong-type, or symlink entries;
- the five-line manifest is ordered, path-contained, and full-hash verified;
- the remote cutover reads the approved paths from `theme.properties`;
- the OIDC login HTML must contain exactly one reference to each approved custom asset;
- each public asset is downloaded from the configured public auth origin and full-hash checked;
- HTTP failure, missing/duplicate reference, manifest mismatch, or stale public bytes fail closed;
- a post-mutation mismatch enters containment, restores the previous non-DIIS theme or built-in
  Keycloak fallback, rechecks public auth, removes temporary admin configuration, and exits nonzero;
- no realm role, client, authentication flow, secret, schema, dependency, database, or visual
  styling change is included.

## Independent Automated Verification

- exact bundle verifier: PASS, 5 files;
- manifest SHA-256: PASS,
  `038f82f39d8419e5e398b6f63bbe6edf2c7b756cfbd06f792163b6a9c3b514f5`;
- cutover contract harness: PASS, 17/17;
- containment behavioral harness: PASS, 5/5, including stale public CSS;
- Keycloak theme Jest: PASS, 7/7;
- full web Jest: PASS, 45 suites / 329 tests;
- web type-check: PASS;
- web lint: PASS, with only the existing Next.js deprecation/plugin notices;
- production build: PASS, 49/49 pages;
- shell syntax: PASS for all four affected shell scripts;
- `git diff --check` and cached check: PASS;
- targeted secret scan: PASS;
- staged changes: 0.

`shellcheck` was unavailable on the reviewer host. This is not treated as a blocker because the
scripts passed syntax checks, behavioral negative tests, containment tests, and Keycloak runtime
proof.

## Disposable Keycloak 24 Proof

A fresh local disposable runtime used `quay.io/keycloak/keycloak:24.0`, a synthetic realm and
client, a read-only bind of the candidate theme, and loopback port `58092`. No staging or
production credential, realm, database, or service was used.

Runtime results:

- OIDC discovery: HTTP 200;
- OIDC login form: HTTP 200;
- runtime tree: exactly four expected directories and five regular files;
- all five runtime hashes: identical to the candidate manifest;
- public CSS reference: `css/login.2ea123a30575.css`, HTTP 200, full hash correct;
- public JavaScript reference: `js/login.4d1ab55a352a.js`, HTTP 200, full hash correct;
- bounded Keycloak error count: 0.

Browser results:

- desktop `1440x900`: menu initially hidden, opening did not overlap the login form, no horizontal
  overflow;
- mobile `390x844`: menu initially hidden, opening did not overlap the form, no horizontal
  overflow, no visible primary control below 44px;
- click, Escape, forward Tab, and Shift+Tab kept `aria-expanded`, `aria-hidden`, focus movement,
  and visual state synchronized;
- Indonesian locale rendered `Masuk dengan Akun Sekolah` and `Username atau Email`;
- browser console warning/error count: 0.

Cleanup proof:

- disposable container: 0;
- disposable network: 0;
- listener on port `58092`: 0;
- temporary browser tab closed and viewport override reset;
- Docker processes started for review stopped;
- local Docker AI setting restored to its initial value `true`;
- temporary stale socket directories created during reviewer recovery removed.

## Packaging Boundary

The Executor product/remediation manifest remains the reviewed 13 paths. This reviewer report is a
new documentation-only path. If it is included in the same commit, the explicit Git manifest must
contain exactly 14 paths and cached stat, name-status, diff check, and secret scan must be repeated.
Do not use broad `git add .` or `git add -A`.

After packaging, the safe sequence remains normal Gitflow to `develop`, `staging`, and `main`,
followed by a new independent production approval. A new approval may authorize exactly one
`Apply DIIS Keycloak Theme` dispatch for the exact promoted SHA. Any failure again returns to
investigation and review; it does not authorize a rerun.

## Confidence

- source/security: 0.99;
- cache-busting contract: 0.99;
- disposable Keycloak runtime: 0.99;
- browser UI/keyboard: 0.98;
- readiness for explicit Git packaging: 0.99;
- readiness for shared production cutover now: 0.00, because packaging, Gitflow, exact-SHA
  promotion, and new production approval have not occurred.
