# Wave 8 Cross-Phase Operational Trust - Remediation Report

Tanggal: 2026-08-22
Worktree: `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school-wave8-operational-trust-20260822`
Branch: `fix/wave8-cross-phase-operational-trust-20260822`
Status eksekutor: Source follow-up complete after independent review findings, automated gates pass, browser QA remains staging-only after reviewed SHA deployment.
Gate: Stop at independent Reviewer gate. No commit, push, PR, merge, deploy, staging mutation, production mutation, schema migration, dependency, infrastructure, Keycloak, or secret change.

## Baseline and Preflight

| Item | Evidence |
|---|---|
| `origin/develop` | `557340dabdd4c21881939159ca4143bde8056a9b` |
| `origin/staging` | `1f905819f31766fd2db6524435e723c13a9c74d3` |
| `origin/main` | `221564eb86f0bc4bbe0040a43d3e2555de151551` |
| Worktree HEAD | `557340dabdd4c21881939159ca4143bde8056a9b` |
| Product tree develop/staging/main/HEAD | all `fe095cd139220d25d5f8ecb84a0464ae2bb529e9` before uncommitted Wave 8 edits |
| Open PRs | `[]` |
| Classic branch protection | develop 1 approval, staging 1 approval, main 1 approval |
| Rulesets | `Protect Staging` active, `Protect main` active |
| Dependency/package/schema/infra diff | empty for `package.json`, `package-lock.json`, app package manifests, Prisma schema, `infrastructure`, `.github` |
| Staged changes | none |

Subagent guardrail sync: Backend/Auth and Frontend/UX agents were explicitly kept read-only and reminded of Wave 8 baseline, no schema/dependency/infrastructure/Keycloak/secret changes, no commit/push/PR/deploy, and no production or shared-staging mutation. Executor retained integrated edit ownership.

## W8 Revalidation

| Finding | Result | Source evidence |
|---|---|---|
| W8-01 primary pages mask load failure | Closed in touched residuals. Kalender, Jadwal, and Presensi Guru distinguish empty data from access/server/network/period failures. | `apps/web/src/lib/api.ts`, `apps/web/src/app/dashboard/kalender/page.tsx`, `apps/web/src/app/dashboard/jadwal/page.tsx`, `apps/web/src/app/dashboard/presensi-guru/page.tsx` |
| W8-02 confirmation and action error UX | Closed for residuals. Native confirm/alert/prompt removed from production web source. Calendar, AI Chat, and unanswered assessment use `ConfirmDialog`; Rapor Wali save error remains inline. | `apps/web/src/components/ui/confirm-dialog.tsx`, `KalenderClient.tsx`, `AiClient.tsx`, `TaskDetailModal.tsx`, `RaporWaliKelas.tsx` |
| W8-03 DTO/policy validation | Closed at source for calendar, KKTP, major/profile URL, teaching assignment year, schedule list, and auto-schedule query. | API DTO/service files listed in manifest |
| W8-04 legacy student create | Closed at source. `SiswaFormDialog` is edit-only, no raw Keycloak UUID field, no mini-create class, no `createSiswa`/`createKelas` action path. Official create paths remain PPDB accepted lead, single provisioning wizard, and bulk import. | `SiswaForm.tsx`, `siswa-form-state.ts`, `actions.ts` |
| W8-05 Users truncation and authority mismatch | Closed at source. `/dashboard/users` uses paginated `/users` with URL-backed search/role/status/page; SA-only role/permission controls; active toggle follows effective `user.manage`. | `apps/web/src/app/dashboard/users/page.tsx`, `UsersClient.tsx` |
| W8-06 auto-schedule period isolation | Closed at source. Query uses bounded Zod DTO; target academic year must exist; preview uses exact target year/semester occupancy and deterministic ordering; inactive class/teacher assignments are excluded. | `schedule.controller.ts`, `schedule.service.ts`, `list-schedule.dto.ts` |
| W8-07 error taxonomy | Closed at helper/source level. `apiFetch()` remains backward-compatible; new `apiFetchResult<T>()` distinguishes success, forbidden, notFound, unavailable, requestError, malformed JSON, network failure, and 401 redirect passthrough. | `apps/web/src/lib/api.ts`, `wave8-operational-trust-ui.test.ts` |

## Independent Source Review Follow-up

Reviewer report: `docs/audits/WAVE8-CROSS-PHASE-OPERATIONAL-TRUST-SOURCE-REVIEW-2026-08-22.md`.

