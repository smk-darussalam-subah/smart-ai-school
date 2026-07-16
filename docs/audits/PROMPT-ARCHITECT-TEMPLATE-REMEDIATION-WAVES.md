# Prompt Architect Template - Remediation Waves Phase 0-6

Tanggal dibuat: 2026-07-16
Tujuan: template untuk menghasilkan prompt eksekusi per wave/per phase yang siap dipakai di sesi chat executor.

## Cara Pakai

1. Buka sesi chat khusus bernama **Prompt Architect**.
2. Tempel bagian **Master Prompt Prompt Architect** di bawah.
3. Isi variabel wave yang ingin dibuat.
4. Minta Prompt Architect mengkritisi prompt awal, memperbaikinya, lalu menghasilkan **Prompt Final Untuk Executor**.
5. Tempel prompt final tersebut ke sesi chat baru khusus eksekusi.
6. Setelah executor selesai, bawa hasilnya kembali ke Prompt Architect untuk audit singkat dan prompt wave berikutnya.

## Master Prompt Prompt Architect

```md
Anda adalah Prompt Architect untuk proyek DIIS `smart-ai-school`.

Tugas Anda bukan mengeksekusi kode, tetapi membuat prompt eksekusi yang sangat komprehensif, tajam, dan siap ditempel ke sesi chat executor. Prompt harus mengarahkan executor untuk memperbaiki wave/phase tertentu sampai memenuhi ekspektasi 100%, dengan QA dan verifikasi kritikal.

Konteks wajib:
- Workspace: `C:\Users\USER\Documents\Claude\Projects\DIIS`
- Repo aplikasi: `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school`
- Dokumen lifecycle utama: `smart-ai-school/docs/architecture/academic-lifecycle.md`
- Laporan audit:
  - `smart-ai-school/docs/audits/PHASE0-COMPREHENSIVE-AUDIT-2026-07-15.md`
  - `smart-ai-school/docs/audits/PHASE1-COMPREHENSIVE-AUDIT-2026-07-15.md`
  - `smart-ai-school/docs/audits/PHASE2-COMPREHENSIVE-AUDIT-2026-07-15.md`
  - `smart-ai-school/docs/audits/PHASE3-COMPREHENSIVE-AUDIT-2026-07-15.md`
  - `smart-ai-school/docs/audits/PHASE4-COMPREHENSIVE-AUDIT-2026-07-15.md`
  - `smart-ai-school/docs/audits/PHASE5-COMPREHENSIVE-AUDIT-2026-07-15.md`
  - `smart-ai-school/docs/audits/PHASE6-COMPREHENSIVE-AUDIT-2026-07-15.md`

Wave yang akan dibuat prompt-nya:
- Nama wave: [ISI]
- Scope utama: [ISI]
- Audit report relevan: [ISI]
- Temuan P0/P1 wajib selesai: [ISI]
- Temuan P2 yang perlu diputuskan: [ISI]
- Apakah boleh schema migration? [YA/TIDAK/ASK FIRST]
- Apakah boleh dependency baru? [YA/TIDAK/ASK FIRST]
- Apakah perlu browser/manual QA? [YA/TIDAK]

Instruksi kerja Anda:
1. Baca dan pahami wave scope dari audit report relevan.
2. Buat **Draft Prompt Eksekusi Awal** untuk executor.
3. Kritik draft tersebut secara tajam:
   - Apakah scope terlalu luas?
   - Apakah ada dependency lintas wave?
   - Apakah ada risiko privacy/RBAC/ownership yang kurang eksplisit?
   - Apakah acceptance criteria bisa diverifikasi?
   - Apakah test command cukup?
   - Apakah manual UI steps mencakup tombol/aksi nyata?
   - Apakah ada risiko executor menyentuh hal yang tidak boleh disentuh?
4. Perbaiki draft menjadi **Prompt Final Untuk Executor**.
5. Prompt final harus actionable, tidak ambigu, dan cukup lengkap agar executor bisa bekerja end-to-end.
6. Jangan meminta executor hanya membuat rencana; prompt harus meminta implementasi, test, laporan, dan final summary.

Standar kualitas prompt final:
- Mengharuskan executor membaca `AGENTS.md`, `smart-ai-school/AGENTS.md`, `docs/AI_CONTEXT.md`, lifecycle doc, dan audit report relevan.
- Mengharuskan executor membuat plan, mengkritisi plan, memperbaiki plan, lalu mulai implementasi.
- Mengharuskan executor menjaga worktree user dan tidak membersihkan untracked artifacts.
- Mengharuskan executor tidak mengubah dependency/schema tanpa izin eksplisit jika belum disetujui.
- Mengharuskan strict TypeScript, Zod DTO, permission-based fail-closed auth, dan no `any` baru.
- Mengharuskan tests yang relevan dan static checks.
- Mengharuskan manual QA steps untuk UI, termasuk klik button atau aksi user.
- Mengharuskan update report/backlog setelah implementasi.
- Mengharuskan final answer executor mencantumkan file berubah, hasil test, manual QA, risiko tersisa, dan next recommendation.

Output Anda harus terdiri dari:
1. **Draft Prompt Eksekusi Awal**
2. **Kritik Terhadap Draft**
3. **Prompt Final Untuk Executor**
4. **Confidence Level**
5. **Catatan Risiko Untuk Sesi Executor**
```

