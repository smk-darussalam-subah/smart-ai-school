# Wave 10 Gate 0 Read-only Inventory

**Tanggal evidence:** 2026-09-03 01:52-03:05 WIB
**Mode:** read-only inventory
**Production host:** `204.168.242.123`
**Verdict:** `APPROVED FOR W10-A SOURCE WORK`

Verdict ini hanya membuka source hardening W10-A. Verdict ini bukan izin memasukkan data nyata,
membersihkan akun, memicu backup/restore, membuat snapshot, memasang credential, mengaktifkan timer,
atau melakukan mutation pada staging/production.

## 1. Evidence dan batas pemeriksaan

Evidence current-state dikumpulkan melalui:

- pembacaan source, runbook, decision log, done report, dan companion plan;
- `git fetch` serta GitHub API/CLI read-only untuk refs, PR, CI/deployment, protection, ruleset, dan
  environment gate;
- SSH read-only sebagai `appuser` ke production untuk Git checkout, container, filesystem, Docker,
  systemd, cron yang dapat dibaca, log aman, dan konfigurasi non-secret;
- query agregat read-only ke PostgreSQL, Keycloak schema, n8n schema, dan MinIO tanpa mencetak nama
  objek, identitas, atau credential;
- screenshot Hetzner Console yang telah diberikan Director pada 2026-09-03 dan dokumentasi resmi
  Hetzner. Tidak ada credential provider baru yang dibuat atau digunakan.

Tidak dilakukan: backup/restore, login, one-shot Appointment, timer trigger, archive user, perubahan
Keycloak/MinIO/n8n/systemd/Docker, atau Git packaging.

Keterbatasan evidence:

- Hetzner Cloud API tidak dapat di-refresh karena tidak ada read-only credential/CLI yang tersedia.
- Root private crontab tidak dapat dibaca oleh `appuser`; appuser crontab, readable system cron,
  systemd timers, container scheduler, dan n8n tetap diperiksa.
- Status "Super Admin resmi" memerlukan attestation Director. Laporan ini hanya membuktikan agregat
  record aktif tanpa mencetak identitas.

## 2. Git dan release operating truth

| Ref | Commit | Tree |
| --- | --- | --- |
| `origin/develop` | `3ae4f6d6660189e8691b4c522b380dd2daf1eecd` | `df194931221a3090903c721cbaa2b8cb3fad9cab` |
| `origin/staging` | `8fd7323675dc632de4834289ce4b3813c86b3998` | `df194931221a3090903c721cbaa2b8cb3fad9cab` |
| `origin/main` | `a490a391e5e4922c1bf2d0566aa5cef9a1aba80e` | `df194931221a3090903c721cbaa2b8cb3fad9cab` |

- Tidak ada PR terbuka.
- Production deployment run `33656613565` sukses pada exact `main` SHA di atas.
- Classic protection `develop`, `staging`, dan `main` masing-masing mewajibkan satu approval dan
  `enforce_admins=true`.
- Ruleset `Protect Staging` dan `Protect main` aktif tanpa bypass actor.
- Environment `production` memiliki required reviewer dan `can_admins_bypass=false`.
- Final deploy-workflow review pada companion worktree memiliki SHA-256
  `28d68619de844b61dcb6e75964190fd6ae76fb5953e73af145b7ea601907f3a8`, sesuai companion plan.

## 3. Production runtime truth

### 3.1 Checkout dan health

- Checkout production: clean, branch `main`, commit `a490a391e5e4922c1bf2d0566aa5cef9a1aba80e`,
  tree `df194931221a3090903c721cbaa2b8cb3fad9cab`.
- `smk-api` healthy; `smk-web` running; PostgreSQL healthy; MinIO, Keycloak, n8n, Redis,
  `smk-pg-backup`, dan nginx running.
- Production memiliki 46 migration dan tidak ada migration tertunda.
- Production dan staging menggunakan database berbeda, tetapi masih berbagi proses PostgreSQL host.

### 3.2 Database/schema topology

| Database | Ukuran | Isi utama |
| --- | ---: | --- |
| `smk_db` | 39.87 MiB | aplikasi DIIS + schema Keycloak + schema n8n |
| `smk_staging_db` | 20.66 MiB | aplikasi staging |

Production belum memisahkan aplikasi, Keycloak, dan n8n ke database berbeda. Pada `smk_db`, schema
Keycloak memiliki 92 tabel dan schema n8n 91 tabel. Kontrak restore harus memulihkan seluruh database,
bukan hanya schema aplikasi.

### 3.3 Filesystem dan Docker capacity

