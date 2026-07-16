# Prompt Architect Output - Review Wave 1 RBAC Ownership Privacy

Tanggal dibuat: 2026-07-16

Input handoff dari executor Wave 1:
- Wave 1 remediation report dibuat di `docs/audits/WAVE1-RBAC-OWNERSHIP-PRIVACY-REMEDIATION-2026-07-16.md`.
- Claimed closed: W1-01, W1-02, W1-03, W1-04, W1-05, W1-06, W1-07, W1-09, W1-10.
- Deferred: W1-08 school period/org endpoint permission catalog decision.
- Claimed verification: API focused tests 7 suites / 168 tests pass; API/web type-check pass; API/web lint pass with existing Next lint warning.
- Claimed no schema/dependency/seed/migration changes and no manual browser/staging QA.

## Draft Prompt Review Awal

```md
Anda adalah Codex Reviewer/Auditor untuk proyek DIIS `smart-ai-school`.

Review hasil Wave 1 RBAC/Ownership/Privacy. Baca report Wave 1, audit diff, jalankan test relevan, lalu tentukan apakah Wave 1 layak dianggap complete atau perlu follow-up fix.

Fokus review:
- RBAC any-permission.
- Ownership GURU/SISWA/ORANG_TUA.
- Report-card distributed privacy gate.
- Finance create/approve.
- PDP consent assignParent.
- Permission override deny.
- Positions transaction.
- Parent multi-child binding.

Jangan implement fix. Buat report review dan final verdict.
```

## Kritik Terhadap Draft

- Draft belum memaksa reviewer membaca Wave 0 acceptance contract dan prompt Wave 1, sehingga review bisa hanya membandingkan terhadap ringkasan executor.
- Draft belum menyebut file yang berubah dan area yang harus ditrace dari controller ke service ke tests.
- Draft belum cukup eksplisit bahwa review harus memimpin dengan findings seperti code review, bukan summary.
- Draft belum memberi checklist klaim executor vs bukti: code diff, test coverage, negative cases, and report accuracy.
- Draft belum menekan risiko utama: `@RequirePermission()` any-permission bisa fail-open jika implementasi guard salah; report-card section endpoints bisa tetap live-data; parent UI binding bisa menahan leak tanpa benar-benar fetch child-specific data; finance event bisa double-emit atau approval bisa tidak idempotent.
- Draft belum memuat commands untuk rerun verification dan grep targeted.
- Draft belum mengatur output: verdict complete/follow-up/blocker, review report path, and next prompt recommendation.
- Draft belum melarang reviewer mengubah kode, padahal user meminta prompt review.

## Prompt Final Untuk Reviewer

