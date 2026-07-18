# Prompt Architect Output - Wave 1 RBAC Ownership Privacy

Tanggal dibuat: 2026-07-16

Input handoff:
- Wave 0 executor membuat `docs/audits/WAVE0-STABILIZATION-ACCEPTANCE-CONTRACT-2026-07-16.md`.
- Wave 0 merekomendasikan next wave: **Wave 1 - RBAC, ownership, privacy, PDP consent, permission mismatch, dan negative tests**.
- Wave 1 harus dijalankan sebelum remediation Phase 0-6 berikutnya, khususnya sebelum Phase 5 report-card pipeline dan Phase 6 semester closing.

## Draft Prompt Eksekusi Awal

```md
Anda adalah Codex Executor untuk proyek DIIS `smart-ai-school`.

Misi: eksekusi Wave 1 - RBAC, Ownership, Privacy, PDP Consent, Permission Mismatch, dan Negative Tests.

Baca dokumen wajib:
- `C:\Users\USER\Documents\Claude\Projects\DIIS\AGENTS.md`
- `C:\Users\USER\Documents\Claude\Projects\DIIS\docs\AI_CONTEXT.md`
- `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\AGENTS.md`
- `docs/WAYS-OF-WORKING.md`
- `docs/decision-log.md`
- `docs/architecture/academic-lifecycle.md`
- `docs/audits/WAVE0-STABILIZATION-ACCEPTANCE-CONTRACT-2026-07-16.md`
- Phase audit files 0-6 as needed.

Scope:
- Fix W1-01 sampai W1-10 dari report Wave 0.
- Tutup ownership dan permission mismatch untuk student, report-card privacy gate, class activities, finance, WA log, analytics, WAKA access, period endpoints, permission overrides, position transactions, dan parent consent.
- Tambah negative tests.
- Update report remediation.

Jangan ubah schema/dependency tanpa approval.
Jalankan type-check, lint, dan focused tests.
```

## Kritik Terhadap Draft

- Draft masih terlalu luas: "fix W1-01 sampai W1-10" benar, tetapi executor bisa tergoda mengimplementasikan seluruh Phase 5/6 karena menyentuh report-card/WAKA/semester.
- Draft belum memberi prioritas implementasi. Wave 1 harus mendahulukan safety: data leak, ownership, permission mismatch, lalu transactional/UX affordance.
- Draft belum cukup eksplisit soal non-goals: tidak boleh memperbaiki RPP body schema, assessment timer, full report-card actor pipeline, atau close-semester workflow.
- Draft belum membedakan access-gate fix dari business-workflow fix. Contoh: WAKA RPP review policy boleh diselaraskan di access gate, tetapi full two-step RPP state machine bukan Wave 1.
- Draft belum menetapkan policy fallback ketika ada keputusan yang perlu Director/Cowork. Executor perlu memakai source of truth yang ada: lifecycle, decision-log, Wave 0, lalu mendokumentasikan accepted/deferred decision jika schema besar diperlukan.
- Draft belum cukup spesifik soal tests: perlu allowed/denied matrix, own/child, assigned/unassigned class, status filter privacy, finance receipt event, permission override deny, transaction consistency.
- Draft belum mencantumkan manual QA dengan aksi nyata per role.
- Draft belum meminta update report baru dengan daftar finding closed/deferred dan bukti command.

## Prompt Final Untuk Executor

