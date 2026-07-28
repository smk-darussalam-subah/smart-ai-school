# Appointment Governance Systemd Scheduler Follow-up

Tanggal: 2026-07-27

Branch: `feat/appointment-governance-wave-c-activation-20260725`

Status: **READY FOR REREVIEW - P1/P2 FOLLOW-UP COMPLETE**

## Scope

Follow-up ini menutup P1 re-review integrated validation: source masih menyatakan n8n sebagai scheduler appointment due activation, padahal keputusan Director membatalkan n8n untuk proses ini.

Perubahan ini tidak mengubah schema, migration, appointment domain service, Keycloak, database, n8n live, staging deploy, atau Git packaging.

## Source Changes

- Deleted n8n appointment workflow:
  - `infrastructure/n8n/workflows/appointment-due-activation-daily.json`
- Removed appointment-only env wiring from n8n service:
  - `infrastructure/docker/docker-compose.yml`
  - `infrastructure/docker/.env.staging.example`
- Kept API machine-token contract:
  - `APPOINTMENT_AUTOMATION_TOKEN` remains on API/staging API env.
  - `AppointmentAutomationGuard`, endpoint, nginx public block, and advisory lock are retained.
- Added VPS systemd scheduler source:
  - `infrastructure/systemd/diis-appointment-due-activation.sh`
  - `infrastructure/systemd/diis-appointment-due-activation.service`
  - `infrastructure/systemd/diis-appointment-due-activation.timer`
- Added operator runbook:
  - `docs/runbooks/appointment-due-activation-systemd.md`
- Updated operational docs:
  - `.env.example`
  - `docs/deployment/env-variables.md`
  - `docs/decision-log.md`
  - `infrastructure/n8n/README.md`
  - `infrastructure/nginx/nginx.conf`

## Scheduler Contract

- Timer runs daily at `00:15:00 Asia/Jakarta`.
- `Persistent=true` is set so missed runs after reboot are caught up by systemd.
- Service is `oneshot`.
- Script calls API from inside the selected API container to `127.0.0.1:3001/api/v1/appointments/activate-due`.
- Token is read from the API container environment and is not written to the unit, script, command output, or logs.
- HTTP non-2xx exits nonzero.
- HTTP 2xx with empty body, malformed JSON, missing count fields, or non-integer counts exits nonzero.
- Bounded retry defaults to 3 attempts with 10 seconds delay.
- Script output logs only safe counts and status:
  - `endedCount`
  - `cancelledCount`
  - `activatedCount`
  - `affectedUserCount`

## Verification

### Source Sweep

- `rg -n "appointment|activate-due|APPOINTMENT_AUTOMATION_TOKEN|DIIS_API_INTERNAL_URL" infrastructure/n8n`
  - Result: only README negative note remains: appointment due activation is not run by n8n.
- `rg -n "DIIS_API_INTERNAL_URL" .env.example infrastructure docs --glob '!docs/audits/**'`
  - Result: no matches.
- `node -e` JSON parse for remaining n8n workflows:
  - `health-check.json`: pass.
  - `backup-daily.json`: pass.
- `git diff --check -- .env.example infrastructure docs`
  - Result: pass.

### VPS/Linux Source Verification

Validated on VPS with files copied to a temporary directory only. No live systemd unit was installed or enabled.

- `bash -n diis-appointment-due-activation.sh`: pass.
- `systemd-analyze verify diis-appointment-due-activation.service diis-appointment-due-activation.timer`: pass, exit code 0.
  - Host printed unrelated warnings for existing system units; scheduler source still verified successfully.
- `systemd-analyze calendar '*-*-* 00:15:00 Asia/Jakarta'`: pass.
  - Normalized form: `*-*-* 00:15:00 Asia/Jakarta`.
  - On a UTC host, next elapse was shown as `17:15:00 UTC`, matching `00:15 WIB`.