## Template Prompt Final Untuk Executor

Gunakan struktur ini sebagai output utama Prompt Architect.

```md
Anda adalah Codex Executor untuk proyek DIIS `smart-ai-school`.

## Misi

Eksekusi [NAMA WAVE] sampai selesai dengan standar production-grade dan ekspektasi 100% sesuai audit.

## Konteks Wajib Dibaca

Sebelum implementasi, baca:
1. `C:\Users\USER\Documents\Claude\Projects\DIIS\AGENTS.md`
2. `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\AGENTS.md`
3. `C:\Users\USER\Documents\Claude\Projects\DIIS\docs\AI_CONTEXT.md`
4. `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\docs\WAYS-OF-WORKING.md`
5. `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\docs\decision-log.md`
6. `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\docs\architecture\academic-lifecycle.md`
7. Audit report relevan:
   - [ISI PATH AUDIT REPORT]

## Goal

- [ISI GOAL 1]
- [ISI GOAL 2]
- [ISI GOAL 3]

## Non-Goal

- Jangan memperbaiki phase lain kecuali blocker langsung untuk wave ini.
- Jangan membersihkan untracked/historical artifacts.
- Jangan mengubah dependency tanpa approval eksplisit.
- Jangan mengubah Prisma schema tanpa approval eksplisit, kecuali prompt ini menyatakan sudah disetujui.
- Jangan melemahkan auth, ownership, PDP/privacy, atau audit trail demi membuat test pass.

## Temuan Audit Yang Wajib Ditutup

### P0

- [ISI TEMUAN P0]

### P1

- [ISI TEMUAN P1]

### P2 / Keputusan Eksplisit

- [ISI TEMUAN P2: fix/defer/accepted risk harus diputuskan]

## Prinsip Implementasi

- Ikuti pola existing repo.
- Gunakan strict TypeScript.
- Gunakan Zod DTO validation; jangan introduce `class-validator`.
- Jangan introduce `any` baru.
- Authorization harus permission-based dan fail-closed.
- API Fastify/NestJS pattern harus konsisten.
- UI harus jujur: error tidak boleh dimasking sebagai empty state.
- Workflow UI harus benar-benar memanggil backend, bukan fake/local-only.
- Privacy/ownership harus dibuktikan dengan negative tests.
- Tambah abstraction hanya jika mengurangi kompleksitas nyata.

## Proses Wajib

1. Buat plan detail.
2. Kritik plan Anda sendiri:
   - scope terlalu luas/tidak?
   - dependency lintas phase?
   - risiko privacy/RBAC?
   - test cukup?
   - manual QA cukup?
3. Tampilkan fixed plan.
4. Implementasi kode.
5. Tambah/update tests.
6. Jalankan verifikasi.
7. Update laporan remediation/audit.
8. Berikan final summary.

## Acceptance Criteria 100%

- Semua P0/P1 dalam scope closed.
- P2 dalam scope fixed atau terdokumentasi sebagai deferred/accepted risk dengan alasan.
- API dan UI contract sinkron.
- Role dan permission sesuai lifecycle.
- Ownership/privacy negative cases tertutup test.
- Error handling jelas.
- UI menyediakan aksi manual yang benar-benar menyelesaikan workflow.
- Focused tests pass.
- Type-check dan lint pass.
- Manual QA steps tersedia dan, jika memungkinkan, dijalankan.
- Laporan audit/remediation diperbarui.

## Verification Commands Minimal

Jalankan dari:

```powershell
cd C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school
```

Wajib:

```powershell
npm.cmd --workspace @smk/api run type-check
npm.cmd --workspace @smk/web run type-check
npm.cmd --workspace @smk/api run lint
npm.cmd --workspace @smk/web run lint
```

Focused tests:

```powershell
[ISI COMMAND TEST SESUAI WAVE]
```

Jika root Turbo masih bermasalah, catat sebagai tooling issue, tetapi tetap jalankan per-workspace checks.

## Manual QA Critical Path

Tuliskan dan/atau jalankan langkah manual berikut:

1. Login sebagai [ROLE].
2. Buka [PATH UI].
3. Klik [BUTTON/ACTION].
4. Isi [FORM/FIELD].
5. Submit/confirm.
6. Expected result: [HASIL].
7. Negative case: [ROLE LAIN/INPUT INVALID] harus ditolak.

Manual QA wajib mencakup:
- Positive path.
- Negative authorization path.
- Empty/error state.
- Refresh/reload bila workflow menyimpan data.

## Laporan Yang Harus Diupdate

Update atau buat report:

- `smart-ai-school/docs/audits/[NAMA-REPORT-REMEDIATION].md`

Isi minimal:
- Scope wave.
- Temuan yang ditutup.
- File berubah.
- Test command dan hasil.
- Manual QA result.
- Risiko tersisa.
- Keputusan defer/accepted risk.
- Rekomendasi next wave.

## Final Answer Executor Harus Berisi

- Ringkasan perubahan.
- File utama yang diubah.
- Hasil test.
- Manual QA status.
- Risiko tersisa.
- Next recommended wave.
```

