# Prompt Architect Output - Wave 2 Phase 0/1 Setup Enrollment

Tanggal dibuat: 2026-07-16

Input handoff:
- Wave 1 re-review verdict: **APPROVED FOR WAVE 2 CODE WORK**.
- Re-review report: `docs/audits/WAVE1-RBAC-OWNERSHIP-PRIVACY-REREVIEW-2026-07-16.md`.
- Wave 0 recommended Wave 2: **Phase 0/1 setup and enrollment stabilization**.
- Git protocol must be included in two gates:
  1. **Gate 0:** commit and push completed Wave 0/Wave 1 artifacts and Wave 1 code before starting Wave 2.
  2. **Gate 1:** after Wave 2 implementation, commit, push feature branch, PR to CI/develop, then PR `develop -> staging` according to DIIS Gitflow.
  No direct push to protected branches.

## Draft Prompt Eksekusi Awal

```md
Anda adalah Codex Executor untuk proyek DIIS `smart-ai-school`.

Misi: eksekusi Wave 2 - Phase 0/1 setup and enrollment stabilization.

Scope:
- Fix bulk user CSV template.
- Enforce PPDB state machine.
- Ensure PPDB accepted can enroll/create student or requires explicit verified enrollment action.
- Validate PPDB assignee eligibility.
- Align class management actor/permission policy.
- Decide/implement SPP setup schedule generation or document manual-only flow.
- Add tests, run type-check/lint, update report.
- Commit, push branch, open PR to develop for CI, then promote develop to staging after review.
```

## Kritik Terhadap Draft

- Draft belum cukup tajam membedakan code fixes dari product/policy decisions. PPDB accepted-to-student dan SPP schedule generation bisa menjadi workflow besar; prompt final harus memberi batas dan acceptance yang bisa diverifikasi.
- Draft belum menyebut source docs yang wajib dibaca, termasuk Wave 0, Wave 1 re-review, Phase 0/1 audits, lifecycle, and Ways of Working.
- Draft belum mengatur schema/dependency/seed risk. Wave 2 seharusnya tidak mengubah schema/dependency tanpa approval; seed/catalog changes juga harus hati-hati karena Wave 1 deferred permission catalog.
- Draft belum cukup eksplisit soal Gitflow: feature branch dari `develop`, PR ke `develop`, CI hijau, review, merge, lalu PR `develop -> staging`. Tidak boleh direct push/merge ke `main`.
- Draft belum memuat precondition penting: Wave 0/Wave 1 work yang sudah selesai harus masuk Git dulu. Jika tidak, Wave 2 akan bercampur dengan Wave 1 diff dan audit trail menjadi kabur.
- Draft belum meminta plan critique sebelum implementasi.
- Draft belum punya focused test command yang spesifik.
- Draft belum memasukkan manual QA critical path untuk provisioning, PPDB accepted/enrollment, class policy, and SPP setup.
- Draft belum meminta done/remediation report dan PR body evidence.

## Prompt Final Untuk Executor

