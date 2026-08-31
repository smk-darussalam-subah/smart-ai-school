# Wave 9 Shared Auth Controlled Cutover - Independent Final Review

Date: 2026-08-28

Role: Independent Security, Runtime, UI/UX, and Accessibility Reviewer

Production SHA: `76d64c6582fdf959d5868d89f36a3e36ea02beea`

Staging SHA: `c4d2e84f1bf71c49431450c207cae80e4f4c18a1`

Workflow run: `33102619583`, attempt `1`

Manifest SHA-256: `038f82f39d8419e5e398b6f63bbe6edf2c7b756cfbd06f792163b6a9c3b514f5`

## Verdict

**APPROVED FOR DOCS-ONLY GIT PACKAGING. CHECKPOINT B MAY START AFTER THE
EXECUTOR AND REVIEWER REPORTS ARE TRACKED ON THE REVIEWED BRANCH.**

No unresolved in-scope P0, P1, or P2 finding was found. This verdict confirms
the controlled shared-Keycloak theme cutover and its targeted runtime evidence.
It is not permission to run another cutover, mutate Keycloak, relax protection,
or publish final Checkpoint B artifacts before their own review.

## Findings

No in-scope P0, P1, or P2 finding.

### Known external go-live prerequisite

Production appointment due-activation automation remains deliberately outside
this cutover. Independent read-only inspection found:

- the API container's `APPOINTMENT_AUTOMATION_TOKEN` is empty;
- `diis-appointment-due-activation.timer` is not installed or active;
- no production appointment systemd service/timer unit is present.

This does not invalidate the Keycloak cutover because only `smk-keycloak` was
recreated and the appointment token is not consumed by that service. It remains
a separate, previously held operational gate. Checkpoint B documentation must
not claim that daily due-appointment activation is live. It must be installed,
configured, and validated before DIIS operational go-live if that automation is
part of the launch contract.

## Independent GitHub and Governance Verification

- Workflow `Apply DIIS Keycloak Theme` completed successfully.
- Event: `workflow_dispatch`; branch: `main`; exact head SHA:
  `76d64c6582fdf959d5868d89f36a3e36ea02beea`.
- Exactly one matching workflow run exists for that SHA and workflow.
- Run attempt is exactly `1`; no rerun or second dispatch was found.
- The source validation job and production cutover job both succeeded.
- The first parent of the production merge is the approved previous production
  SHA `da37dbf2f32766efef068d937696b352259483a2`.
- Production and staging trees are identical:
  `70aa8cea7a53144ad10e6ff9e247cfa1a146306e`.
- No open pull request existed at review time.
- Classic protection for `develop`, `staging`, and `main` requires one approval,
  enforces administrators, and retains required CI checks.
- `Protect Staging` and `Protect main` rulesets are active and require one
  approval.
- The `production` environment requires the named reviewer, has
  `can_admins_bypass=false`, and permits deployment from `main` only.
- The documented single-operator exception remains honest: the environment has
  a real manual gate, but it does not provide two-person separation of duties.

## Independent Workflow Evidence

The redacted workflow log independently proved:

- all five source files matched their approved full hashes;
- exact bundle verification passed with five files;
- manifest hash matched `038f82f39d8419e5e398b6f63bbe6edf2c7b756cfbd06f792163b6a9c3b514f5`;
- preflight bound the cutover to the expected `main` and previous-production
  SHAs;
- the mounted theme was read-only;
- Keycloak was the only recreated service;
- Keycloak reached `healthy` within the bounded retry window;
- runtime bundle verification passed for all five files;
- public OIDC and login-page checks passed;
- public CSS and JavaScript byte hashes matched the approved values;
- bounded post-cutover Keycloak error count was `0`;
- containment was not invoked because every post-mutation check passed.

The Compose warning for an unset `APPOINTMENT_AUTOMATION_TOKEN` did not affect
the Keycloak service or this cutover. Its separate operational meaning is
recorded under the known external prerequisite above.

## Independent Production Runtime Verification

Read-only VPS inspection found:

- production checkout SHA exactly
  `76d64c6582fdf959d5868d89f36a3e36ea02beea`;