| Reviewer finding | Closure |
|---|---|
| P1 Users UI offered `KEPALA_SEKOLAH` as identity role | Closed. Users role filter and role-change dropdown now use `USER_IDENTITY_ROLE_OPTIONS`, exactly six primary identity roles. `KEPALA_SEKOLAH` remains displayable only as a legacy label, not selectable. `/users?role=` DTO now accepts the API six-role identity schema only, so manual `role=KEPALA_SEKOLAH` is rejected before service filtering. |
| P1 Calendar fetched all agenda under active-year label | Closed. Page resolves active academic year first. If active year succeeds, calendar is fetched with exact `academicYearId`. If active-year status fails or no active year exists, the page does not call `/school/calendar` and renders an empty read-only setup/error state, preventing mixed cross-year data. A two-year behavioral helper test proves each valid active year gets its own scoped query and failure states never produce an unscoped query. |
| P1 Period-status failure left delete active | Closed. `canMutateCalendar()` gates add, edit, submit, and delete together. Delete button is disabled and the confirm path also returns an explicit error if mutation is not allowed. |
| P1 Empty 2xx response accepted as `data=null` | Closed. `apiFetchResult()` now treats empty 2xx body as `unavailable` with `Respons server tidak valid. Coba lagi.` Valid empty JSON arrays remain valid success payloads. |
| P2 Major code race returned 500 | Closed. `createMajor()` maps Prisma `P2002` to `ConflictException`, matching update semantics. |
| P2 Users search navigated on every character | Closed. Users search now keeps local input state and applies URL navigation with an explicit 350 ms debounce budget. |
| P2 Auto-schedule preview stale during cutover | Closed. `autoGenerate()` now holds the writable-period/cutover lock inside one transaction while validating year, reading teaching assignments, and reading occupancy schedules for the preview. |
| P2 Calendar empty state told users to click a locked button | Closed. Empty-state copy is now conditional. It only says `Klik Tambah Agenda` when add is enabled; locked setup/error states show read-only explanatory copy. Behavioral helper coverage verifies both states. |

## Changed File Manifest

### API

- `apps/api/src/__tests__/school-config.spec.ts`
- `apps/api/src/__tests__/schedule.spec.ts`
- `apps/api/src/__tests__/wave8-operational-trust.spec.ts`
- `apps/api/src/auth/auth.service.ts`
- `apps/api/src/auth/dto/update-me.dto.ts`
- `apps/api/src/common/dto/academic-period.dto.ts`
- `apps/api/src/common/dto/primary-role.dto.ts`
- `apps/api/src/kktp-config/dto/kktp-config.dto.ts`
- `apps/api/src/kktp-config/kktp-config.controller.ts`
- `apps/api/src/provisioning/dto/provision.dto.ts`
- `apps/api/src/schedule/dto/list-schedule.dto.ts`
- `apps/api/src/schedule/schedule.controller.ts`
- `apps/api/src/schedule/schedule.service.ts`
- `apps/api/src/school-config/dto/calendar-event.dto.ts`
- `apps/api/src/school-config/dto/major.dto.ts`
- `apps/api/src/school-config/dto/update-profile.dto.ts`
- `apps/api/src/school-config/school-config.controller.ts`
- `apps/api/src/school-config/school-config.service.ts`
- `apps/api/src/teaching-assignment/dto/list-assignments.dto.ts`
- `apps/api/src/users/dto/update-user.dto.ts`
- `apps/api/src/users/dto/list-users.dto.ts`

### Web

- `apps/web/src/__tests__/siswa-form-state.test.ts`
- `apps/web/src/__tests__/wave8-operational-trust-ui.test.ts`
- `apps/web/src/app/dashboard/ai/_components/AiClient.tsx`
- `apps/web/src/app/dashboard/akademik/_components/guru/RaporWaliKelas.tsx`
- `apps/web/src/app/dashboard/akademik/_components/siswa/TaskDetailModal.tsx`
- `apps/web/src/app/dashboard/jadwal/page.tsx`
- `apps/web/src/app/dashboard/kalender/_components/KalenderClient.tsx`
- `apps/web/src/app/dashboard/kalender/kalender-ui.ts`
- `apps/web/src/app/dashboard/kalender/page.tsx`
- `apps/web/src/app/dashboard/presensi-guru/_components/PresensiGuru.tsx`
- `apps/web/src/app/dashboard/presensi-guru/page.tsx`
- `apps/web/src/app/dashboard/siswa/_components/SiswaForm.tsx`
- `apps/web/src/app/dashboard/siswa/_components/siswa-form-state.ts`
- `apps/web/src/app/dashboard/siswa/actions.ts`
- `apps/web/src/app/dashboard/users/_components/UsersClient.tsx`
- `apps/web/src/app/dashboard/users/page.tsx`
- `apps/web/src/app/dashboard/users/users-ui.ts`
- `apps/web/src/components/ui/confirm-dialog.tsx`
- `apps/web/src/lib/api.ts`