```md
Anda adalah Codex Executor untuk proyek DIIS `smart-ai-school`.

## Misi

Eksekusi **Wave 2 - Phase 0/1 Setup, Provisioning, Enrollment, PPDB, Class, and SPP Setup Stabilization** sampai selesai dengan standar production-grade.

Wave 2 dimulai karena Wave 1 re-review sudah `APPROVED FOR WAVE 2 CODE WORK`. Jangan masuk Phase 2 RPP, Phase 3 KBM runtime, Phase 5 report-card, atau Phase 6 semester close kecuali hanya membaca konteks.

Wave 2 juga harus mengikuti Gitflow DIIS. **Sebelum mulai implementasi Wave 2, pastikan Wave 0/Wave 1 artifacts dan Wave 1 code sudah di-commit, di-push, dan masuk PR/CI sesuai protokol.** Setelah implementasi Wave 2 dan verifikasi lokal, buat commit Wave 2 terpisah, push feature branch, buka PR ke `develop` untuk CI/review, lalu setelah merge/review siap, buat PR promosi `develop -> staging`. Jangan push langsung ke `main`, `staging`, atau `develop`.

## Konteks Wajib Dibaca

Sebelum implementasi, baca:

1. `C:\Users\USER\Documents\Claude\Projects\DIIS\AGENTS.md`
2. `C:\Users\USER\Documents\Claude\Projects\DIIS\docs\AI_CONTEXT.md`
3. `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\AGENTS.md`
4. `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\docs\WAYS-OF-WORKING.md`
5. `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\docs\decision-log.md`
6. `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\docs\architecture\academic-lifecycle.md`
7. `docs/audits/WAVE0-STABILIZATION-ACCEPTANCE-CONTRACT-2026-07-16.md`
8. `docs/audits/WAVE1-RBAC-OWNERSHIP-PRIVACY-REREVIEW-2026-07-16.md`
9. `docs/audits/PHASE0-COMPREHENSIVE-AUDIT-2026-07-15.md`
10. `docs/audits/PHASE1-COMPREHENSIVE-AUDIT-2026-07-15.md`

## Goal

- Close Wave 2 backlog items W2-01 sampai W2-06 from Wave 0.
- Stabilize Phase 0 provisioning and Phase 1 enrollment/setup so later academic waves do not inherit broken setup data.
- Add focused tests for PPDB state transitions, accepted-to-enrollment behavior, assignee eligibility, class policy, CSV template/import, and SPP setup decision.
- Update/create Wave 2 remediation report.
- Commit and push through Gitflow PR path to CI and staging promotion PR, if repository credentials/tools allow.
- Keep Wave 2 work separate from Wave 0/Wave 1 commits and PRs.

## Non-Goal

- Jangan mengerjakan Phase 2 Modul Ajar/RPP body/AI/draft-save.
- Jangan mengerjakan Phase 3 assessment timer, LMS runtime, class session, or SSE.
- Jangan mengerjakan Phase 4 operations beyond SPP setup boundary.
- Jangan mengerjakan Phase 5 report-card pipeline.
- Jangan mengerjakan Phase 6 semester close.
- Jangan membersihkan untracked/historical artifacts.
- Jangan mengubah Prisma schema tanpa approval eksplisit.
- Jangan menambah dependency tanpa approval eksplisit.
- Jangan mengubah seed/catalog permission tanpa approval eksplisit.
- Jangan push langsung ke `main`, `staging`, atau `develop`.
- Jangan menggunakan `--delete-branch` pada `develop`, `staging`, or `main`.
- Jangan mengklaim staging/prod ready tanpa browser/staging QA.

## Temuan Audit Yang Wajib Ditutup

### P1

1. **W2-01 - Bulk user CSV template invalid and blocks mass provisioning.**
   - Source: Phase 0 audit.
   - Scope: user/provisioning UI and import boundary.
   - Required: template includes required fields such as `email`; import validation and preview agree with backend requirements.
   - Tests: template headers include required fields; valid row passes; missing email/required row fails with clear error.
   - Manual QA: SUPER_ADMIN/TU download template, fill valid row, import/preview/submit.

2. **W2-02 - PPDB accepted status does not enroll/create a Student.**
   - Source: Phase 1 audit.
   - Required: choose and implement one verified flow:
     - Preferred if existing APIs support it without schema change: accepting a paid/registered lead triggers or exposes explicit enrollment creation through backend service with idempotency.
     - Acceptable: `accepted` requires an explicit "Enroll/Create Student" action, but API and UI must make that action unavoidable, clear, and verified.
   - Must integrate with Wave 1 consent policy and parent/student ownership.
   - Tests: lead can move through valid statuses to accepted; accepted lead creates/links student or blocks until required enrollment action is completed; repeated action is idempotent/safe.

3. **W2-03 - PPDB state machine is UI-only and not enforced by API.**
   - Source: Phase 1 audit.
   - Required: server enforces allowed status transitions, protects terminal statuses, and rejects invalid jumps/reverts with 400/409.
   - Tests: valid transition matrix and invalid transition matrix.

4. **W2-04 - PPDB assignLead does not validate assignee role or staff eligibility.**
   - Source: Phase 1 audit.
   - Required: assignee must be active/eligible staff/user with allowed PPDB handling role or permission. Deleted/inactive/wrong-role target must be rejected.
   - Tests: assign to TU/eligible handler succeeds; assign to SISWA/GURU without PPDB handler permission fails.

5. **W2-05 - Class management actor contract is inconsistent.**
   - Source: Phase 1 audit and Wave 1 permission stabilization.
   - Required: align class create/update/delete/page affordance with lifecycle and permission-based architecture.
   - Use existing permission catalog if possible. If missing permission requires seed/catalog change, ask approval before changing seed.
   - At minimum, controller/page/service behavior must be internally consistent and fail closed.
   - Tests: allowed actor can create/update; denied actor cannot; UI hides or blocks denied action; no fake success.

6. **W2-06 - SPP setup is manual, not schedule generation.**
   - Source: Phase 1 audit and Wave 0 note that this is product decision.
   - Required: decide and implement/document one approach:
     - **Manual-only contract:** UI/docs clearly state SPP setup is per-record manual for now; no lifecycle claim that bulk schedule is complete.
     - **Duplicate-safe schedule generation:** implement idempotent monthly schedule generation for class/student/year if existing schema supports it.
   - If implementation requires schema migration or major workflow, ask approval and document deferred decision instead of half-building it.
   - Tests: manual flow documented/tested, or generator idempotency and uniqueness tested.

### P2 / Opportunistic but bounded

- Local public PPDB form wiring: inspect whether public form still exists and is un-wired. If a small safe wiring exists, fix it; otherwise document as deferred with path and reason.
- TeachingAssignment `academicYear` query validation: add if touching teaching assignment DTO/tests; otherwise defer to Wave 8 minor DTO cleanup.
- PPDB pagination/filtering cap and broad UI error masking are Wave 8 unless directly touched by W2 fixes.
- Calendar validation/delete confirmation are not Wave 2 unless a touched shared component requires it.

## Prinsip Implementasi

- Ikuti pola existing repo.
- Strict TypeScript, no new `any`.
- Zod DTO validation; do not introduce `class-validator`.
- Authorization fail-closed and service-level checks remain mandatory.
- API errors must be clear: 400/403/404/409 as appropriate.
- UI must not show fake/local-only success for backend workflows.
- No PII/secrets in logs, docs, tests, or commits.
- Use existing helpers/services before adding abstractions.
- Keep edits scoped to Phase 0/1 setup/enrollment.

## Proses Wajib

1. Inspect worktree:
   - `git status --short`
   - Preserve existing unrelated/untracked artifacts.
2. **Gate 0 - Commit/push completed Wave 0 and Wave 1 before Wave 2:**
   - If Wave 0/Wave 1 code, tests, and audit artifacts are still uncommitted, stop Wave 2 implementation and complete the Wave 0/Wave 1 Gitflow first.
   - Include Wave 0 docs because they are the acceptance contract and source evidence for later waves.
   - Include Wave 1 prompt/report/review/follow-up/re-review artifacts with Wave 1 code because they are the audit trail for the security remediation.
   - Do not mix Wave 2 code into the Wave 1 commit/PR.
3. Confirm current branch and base for Wave 2:
   - Work from `develop` or a feature branch based on current `develop`.
   - If not on a suitable branch, create `feat/wave2-phase0-phase1-setup` from `develop`.
4. Buat plan detail.
5. Kritik plan Anda sendiri:
   - Apakah scope terlalu luas?
   - Apakah PPDB enrollment atau SPP schedule butuh schema/seed approval?
   - Apakah tests menutup invalid transitions and negative roles?
   - Apakah UI action benar-benar memanggil backend?
   - Apakah Gitflow steps aman untuk protected branches?
6. Tampilkan fixed plan.
7. Implementasi code.
8. Tambah/update tests.
9. Jalankan verifikasi.
10. Buat report:
   - `docs/audits/WAVE2-PHASE0-1-SETUP-ENROLLMENT-REMEDIATION-2026-07-16.md`
11. Commit, push feature branch, buka PR to `develop`, watch CI, then prepare/promote `develop -> staging` PR only after develop PR is reviewed/merged or explicitly authorized.

## Acceptance Criteria 100%

- W2-01 sampai W2-06 closed, or explicitly deferred only where schema/seed/product approval is required.
- CSV template/import no longer has impossible required-field mismatch.
- PPDB transitions are server-enforced.
- Accepted PPDB lead has verified enrollment path: auto-create/link or explicit required action.
- PPDB assignee eligibility is validated.
- Class management actor contract is consistent across API/page/service/permissions.
- SPP setup contract is explicit: manual-only documented or duplicate-safe generator implemented.
- Focused tests pass.
- API/web type-check and lint pass.
- Manual QA steps are documented and run if local/browser environment is available.
- Report includes files changed, commands/results, deferred risks, PR links or PR blocker reason.
- Git commit exists with conventional commit message.
- Feature branch pushed and PR to `develop` opened for CI if credentials/tools allow.
- After develop PR is green and reviewed/merged, PR `develop -> staging` is opened or prepared according to repository permissions.

## Verification Commands Minimal

Run from:

```powershell
cd C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school
```

Static checks:

```powershell
npm.cmd --workspace @smk/api run type-check
npm.cmd --workspace @smk/web run type-check
npm.cmd --workspace @smk/api run lint
npm.cmd --workspace @smk/web run lint
```

Focused tests. Adjust filenames only after discovery, but keep coverage equivalent:

```powershell
npm.cmd --workspace @smk/api test -- --runInBand --cacheDirectory ../../.tmp/jest-cache src/__tests__/provisioning.spec.ts src/__tests__/users.spec.ts src/__tests__/student.spec.ts src/__tests__/ppdb.spec.ts src/__tests__/classes-heatmap.spec.ts src/__tests__/teaching-assignment.spec.ts src/__tests__/finance.spec.ts
```

If web tests exist for provisioning/PPDB/classes, run them. If not, add the smallest practical mapper/action/component test or document why manual QA is required.

Whitespace/diff checks:

```powershell
git diff --check
git status --short
```

## Manual QA Critical Path

Run if local/browser environment is available; otherwise document not run and include exact steps for staging.

1. SUPER_ADMIN/TU bulk user import:
   - Open `/dashboard/users`.
   - Download CSV template.
   - Fill a valid user row with email and required fields.
   - Import/preview/submit.
   - Expected: valid row accepted; missing email row rejected with row-level error.

2. TU PPDB state machine:
   - Open PPDB dashboard.
   - Move lead through valid sequence.
   - Try invalid jump/revert.
   - Expected: valid transition succeeds; invalid transition shows server error and does not mutate status.

3. TU PPDB accepted enrollment:
   - Move eligible lead to `accepted`.
   - Execute enrollment action if explicit, or verify auto-create if implemented.
   - Expected: Student/user/parent linkage appears; repeated action is safe.

4. PPDB assign lead:
   - Assign to eligible TU/staff.
   - Try assign to ineligible SISWA/GURU/deleted/inactive user.
   - Expected: eligible succeeds; ineligible 400/403/409.

5. Class management:
   - Login allowed actor and create/update class/wali.
   - Login denied actor and try same action/direct API.
   - Expected: allowed succeeds; denied fails closed with no fake UI success.

6. SPP setup:
   - If manual-only: create one unpaid SPP record and verify UI/docs make manual contract clear.
   - If generator: generate monthly schedule for class/student, run again, verify no duplicates.

## Git, Commit, PR, CI, and Staging Protocol

Follow DIIS Gitflow from `docs/WAYS-OF-WORKING.md`.

### Gate 0 - Commit and Push Wave 0/Wave 1 First

Before implementing Wave 2, ensure the completed Wave 0/Wave 1 work is no longer just a dirty local diff.

Recommendation:

- **Wave 0 should be pushed.** It is the acceptance contract and dependency graph for the whole remediation program, so keeping it local-only would weaken auditability.
- Wave 0 docs can be included in the Wave 1 security PR if they are not already committed, because Wave 1 execution/review depends on them.
- Prefer one coherent pre-Wave-2 PR such as `fix/wave1-rbac-ownership-privacy` containing:
  - Wave 0 acceptance contract and Prompt Architect artifacts,
  - Wave 1 prompt/review/follow-up/re-review artifacts,
  - Wave 1 API/web code and tests,
  - Wave 1 remediation/review/follow-up/re-review reports.
- If the team prefers smaller history, split Wave 0 docs into a separate `docs(wave0): add remediation acceptance contract` commit before the Wave 1 code commit, but both may live in the same PR if review policy allows.

Suggested commands for Gate 0, adjusted to current branch state:

```powershell
git status --short
git switch -c fix/wave1-rbac-ownership-privacy
git add docs/audits/PROMPT-ARCHITECT-TEMPLATE-REMEDIATION-WAVES.md docs/audits/PROMPT-ARCHITECT-WAVE0-STABILIZATION-ACCEPTANCE-CONTRACT-2026-07-16.md docs/audits/WAVE0-STABILIZATION-ACCEPTANCE-CONTRACT-2026-07-16.md
git add docs/audits/PROMPT-ARCHITECT-WAVE1-RBAC-OWNERSHIP-PRIVACY-2026-07-16.md docs/audits/WAVE1-RBAC-OWNERSHIP-PRIVACY-REMEDIATION-2026-07-16.md docs/audits/PROMPT-ARCHITECT-REVIEW-WAVE1-RBAC-OWNERSHIP-PRIVACY-2026-07-16.md docs/audits/WAVE1-RBAC-OWNERSHIP-PRIVACY-REVIEW-2026-07-16.md docs/audits/PROMPT-ARCHITECT-FOLLOWUP-WAVE1-RBAC-OWNERSHIP-PRIVACY-2026-07-16.md docs/audits/WAVE1-RBAC-OWNERSHIP-PRIVACY-FOLLOWUP-2026-07-16.md docs/audits/WAVE1-RBAC-OWNERSHIP-PRIVACY-REREVIEW-2026-07-16.md
git add apps/api/src apps/web/src
git diff --cached --stat
git commit -m "fix(wave1): harden rbac ownership and privacy"
git push -u origin fix/wave1-rbac-ownership-privacy
gh pr create --base develop --head fix/wave1-rbac-ownership-privacy --title "fix(wave1): harden RBAC ownership and privacy" --body-file docs/audits/WAVE1-RBAC-OWNERSHIP-PRIVACY-REREVIEW-2026-07-16.md
gh pr checks --watch
```

Important:

- Stage only intended Wave 0/Wave 1 files; inspect `git diff --cached --stat` before commit.
- Do not stage unrelated temporary files or historical artifacts.
- If branch already exists, do not recreate it; continue safely on the existing feature branch.
- If `gh` auth is unavailable, push the branch and create a PR body file, then report the blocker.
- Do not start Wave 2 implementation until Gate 0 is at least pushed and PR-created, unless the user explicitly authorizes local-only continuation.

### Branch

```powershell
git status --short
git fetch origin
git switch develop
git pull --ff-only origin develop
git switch -c feat/wave2-phase0-phase1-setup
```

If current work already exists on a feature branch, do not discard it. Confirm it is based on current `develop` or rebase/merge carefully without losing user changes.

### Commit

Before committing:

```powershell
git diff --check
git status --short
git diff --cached --stat
```

Stage only intended files:

```powershell
git add <intended files only>
git diff --cached --stat
git commit -m "fix(wave2): stabilize setup and enrollment flows"
```

Do not stage unrelated untracked artifacts.

### Push Feature Branch and Open PR to `develop`

If credentials and `gh` are available:

```powershell
git push -u origin feat/wave2-phase0-phase1-setup
gh pr create --base develop --head feat/wave2-phase0-phase1-setup --title "fix(wave2): stabilize setup and enrollment flows" --body-file docs/audits/WAVE2-PHASE0-1-SETUP-ENROLLMENT-REMEDIATION-2026-07-16.md
gh pr checks --watch
```

If `gh` is unavailable or auth fails, push the branch if possible and create `docs/audits/WAVE2-PR-BODY-2026-07-16.md` containing title, summary, test evidence, risk, and manual QA. Report the blocker.

### Merge/Promote to Staging

Do **not** merge without required review/approval.

After PR to `develop` is green and reviewed/merged, prepare PR `develop -> staging`:

```powershell
git switch develop
git pull --ff-only origin develop
gh pr create --base staging --head develop --title "promote: Wave 2 setup and enrollment stabilization to staging" --body-file docs/audits/WAVE2-PHASE0-1-SETUP-ENROLLMENT-REMEDIATION-2026-07-16.md
gh pr checks --watch
```

Only merge the `develop -> staging` PR if authorized and review/CI requirements are satisfied. Never use `--delete-branch` on `develop`, `staging`, or `main`. Do not open/merge `staging -> main` in this task.

## Laporan Yang Harus Dibuat

Buat:

- `docs/audits/WAVE2-PHASE0-1-SETUP-ENROLLMENT-REMEDIATION-2026-07-16.md`

Isi minimal:

- Scope Wave 2.
- Source docs read.
- Plan, critique, fixed plan.
- Findings closed W2-01 to W2-06.
- P2 handled/deferred.
- Files changed.
- Tests and command results.
- Manual QA result or not-run reason.
- Schema/dependency/seed/migration status.
- Git branch, commit hash, PR link(s), CI status, staging PR status or blocker.
- Residual risks.
- Next recommendation: review Wave 2 before Wave 3.

## Final Answer Executor Harus Berisi

- Summary perubahan.
- File utama diubah.
- Test/verification results.
- Manual QA status.
- Schema/dependency/seed/migration: yes/no.
- Commit hash.
- Feature branch.
- PR to `develop` link and CI status.
- Staging PR link/status or blocker.
- Deferred risks.
- Next recommendation.
```

