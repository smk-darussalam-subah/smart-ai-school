# Prompt Architect Output - Review Wave 2 Phase 0/1 Setup Enrollment

Tanggal dibuat: 2026-07-16

Input handoff dari executor Wave 2:
- Wave 2 report dibuat di `docs/audits/WAVE2-PHASE0-1-SETUP-ENROLLMENT-REMEDIATION-2026-07-16.md`.
- Executor berhenti di review gate: belum commit, belum push, belum PR.
- Claimed done:
  - CSV bulk user template/parser/preview/test includes `email`.
  - PPDB state machine enforced server-side and terminal statuses protected.
  - PPDB assign lead validates active SA/TU staff.
  - PPDB accepted has explicit enrollment CTA to Data Siswa via `ppdbLeadId`.
  - Class management policy: KS read-only, SA/TU create-update, SA delete.
  - SPP setup documented/manual-only in UI/report.
- Claimed verification:
  - API focused tests: 3 suites / 90 tests pass.
  - Web CSV test: 1 suite / 3 tests pass.
  - API type-check pass.
  - Web type-check pass.
  - `git diff --check` clean for Wave 2 file(s).
- Not claimed: API lint, web lint, browser/manual QA, commit/push/PR.

## Draft Prompt Review Awal

```md
Anda adalah Codex Reviewer/Auditor untuk proyek DIIS `smart-ai-school`.

Review Wave 2 Phase 0/1 setup enrollment. Baca report, audit diff, rerun tests, type-check, lint, lalu beri verdict COMPLETE atau FOLLOW-UP REQUIRED.

Fokus:
- CSV bulk user email.
- PPDB state machine.
- PPDB accepted enrollment CTA.
- PPDB assign lead eligibility.
- Class actor policy.
- SPP manual-only contract.
- Git gate readiness.
```

## Kritik Terhadap Draft

- Draft belum menyebut bahwa worktree masih berisi Wave 1 + Wave 2 diff karena commit/push belum dilakukan. Reviewer harus memisahkan fokus review Wave 2 tanpa mengabaikan risiko staging/PR akibat diff campuran.
- Draft belum cukup kritis terhadap W2-02: explicit enrollment CTA bisa jadi hanya UI link, bukan verified backend enrollment path. Reviewer harus memastikan CTA cukup sesuai prompt atau perlu follow-up.
- Draft belum menuntut lint rerun, padahal executor hanya melaporkan type-check dan tests.
- Draft belum menuntut review terhadap browser/manual QA gap.
- Draft belum memberi output path untuk report review.
- Draft belum memberi verdict yang terkait dengan Git Gate: apakah aman commit/push/PR setelah review.
- Draft belum melarang reviewer memperbaiki code. Ini harus review-only.

## Prompt Final Untuk Reviewer

