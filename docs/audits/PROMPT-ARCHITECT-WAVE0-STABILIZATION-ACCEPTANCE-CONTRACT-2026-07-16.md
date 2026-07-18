# Prompt Architect Output - Wave 0 Stabilization & Acceptance Contract

Tanggal dibuat: 2026-07-16

Konfirmasi Prompt Architect: user sudah mengonfirmasi eksekusi berurutan dimulai dari **Wave 0 - Stabilization & Acceptance Contract** sesuai rekomendasi `PROMPT-ARCHITECT-TEMPLATE-REMEDIATION-WAVES.md`. Prompt ini adalah handoff final untuk sesi executor Wave 0, sebelum Wave 1 RBAC/Ownership/Privacy dan sebelum phase-specific remediation.

## Draft Prompt Eksekusi Awal

```md
Anda adalah Codex Executor untuk proyek DIIS `smart-ai-school`.

Misi Anda adalah mengeksekusi Wave 0 - Stabilization & Acceptance Contract.

Baca dokumen wajib:
- `C:\Users\USER\Documents\Claude\Projects\DIIS\AGENTS.md`
- `C:\Users\USER\Documents\Claude\Projects\DIIS\docs\AI_CONTEXT.md`
- `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\AGENTS.md`
- `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\docs\WAYS-OF-WORKING.md`
- `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\docs\decision-log.md`
- `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\docs\architecture\academic-lifecycle.md`
- Semua audit report Phase 0 sampai Phase 6 di `smart-ai-school/docs/audits/`

Tugas:
1. Buat consolidated remediation backlog dari semua audit.
2. Buat acceptance contract untuk tiap phase.
3. Tentukan urutan wave remediation.
4. Buat manual QA matrix.
5. Update atau buat report di `smart-ai-school/docs/audits/`.

Jangan ubah production code, schema, dependency, atau infrastructure.
Jalankan checks yang relevan.
Final answer harus mencantumkan file berubah, hasil verifikasi, dan rekomendasi wave berikutnya.
```

## Kritik Terhadap Draft

- Draft terlalu generik dan belum memaksa executor memisahkan temuan P0/P1/P2 dari label lama `High/Medium/Low`.
- Draft belum cukup eksplisit bahwa Wave 0 bukan sesi coding fitur, melainkan sesi kontrak penerimaan dan backlog yang dapat dieksekusi.
- Draft belum mengunci dependency lintas wave. Ini berisiko membuat executor langsung memperbaiki Phase 5 atau Phase 6 padahal Wave 1 RBAC/ownership/privacy perlu dipisahkan.
- Draft belum menyebutkan isu cross-cutting spesifik: GURU over-read, permission mismatch finance/WA log/analytics, parent consent, WAKA role gates, SISWA/ORTU status query privacy, class activity ownership, dan report-card ownership.
- Draft belum menetapkan acceptance criteria yang bisa diverifikasi untuk artefak Wave 0.
- Draft belum cukup kuat melarang schema migration/dependency baru/production deploy.
- Draft belum memberi format report yang harus dibuat, sehingga output bisa menjadi ringkasan chat saja.
- Draft belum memaksa executor mengkritisi rencananya sendiri sebelum menulis artefak.
- Draft belum memberi command verifikasi realistis untuk doc-only wave.
- Draft belum menuntut manual QA steps yang menyebut klik tombol/aksi nyata per workflow kritis.

## Prompt Final Untuk Executor

