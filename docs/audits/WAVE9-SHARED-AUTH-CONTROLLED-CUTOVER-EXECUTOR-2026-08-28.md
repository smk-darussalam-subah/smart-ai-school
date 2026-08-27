# Wave 9 Shared Auth Controlled Cutover - Executor Evidence

Tanggal: 2026-08-28

Status executor: **CUTOVER AND TARGETED QA COMPLETE - READY FOR INDEPENDENT FINAL REVIEW**

Dokumen ini adalah laporan eksekutor, bukan verdict reviewer independen dan bukan
izin untuk memulai Checkpoint B.

## Approved Contract

- Workflow: `Apply DIIS Keycloak Theme`
- Dispatch run: `33102619583`, attempt `1`
- Expected `main` SHA: `76d64c6582fdf959d5868d89f36a3e36ea02beea`
- Previous production SHA: `da37dbf2f32766efef068d937696b352259483a2`
- Confirmation: `APPLY_DIIS_SHARED_AUTH_THEME`
- Theme manifest SHA-256:
  `038f82f39d8419e5e398b6f63bbe6edf2c7b756cfbd06f792163b6a9c3b514f5`
- Governance: documented single-operator exception; this is not represented as
  two-person separation of duties.

Exactly one workflow dispatch was created for the approved SHA. The historical
failed workflow was not rerun.

## Preflight and Environment Gate

- `origin/main` matched the approved SHA.
- The first parent of the approved SHA matched the approved previous production
  SHA.
- The local manifest hash matched the approved manifest hash.
- The workflow source and cutover files matched `origin/main`.
- The `production` environment required a named reviewer, disallowed admin
  bypass, and allowed deployment from `main` only.
- The production environment approval was bound to run `33102619583` and the
  approved SHA/manifest under the documented single-operator exception.
- `develop`, `staging`, and `main` classic protection required one approval with
  admin enforcement after the operation.
- No open pull request remained after verification.

## Workflow Result

- Source/dispatch validation job: **PASS**.
- Controlled shared-Keycloak cutover job: **PASS**.
- Workflow conclusion: **success**.
- Containment/rollback path: not triggered because all post-mutation checks
  passed.
- Bounded Keycloak log error count reported by the workflow: `0`.
- The only workflow annotation was the GitHub-hosted runner warning about the
  Node.js 20 checkout-action transition; it did not affect source validation,
  cutover, health, or asset verification.
- Docker Compose emitted a warning that `APPOINTMENT_AUTOMATION_TOKEN` was not
  set while recreating only the Keycloak service. The Keycloak service does not
  consume that variable, no API/web container was recreated, and post-cutover
  API, database, and Keycloak health remained green. Appointment automation
  configuration remains an operationally separate control.

Workflow evidence:

`https://github.com/smk-darussalam-subah/smart-ai-school/actions/runs/33102619583`

## Runtime Integrity

Production after cutover:

- Branch: `main`
- SHA: `76d64c6582fdf959d5868d89f36a3e36ea02beea`
- Tree: `70aa8cea7a53144ad10e6ff9e247cfa1a146306e`
- `smk-api`: running and healthy
- `smk-web`: running
- `smk-keycloak`: running and healthy
- API health: `status=ok`, database `up`

Staging during targeted browser QA:

- Branch: `staging`
- SHA: `c4d2e84f1bf71c49431450c207cae80e4f4c18a1`
- Tree: `70aa8cea7a53144ad10e6ff9e247cfa1a146306e`
- `smk-staging-api`: running and healthy
- `smk-staging-web`: running
- API health: `status=ok`, database `up`

The production and staging application trees were identical.

The runtime Keycloak login theme contained exactly these five files:

1. `messages/messages_en.properties`
2. `messages/messages_id.properties`
3. `resources/css/login.2ea123a30575.css`
4. `resources/js/login.4d1ab55a352a.js`
5. `theme.properties`

Runtime hashes matched the approved manifest. The fingerprinted custom asset
hashes were:

- CSS: `2ea123a3057543fc59011457d581688ceb529f5f9b70e21ea46dde5efc1599bd`
- JavaScript:
  `4d1ab55a352a4ee23d0376d0b80bf23c2a27e6a5430d296425607723ad22eaf2`

## Public OIDC and Asset Verification

- OIDC discovery: HTTP `200`.
- Valid `diis-web` authorization request: HTTP `200` and login form present.
- Invalid client/callback request: HTTP `400`.
- Public login HTML referenced exactly one fingerprinted custom CSS and one
  fingerprinted custom JavaScript asset.
- Public CSS and JavaScript bytes matched the approved full SHA-256 values.
- The old unfingerprinted custom `login.css` and `login.js` were not referenced.
- Browser network evidence showed HTTP `200` for the fingerprinted assets and no
  loading failure.
- Chrome could reuse the content-addressed assets from its disk cache. Their
  names and downloaded bytes still matched the approved fingerprints, so the
  previous long-lived Cloudflare/browser cache could not serve old content
  under the new URLs.

## Browser QA

The QA used the actual public shared Keycloak. No Keycloak account, password,
OTP, or CAPTCHA was needed. No credential was submitted. No screenshot artifact
was retained; evidence was recorded through PII-safe DOM, layout, console, and
network measurements.

Desktop `1440x900`:

- Indonesian login form rendered without horizontal overflow.
- Language trigger had a stable `44px` height and `aria-expanded=false` while
  closed.
- Opening the menu set `aria-expanded=true`, moved focus to `English`, and did
  not overlap username or password controls.
- `Escape` closed the menu and restored focus to the language trigger.
- `Enter` and `Space` opened the menu.
- `Tab` from the language item closed the menu and moved focus to username;
  subsequent keyboard order reached password correctly.
- English locale displayed `Sign in to your account` and `Username or email`.
- Returning to Indonesian restored `Masuk dengan Akun Sekolah`.

Mobile `390x844`:

- No horizontal overflow; page width remained `390px`.
- Login card stayed inside the viewport at `358px` wide.
- Username, password, password-visibility, forgot-password, locale, and submit
  controls were at least `44px` high.
- The open language menu did not overlap the username field.
- Page content fit without vertical overflow at this viewport.

Staging federated flow:

- `https://staging.smkdarussalamsubah.sch.id/login` opened the DIIS login
  gateway.
- `Masuk dengan akun sekolah` redirected to the actual shared Keycloak.
- The authorization URL contained the staging callback and PKCE parameters.
- The redirected page used the approved fingerprinted CSS and JavaScript.
- Browser console contained no warning or error after the federated redirect.

Temporary browser viewport overrides were reset and the QA tab was closed.

## Final Controls

- Exactly one run existed for approved SHA
  `76d64c6582fdf959d5868d89f36a3e36ea02beea`, attempt `1`, conclusion
  `success`.
- No rerun or second dispatch was performed.
- Environment `production` still had `can_admins_bypass=false` and a required
  reviewer.
- Branch approval requirements were restored/retained at `1` for `develop`,
  `staging`, and `main`.
- No manual theme copy, SSH patch, realm edit, or service restart outside the
  approved workflow occurred.

## Handoff

Request an independent final review of:

1. the exact workflow run and approved SHA/manifest binding;
2. public OIDC, asset hashes, and bounded logs;
3. desktop/mobile locale and focus evidence;
4. staging federated-login evidence;
5. branch/environment protections and the single-dispatch count.

Checkpoint B remains **HOLD** until that reviewer returns a verdict with no
P0/P1/P2 and the final evidence is packaged through an explicit docs-only Git
gate.
