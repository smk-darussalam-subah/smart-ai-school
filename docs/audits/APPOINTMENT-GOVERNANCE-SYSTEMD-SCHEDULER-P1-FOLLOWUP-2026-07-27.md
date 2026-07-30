# Appointment Governance Systemd Scheduler P1 Follow-up

Tanggal: 2026-07-27

Status: **READY FOR REREVIEW**

## Findings Addressed

### P1 - 2xx empty/malformed response treated as success

Fixed in `infrastructure/systemd/diis-appointment-due-activation.sh`.

The scheduler script now requires a 2xx body to be valid JSON object with all four count fields:

- `endedCount`
- `cancelledCount`
- `activatedCount`
- `affectedUserCount`

Each count must be an integer and non-negative. Empty body, malformed JSON, missing count, string count, decimal count, null, or negative count exits nonzero.

2026-07-28 strict follow-up: the same response must now contain exactly those four keys. Extra fields such as `affectedKeycloakIds` are rejected with `invalid_response_contract`.

### P1 - Staging drop-in can redirect production timer

Fixed in `docs/runbooks/appointment-due-activation-systemd.md`.

The runbook no longer instructs `systemctl edit` for staging. Staging is manual-only:

```bash
SOURCE_DIR=/opt/diis-staging/smart-ai-school
DIIS_API_CONTAINER=smk-staging-api \
DIIS_APPOINTMENT_MAX_ATTEMPTS=2 \
DIIS_APPOINTMENT_RETRY_DELAY_SECONDS=5 \
  bash "$SOURCE_DIR/infrastructure/systemd/diis-appointment-due-activation.sh"
```

Timer install/enable is production-only on the shared VPS.

### P2 - Bounded retry and Docker access proof

Fixed in `infrastructure/systemd/diis-appointment-due-activation.sh` and `.service`.

Defaults:

- `DIIS_APPOINTMENT_MAX_ATTEMPTS=3`
- `DIIS_APPOINTMENT_RETRY_DELAY_SECONDS=10`

2026-07-28 strict follow-up: override bounds are now enforced:

- `DIIS_APPOINTMENT_REQUEST_TIMEOUT_MS`: 1000 to 120000.
- `DIIS_APPOINTMENT_MAX_ATTEMPTS`: 1 to 5.
- `DIIS_APPOINTMENT_RETRY_DELAY_SECONDS`: 0 to 300.

`appuser` Docker access was verified on VPS:

- `id -nG | grep -qw docker`: pass.
- `docker ps --format '{{.Names}}' | head -n 1 >/dev/null`: pass.

## Verification

Linux/VPS source verification used temporary files only. No live timer was installed/enabled.

- `bash -n diis-appointment-due-activation.sh`: pass.
- `systemd-analyze verify diis-appointment-due-activation.service diis-appointment-due-activation.timer`: pass, exit code 0.
- `systemd-analyze calendar '*-*-* 00:15:00 Asia/Jakarta'`: pass.
- Disposable mock container contract tests:

| Case | Result |
| --- | --- |
| valid 2xx JSON counts | pass, status 0 |
| valid retry | pass, status 0 |
| 2xx empty body | pass, status 1, 2 attempts, `invalid_response_json` |
| 2xx malformed JSON | pass, status 1, 2 attempts, `invalid_response_json` |
| 2xx missing count | pass, status 1, 2 attempts, `invalid_response_contract` |
| 2xx string count | pass, status 1, 2 attempts, `invalid_response_contract` |
| 2xx negative count | pass, status 1, 2 attempts, `invalid_response_contract` |

The mock response included an internal identifier field; script output scan confirmed it was not logged.

Cleanup:

- Disposable mock container removed.
- Temporary VPS directory removed.
- Local `.tmp` mock/runner files removed.

## Regression Checks

- `npm.cmd --workspace @smk/api run test -- --runTestsByPath src/__tests__/appointments.spec.ts --runInBand --cacheDirectory=.tmp/jest-cache-scheduler-followup-api`: pass, 1 suite / 21 tests.
- API type-check: pass.
- Web type-check: pass.
- API lint: pass.
- Web lint: pass with existing Next lint deprecation/plugin warning only.
- API build: pass.
- Web build: pass, 39/39 pages.
- Remaining n8n workflow JSON parse: pass.
- n8n appointment sweep: only negative README note remains.
- `DIIS_API_INTERNAL_URL` sweep outside audit docs: no matches.
- `git diff --check`: pass.

## Not Performed

- No Git staging, commit, push, PR, merge, deploy, branch protection change, live n8n change, live systemd install/enable, Keycloak change, or database change.

## Next Gate

Reviewer can re-review this P1/P2 follow-up. If approved, proceed to explicit Git packaging only. Staging must use manual one-shot scheduler smoke; production timer enable remains a separate operator step after the promoted source is in place.
