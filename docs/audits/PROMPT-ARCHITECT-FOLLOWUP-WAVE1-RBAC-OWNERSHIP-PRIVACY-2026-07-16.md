# Prompt Architect Output - Follow-up Wave 1 RBAC Ownership Privacy

Tanggal dibuat: 2026-07-16

Input handoff dari reviewer Wave 1:
- Review report: `docs/audits/WAVE1-RBAC-OWNERSHIP-PRIVACY-REVIEW-2026-07-16.md`
- Verdict: **FOLLOW-UP REQUIRED**
- Wave 1 tidak boleh lanjut ke Wave 2 sebelum follow-up kecil ini selesai dan direview ulang.

## Draft Prompt Eksekusi Awal

```md
Anda adalah Codex Executor untuk proyek DIIS `smart-ai-school`.

Misi: follow-up fix Wave 1 berdasarkan review.

Perbaiki:
- Parent multi-child data binding yang masih first-child/server-incomplete.
- SPP UI shape mismatch.
- GURU scoped list endpoint yang silently ignores forbidden classId.
- Tambah tests untuk coverage gaps.

Jangan lanjut Wave 2. Jangan ubah schema/dependency/seed. Jalankan focused tests, type-check, lint, update report.
```

## Kritik Terhadap Draft

- Draft belum menyebut review report sebagai sumber utama dan belum meminta executor membaca prompt/reports Wave 0/Wave 1.
- Draft belum cukup membatasi scope: parent multi-child completeness harus ditutup untuk panel Wave 1, tapi tidak boleh berubah menjadi rewrite dashboard ORANG_TUA total.
- Draft belum menjelaskan kebijakan `classId` forbidden: fail-closed 403 vs strict empty intersection. Untuk keamanan dan auditability, prompt final harus memilih policy eksplisit atau meminta executor mendokumentasikan keputusan.
- Draft belum memasukkan P2 wali-only class access. Ini bukan data leak, tetapi mudah diselesaikan jika resolver sudah disentuh; jika tidak, minimal harus didokumentasikan.
- Draft belum meminta update report review/follow-up secara terpisah, sehingga hasil bisa bercampur dengan report Wave 1 awal.
- Draft belum mencantumkan test command yang spesifik untuk web/API files terdampak.
- Draft belum memaksa manual QA steps dengan parent dua anak dan GURU forbidden `classId`.

## Prompt Final Untuk Executor

