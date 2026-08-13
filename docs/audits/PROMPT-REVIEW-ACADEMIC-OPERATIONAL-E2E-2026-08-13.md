# Prompt Reviewer - Academic Operational E2E

Anda adalah **Independent Senior Reviewer** untuk proyek DIIS `smart-ai-school`.
Lakukan review source murni pada worktree berikut:

`C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school-academic-operational-20260812`

Branch: `fix/academic-operational-e2e-20260812`
Baseline: `origin/main` `3b42efc38c71d5c79e5fea8b168efbbbc900e6de`

## Batas Peran

- Jangan mengubah source, schema, migration, test, atau konfigurasi. Satu-satunya file yang boleh dibuat adalah laporan review yang diminta pada bagian Output.
- Jangan stage, commit, push, membuat PR, deploy, atau mengakses production.
- Jangan menyatakan staging/prod approved dari bukti source.
- Review diff aktual terhadap baseline. Jangan mengandalkan ringkasan executor sebagai bukti.
- Temuan harus P0/P1/P2, memiliki file dan line, dampak, bukti jalur eksekusi, serta rekomendasi konkret.
- Jangan membuat finding spekulatif. Telusuri route UI -> action/BFF -> controller/guard -> service/query -> schema/migration/test.

## Dokumen Wajib Baca

1. `AGENTS.md`
2. `docs/WAYS-OF-WORKING.md`
3. `docs/decision-log.md`
4. `docs/audits/ACADEMIC-OPERATIONAL-E2E-REMEDIATION-2026-08-12.md`
5. `docs/runbooks/CLASS-ACTIVITY-PRIVATE-MEDIA.md`

## Keputusan Produk yang Tidak Boleh Diubah

1. Penugasan Mengajar dan Jadwal adalah dua tahap: assignment memberi konteks akademik, Jadwal menempatkannya ke waktu/ruang.
2. Modul Ajar dua tahap: Waka Kurikulum/Kaprog memberi rekomendasi, Kepala Sekolah memberi persetujuan final. Aktor final harus berbeda dari aktor rekomendasi.
3. Rapor: wali menyiapkan draft; Waka Kurikulum check/return; Kepala Sekolah publish; TU/KS distribute; SA hanya recovery.
4. Kaprog hanya read/rekomendasi pada jurusan appointment aktif dan harus fail-closed.
5. Kepala Sekolah read-only untuk setup Penugasan/Jadwal.
6. Media Kegiatan Kelas private, authenticated, scoped, dan `no-store`; URL eksternal legacy tidak boleh dirender atau di-fetch.

## Review Wajib

### Authority dan Scope

- Pastikan UI dan API memakai permission serta appointment aktif, bukan role jabatan legacy dari JWT.
- Uji mental dan test negatif untuk missing/expired appointment, tidak ada atau ganda tahun aktif, inactive/deleted user/staff, cross-class, cross-major, dan direct endpoint.
- Pastikan mode tinjau role tidak mewarisi appointment asli.
- Pastikan Kaprog tidak bocor lewat list options, filter, detail, section endpoint, atau media.

### Akademik dan Jadwal

- Verifikasi kandidat dan lifecycle TeachingAssignment, dependency block, JP readiness, pagination/search, dan Waka dual mode.
- Verifikasi guru dapat author dari assignment aktif tanpa wajib memiliki schedule row.
- Verifikasi schedule memakai assignment authoritative, slot JP, konflik guru/kelas/ruang, transaction/advisory lock, serta perilaku concurrent request.
- Pastikan kontrol KS/TU/Waka/Guru sesuai matriks dan tidak ada input UUID manual/dead-end.

### Rapor

- Verifikasi snapshot hanya memakai nilai kelas yang benar, formula NA berbobot sama dengan Gradebook, dan attendance pada semester yang benar.
- Verifikasi hanya kelas wali dapat generate/update notes; kelas filter berasal dari endpoint scoped.
- Verifikasi generate atomik, compare-and-swap untuk refresh/catatan/transisi, permission spesifik per aksi, reason wajib, event status history, audit ID+nama, event distribusi, serta family distributed-only pada list dan semua section endpoint.
- Pastikan SA tidak menjadi operator pedagogis rutin dan TU tidak dapat check/publish.
- Pastikan workspace Akademik KS hanya memberi CTA menuju hub Rapor dan tidak mempertahankan list/mutasi kedua atau truncation limit tersembunyi.

