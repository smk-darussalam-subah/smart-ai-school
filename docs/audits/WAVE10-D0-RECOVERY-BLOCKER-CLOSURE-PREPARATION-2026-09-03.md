# Wave 10-D0 Recovery Blocker Closure Preparation — Consolidated Follow-up 6

Tanggal: 2026-09-04 WIB
Peran: W10-D0 Recovery Blocker Closure Executor
Mode: source/evidence harness lokal; production read-only dan tidak diakses ulang
Status: **`SOURCE FOLLOW-UP COMPLETE - INDEPENDENT RE-REVIEW REQUIRED`**

## 1. Scope dan evidence binding

Follow-up keenam menutup P2-D0R16 pada re-review independen terbaru
(`67026d091c47c3d08366808dd076e3144c7d01549adc13c6fd19f563dd47968e`).
P2-D0R15 dan empat finding sebelumnya tetap tertutup:

- P1-D0R11 — provenance executable `rclone` terhadap archive terpin;
- P1-D0R12 — final object observation fail-closed, termasuk zero-object backup;
- P2-D0R13 — partial remote `mkdir` masuk cleanup responsibility;
- P2-D0R14 — pre-create Docker observation membedakan absent/present/error.

Source tetap berasal dari exact main SHA/tree:

- SHA: `ab3be1d48dfca1dcfbb763dc329b3aee92bd320f`;
- tree: `86acc71be13e2ad9f4613370c8f27c6f893ab972`;
- deploy run evidence terdahulu: `33752562554`, success.

Tidak ada production/provider/root/privileged command, cleanup, backup, restore,
credential access, scheduler activation, commit, staging, push, PR, merge, atau
deploy. Tidak ada authorization baru yang diinferensikan dari source test.

## 2. Closure executable

### P1-D0R11 — rclone archive provenance

`capture-w10d-candidate-tool-evidence.sh` kini menghasilkan schema v3, merekam
exact archive entry `rclone-v1.70.3-linux-amd64/rclone`, menghitung hash entry
langsung dari `/opt/backup-bin/rclone.zip`, dan menuntut kesamaan dengan hash
executable `/opt/backup-bin/rclone` sebelum evidence diterbitkan. Validator
mewajibkan exact entry, archive-entry hash, executable hash, pinned archive hash,
dan versi; versi saja tidak cukup. Handoff merekam ulang evidence aktual setelah
lock dan tepat sebelum mutation.

Positive test membuktikan archive-entry/executable exact match. Negative test
menggunakan executable berbeda yang tetap melaporkan `v1.70.3`; capture berhenti
sebelum publish dan acceptance juga menolak mismatch.

### P1-D0R12 — final object observation

`restore-objects.sh` menangkap hasil final `rclone lsf` pada command terpisah dan
memastikan command sukses sebelum menghitung object count. Observation error tidak
lagi dapat dipipakan menjadi count nol. Harness membuat completion/provenance sah
dengan `objectCount=0`, memaksa final listing gagal, dan membuktikan tidak ada
`OBJECT_RESTORE_COMPLETE` maupun proof sukses.

### P2-D0R13 — partial `mkdir`

`prepare-object-restore-target.sh` menetapkan cleanup responsibility sebelum
memanggil `rclone mkdir`. Jika provider lebih dahulu membuat prefix lalu command
gagal atau menerima HUP/INT/TERM, cleanup melakukan purge exact target dan
successful parent re-observation, atau melaporkan
`OBJECT_TARGET_CLEANUP_AMBIGUOUS ... retry=prohibited`.

Harness menguji partial mkdir failure dan ketiga signal boundary, termasuk absence
proof setelah cleanup.

### P2-D0R14 — Docker pre-create observation

`create-w10d-backup-candidate.sh` memakai exact `docker container ls` dan `docker
volume ls` dengan tiga hasil eksplisit: absent (lanjut), present (stop), atau
observation error (stop dengan
`CANDIDATE_PRECREATE_OBSERVATION_AMBIGUOUS resource=... retry=prohibited`).
Tidak ada Compose mutation pada hasil ambiguous; resource yang sudah ada tidak
diubah. Cleanup setelah resource tercatat tetap melakukan exact remove dan
post-observation dengan status ambiguous bila remove/observation gagal.

### P2-D0R15 — disposable restore ownership dan absence proof

`restore-drill.sh` kini membuat registrasi ownership pada direktori proof privat
sebelum lock atau `CREATE DATABASE` mutation. Token lock dihitung sebelum helper
dipanggil, dan kewajiban cleanup untuk lock serta database diset sebelum operasi
yang dapat menerima signal. Dengan demikian signal/exit setelah resource dibuat,
namun sebelum helper/caller mengembalikan status, tetap memiliki state cleanup
yang lengkap.

Cleanup menonaktifkan signal trap selama cleanup, menjalankan `DROP DATABASE ...
WITH (FORCE)` bila database telah diregistrasikan, lalu melakukan probe
`pg_database` yang harus berhasil dan kosong. Lock dilepas menggunakan token yang
telah dipraregistrasi dan exact path wajib tidak ada. Registration file juga
dihapus dan diverifikasi absent. Kegagalan remove atau observasi menghasilkan
`RESTORE_DRILL_CLEANUP_AMBIGUOUS databaseAbsent=... lockAbsent=... retry=prohibited`
dan proof tidak dapat berstatus sukses.

