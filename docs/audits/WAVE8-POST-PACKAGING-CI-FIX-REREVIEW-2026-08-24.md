# Wave 8 Post-Packaging CI Fix - Independent Re-review

Date: 2026-08-24
Reviewed source head: `8f3e8ca166a74e5c3431253731e46b987abb0d31`
Develop merge: `13b970805b4292af1deb4e1290a61f2743453d99`

## Verdict

`FOLLOW-UP REQUIRED BEFORE DEVELOP TO STAGING PROMOTION`

The reviewed Wave 8 functionality remains valid, and PR #558 CI is green. However,
the CI-only amend introduced after source approval does not fix the actual root
cause. It creates a second production allowlist for stable identity roles while the
real defect is an incomplete and stale E2E mock of `@smk/auth`.

No staging, main, production, Git, or infrastructure mutation was performed by this
review.

## Finding

### P1-R09 - CI fix duplicates the identity-role authority and leaves E2E auth mocks false

`@smk/auth` already exports `PRIMARY_ROLES` and `PrimaryRoleSchema` with the approved
six stable identity roles. The E2E suites replace the entire package with local mock
objects. Those mocks omit `PrimaryRoleSchema`, and their local `PRIMARY_ROLES` arrays
still include `KEPALA_SEKOLAH`.

Instead of correcting the test doubles, the amend adds `ApiPrimaryRoleSchema` under
the API and changes provisioning plus Users DTOs to use it. Runtime behavior is
currently fail-closed, but the identity boundary now has two production sources of
truth and E2E still models the prohibited role incorrectly.

Evidence:

- `packages/auth/src/index.ts:20-30`
- `apps/api/src/common/dto/primary-role.dto.ts:1-10`
- `apps/api/src/provisioning/dto/provision.dto.ts:6-17`
- `apps/api/src/users/dto/list-users.dto.ts:1-7`
- `apps/api/src/users/dto/update-user.dto.ts:1-7`
- `apps/api/test/app.e2e-spec.ts:17-41`
- `apps/api/test/phase0.e2e-spec.ts:15-38`
- `apps/api/test/phase1.e2e-spec.ts:16-31`
- `apps/api/test/phase2.e2e-spec.ts:17-32`
- `apps/api/test/phase3.e2e-spec.ts:18-33`

Impact:

- future changes can update auth and API role lists independently;
- E2E tests can approve behavior where `KEPALA_SEKOLAH` is treated as a stable
  identity even though production policy forbids it;
- the green CI masks test-double drift rather than validating the real shared
  contract.

## Required Narrow Fix

1. Remove `apps/api/src/common/dto/primary-role.dto.ts`.
2. Restore provisioning, Users list, and Users role-update DTOs to consume
   `PrimaryRoleSchema` from `@smk/auth`.
3. Fix all five E2E auth mocks. Preferred: spread
   `jest.requireActual('@smk/auth')` and override only Keycloak/token functions.
   If a local mock is unavoidable, it must expose `PrimaryRoleSchema` and derive it
   from the exact six-role `PRIMARY_ROLES` list without `KEPALA_SEKOLAH`.
4. Add a regression assertion inside the E2E environment proving:
   - `PRIMARY_ROLES` equals the approved six-role list;
   - `PrimaryRoleSchema` accepts `GURU`;
   - `PrimaryRoleSchema` rejects `KEPALA_SEKOLAH` and position codes.
5. Run the affected E2E suites, Wave 8 focused tests, API type-check/build, and CI.

This is a same-wave post-packaging correction. It does not require a new Prompt
Architect pass. Because PR #558 is already merged, deliver it as a narrow follow-up
PR to `develop`; only then create the `develop -> staging` promotion PR.

## Gate

Hold staging promotion. Source/browser Wave 8 QA may proceed only after the shared
role contract is restored, the follow-up PR is merged, and the exact corrected SHA
is deployed to staging.

## Confidence

- Finding confidence: **99%**
- Wave 8 functional source confidence excluding this CI amend: **99%**
- Staging-promotion readiness: **HOLD**