```md
Anda adalah Codex Executor untuk proyek DIIS `smart-ai-school`.

## Misi

Eksekusi **Follow-up Wave 1 - RBAC/Ownership/Privacy Fixes After Review** sampai selesai.

Ini adalah follow-up kecil untuk menutup verdict reviewer `FOLLOW-UP REQUIRED`, bukan wave baru. Jangan lanjut Wave 2 sampai follow-up ini selesai, report dibuat, dan hasilnya siap direview ulang.

## Konteks Wajib Dibaca

Sebelum implementasi, baca:

1. `C:\Users\USER\Documents\Claude\Projects\DIIS\AGENTS.md`
2. `C:\Users\USER\Documents\Claude\Projects\DIIS\docs\AI_CONTEXT.md`
3. `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\AGENTS.md`
4. `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\docs\WAYS-OF-WORKING.md`
5. `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\docs\decision-log.md`
6. `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\docs\architecture\academic-lifecycle.md`
7. `docs/audits/WAVE0-STABILIZATION-ACCEPTANCE-CONTRACT-2026-07-16.md`
8. `docs/audits/PROMPT-ARCHITECT-WAVE1-RBAC-OWNERSHIP-PRIVACY-2026-07-16.md`
9. `docs/audits/WAVE1-RBAC-OWNERSHIP-PRIVACY-REMEDIATION-2026-07-16.md`
10. `docs/audits/PROMPT-ARCHITECT-REVIEW-WAVE1-RBAC-OWNERSHIP-PRIVACY-2026-07-16.md`
11. `docs/audits/WAVE1-RBAC-OWNERSHIP-PRIVACY-REVIEW-2026-07-16.md`

## Goal

- Tutup dua P1 dari review Wave 1:
  1. Parent multi-child binding masih first-child/server-incomplete dan SPP UI consume wrong payload shape.
  2. Scoped list endpoints untuk GURU silently ignore forbidden `classId`.
- Tutup P2 yang murah dan relevan saat menyentuh resolver/tests:
  - Wali class access belum masuk shared GURU class resolver.
  - Coverage gaps untuk parent multi-child UI/data, class activity read scoping, forbidden `classId`, and positions transaction documentation/test strength.
- Update/add tests yang membuktikan fixes.
- Buat follow-up report.

## Non-Goal

- Jangan mengerjakan Wave 2.
- Jangan membuka ulang seluruh Wave 1 selain finding reviewer.
- Jangan implement full report-card Phase 5, immutable snapshots, WAKA full pipeline, or push notifications.
- Jangan implement Phase 2 RPP body/AI/draft-save fixes.
- Jangan implement Phase 3 assessment timer/DTO/randomization fixes.
- Jangan implement Phase 6 semester close.
- Jangan ubah Prisma schema.
- Jangan tambah dependency.
- Jangan ubah seed/catalog permission.
- Jangan ubah Docker, CI, staging, production, atau deploy config.
- Jangan membersihkan untracked/historical artifacts.

## Temuan Review Yang Wajib Ditutup

### P1 - Parent multi-child binding masih first-child/server-incomplete dan SPP UI payload mismatch

Source review:

- `apps/web/src/app/dashboard/akademik/page.tsx:269`
- `apps/web/src/app/dashboard/akademik/page.tsx:273`
- `apps/web/src/app/dashboard/akademik/page.tsx:277`
- `apps/web/src/app/dashboard/akademik/page.tsx:313`
- `apps/api/src/student-dashboard/student-dashboard.service.ts:73`
- `apps/api/src/student-dashboard/student-dashboard.service.ts:85`
- `apps/web/src/app/dashboard/akademik/_components/ortu/OrtuWorkspace.tsx:108`
- `apps/web/src/app/dashboard/akademik/_components/ortu/ortu-mappers.ts:17`
- `apps/web/src/app/dashboard/akademik/_components/ortu/ortu-mappers.ts:41`

Required:

- Active child selection must drive actual data shown, not just label switching.
- Either fetch child-specific data on child switch, or fetch all children data and normalize/group it by `studentId` before passing props.
- Normalize `/student-dashboard/spp` grouped response shape `{ studentId, studentName, payments: [...] }` into the UI payment shape expected by `OrtuWorkspace`.
- No panel may show child A finance/grades/attendance/WA/rank/report data under child B label.
- Add tests for parent with at least two children covering grades, attendance, SPP, WA log, rank/report-relevant data where feasible.

Preferred implementation:

- Keep changes scoped to ORANG_TUA dashboard data boundary.
- Prefer typed normalization helpers over ad hoc filtering inside render.
- If server actions/endpoints already exist for per-child fetch, use them.
- If not, normalize all fetched children data safely and document any endpoint that remains first-child-only as residual risk.

### P1 - Scoped GURU list endpoints silently ignore forbidden `classId`

Source review:

- `apps/api/src/student/student.service.ts:149`
- `apps/api/src/student/student.service.ts:151`
- `apps/api/src/class-activities/class-activities.service.ts:85`
- `apps/api/src/class-activities/class-activities.service.ts:86`
- `apps/api/src/__tests__/student.spec.ts:219`
- `apps/api/src/__tests__/report-cards-activities.spec.ts:160`

Required:

- For non-elevated scoped list endpoints, a forbidden requested `classId` must not silently return other allowed classes.
- Choose and document one policy:
  - **Recommended:** fail closed with `ForbiddenException` for requested out-of-scope `classId`.
  - Acceptable only if already consistent locally: strict empty intersection, returning no rows and clear tests.
- Apply policy consistently to student list and class activity list.
- Add tests for `/students?classId=unassigned` and class activities `findAll({ classId: unassigned })`.

### P2 - Wali-only class access not included in GURU class resolver

Source review:

- `apps/api/src/common/helpers/role-helpers.ts:71`
- `apps/api/src/classes/classes.service.ts:52`
- `packages/database/prisma/schema.prisma:174`
- `packages/database/prisma/schema.prisma:248`

Required:

- Decide whether wali access belongs in shared `resolveGuruClassIds()` or a separate resolver.
- Since Wave 1 acceptance allows assigned class, wali class, or explicit structural scope, include wali classes if it can be done without schema changes.
- Add positive test for wali-only class access and negative test for unrelated class.
- If current fixtures make this non-trivial, document exact residual risk and add at least a unit test for resolver query behavior.

### P2 - Coverage gaps

Required:

- Add/extend tests for:
  - parent multi-child data mapping or component behavior,
  - class activity read/list scoping for GURU/SISWA/ORANG_TUA where practical,
  - forbidden `classId` list-filter behavior,
  - wali-only class resolver behavior,
  - positions transaction proof if practical without real DB; otherwise document that only unit-level proof exists.

## Prinsip Implementasi

- Ikuti pola existing repo.
- Strict TypeScript, no new `any`.
- Zod DTOs only; do not introduce `class-validator`.
- Authorization and ownership must fail closed.
- UI must not mask forbidden/out-of-scope data as a successful empty state if request was invalid/forbidden.
- Keep ORANG_TUA dashboard changes typed and localized.
- Avoid large abstractions unless they remove real duplicate ownership logic.
- Do not hide residual risk; document it.

## Proses Wajib

1. Inspect worktree with `git status --short`.
2. Read the review report and identify exact files/lines.
3. Create a concise plan.
4. Critique your plan:
   - Is scope limited to follow-up findings?
   - Are you accidentally doing Wave 2 or Phase 5/6 work?
   - Are negative tests enough?
   - Does parent multi-child behavior become truly data-driven?
   - Does forbidden `classId` behavior fail closed or clearly return strict intersection?
5. Show fixed plan.
6. Implement code.
7. Add/update tests.
8. Run verification.
9. Create follow-up report.
10. Final answer with verdict readiness for re-review.

## Acceptance Criteria 100%

- Parent multi-child UI/data no longer uses first-child-only data for active child panels in Wave 1 scope.
- SPP payment mapping handles the actual grouped API response shape.
- Switching ORANG_TUA active child cannot show another child's SPP/grades/attendance/WA/rank/report-relevant data under the selected child label.
- GURU list endpoints do not silently ignore forbidden `classId`.
- Student list and class activity list have explicit negative tests for forbidden `classId`.
- Wali-only class access is included or precisely deferred with test-backed/documented rationale.
- Focused API tests pass.
- Web type-check and lint pass.
- API type-check and lint pass.
- Follow-up report states what was fixed, what remains deferred, test commands/results, and whether Wave 1 is ready for re-review.

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

Focused API tests:

```powershell
npm.cmd --workspace @smk/api test -- --runInBand --cacheDirectory ../../.tmp/jest-cache src/__tests__/student.spec.ts src/__tests__/report-cards-activities.spec.ts src/__tests__/positions.spec.ts
```

If parent dashboard has existing web/component tests, run the relevant suite. If not, add the smallest practical test or document why only type-check/manual QA is available.

Suggested targeted searches after implementation:

```powershell
rg -n "firstChild|getSpp|studentId|activeChild|classId|ForbiddenException|resolveGuruClassIds|teacherId|isWaliKelas" apps/api/src apps/web/src/app/dashboard/akademik
```

## Manual QA Critical Path

Run if local/browser environment is available; otherwise document not run.

1. ORANG_TUA multi-child switch:
   - Login as parent with two children.
   - Open `/dashboard/akademik`.
   - Switch from child A to child B.
   - Expected: grades, attendance, SPP/payment, WA log, rank/report-relevant panels either show child B data or child B empty state. No child A rows under child B label.
   - Refresh/reload: selected child state either persists safely or resets with matching data.

2. SPP mapping:
   - With grouped SPP API response, verify payment list and payment badge render real payment rows.
   - Expected: no empty payment list caused by wrong top-level shape.

3. GURU forbidden `classId`:
   - Login GURU.
   - Request/list assigned class students/activities: success.
   - Request/list unassigned `classId`: 403 or documented strict empty intersection.
   - Expected: not a list of other allowed classes.

4. Wali-only class:
   - Login wali teacher with homeroom class but no teaching assignment for that class if fixture exists.
   - Expected: allowed according to final resolver policy; unrelated class denied.

## Laporan Yang Harus Dibuat

Buat:

- `docs/audits/WAVE1-RBAC-OWNERSHIP-PRIVACY-FOLLOWUP-2026-07-16.md`

Isi minimal:

- Scope follow-up.
- Review findings addressed.
- Files changed.
- Policy chosen for forbidden `classId`.
- Parent multi-child data contract after fix.
- Wali-class resolver decision.
- Tests added/updated and command results.
- Manual QA result or not-run reason.
- Residual risks.
- Recommendation: ready for Wave 1 re-review or still blocked.

## Final Answer Executor Harus Berisi

- Ringkasan perubahan.
- File utama yang diubah.
- Hasil test.
- Manual QA status.
- Temuan review yang closed vs deferred.
- Risiko tersisa.
- Apakah siap untuk re-review Wave 1: yes/no.
```

