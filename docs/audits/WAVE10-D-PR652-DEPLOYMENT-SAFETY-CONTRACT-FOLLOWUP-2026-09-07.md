# W10-D PR #652 deployment safety contract follow-up

Verdict: **SOURCE COMPLETE - CI AND INDEPENDENT EXACT-HEAD REVIEW REQUIRED - STAGING HOLD**.

Evidence cutoff: 2026-09-07 WIB. This report covers a narrow test-contract correction on PR #652. It does not authorize merge, staging, image publication, cleanup, commissioning, or production operations.

## Binding and scope

- Repository: `smk-darussalam-subah/smart-ai-school`.
- Worktree: `C:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school-w10d-staging-readiness-20260906`.
- Branch: `fix/w10d-staging-readiness-20260906`.
- Approved packaged parent/head before this follow-up: `f90592a21d2ac44fd881414195e348fd6869f4e2`.
- PR: `#652`, base at diagnosis `develop@dcfb81b2935d15de212a4e9ed0fce885f1d4a76b`.
- Failed CI: run `34058700761`; Lint & Type Check and Build Check succeeded, Unit Tests failed only on two stale assertions in `deploy-workflow-safety.spec.ts`. CI recorded 1,374 passing tests, 10 skipped, and 2 failed.
- Deployment workflow bytes are unchanged by this follow-up.

Only the deployment safety contract and this report are changed. No application behavior, workflow, dependency manifest, schema, Compose configuration, image, credential, provider, or runtime is changed.

## Consolidated finding and closure

### P1: deployment safety contract stale

Closed in the source candidate, pending CI and independent exact-head verification.

1. The immutable action list now requires exactly four pinned action invocations in order: two `actions/checkout` and two `appleboy/ssh-action`, each bound to the already reviewed 40-character commit.
2. Remote scripts are extracted independently by exact step name and deterministic YAML indentation. The helper requires exactly one matching step, exactly one `script: |` marker, and a 12-space script body. It introduces no YAML parser or dependency.
3. The security assertion rejects `${{ github.* }}` only inside each remote `script` body. Workflow `env` bindings such as `DIIS_EXPECTED_SHA: ${{ github.sha }}` remain explicitly required and are not misclassified as remote-shell interpolation.
4. Cross-boundary assertions prove the staging extraction contains the Python executor invocation but not the production branch assignment, while the production extraction has the inverse markers. This prevents a broad multi-step match from silently returning.

The workflow was not altered to satisfy an obsolete assertion. No security assertion was removed: immutable action pinning and remote-script interpolation rejection remain fail-closed and are more precisely scoped.

## Verification

Local dependencies were initially absent. The canonical checkout dependency tree was rejected as evidence because its lockfile differed. Exact dependencies were installed from this worktree's unchanged lockfile with `npm ci --ignore-scripts --no-audit --no-fund`; no package manifest or lockfile changed.

Focused command:

```text
npm test --workspace @smk/api -- --runTestsByPath src/__tests__/deploy-workflow-safety.spec.ts --runInBand --detectOpenHandles
```

Final result: **1 suite, 6/6 tests PASS**, 5.662 seconds reported. Targeted ESLint on the changed test passed. `git diff --check` passed.

The first focused attempt correctly exposed three strict TypeScript indexing errors in the new helper. Non-null assertions were then added only after the exact-count guards that prove the indices exist. The final focused run above passed.

An API-wide local type-check was attempted after the intentionally script-free install. It was not accepted as a valid result because internal workspace builds and Prisma generation were absent, producing broad missing-module/generated-client errors unrelated to this test delta. Full GitHub CI on the packaged commit is the required complete type/build/test evidence. No claim of local full type-check success is made.

## Literal follow-up manifest

| Path | SHA-256 |
| --- | --- |
| `apps/api/src/__tests__/deploy-workflow-safety.spec.ts` | `26ddcee7273af472b12e87f1ae509c60fa144bc5b0efa12a65ea4a37cc8225d9` |
| `docs/audits/WAVE10-D-PR652-DEPLOYMENT-SAFETY-CONTRACT-FOLLOWUP-2026-09-07.md` | supplied separately to avoid self-reference |

The preceding seven-file PR manifest remains unchanged except for the single test path above; this report becomes the ninth PR file. Historical untracked reports and SBOMs are preserved and excluded.

## Required next gate

Package exactly the two follow-up files into a new commit on the existing PR branch, verify cached diff/whitespace/secret scan, push to PR #652, and wait for all required CI. Stop without merge. After green CI, an independent reviewer must bind the new exact head/tree, nine-file PR delta, unchanged workflow bytes, focused proof, and every required CI result.

All DNS, registry/scanner, capacity/writer-preservation work remains a separate prerequisite lane under its own authority. Staging, cleanup, image publication, credentials, commissioning, backup/restore, scheduler changes, piloting, and production remain HOLD.

## Rekomendasi model untuk tindak lanjut

Task berikutnya: Independent Reviewer memeriksa exact head PR #652 setelah CI, khusus pada parser kontrak deployment, immutable action list, workflow-byte preservation, dan gate status.
Model / effort: GPT-5.6 Sol (`gpt-5.6-sol`) / high.
Alasan: review semantik keamanan deployment tetap penting, tetapi delta satu test mempunyai kontrak eksplisit dan focused evidence yang kuat.
Syarat kualitas: manifest PR tepat sembilan file, workflow hash tidak berubah, seluruh required CI hijau, dan ekstraksi kedua remote script tetap fail-closed.
Eskalasi bila: CI atau reproduksi menunjukkan ambiguity lintas-blok/pelemahan assertion -> GPT-5.6 Sol (`gpt-5.6-sol`) / xhigh.
Sesi laporan ini: model/effort aktual tidak terverifikasi.
