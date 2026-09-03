# Wave 10-C Independent Exact-SHA Staging Review

Tanggal: 2026-09-03

Peran: Independent Exact-SHA Staging Reviewer

Verdict: **APPROVED FOR MAIN PROMOTION PLANNING - PRODUCTION COMMISSIONING HOLD**

## Findings

Tidak ditemukan P0, P1, atau P2 yang masih terbuka pada exact staging candidate.
Seluruh known verified finding dinilai bersama dalam review ini; tidak ada
finding yang ditahan untuk laporan lanjutan.

### P1-W10C-R01 - Restore arsip valid gagal pada archive-list besar

**Status: CLOSED ON STAGING**

- SHA staging lama `b26ef10072c12dc9e966792a2c9d7779a77f2d80`
  memakai pipeline `pg_restore --list | grep -q .` di bawah `pipefail`, sehingga
  producer dapat menerima `SIGPIPE` setelah consumer berhenti dini.
- SHA baru mengonsumsi output archive list sampai producer selesai, menyimpan
  hasil pada file privat `0600`, menolak command failure dan hasil kosong, serta
  selalu membersihkan temporary file.
- Validasi selesai sebelum lock restore dan sebelum database dibuat.
- Behavioral contract pada VPS Linux lulus 16/16, termasuk producer 5.000 baris.
- Actual custom-format restore lulus dua kali dengan rekonsiliasi 68 tabel.
- Arsip rusak, command failure, output kosong, dan capacity guard ditolak secara
  fail-closed tanpa mutasi database restore.

### P3-W10C-R02 - Whitespace laporan follow-up

**Status: CLOSED**

Tiga trailing whitespace yang sebelumnya ditemukan pada metadata laporan
Executor telah dibersihkan sebelum packaging. Pemeriksaan file tracked dan
laporan staging untracked menghasilkan nol trailing whitespace.

## Version Integrity

| Item | Evidence | Result |
| --- | --- | --- |
| Source follow-up | PR `#639`, head `b16e9c4b562e7236712c9d7a457e1794b95841a5` | **PASS** |
| Develop merge | `c032fc11219afd84e265561b939383511992288e` | **PASS** |
| Staging promotion | PR `#640`, merge `04edadfe87a27d7184a16a292b33df6efe30053d` | **PASS** |
| Ancestry | feature -> develop -> staging | **PASS** |
| Develop/staging tree | `bce40b68f2bf2b884edbeca751e206d48b74dbd0` | **PASS**, identical |
| Required CI | Build, Lint & Type Check, Unit Tests | **PASS** |
| Deploy | run `33740040094`, attempt 1 | **PASS** |
| Runtime checkout | `04edadfe87a27d7184a16a292b33df6efe30053d`, clean | **PASS** |
| Main | `a490a391e5e4922c1bf2d0566aa5cef9a1aba80e` | **UNCHANGED** |
| Open PR | none | **PASS** |

Deploy log mengikat source ke tree di atas, mencatat 46 migration tanpa pending
migration, API healthy, dan staging deploy selesai. Pemeriksaan SSH read-only
independen mengonfirmasi checkout, tree, clean status, serta container runtime.

## Product Delta

Delta `b26ef100...` ke `04edadfe...` tepat tiga path yang direview:

1. `docs/audits/WAVE10-C-RESTORE-ARCHIVE-LIST-FOLLOWUP-2026-09-03.md`
2. `infrastructure/docker/tests/backup-contract.sh`
3. `scripts/restore-drill.sh`

Hash runtime source cocok dengan source review:

- `infrastructure/docker/tests/backup-contract.sh`:
  `88d2d5d50325cae319340f87453d0046a55576dd2bdbd90574e8c6156b0f4fba`
- `scripts/restore-drill.sh`:
  `61c1a3e5ce4dc02da2aa68b4594f24485ddd1227c573d7a53e01619923dded10`

Subtree aplikasi tidak berubah:

- `apps/web`: `3f12d6f656760797886d18821601dbe0e831e5b2`;
- `apps/api`: `6f865167c4f9115f9bfcca1d9cf5bea5692a0472`.

Tidak ada perubahan schema, migration, dependency, product UI/API/auth,
credential, atau production configuration dalam follow-up ini.

