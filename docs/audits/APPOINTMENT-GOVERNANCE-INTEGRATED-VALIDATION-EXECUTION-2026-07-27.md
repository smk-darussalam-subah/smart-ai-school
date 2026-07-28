# Appointment Governance Integrated Validation Execution

Tanggal: 2026-07-27
Peran: Codex Executor / Operator validasi
Scope: Integrated validation V2 untuk TF2 + Appointment Wave B + Wave C final.
Status: **FOLLOW-UP REQUIRED**

## 1. Executive Verdict

**Verdict: FOLLOW-UP REQUIRED**

Gate 0, Gate 1, dan Gate 2 lulus. Gate 3 lulus untuk automation endpoint runtime pada API temporary + database disposable, tetapi belum lulus penuh karena skenario authenticated authority/JWT tidak dapat dijalankan tanpa Keycloak isolated. Gate 4 n8n isolated runtime juga belum dijalankan karena tidak ada instance n8n test/isolated yang aman; live n8n tidak disentuh. Gate 5 browser/staging QA tetap deferred.

Tidak ada P0/P1 source-code finding baru dari rangkaian ini. Blocker yang tersisa adalah environment/runtime isolated untuk auth dan n8n, bukan kegagalan migration.

Confidence:

- Source/test local: **96%**
- PostgreSQL dry-run + restore rehearsal: **94%**
- Automation endpoint runtime: **90%**
- Full integrated sign-off Gate 1-4: **belum tercapai** karena Gate 3 auth dan Gate 4 n8n blocked.

## 2. Source Manifest + SHA-256

Canonical local worktree:

- Branch: `feat/appointment-governance-wave-c-activation-20260725`
- Path: `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school`

Final target manifest:

| Artifact | SHA-256 |
| --- | --- |
| `packages/database/prisma/migrations/20260722000001_tf2_p1_1_zombie_permissions/migration.sql` | `38E8B4E40C5CC24543B5267F3F2E6B46C0ADB7FA9AC9EA4035449CBCE12D3860` |
| `packages/database/prisma/migrations/20260724000001_appointment_governance_wave_b/migration.sql` | `3567C241C8B740E04C11F7762D6382C6F8B7375D6FF3F948DB8F96FE17074752` |
| `packages/database/prisma/migrations/20260727000001_appointment_capacity_wave_c_architecture/migration.sql` | `2EBFC17152B3F329E24044766D73CA8D49C02F468D14DECED4D69D0FC4F9AC56` |
| `packages/database/prisma/schema.prisma` | `82D4D4F328C22DF988ADD92B5FD492A3C19881275D45E7098A2B139F72A6502E` |

Outbox decision:

- `20260725000001_appointment_outbox_wave_c/migration.sql`: **absent**.
- Remote source package initially contained an empty outbox directory from local filesystem state; Prisma rejects empty migration directories with `P3015`. The empty directory was removed only from the temporary source package before the final dry-run. No product source, Git, or live database was changed for this.

Remote source hash after upload matched the local hash values above.

## 3. Gate Matrix 0-5