```md
Anda adalah Codex Reviewer/Auditor untuk proyek DIIS `smart-ai-school`.

## Misi

Review hasil eksekusi **Wave 2 - Phase 0/1 Setup, Provisioning, Enrollment, PPDB, Class, and SPP Setup Stabilization** secara kritis.

Tugas Anda bukan memperbaiki kode dan bukan menjalankan Git commit/push/PR. Tugas Anda adalah menentukan apakah Wave 2 layak ditutup dan aman lanjut ke Git Gate/PR, atau perlu follow-up fix dulu.

Berikan verdict:

- `COMPLETE - READY FOR GIT GATE`: Wave 2 memenuhi acceptance lokal dan boleh lanjut commit/push/PR.
- `FOLLOW-UP REQUIRED`: ada defect dalam scope Wave 2 yang harus diperbaiki sebelum commit/push/PR.
- `BLOCKED`: review tidak bisa selesai karena evidence penting tidak bisa diverifikasi.

Gunakan stance code-review: findings dulu, severity ordered, dengan file/line references.

## Konteks Wajib Dibaca

Baca sebelum review:

1. `C:\Users\USER\Documents\Claude\Projects\DIIS\AGENTS.md`
2. `C:\Users\USER\Documents\Claude\Projects\DIIS\docs\AI_CONTEXT.md`
3. `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\AGENTS.md`
4. `docs/WAYS-OF-WORKING.md`
5. `docs/decision-log.md`
6. `docs/architecture/academic-lifecycle.md`
7. `docs/audits/WAVE0-STABILIZATION-ACCEPTANCE-CONTRACT-2026-07-16.md`
8. `docs/audits/WAVE1-RBAC-OWNERSHIP-PRIVACY-REREVIEW-2026-07-16.md`
9. `docs/audits/PROMPT-ARCHITECT-WAVE2-PHASE0-1-SETUP-ENROLLMENT-2026-07-16.md`
10. `docs/audits/WAVE2-PHASE0-1-SETUP-ENROLLMENT-REMEDIATION-2026-07-16.md`
11. Source audits as needed:
    - `docs/audits/PHASE0-COMPREHENSIVE-AUDIT-2026-07-15.md`
    - `docs/audits/PHASE1-COMPREHENSIVE-AUDIT-2026-07-15.md`

## Claimed Wave 2 Result To Verify

Verify each claim directly against code/tests:

- W2-01: Bulk user CSV template/parser/preview/test includes required `email`.
- W2-02: PPDB `accepted` has explicit enrollment CTA/path to Data Siswa via `ppdbLeadId`; no PII in querystring; residual auto-create deferral is honest and justified.
- W2-03: PPDB state machine is server-enforced; invalid jumps/reverts rejected; terminal statuses protected.
- W2-04: PPDB assign lead validates assignee exists, active, not soft-deleted, has active staff, and role is SA/TU or documented allowed handler.
- W2-05: Class management policy is consistent: KS read-only, SA/TU create-update, SA delete; UI follows backend.
- W2-06: SPP setup is manual-only by explicit contract; UI/report do not imply bulk schedule generation is complete.
- No schema/dependency/seed/migration changes.
- Commit/push/PR intentionally not done pending review.

## Changed Areas To Inspect

Important: the worktree may still include Wave 1 and Wave 2 changes together because prior waves were not committed before Wave 2. Do not rubber-stamp the mixed diff. For Wave 2, focus on the files below and report separately if mixed dirty state would complicate PR packaging.

Inspect:

```powershell
git status --short
git diff --stat
git diff -- apps/api/src/ppdb apps/api/src/classes apps/api/src/finance apps/api/src/__tests__/ppdb.spec.ts apps/api/src/__tests__/classes-heatmap.spec.ts apps/api/src/__tests__/finance.spec.ts apps/web/src/app/dashboard/users apps/web/src/app/dashboard/ppdb apps/web/src/app/dashboard/kelas apps/web/src/app/dashboard/keuangan apps/web/src/__tests__/add-user-csv.test.ts docs/audits/WAVE2-PHASE0-1-SETUP-ENROLLMENT-REMEDIATION-2026-07-16.md
```

Expected Wave 2 areas:

- `apps/web/src/app/dashboard/users/_components/AddUserDialog.tsx`
- `apps/web/src/app/dashboard/users/_components/add-user-csv.ts`
- `apps/web/src/__tests__/add-user-csv.test.ts`
- `apps/api/src/ppdb/ppdb.service.ts`
- `apps/api/src/__tests__/ppdb.spec.ts`
- `apps/api/src/classes/classes.controller.ts`
- `apps/api/src/__tests__/classes-heatmap.spec.ts`
- `apps/web/src/app/dashboard/kelas/page.tsx`
- `apps/web/src/app/dashboard/kelas/_components/KelasClient.tsx`
- `apps/web/src/app/dashboard/ppdb/page.tsx`
- `apps/web/src/app/dashboard/ppdb/_components/PpdbTable.tsx`
- `apps/web/src/app/dashboard/keuangan/_components/KeuanganTable.tsx`
- `docs/audits/WAVE2-PHASE0-1-SETUP-ENROLLMENT-REMEDIATION-2026-07-16.md`

## Review Questions That Must Be Answered

### W2-01 CSV Bulk User

- Does the CSV template include every field required by backend/parser, especially `email`?
- Are parser and preview using the same column source?
- Does validation reject missing email and malformed email before submit?
- Is the parser helper pure enough to test without rendering the dialog?
- Any PII/secrets in test fixtures or docs?

### W2-02 PPDB Accepted Enrollment CTA

- Does accepted lead produce a clear enrollment action and UI CTA?
- Is `ppdbLeadId` passed without leaking name/phone/PII in querystring?
- Does the Data Siswa target page actually consume or at least preserve `ppdbLeadId` for enrollment workflow, or is this only a dead link?
- Is auto-create Student deferral justified by schema/product gaps?
- Does report clearly say "partially closed with explicit enrollment action", not "full auto-enrollment done"?
- Is repeated accepted/enrollment action safe or at least not falsely claiming idempotency?

### W2-03 PPDB State Machine

- Are allowed transitions exactly as documented, or intentionally different with rationale?
- Are invalid transitions rejected server-side with 400/409?
- Are terminal statuses `accepted` and `rejected` protected?
- Are tests covering valid sequence, invalid jump, and terminal revert?
- Does API prevent UI bypass via direct request?

### W2-04 Assign Lead Eligibility

- Does `assignLead()` validate assignee before mutation?
- Are active, non-deleted, active staff, SA/TU role conditions all checked?
- Is unassign with `assignedTo: null` still allowed?
- Are wrong role, inactive, missing staff, and deleted cases tested?
- Does validation avoid leaking unnecessary PII?

### W2-05 Class Management Actor Policy

- Is backend policy exactly SA/TU create-update, SA delete, KS read-only?
- Does UI `canManage` match server policy?
- Are direct API denied cases covered?
- Is lack of class-specific permission catalog honestly deferred?
- Does this conflict with Wave 1 permission-based architecture or is role-only policy acceptable until catalog decision?

### W2-06 SPP Setup Manual-only Contract

- Does UI clearly say manual per student/month?
- Does it avoid implying bulk schedule generation exists?
- Does service behavior remain duplicate-safe through unique `[studentId, month, year]`?
- Are duplicate and unpaid/no-event tests present or preserved?
- Is manual-only deferral acceptable and documented as product/schema decision?

### Git Gate Readiness

- Are Wave 2 changes separable from Wave 1 changes for PR packaging?
- Has executor correctly stopped before commit/push/PR for review?
- If review is COMPLETE, what exact Git Gate should happen next?
- Are there unrelated untracked files that must not be staged?
- Should Wave 0/Wave 1 and Wave 2 be separate commits/PRs? If mixed already, recommend a safe packaging strategy.

## Non-Goals

- Do not implement fixes unless the user explicitly changes the task from review to fix.
- Do not start Wave 3.
- Do not commit, push, create PR, merge, or promote staging in the reviewer session.
- Do not modify schema/dependency/seed/migration.
- Do not clean untracked historical artifacts.
- Do not update old Phase 0/1 audit reports.

## Verification Commands

Run from:

```powershell
cd C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school
```

Rerun executor checks:

```powershell
npm.cmd --workspace @smk/api run test -- ppdb.spec.ts classes-heatmap.spec.ts finance.spec.ts --runInBand --cacheDirectory=.tmp/jest-cache/api
npm.cmd --workspace @smk/web run test -- add-user-csv.test.ts --runInBand --cacheDirectory=.tmp/jest-cache/web
npm.cmd --workspace @smk/api run type-check
npm.cmd --workspace @smk/web run type-check
```

Also run the missing checks before approving:

```powershell
npm.cmd --workspace @smk/api run lint
npm.cmd --workspace @smk/web run lint
git diff --check
```

Targeted searches:

```powershell
rg -n "enrollmentRequired|enrollmentAction|ppdbLeadId|allowedTransitions|assignLead|Daftarkan sebagai siswa|canManage|manual per siswa|manual-only|email" apps/api/src apps/web/src docs/audits/WAVE2-PHASE0-1-SETUP-ENROLLMENT-REMEDIATION-2026-07-16.md
```

If command fails due to local tooling/cache, capture exact output and decide whether review can continue from other evidence.

## Optional Manual QA Review

Run if local app/browser environment is available; otherwise state not run.

1. SUPER_ADMIN/TU CSV import template and preview.
2. TU PPDB valid transition and invalid jump.
3. Accepted PPDB lead CTA to Data Siswa via `ppdbLeadId`.
4. Assign lead to eligible SA/TU and ineligible user.
5. Class management KS read-only vs SA/TU create-update vs SA delete.
6. SPP UI manual-only copy and duplicate-period handling.

Manual QA absence does not necessarily block local code review, but it must remain a residual risk before staging/prod sign-off.

## Review Report To Create

Create:

- `docs/audits/WAVE2-PHASE0-1-SETUP-ENROLLMENT-REVIEW-2026-07-16.md`

Report structure:

1. Verdict: `COMPLETE - READY FOR GIT GATE`, `FOLLOW-UP REQUIRED`, or `BLOCKED`.
2. Source docs and diffs reviewed.
3. Verification commands and results, including lint.
4. Findings, severity ordered:
   - `P0` safety/privacy/security/blocker.
   - `P1` Wave 2 acceptance incomplete or tests missing.
   - `P2` residual risk/manual QA/packaging issue.
5. Claim-by-claim audit table for W2-01 through W2-06.
6. Test coverage assessment.
7. Manual QA status.
8. Git Gate readiness:
   - whether commit/push/PR may proceed,
   - recommended commit/PR packaging,
   - any files that must not be staged.
9. Recommendation:
   - If COMPLETE: proceed to commit/push/PR according to Gate 0/Gate 1 protocol from Wave 2 prompt.
   - If FOLLOW-UP REQUIRED: list exact follow-up fixes and suggest follow-up prompt.
   - If BLOCKED: list missing evidence.

## Final Answer Reviewer Must Contain

- Verdict first.
- Findings first, with file/line references.
- Verification results.
- Whether Wave 2 report claims are accurate.
- Whether manual QA was run.
- Whether it is safe to commit/push/open PR.
- If safe, recommended next Git Gate steps.
- Path to the review report.
```

