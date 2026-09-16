# W10-D D2 Artifact Binding Follow-up Executor Report

Date: 2026-09-16

Status: `SOURCE COMPLETE - INDEPENDENT REVIEW REQUIRED - D2 BUILD RETRY HOLD`

## Binding

- Branch: `fix/w10d-d2-artifact-binding-20260916`
- Baseline develop SHA: `10c8b6124d5abada746282859ab451a938cf2430`
- Baseline tree: `97e2583025dfaf9888fabafdc2d7bd893c0bf84e`
- Failed build run: `35057548378`, attempt `1`
- Failed build job: `104670767142`
- Publish job: `104670767983`, skipped with zero steps
- Failed run was not rerun. Its bootstrap tag was not deleted or recreated.

## Root Cause

The build, smoke test, SBOM generation, Grype database update, vulnerability scan,
scanner inventory, and image save all completed before the old validator emitted
`ARTIFACT_BINDING_STOP`.

The failure was reproduced against the pinned tools. Grype `0.118.0` reports the
portable image config digest at `source.target.imageID`. Syft `1.51.1` reports the
same digest at `source.metadata.imageID`, while the old validator required Syft's
now-absent `source.target.imageID`. The image and scan were consistent; the schema
location assumption was stale.

## Source Fix

1. `backup-image-artifact.py` now reads `imageID` from the two supported schema
   locations and requires every present identity to be one valid, identical
   lowercase SHA-256 digest.
2. Missing, malformed, conflicting, and cross-image identities remain rejected.
3. The focused contract covers the real Syft metadata shape and the historical
   target shape.
4. The D2 build workflow runs the focused contract before downloading scanners or
   spending time on build and scan work.

No backup, n8n, publication, registry, credential, runtime, staging, or production
behavior was changed.

## Literal Source Manifest

| SHA-256 | Path |
| --- | --- |
| `039882e395434c1148726ef047714e0d7f6a5ce26b598df5566c087d55131b39` | `.github/workflows/backup-image.yml` |
| `8c7ac5454ba68036b86a2635d4fa2b6ee630a1ad04cf081a34d87d2f11c496c6` | `infrastructure/deploy/backup-image-artifact.py` |
| `3b30be2cc38e301b0d1f7aa92834ea4e8f24f0e7c24b2d154f1b2ef6bad41561` | `infrastructure/deploy/tests/backup-image-artifact-contract.py` |

Aggregate SHA-256: `0b58edfa16aeda81a8ad3ade7c67f76892ec1e8e1f3826920e158ba64df3ec96`

## Verification

- Focused artifact contract: `3/3 PASS`.
- Source closure: `45/45 PASS`.
- Integrated closure: `25/25 PASS`.
- Workflow-shaped local diagnostic bundle using Syft `1.51.1` and Grype
  `0.118.0`: bind `PASS` with seven bound files.
- Portable image ID, Syft image ID, and Grype image ID were identical:
  `sha256:efd6c9d3df17a46b92a2bf84fa796906071e848bbd6bd402911a09c485794b86`.
- Diagnostic bundle contained `361` SBOM artifacts and `160` Grype matches.
- The diagnostic image was local and disposable. It was not a publication
  candidate and was not pushed.
- Temporary images and directories from the diagnostic run were removed.

Full API/Web suites were not repeated because the changed surface is limited to a
Python artifact validator, its focused contract, and the build-only workflow.

## Operational Boundary

No commit, push, PR, merge, tag mutation, workflow retry, artifact upload,
publication, deployment, credential access, backup/restore, n8n activation, VPS
access, staging mutation, or production mutation was performed.

The next gate is an independent source review of the five-path package: the three
source paths above, this report, and
`W10D-D2-ARTIFACT-BINDING-FOLLOWUP-EVIDENCE-2026-09-16.json`. A new build requires
new exact-SHA approval after review; run `35057548378` must not be rerun.

## Model Recommendation

Recommended next task: independent source review using GPT-5.6 Sol with high
reasoning, because the review covers supply-chain identity binding and fail-closed
negative controls. This is a recommendation only; the current session model is not
claimed.