```md
Anda adalah Codex Executor untuk proyek DIIS `smart-ai-school`.

## Misi

Eksekusi **Wave 1 - Cross-Cutting RBAC, Ownership, Privacy** sampai selesai dengan standar production-grade.

Wave ini adalah remediation code wave pertama setelah Wave 0. Fokusnya adalah menutup risiko lintas fase yang bisa menyebabkan data leak, izin fail-open, permission mismatch, PDP consent drift, dan UI/backend access contract yang tidak sinkron.

Jangan mengerjakan full feature remediation Phase 2, Phase 3, Phase 5, atau Phase 6. Sentuh modul fase lain hanya untuk memperbaiki gate akses, ownership, privacy, dan negative tests yang termasuk Wave 1.

## Konteks Wajib Dibaca

Sebelum implementasi, baca:

1. `C:\Users\USER\Documents\Claude\Projects\DIIS\AGENTS.md`
2. `C:\Users\USER\Documents\Claude\Projects\DIIS\docs\AI_CONTEXT.md`
3. `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\AGENTS.md`
4. `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\docs\WAYS-OF-WORKING.md`
5. `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\docs\decision-log.md`
6. `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\docs\architecture\academic-lifecycle.md`
7. `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\docs\audits\WAVE0-STABILIZATION-ACCEPTANCE-CONTRACT-2026-07-16.md`
8. Source audit files:
   - `docs/audits/PHASE0-COMPREHENSIVE-AUDIT-2026-07-15.md`
   - `docs/audits/PHASE1-COMPREHENSIVE-AUDIT-2026-07-15.md`
   - `docs/audits/PHASE2-COMPREHENSIVE-AUDIT-2026-07-15.md`
   - `docs/audits/PHASE3-COMPREHENSIVE-AUDIT-2026-07-15.md`
   - `docs/audits/PHASE4-COMPREHENSIVE-AUDIT-2026-07-15.md`
   - `docs/audits/PHASE5-COMPREHENSIVE-AUDIT-2026-07-15.md`
   - `docs/audits/PHASE6-COMPREHENSIVE-AUDIT-2026-07-15.md`

## Goal

- Tutup semua Wave 1 P0/P1 yang terdaftar di Wave 0: W1-01 sampai W1-10.
- Buat authorization dan ownership fail-closed untuk GURU, SISWA, ORANG_TUA, WAKA_KURIKULUM, TU, KS, dan SUPER_ADMIN sesuai lifecycle dan permission-based architecture.
- Pastikan UI/page guards, sidebar affordance, controller decorators, service ownership checks, and seed/effective permissions tidak saling bertabrakan.
- Tambahkan negative tests untuk semua route/service yang disentuh.
- Buat/update remediation report Wave 1 dengan bukti test dan residual risk.

## Non-Goal

- Jangan implement full RPP body schema, real draft save, atau AI RPP output application. Itu Wave 3.
- Jangan implement assessment timer, strict assessment DTO overhaul, randomized snapshot, or LMS progress semantics. Itu Wave 4.
- Jangan implement full report-card pipeline Wali/WAKA/KS/TU, snapshot semester, push notification, or mass-generate transaction. Itu Wave 6. Wave 1 hanya menutup privacy/status gate dan section ownership.
- Jangan implement close-semester workflow. Itu Wave 7. Wave 1 hanya menyiapkan WAKA/permission access contract jika perlu.
- Jangan memperbaiki broad UI polish/error masking kecuali langsung terkait denied action vs empty fake success.
- Jangan membersihkan untracked/historical artifacts.
- Jangan mengubah Prisma schema tanpa approval eksplisit.
- Jangan menambah dependency tanpa approval eksplisit.
- Jangan mengubah Docker, GitHub Actions, staging, production, or deployment config.
- Jangan melemahkan auth, ownership, PDP/privacy, or audit trail demi membuat test pass.

## Temuan Audit Yang Wajib Ditutup

### P0

1. **W1-01 - GURU over-read dan report-card section access terlalu luas.**
   - Scope: `student.controller/service`, `report-cards.service`, teaching assignment/wali resolver.
   - Required: GURU hanya boleh akses siswa, grades, attendance, class activities, dan report-card sections untuk assigned class, wali class, atau explicit structural permission.
   - Tests: positive assigned class/wali; negative unassigned class/student; no empty fake success.

2. **W1-02 - Parent/student PDP consent propagation belum lengkap.**
   - Scope: provisioning/student/parent assignment flows and auth user consent fields.
   - Required: gunakan source of truth dokumen. Jika operator-confirmed guardian consent sudah menjadi policy, persist `consentAt` untuk parent account saat parent dibuat. Jika self-consent harus eksplisit, persist pending state visibly and document it.
   - If implementation requires schema change, stop and ask approval. Prefer using existing `consentAt`/existing fields if enough.
   - Tests: student provisioning with parent; parent assignment; first-login/self-consent state.

3. **W1-03 - Permission/role mismatch lintas module.**
   - Scope: positions/organization mutation, classes, finance own/child, WA log child endpoint, analytics own/child, WAKA RPP review access, WAKA Phase 6 academic reports, high-impact period endpoints.
   - Required: permission gates align with seed permissions, lifecycle, decision-log, sidebar/page guards, and service ownership.
   - Tests: allowed and denied role/permission matrix for every changed controller/page.

4. **W1-04 - SISWA/ORANG_TUA report-card status query can override distributed privacy gate.**
   - Scope: `report-cards.service.findAll` and relevant frontend/server actions if needed.
   - Required: SISWA/ORANG_TUA can only see `distributed` report cards, regardless of query `status`.
   - Tests: `status=draft`, `checked`, `published`, `distributed` as SISWA/ORANG_TUA.

5. **W1-05 - Class activity/jurnal kelas ownership terlalu longgar.**
   - Scope: `class-activities.service/controller`.
   - Required: GURU create/read/update/delete only for assigned/wali class or explicit permission; SISWA/ORANG_TUA only own/child class data if exposed.
   - Tests: assigned vs unassigned class; update/delete ownership; student/parent child scoping.

6. **W1-06 - Finance SPP approval semantics and receipt event are unsafe.**
   - Scope: `finance.dto`, `finance.service`, finance permissions, minimal UI/page guard if needed.
   - Required: TU record creates unpaid/pending record with no receipt event. SA/KS approve transitions to paid, sets approved fields/paidAt, emits `payment.received`. SISWA/ORANG_TUA read own/child finance through matching permission and service ownership.
   - Tests: create -> unpaid/no WA/event; approve -> paid/event; TU cannot self-approve; SISWA/ORTU own/child read allowed and unrelated read denied.

7. **W1-07 - Parent multi-child data binding is first-child/label-only in key flows.**
   - Scope: parent dashboard actions/data fetches for academic, finance/SPP, WA log, grades, attendance, badges/rank, and report visibility where Wave 1 privacy depends on it.
   - Required: child selector must drive actual backend requests and ownership checks; no panel may show child A data under child B label.
   - Tests: parent with two children; switch child; all Wave 1 scoped panels change or explicitly show child-specific empty state.

### P1

8. **W1-08 - High-impact period/organization endpoints remain role-only where permission-based control is expected.**
   - Scope: positions/organization and school-config academic year/semester endpoints that mutate high-impact state.
   - Required: use granular permission gates where existing permission catalog supports it. If catalog lacks permission and schema/seed change is needed, ask approval or document deferred risk.
   - Tests: `@RequirePermission` metadata or e2e denied role tests.

9. **W1-09 - Permission override deny path incomplete/misleading.**
   - Scope: permissions API/service and user management UI affordance if already present.
   - Required: honor `grant=false` or split explicit grant/deny/revoke semantics. Override deny must be able to revoke role-derived permission according to decision-log semantics.
   - Tests: grant true, grant false, revoke, role-derived permission denial, cache invalidation/effective access.

10. **W1-10 - Position assignment DB side effects not fully transactional.**
   - Scope: `positions.service`.
   - Required: position assignment/unassignment and DB permission override side effects are transactionally consistent where possible. Keycloak sync can remain fail-soft after DB consistency is secured.
   - Tests: transaction/failure simulation or service tests proving no active position without intended DB permission state; access-check consistency.

### P2 / Explicit Decisions

- Use lifecycle/decision-log/Wave 0 as source of truth before asking the user.
- If a change requires Prisma schema, new dependency, migration, or new permission catalog entries not already represented in code, ask explicit approval before implementing that part.
- If policy remains ambiguous after reading source docs, implement the safer fail-closed behavior and document the decision in the Wave 1 report.
- Do not mark deferred policy decisions as closed. Record them as deferred/accepted risk with reason and next wave.

## Prinsip Implementasi

- Ikuti pola existing repo.
- Gunakan strict TypeScript.
- Gunakan Zod DTO validation; jangan introduce `class-validator`.
- Jangan introduce `any` baru.
- Authorization harus permission-based and fail-closed.
- Roles remain the seven base roles; position-derived permissions/roles must not silently create an eighth base role.
- Service-level ownership checks are mandatory. UI/sidebar/page guards are secondary, not security boundaries.
- Own/child and assigned-class checks must be tested with negative cases.
- API errors must be clear 401/403/400/409 as appropriate, not masked as empty success.
- Keep edits scoped. Add shared ownership helpers only if they remove real duplication across changed services.
- Audit/PDP/privacy logic must avoid logging PII or secrets.

## Recommended Implementation Order

1. Inspect current worktree with `git status --short`; preserve unrelated and untracked artifacts.
2. Trace current permission system:
   - permission decorators/guards,
   - seed permissions,
   - position permissions,
   - sidebar/page guards,
   - service ownership resolvers.
3. Fix lowest-level permission/ownership primitives first:
   - permission override grant/deny,
   - position transaction consistency,
   - reusable assigned-class/own-child checks if needed.
4. Fix API/service data leaks:
   - student/grades/attendance/report-card sections,
   - report-card status query privacy,
   - class activities,
   - finance own/child and approval event semantics,
   - WA log/analytics own-child mismatch.
5. Fix WAKA and high-impact endpoint gates only to the extent needed for access contract; defer full workflow behavior to later waves.
6. Fix parent multi-child data binding for Wave 1 scoped panels.
7. Add focused unit/e2e tests and update existing tests that currently encode insecure behavior.
8. Run verification commands.
9. Create Wave 1 remediation report.

## Proses Wajib

1. Buat plan detail.
2. Kritik plan Anda sendiri:
   - Apakah scope terlalu luas dan mulai masuk Phase 2/3/5/6 full implementation?
   - Apakah ada schema/dependency/seed change yang butuh approval?
   - Apakah privacy/RBAC/ownership negative tests cukup?
   - Apakah UI/page guard dan backend guard sinkron?
   - Apakah manual QA mencakup role, path, button/action, expected result, negative case, and reload?
3. Tampilkan fixed plan.
4. Implementasi kode.
5. Tambah/update tests.
6. Jalankan verifikasi.
7. Buat/update report:
   - `docs/audits/WAVE1-RBAC-OWNERSHIP-PRIVACY-REMEDIATION-2026-07-16.md`
8. Final summary.

## Acceptance Criteria 100%

- W1-01 sampai W1-10 closed, or explicitly deferred only if blocked by required schema/dependency/policy approval.
- No known P0 data leak in Wave 1 scope remains untested.
- GURU cannot access out-of-scope students, grades, attendance, class activities, or report-card sections.
- SISWA/ORANG_TUA can only access own/child data across finance, WA log, analytics, report cards, grades, attendance, LMS-adjacent panels touched in Wave 1, and class activities.
- Report-card status query cannot expose non-distributed reports to SISWA/ORANG_TUA.
- Finance create/approve semantics follow separation of duties and emit receipt only after approval.
- Permission override deny semantics are real and tested.
- Position assignment DB state and permission overrides are transactionally consistent.
- WAKA/position/page/controller access is at least internally consistent for Wave 1 access gates.
- UI controls for denied actions are hidden/disabled or show forbidden state; backend still enforces 401/403.
- Focused tests pass.
- API and web type-check/lint pass, unless a pre-existing tooling blocker is documented with exact output.
- Wave 1 remediation report includes file changes, test command/results, manual QA, deferred risks, and next wave recommendation.

## Verification Commands Minimal

Run from:

```powershell
cd C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school
```

Required static checks:

```powershell
npm.cmd --workspace @smk/api run type-check
npm.cmd --workspace @smk/web run type-check
npm.cmd --workspace @smk/api run lint
npm.cmd --workspace @smk/web run lint
```

Focused tests. Adjust filenames only after discovering actual test names, but keep coverage equivalent:

```powershell
npm.cmd --workspace @smk/api run test -- --runInBand permissions.spec.ts roles.spec.ts positions.spec.ts student.spec.ts finance.spec.ts wa-log.spec.ts analytics.spec.ts rpp.spec.ts report-cards-activities.spec.ts
```

If tests are named differently, use `rg --files apps/api/src apps/api/test | rg "permission|role|position|student|finance|wa-log|analytics|rpp|report-card|class-activit"` to find the focused suites.

If root Turbo still has local issues, record it as tooling issue and rely on per-workspace commands above. If a command fails, include the important failure lines and do not claim success.

## Manual QA Critical Path

Manual QA harus ditulis di report and dijalankan jika local/browser environment tersedia. Minimal:

1. SUPER_ADMIN permission override:
   - Login SUPER_ADMIN.
   - Open `/dashboard/users`.
   - Grant a permission, reload target user's effective access, then deny/revoke it.
   - Expected: access changes after refresh; denied permission blocks target route/API.
   - Negative: TATA_USAHA cannot grant privileged permission if policy denies.

2. SUPER_ADMIN structure organization:
   - Open `/dashboard/struktur-organisasi`.
   - Assign and unassign staff position.
   - Expected: access-check and effective permissions match assignment; reload persists.
   - Negative: role without manage permission cannot assign/unassign.

3. GURU assigned vs unassigned student:
   - Login GURU.
   - Open assigned class student detail/grades/attendance.
   - Try direct URL/API for unassigned student.
   - Expected: assigned succeeds, unassigned returns 403 or forbidden UI, not empty fake success.

4. GURU class activity:
   - Create journal/class activity for assigned class.
   - Try create/update/delete for unassigned class.
   - Expected: assigned succeeds; unassigned denied.

5. TATA_USAHA and KS finance separation:
   - Login TU, open `/dashboard/keuangan`, click `Catat SPP`.
   - Expected: record is unpaid and no receipt/WA event yet.
   - Login KS or SUPER_ADMIN, approve payment.
   - Expected: status paid, approved fields set, receipt event appears.
   - Negative: TU cannot self-approve.

6. SISWA finance/report privacy:
   - Login SISWA.
   - Open own finance and report card.
   - Try direct status filter for draft/checked/published report card.
   - Expected: only own data and only distributed reports appear.

7. ORANG_TUA multi-child:
   - Login parent with two children.
   - Switch child.
   - Expected: finance, grades/attendance, WA log, and report visibility change to selected child.
   - Negative: direct unrelated child ID returns 403.

8. WAKA access gate:
   - Login WAKA_KURIKULUM.
   - Open RPP review/academic report paths that Wave 1 policy allows.
   - Expected: allowed academic paths open; non-academic KS finance/PPDB powers denied.

Each manual QA row in the report must include role, page/path, action/button, expected backend effect, expected UI result, negative case, empty/error-state behavior, and reload expectation.

## Laporan Yang Harus Dibuat

Buat:

- `docs/audits/WAVE1-RBAC-OWNERSHIP-PRIVACY-REMEDIATION-2026-07-16.md`

Isi minimal:

- Scope Wave 1.
- Source docs read.
- Plan, plan critique, fixed plan.
- Findings closed: W1-01 to W1-10.
- Findings deferred/accepted risk and why.
- Files changed.
- Test commands and results.
- Manual QA result or not-run reason.
- Schema/dependency decisions.
- Residual risk.
- Recommended next wave. Expected next wave after successful Wave 1: **Wave 2 - Phase 0/1 Foundation, Enrollment, Academic Setup Fixes**.

## Final Answer Executor Harus Berisi

- Ringkasan perubahan.
- File utama yang diubah.
- Hasil test.
- Manual QA status.
- Apakah ada schema/dependency/seed migration: yes/no.
- Temuan closed vs deferred.
- Risiko tersisa.
- Next recommended wave.
```