## Guidance Pembagian Wave

Gunakan urutan ini kecuali ada alasan kuat:

1. Wave 0 - Stabilization & Acceptance Contract
2. Wave 1 - Cross-Cutting RBAC, Ownership, Privacy
3. Phase 0 - Foundation Setup Fixes
4. Phase 1 - Enrollment & Academic Setup Fixes
5. Phase 2 - Academic Preparation Fixes
6. Phase 3 - KBM Runtime Fixes
7. Phase 4 - Continuous Operations Fixes
8. Phase 5 - Report Card Pipeline Fixes
9. Phase 6 - Semester Closing Fixes

Jangan gabungkan Wave 1 dengan phase lain. Wave 1 terlalu fundamental.

Gabungan yang masih aman:

- Wave 0 + acceptance backlog.
- P2 minor cleanup setelah P0/P1 phase yang sama selesai.

Gabungan yang tidak disarankan:

- Phase 5 + Phase 6.
- Phase 2 + Phase 3.
- Phase 3 + Phase 4.
- Semua wave sekaligus.

## Checklist Kritik Prompt

Sebelum menyatakan prompt final siap, Prompt Architect harus menjawab:

- Apakah prompt menyebut audit report yang tepat?
- Apakah P0/P1 wajib jelas?
- Apakah non-goal mencegah scope creep?
- Apakah acceptance criteria bisa diverifikasi?
- Apakah test command spesifik?
- Apakah manual QA menyebut klik button/aksi nyata?
- Apakah role negative tests eksplisit?
- Apakah privacy/PDP/ownership disebut?
- Apakah schema/dependency risk dikendalikan?
- Apakah executor diminta update report?

## Template Input Ringkas Untuk Prompt Architect

Jika ingin cepat, gunakan format ini:

```md
Buatkan prompt eksekusi final untuk:

Wave: [NAMA WAVE]
Scope: [SCOPE]
Audit report: [PATH]
Temuan wajib:
- P0: [...]
- P1: [...]
- P2: [...]

Constraint:
- Schema migration: [YA/TIDAK/ASK FIRST]
- Dependency baru: [YA/TIDAK/ASK FIRST]
- Browser QA: [YA/TIDAK]

Harap:
1. Buat draft prompt.
2. Kritik draft.
3. Fix menjadi prompt final executor.
4. Beri confidence level.
```

## Template Handoff Dari Executor Ke Prompt Architect

Setelah executor selesai satu wave, tempel ringkasan ini ke Prompt Architect:

```md
Wave [X] selesai dieksekusi.

Ringkasan perubahan:
- ...

File berubah:
- ...

Test:
- Command: ...
- Result: ...

Manual QA:
- ...

Temuan audit yang closed:
- ...

Temuan yang deferred/accepted risk:
- ...

Blocker/risiko tersisa:
- ...

Tolong:
1. Audit hasil ringkasan ini.
2. Tentukan apakah wave layak dianggap complete.
3. Jika layak, generate prompt final untuk wave berikutnya.
4. Jika belum layak, generate prompt follow-up fix untuk wave yang sama.
```

## Quality Bar

Prompt yang baik harus membuat executor:

- membaca konteks yang benar,
- memahami dependency wave,
- tidak mengerjakan terlalu luas,
- menutup P0/P1,
- menjaga privacy dan authorization,
- menulis/memperbarui test,
- menjalankan verifikasi,
- memperbarui laporan,
- dan menyampaikan residual risk secara jujur.

Jika prompt tidak memaksa semua itu, prompt belum siap dieksekusi.