### Documentation

- `docs/audits/WAVE8-CROSS-PHASE-OPERATIONAL-TRUST-REMEDIATION-2026-08-22.md`

## Error-State and Resource Matrix

| Surface | Primary resource | Secondary resource | Failure behavior |
|---|---|---|---|
| Kalender | Active academic year, then scoped calendar collection | Calendar data scoped by active `academicYearId` | Calendar fetch is attempted only after active-year success. Scoped calendar failure shows load error. Empty scoped success remains empty state. Active-year 404/unavailable/request error skips calendar fetch entirely and renders locked setup/error state without cross-year agenda data. |
| Jadwal | Active semester, academic years, schedule list | Teaching assignment/class options | No active period shows setup state. Active/academic-year failures block page truthfully. Schedule failure is primary error. Options failure warns without hiding schedule data. |
| Presensi Guru | Today status for teacher action, history/list | none | Teacher today failure disables check-in/out but can keep history visible. History failure does not erase valid today status. Staff list failure is primary. Empty history remains empty. |
| Users | Paginated user list | Permission catalog/overrides/effective permissions | User list is server-driven. Permission panel has separate catalog and override/effective error states. Fast user switching uses request sequence guard. |

## Authority and Pagination Matrix

| Area | Super Admin | Tata Usaha | Other roles |
|---|---|---|---|
| Users list | Can view paginated list, search, role/status filters | Can view paginated list, search, role/status filters | Follows existing page authority |
| Role change | Visible and actionable only for SA; choices are exactly six primary identity roles | Hidden | Hidden |
| Permission overrides/effective detail | Visible and actionable only for SA | Hidden | Hidden |
| Active toggle | Visible for effective `user.manage` and backend role gate | Visible only when backend policy allows | Hidden or backend denied |
| Users pagination | `/users?limit=20&page=...&role&search&isActive`, search debounced 350 ms | same | no grouped 50-row cap |

## Validation Contract Matrix

| Area | Contract |
|---|---|
| Calendar create/list/update | strict Zod, exact event enum, UUID academic year, trimmed bounded text, `endDate >= startDate`, existing academic year, final range inside academic year, P2025 to 404; web list fetch requires exact active-year `academicYearId` and has no unscoped fallback |
| KKTP | shared `YYYY/YYYY` academic-year regex, semester 1/2, trimmed bounded subject, strict keys, remove params validated before service |
| Major | code trim/uppercase, pattern limited to alphanumeric/underscore/hyphen, case-insensitive duplicate check before write, description bounded |
| Profile URLs | website and logo URL must be absolute http/https, no credentials, empty string normalized to null |
| Me avatar | absolute http/https only, no credentials, empty string normalized to null |
| TeachingAssignment/Schedule list | shared academic-year regex; invalid filters fail validation instead of returning false-empty |
| Users list | role filter is the API six-role identity schema; appointment codes such as `KEPALA_SEKOLAH` and `WAKA_KURIKULUM` are rejected |
| Auto-schedule | academic year regex, semester 1/2, bounded days/jp/maxJpGuru, exact target period, assignment/occupancy reads under cutover lock, no DB write for preview |

## Native Dialog Closure Evidence

Static command:

```text
rg -n "window\.(confirm|alert|prompt)|\b(confirm|alert|prompt)\(" apps/web/src --glob '!**/*.test.*' --glob '!**/__tests__/**'
```

Result: no production web source matches.

Replacements:

- Calendar delete: `ConfirmDialog`, event name/date, destructive flow, inline error, refresh only after success.
- AI Chat delete: `ConfirmDialog`, target title, local active session cleanup only on successful delete.
- Student assessment unanswered submit: `ConfirmDialog`, unanswered count, no submit before confirmation.
- Rapor Wali note save: inline `role=alert`, form text preserved.

