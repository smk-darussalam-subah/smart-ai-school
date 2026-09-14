# W10-D Standard Deploy Workflow Restoration - Executor Report

Date: 2026-09-14
Status: `SOURCE COMPLETE - INDEPENDENT REVIEW REQUIRED - DEPLOYMENT HOLD`

## Decision Implemented

The deployment workflow is restored to the standard DIIS path used before the W10-D recovery-only staging override. A push to `staging` or `main` now enters one shared `Deploy via SSH` step after the existing environment approval.

This is deliberately narrower than reverting the entire deployment safety history. The following controls remain intact:

- immutable action pins;
- exact branch, workflow SHA, run ID, and attempt validation;
- one shared GitHub concurrency group and bounded host lock;
- rejection of dirty host checkouts;
- fast-forward-only checkout to the exact workflow SHA;
- staging database guard and migration execution;
- health checks before success;
- shared-ingress validation, transactional rollout, rollback preservation, and post-checks.

The following W10-D staging-only wiring is removed:

- `Bind staging executor from exact Actions checkout`;
- `Guarded recovery-only staging via existing SSH channel`;
- mandatory `W10D_STAGING_RELEASE_MODE` and approval-packet variable for ordinary staging deployment;
- the separate production-only SSH step.

Recovery executors and their behavioral tests remain in the repository for later hardening work, but they are no longer on the ordinary application deployment path. No backup, n8n, database, scheduler, credential, runtime, staging, or production behavior was executed or mutated in this source gate.

## Baseline

| Field                   | Value                                                              |
| ----------------------- | ------------------------------------------------------------------ |
| Branch                  | `fix/restore-standard-deploy-workflow-20260914`                    |
| Develop SHA             | `715121657e3d432f9c7cda82aa8cfefe7b32c199`                         |
| Develop tree            | `f6eb45f7f19eaca55b9294bac8a3d4652c54bd8f`                         |
| Source files            | 6                                                                  |
| Package paths           | 8                                                                  |
| Source manifest SHA-256 | `6c85dc1ffd9c905d7fc2f867a985bfd40e2f22cb3e9c5aebb85cb7dc2487701b` |

## Source Manifest

| Path                                                              | SHA-256                                                            |
| ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| `.github/workflows/ci.yml`                                        | `e6b3f7c127477d4b1e1bbcd5764b54aae02af941f7410e6e77d7b49f8fb953b9` |
| `.github/workflows/deploy.yml`                                    | `5389912793eff111b556faa4dfad63cbd4584248c89cf05bb168a9595290274a` |
| `apps/api/src/__tests__/deploy-workflow-safety.spec.ts`           | `3d2f0569c2911f4ef3b477141d22c8d490b836543da9cfd47bc1681158c232ed` |
| `infrastructure/deploy/tests/staging-readiness-contract.py`       | `3d791affdda29ff79aab12c3dfcdc108575ccd3001ed4deed9de16819c231b75` |
| `infrastructure/deploy/tests/standard-deploy-handoff-contract.py` | `7451d8c80bbe7333d53aecf66155026cd0870f2d826293f7e05a7cae58f43720` |
| `infrastructure/deploy/verify-standard-deploy-handoff.py`         | `ebecd60b689f11f182a179fa27e35adb2638eeceba854c28645c980d948215eb` |

The successor validator executes the previous writer-compatibility validator from the exact baseline Git blob. Its accepted predecessor result remains `6 source / 6 rebindings / 88 historical inputs`. Historical reports and evidence are not edited.

## Verification

| Check                                     | Result     |
| ----------------------------------------- | ---------- |
| Deploy workflow safety                    | 6/6 PASS   |
| Staging readiness                         | 49/49 PASS |
| Source closure                            | 45/45 PASS |
| Integrated closure                        | 25/25 PASS |
| Standard deploy handoff negative controls | 6/6 PASS   |
| `git diff --check`                        | PASS       |
| Staged files                              | 0          |

The handoff controls reject changed source bytes, missing or extra source files, wrong baseline or predecessor binding, report drift, unauthorized change metadata, and duplicate JSON keys.

## Operational Boundary

The pending staging run created from the previous workflow is not modified, approved, rerun, or treated as evidence for this source. This gate does not authorize commit, push, PR, merge, protection relaxation, environment approval, deployment, image build, backup/restore, n8n activation, VPS access, or production changes.

## Independent Review Handoff

Review the exact eight-path package, verify the source manifest and report/evidence binding, rerun the focused contracts, and confirm that ordinary staging deployment no longer depends on W10-D recovery approval packets while all listed safety controls remain present.

Recommended next task: GPT-5.6 Terra / medium for the narrow independent source review. Escalate to GPT-5.6 Sol / high only if the predecessor chain, manifest, or workflow semantics drift.
