# W10-D Local Image and Dependency Remediation: Independent Review

Tanggal review: 2026-09-07, Asia/Jakarta.

Verdict source: **APPROVED FOR EXPLICIT GIT PACKAGING**.

Status operasional: **STAGING, IMAGE PUBLICATION, VPS CLEANUP, AND PRODUCTION COMMISSIONING HOLD**.

## 1. Findings First

Tidak ditemukan P0/P1/P2/P3 baru yang terverifikasi pada delta source yang direview. Tidak ada required source fix tambahan dari review ini. Ini bukan pernyataan bahwa seluruh image bebas CVE, bahwa seluruh dependency bebas kelemahan, atau bahwa prasyarat staging telah selesai.

| Kategori                                            | Putusan                                                                                                                                      |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Source regression/security defect baru              | Tidak ditemukan pada scope dan pengujian di bawah                                                                                            |
| Tiga High pada raw scan image                       | Disposisi **fixed-version mismatch** diterima untuk exact image ini, berdasarkan CNA PSF dan observasi runtime; raw scan tetap dipertahankan |
| Empat match Python lain dengan backport             | Bukti affected-version tidak mencakup installed version; tidak dihapus dari raw scan                                                         |
| 13 match residual lainnya, 11 CVE unik              | Tetap terbuka untuk keputusan risiko image; **tidak diterima otomatis**                                                                      |
| Registry, kapasitas, writer/preservation, CI remote | Gate eksternal/release yang masih harus ditutup; bukan source bug baru yang disembunyikan                                                    |

Review mengonsolidasikan seluruh keputusan dalam dokumen ini. Tidak diperlukan putaran source remediation hanya untuk mengulang hasil yang sudah konsisten. Bila source, lockfile, image recipe, atau manifest berubah, review delta baru diperlukan.

## 2. Exact Binding

Worktree: `C:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school-w10d-prerequisite-closure-20260907`.

- Branch: `fix/w10d-prerequisite-closure-20260907`.
- HEAD: `3ff8e3f3026ad835a56217482a597f530a7f6407`.
- HEAD tree: `78da4a9ef36c4f1e12932fb51c1d6c70826bd487`.
- Reviewed source: exact 20-file dirty manifest, bukan HEAD saja.
- Executor report: `WAVE10-D-LOCAL-IMAGE-DEPENDENCY-REMEDIATION-EXECUTOR-2026-09-07.md`.
- Executor full SHA-256: `8fc1c121faf90bdc10cb7b63136670211177ffef01f23da9c3fda80705590578`.
- Evidence JSON SHA-256: `bb5b33d76d7350a562d7bb82b840e038aed647f0dbabb598a226aeff5bd740d7`.
- Lockfile delta JSON SHA-256: `f0bce1009da0b5f90c14b723868ffced2eea0b22ab4f827bc16756f3af888559`.
- Source aggregate SHA-256: `3a4f003860e69059c747cd7d180ca2afa707c94aafda606ddd552bbe22356c20`.

Aggregate dihitung dengan mengurutkan 20 path ASCII secara ascending, kemudian menggabungkan setiap baris `<lowercase-sha256><dua spasi><repository-relative-path><LF>`, UTF-8 tanpa BOM. Hash tiap file tersedia dalam `sourceManifest` pada evidence JSON yang diikat di atas. Reviewer mencocokkan ulang 20/20, bukan hanya mempercayai aggregate.

Literal manifest source:

```text
docs/runbooks/w10d-staging-readiness.md
infrastructure/deploy/diis-build-cache-cleanup.sh
infrastructure/deploy/staging-readiness-deploy.py
infrastructure/deploy/tests/staging-readiness-contract.py
infrastructure/deploy/tests/buildkit-capacity-adapter-contract.py
infrastructure/deploy/tests/fixtures/buildkit-v0300-engine2952-redacted-20260907.json
scripts/assess-buildkit-capacity.py
scripts/observe-buildkit-capacity.py
infrastructure/docker/pg-backup.Dockerfile
infrastructure/docker/scripts/backup.sh
infrastructure/docker/tests/backup-contract.sh
infrastructure/docker/tests/w10d-gate1-source-followup-contract.sh
infrastructure/docker/tests/wave10-postgres-integration.sh
infrastructure/docker/tests/w10d-remediated-image-integration.py
infrastructure/docker/tests/w10d-remediated-image-lifecycle.py
package.json
package-lock.json
apps/web/package.json
apps/web/src/__tests__/w10d-auth-security.test.ts
apps/api/src/__tests__/w10d-dependency-security.spec.ts
```

