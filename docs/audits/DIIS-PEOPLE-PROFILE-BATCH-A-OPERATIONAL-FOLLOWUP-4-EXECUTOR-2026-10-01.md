# DIIS People Profile Batch A - Operational Follow-up 4 Executor

- Date: 2026-10-01
- Role: Executor
- Repository: `smk-darussalam-subah/smart-ai-school`
- Worktree: `C:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school-people-profile-batch-a-20260930`
- Branch: `feat/people-profile-batch-a-20260930`
- Base commit: `40aa671e0e283d7e499d5ab635c84ae3660a2adf`
- Independent re-review 3 SHA-256: `1e1a289e5ad1cb80968b5cea551bb4b1b3ddfe3a1583524b846d00c025ff67d7`
- Verdict: `READY FOR INDEPENDENT RE-REVIEW - GIT AND RUNTIME HOLD`

No commit, push, pull request, deployment, Keycloak mutation, staging access,
production access, or real-data mutation was performed.

## Scope

This follow-up closes only P2-R11. Four source paths changed relative to the
previous executor handoff:

1. `apps/api/src/users/users.service.ts`
2. `apps/api/src/__tests__/users.spec.ts`
3. `apps/api/src/__tests__/keycloak-admin.spec.ts`
4. `apps/api/src/__tests__/appointment-bk-capacity-postgres.spec.ts`

There is no schema, migration, endpoint, DTO, dependency, UI, or runtime change.

## P2-R11 Closure

`updateRole()` now budgets the cold-cache role replacement path as four bounded
Keycloak Admin operations:

1. Resolve the new realm role.
2. Assign the new realm role.
3. Resolve the old realm role.
4. Remove the old realm role.

Each operation permits one retry and uses the shared 10,000 ms per-attempt
deadline. The shared transaction calculator therefore produces:

```text
4 operations * (1 initial + 1 retry) * 10,000 ms + 15,000 ms margin
= 95,000 ms
```

The unchanged pre-transaction multi-role check is not counted in this budget;
it completes before the transaction and cannot expire transaction ownership.
Historical position roles skip removal, so the four-operation budget remains a
safe upper bound for that path.

## Permanent Evidence

- The UsersService test asserts `{ maxWait: 5_000, timeout: 95_000 }` for both
  successful role replacement and fail-soft Keycloak synchronization failure.
- The actual KeycloakAdminService cold-cache test replaces one stable role while
  forcing a 401 retry for every operation. It observes exactly eight admin-fetch
  attempts and five token fetches: one initial token plus one refresh for each of
  the four independently retried operations.
- A local disposable PostgreSQL database applied all 49 migrations and executed
  a scaled four-operation transaction. Four 90 ms external phases plus a final
  database query completed under the calculated 550 ms scaled budget, without
  `P2028`.
- All previous R09/R10 lifecycle interleaving proofs remain in the same suite.

## Verification

- Focused API: 5 suites, 181/181 tests passed.
- PostgreSQL disposable: 49 migrations, 12/12 tests passed.
- API type-check: PASS.
- API lint: PASS.
- API production build: PASS.
- Prettier on the four closure paths: PASS.
- `git diff --check`: PASS.
- Cached diff check: PASS.
- Staged files: 0.
- Disposable fixture residue: 0.
- Disposable container residue: 0.
- Web bytes did not change and Web verification was not repeated.

## Residual Risk and Non-Claims

- The 95-second budget is a worst-case upper bound, not an expected response time.
  Normal cached role changes should complete substantially earlier.
- PostgreSQL and Keycloak still do not form one atomic distributed transaction;
  the residual crash/ambiguous-network case documented in Follow-up 3 remains.
- R09 and R10 were not reopened by this change. Their exact tests continue to pass.
- Manual Keycloak console changes and direct SQL remain outside this contract.

## Canonical Manifest Algorithm

The 32 repository-relative source paths below are sorted with ordinal string
comparison. Each line is lowercase SHA-256, two spaces, then the path. The
aggregate is SHA-256 of the UTF-8 bytes of all lines joined by LF with one
trailing LF.