```md
Anda adalah Codex Executor untuk proyek DIIS `smart-ai-school`.

## Misi

Eksekusi **Wave 0 - Stabilization & Acceptance Contract** sampai selesai.

Wave ini **bukan** sesi memperbaiki semua bug Phase 0-6. Wave ini adalah sesi stabilisasi scope: membuat kontrak penerimaan, matriks dependency, backlog remediation terurut, dan QA protocol yang cukup tajam agar wave berikutnya bisa dieksekusi serial tanpa scope creep.

## Konteks Wajib Dibaca

Sebelum membuat plan atau mengubah file, baca:

1. `C:\Users\USER\Documents\Claude\Projects\DIIS\AGENTS.md`
2. `C:\Users\USER\Documents\Claude\Projects\DIIS\docs\AI_CONTEXT.md`
3. `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\AGENTS.md`
4. `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\docs\WAYS-OF-WORKING.md`
5. `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\docs\decision-log.md`
6. `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\docs\architecture\academic-lifecycle.md`
7. `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\.tasks\PLAN-CONSOLIDATED-2026.md`
8. `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\.tasks\RESIDUAL-ISSUES-REGISTER.md`
9. Audit reports:
   - `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\docs\audits\PHASE0-COMPREHENSIVE-AUDIT-2026-07-15.md`
   - `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\docs\audits\PHASE1-COMPREHENSIVE-AUDIT-2026-07-15.md`
   - `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\docs\audits\PHASE2-COMPREHENSIVE-AUDIT-2026-07-15.md`
   - `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\docs\audits\PHASE3-COMPREHENSIVE-AUDIT-2026-07-15.md`
   - `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\docs\audits\PHASE4-COMPREHENSIVE-AUDIT-2026-07-15.md`
   - `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\docs\audits\PHASE5-COMPREHENSIVE-AUDIT-2026-07-15.md`
   - `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\docs\audits\PHASE6-COMPREHENSIVE-AUDIT-2026-07-15.md`

## Goal

- Buat satu report Wave 0 yang menjadi sumber kerja untuk seluruh remediation waves.
- Normalisasi semua temuan lintas audit menjadi backlog P0/P1/P2 dengan owner phase, impacted files/modules, dependency, verification method, dan recommended wave.
- Buat acceptance contract per wave yang bisa diverifikasi oleh executor berikutnya.
- Buat manual QA protocol lintas role yang menyebut aksi UI nyata, bukan hanya "cek halaman".
- Tentukan prompt/wave berikutnya yang paling tepat setelah Wave 0.

## Non-Goal

- Jangan memperbaiki production code Phase 0-6 dalam wave ini kecuali menemukan typo kecil di dokumen yang menghalangi report.
- Jangan mengubah Prisma schema.
- Jangan menambah dependency.
- Jangan mengubah seed, migration, docker, GitHub Actions, atau infrastructure.
- Jangan push, deploy, atau menyentuh production/staging.
- Jangan membersihkan untracked/historical artifacts.
- Jangan menghapus atau mengubah audit report lama; buat report baru yang mengonsolidasikan.
- Jangan menandai bug produk sebagai closed tanpa bukti runtime atau bukti kode dari wave executor yang memang memperbaikinya.

## Temuan Audit Yang Wajib Dikonsolidasikan

Wave 0 harus mengklasifikasi ulang severity lintas audit dengan aturan:

- **P0:** privacy/security/data-integrity/workflow utama tidak bisa berjalan, atau user bisa melihat/mengubah data yang tidak semestinya.
- **P1:** workflow penting rusak sebagian, contract drift, permission mismatch, error masking, atau missing UI action untuk lifecycle penting.
- **P2:** UX polish, validation minor, documentation/policy decision, atau cleanup yang tidak memblokir safety.

Minimal temuan yang wajib muncul di backlog:

### Cross-Cutting P0/P1 Candidates

- GURU student access terlalu luas dan sub-resource grades/attendance belum scoped ke assigned class.
- Parent/student consent propagation saat provisioning belum lengkap dan perlu keputusan eksplisit.
- Permission/role mismatch untuk struktur organisasi, class management, finance own/child access, WA log parent endpoint, analytics own/child, WAKA RPP review, dan WAKA Phase 6 report.
- SISWA/ORANG_TUA report-card status filter dapat menimpa `distributed` privacy gate.
- Class activity/jurnal kelas ownership terlalu longgar.
- Finance SPP approval flow dapat mengirim kwitansi sebelum approval.
- Parent multi-child UI hanya mengganti label atau first-child only di beberapa workflow.
- RPP/Modul Ajar UI/backend contract drift: body schema stripping, fake save, AI output not applied.
- Assessment runtime integrity: client timer manipulation, loose `z.any`, randomized questions not persisted.
- Report-card pipeline actor contract: wali kelas, WAKA, KS, TU separation of duties.
- Semester close workflow belum atomik dan fail-closed.

### Phase-Specific Inputs

- Phase 0: bulk user CSV template, organization mutation permission gate, parent consent, calendar validation, admin UI error masking, permission override deny path, transactionality.
- Phase 1: GURU privacy scoping, PPDB accepted-to-student enrollment, PPDB state machine, class management permission, public PPDB form wiring, assignee validation, SPP schedule generation decision.
- Phase 2: RPP body schema parity, AI step generation, real draft save, WAKA_KURIKULUM gate, PII stripping for AI, teaching-assignment validation, LMS `rppId` ownership, local school day attendance.
- Phase 3: student main workflow completeness, assessment timer, strict DTOs, class activity ownership, parent multi-child binding, auto-grade idempotency, LMS progress monotonicity, SSE reconnect.
- Phase 4: SPP approval semantics, finance permissions, parent monitoring reliability, analytics own/child permissions, announcement policy, AI chat UI history/access, remedial workflow.
- Phase 5: report-card role workflow, WAKA/KS/TU separation, status privacy gate, semester-correct attendance snapshot, immutable distributed report-card UI, push notification, timestamp reset, transactional mass generate.
- Phase 6: close semester workflow, WAKA learning report access, LMS archive terminal semantics, assessment completion linkage, final KS report, KKTP compliance, active period consistency.

## Proses Wajib

1. Inspect current worktree:
   - Jalankan `git status --short` dari repo root.
   - Jangan revert atau membersihkan perubahan user.
2. Buat plan detail Wave 0.
3. Kritik plan Anda sendiri:
   - Apakah scope berubah menjadi coding remediation terlalu luas?
   - Apakah Wave 1 RBAC/ownership/privacy dipisahkan jelas?
   - Apakah dependency Phase 5/6 terhadap Phase 1/2/4 sudah terlihat?
   - Apakah acceptance criteria bisa diverifikasi?
   - Apakah manual QA menyebut role, halaman, button, input, submit, expected result, dan negative case?
4. Tampilkan fixed plan.
5. Buat report baru:
   - `smart-ai-school/docs/audits/WAVE0-STABILIZATION-ACCEPTANCE-CONTRACT-2026-07-16.md`
6. Isi report dengan struktur minimal:
   - Executive verdict.
   - Scope dan non-scope Wave 0.
   - Source documents read.
   - Severity normalization rule.
   - Consolidated remediation backlog table.
   - Dependency graph antar wave.
   - Wave order recommendation.
   - Acceptance contract per wave.
   - Focused test strategy per wave.
   - Manual QA matrix per role/workflow.
   - Decisions needed from Director/Cowork.
   - Risks if waves are executed out of order.
   - Next executor prompt seed for Wave 1.
7. Jangan mengedit audit report Phase 0-6; report Wave 0 harus menautkan dan mengonsolidasikan.
8. Jalankan verifikasi doc/static yang relevan.
9. Final answer harus ringkas, jujur, dan menyebut file yang dibuat.

## Acceptance Criteria 100%

- Report Wave 0 dibuat di path yang diminta.
- Semua Phase 0-6 audit reports tercakup.
- Semua P0/P1 candidate di bagian "Temuan Audit Yang Wajib Dikonsolidasikan" muncul di backlog atau dijelaskan sebagai duplicate/deferred/accepted risk.
- Wave 1 dipisahkan dari phase-specific remediation dan fokus pada RBAC, ownership, privacy, consent, dan permission mismatch.
- Tidak ada instruksi untuk menggabungkan semua phase sekaligus.
- Setiap backlog item punya:
  - severity normalized,
  - source audit,
  - impacted module/file area,
  - affected role,
  - recommended wave,
  - dependency,
  - verification method,
  - manual QA need.
- Manual QA matrix mencakup positive path, negative authorization path, empty/error state, dan refresh/reload persistence.
- Report mencantumkan schema/dependency policy per wave: `ASK FIRST` kecuali sudah eksplisit disetujui.
- Report mencantumkan commands/test strategy realistis untuk executor berikutnya.
- Final answer mencantumkan risiko tersisa dan rekomendasi prompt berikutnya.

## Verification Commands Minimal

Jalankan dari:

```powershell
cd C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school
```

Wajib untuk Wave 0:

```powershell
git status --short
git diff --check -- docs/audits/WAVE0-STABILIZATION-ACCEPTANCE-CONTRACT-2026-07-16.md
```

Jika report hanya mengubah dokumen, type-check dan lint source code tidak wajib. Namun, jika ada perubahan kode apapun, jalankan:

```powershell
npm.cmd --workspace @smk/api run type-check
npm.cmd --workspace @smk/web run type-check
npm.cmd --workspace @smk/api run lint
npm.cmd --workspace @smk/web run lint
```

Opsional tetapi disarankan untuk baseline bila dependency lokal sehat:

```powershell
npm.cmd run type-check
npm.cmd run lint
```

Jika command gagal karena tooling/dependency lokal, jangan klaim produk rusak. Catat sebagai verification blocker dengan output penting.

## Manual QA Protocol Yang Harus Dihasilkan

Wave 0 tidak harus menjalankan browser QA, tetapi report wajib menghasilkan script manual QA untuk wave berikutnya. Minimal mencakup:

1. SUPER_ADMIN: user provisioning, CSV bulk import, permission override grant/deny, struktur organisasi assign/unassign.
2. TATA_USAHA: PPDB lead status update sampai accepted, student enrollment, class management, SPP create.
3. GURU: Modul Ajar draft save, AI generate step, submit RPP, create assessment, start assessment, record attendance, create class activity.
4. WAKA_KURIKULUM: review RPP, report-card review/return, learning achievement report.
5. KEPALA_SEKOLAH: approve RPP/report card, approve SPP, executive audit, semester close preflight.
6. SISWA: access own LMS, assessment, grades, attendance, report card only after distributed.
7. ORANG_TUA: switch multiple children, view child grades/attendance/WA log/report card only when allowed.
8. Negative cases: role without permission must see 403 or blocked UI action, not empty fake success.

Each manual QA row must include:

- Role.
- Page/path.
- Button/action to click.
- Form/input.
- Expected backend effect.
- Expected UI result.
- Negative authorization case.
- Empty/error-state case.
- Refresh/reload persistence expectation.

## Laporan Yang Harus Dibuat

Buat:

- `smart-ai-school/docs/audits/WAVE0-STABILIZATION-ACCEPTANCE-CONTRACT-2026-07-16.md`

Jangan update:

- `PHASE0-COMPREHENSIVE-AUDIT-2026-07-15.md`
- `PHASE1-COMPREHENSIVE-AUDIT-2026-07-15.md`
- `PHASE2-COMPREHENSIVE-AUDIT-2026-07-15.md`
- `PHASE3-COMPREHENSIVE-AUDIT-2026-07-15.md`
- `PHASE4-COMPREHENSIVE-AUDIT-2026-07-15.md`
- `PHASE5-COMPREHENSIVE-AUDIT-2026-07-15.md`
- `PHASE6-COMPREHENSIVE-AUDIT-2026-07-15.md`

## Final Answer Executor Harus Berisi

- Ringkasan report yang dibuat.
- File yang dibuat/diubah.
- Hasil verification commands.
- Apakah ada kode yang disentuh: ya/tidak.
- Risiko tersisa.
- Rekomendasi next wave.
- Jika next wave adalah Wave 1, sebutkan scope ringkas: RBAC, ownership, privacy, PDP consent, permission mismatch, dan negative tests.
```