| Gate | Status | Command Class | Exit Code | Summary | Residual Risk |
| --- | --- | --- | --- | --- | --- |
| Manifest precheck | PASS | Filesystem/hash checks | 0 | Three target migrations and schema matched expected SHA-256; outbox migration file absent. | Worktree remains mixed/uncommitted; Git packaging still requires explicit file list. |
| Gate 0 - Runtime Preflight | PASS | SSH + Docker/PostgreSQL tool checks | 0 | SSH key access worked; host lacked psql/npm, but `smk-postgres` container had PostgreSQL 16.14 tools and API image had Node/npm/npx/Prisma. Source and target verified before write. | Report does not expose host, DB URL, password, token, or internal identifiers. |
| Gate 1 - Source Integrity and Automated Checks | PASS | Local source checks/tests/build | 0 after cache fix | Prisma generate/validate, API/web tests, type-check, lint, build, workflow JSON boundary checks passed. | Jest needed workspace cache directory because Windows Temp cache returned EPERM. |
| Gate 2 - Combined PostgreSQL Dry-Run | PASS | Disposable DB dump/restore + Prisma deploy + SQL proof | 0 final run | Source snapshot had 0 target migrations, target disposable restored, Prisma applied TF2 + Wave B + Wave C, capacity proof passed, restore rehearsal passed. | Staging-copy data had no legacy StaffPosition rows; migration path for non-empty StaffPosition remains structurally tested, not data-rich. |
| Gate 3 - API Runtime Isolated E2E | PARTIAL | Temporary API + Redis container against migrated disposable DB | 0 for automation subset | Automation token guard/runtime passed: missing/wrong token 403, valid concurrent activation exactly once, second call idempotent, nonactive-year due appointment remained approved. | Authenticated JWT/authority lifecycle scenarios blocked because no isolated Keycloak/JWKS runtime was available. |
| Gate 4 - n8n Isolated Runtime | BLOCKED | Not run | N/A | Live n8n was not touched. No isolated n8n instance was available for import/manual execution with execution-data inspection. | Offline JSON evidence remains source-only, not runtime sign-off. |
| Gate 5 - Browser/Staging QA | DEFERRED | Not in this executor gate | N/A | Requires reviewer-approved Git packaging, CI, and staging promotion first. | Browser/staging QA remains mandatory before final Wave C sign-off. |

## 4. Automated Test Summary

Source integrity:

- `git diff --check`: pass.
- `git diff --cached --check`: pass.
- Conflict marker scan using exact markers: no hits.
- n8n workflow JSON parse: pass.
- Boundary search: workflow/controller did not expose `academicYearId`, `affectedKeycloakIds`, `staffId`, or `fullName` in automation contract.
- Prisma generate: pass.
- Prisma validate with dummy non-secret `DATABASE_URL`: pass.

Automated tests:

- API full suite: **57 suites / 967 tests passed**.
- Web full suite: **14 suites / 83 tests passed**.
- API type-check: pass.
- Web type-check: pass.
- API lint: pass.
- Web lint: pass, with existing Next lint deprecation/plugin warning only.
- API production build: pass.
- Web production build: pass, **39/39 pages** generated.

Initial API/web Jest runs failed with Windows Temp `EPERM` cache writes. They were rerun with cache directories under workspace `.tmp`, then passed.

## 5. PostgreSQL Pre/Post Reconciliation

Runtime source:

- Source snapshot target migration count: `0`.
- Target class: disposable copy.
- Snapshot creation: pass.
- Restore to primary disposable copy: pass.
- `prisma migrate status`: exit `1` before deploy because target migrations were pending. This was expected pre-deploy state, not a failure.
- `prisma migrate deploy`: pass on final run.

Baseline non-PII counts on disposable copy before migration:

| Metric | Count |
| --- | ---: |
| active users | 48 |
| permission overrides | 0 |
| staff positions | 0 |
| positions | 13 |
| academic years | 2 |
| target migrations applied | 0 |

Post-migration counts:

| Metric | Count |
| --- | ---: |
| target migrations applied | 3 |
| permission overrides | 0 |
| staff positions | 0 |
| appointments | 0 |
| appointment migration reviews | 1 |
| `positions.max_active_holders` column | 1 |
| `positions_max_active_holders_check` constraint | 1 |
| `appointment_enforce_active_capacity` function | 1 |
| `appointment_scope_capacity_guard` trigger | 1 |

Appointment migration review distribution:

- `QUARANTINED`: 1

Deputy capacity policy:

- `WAKIL_KOOR_BKK`: `max_active_holders = 2`
- `WAKIL_KOOR_HUBIN`: `max_active_holders = 2`

TF2 distribution was empty because baseline `auth.user_permission_overrides` count was 0.

## 6. Capacity / Concurrency / Restore Proof

Capacity trigger proof ran inside one transaction and rolled back:

- Single-capacity position rejected second `ACTIVE`.
- Open candidate without replacement rejected when capacity was full.
- `APPROVED` successor with `replaces_appointment_id` was allowed while incumbent was `ACTIVE`.
- `WAKIL_KOOR_BKK` accepted two independent `ACTIVE` appointments.
- Third `ACTIVE` for `WAKIL_KOOR_BKK` was rejected.
- Transaction rollback completed.