## Confidence Level

**0.91 - tinggi.**

Alasan:
- Wave 0 sudah mengunci Wave 1 sebagai next step dan mendefinisikan W1-01 sampai W1-10.
- Prompt ini menyalin prioritas dan acceptance contract Wave 0, lalu memperketat batas non-goal agar executor tidak mengerjakan semua phase sekaligus.
- Audit Phase 0-6 sudah dicross-check untuk memastikan item Wave 1 berasal dari finding nyata.

Yang menurunkan confidence:
- Beberapa keputusan policy masih dapat membutuhkan Director/Cowork, terutama parent consent model, WAKA policy, high-impact endpoint permission catalog, dan apakah perubahan seed/permission catalog dianggap schema/seed change yang perlu approval.
- Nama test file aktual bisa berbeda dari focused command yang disarankan; prompt meminta executor menyesuaikan setelah discovery.
- Wave 1 menyentuh banyak module keamanan sekaligus. Prompt sengaja meminta plan critique dan report deferred jika bagian tertentu memerlukan approval.

## Catatan Risiko Untuk Sesi Executor

- Risiko scope creep terbesar: executor masuk ke full report-card pipeline Phase 5 atau close-semester Phase 6. Prompt final membatasi hanya privacy/status/access gate.
- Risiko kedua: memperbaiki UI guard tanpa service/API negative tests. Prompt final mewajibkan backend fail-closed and negative tests.
- Risiko ketiga: mengubah schema/seed/dependency diam-diam demi permission baru. Prompt final menetapkan **ASK FIRST**.
- Risiko keempat: finance fix dianggap Wave 5 polish. Di Wave 1 hanya P0 separation-of-duties/event semantics yang wajib; UI search/polish tetap Wave 5.
- Risiko kelima: parent consent policy ambigu. Executor harus memakai source of truth yang ada, memilih fail-closed/pending jika perlu, dan mendokumentasikan deferred risk bila approval dibutuhkan.