Delapan file preparation dipertahankan byte-identik terhadap evidence terdahulu. Review semantik difokuskan pada 12 file remediation image/recovery/dependency, dengan pemeriksaan ulang hash dan kontrak preparation. Tidak ada Prisma schema/migration, base Compose, provider/callback auth, atau workflow deployment yang diubah oleh slice remediation ini.

## 3. Review Semantik

### Dependency dan auth

- Actual lockfile delta cocok dengan ledger: **184/184 entry**, tanpa missing/extra. Seluruh resolved URL baru yang relevan berada pada registry npm resmi; tidak ditemukan git/host alternatif pada delta.
- Tidak ada engine Node dari changed entries yang menolak Node 20.20.0 dalam pemeriksaan semver. Ini pemeriksaan metadata, bukan pengganti execution CI Linux Node 20.
- Override Fastify/PostCSS/Pino dan pin NextAuth diperiksa bersama dependency consumer, actual module resolution, dan tes FastifyAdapter. Tidak menggunakan `legacy-peer-deps` atau menghapus advisory melalui suppression.
- Tes aktual NextAuth JWT mencakup expired/tampered token, role filtering, bearer/cookie behavior, session projection dan redirect. Source callback/provider/middleware yang tidak berubah diperiksa sebagai konteks, bukan dianggap berubah oleh patch.
- `npm audit --json` independen menghasilkan exit 0 dan **0 advisory** pada waktu review. Hasil ini hanya snapshot audit registry, bukan jaminan tidak ada vulnerability yang belum dikenal.

### Image dan recovery

- Base Python/PostgreSQL dan lima APK terikat immutable digest/checksum; instalasi APK tetap signed/no-network. Tidak ada mutable Dockerfile frontend selector baru.
- Runtime aktual: Python **3.12.14**, Expat **2.8.3**, OpenSSL **3.5.8**, SQLite **3.53.4**. Pemeriksaan dilakukan pada local exact image dengan network disabled dan read-only filesystem.
- Satu pembacaan UTC pada `backup.sh` mengikat identity, epoch, daily/weekly/monthly fields dan created time. Kontrak rollover membuktikan tidak ada campuran periode dari beberapa clock read.
- Integration harness membatasi Docker Desktop lokal, image/platform, synthetic credentials, internal network, tmpfs dan resource ownership. Uji berhasil plus HUP/INT/TERM dan invalid-image membuktikan cleanup pada batas yang dimodelkan.
- Tidak ditemukan pelemahan provenance, strict completion, writer lock, preservation, cleanup ambiguity, atau no-retry semantics pada diff ini.

## 4. Image Provenance dan CVE

Exact local OCI manifest/image binding:

```text
sha256:a7a17930e9356d0c31b90cb7daa629af667baecd2277ea2e3fd6a9a2d04275f6
```

Config digest: `sha256:962f076694d37bd0f0f0f79a13ba51687f28115c59262f37aff459f1af702a0d`.

Reviewer memverifikasi hash **29 config/layer blobs** dari archive tanpa ekstraksi ke disk, serta kesamaan config dengan hasil scanner. Perbedaan digest manifest hasil konversi scanner bukan dianggap drift tanpa memeriksa config/layers. Pemeriksaan hash source, retained artifacts dan CNA records berjumlah **52/52 cocok**.

Raw Grype snapshot tetap **20 matches: 0 Critical, 3 High, 13 Medium, 3 Low, 1 Negligible**. Reviewer tidak mengubah atau menekan hasil scanner dan tidak menjalankan fresh full Grype scan dengan database baru; artifact scan yang diikat dan source CNA primer diperiksa.

| CVE                                                                                                                          | Disposisi reviewer untuk exact image                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CVE-2026-4224, CVE-2026-3644                                                                                                 | CNA PSF menyatakan cabang 3.12 affected hanya di bawah 3.12.14; installed 3.12.14 berada di luar rentang                                                                              |
| CVE-2026-7210                                                                                                                | Python 3.12.14 dan Expat 2.8.3 aktual memenuhi kombinasi perbaikan; bukan hanya mengandalkan string versi Python                                                                      |
| CVE-2026-4360, CVE-2026-4519, CVE-2025-13462                                                                                 | CNA/backport evidence tidak mencakup installed 3.12.14                                                                                                                                |
| CVE-2025-13837                                                                                                               | Perbaikan sejak 3.12.13; installed 3.12.14 tidak termasuk affected range                                                                                                              |
| CVE-2025-12781, CVE-2026-3446, CVE-2025-15366, CVE-2025-15367, CVE-2026-15806, CVE-2026-17084, CVE-2026-19672, CVE-2026-6019 | Library masih berada dalam image. Tidak ditemukan pemakaian API Python terdampak pada helper/runtime scripts yang diperiksa; ini pembatasan exposure, bukan penghapusan vulnerability |
| CVE-2025-60876, tiga BusyBox matches                                                                                         | Wget bootstrap memakai URL literal dan checksum; vulnerability library tetap residual, tidak diklaim sudah ditambal distro                                                            |
| CVE-2026-15310                                                                                                               | Zip bootstrap checksum-bound dan exact member membatasi input, tetapi decompression residual tetap memerlukan keputusan risiko                                                        |
| CVE-2026-3479                                                                                                                | Upstream-disputed/documentation behavior; raw Negligible tetap dicatat                                                                                                                |

