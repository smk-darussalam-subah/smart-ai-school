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

The byte-exact successor validator is retained as a dedicated packaging gate. Shared CI invokes only its semantic contract, so later PRs may add unrelated paths without inheriting this package's fixed nine-path workspace constraint.

## Baseline

| Field                   | Value                                                              |
| ----------------------- | ------------------------------------------------------------------ |
| Branch                  | `fix/restore-standard-deploy-workflow-20260914`                    |
| Develop SHA             | `715121657e3d432f9c7cda82aa8cfefe7b32c199`                         |
| Develop tree            | `f6eb45f7f19eaca55b9294bac8a3d4652c54bd8f`                         |
| Source files            | 7                                                                  |
| Package paths           | 9                                                                  |
| Source manifest SHA-256 | `eb78236c21062a0bc973d683273702be214a2bbe2b0789f23d13382ae2fe9a0f` |

## Source Manifest

| Path                                                              | SHA-256                                                            |
| ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| `.github/workflows/capacity-lifecycle.yml`                        | `fd574b271cca3332cf4247067cc388afa2a17e307311a9d134d6e850d6aea329` |
| `.github/workflows/ci.yml`                                        | `ab71aca11e681fa180842064caf2f81053e45ae1e46d88532c6b1740f6b4ed3c` |
| `.github/workflows/deploy.yml`                                    | `5389912793eff111b556faa4dfad63cbd4584248c89cf05bb168a9595290274a` |
| `apps/api/src/__tests__/deploy-workflow-safety.spec.ts`           | `3d2f0569c2911f4ef3b477141d22c8d490b836543da9cfd47bc1681158c232ed` |
| `infrastructure/deploy/tests/staging-readiness-contract.py`       | `3d791affdda29ff79aab12c3dfcdc108575ccd3001ed4deed9de16819c231b75` |
| `infrastructure/deploy/tests/standard-deploy-handoff-contract.py` | `dedb417e9de2f1a6b8e1874be1d076fde31e6f8da6f912427419aa546d772300` |
| `infrastructure/deploy/verify-standard-deploy-handoff.py`         | `848fe9f4573a3156608f5dc5a3d6d4109f6ce917dca2021b4081190fd185fb47` |

The successor validator executes the previous writer-compatibility validator from the exact baseline Git blob. Its accepted predecessor result remains `6 source / 6 rebindings / 88 historical inputs`. Historical reports and evidence are not edited.

## Verification

| Check                                     | Result     |
| ----------------------------------------- | ---------- |
| Capacity lifecycle                        | 55/55 PASS |
| Deploy workflow safety                    | 6/6 PASS   |
| Staging readiness                         | 49/49 PASS |
| Source closure                            | 45/45 PASS |
| Integrated closure                        | 25/25 PASS |
| Standard deploy handoff negative controls | 8/8 PASS   |
| `git diff --check`                        | PASS       |
| Staged files                              | 0          |

The handoff controls reject changed source bytes, missing or extra source files, wrong baseline or predecessor binding, report drift, unauthorized change metadata, and duplicate JSON keys. They also prove that both shared workflows invoke the semantic contract without invoking the byte-exact validator, an unrelated future path remains acceptable to the semantic contract, and the dedicated packaging validator still rejects that extra path.

## Exact-Head CI Follow-up

The first PR #661 head `ce8f71b5ac91bdd2e674a811934e4feef72cc1f9` exposed one missed CI consumer: Capacity Lifecycle run `34871342950` called the superseded `verify-integrated-handoff.py` and failed closed. Build, lint/type-check, and unit-test checks on that head passed, but the candidate was not merged and no protection or deployment action was taken.

The first follow-up bound that CI consumer into the successor manifest. Independent review then identified that invoking a fixed historical workspace validator from shared CI would reject every later PR containing an additional path. The final follow-up separates reusable package semantics from exact workspace admission: shared CI runs `standard-deploy-handoff-contract.py`, while direct execution of `verify-standard-deploy-handoff.py` remains the strict nine-path packaging check. The old validator remains immutable historical evidence and is still executed by the successor against the exact baseline blob to verify the predecessor chain.

## Operational Boundary

The pending staging run created from the previous workflow is not modified, approved, rerun, or treated as evidence for this source. This gate does not authorize commit, push, PR, merge, protection relaxation, environment approval, deployment, image build, backup/restore, n8n activation, VPS access, or production changes.

## Independent Review Handoff

Review the exact nine-path package, verify the source manifest and report/evidence binding, confirm the CI consumer correction, rerun the focused contracts, and confirm that ordinary staging deployment no longer depends on W10-D recovery approval packets while all listed safety controls remain present.

Rekomendasi model untuk tindak lanjut
Task berikutnya: Independent exact-PR re-review atas head terbaru PR #661 dan pemisahan semantic CI dari exact packaging; merge/deployment tetap HOLD.
Model / effort: GPT-5.6 Sol (`gpt-5.6-sol`) / high.
Alasan: review harus memastikan integritas supply-chain tetap ketat tanpa kembali mengunci availability CI PR berikutnya.
Syarat kualitas: 9/9 blob dan seluruh exact-head CI cocok, unrelated-path regression lulus, dan direct exact validator tetap fail-closed.
Eskalasi bila: muncul benturan baru antara workspace admission dan shared CI -> GPT-6 Astra / high.
Sesi laporan ini: model/effort aktual tidak terverifikasi.