### Modul Ajar

- Verifikasi author ownership memakai TeachingAssignment untuk semua akun beridentitas GURU, termasuk pejabat dual-role, serta resolver identitas berasal dari Keycloak identity dan bukan pencocokan nama/email.
- Verifikasi status `submitted -> curriculum_reviewed -> approved`, revision dari kedua tahap, actor separation, optimistic transition, KAPROG major scope, dan archive recovery.
- Pastikan permission tahap kurikulum tidak dapat dipakai untuk final atau sebaliknya, termasuk melalui dekorator any-permission.
- Pastikan tidak ada surface approval satu tahap yang masih aktif di workspace lama.

### Kegiatan Kelas dan Media

- Verifikasi magic byte, MIME, ukuran 5 MiB, opaque key, SigV4 request, timeout, redirect denial, no SSRF via legacy URL, dan konfigurasi fail-closed.
- Verifikasi owner/operator mutation, class ownership read, compare-and-set replacement, cleanup object, serta BFF session forwarding.
- Pastikan response/list tidak mengekspos object key dan browser tidak merender URL eksternal legacy.

### UI/UX

- Periksa desktop dan mobile secara source: hierarchy, table/card density, filter, pagination, loading/error/empty/success state, labels, keyboard/focus, dialog failure retention, dan tidak ada nested interactive controls.
- Nilai alur nyata per role untuk lima menu: Akademik, Jadwal, Rapor, Kegiatan Kelas, Review Modul Ajar.
- Laporkan dead-end, misleading status, duplicated authoring surface, atau kontrol yang muncul tanpa authority backend.

### Schema dan Migrasi

- Review kedua migration secara berurutan dan kompatibilitas dengan schema/seed saat ini.
- Periksa enum, audit columns/table, permission grant/revoke, historical approved RPP backfill, index, idempotency, assignment-context trigger, dan kemungkinan failure pada PostgreSQL nyata.
- Executor melaporkan fresh-database proof 42/42 migration pada `pgvector/pgvector:pg16`, tiga trigger aktif, serta runtime orphan-RPP rejection. Verifikasi source dan output report; reproduksi pada database disposable bila environment reviewer memungkinkan.
- Bedakan fresh-database proof dari staging-copy pre/post reconciliation dan restore rehearsal yang tetap wajib sebelum deploy staging.

## Verifikasi yang Harus Diulang

Gunakan junction/dependency lokal hanya bila aman dan bersihkan setelah selesai.

```powershell
npm.cmd --workspace @smk/api test -- --runInBand
npm.cmd --workspace @smk/web test -- --runInBand
npm.cmd --workspace @smk/api run type-check
npm.cmd --workspace @smk/web run type-check
npm.cmd --workspace @smk/database run type-check
npm.cmd --workspace @smk/api run lint
npm.cmd --workspace @smk/web run lint
npm.cmd --workspace @smk/api run build
npm.cmd --workspace @smk/web run build
$env:DATABASE_URL='postgresql://user:pass@localhost:5432/diis_validation'
npm.cmd --workspace @smk/database exec prisma validate
git diff --check
git diff --cached --check
```

Jika environment tidak memungkinkan suatu gate, nyatakan **NOT RUN** secara jujur. Jangan mengganti PostgreSQL disposable-copy proof dengan mock/unit test.

## Output

Buat laporan:

`docs/audits/ACADEMIC-OPERATIONAL-E2E-SOURCE-REVIEW-2026-08-13.md`

Urutan laporan:

1. Findings P0/P1/P2 dari paling berat.
2. Hal yang telah terverifikasi benar.
3. Verification command dan hasil aktual.
4. Residual risk dan test gap.
5. Verdict tunggal: `FOLLOW-UP REQUIRED` atau `APPROVED FOR EXPLICIT GIT PACKAGING`.
6. Confidence terpisah untuk source correctness, UI/UX source readiness, dan migration readiness.

Jika tidak ada P0/P1/P2, nyatakan eksplisit. Approval membuka explicit Git packaging dan PR menuju `develop`; belum merupakan staging sign-off, main promotion, atau production approval. Setelah candidate SHA terdeploy ke staging, staging-copy reconciliation/restore dan authenticated browser QA tetap wajib.