Primary CNA PSF untuk tiga High dibaca ulang melalui [CVE-2026-4224](https://cveawg.mitre.org/api/cve/CVE-2026-4224), [CVE-2026-3644](https://cveawg.mitre.org/api/cve/CVE-2026-3644), dan [CVE-2026-7210](https://cveawg.mitre.org/api/cve/CVE-2026-7210). [Python 3.12.14 release](https://www.python.org/downloads/release/python-31214/) dan [upstream XML entropy issue](https://github.com/python/cpython/issues/149018) mendukung backport dan persyaratan Expat. CNA lainnya tersedia dengan hash dalam evidence JSON dan telah dibaca; tidak semuanya diambil ulang dari jaringan pada review ini.

Kesimpulan CVE: tidak ada High yang masih applicable berdasarkan versi/CNA untuk exact image ini. **Tidak menyimpulkan image memiliki nol CVE atau menerima 13 residual.** Persetujuan publikasi/deployment harus mencatat disposition exact digest, owner, expiry/recheck dan batas penggunaan; keputusan tersebut terpisah dari approval source ini.

## 5. Verifikasi Independen

Command di bawah dijalankan dari exact worktree; shell contracts dan synthetic image tests melalui WSL/Linux lokal. Semua session test telah selesai, bukan ditinggalkan sebagai background task.

| Pemeriksaan                                                  | Hasil reviewer                                                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `staging-readiness-contract.py`                              | 49/49 PASS, termasuk Compose validation                                                          |
| `recovery-operator-contract.sh`                              | 36/36 PASS                                                                                       |
| `w10d-gate1-source-followup-contract.sh`                     | 19/19 PASS                                                                                       |
| `backup-contract.sh`                                         | 43/43 PASS                                                                                       |
| Web auth-security + middleware suites                        | 2 suites / 43 tests PASS, actual JWT                                                             |
| API dependency-security suite                                | 6/6 PASS, actual Fastify injection                                                               |
| `w10d-remediated-image-integration.py --image <exact-image>` | PostgreSQL 2/2 rows dump/restore; sample object hash/corruption; helper hashes 3/3; cleanup PASS |
| `w10d-remediated-image-lifecycle.py --image <exact-image>`   | 4/4 PASS: HUP, INT, TERM, invalid image                                                          |
| `npm run type-check -- --force`                              | 9/9 tasks PASS, cache bypass                                                                     |
| `npm run lint -- --force`                                    | 3/3 tasks PASS, cache bypass; existing Next lint deprecation/plugin warning                      |
| `npm audit --json`                                           | Exit 0, advisory 0                                                                               |
| Source/evidence hash, lockfile ledger                        | 20/20 source; 52/52 combined checks; 184/184 lockfile entries                                    |
| Bash syntax / Python AST                                     | 5/5 and 7/7 PASS; no bytecode write                                                              |
| Diff / cached diff / source conflict and secret-pattern scan | Clean; source patterns 20/20; staged 0                                                           |
| Local labelled image-test container/network after tests      | 0 / 0                                                                                            |

Satu command syntax awal gagal karena quoting PowerShell-to-WSL pada loop; tidak menjalankan target atau mengubah source. Pemeriksaan diulang dengan path literal terpisah dan seluruh lima script lulus. Ini kesalahan invocation reviewer, bukan defect source.

Batas evidence yang sengaja tidak diubah menjadi klaim PASS independen:

- Full API/web/auth suites, full Next build 49 pages, clean npm 10.5.0 install, dan 46-migration/concurrency proof direuse dari evidence Executor exact source. Tidak diulang seluruhnya pada sesi ini; reviewer menjalankan affected runtime/security tests, forced type/lint dan local image integration di atas.
- Tidak ada remote CI baru. CI Linux/Node 20 pada packaged commit tetap wajib sebelum merge; metadata engine dan Node 24 local tests tidak menggantikannya.
- Image synthetic test bukan restore aplikasi production, independent-provider recovery proof, Google Drive commissioning, ataupun real-data pilot.
- Tidak ada fresh browser QA terhadap Next/NextAuth di staging. Setelah authorized deploy, affected login/session/role/redirect dan health matrix wajib terikat exact deployed SHA.
- Tidak ada akses registry, VPS/provider, credential produksi, DNS mutation, cleanup VPS, scheduler, atau staging/production mutation pada review ini.
- Tidak ada Prisma schema/migration delta; Prisma validate/full database migration tidak diulang khusus review ini.

Compose configuration validation adalah operasi client-side; tidak memerlukan daemon hanya untuk `config`. Kegagalan tool lama tidak boleh dijadikan klaim bahwa source Compose invalid. Validasi kontrak Compose aktual kini lulus di lingkungan reviewer.

## 6. Keputusan Gate dan Urutan Paling Efisien

**Source review selesai; boleh diajukan untuk explicit Git packaging.** Ini verdict reviewer, bukan instruksi untuk langsung commit/push/merge/publish/deploy.

1. Dengan otorisasi packaging Director, gunakan 20 path source literal ditambah tiga evidence baru yang disebut pada binding. Bila laporan reviewer ini ikut dipaketkan, jumlah menjadi 24 path; tetapkan hash final laporan setelah formatting. Jangan menyertakan tiga historical reports, image/archive, scan cache, credential atau scratch secara otomatis.
2. Jalankan CI remote satu kali pada exact packaged head. Untuk perubahan non-source berikutnya, reuse evidence yang masih byte-identik; jangan mengulang seluruh full suites hanya karena report hash berubah.
3. Secara terpisah, siapkan satu keputusan konsolidasi atas 13 residual image matches dan akses minimum registry publisher/puller. Jangan memaksa upgrade major Python hanya untuk menghilangkan false matches yang sudah ditambal. Bila residual ternyata reachable atau policy melarangnya, baru lakukan remediation terarah dan rescan exact image.
4. Sebelum publikasi, rebuild dari committed source dengan label revision yang benar, pin resulting digest/platform dan bind SBOM/scan/smoke/helper hashes. Label HEAD pada image lokal hasil dirty source bukan attestation bahwa image tersebut dibangun dari committed HEAD; evidence source manifest tetap menjadi binding lokal saat ini.
5. Sebelum staging, gabungkan fresh capacity, writer exclusion, root-cron summary, preservation, registry pull dan rollback proof dalam satu preflight. Nilai kapasitas dan readiness provider historis tidak disahkan kembali oleh review lokal ini. Cleanup VPS tetap memerlukan approval khusus.
6. Delta sekarang menyentuh aplikasi dan lockfile, sehingga gunakan release aplikasi standar beserta rollback image API/web; jangan mengakali recovery-only guard. Approval staging harus mencakup application dependency changes dan exact image/runtime binding. Commissioning tetap gate terpisah.

Tidak diperlukan source-fix round baru berdasarkan review ini. External holds diselesaikan dengan evidence atau keputusan owner yang relevan, bukan dengan menggandakan audit source yang sama.

## 7. Confidence dan Completion

- Source correctness dan regression: **tinggi untuk scope teruji**, ditopang behavioral contracts, actual auth/API tests, type/lint dan hash/lockfile reconciliation.
- Image provenance dan triage tiga High: **tinggi untuk exact local image**; runtime Expat turut diperiksa, archive dan scanner config direkonsiliasi.
- Security residual: **terbatas pada call paths yang direview**; tidak merupakan acceptance seluruh library atau workload masa depan.
- Deployment/staging E2E: **belum disahkan**; remote CI dan affected browser/runtime QA belum dilakukan pada candidate ini.
- Production recovery/readiness: **tidak dinilai ulang dan tetap HOLD**.

Source dan laporan Executor tidak diedit. Reviewer hanya menambahkan laporan ini, menjalankan pemeriksaan lokal/non-production dan fixture sintetis yang dibersihkan. Image final/evidence milik Executor dipertahankan; tidak ada staging file, commit, push atau PR dari sesi reviewer.

## Rekomendasi Model untuk Tindak Lanjut

Task berikutnya: Executor melakukan literal packaging dan CI exact-head setelah otorisasi Director; tanpa merge, image publication atau deployment.

Model / effort: **GPT-5.6 Terra (gpt-5.6-terra) / medium**.

Alasan: keputusan source sudah selesai dan pekerjaan berikutnya bersifat manifest/hash/CI yang dapat diperiksa secara mekanis; tidak memerlukan pengulangan investigasi lintas-sistem.

Syarat kualitas: 20 source hashes tetap, manifest evidence eksplisit, CI terikat exact head, dan seluruh operational holds dipertahankan.

Eskalasi bila ada source drift atau kegagalan auth/runtime baru: **GPT-5.6 Sol / high** untuk diagnosis semantik, sebelum melanjutkan packaging.

Sesi laporan ini: **model/effort aktual tidak terverifikasi**.
