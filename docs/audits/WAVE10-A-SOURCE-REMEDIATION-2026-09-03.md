# Wave 10-A Source Remediation Follow-up

Tanggal: 2026-09-03
Peran: Executor
Branch: `fix/wave10a-source-20260903`
Baseline: `origin/develop@3ae4f6d6660189e8691b4c522b380dd2daf1eecd`
Status: **SOURCE FOLLOW-UP COMPLETE - INDEPENDENT RE-REVIEW REQUIRED**

## 1. Batas Eksekusi

Follow-up ini menutup empat belas finding pada
`WAVE10-B-INDEPENDENT-SOURCE-REVIEW-2026-09-03.md` dalam branch yang sama.
Tidak ada commit, push, PR, deploy, credential, off-site commissioning, backup
activation, identity cleanup, data nyata, restore production, atau mutasi runtime
DIIS. Semua target Docker memakai prefix unik, marker disposable, network
terisolasi, image digest immutable, dan cleanup otomatis.

Git packaging, staging, backup commissioning, restore rehearsal lingkungan
operasional, identity pilot, dan production tetap **HOLD**.

## 2. Closure Seluruh Finding

| Finding                               | Closure source dan proof                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1-W10B-01 last Super Admin race      | Mutasi role/status yang dapat mengurangi Super Admin aktif memakai satu PostgreSQL advisory transaction lock. Actor, target, status, timestamp, dan count dibaca ulang sebelum CAS. PostgreSQL dua koneksi membuktikan demote/demote, deactivate/deactivate, dan demote/deactivate: tepat satu operasi berhasil dan sedikitnya satu Super Admin tetap aktif.  |
| P1-W10B-02 restore target production  | Tidak ada target default. Script menolak nama production/staging, mewajibkan container marker, data-path marker, tepat satu network terisolasi, dan mengukur filesystem PostgreSQL target sebelum `CREATE DATABASE`. Negative controls menolak `smk-postgres` dan target tanpa marker.                                                                        |
| P1-W10B-03 off-site palsu/lemah       | Effective rclone config harus crypt dengan filename `standard`, directory encryption aktif, backing allowlisted, bukan local/alias/crypt/MinIO/localhost/same-provider, dan fingerprint non-secret exact. Local, same-provider, mode `off`, `obfuscate`, directory encryption mati, config unreadable, dan fingerprint mismatch gagal tertutup.               |
| P1-W10B-04 object history tidak exact | Setiap backup memiliki manifest canonical terhash dan blob content-addressed. Pre/post inventory serta rehash seluruh source menolak perubahan selama cutover. Tiga restore point membuktikan create, update, add, dan delete dipulihkan persis.                                                                                                              |
| P1-W10B-05 protected pre-change       | Class/protection divalidasi pada retention ledger. Protected point tidak dapat dihapus sampai release marker exact, valid, dan terikat backup ID yang sama tersedia. Proof age/slot pressure mempertahankan titik protected.                                                                                                                                  |
| P1-W10B-06 budget/target capacity     | Hard budget wajib tepat `4015794422` bytes (3,74 GiB). Guard mengukur temp filesystem, actual MinIO volume mount, aggregate local backup, dan actual PostgreSQL target filesystem. Unobservable target dan boundary di atas budget ditolak.                                                                                                                   |
| P2-W10B-07 local MinIO copy-back      | Dump dan checksum sidecar diunduh kembali sebelum completion lokal. Ukuran, SHA-256, dan byte sidecar harus cocok. MinIO Docker nyata membuktikan copy-back sehat dan payload 128-byte yang ditimpa terdeteksi korup.                                                                                                                                         |
| P2-W10B-08 stale lock                 | Owner record berisi boot ID, PID, process start time, dan token. Writer hidup menolak duplicate; SIGKILL meninggalkan stale owner yang direclaim atomik tanpa membuka dua writer.                                                                                                                                                                             |
| P2-W10B-09 telemetry                  | Backup menerbitkan telemetry PII-safe: size, growth 7/30 hari, target free, projected free percent, days-to-full, off-site state, dan restore-proof age/state. n8n memvalidasi tipe/range/status tanpa coercion dan menghasilkan reason code deterministik. Workflow tetap `active=false`.                                                                    |
| P2-W10B-10 operating truth            | Runbook memisahkan `Current Verified Runtime` dari `Target Contract Setelah Commissioning`, menyatakan `NOT ACTIVE / NOT COMMISSIONED`, mencatat legacy 19:00 WIB serta 21,32% free, dan melarang klaim aktif sebelum production gate.                                                                                                                        |
| P1-W10B-R11 stale Super Admin token   | `KeycloakGuard`, `RolesGuard`, dan `PermissionsService` memakai primary role dari record aplikasi aktif, bukan claim role token. Demotion menginvalidasi cache sebelum sinkronisasi Keycloak; kegagalan sinkronisasi tetap menghasilkan authority lokal baru dan token `SUPER_ADMIN` lama ditolak. Lookup role gagal atau record hilang berhenti fail-closed. |
| P1-W10B-R12 private off-site endpoint | Commissioning wajib mengikat expected provider dan exact public origin. Backend/provider dinormalisasi; endpoint custom wajib HTTPS FQDN allowlisted dan alamat IP, loopback, RFC1918, link-local, IPv6 literal, `.local`, `.internal`, serta origin yang tidak cocok ditolak. Provider default dicatat eksplisit tanpa menebak endpoint.                     |
| P2-W10B-R13 post-write hard budget    | Preflight menyisihkan metadata terikat 65.536 byte. Setelah checksum, marker, dan telemetry ditulis, ukuran remote aktual diukur ulang. Overflow menghapus hanya recovery point baru dan memulihkan telemetry sebelumnya sebelum gagal tertutup; exact-boundary dan post-write overflow diuji.                                                                |
| P2-W10B-R14 payload digest            | Manifest dibekukan ulang menjadi 40 file, dengan 39 payload file non-self-referential. Path diurutkan ordinal byte/`LC_ALL=C`, setiap baris memakai SHA-256 lowercase, dua spasi, path POSIX, dan LF. PowerShell serta WSL wajib menghasilkan digest akhir yang identik.                                                                                      |

