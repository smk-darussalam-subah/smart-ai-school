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
| Source files            | 7                                                                  |
| Package paths           | 9                                                                  |
| Source manifest SHA-256 | `19a0eebe6553813fd9ca953fc28cb968ac6d587ad77b04d220cbf7bb350bd04e` |

## Source Manifest

| Path                                                              | SHA-256                                                            |
| ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| `.github/workflows/capacity-lifecycle.yml`                        | `16b6b9b505d6ea6ffd5cf679540bc6fc5b31bfd566f7ad1cd00a4a1f340e6831` |
| `.github/workflows/ci.yml`                                        | `e6b3f7c127477d4b1e1bbcd5764b54aae02af941f7410e6e77d7b49f8fb953b9` |
| `.github/workflows/deploy.yml`                                    | `5389912793eff111b556faa4dfad63cbd4584248c89cf05bb168a9595290274a` |
| `apps/api/src/__tests__/deploy-workflow-safety.spec.ts`           | `3d2f0569c2911f4ef3b477141d22c8d490b836543da9cfd47bc1681158c232ed` |
| `infrastructure/deploy/tests/staging-readiness-contract.py`       | `3d791affdda29ff79aab12c3dfcdc108575ccd3001ed4deed9de16819c231b75` |
| `infrastructure/deploy/tests/standard-deploy-handoff-contract.py` | `e95087f34fa4d5e03460f6d8cfa6f915b089c7e0204620055ba1ebc5a635d5f3` |
| `infrastructure/deploy/verify-standard-deploy-handoff.py`         | `19776a4d937b2d54846f840767f8394c9b3da9966626ac4633516823a3eb3e11` |

The successor validator executes the previous writer-compatibility validator from the exact baseline Git blob. Its accepted predecessor result remains `6 source / 6 rebindings / 88 historical inputs`. Historical reports and evidence are not edited.

## Verification

| Check                                     | Result     |
| ----------------------------------------- | ---------- |
| Capacity lifecycle                        | 55/55 PASS |
| Deploy workflow safety                    | 6/6 PASS   |
| Staging readiness                         | 49/49 PASS |
| Source closure                            | 45/45 PASS |
| Integrated closure                        | 25/25 PASS |
| Standard deploy handoff negative controls | 7/7 PASS   |
| `git diff --check`                        | PASS       |
| Staged files                              | 0          |

The handoff controls reject changed source bytes, missing or extra source files, wrong baseline or predecessor binding, report drift, unauthorized change metadata, and duplicate JSON keys. It also proves that the Capacity Lifecycle workflow invokes this successor validator and no longer invokes the superseded validator.

## Exact-Head CI Follow-up

The first PR #661 head `ce8f71b5ac91bdd2e674a811934e4feef72cc1f9` exposed one missed CI consumer: Capacity Lifecycle run `34871342950` called the superseded `verify-integrated-handoff.py` and failed closed. Build, lint/type-check, and unit-test checks on that head passed, but the candidate was not merged and no protection or deployment action was taken.

This follow-up changes only that CI consumer and binds the workflow byte into the successor manifest. The old validator remains immutable historical evidence; it is still executed by the successor against the exact baseline blob to verify the predecessor chain.

## Operational Boundary

The pending staging run created from the previous workflow is not modified, approved, rerun, or treated as evidence for this source. This gate does not authorize commit, push, PR, merge, protection relaxation, environment approval, deployment, image build, backup/restore, n8n activation, VPS access, or production changes.

## Independent Review Handoff

Review the exact nine-path package, verify the source manifest and report/evidence binding, confirm the CI consumer correction, rerun the focused contracts, and confirm that ordinary staging deployment no longer depends on W10-D recovery approval packets while all listed safety controls remain present.

Rekomendasi model untuk tindak lanjut
Task berikutnya: Independent exact-PR re-review atas head terbaru PR #661 dan paket literal sembilan path; merge/deployment tetap HOLD.
Model / effort: GPT-5.6 Terra (`gpt-5.6-terra`) / medium.
Alasan: delta terbatas pada satu consumer CI dan binding evidence dengan kontrak deterministik yang sudah lulus.
Syarat kualitas: sembilan blob harus cocok, seluruh exact-head CI hijau, dan predecessor chain tetap 96 historical inputs.
Eskalasi bila: muncul drift source, hash, atau semantik workflow baru -> GPT-5.6 Sol / high.
Sesi laporan ini: model/effort aktual tidak terverifikasi.
