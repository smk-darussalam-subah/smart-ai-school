# Wave 10-D PR #653 Independent Exact-PR Review

Tanggal review: 2026-09-07, Asia/Jakarta.

Verdict: **FOLLOW-UP REQUIRED**.

Status operasional: **MERGE, IMAGE PUBLICATION, STAGING, VPS CLEANUP, COMMISSIONING, AND PRODUCTION HOLD**.

## 1. Findings First

### P1-PR653-01 - Exact lockfile memasang dependency major yang tidak memenuhi kontrak

Lokasi:

- `package-lock.json:16691` - `thread-stream@3.2.0` mendeklarasikan `real-require: ^0.2.0`.
- `package-lock.json:16699` - lockfile menambahkan nested `real-require@1.0.0`.
- `docs/audits/WAVE10-D-LOCAL-IMAGE-DEPENDENCY-REMEDIATION-EXECUTOR-2026-09-07.md:134` - laporan menyatakan graph telah diverifikasi dengan npm 10.5.0 dan `npm ls`.
- `docs/audits/WAVE10-D-LOCAL-IMAGE-DEPENDENCY-REMEDIATION-INDEPENDENT-REVIEW-2026-09-07.md:70` - review source sebelumnya menerima rekonsiliasi ledger tanpa menjalankan clean graph validation yang cukup sempit untuk menangkap edge ini.

Reproduksi independen pada archive bersih exact head `6610fcc02e321ba810381ad7f05f39c5e9e3e3e5`:

```text
npm 10.5.0 ci --ignore-scripts --no-audit --no-fund
npm 10.5.0 ls thread-stream real-require --all --json
```

Install selesai, tetapi pemeriksaan kedua gagal `ELSPROBLEMS`:

```text
invalid: real-require@1.0.0 .../node_modules/thread-stream/node_modules/real-require
required: ^0.2.0 from node_modules/thread-stream
```

Resolusi Node dari `thread-stream/lib/worker.js` juga memilih nested `real-require@1.0.0`, bukan root `real-require@0.2.0`. Lampiran resolver npm 10.5.0 milik Executor sendiri tidak mempunyai nested entry tersebut dan menggunakan root `0.2.0`, sehingga entry PR bukan kebutuhan graph canonical.

Impact:

- Clean install menghasilkan graph yang melanggar deklarasi semver dependency.
- Worker `thread-stream` memuat major version di luar rentang yang dinyatakan kompatibel. Implementasi API kedua versi tampak sama pada snapshot ini, tetapi kesamaan kode saat ini bukan pengganti kontrak package dan tidak membenarkan graph invalid.
- CI hijau tidak menutup masalah karena pipeline menjalankan install/build/test, tetapi tidak menjalankan pemeriksaan graph dependency ini.
- Klaim `npm ls` pada laporan Executor tidak dapat dipakai sebagai evidence clean graph untuk exact PR.

Required fix:

1. Rekonsiliasi ulang `package-lock.json` menggunakan npm 10.5.0 agar `thread-stream@3.2.0` resolve ke `real-require@0.2.0` dan nested `node_modules/thread-stream/node_modules/real-require@1.0.0` tidak ada.
2. Tambahkan regresi mekanis yang menjalankan clean npm 10.5.0 install pada fixture/worktree disposable, kemudian mewajibkan `npm ls thread-stream real-require --all` exit 0 dan actual resolver dari worker memilih `0.2.0`.
3. Perbarui lockfile-delta ledger, evidence JSON, laporan Executor, dan laporan/review superseding sesuai hash/count baru. Jangan mempertahankan klaim full `npm ls` clean bila warning baseline atau optional-platform masih ada; laporkan scoped result secara presisi.
4. Jalankan focused dependency/Fastify/logging tests dan seluruh required CI pada head baru. Review ulang cukup pada delta follow-up, lock graph, manifest, dan CI; image/recovery tests tidak perlu diulang bila file serta hash-nya tetap identik.

Catatan triage graph lain:

- Full `npm ls --all` pada Windows juga melaporkan dua peer Webpack yang sudah ada pada base `develop`; keduanya bukan regresi PR #653.
- Dua optional Sharp/WASM packages tampil `extraneous` pada platform Windows setelah upgrade Sharp. Mereka ada pada graph resolver npm 10.5.0 sebagai transitive optional packages dan tidak dijadikan finding terpisah tanpa reproduksi lintas platform. Laporan follow-up harus menyebut batas ini agar tidak kembali mengklaim full graph clean.

Tidak ditemukan P0, P2, atau P3 baru yang terverifikasi. Seluruh masalah dependency yang diketahui dari review ini dilaporkan bersama di atas; tidak ada finding yang sengaja ditahan untuk putaran berikutnya.