Restore rehearsal:

| Metric | Rehearsal Count |
| --- | ---: |
| active users | 48 |
| permission overrides | 0 |
| staff positions | 0 |
| positions | 13 |
| academic years | 2 |
| target migrations applied | 0 |

Rehearsal counts matched baseline: **PASS**.

## 7. API Runtime Scenario Matrix

Temporary runtime:

- Temporary Redis container: started and removed.
- Temporary API container: started from existing API image with final local `apps/api/dist` and final generated Prisma Client mounted read-only.
- `DATABASE_URL`: pointed only to migrated disposable DB and was never printed.
- External Keycloak/Ollama endpoints used dummy unreachable values; notification provider set to `log`.

Automation endpoint runtime results:

| Scenario | Result |
| --- | --- |
| `POST /appointments/activate-due` without token | 403 |
| same endpoint with wrong token | 403 |
| two valid concurrent calls | PASS; exactly one activation total |
| response projection | PASS; count-only, no `affectedKeycloakIds`, `staffId`, or `fullName` |
| second valid call after activation | PASS; no reactivation |
| extra `academicYearId` query param | ignored by endpoint path; nonactive-year fixture remained `APPROVED` |
| active-year due appointment | became `ACTIVE` |

Blocked runtime scenarios:

- Authenticated appointment lifecycle and authority checks requiring valid Keycloak/JWKS were not run.
- Legacy `PositionsService.assign/unassign` 409 behavior, resolver projections, and sidebar/users diagnostics remain covered by unit/source tests in Gate 1, not by isolated browser/API auth runtime in this gate.

## 8. n8n Execution Safety Evidence

**Status: BLOCKED**

Live `smk-n8n` was not imported to, activated, or manually executed. No isolated n8n instance was available for safe workflow import/execution-data inspection.

Source-only evidence from Gate 1:

- Workflow JSON parses.
- Workflow source no longer reads `affectedKeycloakIds`, `staffId`, or `fullName`.
- Automation response contract is count-only.

This is not enough for Gate 4 runtime sign-off.

## 9. Browser / Staging QA

**Status: DEFERRED**

No Git packaging, CI promotion, staging deploy, or browser QA was performed in this executor run. Gate 5 remains mandatory after reviewer approval and Gitflow promotion.

## 10. Findings, Residual, Cleanup, Rekomendasi

### Findings

No new P0/P1 source defect was found.

Operational findings:

- The local source tree had an empty outbox migration directory. `migration.sql` was absent as required, but Prisma treats an empty migration directory as invalid. The temporary source package was corrected by removing the empty directory before final dry-run.
- Staging-copy data had 0 StaffPosition rows and 0 permission override rows. This made reconciliation simple but less data-rich for historical migration behavior.

### Residual

- Gate 3 authenticated authority/lifecycle runtime is blocked without isolated Keycloak/JWKS or a safe JWT fixture strategy accepted by reviewer.
- Gate 4 n8n runtime is blocked without isolated n8n instance.
- Browser/staging QA deferred.
- Git packaging still requires explicit file list; no Git action was performed.

### Cleanup Confirmation

Cleanup verified:

- Temporary API and Redis containers removed.
- Disposable dry-run databases removed; remaining dry-run DB count was `0`.
- Snapshot and Prisma temp logs removed from PostgreSQL container.
- Temporary source/runtime folders and gate scripts removed from VPS `/tmp`.
- No staging/live database, production database, Keycloak, n8n live workflow, GitHub, branch protection, deploy, WA, or email was changed.

### Recommendation

Ready for reviewer re-review of Gate 0-3 evidence, with a clear conditional status:

- **PostgreSQL dry-run Gate 2: PASS.**
- **Automation runtime subset of Gate 3: PASS.**
- **Full integrated Gate 1-4 sign-off: not yet, because Gate 3 auth and Gate 4 n8n remain blocked.**

Next safe step: reviewer decides whether Gate 3 authenticated scenarios can be satisfied by a test-only JWT/JWKS harness, or whether they must wait for a dedicated isolated Keycloak runtime. Separately, provide isolated n8n runtime for Gate 4; do not use live n8n for this proof.