Harness fault/signal matrix membuktikan fault lock, fault database, serta HUP,
INT, dan TERM pada boundary lock dan database; jalur cleanup membuktikan
`databaseAbsent=true lockAbsent=true`.

### P2-D0R16 — binding path ownership cleanup

`restore-drill.sh` sekarang menolak setiap nilai non-empty
`RESTORE_OWNERSHIP_FILE` sebelum provenance, target, database, atau lock
mutation. Script mewajibkan `RESTORE_PROOF_OUTPUT`, menolak proof directory
atau output symlink, mewajibkan mode direktori `0700`, meng-canonicalize
direktori proof existing dengan `pwd -P`, dan menurunkan ownership registration
sebagai direct child deterministik dari direktori tersebut. Temporary ownership
file memakai basename yang sama dan tidak pernah berasal dari input path
arbitrer. Proof failure tidak ditulis bila proof root sendiri belum lolos
validasi privat.

Harness menambahkan negative-path behavioral tests untuk override ke direktori
luar, lexical traversal (`..`), komponen symlink, dan target yang sudah ada.
Keempat override berhenti sebelum `CREATE DATABASE` atau lock acquisition,
tidak membuat file target, mempertahankan symlink kontrol serta sentinel
pre-existing, dan menghasilkan proof gagal. Root proof mode `0755` juga ditolak
tanpa menulis failure proof. Boundary lock signal mengobservasi ownership file
sebagai direct child aktual dari proof directory sebelum cleanup.

## 3. Closure sebelumnya tetap berlaku

Writer lock mutual exclusion, disposable restore ownership/absence proof, candidate Compose isolation/no legacy-volume fallback,
runtime contract exact-field dan source binding, plaintext cleanup, independent
crypt provenance, root-cron ordered digest, object observability, candidate
single-authority handoff, rollback legacy, Shared Drive binding, serta clean
worktree/literal manifest tetap tertutup dan diuji tanpa regresi.

## 4. Verification

| Check | Result |
| --- | --- |
| `infrastructure/docker/tests/backup-contract.sh` | PASS, 32/32 |
| `infrastructure/docker/tests/recovery-operator-contract.sh` | PASS, 20/20 |
| Archive-entry/executable positive and same-version drift negative | PASS |
| Zero-object final observation failure | PASS; no success proof |
| Partial mkdir failure + HUP/INT/TERM | PASS; absence or ambiguous no-retry |
| Pre-create container/volume observation error with existing resource | PASS; no mutation |
| Candidate cleanup remove/observe failure | PASS; explicit ambiguous no-retry |
| Restore lock/database fault + HUP/INT/TERM matrix | PASS; exact absence or explicit ambiguous no-retry |
| Restore absence-observation fault | PASS; ambiguous/no-retry, no false success |
| Ownership path outside/traversal/symlink/pre-existing negative controls | PASS; rejected before target mutation and non-target unchanged |
| Runtime/tool/cron/provenance/rollback regressions | PASS in focused harness |
| Shell syntax, Python compile, Compose render | PASS (local executor; independent reviewer Python compile unavailable) |
| `git diff --check` and cached check | CLEAN |
| Staged files | 0 |
| `shellcheck` | unavailable; not represented as PASS |

Focused contracts adalah gate yang sesuai karena delta hanya recovery shell/Python,
Compose, dan runbook. Docker Compose hanya dipakai untuk local config render;
tidak ada live container atau production mutation.

## 5. External gates tetap HOLD

Source closure tidak mengisi atau menebak live Shared Drive owner/destination/quota,
crypt password/salt custody, Hetzner seven-slot inventory/protection/ownership/
restore quote, refreshed production capacity/runtime/root-cron state, operators,
incident contacts, post-merge deployed SHA/tree, atau execution window. Semua
nilai tersebut memerlukan Director/provider/privileged gate terpisah.

- Checkpoint B: **HOLD**;
- Git packaging/commit/push/PR/merge: **HOLD**;
- privileged inspection, commissioning, credential setup: **HOLD**;
- Prompt 7, piloting, n8n activation: **HOLD**;
- production restore: **NOT AUTHORIZED**.

## 6. Literal 27-source-file manifest

Reviewer report adalah foreign evidence dan tidak termasuk manifest. Executor report
ini juga terpisah. Seluruh hash berikut dihitung dari worktree final.

