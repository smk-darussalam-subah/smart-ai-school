# Prompt Final Re-review - Academic Operational E2E

> **SUPERSEDED:** Prompt ini mempertahankan kontrak lama `SUPER_ADMIN recovery-only` dan tidak boleh digunakan untuk re-review terbaru. Gunakan `docs/audits/PROMPT-REREVIEW-RAPOR-SA-AUTHORITY-MATRIX-2026-08-13.md`, yang mengikuti keputusan Director terakhir tentang bantuan SA untuk publish, distribute, dan recovery.

Anda adalah **Independent Senior Reviewer** untuk proyek DIIS `smart-ai-school`.

Lakukan re-review source terakhir pada:

`C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school-academic-operational-20260812`

Branch: `fix/academic-operational-e2e-20260812`
Baseline: `origin/main` `3b42efc38c71d5c79e5fea8b168efbbbc900e6de`

## Batas Peran

- Jangan mengubah source, schema, migration, test, atau konfigurasi.
- Hanya laporan `docs/audits/ACADEMIC-OPERATIONAL-E2E-SOURCE-REVIEW-2026-08-13.md` yang boleh diperbarui.
- Jangan stage, commit, push, membuat PR, deploy, atau mengakses production.
- Review diff aktual dan telusuri UI -> action -> controller/guard -> service/query -> cache/database -> test.
- Jangan membuka scope baru tanpa finding P0/P1/P2 yang konkret dan dapat direproduksi.

## Dokumen Wajib

1. `AGENTS.md`
2. `docs/WAYS-OF-WORKING.md`
3. `docs/decision-log.md`
4. `docs/audits/ACADEMIC-OPERATIONAL-E2E-REMEDIATION-2026-08-12.md`
5. `docs/audits/ACADEMIC-OPERATIONAL-E2E-SOURCE-REVIEW-2026-08-13.md`

## Tiga Finding Terakhir yang Harus Dibuktikan

### 1. Multi-role Super Admin Recovery-only

- Token `SUPER_ADMIN + GURU` harus ditolak dari generate, update notes, check, return, publish, dan distribute Rapor, termasuk direct controller/service invocation.
- Denial harus terjadi pada controller dan service boundary; wildcard permission SA tidak boleh membypass keputusan ini.
- `canManageDraft`, pilihan kelas, hub Rapor, dan tab Rapor Kelas pada workspace Akademik tidak boleh menampilkan kontrol rutin bagi SA+GURU.
- Guru wali biasa tanpa SA harus tetap dapat generate dan menyimpan catatan.
- Recovery SA dengan reason dan incident reference harus tetap bekerja.

### 2. CAS Catatan Wali

- DTO harus mewajibkan versi dokumen ISO yang valid.
- Kedua surface UI harus mengirim `expectedUpdatedAt` yang berasal dari item Rapor yang dibaca.
- Service harus mengunci `id`, status `draft`, dan `updatedAt` dalam satu `updateMany`, memajukan versi secara deterministik, dan mengembalikan 409 saat count nol.
- Buktikan dua update dengan versi awal sama tidak dapat sama-sama berhasil, sekalipun status tetap draft.
- Pastikan UI tidak memakai versi lama lagi setelah save berhasil dan pesan konflik dapat dipahami pengguna.

### 3. Invalidasi Cache Saat Jurusan Berubah

- `updateMajor()` harus menginvalidasi permission cache setelah write sukses, termasuk perubahan `isActive`, kode, atau identitas scope.
- Update gagal P2025/P2002 tidak boleh dianggap sukses.
- Buktikan cache appointment yang sudah hangat dinilai ulang setelah invalidasi dan tidak lagi memberi permission ketika scope major hilang/nonaktif.
- Pastikan invalidasi tidak terjadi sebelum database update selesai.

## Regression Check

- Enam finding awal harus tetap tertutup: appointment fail-closed, SA transition recovery-only, immutable report sections, pencabutan `report.review` KS, view-as isolation, dan stale-response guard RaporModal.
- Pastikan tidak ada kontrak `UpdateNotes` lama tanpa versi pada workspace Akademik maupun hub Rapor.
- Pastikan perubahan tidak mengganggu guru wali, Waka check/return, KS publish, TU/KS distribute, atau family distributed-only.

## Verifikasi Minimum

```powershell
npm.cmd --workspace @smk/api test -- --runInBand
npm.cmd --workspace @smk/web test -- --runInBand
npm.cmd --workspace @smk/api run type-check
npm.cmd --workspace @smk/web run type-check
npm.cmd --workspace @smk/database run type-check
npm.cmd --workspace @smk/types run type-check
npm.cmd --workspace @smk/api run lint
npm.cmd --workspace @smk/web run lint
npm.cmd --workspace @smk/api run build
npm.cmd --workspace @smk/web run build
$env:DATABASE_URL='postgresql://user:pass@localhost:5432/diis_validation'
npm.cmd --workspace @smk/database exec prisma validate
git diff --check
git diff --cached --check
```

Executor melaporkan API **60 suite / 1.191 test**, web **32 suite / 186 test**, seluruh type-check/lint/build lulus, dan web build **39/39**. PostgreSQL disposable menerapkan **42/42 migration** dan CAS fixture menghasilkan `first_writer=1`, `second_writer=0`. Reproduksi runtime database bila environment memungkinkan; bila tidak, nyatakan `NOT RUN`.

## Output

Tambahkan bagian **Final Follow-up Re-review** pada laporan review yang sama. Gunakan satu verdict:

- `FOLLOW-UP REQUIRED`, bila masih ada P0/P1/P2; atau
- `APPROVED FOR EXPLICIT GIT PACKAGING`, bila tiga finding tertutup dan tidak ada regresi baru.

Pisahkan confidence source correctness, UI/UX source readiness, dan migration readiness. Approval hanya membuka explicit Git packaging menuju `develop`; belum merupakan staging sign-off, main promotion, atau production approval.
