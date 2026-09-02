# Appointment Automation Sudoers Operations Remediation

Tanggal: 2026-09-02

Status: **SOURCE COMPLETE - PRODUCTION OPERATIONS HOLD**

## Ringkasan

Follow-up ini menutup dua P1 operasional dari production follow-up Appointment Expiry Lifecycle:

1. `appuser` sebelumnya tidak memiliki jalur noninteraktif untuk menjalankan tiga operasi systemd
   yang disetujui;
2. helper container host-namespace yang pernah dipakai untuk emergency containment terlalu luas
   untuk menjadi prosedur normal.

Re-review berikutnya menambahkan tiga closure yang ditangani dalam patch yang sama:

1. bootstrap dipin ke expected commit, tree, manifest digest, dan snapshot root-owned;
2. `Persistent=true` diperlakukan sebagai kemungkinan immediate catch-up yang wajib direkonsiliasi;
3. akses Docker `appuser` dinyatakan jujur sebagai residual host-root-equivalent.

Adversarial re-review kedua menambahkan dua closure:

1. bootstrap menjadi transaksi seluruh target yang memulihkan baseline pada command failure;
2. observasi `Persistent=true` memakai job-aware quiet window agar delayed catch-up tidak salah
   diklasifikasikan sebagai tidak ada run.

Final re-review memperkeras dua boundary terakhir:

1. transactional rollback dipindahkan ke canonical shell library dan dipasang pada `EXIT` serta
   `HUP/INT/TERM`, sehingga explicit exit dan interupsi tidak dapat meninggalkan mixed version;
2. kegagalan `systemctl list-jobs` dibedakan dari queue kosong dan selalu fail-closed.

Remediasi hanya mengubah source, test, runbook, dan laporan. Tidak ada akses atau mutasi production,
instalasi policy, root/helper execution, rehearsal, aktivasi timer, deploy, commit, push, PR, perubahan
API, schema, credential, Keycloak, unit systemd, maupun jadwal.

## Baseline dan Branch

- Branch: `fix/appointment-automation-sudoers-20260902`.
- Base: `origin/develop@d3f8e33d6058999269c04c73f3c07e7f61a97932`.
- Worktree dibuat bersih langsung dari `origin/develop`.
- Entry evidence menyatakan production timer `disabled/inactive`; kondisi live tidak diperiksa ulang
  karena gate ini secara eksplisit source-only.

## Implementasi

### Policy versioned exact-command

`infrastructure/systemd/diis-appointment-automation.sudoers` memberi `appuser` tepat tiga command
sebagai root tanpa password:

```text
/usr/bin/systemctl start diis-appointment-due-activation.service
/usr/bin/systemctl enable --now diis-appointment-due-activation.timer
/usr/bin/systemctl disable --now diis-appointment-due-activation.timer
```

Policy tidak mengizinkan wildcard, arbitrary unit, shell, editor, restart, stop, reload,
`daemon-reload`, atau `NOPASSWD: ALL`. Absolute path `/usr/bin/systemctl` mengikuti kontrak target
yang direview dan divalidasi pada Linux lokal.

SHA-256 policy source: `ba89710da5dd96fe25e376b3820fa2f30ee232c948c0cc09a968e9b4019ca4c8`.

### Digest-pinned bootstrap dan operasi

Runbook kini memisahkan dua lapisan:

- bootstrap root terkontrol satu kali untuk validasi dan pemasangan file root-owned;
- operasi rutin `appuser` yang selalu menggunakan `/usr/bin/sudo -n` dengan salah satu dari tiga
  command exact.

Manifest `infrastructure/systemd/diis-appointment-automation.sha256` mengikat enam artifact
root-owned: policy, activation script, canonical operations library, service, timer, dan runbook.
SHA-256 manifest saat source
gate ini: `12ba336e8bdaf8688ddd1e17993988b01d88c13c06578e75f79d5893b9935a5b`.

Bootstrap wajib menerima `EXPECTED_SOURCE_SHA`, `EXPECTED_SOURCE_TREE`, dan
`EXPECTED_MANIFEST_SHA256` dari approval produksi tanpa default. Bootstrap:

- memverifikasi exact Git commit/tree dan checkout bersih;
- memverifikasi manifest terhadap digest approval;
- menyalin enam artifact ke snapshot temporary root-owned bermode ketat;
- memverifikasi seluruh checksum, `visudo`, `bash -n`, dan `systemd-analyze` pada snapshot;
- menyimpan baseline root-owned untuk policy, script, runbook runtime, service, dan timer, termasuk
  marker target yang sebelumnya tidak ada;