| Metrik | Nilai |
| --- | ---: |
| Root filesystem | 74.79 GiB |
| Used | 55.75 GiB |
| Available | 15.95 GiB / 21.32% |
| Minimum 25% free | 18.70 GiB |
| Defisit ke minimum | 2.75 GiB |
| Target operasional 30% free | 22.44 GiB |
| Reclaim yang dibutuhkan ke 30% | 6.49 GiB |
| Local backup budget 5% | maksimal 3.74 GiB |

Tidak ada separate data/backup mount. Block device hanya disk OS sekitar 81.9 GB beserta partisinya;
tidak ada attached Hetzner Volume yang terlihat pada host.

Docker memakai sekitar 43.42 GB images, 768 MB container writable data, 6.76 GB volumes, dan memiliki
sekitar 21.61 GB decimal build cache yang dapat direklamasi. Angka reclaimable ini adalah kandidat
cleanup terpisah, bukan izin menjalankan prune pada Gate 0.

## 4. Backup and recovery inventory

### 4.1 Scheduled authority saat ini

`smk-pg-backup -> MinIO lokal` adalah satu-satunya scheduler database yang terbukti aktif:

- image reference: `postgres:16-alpine` (mutable tag), runtime image ID tercatat pada evidence lokal;
- container cron: `0 19 * * *`;
- runtime nyata terakhir: 2026-09-02 19:00:01 WIB;
- umur backup terbaru pada pengambilan evidence: sekitar 6 jam 56 menit;
- retention: 7 hari;
- 10 success terbaru dan 0 error terbaru pada bounded log window;
- format: plain SQL gzip (`.sql.gz`), belum custom format;
- belum ada checksum sidecar atau completion manifest.

Komentar source/runbook menyebut `0 19 UTC = 02:00 WIB`, tetapi container menjalankannya pada 19:00
WIB. Jadi waktu kalender aktual berbeda tujuh jam dari kontrak dokumentasi.

Tidak ditemukan:

- scheduled host backup pada appuser crontab atau readable system cron;
- DIIS backup/off-site systemd unit/timer;
- active n8n backup monitor (`0` workflow total/active);
- `rclone`, configured remote, atau environment off-site.

Dengan demikian tidak ada duplicate scheduler yang terbukti aktif, tetapi juga tidak ada monitoring dan
tidak ada independent encrypted off-site copy.

### 4.2 MinIO dan non-regenerable data

- 3 bucket terdeteksi.
- Total 8 objek / 9,309,129 byte (8.88 MiB).
- Seluruh objek saat ini adalah database backup; dua bucket lainnya kosong pada snapshot evidence.
- Oldest/newest backup teramati 2026-08-26 dan 2026-09-02.

Non-regenerable inventory yang wajib masuk recovery contract sebelum pilot:

1. PostgreSQL volume, termasuk aplikasi, Keycloak, dan n8n;
2. MinIO application object volume, termasuk private class/media bucket ketika mulai terisi;
3. identity/session and workflow state yang berada di database.

Source bind untuk theme/config dan application images dapat diregenerasi dari exact Git/container
manifest, tetapi tetap perlu dicatat dalam full-system recovery runbook.

### 4.3 Restore evidence

- Restore proof terakhir yang ditemukan berasal dari 2026-06-13, bukan current 46-migration shape.
- Runbook MinIO lama menggunakan partial schema drop lalu full plain-SQL pipe ke database aktif.
- Runbook juga masih menyarankan ekstraksi partial restore dengan `grep` terhadap plain SQL.
- Host drill memakai nama database tetap dan belum memiliki semua guard current plan.

Tidak ada current proof bahwa backup 2026-09-02 dapat dipulihkan secara utuh ke disposable database,
divalidasi, dimigrasikan, direkonsiliasi, dan dibersihkan.

### 4.4 Hetzner Cloud Backup

Evidence Director tanggal 2026-09-03 menunjukkan tujuh daily images berstatus `Available`, rentang
2026-08-27 sampai 2026-09-02, masing-masing sekitar 30.09-31.46 GB. Aggregate displayed image size
berada pada kisaran 210.63-220.22 GB. Exact server binding, server deletion protection, dan live API
inventory belum dapat dibuktikan ulang tanpa provider credential.