## 3. Identity Lifecycle

- Global auth tetap fail-closed untuk token Keycloak tanpa pasangan aplikasi,
  user inactive/archived, serta lookup database gagal.
- Missing/error user status tidak dicache; archive/restore menginvalidasi status
  dan permission cache.
- Registry default hanya menampilkan user aktif; filter inactive dan archived
  eksplisit.
- Archive menolak self dan seluruh target Super Admin, memakai stale token/CAS,
  menonaktifkan database terlebih dahulu, lalu disable/logout Keycloak.
- Restore mengaktifkan Keycloak lebih dulu, kemudian membuka database dengan CAS;
  stale CAS mencoba kompensasi disable kembali.
- Pengurangan Super Admin diserialisasi lintas row oleh transaction lock global,
  sehingga dua target berbeda tidak dapat melewati count secara bersamaan.
- Primary role untuk setiap request terlindungi direkonsiliasi dari database.
  Claim `SUPER_ADMIN` lama tidak lagi memberi wildcard atau lolos `RolesGuard`;
  kegagalan lookup role menolak akses tanpa memakai claim token sebagai fallback.

Tidak ada purge/hard delete, perubahan schema, migration, base role, atau realm
Keycloak.

## 4. Backup, Restore, dan Monitoring

### Database dan local MinIO

- PostgreSQL custom dump, archive list, SHA-256, ukuran, dan safe counts.
- Exact budget Gate 0 serta projected capacity pada storage tujuan.
- Local MinIO upload diikuti bounded copy-back dump dan sidecar sebelum completion.
- Completion manifest adalah validity boundary; marker lokal bukan backup valid.
- Hard budget lokal menyertakan reserve metadata terikat dan diukur ulang dari
  remote aktual setelah telemetry. Overflow membersihkan hanya point baru yang
  belum sah dan tidak mengorbankan recovery point lama.

### Off-site dan object history

- Provider harus independen dan encrypted berdasarkan effective config yang
  diikat fingerprint non-secret, expected provider, dan exact public origin
  hasil commissioning.
- Endpoint private/internal, literal IP, HTTP, serta origin custom yang tidak
  disetujui ditolak sebelum transfer.
- Database dan sidecar immutable serta diverifikasi melalui full copy-back.
- Object disimpan sebagai immutable content-addressed blobs; manifest backup
  menentukan set exact dan mengikat path, size, serta hash.
