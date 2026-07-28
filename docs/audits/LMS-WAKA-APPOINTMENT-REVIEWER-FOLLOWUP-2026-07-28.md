# LMS WAKA Appointment Reviewer Follow-up

Tanggal: 2026-07-28
Peran: Codex Executor
Target: Follow-up residual reviewer setelah PR #389/#399, scope LMS reviewer access.

## Context

Reviewer mencatat bahwa PR #389 final hanya menutup draft-ID continuity. Dukungan reviewer WAKA_KURIKULUM pada LMS belum selesai dan tidak boleh memakai role jabatan historis dari JWT.

Appointment Governance sudah menetapkan:

- stable identity role tetap dari Keycloak;
- position code seperti WAKA_KURIKULUM berasal dari active Appointment DIIS;
- RolesGuard dapat menambahkan active position code ke request user jika endpoint memang mendeklarasikan position code tersebut;
- PermissionGuard tetap fail-closed dan berjalan sebelum RolesGuard.

## Changes

File produk:

- `apps/api/src/lms/lms.controller.ts`
  - Menambahkan `WAKA_KURIKULUM` pada endpoint baca/reviewer:
    - `GET /lms/modules`
    - `GET /lms/modules/:id`
    - `GET /lms/modules/:id/progress`
  - Write path tetap tidak berubah:
    - create/update/publish/unpublish/archive tetap `GURU`;
    - delete tetap `SUPER_ADMIN` atau `GURU`;
    - progress update tetap `SISWA`.

- `apps/api/src/lms/lms.service.ts`
  - `WAKA_KURIKULUM` yang sudah diperkaya oleh RolesGuard diperlakukan sebagai reviewer untuk read/monitor path.
  - GURU biasa tetap ownership-scoped.
  - SISWA tetap hanya melihat modul published yang visible untuk kelasnya.

Test:

- `apps/api/src/__tests__/lms.spec.ts`
  - Membuktikan metadata controller meminta `WAKA_KURIKULUM` pada reviewer read path.
  - Membuktikan WAKA hasil active Appointment dapat melihat list/progress lintas guru.
  - Membuktikan write path tidak membuka mutasi luas untuk WAKA.
  - Menjaga test existing GURU non-owner dan SISWA visibility tetap lulus.

## Verification

Local commands:

```text
npm.cmd --workspace @smk/api run test -- --runTestsByPath src/__tests__/lms.spec.ts src/__tests__/roles.spec.ts src/__tests__/permissions.spec.ts --runInBand --cacheDirectory=.tmp/jest-cache-lms-waka-api
```

Result: 3 suites / 71 tests pass.

```text
npm.cmd --workspace @smk/api run type-check
```

Result: pass.

```text
npm.cmd --workspace @smk/api run lint
```

Result: pass.

```text
git diff --check
```

Result: pass.

## Residual Notes

- Browser QA untuk draft-ID was reported complete by operator before this follow-up.
- This follow-up does not enable production appointment timer.
- This follow-up does not add a new PositionPermission mapping for WAKA_KURIKULUM -> `lms.read`. Current intended WAKA operator model remains stable `GURU` plus active `WAKA_KURIKULUM` Appointment, so `lms.read` is already supplied by stable GURU permission and the position code supplies reviewer authority through RolesGuard.
- If school policy later allows WAKA_KURIKULUM for stable non-GURU accounts, that must be a separate permission-catalog decision and migration.

## Gate Recommendation

Ready for explicit Git packaging and PR to `develop`, then normal CI/review. Staging promotion should follow the existing Gitflow after CI is green and reviewer accepts the scope.