Menurut [Hetzner Backup/Snapshot FAQ](https://docs.hetzner.com/cloud/servers/backups-snapshots/faq/),
backup bersifat daily, memiliki tujuh slot, terikat ke server, ikut hilang ketika server dihapus, tidak
menjamin konsistensi jika dibuat saat server berjalan, dan tidak mencakup attached Volume. Backup dapat
digunakan untuk rebuild atau membuat server baru. Backup tidak dapat diberi deletion protection;
Snapshot dapat diproteksi.

Karena host tidak memiliki attached block Volume, exclusion Volume tidak sedang menghilangkan mount
data produksi. Namun Hetzner image tetap provider-bound dan bukan pengganti encrypted application backup
pada administrative domain independen.

### 4.5 Capacity recommendation

Keputusan kapasitas Gate 0:

1. **Jangan commission backup baru sebelum free space kembali minimal 25%.** Host saat ini hanya
   21.32% free dan kekurangan 2.75 GiB untuk sekadar memenuhi minimum.
2. Target aman sebelum commissioning adalah **30% free / 22.44 GiB**, sehingga perlu reclaim minimal
   **6.49 GiB**.
3. Tetapkan local backup hard budget **3.74 GiB (5% filesystem)**, termasuk rolling points dan active
   protected pre-change point.
4. Current database backup footprint hanya 8.88 MiB dan recent dump sekitar 1.1 MiB. Guard temporary
   space tetap memakai `max(3x estimated dump, 1 GiB)` agar tidak bergantung pada ukuran pilot saat ini.
5. Build cache yang reclaimable cukup untuk target, tetapi cleanup harus menjadi operasi bounded,
   diaudit, dan di-approve terpisah; jangan menghapus volume/image runtime yang sedang dipakai.

## 5. Appointment automation inventory

- Runtime script, service, timer, dan credential configuration presence terdeteksi tanpa membuka nilai
  credential.
- Automation token terkonfigurasi.
- Timer: `disabled` dan `inactive`; service: `inactive`; tidak ada drop-in.
- Journal aman menunjukkan rehearsal/scheduled run lama dengan exact four-safe-count `0/0/0/0`.
- `sudo -n -l` masih meminta password, sehingga least-privilege operations policy belum terpasang/usable.
- Production memiliki `0` Appointment aktif/prepared pada inventory ini, jadi tidak ada current missed
  transition yang teramati. Namun unattended prerequisite tetap tidak terpenuhi.

Current truth ini supersedes laporan lama yang menyatakan timer enabled/active.

## 6. Identity and relationship inventory

### 6.1 Application users

| Stable role record | Total | Active | Inactive | Deleted |
| --- | ---: | ---: | ---: | ---: |
| GURU | 10 | 10 | 0 | 0 |
| INDUSTRI | 1 | 1 | 0 | 0 |
| KEPALA_SEKOLAH | 1 | 1 | 0 | 0 |
| ORANG_TUA | 5 | 4 | 1 | 0 |
| SISWA | 20 | 20 | 0 | 0 |
| SUPER_ADMIN | 2 | 2 | 0 | 0 |
| TATA_USAHA | 1 | 1 | 0 | 0 |

Aggregate relationship:

- application users: 40;
- students: 20; dengan parent 5; tanpa parent 15;
- teachers: 10; staff: 12;
- teaching assignments: 0;
- Appointment aktif/prepared: 0;
- active Super Admin records: 2, dan keduanya cocok dengan enabled Keycloak users.

Laporan tidak menetapkan keduanya sebagai "official" tanpa attestation Director dan tidak mencetak
nama/email/ID.

### 6.2 DB-Keycloak reconciliation

| Metrik | Nilai |
| --- | ---: |
| Keycloak DIIS realm users | 58 |
| Keycloak enabled | 47 |
| Application users | 40 |
| App users matching Keycloak ID | 2 |
| Keycloak users tanpa app row | 56 |
| App users tanpa matching Keycloak user | 38 |

Source current `UserStatusService` secara eksplisit mengizinkan token Keycloak valid ketika baris
`auth.users` tidak ditemukan. Lookup database yang gagal juga mengizinkan request. Unit test mengunci
perilaku fail-open tersebut. Karena drift production nyata sangat besar, ini bukan hanya debt teoritis.

## 7. Discrepancy ledger

| Area | Source/runbook expectation | Current runtime | Dampak |
| --- | --- | --- | --- |
| Auth status | Nonaktif/deleted ditolak | Missing app row dan lookup failure diizinkan | Valid KC user dapat melewati user-status gate tanpa lifecycle app |
| Identity | Users harus dapat direkonsiliasi | Hanya 2/40 app IDs match; 56 KC-only | Manifest cohort dan archive belum aman |
| Backup schedule | 02:00 WIB | 19:00 WIB | RPO/monitoring window salah |
| Backup format | Plan menetapkan custom format + checksum/manifest | Plain SQL gzip tanpa checksum/manifest | Integrity/restore validation lemah |
| Scheduled authority | Satu backup + delayed monitor | Backup container aktif; monitor tidak ada | Failure tidak diawasi |
| Off-site | Encrypted independent provider | Tidak ada rclone/remote/copy | VPS/Hetzner administrative-domain loss tidak tertutup |
| Restore | Disposable, unique, fail-closed full restore | Runbook lama partial schema/full SQL/grep | Risiko partial/conflicting restore |
| Capacity | Minimal 25% free | 21.32% free | Commissioning melanggar preflight policy |
| Appointment | Unattended timer | Disabled/inactive; sudo noninteractive belum usable | Lifecycle tidak berjalan unattended |
| Archive UX | Active default + explicit inactive/archived | Default filters deleted only; activate/deactivate saja | Daftar ramai dan account cleanup tidak audited |
| n8n monitor | Backup freshness/completion monitor | 0 workflow runtime | Tidak ada alert stale/missing/off-site |

## 8. Findings

### P0-ID00 - Production auth status fail-open dengan identity drift nyata

**Evidence:** `apps/api/src/auth/user-status.service.ts` mengizinkan missing app row dan DB lookup
failure; tests mengharapkan perilaku itu. Production memiliki 56 Keycloak users tanpa app row dan 38
app users tanpa matching Keycloak user.

**Impact:** valid Keycloak identity dapat melewati global authentication status layer tanpa active,
archived, atau deleted lifecycle application yang authoritative. Effective privileges masih bergantung
pada token/permission, tetapi boundary account lifecycle tidak fail-closed. Real-data pilot tidak boleh
dimulai dengan kondisi ini.

**Required fix W10-A:** fail-closed untuk protected application routes; pisahkan bootstrap/provisioning
yang benar-benar diperlukan ke explicit narrow flow; reconcile identity; invalidate permission/status
cache; disable/terminate archived sessions; add negative tests untuk missing row, lookup failure, stale
cache, forged role, self/last-SA, dan rollback Keycloak failure.

### P1-RD01 - Independent encrypted off-site application backup tidak tersedia

MinIO berada pada VPS yang sama dan Hetzner images tetap provider-bound. Tidak ada configured remote,
encrypted copy, completion proof, ataupun restore from independent off-site.

### P1-RD02 - Scheduled backup truth dan monitoring tidak konsisten

Container backup aktif pada 19:00 WIB, bukan 02:00 WIB; host scheduler tidak aktif; n8n monitor tidak
diimpor/aktif. Pilih dan dokumentasikan satu authority, kemudian monitor completion setelah grace period.

### P1-RD03 - Restore contract lama tidak fail-closed untuk full production shape

Partial schema drop, full plain-SQL pipe, fixed drill DB, dan `grep` partial restore harus dihentikan.
Restore default harus ke database disposable unik dengan checksum, archive-list validation, lock, space
guard, `exit-on-error`, cleanup trap, dan explicit production replacement procedure.

### P1-RD04 - Tidak ada current restore proof

Proof terakhir 2026-06-13. W10 harus membuktikan current 46-migration database, schema Keycloak/n8n,
row/count reconciliation, post-restore health, cleanup, dan restore dari independent off-site.

### P1-CAP01 - Host di bawah minimum free-space policy

Free space 21.32%, di bawah 25%. Reclaim minimum 2.75 GiB; rekomendasi 6.49 GiB agar mencapai 30%
sebelum commissioning.

### P1-ID01 - Identity reconciliation dan archive/restore workflow belum tersedia

Drift 56/38 harus direkonsiliasi dengan literal PII-safe manifest. UI/API hanya activate/deactivate;
belum ada audited archive/restore, default active view, archived filter, session termination, dan last-SA
guard lengkap.

### P1-AUTO01 - Appointment automation tidak unattended

Timer disabled/inactive dan policy `sudo -n` belum usable. Source/data pilot boleh dilanjutkan terpisah,
tetapi W10 production cohort tidak boleh go-live sebelum commissioning, two-run rehearsal, scheduled-run
proof, reconciliation, dan rollback contract lulus.

### P2-RD05 - Object storage belum masuk backup/restore contract

Bucket aplikasi saat ini kosong, tetapi media privat akan menjadi non-regenerable saat pilot. Pipeline
harus melakukan encrypted off-site replication dan sample-object restore dengan privacy tetap private.

### P2-RD06 - Integrity dan backup supply chain belum pinned

`pg-backup` memakai mutable image tag dan mengunduh `mc` dari mutable URL saat startup. Backup belum
memiliki checksum/completion manifest. Pin digest/checksum dan fail backup bila validation/upload/off-site
completion gagal.

### P2-HZ01 - Provider recovery detail belum live-verified

Tujuh slots terbukti lewat Director screenshot, tetapi exact server binding, server deletion protection,
dan project-wide Volume inventory belum di-refresh melalui read-only API. Lakukan pada commissioning,
tanpa menjadikan Hetzner image pengganti independent off-site.

### P3-OPS01 - Root private cron remains an evidence limitation

Tidak ada duplicate scheduler pada seluruh surface yang dapat dibaca. Root crontab private belum dapat
diinspeksi sebagai `appuser`; root-assisted read-only verification harus menjadi preflight commissioning.

## 9. Proposed literal W10-A source manifest

Manifest berikut adalah batas awal yang direkomendasikan. Executor harus melaporkan kebutuhan tambahan
sebelum menyentuh file di luar daftar; tidak boleh broad add.

### DR source

1. `infrastructure/docker/docker-compose.yml`
2. `infrastructure/docker/scripts/backup.sh`
3. `infrastructure/docker/scripts/backup-lib.sh` *(new)*
4. `infrastructure/docker/scripts/offsite-replication.sh` *(new)*
5. `infrastructure/docker/tests/backup-contract.sh` *(new)*
6. `scripts/backup-db.sh`
7. `scripts/restore-drill.sh`
8. `infrastructure/n8n/workflows/backup-daily.json`
9. `docs/runbooks/backup-restore.md`
10. `docs/runbooks/restore-database.md`
11. `docs/runbooks/offsite-backup-recovery.md` *(new)*
12. `docs/decision-log.md`

### Identity/auth source

13. `apps/api/src/auth/user-status.service.ts`
14. `apps/api/src/auth/guards/keycloak.guard.ts`
15. `apps/api/src/users/users.controller.ts`
16. `apps/api/src/users/users.service.ts`
17. `apps/api/src/users/dto/list-users.dto.ts`
18. `apps/api/src/users/dto/update-user.dto.ts`
19. `apps/api/src/keycloak-admin/keycloak-admin.service.ts`
20. `apps/api/src/__tests__/user-status.spec.ts`
21. `apps/api/src/__tests__/auth-guard.spec.ts`
22. `apps/api/src/__tests__/users.spec.ts`
23. `apps/web/src/app/dashboard/users/actions.ts`
24. `apps/web/src/app/dashboard/users/page.tsx`
25. `apps/web/src/app/dashboard/users/_components/UsersClient.tsx`
26. `apps/web/src/app/dashboard/users/_components/UserAccessDialog.tsx`
27. `apps/web/src/__tests__/users-archive.test.ts` *(new)*

### Evidence

28. `docs/audits/WAVE10-GATE0-READONLY-INVENTORY-2026-09-03.md`
29. `docs/audits/WAVE10-A-SOURCE-HARDENING-IMPLEMENTATION-2026-09-03.md` *(new)*

No Prisma schema, migration, dependency, base role, Docker service, or production configuration change
is approved by this manifest. If implementation proves one is unavoidable, stop and request a narrow
decision with blast-radius evidence.

## 10. Minimal decision requests

1. **Approve W10-A scope expansion to close P0-ID00 together with archive/restore**, not as a later wave.
   This is source work only and must preserve login for the two currently matched active SA records.
2. **Attest the official Super Admin aggregate**: confirm whether both active SA records are official.
   Do not place identity details in the report or Git.
3. **Select the independent encrypted off-site destination and recovery owner.** Credential creation and
   commissioning remain later exact-SHA production gates.
4. **Approve a separate bounded capacity-reclamation operation before backup commissioning** with target
   at least 22.44 GiB free, preserving all live volumes/images.
5. **Confirm canonical backup wall-clock target** (recommended 02:00 WIB) so source, container timezone,
   monitor grace period, and runbook use one contract.

## 11. Gate conclusion

Gate 0 has established enough current operating truth to begin W10-A source hardening. The current
production system is healthy, Git/release controls are intact, local database backup is fresh, and seven
Hetzner images are evidenced. Those positives do not close the security, identity, DR, capacity, or
Appointment operations blockers above.

Therefore:

- **W10-A source work:** approved;
- **real-data pilot, identity cleanup, backup commissioning, Hetzner restore rehearsal, Appointment
  commissioning, and production mutation:** hold pending their separate reviews and approvals;
- all verified Gate 0 P0-P3 findings are consolidated in this report; no known verified finding is being
  withheld for a later piecemeal handoff.