- `appuser` Docker access proof:
  - `id -nG | grep -qw docker`: pass.
  - `docker ps --format '{{.Names}}' | head -n 1 >/dev/null`: pass.

### Disposable Scheduler Smoke

Used a disposable container based on the existing API image with a mock endpoint. This did not touch staging database, staging API process, n8n live, Keycloak, or systemd live config.

- Missing token request to mock endpoint: `403`.
- Invalid token request to mock endpoint: `403`.
- Scheduler script valid call, first run:
  - `{"ok":true,"statusCode":201,"endedCount":0,"cancelledCount":0,"activatedCount":1,"affectedUserCount":1}`
- Scheduler script valid call, retry:
  - `{"ok":true,"statusCode":201,"endedCount":0,"cancelledCount":0,"activatedCount":0,"affectedUserCount":0}`
- Mock response included an internal identifier field; script output did not log it.
- Disposable container and temporary VPS directory were removed after verification.

### Strict Response Contract Follow-up

Used a disposable mock endpoint and script settings `DIIS_APPOINTMENT_MAX_ATTEMPTS=2`, `DIIS_APPOINTMENT_RETRY_DELAY_SECONDS=0`.

| Case | Expected | Result |
| --- | --- | --- |
| valid 2xx JSON counts | success | pass, status 0 |
| valid retry | success | pass, status 0 |
| 2xx empty body | fail nonzero | pass, status 1, 2 attempts, `invalid_response_json` |
| 2xx malformed JSON | fail nonzero | pass, status 1, 2 attempts, `invalid_response_json` |
| 2xx missing count | fail nonzero | pass, status 1, 2 attempts, `invalid_response_contract` |
| 2xx string count | fail nonzero | pass, status 1, 2 attempts, `invalid_response_contract` |
| 2xx negative count | fail nonzero | pass, status 1, 2 attempts, `invalid_response_contract` |

The mock included `affectedKeycloakIds`; output scan confirmed the internal mock identifier did not appear in script output.

### Regression Checks

- API focused test:
  - `npm.cmd --workspace @smk/api run test -- --runTestsByPath src/__tests__/appointments.spec.ts --runInBand --cacheDirectory=.tmp/jest-cache-scheduler-followup-api`
  - Result: 1 suite / 21 tests passed.
  - Existing ts-jest warnings about compiled JS from package `dist` were present.
- API type-check: pass.
- Web type-check: pass.
- API lint: pass.
- Web lint: pass.
  - Existing Next lint deprecation / plugin warning only.
- API build: pass.
- Web build: pass.
  - Next build completed 39/39 pages.

## Not Performed

- No live n8n import, activation, deletion, or execution was performed.
- No live systemd service/timer was installed or enabled.
- No staging drop-in was installed. Runbook now forbids redirecting the production timer to `smk-staging-api`; staging uses manual one-shot script execution only.
- No Git staging, commit, push, PR, merge, deploy, or branch protection change was performed.
- Live staging API was not used as the valid scheduler proof because the branch endpoint is not deployed there yet; a direct staging route check returned `404`, consistent with this branch not yet being promoted.
- Authenticated browser QA remains deferred to staging after Gitflow promotion.

## Residual / Next Gate

- Reviewer should re-review this source follow-up before Git packaging.
- After merge/promote to staging, staging must run manual one-shot scheduler smoke against `smk-staging-api`; do not enable a staging timer on the shared VPS.
- Before/after production timer install, operator must capture:
  - `systemctl is-enabled diis-appointment-due-activation.timer`;
  - `systemctl list-timers diis-appointment-due-activation.timer`;
  - one manual `systemctl start diis-appointment-due-activation.service`;
  - `journalctl` output showing safe counts only.
- P2 fixture-based migration replay with legacy rows remains pre-go-live, not a blocker for this scheduler follow-up.
- Staging browser QA remains required for authenticated appointment authority and sidebar/access diagnostics.
