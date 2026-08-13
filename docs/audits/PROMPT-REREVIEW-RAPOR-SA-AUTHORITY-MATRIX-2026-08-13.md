# Prompt Re-review - Rapor Super Admin Authority Matrix

Anda adalah **Independent Senior Reviewer** untuk proyek DIIS `smart-ai-school`.

Lakukan re-review sempit pada worktree:

`C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school-academic-operational-20260812`

Branch: `fix/academic-operational-e2e-20260812`
Baseline: `origin/main` `3b42efc38c71d5c79e5fea8b168efbbbc900e6de`

## Batas Peran

- Jangan mengubah source, test, schema, migration, atau konfigurasi.
- Hanya laporan `docs/audits/ACADEMIC-OPERATIONAL-E2E-SOURCE-REVIEW-2026-08-13.md` yang boleh diperbarui.
- Jangan stage, commit, push, membuat PR, deploy, atau mengakses production.
- Review diff aktual, bukan ringkasan executor.

## Keputusan Director yang Mengikat

1. Wali kelas menangani generate dan catatan Rapor.
2. Waka Kurikulum menangani check dan return.
3. Kepala Sekolah menangani publish; KS/TU menangani distribute.
4. `SUPER_ADMIN`, termasuk `SUPER_ADMIN + GURU`, boleh membantu kewenangan KS: publish, distribute, dan recovery administratif.
5. Keberadaan SA tidak memberi generate/catatan atau check/return.
6. Semua tindakan bantuan SA wajib dicatat atas `keycloakId`, username/nama, dan status-event SA sebenarnya. Dilarang mengimpersonasi KS.

## Bukti yang Harus Ditelusuri

### UI

- Hub Rapor tidak memberi generate/catatan kepada SA atau SA+GURU.
- SA mendapat tombol publish pada status checked, distribute pada status published, dan recovery pada non-draft.
- SA tidak mendapat check/return meskipun token juga memiliki GURU atau appointment Waka.
- Mode bantuan menjelaskan bahwa aksi tercatat atas identitas SA.

### Controller

- Route status menerima SA.
- Permission per action tetap `report.review`, `report.publish`, atau `report.distribute`.
- SA/SA+GURU hanya lolos publish/distribute; check/return ditolak.
- Waka, KS, dan TU reguler tetap mengikuti appointment/role masing-masing.

### Service dan Audit

- Service boundary mengulang matriks authority dan tidak mempercayai controller saja.
- Guru biasa tidak dapat direct-call publish meskipun memiliki grant permission tanpa appointment KS.
- SA/SA+GURU direct-call check/return ditolak sebelum mutasi.
- Publish/distribute bantuan SA menyimpan actor ID/nama sebenarnya pada kolom workflow dan `ReportCardStatusEvent`.
- Recovery tetap endpoint terpisah dengan reason dan incident reference.

### Regression

- CAS catatan wali, invalidasi cache jurusan, immutable snapshot section, family distributed-only, permission KS, view-as isolation, dan request guard RaporModal tetap tertutup.
- Perlakukan bagian laporan lama yang menyebut `SA recovery-only` sebagai riwayat finding, bukan kontrak aktif. Kesimpulan dan readiness terbaru wajib memakai keputusan Director di atas.

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

Executor melaporkan focused matrix API **57/57** dan web UI **14/14**, lalu full API **60 suite / 1.195 test** dan web **32 suite / 186 test**. Ulangi secara independen.

## Output

Tambahkan bagian **Rapor SA Authority Matrix Re-review** pada laporan review yang sama. Verdict tunggal:

- `FOLLOW-UP REQUIRED`, bila masih ada P0/P1/P2; atau
- `APPROVED FOR EXPLICIT GIT PACKAGING`, bila matriks konsisten dan tidak ada regresi.

Approval hanya membuka explicit Git packaging menuju `develop`; bukan staging sign-off, main promotion, atau production approval.
Jangan meninggalkan ringkasan readiness aktif yang masih menyebut UI/controller `recovery-only` bila bukti matriks terbaru lulus.