| File | SHA-256 |
| --- | --- |
| `docs/runbooks/backup-restore.md` | `d36d8c2639d60b21097233fe45e36f54fda59223fbdd069d95933aa7e13b574a` |
| `docs/runbooks/offsite-backup-recovery.md` | `b9a094e39d0fde34f356b2889c4cdfe928d0014b1067edba1b33d1eff287f69d` |
| `docs/runbooks/restore-database.md` | `2f0b1678264a378f621648e6811c9bf823d2af69a07f017e8919c3150fb35db8` |
| `infrastructure/deploy/create-w10d-backup-candidate.sh` | `278c1ff86e5ab315d0c67e7f40b507fbb8f046af649cbc6a5f5c0ad093f5678e` |
| `infrastructure/deploy/diis-build-cache-cleanup.sh` | `3830c60e5f07ae4930deb068ea4401fd3db71335ff3b4e1216e22d7e3b92b8ca` |
| `infrastructure/deploy/run-with-diis-host-lock.sh` | `b283bc0e06d04abc689b1c477b6217de6955579f670a44c274ea31e7f5a410ec` |
| `infrastructure/deploy/w10d-backup-scheduler-handoff.sh` | `5cecf0a853c8c33264c7728afdeb69ac52cc9208eac096eac1b4df6e977933bd` |
| `infrastructure/docker/docker-compose.backup-candidate.yml` | `908933b1525f31407853a1a87c8d7488b345872a8180781ad3a29c97502c7de9` |
| `infrastructure/docker/docker-compose.yml` | `126cbb5c7db325505f216d1250ac61bd1410673232279481a306d198b49186c6` |
| `infrastructure/docker/scripts/backup-lib.sh` | `5235dece7fc99e0bce21ab1bfa3d0caeca8637e8ff0e8dbf1e4a14898653886f` |
| `infrastructure/docker/scripts/backup.sh` | `765222bc4f461f0ffb6708f33a3dcfae1210eb4f085bf4042bacc3662f31edaa` |
| `infrastructure/docker/scripts/offsite-replication.sh` | `f10d8bf3d21a527ee5753b1e2a5c38b0ef2386ed982076751f7be1102bc5830e` |
| `infrastructure/docker/scripts/restore-objects.sh` | `319d8ce9bb704cacca2aebbadc11b79f88f3f89ead298c8ba41089547d84c63a` |
| `infrastructure/docker/tests/backup-contract.sh` | `aa9aa19e58672ca2704f4acac66f4f80795fc456071e69618aff261f891803a3` |
| `infrastructure/docker/tests/recovery-operator-contract.sh` | `e61e3cfc9b0b45ac84d29c7ce5a3d3fb0362880d13ee1ba58db1487c76b7d436` |
| `scripts/capture-w10d-candidate-tool-evidence.sh` | `afea88093e08c36fc1c7af020edc0ef561d1cf2630fe054538e40c4be4ef32c1` |
| `scripts/cleanup-object-restore-target.sh` | `9139555b076ebd68f28b4ae564c4d17b02d02ebca03eb85c3a04bb83b1c78449` |
| `scripts/cleanup-offsite-restore.sh` | `14701f69ffe0e2d5648471ea750e1ece131925923b31375097098be9caf2d3ec` |
| `scripts/docker-container-redacted-manifest.py` | `bae5b484690f81c0ff8e2c2bfe545c08e4761c5bb9f5b468457438be2705ea3e` |
| `scripts/docker-no-touch-digest.py` | `03114381c7beb57dbb08c3b7dab0c81456e77d73f762114951ccf47a3207c567` |
| `scripts/prepare-object-restore-target.sh` | `3906033bd0ecbf2781ea2bdbebfa8482b64ca6934a26492882142de5e5b44fe9` |
| `scripts/prepare-offsite-restore.sh` | `d4efbcaf571448b17efca0b5a49149b0f144f3ccbca882cf67db97aac0b5a79b` |
| `scripts/production-recovery-readonly-summary.sh` | `4a7fbfbe8d6b7cecea130b30bcefe4953e45df36e4a57e6f651e2481907d118b` |
| `scripts/publish-restore-proof.sh` | `ed9624437220766b5e47dd60a4cecd3eea19f64551492b45cc28ddd51e6e4bf1` |
| `scripts/restore-drill.sh` | `3ebff632a240bd10f3c128af112eea0f3e5bc729e8ed9993111c1dbcc033a7ed` |
| `scripts/root-cron-summary.py` | `e67f78511f11d48af119a198b7540b67ce8a536a272504b23cc5d565fe677e62` |
| `scripts/validate-w10d-candidate-acceptance.py` | `fe93b47aa6f0e61c568835b4a1a2537f9cbb0384a998c31d9ea5712bfe89fc9f` |

After-state: 27 source + Executor report + foreign Reviewer report = 29 paths;
staged files 0. Canonical report hash menggunakan placeholder self-hash nol:

`canonicalReportSha256=c63ecc2d2a58f7b4a831b7e3b158335ad3d39a909be11b3fdf044f03ae518c5a`

Full-file SHA-256 diserahkan sebagai evidence eksternal karena file tidak dapat
memuat hash dirinya sendiri secara literal tanpa mengubah hash.

## 7. Verdict dan stop condition

Seluruh enam finding terbaru (P2-D0R16 dan D0R11-D0R15) mempunyai source
closure dan behavioral proof.
Tahap berikutnya hanya independent re-review atas exact manifest dan hash report.

Verdict Executor: **`SOURCE FOLLOW-UP COMPLETE - INDEPENDENT RE-REVIEW REQUIRED`**.
