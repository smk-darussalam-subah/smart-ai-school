# Wave 3 Final Staging and Main Promotion Follow-up

Date: 2026-08-04
Status: FOLLOW-UP REQUIRED BEFORE MAIN MERGE

## Scope

This report records the reviewer follow-up for PR #425. It is an evidence
artifact, not a main or production sign-off. Production was not accessed or
modified during this follow-up.

## Version binding

- Staging deployment under review: `7fb6c1a9b7d934b2f1cfd73cb1d000d0abf9fcbb`.
- Staging deploy workflow: `30803346195`.
- Main promotion PR: #425.
- Main promotion branch head before follow-up: `805a153e8d7cd151bd003e81e2e04845bb1c6b32`.
- AI provider contract follow-up: PR #426, commit `38952f0`.

## Evidence status

### Previously verified

- Staging deployment and health checks were verified for the reviewed staging
  SHA.
- React #310 OAuth redirect matrix, role access controls, mobile layout, LMS
  completion/archive behavior, and provider output samples were previously
  recorded in the Wave 3 QA reports.
- No production deployment, production timer, database mutation, or secret
  disclosure was performed in this follow-up.

### Consent-incomplete flow: PROVEN

Browser QA was rerun on staging with a synthetic, PII-safe user created through
the official `Tambah Pengguna` UI. No SQL was used. Temporary credentials were
used only in the browser session and are not recorded in this report.

Evidence:

1. Super Admin opened `Manajemen Pengguna` and created a synthetic `GURU`
   fixture through the official single-user provisioning dialog.
2. The new user completed the Keycloak first-login `UPDATE_PASSWORD` required
   action.
3. Immediately after the password update, the application redirected the user
   to `https://staging.smkdarussalamsubah.sch.id/consent`.
4. A direct attempt to open `/dashboard` before consent was redirected back to
   `/consent`, proving protected dashboard data was not available before
   consent.
5. After accepting consent once, the user landed on `/dashboard`.
6. A fresh navigation to `/dashboard/akademik` stayed on the protected page and
   did not return to `/consent`, proving consent persistence.
7. Browser console inspection after the flow showed no React #310 error. One
   existing Radix dialog description warning was observed during the earlier
   user-management dialog interaction; it did not affect the consent gate.

Residual cleanup note: the synthetic fixture is intentionally PII-safe. If the
reviewer requires cleanup before main merge, deactivate or remove it through the
official user-management/Keycloak mechanism; do not use SQL.

### LMS failure drill: PROVEN

The failure drill must use browser network interception or offline mode only.
It must prove that a failed completion request does not show `Selesai` or
`100%`, that the button and error state recover, that reload shows unchanged
server state, and that a retry succeeds once. No database fixture or direct
server mutation is required.

Because Codex in-app browser did not expose network interception/offline
controls, the drill was executed with local Playwright against staging using
Chrome and `route.abort()` for the LMS completion server action. This was still
a browser-level interception drill; no SQL write or direct API mutation was used
to induce failure.

Evidence:

1. A PII-safe existing student fixture with published modules and no LMS
   progress was identified on staging.
2. Its password was rotated through Keycloak admin tooling, not SQL.
3. The fixture logged in through the staging OAuth/Keycloak flow and opened
   `/dashboard/akademik`.
4. The student LMS view showed active modules with `Tandai Selesai`; preflight
   progress was `none|none|0`.
5. Playwright intercepted one Server Action POST to `/dashboard/akademik` with
   a `next-action` header and aborted it.
6. After the failed request, the UI did not show `100%`, the completion button
   remained/recovered, and database progress remained `none|none|0`.
7. After reload, the module was still incomplete and `Tandai Selesai` was still
   available.
8. Retrying without interception completed exactly one progress row:
   `100|completed|1`.

Console note: the expected forced failure produced `net::ERR_FAILED` and
`TypeError: Failed to fetch` during the aborted request. A pre-existing
Cloudflare beacon CSP error was also observed. No React #310 error was observed
in this drill.

### AI provider contract: SOURCE FIX IN PR #426

The follow-up aligns the effective default across validation and module
factories:

- `AI_PROVIDER` defaults to OpenAI.
- OpenAI is fail-fast when `OPENAI_API_KEY` is empty or absent.
- Ollama remains the local embedding gateway and can be selected explicitly.
- Focused API tests, type-check, lint, and build passed locally.

The change still requires the normal `develop -> staging` promotion, staging
provider smoke, and browser AI regression before it can affect main.

Current CI status for PR #426: Build Check, Lint & Type Check, and Unit Tests
are green. The PR remains blocked by the normal review/merge gate.

## Git tree integrity

The promotion branch restores the missing trailing blank line in
`APPOINTMENT-GOVERNANCE-WAVE-B-GATE0-PROPOSAL-2026-07-24.md` so the reviewed
promotion tree matches staging for code and existing audit content. This report
is the one intentional new audit artifact for the follow-up and must be
excluded from the tree-equivalence comparison.

Required command after the final promotion head is prepared:

```text
git diff --quiet origin/staging <final-head> -- . \
  ':(exclude)docs/audits/WAVE3-FINAL-STAGING-AND-MAIN-PROMOTION-FOLLOWUP-2026-08-04.md'
```

## Gate decision

PR #425 remains open and must not merge to `main` until PR #426 has passed its
normal develop/staging gates and the resulting staging provider smoke/browser AI
regression has been recorded. The consent-incomplete P1 and LMS failure drill
are now closed by staging/browser evidence in this report.