## Confidence Level

**0.93 - tinggi.**

Alasan:
- Template sudah dibaca penuh.
- Dokumen orientasi, lifecycle, Ways of Working, decision log, plan consolidated, residual register, dan headline temuan Phase 0-6 sudah dipakai untuk menyusun prompt.
- Prompt final sengaja membatasi Wave 0 agar tidak berubah menjadi sesi remediation semua phase sekaligus.

Yang menurunkan confidence:
- Beberapa audit memakai label severity berbeda (`High/Medium/Low`, `P0/P1/P2`, `P3-CRIT-*`), sehingga Wave 0 perlu normalisasi formal di report executor.
- Prompt ini belum mengeksekusi remediation code; ia menyiapkan kontrak eksekusi.

## Catatan Risiko Untuk Sesi Executor

- Risiko terbesar adalah executor mencoba memperbaiki semua P0/P1 lintas phase dalam satu sesi. Prompt final sudah melarang itu.
- Wave 1 harus dipisahkan dari phase-specific work karena RBAC/ownership/privacy akan memengaruhi Phase 1, 3, 4, 5, dan 6.
- Phase 5 dan Phase 6 sebaiknya tidak dimulai sebelum Wave 1 jelas, karena report-card visibility, WAKA access, role separation, dan semester close bergantung pada permission/ownership yang benar.
- Jangan membuat schema migration atau dependency baru saat Wave 0.
- Jangan mempercayai `.tasks/current.md` sebagai sumber state terbaru.
- Jangan menandai audit finding sebagai closed hanya karena sudah masuk backlog. Closed butuh bukti implementasi dan verification.