## Automated Verification

| Check | Result |
|---|---|
| API focused | `wave8-operational-trust.spec.ts`, `school-config.spec.ts`, `schedule.spec.ts`, `users.spec.ts`: 4 suites / 120 tests pass |
| Web focused | `wave8-operational-trust-ui.test.ts`, `siswa-form-state.test.ts`: 2 suites / 15 tests pass |
| Full API tests | 63 suites / 1270 tests pass |
| Full web tests | 38 suites / 245 tests pass |
| API type-check | pass |
| Web type-check | pass |
| Database type-check | pass |
| Types type-check | pass |
| API lint | pass |
| Web lint | pass, existing Next lint deprecation/plugin warning only |
| API build | pass |
| Web build | pass, 40 app routes generated |
| Prisma validate | pass with validation-only `DATABASE_URL=postgresql://diis:diis@localhost:5432/diis_validate` |
| Dependency/schema/infra diff | empty |
| `git diff --check` | pass |

Setup note: this worktree had no local `node_modules`. A local `npm ci --ignore-scripts` was run to create verification-only dependencies, then `@smk/database db:generate`, `@smk/types build`, `@smk/auth build`, and `@smk/logger build` were run for local type/test resolution. No package manifest or lockfile changed. `npm audit` reported existing dependency vulnerabilities after install; no `npm audit fix` was run because dependency changes are out of Wave 8 scope.

## Browser QA Gate

Status: Not executed in this source follow-up and not claimed as pass.

The independent reviewer stated browser QA can remain a staging-only gate after source re-review. Therefore this follow-up does not claim desktop/mobile dashboard browser evidence. Required post-deploy staging QA remains:

- Users UI role filter/change choices exclude appointment codes.
- Calendar active-year success requests only target-year agenda.
- Calendar no-active/failure state does not fetch unscoped agenda and keeps all add/edit/delete actions disabled.
- Users search does not navigate on every keystroke.
- Auto-schedule preview is exercised during controlled semester cutover/closure scenario.

## Security, Privacy, and Accessibility Review

- No schema, migration, dependency, infrastructure, Keycloak, secret, staging, or production change.
- `apiFetchResult` does not expose raw token, URL, stack trace, or upstream body on failure.
- Unsafe `javascript:`, `data:`, `file:`, and credential-bearing profile/avatar URLs are rejected server-side.
- Users authority controls now hide SA-only actions from TU instead of offering deterministic 403 actions.
- Permission panel request sequence prevents stale permission data from a previously selected user.
- Data Siswa edit dialog no longer exposes Keycloak UUID entry or legacy create path.
- ConfirmDialog supports inline error and duplicate confirm guard.
- Browser accessibility/responsive evidence is not available due local stack blocker; source changes use existing shadcn/Radix/Lucide patterns and focusable semantic controls.

## Residuals

| Severity | Item | Reason |
|---|---|---|
| Gate | Staging browser QA not executed in source follow-up | Reviewer explicitly allowed browser QA to remain staging-only after source re-review. |
| P3 | Existing npm audit vulnerabilities | Existing dependency tree issue surfaced by local install; no dependency changes allowed in Wave 8. |

No known source P0/P1/P2 remains from the executor's review. Runtime/browser evidence remains a separate post-deploy gate.

## Readiness

| Dimension | Score | Reason |
|---|---:|---|
| Source readiness | 98% | Seven reviewer findings are closed in source, automated tests/type/lint/build pass, no schema/dependency/infra drift, and follow-up tests cover the new contracts. |
| E2E readiness | Hold | Browser QA is intentionally left for staging-only after reviewed SHA deployment. |
| Git packaging readiness | Hold for reviewer | Source can be sent to independent Reviewer. Explicit Git packaging still requires reviewer approval. |

## Reviewer Request

Please re-review source diff and automated evidence. Specific reviewer focus:

1. Confirm Users role options and `/users` query filter now use only six primary identity roles.
2. Confirm Calendar active-year fetch/filter has no unscoped fallback and read-only mutation lock closes the false-label/delete-active gap.
3. Confirm `apiFetchResult` fails closed on empty 2xx while preserving valid empty JSON arrays.
4. Confirm `createMajor` maps race `P2002` to 409.
5. Confirm auto-schedule period isolation keeps assignment and occupancy reads under the cutover lock and still performs no DB write.
6. Confirm browser QA remains a staging-only gate after source approval.