## Runtime Matrix

| Pemeriksaan | Result |
| --- | --- |
| Backup contract VPS Linux | **PASS**, 16/16 |
| Archive-list producer completion | **PASS**, 5.000 baris dikonsumsi penuh |
| PostgreSQL disposable | **PASS**, 46 migration |
| Restore valid pertama | **PASS**, 68 table / 0 user / 0 student |
| Restore valid kedua | **PASS**, 68 table / 0 user / 0 student |
| Corrupt archive | **PASS**, rejected before restore DB mutation |
| Archive-list command failure | **PASS**, fail-closed |
| Empty archive-list | **PASS**, fail-closed |
| Capacity below 25 percent | **PASS**, fail-closed before mutation |
| Isolated tmpfs success path | **PASS**, guard tidak dilonggarkan |
| Public staging web | **PASS**, HTTP 200 |
| Public staging API health | **PASS**, HTTP 200, status `ok`, database `up` |
| Runtime containers | **PASS**, API and PostgreSQL healthy; web running |

Semua restore memakai fixture sintetis, container berlabel `disposable-v1`,
satu network berlabel `isolated-v1`, dan database unik. Shared staging database
tidak menjadi target restore drill.

## Identity and Authority Evidence

Browser identity matrix dan negative authority proof dari staging sebelumnya
tetap berlaku karena subtree `apps/web` dan `apps/api` byte-identik. Follow-up
hanya mengubah restore script, behavioral test, dan laporan. Mengulang browser
matrix tidak menambah bukti terhadap risiko delta ini dan dapat dihindari.

Source/CI evidence tetap mengunci kontrak berikut:

- missing, inactive, dan archived application user ditolak fail-closed;
- stable role berasal dari database, bukan stale Keycloak role claim;
- demotion Super Admin lama tidak mempertahankan wildcard authority;
- self/official/last Super Admin protection dan CAS tetap diuji;
- registry dan archive/restore UI tidak berubah pada follow-up.

## Cleanup and Privacy

Pemeriksaan host read-only setelah QA menghasilkan:

- container disposable Wave 10: `0`;
- network disposable Wave 10: `0`;
- volume disposable Wave 10: `0`;
- directory temporary Wave 10: `0`;
- database bernama `diis_restore_%`: `0`;
- checkout staging dirty file: `0`.

Laporan tidak memuat plaintext credential, object name sensitif, PII, raw token,
atau identifier user. Tidak ada temporary archive list, disposable object,
database, container, network, volume, atau test configuration yang tertinggal.

## Governance

- Classic protection `develop`, `staging`, dan `main`: satu approval.
- Ruleset `Protect Staging`: aktif, satu approval, tanpa bypass actor.
- Ruleset `Protect main`: aktif, satu approval. Repository-role bypass yang
  telah diketahui tetap residual governance terpisah dan bukan perubahan Wave
  10-C.
- Tidak ada source atau runtime production yang disentuh dalam staging QA ini.

## Production Boundary

Approval ini hanya menyatakan exact-SHA staging candidate memenuhi Wave 10-C.
Ini bukan bukti bahwa Google Drive/off-site account production tersedia, bahwa
backup production database-consistent, atau bahwa recovery production telah
direhearsal.

Sebelum real-data pilot atau commissioning production tetap wajib:

1. capacity production memenuhi batas minimum dan target yang disetujui;
2. provider/origin off-site independen serta recovery owner disetujui;
3. credential dibuat melalui production environment gate tanpa masuk source,
   log, atau laporan;
4. backup, retention, monitoring, dan restore production dikomisikan melalui
   approval runtime terpisah;
5. identity reconciliation/archive menggunakan cohort dan manifest PII-safe;
6. main promotion mendapat review dan approval terpisah.

## Verdict

**APPROVED FOR MAIN PROMOTION PLANNING - PRODUCTION COMMISSIONING HOLD**

Confidence: source **99%**, staging restore/runtime **99%**, security/privacy
**99%**, identity/UI carry-forward **97%**, dan production readiness **88%**
karena kapasitas, off-site credential, commissioning, dan recovery production
belum dibuktikan.
