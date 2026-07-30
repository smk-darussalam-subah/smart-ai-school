# Appointment Governance Systemd Scheduler Strict Follow-up

Tanggal: 2026-07-28

Status: **READY FOR REREVIEW**

## Findings Addressed

### P1 - Response must be exact allowlist

Fixed in `infrastructure/systemd/diis-appointment-due-activation.sh`.

The scheduler now accepts a successful HTTP 2xx response only when the response body is a JSON object with exactly these four keys:

- `endedCount`
- `cancelledCount`
- `activatedCount`
- `affectedUserCount`

Any extra key, including internal identifiers such as `affectedKeycloakIds`, is rejected with `invalid_response_contract` and a nonzero exit.

### P2 - Retry and timeout overrides need maximum bounds

Fixed in `infrastructure/systemd/diis-appointment-due-activation.sh` and documented in `docs/runbooks/appointment-due-activation-systemd.md`.

Bounds:

- `DIIS_APPOINTMENT_REQUEST_TIMEOUT_MS`: 1000 to 120000.
- `DIIS_APPOINTMENT_MAX_ATTEMPTS`: 1 to 5.
- `DIIS_APPOINTMENT_RETRY_DELAY_SECONDS`: 0 to 300.

Invalid values exit with status 2 before the HTTP call loop.

### P2 - Docker access by appuser must be explicit preflight

Fixed in `docs/runbooks/appointment-due-activation-systemd.md`.

The runbook now includes a repeatable `appuser` preflight:

- verify current user is `appuser`;
- verify `appuser` belongs to group `docker`;
- verify `docker ps` works without `sudo`;
- verify target API container is running;
- verify `APPOINTMENT_AUTOMATION_TOKEN` exists in the API container and is at least 32 chars.

## Verification

### VPS/Linux Source Verification

Temporary files only. No live systemd install/enable was performed.

- `bash -n diis-appointment-due-activation.sh`: pass.
- `systemd-analyze verify diis-appointment-due-activation.service diis-appointment-due-activation.timer`: pass, exit code 0.
  - Host printed unrelated warnings for existing system units; scheduler source still verified successfully.
- `systemd-analyze calendar '*-*-* 00:15:00 Asia/Jakarta'`: pass.
- `whoami | grep -qx appuser`: pass.
- `id -nG | grep -qw docker`: pass.
- `docker ps --format '{{.Names}}' | head -n 1 >/dev/null`: pass.

### Disposable Strict Contract Tests

Used a disposable mock container. No staging DB/API live process, n8n live, Keycloak, systemd live config, Git, or deploy was changed.

| Case | Result |
| --- | --- |
| valid exact 2xx JSON counts | pass, status 0 |
| 2xx with extra `affectedKeycloakIds` | pass, status 1, 2 attempts, `invalid_response_contract` |
| 2xx empty body | pass, status 1, 2 attempts, `invalid_response_json` |
| 2xx missing count | pass, status 1, 2 attempts, `invalid_response_contract` |
| `DIIS_APPOINTMENT_MAX_ATTEMPTS=6` | pass, status 2, 0 attempts |
| `DIIS_APPOINTMENT_RETRY_DELAY_SECONDS=301` | pass, status 2, 0 attempts |
| `DIIS_APPOINTMENT_REQUEST_TIMEOUT_MS=120001` | pass, status 2, 0 attempts |

The mock internal identifier string was scanned and did not appear in script output.

Cleanup:

- Disposable strict mock container removed.
- Temporary VPS directory removed.
- Local `.tmp` mock/runner files removed.

## Regression Checks

- API focused appointment test:
  - `npm.cmd --workspace @smk/api run test -- --runTestsByPath src/__tests__/appointments.spec.ts --runInBand --cacheDirectory=.tmp/jest-cache-scheduler-strict-followup-api`
  - Result: 1 suite / 21 tests passed.
  - Existing ts-jest warnings about compiled JS from package `dist` were present.
- Remaining n8n workflow JSON parse: pass.
- n8n appointment sweep: only negative README note remains.
- `DIIS_API_INTERNAL_URL` source sweep outside audit docs: no matches.
- Local `.tmp` strict mock/runner/cache files: absent after cleanup.
- `git diff --check`: pass.

## Not Performed

- No Git staging, commit, push, PR, merge, deploy, branch protection change, live n8n change, live systemd install/enable, Keycloak change, or database change.

## Next Gate

Reviewer can re-review this strict allowlist follow-up. If approved, proceed only to explicit Git packaging. Staging remains manual one-shot scheduler smoke; production timer enable remains a later operator action.