## Confidence Level

**0.90 - tinggi.**

Alasan:
- Wave 1 re-review explicitly approves moving to Wave 2 code work.
- Wave 0 defines W2-01 through W2-06 and acceptance contract clearly.
- Prompt final keeps Wave 2 bounded to Phase 0/1 setup and enrollment stabilization while adding requested Gitflow/PR/staging protocol.

Yang menurunkan confidence:
- PPDB accepted-to-enrollment and SPP schedule generation may require product decisions if existing schema/UI does not support a clean implementation.
- Git/PR commands depend on local branch state, remote access, and `gh` authentication.
- Staging promotion requires review/merge authority; prompt includes blocker reporting if authorization/tooling is unavailable.

## Catatan Risiko Untuk Sesi Executor

- Risiko scope creep: PPDB enrollment can become a full admissions redesign. Keep it to verified accepted-to-student path or explicit required enrollment action.
- Risiko schema drift: do not add fields or permission catalog entries without approval.
- Risiko Gitflow: do not push directly to protected branches and do not delete `develop`, `staging`, or `main`.
- Risiko false completion: if SPP schedule remains manual, lifecycle/report/UI must explicitly say manual-only so it is not claimed as automated schedule generation.
- Risiko promotion: staging PR is not production sign-off; browser QA still required before production promotion.