- men-stage dan memvalidasi keenam target sementara pada filesystem target sebelum commit;
- memasang target hanya dari snapshot, bukan membaca ulang checkout `appuser`;
- memvalidasi source dan target dengan `/usr/sbin/visudo -cf`;
- memasang policy melalui target sementara, lalu memvalidasi keseluruhan `/etc/sudoers`;
- melakukan rollback seluruh enam target melalui canonical library bila staging, commit,
  verification, `daemon-reload`, state check, explicit exit, atau `HUP/INT/TERM` terjadi;
- memulihkan bytes dan metadata baseline atau menghapus target yang sebelumnya tidak ada, menjalankan
  `daemon-reload`, lalu membuktikan timer tetap `disabled/inactive`;
- membuktikan byte equality, SHA-256, owner `root`, group `root`, dan mode `0440`;
- memastikan timer tetap `disabled/inactive`;
- tidak memberikan hak install, edit, remove, atau `daemon-reload` kepada `appuser`.

Runbook juga melarang helper container host-namespace, `nsenter`, dan Docker socket sebagai jalur
normal. Jika console root resmi tidak tersedia, operator wajib berhenti, bukan memperluas sudoers.

### Persistent catch-up reconciliation

Runbook tidak lagi menganggap `enable --now` hanya menjadwalkan run berikutnya. Sebelum aktivasi,
operator wajib merekam school date, timer state, last/next trigger, service start timestamp, journal
cursor, aggregate database read-only, dan hash baseline PII-safe.

Setelah aktivasi, canonical operations library menunggu secara bounded sampai lima sampel berurutan
membuktikan tidak ada
job timer/service, service `inactive`, serta `LastTriggerUSec` dan service start timestamp stabil.
Journal dan timestamp final baru diambil setelah quiet window itu, lalu diperiksa sekali lagi agar
start terlambat tidak lolos di antara observasi dan capture. Perubahan trigger atau service start
membentuk cabang immediate catch-up yang wajib memiliki tepat satu exact four-safe-count result,
rekonsiliasi database, health, journal hygiene, dan service kembali inactive. Bila tidak ada
catch-up, last trigger wajib tetap sama serta next trigger harus berada di masa depan pada `00:15`
Asia/Jakarta. State gagal, timeout, atau ambigu menjalankan exact fail-closed disable dan melarang
retry tanpa investigasi, re-review, serta approval baru.

### Residual governance Docker

Policy exact-command hanya membatasi jalur `sudo`. `appuser` tetap host-root-equivalent selama menjadi
anggota group Docker. Larangan helper host-namespace adalah audited governance control, bukan sandbox
teknis; pelanggaran dicatat sebagai security incident. Pengurangan privilege Docker dicatat sebagai
hardening terpisah karena deploy dan activation script saat ini masih bergantung pada Docker. Patch
ini tidak mengklaim full host least privilege atau separation of duties.

### Runtime preflight dan negative controls

Runbook menggunakan `sudo -n -l` untuk membuktikan tiga command exact tanpa mengeksekusinya.
Negative control wajib membuktikan bahwa command berikut ditolak:

- restart service Appointment;
- `systemctl daemon-reload`;
- start arbitrary `ssh.service`;
- editor terhadap `/etc/sudoers`;
- shell command.

Setiap kegagalan negative control menghentikan proses. Aktivasi timer tetap merupakan gate produksi
terpisah setelah source review, Gitflow, pemasangan policy, dan manual rehearsal.

## Contract Test

`apps/api/src/__tests__/appointment-systemd-sudoers.spec.ts` memvalidasi:

- byte contract policy yang exact;
- tepat tiga command dan satu grant `NOPASSWD`;
- tidak ada wildcard, broad sudo, shell, editor, restart, reload, stop, atau arbitrary path;
- konsistensi absolute path `/usr/bin/systemctl`;
- runbook memakai `sudo -n` untuk seluruh command operator;
- larangan helper host-namespace dan presence preflight/rollback controls;
- enam digest artifact cocok dengan manifest versioned;
- bootstrap memakai expected commit/tree/manifest dan root-owned snapshot;
- `Persistent=true` mempunyai cabang catch-up, bounded settle, reconciliation, dan fail-closed;
- bootstrap rollback canonical dan delayed catch-up diverifikasi oleh executable Linux contract;
- residual Docker dinyatakan sebagai host-root-equivalent;
- syntax policy dengan `visudo -cf` ketika test berjalan di Linux.