- `rclone sync` tidak digunakan.
- Protected pre-change memerlukan release marker tervalidasi; shared blob tidak
  dihapus oleh retention biasa.

### Restore

- Rehearsal hanya pada target disposable bertanda dan network terisolasi.
- Actual PostgreSQL integration menerapkan 46 migration, membuat custom dump,
  memulihkan ke database unik, merekonsiliasi 69 table/0 user/0 student, lalu
  membersihkan database/container/network.
- Exact object restore menolak target tanpa marker, object tambahan, hash/size
  mismatch, dan manifest yang tidak cocok.
- Proof restore PII-safe diterbitkan terpisah hanya setelah independent review.

### Monitor

- Telemetry input memiliki schema dan integer/range validation strict.
- Reason codes: `COMPLETION_STALE_OR_MISSING`, `TELEMETRY_INVALID`,
  `CAPACITY_LOW`, `DAYS_TO_FULL_LOW`, `OFFSITE_INCOMPLETE`, dan
  `RESTORE_PROOF_MISSING_OR_STALE`.
- Kanal notifikasi kosong dilaporkan `disabled`, bukan sukses.
- n8n tetap inactive sampai credential read-only dan exact-SHA commissioning.

## 5. Bukti Verifikasi

| Pemeriksaan                   | Hasil                                                           |
| ----------------------------- | --------------------------------------------------------------- |
| Focused API auth/status/users | 6 suite / 147 test lulus                                        |
| Focused Web archive           | 1 suite / 5 test lulus                                          |
| PostgreSQL disposable         | 46/46 migration, concurrency 3/3, restore dan cleanup lulus     |
| MinIO Docker nyata            | copy-back lulus, corruption terdeteksi, target capacity terbaca |
| Backup behavioral WSL         | 16/16 lulus                                                     |
| Backup behavioral Git Bash    | 16/16 lulus                                                     |
| Full API                      | 72 suite lulus, 2 skipped; 1.376 test lulus, 10 skipped         |
| Full Web                      | 53 suite / 377 test lulus                                       |
| Workspace type-check          | 9/9 lulus                                                       |
| Workspace lint                | 3/3 lulus; warning migrasi Next lint baseline                   |
| Workspace build               | 6/6 lulus; Next.js 49/49 halaman                                |
| Prisma generate/validate      | lulus                                                           |
| Shell syntax                  | 11 script lulus                                                 |
| Docker Compose render         | lulus dengan env contoh; satu warning namespace Redis kosong    |
| n8n JSON dan behavior         | parse lulus; healthy/error matrix lulus                         |
| Docker cleanup                | 0 container, network, volume, dan database fixture tersisa      |
| Diff/cached checks            | lulus; staged files 0                                           |

Docker Desktop Linux engine `29.4.3` digunakan. PostgreSQL, MinIO server, dan
MinIO client terikat repository digest. Tidak ada port DIIS, shared volume, atau
container proyek yang digunakan.

Saat completion sweep, probe PostgreSQL pertama menangkap fase startup sementara
sebelum entrypoint melakukan restart final. Harness diperketat menjadi tiga
sampel readiness berurutan dan verifikasi container masih running. Rerun aktual
kemudian lulus penuh; kegagalan awal dan final sama-sama membersihkan target.

## 6. Manifest Literal Executor

Manifest berjumlah **40 file**:

