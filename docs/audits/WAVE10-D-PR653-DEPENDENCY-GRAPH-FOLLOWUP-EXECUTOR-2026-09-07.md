# W10-D PR #653 Dependency Graph Follow-up — Executor

Tanggal: 2026-09-07, Asia/Jakarta.

**Verdict: `SOURCE FOLLOW-UP COMPLETE - EXACT-HEAD RE-REVIEW REQUIRED - ALL OPERATIONAL MUTATIONS HOLD`.**

## 1. Scope dan binding

Follow-up ini menutup tepat `P1-PR653-01` dari laporan independent exact-PR review SHA-256 `f89100f156afa1ebbad369096ac812acd9d44ff5eb7e744a540b9eacf6086fed`.

- Repository: `smk-darussalam-subah/smart-ai-school`.
- PR: `#653`.
- Branch: `fix/w10d-prerequisite-closure-20260907`.
- Base follow-up: `6610fcc02e321ba810381ad7f05f39c5e9e3e3e5`, tree `5ac3b7ee23b967bcbcb64ba1371a6f4bcbe3b999`.
- Source final masih berupa dirty working-tree manifest sampai packaging follow-up dilakukan; jangan mengikat approval ke base commit saja.
- Tidak ada image rebuild, registry write, deployment, VPS/provider access, atau operational mutation.

## 2. Closure P1

Sebelum perbaikan, `thread-stream@3.2.0` mendeklarasikan `real-require@^0.2.0`, tetapi lockfile menambahkan nested `real-require@1.0.0`. npm 10.5.0 menghasilkan `ELSPROBLEMS` dan Node resolver dari directory worker memilih nested major yang invalid.

Perbaikan:

1. Menghapus satu entry nested invalid dari lockfile. Root `real-require@0.2.0` yang sudah ada sekarang dideduplikasi secara canonical untuk Pino dan thread-stream.
2. Menambahkan validator executable `scripts/verify-dependency-graph.cjs`. Validator mengikat versi thread-stream, declared range, absence nested lock entry, actual Node resolver version, dan actual resolved path.
3. Memperluas Jest dependency boundary agar kegagalan lock maupun runtime resolver menjadi regression failure.
4. Mengikat lint CI pada clean install npm **10.5.0**, scoped `npm ls thread-stream real-require --all`, dan validator resolver. Build/test jobs tetap menjalankan clean install existing sehingga tidak ada assertion aplikasi yang dilemahkan.

Tidak ada runtime package baru, upgrade dependency lain, schema, auth provider, atau source logging yang diubah.

## 3. Evidence lokal

| Pemeriksaan                                 | Hasil                | Batas evidence                                                                                                                 |
| ------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Disposable `npm 10.5.0 ci --ignore-scripts` | PASS, 1.296 packages | Checkout disposable dari exact base dengan prospective package/lock/script overlay                                             |
| Scoped npm graph                            | PASS                 | `thread-stream@3.2.0 -> real-require@0.2.0 deduped`, exit 0                                                                    |
| Runtime resolver                            | PASS                 | `node_modules/real-require/package.json`, version 0.2.0                                                                        |
| Focused dependency/Fastify/logging          | 15/15, 2 suites      | Actual Nest Fastify boundary dan existing logging contract                                                                     |
| API type-check                              | PASS                 | Local Windows                                                                                                                  |
| API lint                                    | PASS                 | Local Windows                                                                                                                  |
| npm audit                                   | 0 advisory, exit 0   | Registry snapshot saat eksekusi                                                                                                |
| Disposable cleanup                          | PASS                 | Fixture dan tar dipindah ke Recycle Bin lalu source path terbukti absent; dapat dipulihkan dari Recycle Bin sampai dikosongkan |

Percobaan clean install penuh lokal menjalankan postinstall tetapi gagal pada unduhan Prisma engines dengan `ECONNRESET` di Node 24. Ini dicatat sebagai kegagalan network/tooling, bukan PASS dan bukan source failure. Reproduksi reviewer-compatible dengan `--ignore-scripts` lulus; instalasi penuh, lint/type, unit/E2E, dan build Linux harus dibuktikan oleh required CI pada exact commit follow-up.

