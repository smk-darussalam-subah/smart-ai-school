# Appointment Automation Expiry Lifecycle Follow-up - Staging QA

Tanggal: 2026-09-01

Pelaksana: Executor

Status: **EXECUTOR QA COMPLETE - REQUEST INDEPENDENT STAGING REVIEW**

## Scope dan Batas

QA ini menguji positive fixture Appointment Expiry Lifecycle hanya pada staging, sesuai
approval terikat SHA. Tidak ada perubahan source, image container, Git, Keycloak,
systemd, timer production, credential production, atau database production.

Fixture dibuat langsung melalui Prisma di dalam container staging karena status historis
`ACTIVE`, `SUSPENDED`, dan kandidat kedaluwarsa tidak dapat dibuat secara sah melalui
workflow operator saat ini. Seluruh record sintetis menggunakan namespace PII-safe,
dicatat dalam inventaris ID berizin `0600`, dan dibersihkan hanya berdasarkan inventaris
tersebut.

## Delivery Binding

- Source PR: `#627`.
- Staging promotion PR: `#628`.
- Reviewed source head: `f3d54401...`.
- Exact staging/deployed SHA: `06b254ee58c6fbeafe18b384896b2d0f0a693caf`.
- Deploy run: `33489201854`, sukses.
- `origin/develop` dan `origin/staging` memiliki tree yang identik pada gate masuk.
- Production tetap pada `c413e2d4f4506f296c7a4bf3820f4457722b7a20`.

## Preflight

Seluruh pemeriksaan fail-closed lulus sebelum fixture dibuat:

- checkout staging tepat pada exact SHA dan bersih;
- API `running/healthy`, web `running`, health publik HTTP `200`;
- database sehat dan seluruh `46` migration up to date;
- tepat satu tahun ajaran aktif, `2026/2027`, dan tanggal sekolah
  `2026-09-01` berada di dalam periodenya;
- token automation staging tersedia, diverifikasi hanya sebagai boolean;
- endpoint publik tidak terekspos (`404`) dan request internal tanpa token ditolak
  (`403`);
- tidak ada fixture namespace lama;
- tidak ada transition candidate riil yang tertunda.

Baseline Appointment tahun aktif:

| Status | Count |
|---|---:|
| `ACTIVE` | 3 |
| `ENDED` | 4 |
| Status lain | 0 |
| Total | 7 |

## Fixture Matrix

Fixture memuat sebelas identitas staff sintetis, tujuh Position sintetis, dan sepuluh
Appointment awal:

| Kasus | State awal | Ekspektasi run pertama |
|---|---|---|
| Holder kapasitas satu yang kedaluwarsa | `ACTIVE` | `ENDED` |
| Definitive kedaluwarsa dengan PLT | `SUSPENDED` | `ENDED` |
| PLT aktif terkait definitive tersebut | `ACTIVE` | `ENDED` |
| PLT draft terkait definitive tersebut | `DRAFT` | `CANCELLED` |
| Kandidat draft kedaluwarsa | `DRAFT` | `CANCELLED` |
| Kandidat menunggu persetujuan kedaluwarsa | `PENDING_APPROVAL` | `CANCELLED` |
| Kandidat disetujui kedaluwarsa | `APPROVED` | `CANCELLED` |
| Incumbent kedaluwarsa dengan successor valid | `ACTIVE` | `ENDED` |
| Successor valid yang jatuh tempo hari ini | `APPROVED` | `ACTIVE` |
| Boundary `effectiveUntil` hari ini | `ACTIVE` | tetap `ACTIVE` |

Sebelum automation, kandidat baru pada Position berkapasitas satu ditolak oleh database
dengan constraint kapasitas (`P2002`). Ini membuktikan slot memang terpakai sebelum
rekonsiliasi.

## Run Pertama

Manual one-shot dijalankan menggunakan script dan parameter staging pada runbook:

```text
endedCount=4
cancelledCount=4
activatedCount=1
affectedUserCount=9
```

Respons memenuhi exact four-safe-count contract. Rekonsiliasi database setelah commit
menunjukkan:

