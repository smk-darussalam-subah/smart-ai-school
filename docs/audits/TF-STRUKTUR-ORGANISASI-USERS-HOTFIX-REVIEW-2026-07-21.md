# TF Struktur Organisasi & Users Hotfix — Reviewer Re-Review

Date: 2026-07-21
Role: Codex Reviewer / workflow and code auditor
Scope: Independent re-review of executor's TF Hotfix documented in `TF-STRUKTUR-ORGANISASI-USERS-HOTFIX-REMEDIATION-2026-07-21.md` on branch `fix/tf-struktur-organisasi-users-hotfix` (HEAD `cf9cbc8` + uncommitted working tree).
This review made no product-code, schema, dependency, infrastructure, commit, push, PR, or deploy change.

## Verdict

`COMPLETE - READY FOR GIT GATE (DEVELOP)`
`NOT A STAGING ACCEPTANCE SIGN-OFF`

All four in-scope findings (TF-1, TF-2, TF-3, TF-4) are closed in code. Focused tests, type-check, lint, API build, and web build were independently reproduced by the reviewer and match — or improve on — the executor's claims. Working tree is exactly the 4 claimed modified files; no scope creep.

The TF-4 architectural refactor (KC-first → DB-first + best-effort KC sync) is the correct pattern, mirrors the proven `positions.service.ts:228-237, 293-303` fail-soft approach, and closes the most severe reliability gap from the original QA.

## Closure Evidence For Prior Findings

### TF-4 (P1) — Deactivation / Role-Change Fail-Soft

**Status: CLOSED.**