Full `npm ls --all` tidak diklaim bersih: reviewer telah mencatat dua peer Webpack baseline dan optional Sharp/WASM Windows. Acceptance follow-up dibatasi ke edge `thread-stream/real-require` yang menjadi finding.

## 4. Literal follow-up manifest

Lima source files:

```text
.github/workflows/ci.yml
apps/api/src/__tests__/w10d-dependency-security.spec.ts
package-lock.json
package.json
scripts/verify-dependency-graph.cjs
```

Empat evidence/report files:

```text
docs/audits/WAVE10-D-PR653-INDEPENDENT-EXACT-PR-REVIEW-2026-09-07.md
docs/audits/WAVE10-D-PR653-DEPENDENCY-GRAPH-FOLLOWUP-EXECUTOR-2026-09-07.md
docs/audits/WAVE10-D-PR653-DEPENDENCY-GRAPH-FOLLOWUP-EVIDENCE-2026-09-07.json
docs/audits/WAVE10-D-PR653-DEPENDENCY-GRAPH-FOLLOWUP-LOCKFILE-DELTA-2026-09-07.json
```

Superseding source manifest berjumlah **22 files**: 17 source lama byte-identik, tiga source lama yang berubah pada follow-up, serta dua source baru. Aggregate SHA-256 source: `ddde8422f509a48e9c90714455c7786c2aaa66d5083554bae068f554ce79ed67`. Daftar path/hash literal ada pada evidence JSON.

Follow-up lockfile ledger memiliki tepat **1** delta terhadap commit `6610fcc...`: penghapusan nested `real-require@1.0.0`. Ledger 184-entry lama tetap immutable sebagai bukti delta base `develop` ke commit pertama; ledger follow-up ini menjadi lapisan koreksi, bukan rewrite sejarah.

## 5. Unchanged evidence dan gate

Sebanyak 17/22 source files tetap byte-identik, termasuk seluruh 15 file image/recovery/preparation. Karena itu image/recovery suite dan local image tidak dibangun ulang pada follow-up ini. Image yang dipertahankan masih berlabel revision base lama dan tetap tidak boleh dipublikasikan. Rebuild/scan/provenance baru hanya dilakukan setelah exact source commit final disetujui pada publication gate.

Tiga High tetap berstatus fixed-version mismatch yang direview. Sebanyak 13 residual match tetap belum menerima risk acceptance. Registry/publisher/puller, capacity/writer/preservation, image publication, staging, VPS cleanup, commissioning, dan production tetap **HOLD**.

## 6. Handoff

Setelah exact follow-up packaging, required CI harus berjalan sekali pada final PR head. Reviewer berikutnya cukup memeriksa sembilan-file follow-up manifest, source manifest 22/22, one-entry lock ledger, disposable npm 10.5 proof, runtime resolver, CI binding, dan unchanged hashes. Jangan mengulang image/recovery suite selama bytes terkait tetap identik.

Full-file SHA-256 laporan ini, evidence JSON, dan follow-up ledger diterbitkan setelah final formatting/hygiene; tidak dimasukkan secara self-referential.

## Rekomendasi model untuk tindak lanjut

Task berikutnya: Independent Reviewer memeriksa exact follow-up manifest PR #653, dependency graph npm 10.5, runtime resolver, dan required CI; semua operational gates tetap HOLD.

Model / effort: **GPT-5.6 Sol (gpt-5.6-sol) / high**.

Alasan: delta sudah sempit dan memiliki executable acceptance, tetapi sign-off menyentuh supply-chain lock graph dan CI workflow.

Syarat kualitas: nested major absent, scoped npm graph dan actual resolver valid, exact hashes/CI cocok, serta tidak ada drift image/recovery.

Eskalasi bila follow-up mengubah dependency lain atau CI menunjukkan graph lintas-workspace berbeda: **GPT-6 Astra / high**.

Sesi laporan ini: **model/effort aktual tidak terverifikasi**.