Selain test Jest, keenam artifact disalin ke scratch Linux terpisah. Manifest lulus `6/6`, policy
lulus `visudo`, script lulus `bash -n`, unit lulus `systemd-analyze verify`, dan mode snapshot
`0400/0500` cocok. Behavioral Linux harness mengeksekusi canonical library dan menyuntikkan command
failure setelah masing-masing dari enam tahap commit pada baseline lengkap dan baseline dengan target
absent, lalu menambahkan explicit exit dan signal (`14/14`). Seluruh target kembali identik dan
`daemon-reload` terpanggil. Harness yang sama membuktikan delayed catch-up setelah sampel `inactive`
awal tetap diklasifikasikan sebagai catch-up, kegagalan `list-jobs` fail-closed, dan sequence tidak
stabil fail-closed. Seluruh scratch kemudian dihapus.

## Verification

| Gate | Hasil |
|---|---|
| Focused sudoers contract | 1 suite / 9 test pass |
| Full API | 71 suite / 1.349 test pass; 1 suite dan 7 test baseline skipped |
| Workspace type-check | pass |
| Workspace lint | pass; tidak ada warning/error lint source |
| Workspace build | 6 task pass; web 49/49 halaman |
| Prisma generate | pass |
| Linux digest manifest | 6/6 artifact OK |
| Linux `visudo -cf`, `bash -n`, `systemd-analyze` | pass |
| Runbook shell syntax | 16/16 fenced Bash blocks pass |
| Disposable snapshot mode | metadata/policy/unit/runbook `400`; activation/operations script `500` |
| Linux canonical rollback injection | 14/14 command/exit/signal cases restored |
| Linux canonical catch-up observation | delayed race caught; `list-jobs` error and unstable sequence fail-closed |
| `git diff --check` | pass |
| Secret pattern scan | pass |

`npm ci` melaporkan audit baseline dependency yang sudah ada. Tidak ada dependency atau lockfile yang
diubah pada follow-up ini.

## Completion Sweep

- Tidak ada perubahan pada script activation, service unit, timer unit, API, Prisma, credential,
  Keycloak, n8n, atau jadwal `00:15 Asia/Jakarta`.
- Tidak ada command production, SSH, root, Docker helper, systemctl mutation, atau database mutation.
- Tidak ada token, secret, PII, Keycloak ID, atau Appointment identifier di manifest/laporan.
- Dependency lokal dipasang dari lockfile untuk verifikasi; tidak ada file dependency tracked.
- Scratch Linux untuk manifest, `visudo`, rollback injection, delayed race, script, dan unit
  verification telah dibersihkan.
- Tidak ada staged file, commit, push, PR, atau deploy.

## Literal Manifest

1. `apps/api/src/__tests__/appointment-systemd-sudoers.spec.ts`
2. `docs/audits/APPOINTMENT-AUTOMATION-SUDOERS-OPERATIONS-REMEDIATION-2026-09-02.md`
3. `docs/runbooks/appointment-due-activation-systemd.md`
4. `infrastructure/systemd/diis-appointment-automation.sha256`
5. `infrastructure/systemd/diis-appointment-automation.sudoers`
6. `infrastructure/systemd/diis-appointment-operations.sh`
7. `infrastructure/systemd/tests/appointment-automation-operations-contract.sh`

Laporan Independent Reviewer tetap reviewer-owned dan tidak termasuk manifest Executor.

## Residual Gate

Source remediation selesai, tetapi automation belum boleh dinyatakan aktif. Langkah berikutnya
adalah Independent Source Review. Setelah source approval dan Gitflow terpisah, controlled
production operations gate baru harus membuktikan install policy byte-identik, owner/mode/checksum,
`visudo`, allowed/denied command, manual rehearsal dua kali, exact four-safe-count, health, journal,
rekonsiliasi database, immediate catch-up branch, dan baru kemudian meminta izin aktivasi timer.

Residual non-blocking yang tetap jujur: group Docker membuat `appuser` host-root-equivalent. Risiko
ini memerlukan hardening arsitektur operasional terpisah, bukan perluasan scope patch sudoers.

Status akhir tetap: **SOURCE COMPLETE - PRODUCTION OPERATIONS HOLD**.