## Confidence Level

**0.91 - tinggi.**

Alasan:
- Prompt review diturunkan langsung dari Wave 2 prompt dan executor report.
- Fokus review mencakup semua W2-01 sampai W2-06 plus missing lint/Git Gate readiness.
- Prompt mempertahankan review-only boundary dan tidak menyuruh reviewer commit/push.

Yang menurunkan confidence:
- Saya belum melakukan review kode aktual; prompt ini menyiapkan sesi reviewer.
- Worktree masih mixed Wave 1 + Wave 2, sehingga reviewer harus disiplin memisahkan scope.
- Manual browser/staging QA belum dilakukan, jadi verdict mungkin hanya local code/test readiness.

## Catatan Risiko Untuk Sesi Reviewer

- Risiko terbesar: accepted PPDB CTA ternyata dead link atau tidak dikonsumsi oleh Data Siswa page. Prompt final mewajibkan cek ini.
- Risiko kedua: manual-only SPP dianggap fully automated setup. Prompt final menjaga klaimnya sebagai contract/manual decision.
- Risiko ketiga: reviewer lupa lint karena executor belum menjalankannya. Prompt final mewajibkan API/web lint.
- Risiko keempat: commit/PR packaging kacau karena Wave 0/Wave 1/Wave 2 masih dirty bersama. Prompt final meminta Git Gate readiness analysis.
- Risiko kelima: reviewer masuk ke mode fix. Prompt final melarang perubahan kode.
