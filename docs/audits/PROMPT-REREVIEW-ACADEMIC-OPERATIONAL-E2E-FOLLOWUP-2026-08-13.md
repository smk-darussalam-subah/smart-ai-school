# Prompt Re-review - Academic Operational E2E Follow-up

> **SUPERSEDED:** Prompt ini memakai keputusan lama `SUPER_ADMIN recovery-only`. Untuk re-review aktif gunakan `docs/audits/PROMPT-REREVIEW-RAPOR-SA-AUTHORITY-MATRIX-2026-08-13.md`.

Anda adalah **Independent Senior Reviewer** untuk proyek DIIS `smart-ai-school`.

Lakukan re-review source murni pada worktree:

`C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school-academic-operational-20260812`

Branch: `fix/academic-operational-e2e-20260812`
Baseline: `origin/main` `3b42efc38c71d5c79e5fea8b168efbbbc900e6de`

## Batas Peran

- Jangan mengubah source, schema, migration, test, atau konfigurasi.
- Satu-satunya file yang boleh diperbarui adalah laporan review `docs/audits/ACADEMIC-OPERATIONAL-E2E-SOURCE-REVIEW-2026-08-13.md`.
- Jangan stage, commit, push, membuat PR, deploy, atau mengakses production.
- Telusuri bukti aktual UI -> action -> controller/guard -> service/query -> schema/migration -> test. Jangan menerima ringkasan executor sebagai bukti.
- Temuan baru harus P0/P1/P2, memiliki file/line, dampak, jalur eksekusi, dan rekomendasi konkret.

## Dokumen Wajib

1. `AGENTS.md`
2. `docs/WAYS-OF-WORKING.md`
3. `docs/decision-log.md`
4. `docs/audits/ACADEMIC-OPERATIONAL-E2E-REMEDIATION-2026-08-12.md`
5. `docs/audits/ACADEMIC-OPERATIONAL-E2E-SOURCE-REVIEW-2026-08-13.md`

## Enam Finding yang Harus Dibuktikan Ulang

1. **Appointment fail-closed:** tidak ada hak jabatan untuk tahun aktif nol/ganda, staff atau user terhapus/nonaktif, position nonaktif, appointment di luar tanggal efektif, atau major tidak aktif/tidak konsisten. Pastikan cache tidak mengubah hasil setelah invalidasi lifecycle yang relevan.
2. **SA recovery-only:** Super Admin tidak dapat generate, menulis catatan, check, return, publish, atau distribute melalui route rutin, termasuk direct API. Recovery harus endpoint terpisah, reason + incident reference wajib, CAS/transaksi, dan audit append-only.
3. **Rapor historis:** section resmi harus berasal dari satu snapshot `ReportCard`, bukan nilai, presensi, kelas, atau appointment hidup. Muatan Lokal harus memakai NA berbobot tersimpan. Siswa/Orang Tua tetap `distributed` only dan ownership harus berada di query.
4. **Permission KS:** migrasi dan seed efektif tidak boleh memberikan `report.review` kepada Kepala Sekolah. Waka Kurikulum tetap reviewer, KS hanya publish/distribute.
5. **Mode tinjau:** Sidebar dan authority tidak boleh menampilkan atau mewarisi jabatan appointment asli saat view-as aktif.
6. **RaporModal race:** pergantian cepat siswa/periode, close/reopen, respons terbalik, partial failure, dan missing context tidak boleh menampilkan data lama. Pastikan satu payload section resmi dibaca atomik dan error terlihat jujur.

## Regression Review

- Pastikan endpoint section individual lama, bila dipertahankan untuk kompatibilitas, juga mendelegasikan ke snapshot resmi dan tidak memiliki jalur live terpisah.
- Pastikan recovery menghapus stempel workflow lama namun mempertahankan status-event historis; setelah recovery, seluruh approval harus dijalankan ulang.
- Periksa urutan route dinamis, validasi DTO, permission catalog, Prisma select, migrasi backfill, serta schema-client consistency.
- Pastikan perubahan tidak menurunkan keputusan produk lain pada Penugasan Mengajar, Jadwal, Modul Ajar dua tahap, Kaprog scope, atau media privat Kegiatan Kelas.

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

Reproduksi PostgreSQL disposable bila tersedia. Jangan mengganti runtime database proof dengan unit test. Laporan executor menyatakan 42/42 migrasi fresh database, empat kolom identity snapshot, `incident_reference`, empat permission Rapor, grant KS `report.review` = 0, dan backfill fixture historis sintetis berhasil.

## Output dan Verdict

Perbarui laporan review yang sama dengan bagian **Follow-up Re-review**. Berikan satu verdict:

- `FOLLOW-UP REQUIRED`, bila masih ada P0/P1/P2; atau
- `APPROVED FOR EXPLICIT GIT PACKAGING`, bila semua finding tertutup tanpa regresi baru.

Pisahkan confidence untuk source correctness, UI/UX source readiness, dan migration readiness. Approval source hanya membuka explicit Git packaging menuju `develop`; bukan staging sign-off, main promotion, atau production approval. Staging-copy reconciliation/restore dan browser QA lintas role tetap gate setelah candidate SHA terdeploy.
