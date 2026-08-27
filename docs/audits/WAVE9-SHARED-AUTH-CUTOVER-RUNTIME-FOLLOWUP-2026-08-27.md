# Wave 9 Shared Auth Cutover Runtime Follow-up

Tanggal: 2026-08-27

Branch: `fix/wave9-auth-cutover-login-probe-20260827`

Status: **APPROVED FOR EXPLICIT GIT PACKAGING**

## Release Context

- PR production: `#587`
- Main/application SHA: `63809edea0e75eb16e181372a684b2cc48ab916a`
- Previous production SHA: `c8c0440dd92af0b31cc01a430c9eaa67b0bc8e61`
- Production deploy run: `33059480856` - success
- Theme manifest SHA-256: `9360cf14d7d9cff6bbc998e5f5188efbe95cf01b5febbba4b2494dda3760f43b`

## Failed Cutover Evidence

Controlled workflow run `33060113390` was dispatched once with the approved exact SHA,
previous SHA, and confirmation phrase. Source validation, exact five-file bundle verification,
read-only mount verification, Keycloak health, realm baseline, and manifest verification all
passed. The remote job then stopped before mutation with:

`THEME_CUTOVER_FAILED reason=login-page-unavailable`

The cause was deterministic: the public-auth probe requested
`/realms/diis/account`, which Keycloak 24 serves as the Account Management shell rather than
the login form. The OIDC authorization endpoint for `diis-web` returned HTTP 200 with the
expected login markers.

Containment evidence after the failed run:

- production checkout remained at `63809ede...`;
- Keycloak container ID and start time remained unchanged;
- Keycloak health remained `healthy`;
- public OIDC discovery returned HTTP 200;
- staging root returned HTTP 200;
- no manual file copy, realm mutation, container recreation, or second dispatch occurred.

## Narrow Remediation

1. `apply-theme-cutover-remote.sh` now probes the real OIDC authorization endpoint using
   URL-encoded `client_id`, `response_type`, `scope`, and production callback URI.
2. `test-theme-containment.sh` now behaves like Keycloak 24:
   `/account` returns Account Management, while only the OIDC authorization request returns
   login markup.
3. The test asserts the required client and redirect parameters and rejects any regression
   back to `/account`.

No theme file, manifest, workflow permission, Docker service, dependency, schema, migration,
realm setting, or application feature changed.

## Verification

- `bash -n` for both changed scripts: pass
- Behavioral containment: `4/4` pass
- Theme cutover contract: `16/16` pass
- Keycloak theme Jest: `5/5` pass
- Live read-only OIDC login marker probe: pass
- `git diff --check`: pass
- Packaging manifest: exactly three files
- Cached diff check: pass
- Temporary dependency junction removed; canonical dependency checkout retained

## Required Next Gates

1. Independent source re-review of this three-file follow-up.
2. Explicit Git packaging and PR to `develop`.
3. Promotion through `staging` and `main` with CI and protection restoration.
4. New production cutover approval bound to the resulting main SHA and its first parent.
5. One controlled workflow dispatch.
6. Fresh staging browser QA through the actual shared Keycloak.
7. Independent staging sign-off and freeze of app SHA, cutover SHA, and manifest hash.

Do not reuse the approval bound to `63809ede...` for a future patched SHA.
