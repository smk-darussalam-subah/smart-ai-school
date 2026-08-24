# Wave 8.5 Role-Based UI/UX and Monitoring Staging QA

Date: 2026-08-24
Environment: DIIS staging
Executor verdict: **QA COMPLETE - READY FOR INDEPENDENT STAGING REVIEW**

This report consolidates delivery, remediation, runtime, authorization, browser,
responsive, accessibility, and cleanup evidence for Wave 8.5. It contains no
credentials, pairing codes, cookies, tokens, real PII, or production data.

## Scope and Guardrails

- Scope: role-based workspace clarity, operational monitoring, classroom display
  pairing and lifecycle, responsive behavior, accessibility, and regression safety.
- Daily color and style behavior was preserved.
- Staging was the only deployed and browser-tested environment.
- No production container, database, timer, Keycloak role, or `main` branch was
  changed.
- Staging users and display labels were synthetic and PII-safe.
- All Git staging used explicit file lists; no broad `git add .` or `git add -A`.

## Git and Deployment Evidence

### Reviewed Wave 8.5 delivery

| Item | Evidence |
| --- | --- |
| Source PR | #566, head `a069c510b590451f0b6436f44d14828853f2f543`, 89 reviewed files |
| Develop merge | `e7485d953f29fa5e76310c16c5ed5ad95c1228ca` |
| Staging PR | #567 |
| Initial staging merge | `04a7736646ad10eb9d9a9c1535945cc0208b7bb0` |
| Initial deploy | GitHub Actions run `32715736279`, success |

### Same-wave remediation

| Finding | Source PR and commit | Staging PR and merge | Deploy |
| --- | --- | --- | --- |
| Monitoring hydration and display CSP | #568, `e6349cc` | #569, `e61caede59978f78c50e1bce24a3f7af283654f8` | `32720142702`, success |
| Trusted display activation origin | #570, `9694aaa` | #571, `97db95de2c619e87de3ce107ab1ffd81040be91d` | `32722364240`, success |
| Monitoring dialog focus restoration | #572, `9100e81cdb4387597ad337849de89853fc8a992e` | #573, `76527ffe95caf9cb0334301e08a60e57a54539ae` | `32725826192`, success |

All source and promotion PRs passed Build Check, Lint and Type Check, and Unit
Tests before merge. Approval requirements were temporarily changed from 1 to 0
only for the authorized merge window and restored immediately afterward.

## Runtime Evidence

- VPS checkout: `/opt/diis-staging/smart-ai-school`.
- Final tested staging SHA: `76527ffe95caf9cb0334301e08a60e57a54539ae`.
- `smk-staging-api`: running and healthy.
- `smk-staging-web`: running.
- Staging API effective `WEB_URL` is the canonical staging origin.
- Database migration state remained clean; the hotfixes introduced no migration.
- Remote `main` remained `7c5066c9453f8a542f2bf4f93cdd69e8d0a69b0e`.

## Automated Verification

Final focus remediation verification:

- Focused web: 3 suites, 49 tests passed.
- Web type-check: passed.
- Web lint: passed, with only the existing Next.js lint deprecation/plugin notice.
- Web production build: passed, 47 of 47 pages generated.
- `git diff --check` and cached checks: passed.

The approved Wave 8.5 source gate additionally recorded:

- Full API: 65 suites, 1,296 tests passed.
- Full web: 42 suites, 286 tests passed.
- PostgreSQL concurrency: 4 of 4 tests passed after 45 migrations.
- Type-check 9 of 9, lint 3 of 3, build 6 of 6, Prisma validate/generate:
  passed.

## Authenticated Role Matrix

The browser used fresh federated sessions backed by synthetic staging accounts.
Direct API results were checked with the same authenticated role context.

| Actor | Workspace/context result | Monitoring UI | Monitoring API |
| --- | --- | --- | --- |
| SUPER_ADMIN | Correct Super Admin identity and navigation | Manage devices | 200 |
| Active Kepala Sekolah appointment | Stable GURU identity plus KS context | Manage devices | 200 |
| TATA_USAHA | Correct TU identity | Read only | 200 |
| Active WAKA appointment | Stable GURU plus WAKA context | Denied as designed | 403 |
| GURU with assignment | Correct GURU context and Jadwal access | Denied | 403 |
| GURU without assignment | Safe dashboard landing | Denied | 403 |
| SISWA | Academic workspace landing | Denied | 403 |
| ORANG_TUA | Family academic workspace landing | Denied | 403 |
| INDUSTRI | Safe dashboard landing | Denied | 403 |