- empat Appointment menjadi `ENDED` dan memiliki timestamp terminal;
- empat Appointment menjadi `CANCELLED` dan memiliki timestamp terminal;
- satu successor menjadi `ACTIVE` dan memiliki timestamp aktivasi;
- Appointment dengan `effectiveUntil` sama dengan tanggal sekolah tetap `ACTIVE`;
- state setiap fixture cocok satu per satu dengan expected matrix;
- sembilan user terdampak unik, sama dengan `affectedUserCount`.

Pada deployed source, daftar user terdampak dihasilkan dalam transaksi, lalu
`PermissionsService.invalidateUser()` dipanggil setelah commit untuk setiap user. Runtime
response `affectedUserCount=9` membuktikan set invalidasi yang dihasilkan tepat; cache
process-local tidak diekspos sebagai endpoint observability dan tidak diinspeksi dengan
instrumentasi ad hoc.

### Catatan eksekusi harness

Probe kapasitas pertama berhenti sebelum automation karena Prisma membungkus exception
trigger database sebagai `P2002`, sedangkan harness awal hanya mencocokkan teks pesan.
Fixture tetap tercatat dalam inventaris dan tidak ada transition yang dijalankan. Harness
sementara kemudian diselaraskan dengan handling production (`P2002` atau pesan trigger),
syntax serta checksum container diverifikasi ulang, dan probe berhasil membuktikan slot
terblokir. Perubahan ini hanya pada harness sementara yang telah dihapus, bukan source
aplikasi atau image staging.

## Capacity Proof

Setelah holder kedaluwarsa berakhir, kandidat baru untuk Position berkapasitas satu dapat
dibuat sebagai `PENDING_APPROVAL`. Ini membuktikan active/prepared capacity dilepaskan
oleh lifecycle reconciliation dan database guard tetap berlaku.

## Run Kedua dan Idempotensi

One-shot kedua menghasilkan tepat:

```text
endedCount=0
cancelledCount=0
activatedCount=0
affectedUserCount=0
```

Snapshot `updatedAt` seluruh Appointment fixture, termasuk kandidat capacity proof,
tidak berubah. Duplicate transition terukur `0`; state tetap stabil.

## Log Hygiene

Log API sejak awal fixture diperiksa menggunakan scanner agregat teredaksi. Hasil:

- dua request automation ditemukan;
- fixture prefix: `0` hit;
- synthetic email: `0` hit;
- Bearer/token name: `0` hit;
- Keycloak identifier label: `0` hit;
- UUID pada baris endpoint: `0` hit;
- error/exception/fatal pada baris endpoint: `0` hit.

Tidak ada baris log mentah, token, payload, identifier fixture, atau PII yang disalin ke
laporan.

## Cleanup dan Post-Proof

Cleanup dilakukan dalam transaksi hanya terhadap ID pada inventaris. Hasil:

- Appointment fixture tersisa: `0`;
- user fixture tersisa: `0`;
- Position fixture tersisa: `0`;
- namespace fixture tersisa: `0`;
- aggregate Appointment kembali persis ke baseline `7`;
- status kembali `ACTIVE=3`, `ENDED=4`, status lain `0`;
- transition candidate tertunda kembali `0`;
- inventory dan harness sementara telah dihapus dari container;
- staging checkout tetap bersih pada exact SHA;
- API tetap `healthy`, web tetap `running`, database tetap up to date.

## Production Containment

- Production checkout tetap bersih pada SHA
  `c413e2d4f4506f296c7a4bf3820f4457722b7a20`.
- Timer production tetap `enabled/active` dan masih menjalankan source production lama.
- Tidak ada query atau mutasi database production.
- Business lifecycle production sign-off tetap **HOLD** sampai patch dipromosikan dan
  gate production baru diberikan.

## Executor Assessment

Positive staging fixture QA **PASS** untuk expiry, linked PLT cleanup, valid successor,
inclusive end-date boundary, capacity release, exact safe-count response, dan
idempotensi. Evidence siap untuk Independent Staging Review. Approval ini tidak
memperluas izin ke `main`, production deploy, credential, unit, atau timer.