## 2. Exact PR Binding

- Repository: `smk-darussalam-subah/smart-ai-school`.
- PR: `#653`.
- State: `OPEN`, `MERGEABLE`, `REVIEW_REQUIRED`.
- Head: `6610fcc02e321ba810381ad7f05f39c5e9e3e3e5`.
- Base: `develop@3ff8e3f3026ad835a56217482a597f530a7f6407`.
- Head tree/resulting tree: `5ac3b7ee23b967bcbcb64ba1371a6f4bcbe3b999`.
- Commit count: 1.
- PR manifest: exact 24 files.
- Reviews pada GitHub saat pemeriksaan: 0.
- Deployment untuk exact head: 0.

Parent commit, merge-base, remote base, local head, remote feature ref, dan PR head seluruhnya cocok. `git diff --check origin/develop...HEAD` bersih. Tiga historical local reports tetap untracked dan tidak termasuk PR.

## 3. CI dan Protection

CI run `34108676103`, attempt 1, event `pull_request`, exact head `6610fcc02e321ba810381ad7f05f39c5e9e3e3e5`:

| Required check    | Hasil |
| ----------------- | ----- |
| Lint & Type Check | PASS  |
| Build Check       | PASS  |
| Unit Tests        | PASS  |

Unit Tests mencakup test semua package dan E2E. Lint job juga menjalankan synthetic staging-readiness/deployment contracts. CI tidak mempunyai langkah `npm ls thread-stream real-require --all`, sehingga status hijau tidak membantah P1 di atas.

Protection `develop` saat review:

- required approvals: 1;
- strict required status checks: ketiga check di atas;
- admin enforcement: aktif;
- force push dan deletion: nonaktif.

Tidak ada perubahan protection, GitHub review, merge, auto-merge, deployment, atau external write dari sesi reviewer.

## 4. Manifest dan Evidence Integrity

Manifest PR tepat 24 file:

- 20 source/test/runbook files yang direview sebelumnya;
- laporan Executor;
- independent source review sebelumnya;
- evidence JSON;
- lockfile-delta JSON.

Hash verification:

| Item                                         | Hasil                                                              |
| -------------------------------------------- | ------------------------------------------------------------------ |
| Source manifest                              | 20/20 cocok                                                        |
| Executor report                              | `8fc1c121faf90bdc10cb7b63136670211177ffef01f23da9c3fda80705590578` |
| Prior independent review                     | `308b2c46c068cfa531d6e7d8fc858452a451d78e23e0ef9220aaa5ef4443876d` |
| Evidence JSON                                | `bb5b33d76d7350a562d7bb82b840e038aed647f0dbabb598a226aeff5bd740d7` |
| Lockfile delta JSON                          | `f0bce1009da0b5f90c14b723868ffced2eea0b22ab4f827bc16756f3af888559` |
| Lockfile ledger vs actual base-to-head delta | 184/184 path cocok                                                 |
| Changed entry Node 20 metadata               | Tidak ditemukan engine incompatibility untuk Node 20.20.0          |
| Changed resolved origins                     | Tidak ditemukan origin non-registry pada entry changed             |

Ledger 184/184 membuktikan inventory delta lengkap, tetapi tidak membuktikan setiap dependency edge valid. P1 menunjukkan mengapa kedua jenis pemeriksaan harus dipertahankan.

## 5. Image dan Recovery Review

Tidak ditemukan regresi image/recovery baru pada exact PR di luar finding dependency graph.

Evidence image yang dipertahankan masih terikat pada:

```text
OCI manifest: sha256:a7a17930e9356d0c31b90cb7daa629af667baecd2277ea2e3fd6a9a2d04275f6
Config:       sha256:962f076694d37bd0f0f0f79a13ba51687f28115c59262f37aff459f1af702a0d
```

Archive verifier mencocokkan 29 config/layer blobs tanpa ekstraksi dan membuktikan scanner menggunakan config yang sama. Source image/recovery, helper hashes, strict completion/provenance, cleanup-on-signal, lock, bounded observation, and no-retry semantics tetap byte-identik dengan scope yang memperoleh behavioral review sebelumnya.

Evidence yang direuse karena byte-identik:

- staging readiness 49/49;
- recovery operator 36/36;
- Gate 1 19/19;
- backup contract 43/43;
- image integration PostgreSQL/object/helper hashes;
- lifecycle HUP/INT/TERM dan invalid-image 4/4.