No legacy position role was used as a stable identity. The review-mode source
contract was retained; the available Super Admin fixture had a single role, so a
live role-switch control was not present in this staging account.

## Monitoring and Display QA

### Monitoring

- Page rendered without React hydration error after a fresh deployment tab.
- Time formatting was stable in `Asia/Jakarta` and initial clock state came from
  the server snapshot rather than a render-time clock.
- Summary, filters, empty state, alerts, and device history remained coherent.
- Status labels were human-readable; revoked and expired credentials were not
  presented as active.
- No horizontal overflow was found at 1440x900 or 390x844.
- At 390x844, all actionable controls measured at least 44px. The standard native
  checkbox itself is smaller but remains associated with its clickable label row.

### Pairing and credential lifecycle

- `/display/pair` rendered correctly.
- Legacy token route redirected to the generic pairing page without exposing the
  token.
- Missing credential redirected to `/display/pair?reason=credential`; the page no
  longer remained stuck at a loading state.
- Pairing created through the authorized Super Admin UI succeeded after the trusted
  origin configuration was corrected.
- The display credential remained in an HttpOnly cookie and did not appear in the
  page URL or DOM.
- Reuse of a consumed pairing code was denied generically.
- Audio activation required a user gesture; the visible state changed to the mute
  control and exposed the local test action.
- Disconnect cleared display access; refresh required pairing again.
- Credential rotation invalidated the old credential and allowed the new one.
- Revocation invalidated the active display on refresh.
- A short-lived synthetic credential expired as expected; the UI showed
  `Kedaluwarsa` and `Credential perlu diputar`.
- All QA credentials were revoked or expired and revoked after testing. Revoked
  device rows remain intentionally as audit history.

### Accessibility closure

- Pairing dialog initial focus moved to the first form control.
- Repeated Tab navigation remained trapped inside the dialog.
- Escape closed the dialog.
- Focus returned to the exact `Buat pairing perangkat` trigger on both desktop and
  mobile.
- The same return-focus mechanism covers session detail, rotation, single-device
  revoke, and revoke-all dialogs.
- The mobile pairing dialog fit the 390x844 viewport without horizontal overflow.

### Display viewport

- 1920x1080: content matched viewport width and height; no small actionable target.
- 1366x768: content matched viewport width and height; no small actionable target.
- Monitoring 1440x900: no horizontal overflow.
- Monitoring 390x844: no horizontal overflow and no actionable target below 44px.

## Console and Network Hygiene

- The final fresh Monitoring tab produced no console warning or error.
- Previously observed Server Action errors belonged to tabs opened before a deploy
  and were excluded after fresh-tab verification.
- A browser-extension `Receiving end does not exist` message was isolated as an
  extension artifact rather than an application error.
- No credential, token, or pairing code was written to this report or committed as
  evidence.

## Session Alert Evidence Boundary

On 2026-08-24 the shared staging calendar had no class session eligible for the
current date. The official materialization endpoint returned `createdCount=0` and
`totalCount=0` without mutating timetable data. Therefore this run does **not** claim
a live T+5/T+10/T+15 alert or audible speaker proof.

The alert lifecycle remains supported by the independently approved source tests,
PostgreSQL 4/4 concurrency proof, fake-clock timing tests, idempotency, replacement
teacher handling, and user-gesture audio contract. Creating a fake live schedule in
the shared staging database solely for visual evidence was deliberately avoided.

## Cleanup and Containment

- No active QA display credential remains.
- No production container, database, timer, checkout, or branch was modified.
- `develop`, `staging`, and `main` classic protections require one approval.
- Staging ruleset pull-request approval requires one approval.
- No source PR remained open after the final staging deployment.

## Final Executor Assessment

All source defects found during staging QA were fixed in Wave 8.5, validated locally,
delivered through reviewed Gitflow, deployed to staging, and retested on the deployed
SHA. The role matrix, privacy boundary, pairing lifecycle, responsive layouts,
accessibility behavior, console hygiene, and cleanup are complete within the stated
evidence boundary.

Requested next gate: independent reviewer staging sign-off. Promotion to `main` and
production is intentionally outside this report.
