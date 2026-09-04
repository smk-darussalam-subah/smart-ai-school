# Wave 10-D0 PostgreSQL Integration Provenance Follow-up

Tanggal: 4 September 2026
Peran: Executor source follow-up
Branch: `fix/w10d-postgres-integration-provenance`
Base commit / `origin/develop`: `16914f6a9fd02527b567fc53b591e545cc4b68d6`
Base tree: `5b347c97c419c996679d7f6e680a0f1ffbdeaaee`
Staging deploy yang memicu QA: `6de353943cd4413b6fa3c5fe15b4679084a1671e`
Production application SHA tetap: `ab3be1d48dfca1dcfbb763dc329b3aee92bd320f`

## 1. Verdict

**`SOURCE FOLLOW-UP COMPLETE - INDEPENDENT RE-REVIEW REQUIRED`**

P2 pada harness PostgreSQL telah ditutup pada source dan dibuktikan dengan
PostgreSQL/Docker aktual. Patch belum di-commit, belum di-push, belum dibuat PR,
dan belum dipromosikan kembali ke staging. Production commissioning, privileged
inspection, credential/provider setup, backup/restore production, sudoers,
timer, Prompt 7, dan pilot tetap **HOLD**. Production restore tetap **tidak
diotorisasi**.

## 2. Scope dan manifest literal

Perubahan tracked dibatasi tepat pada satu file:

| File | SHA-256 | Delta |
| --- | --- | --- |
| `infrastructure/docker/tests/wave10-postgres-integration.sh` | `3c8e576e187c8d6899bf71797b03f6f8310c962d883a0d9c8ba54f03bd36f15f` | `+247/-27` |

Laporan ini adalah evidence Executor terpisah dari manifest source. Dua laporan
yang sudah ada tetap untracked dan tidak diubah:

- `WAVE10-D0-RECOVERY-BACKUP-STAGING-QA-2026-09-04.md`;
- `WAVE10-D0-RECOVERY-BLOCKER-CLOSURE-PREPARATION-PACKAGED-REVIEW-2026-09-04.md`.

## 3. Closure P2

Harness sekarang membentuk satu rantai identitas yang konsisten:

- satu `backupId` menjadi nama dump, checksum, completion, object manifest,
  provenance, dan proof;
- completion memuat seluruh field wajib validator, termasuk class/protection,
  epoch, dump bytes/hash, independent off-site fingerprint, object state/hash,
  count rekonsiliasi, serta kapasitas filesystem disposable aktual;
- object manifest memakai header `diis-object-manifest-v1|<backupId>|exact`,
  dihitung SHA-256-nya, dan divalidasi dengan validator source yang sama;
- provenance memakai schema `diis-offsite-restore-input-v1`, source
  `independent-crypt`, serta mengikat nama, ukuran, dan hash seluruh input;
- proof ditempatkan pada direktori privat `0700`, dengan
  `PROVENANCE_FILE` dan `RESTORE_PROOF_OUTPUT` eksplisit;
- proof v2 diverifikasi untuk status, source, backupId, hash provenance, hash
  dump, hash object manifest, dan epoch;
- cleanup memverifikasi absence database restore, lock, ownership registration,
  archive-list temporary file, container, network, dan root temporary test;
- kegagalan observasi cleanup tidak diperlakukan sebagai absence: harness
  mengeluarkan `WAVE10_POSTGRES_INTEGRATION_CLEANUP_AMBIGUOUS retry=prohibited`
  dan mengubah success menjadi status 70;
- source `scripts/restore-drill.sh` tidak diubah atau dilemahkan.

## 4. Behavioral state-machine proof

| Jalur | Boundary | Expected | Hasil aktual |
| --- | --- | --- | --- |
| Success | input `independent-crypt` valid | restore selesai, proof v2 success, seluruh resource disposable hilang | PASS |
| Input invalid | provenance `source=local-minio` | reject sebelum mutation, proof failed/unavailable, state DB tidak berubah | PASS |
| Signal | TERM setelah `CREATE DATABASE` aktual selesai | exit 143, proof failed tetap terikat provenance, DB/lock/ownership/temp hilang | PASS |
| Harness exit | container/network/temp terdaftar dengan nama eksak | remove lalu observe exact absence; observation error fail closed | PASS |