## Confidence Level

**0.94 - tinggi.**

Alasan:
- Prompt ini langsung diturunkan dari review report dengan verdict `FOLLOW-UP REQUIRED`.
- Scope sempit: dua P1, dua P2 coverage/semantics, lalu re-review.
- Non-goals mencegah executor melompat ke Wave 2 atau full Phase 5/6.
- Verification dan manual QA diarahkan ke failure mode yang reviewer temukan.

Yang menurunkan confidence:
- Saya belum membaca implementasi code line-by-line di turn ini; prompt mengandalkan review report sebagai sumber kebenaran.
- Parent dashboard mungkin belum punya web/component test harness; prompt memberi fallback untuk dokumentasi jika test UI tidak praktis.
- Wali-only resolver bisa bergantung fixture/test data; prompt mengizinkan deferred rationale jika tidak dapat dibuktikan tanpa perluasan besar.

## Catatan Risiko Untuk Sesi Executor

- Risiko terbesar: executor hanya menambah client-side filter lagi tanpa memperbaiki kontrak data active child. Prompt final menuntut data-driven behavior atau normalized all-children data.
- Risiko kedua: memilih strict empty intersection untuk forbidden `classId` tanpa dokumentasi. Prompt meminta policy eksplisit, dengan rekomendasi 403 fail-closed.
- Risiko ketiga: memperluas ORANG_TUA dashboard menjadi rewrite besar. Prompt membatasi scope ke Wave 1 panels dan mapping.
- Risiko keempat: menganggap wali access sebagai P0. Review menilai P2 false-negative authorization; jangan biarkan itu membesar mengalahkan dua P1.
- Risiko kelima: lanjut Wave 2 tanpa re-review. Prompt final menyatakan hasil harus siap untuk re-review Wave 1 lebih dulu.