```text
f6c053fa532e2004fc4c4f7cc6b1157fb2183802cc6ccc836413a3a92969a734  apps/api/src/__tests__/appointment-bk-capacity-postgres.spec.ts
ed1e50ad3d9f8ecfef5fc21257fcfcd17f7e80f8287215e2af20501cc372cc48  apps/api/src/__tests__/keycloak-admin.spec.ts
8926d71c720a8dd31872db217eb8f2f54e5a0ad0cebdd7f3502b0150dbacbb8b  apps/api/src/__tests__/provisioning.spec.ts
11101740c439e95149ad02d52f7b7f6dbcbbf8715ec4d9046b4f5c4b4c70cf46  apps/api/src/__tests__/temp-password.spec.ts
2c73eabe448b201b1913b883962c8a77bf1b66ccecad7efb8895c49949b7b4b9  apps/api/src/__tests__/users.spec.ts
ec6bafefeb064b7a9fe12d65d847faf67471207c0947c2e383841c3871659eae  apps/api/src/common/helpers/iso-calendar-date.ts
e9fdc43920e1eaa3a9f950de7327e11e507ea97480f27866c233833c42bd5718  apps/api/src/common/helpers/temp-password.ts
696c0f69ae25b399c8b7c32b6d3df58a438e1af20f365bee95679711e7afdc9b  apps/api/src/keycloak-admin/keycloak-admin.constants.ts
05ace3c9d4bfc783ea6f393930b2cc00886fd3bd5d2e438a1498e7c760e8a944  apps/api/src/keycloak-admin/keycloak-admin.service.ts
9040a53ce1d65ba9a8e0edeef49bf4f25e488b4fd2c9f00bfe9cb7f8a0f25afa  apps/api/src/provisioning/dto/provision.dto.ts
598a347c165a58572155b286eb6f37d784c73e3a0450b289f413e6750b3f4d38  apps/api/src/provisioning/provisioning.service.ts
bb0b89f6fc1c0635359c3442f13431eea6f85e175552b016aa0070cc4cff8929  apps/api/src/users/user-mutation-coordination.ts
633df9de5e559a763e274d06ff6ebe937da9cd61ad739e23b06895ae9f2165d1  apps/api/src/users/users.controller.ts
d0ceca0d3cffeda0c60a68e99215574ab4f9121052584249e3e7fcfcc7e6614c  apps/api/src/users/users.service.ts
a38faf721fd28111b00d51b375edb4e1495f63e7fd6b7b1cb8705dbc4e37a5fa  apps/web/src/__tests__/appointment-governance-ui.test.ts
ddb17376003f4313444bad0b3d5a93ca5821719361e7a7cd4f7c8984d9187237  apps/web/src/__tests__/online-users-polling.test.ts
2ef956873e6904aaf72d3344dc3b78ec936459c1221bdfc981a3125d93575930  apps/web/src/__tests__/operational-import.test.ts
f7905703296486c54bd52bbd007a18907bf30a3b04a0004611fcb7e8f1126ede  apps/web/src/__tests__/users-archive.test.ts
314e428e301856edf40e8b6fdb6bca653f7d0190dc87b56b37d9f182aff989bc  apps/web/src/app/dashboard/audit/online-users/OnlineUsersClient.tsx
8c1e1f78b2f8b44515e582ae44a2dd106181b6d81b5f38d8e4d9fc16c872af87  apps/web/src/app/dashboard/audit/online-users/online-users-polling.ts
1b1f16bdee2bbefeda1261dfec2f05c9935943c16b81e01c2c7ed66439332418  apps/web/src/app/dashboard/audit/online-users/page.tsx
02dccbef7636d7c3268be2c4669cfd11646eace6cdb8bc471cf44008566c46ea  apps/web/src/app/dashboard/siswa/_components/StudentImportDialog.tsx
0096b7dae1faa24a6fe4ef05fff49ec3c7ec35f3004a517f0f4c2efd10b5591a  apps/web/src/app/dashboard/siswa/_components/student-import-csv.ts
fe81f08dd0e6b838e05aab976de7d5a70f8589b0a5eddad0e585ea6df0024a22  apps/web/src/app/dashboard/users/_components/AddUserDialog.tsx
d30b067884a63023e6d3b4a1f1c7291910eef176a981ff788e599e271360a505  apps/web/src/app/dashboard/users/_components/UsersClient.tsx
5bd944dd0b799b5bda2075e9a6d01e42b56d55aa62f86570fe13fd3f9ca049f4  apps/web/src/app/dashboard/users/_components/add-user-csv.ts
0c2e03de56b3371c394b8215c18ddf5cbd22a92b7b4d0abb1fb7af6614efe01b  apps/web/src/app/dashboard/users/_components/password-reset-policy.ts
7d758ae1012ffe4fa717065f4a87589a58b2f4b27e1631328316efb6e2497542  apps/web/src/app/dashboard/users/actions.ts
70b0dadd695e61ebee2e44406e31769466e192c34783be433dc1d162941e5569  apps/web/src/app/dashboard/users/page.tsx
17ebd854c8888317b5da7b78ccba07169b40393ab0b8153cbe1baa11417263b2  apps/web/src/components/ui/dialog.tsx
cbafac365d0d1034a505b9899aa9df3e52407ef8d70f1de4a14bd5f8220c311f  apps/web/src/lib/operational-import.ts
9efc22ea5a7d6228bf54ed9d38677f6f011ce55991c6950a54e2c792234b8406  packages/database/prisma/migrations/20260930000001_batch_a_operational_corrections/migration.sql
```

Aggregate SHA-256:
`ef86ea03e0c23e0bd6deefbfbdcaa00b9c32aee87e2b3da85b002541f1f33188`

## Independent Re-review Request

Review the exact 32-path manifest and aggregate above. Reproduce the 8-attempt,
5-token cold-cache contract; verify the role transaction budget is 95,000 ms;
and run the 49-migration PostgreSQL proof that includes the four-operation role
sync case. Git and runtime remain HOLD.

## Rekomendasi model untuk tindak lanjut

Task berikutnya: Independent Reviewer melakukan exact-manifest re-review terbatas
pada P2-R11 sambil memastikan R09/R10 tetap tertutup; Git/runtime tetap HOLD.
Model / effort: GPT-5.6 Sol (`gpt-5.6-sol`) / high.
Alasan: perubahan kecil tetapi menyentuh budget transaksi autentikasi; kontrak 8-attempt dan proof PostgreSQL 12/12 sudah tersedia.
Syarat kualitas: reproduksi empat operasi cold-cache, budget 95 detik, dan query pascafase tanpa `P2028`.
Eskalasi bila: ditemukan operasi Keycloak kelima dalam transaksi atau ambiguity eksternal baru -> GPT-5.6 Sol (`gpt-5.6-sol`) / xhigh.
Sesi laporan ini: model/effort aktual tidak terverifikasi.