1. `apps/api/src/__tests__/auth-guard.spec.ts`
2. `apps/api/src/__tests__/auth-me.spec.ts`
3. `apps/api/src/__tests__/permissions.spec.ts`
4. `apps/api/src/__tests__/roles.spec.ts`
5. `apps/api/src/__tests__/user-status.spec.ts`
6. `apps/api/src/__tests__/users-last-super-admin-postgres.spec.ts`
7. `apps/api/src/__tests__/users.spec.ts`
8. `apps/api/src/auth/guards/keycloak.guard.ts`
9. `apps/api/src/auth/guards/roles.guard.ts`
10. `apps/api/src/auth/user-status.service.ts`
11. `apps/api/src/keycloak-admin/keycloak-admin.service.ts`
12. `apps/api/src/permissions/permissions.service.ts`
13. `apps/api/src/users/dto/list-users.dto.ts`
14. `apps/api/src/users/dto/update-user.dto.ts`
15. `apps/api/src/users/users.controller.ts`
16. `apps/api/src/users/users.service.ts`
17. `apps/web/src/__tests__/users-archive.test.ts`
18. `apps/web/src/app/dashboard/users/_components/UsersClient.tsx`
19. `apps/web/src/app/dashboard/users/actions.ts`
20. `apps/web/src/app/dashboard/users/page.tsx`
21. `docs/audits/WAVE10-A-SOURCE-REMEDIATION-2026-09-03.md`
22. `docs/audits/WAVE10-GATE0-READONLY-INVENTORY-2026-09-03.md`
23. `docs/decision-log.md`
24. `docs/runbooks/backup-restore.md`
25. `docs/runbooks/migration-enum-safety.md`
26. `docs/runbooks/offsite-backup-recovery.md`
27. `docs/runbooks/restore-database.md`
28. `infrastructure/docker/docker-compose.yml`
29. `infrastructure/docker/scripts/backup-lib.sh`
30. `infrastructure/docker/scripts/backup.sh`
31. `infrastructure/docker/scripts/offsite-replication.sh`
32. `infrastructure/docker/scripts/release-prechange-backup.sh`
33. `infrastructure/docker/scripts/restore-objects.sh`
34. `infrastructure/docker/tests/backup-contract.sh`
35. `infrastructure/docker/tests/wave10-minio-integration.sh`
36. `infrastructure/docker/tests/wave10-postgres-integration.sh`
37. `infrastructure/n8n/workflows/backup-daily.json`
38. `scripts/backup-db.sh`
39. `scripts/publish-restore-proof.sh`
40. `scripts/restore-drill.sh`

Laporan Independent Reviewer tidak termasuk manifest Executor dan tidak diubah.
`git add .` serta `git add -A` tetap dilarang.

Canonical digest untuk 39 payload file di atas, dengan laporan ini dikecualikan
agar tidak self-referential, dihitung dengan kontrak berikut:

1. Ambil path literal dari manifest, kecuali laporan Executor ini.
2. Normalisasi separator path menjadi `/` dan urutkan secara ordinal byte
   (`LC_ALL=C` / `[StringComparer]::Ordinal`).
3. Hitung SHA-256 byte file aktual dalam lowercase.
4. Bentuk tepat `<sha256><dua spasi><path-posix><LF>` untuk setiap file.
5. Hitung SHA-256 atas gabungan byte UTF-8 tanpa BOM tersebut.

Command canonical POSIX memakai daftar path literal yang sudah diekstrak dan
laporan Executor yang sudah dikecualikan:

```sh
LC_ALL=C sort payload-paths.txt |
  while IFS= read -r path; do sha256sum -- "$path"; done |
  sha256sum
```

Implementasi PowerShell wajib mengurutkan dengan
`[StringComparer]::Ordinal`, membentuk setiap row dengan `"`n"`, lalu melakukan
SHA-256 atas `[Text.UTF8Encoding]::new($false).GetBytes($rows)`.

Digest WSL dan PowerShell setelah final completion sweep:

`c354adb0f6fe652f6e316cd80a326ef0ff1cf923ffd0e240974c45fa92e30e91`

## 7. Residual dan Gate Berikutnya

- Off-site account/provider/credential belum tersedia dan tidak dibuat.
- Backup, n8n monitor, retention apply, dan restore proof belum commissioned.
- Disk production 21,32% free masih di bawah minimum 25%; reclaim terukur 6,49
  GiB menuju 30% tetap prasyarat.
- Drift 56 Keycloak-only dan 38 app-only belum dimutasi. Identity pilot harus
  memakai cohort PII-safe, approval, dan review terpisah.
- Temuan dependency audit baseline tidak diubah karena tidak ada dependency atau
  lockfile delta.
- `shellcheck` dan `actionlint` tidak tersedia sehingga tidak diklaim.
- Appointment timer production tetap disabled/inactive sesuai Gate 0 dan di luar
  scope ini.

Gate berikutnya adalah **Independent Source Re-review**. Status keseluruhan tetap:

**SOURCE FOLLOW-UP COMPLETE - PACKAGING/STAGING/COMMISSIONING/PRODUCTION HOLD**
