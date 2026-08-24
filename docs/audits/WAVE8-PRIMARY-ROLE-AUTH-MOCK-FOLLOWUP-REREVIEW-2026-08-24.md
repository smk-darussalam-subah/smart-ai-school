# Wave 8 Primary Role Auth Mock Follow-up - Independent Re-review

Date: 2026-08-24
PR: `#559`
Reviewed head: `65c8491c7119fdd67d2239f296fb0d8512981918`

## Verdict

`APPROVED FOR PR #559 MERGE TO DEVELOP`

P1-R09 is closed. After PR #559 is merged and `origin/develop` contains the exact
reviewed head, Wave 8 may proceed to a separate `develop -> staging` promotion PR and
staging-only browser QA. This verdict does not authorize main or production.

## Findings

No unresolved P0, P1, or P2 finding in the PR #559 delta.

## Closure Evidence

- `ApiPrimaryRoleSchema` and its duplicate DTO file are removed.
- Users list, Users role update, and provisioning consume
  `PrimaryRoleSchema` from canonical `@smk/auth`.
- The only tracked API E2E suite uses `jest.requireActual('@smk/auth')`; canonical
  schemas and role utilities remain real while token extraction/verification and the
  existing isolated `hasRole` helper remain mocked.
- The KS fixture has stable role `GURU`; active `KEPALA_SEKOLAH` authority is supplied
  through the appointment-position resolver mock.
- The E2E contract asserts the exact six primary roles and rejects
  `KEPALA_SEKOLAH` as a primary identity role.
- The other local `phase*.e2e-spec.ts` files observed in an older worktree are
  untracked historical artifacts, not repository or CI inputs.

## Independent Verification

- API focused: 4 suites / 120 tests pass.
- Worktree at reviewed head: clean before this reviewer report was created.
- `git diff --check`: pass.
- Executor-reported GitHub CI: Build, Lint & Type Check, and Unit Tests pass.

## Next Gate

1. Optionally package this reviewer report explicitly into PR #559 and rerun CI; do
   not use broad staging.
2. Merge PR #559 through the normal protected-branch process.
3. Verify `origin/develop` contains reviewed head
   `65c8491c7119fdd67d2239f296fb0d8512981918`.
4. Create a fresh promotion branch from updated `origin/develop` to `staging`.
5. Deploy and run Wave 8 authenticated browser QA against the exact deployed SHA,
   following the saved staging auth/fixture/cleanup protocol.

## Confidence

- Review confidence: **99%**
- PR #559 merge readiness: **99%**
- Production readiness: not assessed by this source re-review