```md
Anda adalah Codex Reviewer/Auditor untuk proyek DIIS `smart-ai-school`.

## Misi

Review hasil eksekusi **Wave 1 - RBAC, Ownership, Privacy** secara kritis.

Tugas Anda bukan melanjutkan Wave 2 dan bukan langsung memperbaiki kode. Tugas Anda adalah membuktikan apakah klaim Wave 1 benar-benar memenuhi acceptance contract, menemukan regression/security gap jika ada, lalu menghasilkan verdict:

- `COMPLETE`: Wave 1 layak ditutup dan bisa lanjut Prompt Architect Wave 2.
- `FOLLOW-UP REQUIRED`: ada defect dalam scope Wave 1 yang harus diperbaiki dulu.
- `BLOCKED`: review tidak bisa diselesaikan karena test/tooling/data penting tidak bisa diverifikasi.

Gunakan stance code-review: findings dulu, urut severity, dengan file/line reference. Jangan menulis ringkasan optimistis sebelum risiko utama diuji.

## Konteks Wajib Dibaca

Baca sebelum review:

1. `C:\Users\USER\Documents\Claude\Projects\DIIS\AGENTS.md`
2. `C:\Users\USER\Documents\Claude\Projects\DIIS\docs\AI_CONTEXT.md`
3. `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\AGENTS.md`
4. `docs/WAYS-OF-WORKING.md`
5. `docs/decision-log.md`
6. `docs/architecture/academic-lifecycle.md`
7. `docs/audits/WAVE0-STABILIZATION-ACCEPTANCE-CONTRACT-2026-07-16.md`
8. `docs/audits/PROMPT-ARCHITECT-WAVE1-RBAC-OWNERSHIP-PRIVACY-2026-07-16.md`
9. `docs/audits/WAVE1-RBAC-OWNERSHIP-PRIVACY-REMEDIATION-2026-07-16.md`
10. Source audit files only as needed for source evidence:
    - `docs/audits/PHASE0-COMPREHENSIVE-AUDIT-2026-07-15.md`
    - `docs/audits/PHASE1-COMPREHENSIVE-AUDIT-2026-07-15.md`
    - `docs/audits/PHASE2-COMPREHENSIVE-AUDIT-2026-07-15.md`
    - `docs/audits/PHASE3-COMPREHENSIVE-AUDIT-2026-07-15.md`
    - `docs/audits/PHASE4-COMPREHENSIVE-AUDIT-2026-07-15.md`
    - `docs/audits/PHASE5-COMPREHENSIVE-AUDIT-2026-07-15.md`
    - `docs/audits/PHASE6-COMPREHENSIVE-AUDIT-2026-07-15.md`

## Claimed Wave 1 Result To Verify

Executor claims:

- RBAC `@RequirePermission()` supports alternative/any permissions for own/child routes.
- GURU access is scoped for `/students`, `/students/:id`, grades, attendance, report-card sections, and class activities.
- SISWA/ORANG_TUA report-card list and section endpoints are forced to `distributed`.
- Finance create/approve is separated: create unpaid/no event, approve paid plus `payment.received`.
- `assignParent()` propagates `consentAt` to student user and parent user.
- Permission override `grant: false` creates a real deny/revoke override.
- Position assign/unassign wraps DB assignment and permission override writes in transactions.
- Parent dashboard active child binding prevents cross-child leakage.
- Focused tests passed: 7 suites, 168 tests.
- API/web type-check and lint passed.
- No schema, dependency, seed, or migration changes.
- Deferred: school period/org endpoint permission catalog decision.

## Changed Areas To Inspect

Start with:

```powershell
git status --short
git diff --stat
git diff -- apps/api/src/permissions apps/api/src/positions apps/api/src/student apps/api/src/report-cards apps/api/src/class-activities apps/api/src/finance apps/api/src/wa-log apps/api/src/analytics apps/api/src/rpp apps/api/src/student-dashboard apps/web/src/app/dashboard/akademik docs/audits/WAVE1-RBAC-OWNERSHIP-PRIVACY-REMEDIATION-2026-07-16.md
```

Expected changed file groups include:

- `apps/api/src/permissions/*`
- `apps/api/src/positions/positions.service.ts`
- `apps/api/src/student/*`
- `apps/api/src/report-cards/*`
- `apps/api/src/class-activities/*`
- `apps/api/src/finance/*`
- `apps/api/src/wa-log/*`
- `apps/api/src/analytics/*`
- `apps/api/src/rpp/*`
- `apps/api/src/student-dashboard/*`
- `apps/web/src/app/dashboard/akademik/*ortu*`
- API tests for permissions, positions, student, finance, report-cards/class-activities, wa-log, analytics.

## Review Questions That Must Be Answered

### Security and Authorization

- Does `@RequirePermission()` any-permission fail closed when no user, no permissions, malformed metadata, or empty permission list?
- Does any-permission preserve single-permission routes exactly as before?
- Are controller roles and permissions aligned, or can a role pass `@Roles()` but fail all permissions unexpectedly?
- Are service-level ownership checks present behind every UI/page/controller gate?
- Do denied cases return 401/403 rather than empty success or filtered fake success?

### W1-01 GURU Scope

- Can GURU still enumerate all students through list filters, detail, grades, attendance, report-card section endpoints, or class activity reads?
- Is assigned-class resolution based on teaching assignments/wali relationship and not user-controlled classId?
- Do tests include both allowed assigned student and denied unassigned student?
- Do report-card section endpoints avoid leaking live sections for out-of-scope students?

### W1-02 PDP Consent

- Does `assignParent()` propagate consent in the same transaction as parent binding?
- Does it update the correct auth users for student and parent, not only student records?
- Is consent timestamp behavior documented honestly in the report?
- Is PII avoided in logs/audit output?

### W1-03 Permission Mismatch

- Finance own/child, student own/child, WA child log, analytics own/child, RPP review, and report review gates match seeded/effective permissions?
- WAKA access is internally consistent: allowed where Wave 1 says allowed, denied where non-academic powers remain out of scope.
- Deferred school period/org catalog decision is valid and not hiding an active P0 leak.

### W1-04 Report Privacy

- Can SISWA/ORANG_TUA pass `?status=draft`, `checked`, or `published` and receive non-distributed reports?
- Do section endpoints require a distributed report for the requested year/semester before returning live section data?
- Is Wave 6 residual risk clearly preserved: section content may still be live data, not immutable snapshot?

### W1-05 Class Activity Ownership

- Can GURU create/update/delete only assigned-class activities?
- Does owner-only update/delete remain correct for GURU?
- Can SISWA/ORANG_TUA only read own/child class activities if endpoints expose them?
- Can elevated roles still perform intended oversight without bypassing privacy for lower roles?

### W1-06 Finance Semantics

- Does create always default to unpaid and avoid `paidAt` plus `payment.received`?
- Does approve transition status to paid, set `paidAt`, `approvedBy`, `approvedAt`, and emit exactly when expected?
- Is approval idempotent or at least safe from repeated event emission?
- Can TU self-approve or otherwise bypass separation of duties?
- Can SISWA/ORANG_TUA read only own/child records with correct permission alternatives?

### W1-07 Parent Multi-Child Binding

- Does active child selection change actual data shown, or only hide stale first-child data?
- Are panels safe when payload lacks `studentId`?
- Is the executor's residual risk about server fetch completeness honest and sufficient?
- Could an ORANG_TUA see child A finance/WA/grades under child B label after switching or reload?

### W1-09 Permission Override Deny

- Does `grant:false` create deny semantics that override role-granted permission?
- Is cache invalidated for the affected user?
- Are tests covering grant true, deny false, revoke/removal, and effective access?

### W1-10 Position Transaction

- Are DB writes for staff position and permission overrides inside one Prisma transaction?
- Is Keycloak sync correctly outside the transaction and fail-soft?
- On unassign, are unsupported overrides removed without removing permissions still supported by another active position?
- Are tests strong enough, or only unit-level with mocked transaction?

## Non-Goals

- Do not implement fixes unless the user explicitly changes this from review to fix.
- Do not start Wave 2.
- Do not refactor unrelated code.
- Do not change schema/dependency/seed/migration.
- Do not clean untracked historical artifacts.
- Do not update Phase 0-6 audit reports.

## Verification Commands

Run from:

```powershell
cd C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school
```

At minimum rerun the executor's claimed checks:

```powershell
npm.cmd --workspace @smk/api test -- --runInBand --cacheDirectory ../../.tmp/jest-cache src/__tests__/permissions.spec.ts src/__tests__/student.spec.ts src/__tests__/finance.spec.ts src/__tests__/report-cards-activities.spec.ts src/__tests__/wa-log.spec.ts src/__tests__/analytics.spec.ts src/__tests__/positions.spec.ts
npm.cmd --workspace @smk/api run type-check
npm.cmd --workspace @smk/web run type-check
npm.cmd --workspace @smk/api run lint
npm.cmd --workspace @smk/web run lint
```

Also run targeted searches and inspect results:

```powershell
rg -n "@RequirePermission|grant: false|grant\\s*===\\s*false|\\$transaction|payment\\.received|distributed|WAKA_KURIKULUM|finance\\.own\\.read|finance\\.child\\.read|grade\\.own\\.read|grade\\.child\\.read|attendance\\.own\\.read|attendance\\.child\\.read|student\\.child\\.read|report\\.review|rpp\\.review" apps/api/src apps/web/src/app/dashboard/akademik
```

If any command fails due to pre-existing tooling, capture exact output and decide whether review is still possible from focused evidence.

## Optional Manual QA Review

If local app/browser environment is available, run a small manual smoke review:

1. GURU assigned vs unassigned student access.
2. SISWA/ORANG_TUA report-card `status` query privacy.
3. TU create SPP then KS/SA approve.
4. ORANG_TUA switch child and inspect finance/grades/WA/report panels.
5. WAKA opens allowed academic review path and is denied non-academic high-power path.

If manual QA is not run, say so clearly and do not use "browser verified" language.

## Review Report To Create

Create:

- `docs/audits/WAVE1-RBAC-OWNERSHIP-PRIVACY-REVIEW-2026-07-16.md`

Report structure:

1. Verdict: `COMPLETE`, `FOLLOW-UP REQUIRED`, or `BLOCKED`.
2. Source docs and diffs reviewed.
3. Verification commands and results.
4. Findings, severity ordered:
   - `P0` security/privacy/data leak/blocker.
   - `P1` incomplete Wave 1 acceptance or missing negative tests.
   - `P2` residual risk/documentation/test-strength issue.
5. Claim-by-claim audit table for W1-01, W1-02, W1-03, W1-04, W1-05, W1-06, W1-07, W1-08 deferred, W1-09, W1-10.
6. Test coverage assessment.
7. Manual QA status.
8. Deferred risks that remain valid.
9. Recommendation:
   - If COMPLETE: generate/approve Prompt Architect for Wave 2.
   - If FOLLOW-UP REQUIRED: list exact follow-up fixes and suggest a follow-up prompt for Wave 1.
   - If BLOCKED: list what evidence is missing.

## Final Answer Reviewer Must Contain

- Verdict first.
- Findings first, with file/line references.
- Verification results.
- Whether Wave 1 report claims are accurate.
- Whether manual QA was run.
- Whether it is safe to proceed to Wave 2.
- Path to the review report.
```

## Confidence Level

**0.92 - tinggi.**

Alasan:
- Prompt review diturunkan langsung dari Wave 1 prompt, Wave 0 acceptance contract, dan remediation report executor.
- Review focus sudah diarahkan ke klaim berisiko tinggi: any-permission fail-closed, data ownership, report privacy, finance event semantics, consent propagation, transactions, and child binding.
- Prompt melarang implementasi fix agar sesi reviewer tetap audit murni.

Yang menurunkan confidence:
- Saya belum melakukan review kode aktual; prompt ini hanya menyiapkan reviewer.
- Beberapa kualitas review bergantung pada ketersediaan local test env dan apakah test fixtures cukup representatif.
- Manual browser/staging QA tidak dilakukan oleh executor, sehingga reviewer mungkin hanya bisa memberi verdict "complete for code/test review, manual QA pending".

## Catatan Risiko Untuk Sesi Reviewer

- Risiko terbesar adalah rubber-stamp: reviewer hanya membaca report Wave 1 tanpa trace diff. Prompt final mewajibkan diff dan claim-by-claim audit.
- Risiko kedua adalah reviewer masuk ke mode fix. Prompt final melarang implementasi kecuali user mengubah mandat.
- Risiko ketiga adalah test hijau tetapi coverage negatif kurang. Prompt final meminta reviewer menilai kekuatan test, bukan hanya status pass.
- Risiko keempat adalah live-data report-card section dianggap solved total. Prompt final mempertahankan residual Wave 6 snapshot-vs-live risk.
- Risiko kelima adalah parent multi-child fix hanya UI filtering. Prompt final meminta reviewer membedakan leak prevention dari completeness per-child refresh.