Backend — [users.service.ts:171-264 `updateRole()`](file:///c:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school/apps/api/src/users/users.service.ts#L171-L264) and [users.service.ts:279-336 `updateActive()`](file:///c:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school/apps/api/src/users/users.service.ts#L279-L336):

| Aspect | Verification |
|---|---|
| Last-SA protection preserved | ✅ `updateActive():287-304` and `updateRole():189-206` — DB-side check runs FIRST, throws `ConflictException` before any mutation. Never skipped. |
| Multi-role detection fail-soft | ✅ `updateRole():211-222` — `getUserRealmRoles()` wrapped in try/catch. On KC failure, logs warning, leaves `primaryRoleCount = 0`, continues operation. Previously threw. |
| DB-first sequence | ✅ `updateActive():307-311` and `updateRole():230-234` — `prisma.user.update()` runs before any KC call. DB is single source of truth. |
| Cache invalidation sequence | ✅ `updateActive():315` (`userStatus.invalidate`) and `updateRole():238-239` (`permissions.invalidateUser` + `userStatus.invalidate`) — runs AFTER DB commit, BEFORE KC sync attempt. Race window closed. |
| KC sync best-effort | ✅ `updateActive():323-333` and `updateRole():249-261` — `kc.setEnabled()`/`assignRealmRole()` wrapped in try/catch. On failure, sets `keycloakSyncPending = true` and continues. |
| Old compensation logic deleted | ✅ No commented-out code. Old KC-first-then-DB-with-rollback pattern fully removed (diff stat: `users.service.ts` 162 changes, net -100/+62). |
| Return type additive | ✅ `return { ...updated, keycloakSyncPending }` — spreads base `User` shape, adds optional flag. Old callers ignoring the field continue to work. |

Frontend — [UsersClient.tsx:115-145](file:///c:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school/apps/web/src/app/dashboard/users/_components/UsersClient.tsx#L115-L145):

- `handleRoleChange():118-130` reads `result.data?.keycloakSyncPending` and shows warning toast: "Peran diubah di database. ⚠ Sinkronisasi Keycloak tertunda — coba sync ulang nanti atau hubungi teknisi."
- `handleToggleActive():132-145` shows base message + warning suffix when sync pending.
- Both handlers correctly distinguish `result.error` (operation failed) from `keycloakSyncPending === true` (operation succeeded with warning).

Tests — [users.spec.ts](file:///c:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school/apps/api/src/__tests__/users.spec.ts):

- Line 253-267: TF-4 fail-soft role-change test asserts `keycloakSyncPending: true` when `assignRealmRole` rejects.
- Line 272-286: TF-4 multi-role detection fail-soft test asserts operation completes with `keycloakSyncPending: false` when `getUserRealmRoles` rejects (multi-role check skipped).
- Line 286-289: last-SA protection test asserts `ConflictException` is still thrown.
- Line 300-302: multi-role KC positive test (array of 2 primary roles) still throws `ConflictException`.

**Architectural consistency:** The new pattern aligns with `academic-lifecycle.md §14.1` (fail-soft principle) and matches the proven reference in [positions.service.ts:228-237](file:///c:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school/apps/api/src/positions/positions.service.ts#L228-L237) and [positions.service.ts:293-303](file:///c:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school/apps/api/src/positions/positions.service.ts#L293-L303).

### TF-1 (P1) — Actionable Empty State + Role Labels

**Status: CLOSED.**

[StrukturClient.tsx:32-41](file:///c:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school/apps/web/src/app/dashboard/struktur-organisasi/_components/StrukturClient.tsx#L32-L41):

- `ROLE_LABELS` map covers all 7 roles; `roleLabel()` helper falls back to raw code if unknown.

[StrukturClient.tsx:252-264](file:///c:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school/apps/web/src/app/dashboard/struktur-organisasi/_components/StrukturClient.tsx#L252-L264):

- Empty state dropdown item: `"Belum ada pegawai (Guru/TU/KS). Tambahkan di Manajemen Pengguna."` — explicit and actionable.
- Populated dropdown items now show: `{fullName} · {roleLabel(role)} · {email}` — three-context display.

[StrukturClient.tsx:267-281](file:///c:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school/apps/web/src/app/dashboard/struktur-organisasi/_components/StrukturClient.tsx#L267-L281):

- Helper link block appears only when `staff.length === 0`.
- Explains constraint: "Hanya user dengan peran Guru, Tata Usaha, atau Kepala Sekolah yang muncul."
- Provides `router.push('/dashboard/users')` navigation button.

The root cause investigation from the original review (3 hypotheses: no GURU/TU/KS users, missing Staff records, truncation) remains valid. The UI now guides admin to the correct recovery action regardless of which hypothesis is active.

### TF-2 (P2) — Microcopy Clarification

**Status: CLOSED.**

[StrukturClient.tsx:294-300](file:///c:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school/apps/web/src/app/dashboard/struktur-organisasi/_components/StrukturClient.tsx#L294-L300):

> "Izin modul terkait jabatan aktif segera setelah disimpan, dan dicabot otomatis saat penugasan dilepas atau tahun ajaran berganti. Berlaku di tahun ajaran {academicYear.code}."

Three improvements over the original ambiguous phrasing:

1. Replaces passive "selama penugasan aktif" with active "segera setelah disimpan".
2. Explains the revocation trigger ("saat penugasan dilepas atau tahun ajaran berganti").
3. Binds to concrete academic year context.

### TF-3 (P2) — Multi-Holder Mental Model

**Status: CLOSED.**

[StrukturClient.tsx:227-233](file:///c:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school/apps/web/src/app/dashboard/struktur-organisasi/_components/StrukturClient.tsx#L227-L233):

- Button label dynamic: `"Tetapkan"` when position is empty, `"+ Tambah Penanggung Jawab"` when position already has assignees.
- `title` attribute: "Jabatan bisa dipegang bersama oleh beberapa pegawai."
- `UserPlus` icon retained for visual continuity.

The combination of label + tooltip + visible existing chips (from [L218-224](file:///c:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school/apps/web/src/app/dashboard/struktur-organisasi/_components/StrukturClient.tsx#L218-L224)) makes the multi-holder capability discoverable without requiring the user to click first.

## Positive Controls Preservation

### Last-SA Protection (C3-a)

Preserved and runs first in both methods. Verified by tests at users.spec.ts:286-289 (role change) and the `last-SA deactivate → 409` test.

### Multi-Role Detection (C3-b)

Logic preserved when KC is available — still throws `ConflictException` when user has 2+ primary roles in Keycloak (test at users.spec.ts:300-302). When KC is down, check is skipped with warning rather than blocking the operation. This is the correct fail-soft behavior per the architect's critique.

### Cache Invalidation Sequence

`userStatus.invalidate()` and `permissions.invalidateUser()` are called **after** DB commit and **before** KC sync attempt. This closes the race window the architect flagged in Critique #2 — there's no longer a moment where cache is invalid but DB is unchanged.

### KeycloakAdminService

Not modified. Already wraps errors as `ServiceUnavailableException` correctly.

### Positions Module

Not modified. The reference fail-soft pattern stays intact.

### Prisma Schema / Dependencies / Migrations

None changed. Confirmed by `git diff --stat` (only 4 files modified: users.service.ts, users.spec.ts, StrukturClient.tsx, UsersClient.tsx).

## Non-Blocking Findings

### P2-1 — `keycloakSyncPending` not exposed in API documentation

**Evidence:** The new `keycloakSyncPending?: boolean` field is additive in the response shape but not yet documented in any OpenAPI/Markdown API contract. Frontend reads it correctly, but third-party API consumers (if any) won't know to check it.

**Recommendation:** Add a one-line note to `docs/api/` user endpoints section: "Response contains `keycloakSyncPending: true` when DB update succeeded but Keycloak sync failed — user is correctly updated in DB, KC sync should be retried later." Non-blocking; can be part of Wave 8 doc polish.

### P2-2 — No "re-sync Keycloak for user X" admin endpoint

**Evidence:** When `keycloakSyncPending: true`, the warning toast tells admin to "coba sync ulang nanti atau hubungi teknisi." But there's no per-user re-sync endpoint available — admin must wait for the user's next interaction or manually edit Keycloak Admin Console.

**Recommendation:** Add `POST /users/:id/resync-keycloak` as a Wave 8 enhancement. Calls `kc.setEnabled()` + `kc.assignRealmRole()` for current DB state. Returns `{ synced: true }` or error. Non-blocking for this hotfix.

### P2-3 — TF-1 root cause verification still pending

**Evidence:** The actionable empty state handles the UX gap, but Director-side SQL query (per original review) has not been recorded as executed:

```sql
SELECT id, "fullName", role FROM "auth"."users"
WHERE role IN ('GURU','TATA_USAHA','KEPALA_SEKOLAH')
AND "deletedAt" IS NULL;
```

**Recommendation:** Director to run this query on staging DB before browser QA to confirm whether the dropdown emptiness was due to missing users vs. missing Staff records. This determines whether a separate Staff-provisioning fix is needed.

### P2-4 — TF-5 series (Wave 8 deferrals) tracked but not started

The 5 deferred P2 UX improvements (confirmation dialogs, visual coherence, permission grid grouping, cross-module navigation, Users empty state) are correctly scoped out. Backlog captured in original review report.

## Verification

Reviewer rerun on `fix/tf-struktur-organisasi-users-hotfix` at HEAD `cf9cbc8` + working tree:

| Check | Executor claim | Reviewer rerun | Match |
|---|---|---|---|
| API focused tests | 1 suite / 38 tests | 1 suite / 38 tests (`users.spec.ts`) | ✅ exact |
| API type-check | clean | `tsc --noEmit` exit 0 | ✅ |
| Web type-check | clean | `tsc --noEmit` exit 0 | ✅ |
| API lint | clean | `eslint src --ext .ts` exit 0 | ✅ |
| Web lint | "No ESLint warnings or errors" | `✔ No ESLint warnings or errors` (only `next lint` deprecation) | ✅ |
| API build | clean | `nest build` exit 0 | ✅ |
| Web build | not run by executor | `✓ Compiled successfully in 27.8s` | ⬆️ reviewer improvement |
| `git diff --check` | (not claimed) | EXIT=0 | ✅ |
| Working tree scope | 4 modified files | Exactly 4 modified + untracked audit doc | ✅ no scope creep |

The reviewer successfully ran `next build` locally where the executor did not. This closes the web build evidence gap — both API and web builds are green, no hidden runtime issue caught.

## Test Coverage Assessment

- **Adequate for TF-4 backend:** 2 new fail-soft tests + existing positive controls (last-SA, multi-role). Both happy path and degraded path covered.
- **Adequate for regression:** 38 total tests pass including `findGrouped`, `getEffectivePermissions`, controller pipe tests.
- **Insufficient for frontend changes:** No component test asserts that `keycloakSyncPending` warning toast renders. This is consistent with the project's established residual risk acceptance (browser QA covers UI workflows). Non-blocking.

## Manual QA Status

**Local smoke: NOT RUN.** Reviewer session scoped to static code review + focused tests + builds.

**Required staging browser QA scenarios (post-merge to develop):**

1. **TF-4 happy path (KC up):** Deactivate non-SA user → toast "Pengguna dinonaktifkan" → refresh → user stays nonaktif → verify in Keycloak Admin Console that `enabled=false`.
2. **TF-4 degraded path (KC down):** Stop Keycloak container → deactivate user → toast "Pengguna dinonaktifkan di database. ⚠ Sinkronisasi Keycloak tertunda" → verify DB shows `isActive=false` → restart KC → re-check user in Keycloak (will still be `enabled=true` until manual re-sync; document this gap).
3. **TF-4 role change:** Change GURU → TU → toast success → verify permission cache invalidated (user loses GURU-only menus on next page load).
4. **TF-1 dropdown populated:** After seeding GURU/TU/KS users → open Struktur Organisasi → click "Tetapkan" → verify dropdown shows "Nama · Peran · email".
5. **TF-1 empty state:** Open Struktur Organisasi in fresh staging without GURU/TU/KS → verify dropdown shows "Belum ada pegawai (Guru/TU/KS)..." + helper link → click "Kelola Pengguna →" → verify navigation to `/dashboard/users`.
6. **TF-2 microcopy:** Open assignment dialog → verify new sentence visible with academic year code.
7. **TF-3 tooltip + dynamic label:** Hover "Tetapkan" button on empty position → tooltip "Jabatan bisa dipegang bersama" → assign someone → verify button label changes to "+ Tambah Penanggung Jawab".

## Git Gate Readiness

### Commit / push / PR to develop

**Approved to proceed** with the following packaging:

1. **Branch base:** `fix/tf-struktur-organisasi-users-hotfix` at `cf9cbc8` (HEAD of Wave 3 merge). Branch is current; `develop` is at `cf9cbc8` as well — PR will be a clean fast-forward.

2. **Files to stage explicitly (do NOT use `git add .` or `git add -A`):**

   Modified (4):
   ```
   apps/api/src/__tests__/users.spec.ts
   apps/api/src/users/users.service.ts
   apps/web/src/app/dashboard/struktur-organisasi/_components/StrukturClient.tsx
   apps/web/src/app/dashboard/users/_components/UsersClient.tsx
   ```

   New untracked, stage explicitly:
   ```
   docs/audits/TF-STRUKTUR-ORGANISASI-USERS-HOTFIX-REMEDIATION-2026-07-21.md
   docs/audits/TF-STRUKTUR-ORGANISASI-USERS-HOTFIX-REVIEW-2026-07-21.md
   ```

   **Do NOT stage:** `.commit-msg*.txt`, `.pr-body-*.txt`, `.agents/`, `.codex/`, `.tmp/`, `apps/.tmp/`, `apps/api/src/.tmp/`, or any other historical untracked artifacts (same protocol as Wave 2.5/3 reviewer precedents).

3. **Pre-commit gate:**
   ```
   git diff --cached --stat
   git diff --cached --check
   ```
   Confirm staged file count is exactly 6 (4 modified + 2 new). Inspect for unrelated lines.

4. **Commit message (suggested):**
   ```
   fix(users,struktur): TF hotfix — DB-first fail-soft + actionable UX

   TF hotfix for struktur organisasi & users management:
   - TF-4 (P1): users.service updateActive/updateRole refactored from
     KC-first to DB-first + KC sync best-effort. Closes deactivation failure
     when Keycloak is down. Pattern mirrors positions.service.ts:228-237.
   - TF-1 (P1): StrukturClient empty state now actionable with link to
     /dashboard/users; dropdown items show role label.
   - TF-2 (P2): Microcopy clarified — "aktif segera setelah disimpan..."
   - TF-3 (P2): Dynamic button label "+ Tambah Penanggung Jawab" when
     position has assignees; tooltip documents multi-holder policy.

   API contract: additive `keycloakSyncPending?: boolean` field on
   PATCH /users/:id/role and PATCH /users/:id/active responses.
   No schema/dependency/migration changes.
   Tests: 1 suite / 38 pass (2 new TF-4 fail-soft tests).
   Type-check, lint, API build, web build all green.
   ```

5. **PR target:** `develop`. Title: `fix(users,struktur): TF hotfix — DB-first fail-soft + actionable UX`. PR body should summarize the 4 findings closed, the 5 deferred to Wave 8, and cite the audit report path.

### Web build gap handling

**Resolved in reviewer session.** The reviewer ran `next build` locally (`✓ Compiled successfully in 27.8s`) where the executor did not. Web build evidence closed; no further build verification needed before Git Gate.

### Staging queue priority

This hotfix addresses P1 staging QA blockers. Recommended sequence:

1. **TF hotfix PR merge to develop** (this review).
2. **TF hotfix promotion to staging** (separate PR develop → staging).
3. **TF hotfix browser QA** on staging (7 scenarios above).
4. **SPMB staging QA** (per `SPMB-STAGING-QA-FOLLOWUP-FINDINGS-FIXES-2026-07-19.md`) — may run in parallel if staging window allows.
5. **Wave 3 browser QA** (per Wave 3 remediation report) — queued after TF + SPMB.

### Files NOT to be staged

Listed above in §2. Same protocol as prior reviewer precedents.

## Recommendations

### Immediate (covered by this hotfix)

None additional. Git Gate is approved as-is.

### Fast-follow (before staging sign-off)

1. **Director-side SQL verification** (P2-3) — run the GURU/TU/KS count query on staging DB to confirm TF-1 root cause.

2. **TF-4 degraded-path browser QA** — simulate Keycloak downtime during deactivation to validate the warning toast path. Hardest scenario to verify but most important architectural claim.

### Polish (Wave 8)

1. **Per-user KC re-sync endpoint** (P2-2) — `POST /users/:id/resync-keycloak`.
2. **API documentation update** (P2-1) — document `keycloakSyncPending` field.
3. **TF-5 series** — confirmation dialogs, visual coherence, permission grid grouping, cross-module navigation, Users empty state. Tracked in original QA findings report.

## Confidence

**Review confidence: 95%**

Confidence is high because:

- All 4 findings' file:line evidence was independently verified.
- Focused test totals (38 tests) reproduced exactly on first run.
- Type-check, lint, API build, web build all green locally.
- Web build (which executor did not run) completed successfully — closes the only evidence gap.
- Working tree scope exactly matches executor's claim (4 modified + 2 new files, no scope creep).
- The TF-4 architectural refactor is well-documented, mirrors a proven pattern in the same codebase, and includes both happy-path and degraded-path tests.
- Positive controls (last-SA protection, multi-role detection, cache invalidation sequence) explicitly verified preserved.
- Old KC-first compensation logic is fully deleted (diff confirms net deletion), not commented out.

The remaining 5% uncertainty is runtime-only:

- Whether `keycloakSyncPending: true` actually surfaces correctly in browser when Keycloak is genuinely down (requires staging QA with Keycloak stop/start).
- Whether TF-1's root cause is missing users vs. missing Staff records (Director-side SQL query).
- Whether the warning toast wording is sufficiently actionable for non-technical operators.

## Path to Review Report

`docs/audits/TF-STRUKTUR-ORGANISASI-USERS-HOTFIX-REVIEW-2026-07-21.md` (this file).
