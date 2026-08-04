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

### Consent-incomplete flow: NOT PROVEN

An official staging provisioning flow created a synthetic fixture without
exposing credentials or personal data in evidence. The official provisioning
contract requires operator consent, and the browser session was blocked by the
browser security policy before the consent reset and clean OAuth verification
could be completed.

Required closure evidence remains:

1. Reset the synthetic fixture through the official `reset-consent` API/UI
   mechanism, never through SQL.
2. Start a clean OAuth session and verify redirect to `/consent`.
3. Verify no protected dashboard data is available before consent.
4. Accept consent once, verify persistence and the correct student workspace,
   and confirm no redirect loop or React #310 error.
5. Remove or deactivate the fixture through an official mechanism.

### LMS failure drill: NOT RUN

The failure drill must use browser network interception or offline mode only.
It must prove that a failed completion request does not show `Selesai` or
`100%`, that the button and error state recover, that reload shows unchanged
server state, and that a retry succeeds once. No database fixture or direct
server mutation is required.

The staging browser policy blocked the session before this drill could be
performed, so no pass claim is made.

### AI provider contract: SOURCE FIX IN PR #426

The follow-up aligns the effective default across validation and module
factories:

- `AI_PROVIDER` defaults to OpenAI.
- OpenAI is fail-fast when `OPENAI_API_KEY` is empty or absent.
- Ollama remains the local embedding gateway and can be selected explicitly.
- Focused API tests, type-check, lint, and build passed locally.

The change still requires the normal `develop -> staging` promotion, staging
provider smoke, and browser AI regression before it can affect main.

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

PR #425 remains open and must not merge to `main` until the consent-incomplete
proof and LMS failure drill are completed, and PR #426 has passed its normal
develop/staging gates. This report intentionally records the remaining gates
instead of treating unavailable browser access as successful QA.