- production checkout clean;
- `smk-keycloak`: running and healthy;
- `smk-api`: running and healthy;
- `smk-web`: running;
- `smk-postgres`: running and healthy;
- recent API error count: `0`.

The live Keycloak theme contains exactly five regular files and no symlinks:

1. `messages/messages_en.properties`;
2. `messages/messages_id.properties`;
3. `resources/css/login.2ea123a30575.css`;
4. `resources/js/login.4d1ab55a352a.js`;
5. `theme.properties`.

All five runtime hashes match the approved manifest. The apparent recent
`LOGIN_ERROR` entries were warning-level `client_not_found` events produced by
the expected invalid-client negative controls, not service failures.

## Independent Public OIDC and Asset Verification

- OIDC discovery returned HTTP `200` with the expected realm issuer.
- A valid `diis-web` authorization request returned HTTP `200` and a login form.
- An invalid client/callback request returned HTTP `400`.
- Login HTML referenced exactly one fingerprinted DIIS CSS and one
  fingerprinted DIIS JavaScript asset.
- Old custom `login.css` and `login.js` references were absent.
- Public CSS returned HTTP `200` with SHA-256
  `2ea123a3057543fc59011457d581688ceb529f5f9b70e21ea46dde5efc1599bd`.
- Public JavaScript returned HTTP `200` with SHA-256
  `4d1ab55a352a4ee23d0376d0b80bf23c2a27e6a5430d296425607723ad22eaf2`.
- Both assets retain the long cache lifetime, which is now safe because the
  content hash is part of each URL.
- Production and staging web roots returned HTTP `200`.

## Independent Browser Review

No credential, OTP, CAPTCHA, account, or sensitive data was used.

### Desktop 1440 x 900

- Indonesian login rendered without horizontal overflow.
- Language control height was `44px`; text/password controls were `46px`.
- Closed state exposed `aria-expanded=false` and hid the menu.
- Open state exposed `aria-expanded=true`, focused `English`, and did not
  overlap the username field.
- `Escape` closed the menu and restored focus to the language trigger.
- `Enter` and `Space` opened the menu.
- `Tab` from the language item closed the menu and moved focus to username.
- English locale rendered `Sign in to your account` and `Username or email`.
- Returning to Indonesian restored `Masuk dengan Akun Sekolah`.
- Browser console warning/error count was `0`.

### Mobile 390 x 844

- Viewport width and document width were both `390px`; no horizontal overflow.
- Login card stayed within the viewport at `358px` wide.
- All visible primary controls were at least `44px` high.
- Open language menu did not overlap the username field.
- Page scroll height equalled viewport height; no clipping or avoidable vertical
  overflow was observed.
- Browser console warning/error count was `0`.

### Staging federated login

- Staging login redirected to the actual shared Keycloak authorization route.
- `redirect_uri` targeted the staging Keycloak callback.
- PKCE used `code_challenge_method=S256` with a challenge present.
- The page loaded the approved fingerprinted CSS and JavaScript.
- No horizontal overflow or browser console warning/error was observed.

Temporary viewport overrides were reset and reviewer-created tabs were closed.

## Evidence Boundary and Next Gate

The Executor report and this independent report are currently untracked. The
next valid operation is an explicit docs-only Git package containing only the
reviewed evidence files, followed by normal review and Gitflow. Do not use
`git add .` or `git add -A`.

After both reports are permanently tracked, Checkpoint B may establish its
exact-SHA documentation freeze and produce screenshots, PDF, and presentation
artifacts. Any product, Help, auth, accessibility, privacy, or factual defect
found during Checkpoint B invalidates the freeze and returns the work to
Checkpoint A.

No additional shared-Keycloak dispatch is authorized.

## Confidence

- source and manifest integrity: `0.99`;
- workflow and governance evidence: `0.99`;
- production runtime and public asset integrity: `0.99`;
- browser UI, responsive behavior, and keyboard accessibility: `0.99`;
- readiness for docs-only evidence packaging: `0.99`;
- readiness to begin Checkpoint B after evidence is tracked: `0.98`.
