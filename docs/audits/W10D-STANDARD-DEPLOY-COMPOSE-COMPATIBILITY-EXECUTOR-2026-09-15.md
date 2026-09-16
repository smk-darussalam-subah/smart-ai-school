# W10-D Standard Deploy Compose Compatibility - Executor Report

Date: 2026-09-15
Status: `SOURCE COMPLETE - INDEPENDENT REVIEW REQUIRED - STAGING HOLD`

## Scope and baseline

- Baseline SHA: `b702aac2c3b84db0c8ae0738449b8d2182e8343d`
- Baseline tree: `3b265ae1e1a12873964aac940eac8488d9441dd4`
- Branch: `fix/w10d-standard-deploy-compose-compatibility-20260915`
- Source paths: 8
- Proposed package paths: 10, including this report and its evidence JSON
- No commit, push, PR, rerun, environment approval, staging mutation, or production mutation was performed after the failed run.

## Incident reproduced

The authorized staging run `34924008580`, attempt `1`, deployment `6450900445`, failed before build and migration. Docker Compose expanded the entire base Compose model while processing the application-only `db-init-staging` command and rejected the missing `PG_BACKUP_IMAGE` variable required by the uncommissioned `pg-backup` service.

Post-failure evidence established:

- staging checkout advanced cleanly to the approved SHA `b702aac2c3b84db0c8ae0738449b8d2182e8343d`;
- staging API and web image identities did not change;
- PostgreSQL stayed healthy with `46/46` migrations applied and zero pending;
- shared ingress digest remained `213be90994aaffc4eea5f339b0204900ff9a59e087fc3e61381a8b644f54ced5`;
- production remained clean at `418846959b90b38e10141cb8df995872802219fe`;
- no recovery marker, candidate container, or deploy lock remained;
- the workflow-updated staging env file contained no `PG_BACKUP_IMAGE` value.

The run was not retried. This report does not claim a successful staging deployment.

## Implementation

`compose-application.sh` is a narrow adapter for the four application-only Compose calls in the standard deploy workflow. It supplies a non-resolving, digest-shaped `.invalid` backup image solely so Compose can parse services that are not selected. Following the independent review, the adapter:

- accepts exactly three symbolic inputs: one of `init-staging`, `build-app`, `migrate`, or `deploy-app`, the exact branch, and its exact environment-file basename;
- constructs all Compose flags and service targets internally, including staging's API URL build argument;
- rejects arbitrary flags, extra arguments, unknown modes, cross-branch environment files, and backup selection before Docker is invoked;
- does not modify the authoritative `${PG_BACKUP_IMAGE:?...}` guards in `docker-compose.yml`;
- does not pull, build, publish, start, or configure the backup service.

The standard deploy workflow uses the adapter only for database initialization, application build, migration, and application service update. Host lock, exact checkout, migration, health, and shared-ingress containment remain unchanged.

Because `.github/workflows/deploy.yml` was part of the previous exact handoff, a successor handoff preserves the old validator/report/evidence as immutable Git blobs at the approved baseline. Shared CI runs the successor semantic contract; its strict workspace validator remains an explicit packaging gate.

The native Windows follow-up normalizes relative Git object paths only during execution of those immutable historical validators. It also normalizes relative `Path` string representation for the historical inventory, preventing one duplicate Windows-formatted path from changing the expected count. Both normalizers are restored immediately after the predecessor chain; historical bytes and their SHA-256 bindings remain unchanged.

## Literal source manifest

| Path                                                                      | SHA-256                                                            |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `.github/workflows/capacity-lifecycle.yml`                                | `57596c12d6d99a3447b60f7ed9b34d57d614a39d76eaa4ab7f24b1496ebd8e57` |
| `.github/workflows/ci.yml`                                                | `8a8db48baf51e1eb3474ac97a7435f02bb348779e73a882faee8bba45180d7b5` |
| `.github/workflows/deploy.yml`                                            | `908ef81bba275ebb18180fda3430c0fdbeddd01d8924a1ae332dfc69a5204756` |
| `apps/api/src/__tests__/deploy-workflow-safety.spec.ts`                   | `df3c4faf31bc55dd4bb9382c97b640d98ccbe5bc30811627539afd462d151c29` |
| `infrastructure/deploy/compose-application.sh`                            | `0ec9707fb93a9de5f6b4d95f4946b618d9526d31329901855f8b7d1ef236b026` |
| `infrastructure/deploy/tests/compose-application-contract.sh`             | `98cc333895075722794e0c3280bfc6830237e60d780966118f100a0336a278e1` |
| `infrastructure/deploy/tests/standard-deploy-compose-handoff-contract.py` | `0968250e1416b68a2fd2dbad5dbe399cc3a10353fbd8a323c9e7af732c93bf83` |
| `infrastructure/deploy/verify-standard-deploy-compose-handoff.py`         | `78dd53e3b24076b9ab9b82723ae9ab2751cade435f5529e24597028c593d61ca` |

Aggregate source manifest SHA-256: `7a9ce54fd6c673cc58027b69c4d144e046140d3d04bddb4e25a7e08085f9b978`

## Verification

| Check                                                        | Result                                         |
| ------------------------------------------------------------ | ---------------------------------------------- |
| Compose application behavior, Git Bash                       | 5 markers pass; seven exact positive commands, nine negative controls, and real Compose models |
| Compose application behavior, WSL                            | 5 markers pass; seven exact positive commands, nine negative controls, and real Compose models |
| Focused API deploy workflow                                  | 1 suite / 7 tests pass                         |
| Native Windows predecessor chain                              | 7 source / 9 paths / 96 historical inputs pass |
| Native Windows handoff contract                                | 9 cases pass                                   |
| WSL handoff contract                                           | 9 cases pass                                   |
| Source closure, Ubuntu 24.04 disposable lab with init reaper | 45/45 pass                                     |
| Integrated closure, WSL                                      | 25/25 pass                                     |
| Staging readiness, Ubuntu 24.04 disposable lab               | 49/49 pass                                     |
| Capacity lifecycle, Ubuntu 24.04 disposable lab              | 55/55 pass                                     |
| Bash and Python syntax                                       | pass                                           |
| Prettier for changed YAML and TypeScript                     | pass                                           |
| `git diff --check`                                           | pass                                           |

The first Alpine container attempt was rejected as evidence because BusyBox and its PID-1 behavior do not match the Ubuntu CI runner. The accepted Linux results above came from an Ubuntu 24.04 filesystem with an init reaper and Docker Compose `2.40.3`; all containers used for the lab exited and were removed automatically.

The source-closure, integrated-closure, staging-readiness, and capacity-lifecycle lab results above are reused from the earlier Executor run. Their inputs outside this focused Compose/workflow/handoff delta were not rerun in this follow-up; CI on the eventual exact candidate remains a separate gate.

## Security and operational boundaries

- The placeholder registry uses the reserved `.invalid` domain and cannot identify a deployable image.
- Explicit backup selection remains fail-closed both in the adapter and the base Compose file.
- No backup, Google Drive, credential, n8n, scheduler, D2-D6, main, or production behavior changed.
- No deployment retry is authorized by this source completion.
- The earlier application deployment is still failed and staging remains on the previous application images.

## Handoff

Independent re-review should inspect the exact 10-path package, reproduce the command-smuggling matrix and native Windows/WSL predecessor chain from baseline Git blobs, and confirm the unchanged backup guard. Git packaging, merge, staging deployment, and all operational mutations remain separate gates.

Recommended next task model: GPT-5.6 Sol with high reasoning for independent source review of the deployment and backup boundary. The actual model or effort used in this Executor session is not asserted.