CI remote pada head juga memvalidasi application tests, E2E, lint, type-check, build, dan synthetic staging-readiness contracts. Tidak ada alasan untuk mengulang seluruh recovery suite hanya akibat packaging byte-identik; follow-up P1 harus menjaga hash file image/recovery tersebut.

Image lokal yang dipertahankan masih berlabel base revision `3ff8e3f...`, bukan exact packaged commit. Image tersebut tidak boleh dipublikasikan sebagai build PR #653. Setelah source follow-up dan commit final, publication gate wajib rebuild dari exact committed source dan mengikat revision, digest, SBOM, scan, helper hashes serta smoke proof baru.

## 6. Residual CVE Review

Raw Grype evidence tetap 20 matches:

- 0 Critical;
- 3 High;
- 13 Medium;
- 3 Low;
- 1 Negligible;
- 18 CVE unik.

Tiga High berasal dari scanner namespace yang tidak memasukkan backport cabang Python 3.12 secara lengkap. Exact runtime sebelumnya membuktikan Python 3.12.14 dan Expat 2.8.3. [Python 3.12.14 release](https://www.python.org/downloads/release/python-31214/) mencatat perbaikan CVE-2026-4224, CVE-2026-3644, perlindungan XML saat Expat 2.8.0+, dan bundled Expat 2.8.3. Disposisi fixed-version mismatch untuk exact image tetap masuk akal; raw scan tidak boleh dihapus.

Empat record CNA yang tampak berbeda pada pembandingan metadata memiliki affected ranges yang tetap sama; perbedaan berasal dari field/timestamp metadata yang dibandingkan, bukan perubahan applicability. Tidak ada dasar baru untuk membalik disposisi tiga High.

Tiga belas raw matches berstatus `RESIDUAL_REQUIRES_REVIEW_NO_ACCEPTANCE` tetap **belum diterima**. Mereka bukan blocker merge source ke `develop` setelah P1 diperbaiki, karena base Compose tidak mengaktifkan image candidate; mereka tetap blocker untuk risk acceptance, publication, dan staging use. Keputusan harus mengikat exact rebuilt digest serta mencatat owner, expiry/recheck, exposure, dan rollback.

## 7. Test dan Evidence Boundary

Pemeriksaan fresh pada exact PR:

- PR/base/head/tree/parent/manifest/remote refs;
- required CI binding dan protection state;
- source/report/evidence hashes;
- actual lockfile ledger 184/184;
- clean npm 10.5.0 install pada archive disposable exact commit;
- scoped `npm ls` dan actual Node resolver untuk `thread-stream`/`real-require`;
- npm audit: 0 advisory;
- OCI archive 29-blob verification dan scanner config binding;
- raw scan count/disposition reconciliation;
- `git diff --check` dan deployment lookup.

Fresh npm fixture dibuat di direktori reviewer terpisah, tidak di dalam worktree, lalu dihapus setelah pemeriksaan. Tidak ada source, report packaged, lockfile, image, registry, VPS, staging, atau production yang dimutasi.

## 8. Efficient Follow-up Contract

Putaran berikutnya harus sempit dan tunggal:

1. Perbaiki satu invalid lock edge beserta scoped regression.
2. Perbarui ledger/evidence/Executor report dan buat catatan superseding atas prior source approval.
3. Jalankan focused dependency/Fastify/logging tests dan full required CI sekali pada head baru.
4. Minta independent exact-head re-review hanya atas changed follow-up, graph result, manifest, dan CI.

Tidak perlu membangun ulang image atau mengulang recovery contracts sebelum exact source head final, selama hash 15 file image/recovery/preparation tidak berubah. Setelah head disetujui, build/scan/retest image dilakukan sekali sebagai bagian publication packet. Pendekatan ini meminimalkan waktu total tanpa menurunkan coverage atau mencampur gate.

## Rekomendasi Model untuk Tindak Lanjut

Task berikutnya: Executor menutup P1-PR653-01 pada branch PR #653, memperbarui evidence/hash, dan berhenti sebelum merge serta seluruh operasi staging.

Model / effort: **GPT-5.6 Sol (gpt-5.6-sol) / xhigh**.

Alasan: perubahan sempit tetapi berada pada supply-chain lock graph dan harus menjaga dependency, auth, image, dan recovery evidence tanpa drift.

Syarat kualitas: clean npm 10.5.0 scoped graph exit 0, actual worker resolve `real-require@0.2.0`, manifest exact, dan required CI hijau pada head baru.

Eskalasi bila perbaikan memerlukan regenerasi lockfile luas atau mengubah runtime package lain: **GPT-6 Astra / high** untuk rekonsiliasi supply chain lintas-workspace.

Sesi laporan ini: **model/effort aktual tidak terverifikasi**.