Signal injection dilakukan melalui wrapper Docker test-only yang mendelegasikan
seluruh operasi ke Docker aktual. Wrapper hanya mengirim TERM setelah perintah
`CREATE DATABASE` disposable berhasil, sehingga cleanup source diuji pada batas
mutation nyata tanpa mengubah restore implementation.

## 5. Evidence verifikasi

### 5.1 Focused contracts

| Check | Hasil |
| --- | --- |
| `infrastructure/docker/tests/backup-contract.sh` | PASS, `32/32` |
| `infrastructure/docker/tests/recovery-operator-contract.sh` | PASS, `20/20` |
| Shell parse untuk harness | PASS |

### 5.2 PostgreSQL/Docker aktual

Integrasi dijalankan pada salinan source worktree di filesystem Linux privat,
Node `20.20.2`, npm `10.8.2`, Docker client/server `29.4.3`, dan image PostgreSQL
terpin:

`pgvector/pgvector@sha256:00ba258a66dac104fd5171074a0084462a64a1369d8513f3d0a634e2f24d15bc`

Hasil:

- 46/46 migrasi diterapkan pada PostgreSQL disposable;
- test concurrency last-Super-Admin lulus `3/3`;
- success restore menghasilkan proof v2 `independent-crypt` yang seluruh
  binding hash-nya cocok;
- invalid provenance ditolak sebelum database mutation;
- TERM setelah database creation menghasilkan exit `143` dan cleanup absence
  proof;
- final marker:
  `WAVE10_POSTGRES_INTEGRATION_COMPLETE ... provenance=independent-crypt invalid=pre-mutation signal-cleanup=verified`;
- cleanup marker:
  `WAVE10_POSTGRES_INTEGRATION_CLEANUP_COMPLETE container=absent network=absent temp=absent`;
- runner source copy, Node runtime sementara, extraction container, dan image
  runner sementara telah dihapus setelah test.

### 5.3 Full repository checks

| Check | Hasil |
| --- | --- |
| Type check | PASS, `9/9` tasks |
| Lint | PASS, `3/3` tasks; tidak ada error/warning ESLint |
| API tests serial | PASS, `72` suites / `1,376` tests; `2` suites / `10` tests gated dan skipped |
| Web tests serial | PASS, `53/53` suites / `377/377` tests |
| Auth tests serial | PASS, `52/52` tests |
| Build | PASS, `6/6` tasks termasuk Nest API dan Next production build |

Run test paralel pertama mengalami tiga timeout 5 detik pada
`help-system.test.ts` ketika runner lokal mengalami contention berat. Tidak ada
assertion failure. Suite tersebut kemudian lulus terisolasi `33/33`, dan full
API/web/auth suite lulus ulang dengan concurrency satu serta `--runInBand`.
Evidence ini dicatat apa adanya dan tidak direpresentasikan sebagai kegagalan
source yang ditutup diam-diam.

### 5.4 Hygiene

| Check | Hasil |
| --- | --- |
| `git diff --check` | CLEAN |
| `git diff --cached --check` | CLEAN |
| Staged files | `0` |
| Tracked changes | tepat `1` file manifest |
| High-confidence secret pattern scan pada diff | `0` match |
| `gitleaks` / `detect-secrets` | unavailable; tidak direpresentasikan sebagai PASS |
| `shellcheck` | unavailable; tidak direpresentasikan sebagai PASS |

Password di harness adalah literal sintetis `synthetic-wave10-only`, hanya
untuk PostgreSQL disposable lokal, dan bukan credential lingkungan.

## 6. No-production-impact dan stop condition

Tidak ada SSH, GitHub environment mutation, branch-protection mutation,
credential/provider access, root inspection, staging runtime mutation, atau
production mutation dalam follow-up ini. Docker hanya digunakan untuk resource
disposable berlabel restore resmi dan test runner lokal, lalu absence-nya
diverifikasi.

Tahap berikutnya adalah independent source re-review atas exact satu-file hash
dan laporan ini. Git packaging/commit/push/PR serta staging re-QA tetap
memerlukan gate berikutnya. Setelah source dipaketkan dan dipromosikan, staging
re-QA cukup mengikat exact SHA dan memverifikasi harness restore, cleanup,
health, serta production no-touch.
