# Appointment Automation Production Final Report

Tanggal finalisasi: 2026-09-01

Peran: Executor

Status: **TIMER ACTIVE; INSTALLATION AND FIRST EMPTY RUN VERIFIED; BUSINESS LIFECYCLE SIGN-OFF HOLD**

## Ringkasan Eksekutif

Appointment Automation produksi telah dipasang, diaktifkan, dan menjalankan jadwal harian
pertamanya dengan sukses. Timer memanggil domain service DIIS setiap pukul
`00:15 Asia/Jakarta`. Bukti tersebut menutup instalasi, aktivasi timer, kontrak respons aman,
health, dan first empty run, tetapi belum menutup business lifecycle karena SHA production saat
ini belum merekonsiliasi seluruh Appointment kedaluwarsa secara global.

Hasil akhir:

- production berjalan pada exact SHA
  `c413e2d4f4506f296c7a4bf3820f4457722b7a20`;
- checkout production bersih;
- script, service, timer, dan runbook identik dengan source yang direview;
- credential automation tersedia dan hanya diverifikasi sebagai boolean;
- timer `enabled/active`;
- first scheduled run pada `2026-09-01 00:15:04 WIB` sukses;
- respons scheduled run memenuhi exact four-safe-count;
- tidak ada transition pada run pertama karena tidak ada Appointment yang jatuh tempo;
- aggregate database sebelum dan sesudah identik;
- API, web, dan PostgreSQL sehat;
- journal tidak memuat secret, PII, Keycloak ID, UUID internal, atau payload Appointment;
- tidak ada P0, P1, atau P2 tersisa dari instalasi Gate 1;
- follow-up scheduled verification selesai dan automation sementara sudah dihapus.

Independent final review menemukan P1 lifecycle pada source production: `ACTIVE`/`SUSPENDED`
kedaluwarsa dan seluruh kandidat `APPROVED` kedaluwarsa belum direkonsiliasi oleh run harian.
Dataset production kosong sehingga tidak ada kerusakan live, tetapi hasil `0/0/0/0` tidak dapat
dianggap sebagai positive business transition proof. Penetapan dan approval Appointment production
tetap dibekukan secara administratif sampai patch melewati source review, staging, dan promosi
production terpisah.

## Fungsi Operasional

Timer tidak membuat Appointment baru dan tidak menebak kebijakan jabatan. Timer hanya memicu
endpoint internal resmi:

```text
POST /api/v1/appointments/activate-due
```

Pada SHA production saat ini, endpoint dan domain service:

1. menggunakan tanggal sekolah `Asia/Jakarta`;
2. mengunci proses dengan advisory lock PostgreSQL;
3. membaca tahun ajaran aktif;
4. mengaktifkan Appointment `APPROVED` yang jatuh tempo dan masih valid;
5. mengembalikan hanya empat count aman;
6. menginvalidasi permission cache pengguna terdampak secara internal.

Rekonsiliasi global `ACTIVE`/`SUSPENDED`/`APPROVED` kedaluwarsa merupakan follow-up source yang
belum berada di production. Laporan ini tidak lagi mengklaim fungsi tersebut telah live.

## Kontrak Keamanan

- Token hanya berada di environment production API.
- Nilai token tidak pernah dicetak, disalin ke chat, atau ditulis ke laporan.
- Script mengambil token dari environment container API dan memanggil API dari dalam container.
- Endpoint tanpa token tetap ditolak HTTP 403.
- Respons sukses wajib memiliki tepat empat field integer non-negatif:
  - `endedCount`;
  - `cancelledCount`;
  - `activatedCount`;
  - `affectedUserCount`.
- Field tambahan atau JSON tidak valid membuat script gagal.
- Retry dibatasi oleh konfigurasi source.
- Timer tidak menggunakan n8n dan tidak mengubah Keycloak.

## Source and Git Delivery

### Source Fix

- PR `#622`: `fix(appointments): use Jakarta school date consistently`.
- Head source: `00fd78bca33a90c1473e0fa07ccbf68cdb82a3d7`.
- Merge ke `develop`: `4bdc402faf182b5d418387e72d9fe5a2e41fced5`.
- PR `#623` mempromosikan source ke `staging`.
- Staging application merge SHA: `b0fcb0d4e891a92a6dea9364d83bc75a01cc24ae`.

Perbaikan source memastikan scheduler, permission resolver, Positions, KAPROG scope, migration
classifier, dan academic-year cutover menggunakan tanggal sekolah `Asia/Jakarta`. Source juga
membatalkan successor kedaluwarsa sebelum aktivasi dan mengambil waktu setelah advisory lock.

### Evidence Promotion

- PR `#624` memuat laporan staging ke `develop` pada
  `9a330f66508b46ba7885d29b78fecb80ee0f13ac`.
- PR `#625` mempromosikan laporan ke `staging` pada
  `c2fd4a3368cd921cc7a625d9165feaa38271c601`.
- Staging docs-only deploy run `33360961804` sukses.

### Production Promotion

- PR `#626`: `chore(release): promote Wave 9 and appointment school date`.
- Promotion head: `b007c1d2c92be2f9f0ebb046c575fd85b50821a9`.
- Main merge SHA: `c413e2d4f4506f296c7a4bf3820f4457722b7a20`.
- Resulting tree identik dengan reviewed staging tree
  `b7c412bf73a9a06daea48727b8b2bfd2d71b9437`.
- Production deploy run `33361662245` sukses pada exact main SHA.
- Build, Lint & Type Check, dan Unit Tests seluruh PR lulus.

## Gate 1 - Installation and Rehearsal

Independent Reviewer memberikan verdict **APPROVED FOR GATE 2 TIMER ACTIVATION** tanpa P0/P1/P2.

### Production Preflight

- Branch: `main`.
- Checkout: exact SHA dan bersih.
- Migration selesai: `46`.
- `smk-api`: running/healthy.
- `smk-postgres`: running/healthy.
- `smk-web`: running.
- API internal, API publik, dan web publik: HTTP 200.
- Token automation: hadir dengan panjang minimum 32, diverifikasi sebagai boolean.
- Sebelum instalasi, service dan timer belum tersedia.

### Runtime Checksums

```text
script  e9d6d67b731944b94fa669c2691e24732cff2054914ffd23c4626e18aca24757
service bbf141a24a28971bbb44a410504cc10fb7c279ac0935b3b81f2ee49c2f4469bd
timer   7c01a8441f38a4e0df9729b76750378bde21ea0d53e7d7326302ec8c091328df
runbook 7b27698bc7b70b54cb6ff198b180a3ca1f398e00e35202793b9d488e5c7b9a01
```

Runtime dan source memiliki checksum yang sama.

### Installed Paths

```text
/usr/local/bin/diis-appointment-due-activation.sh
/etc/systemd/system/diis-appointment-due-activation.service
/etc/systemd/system/diis-appointment-due-activation.timer
/usr/local/share/doc/diis/appointment-due-activation-systemd.md
```

Setelah instalasi Gate 1, timer sengaja dipertahankan `disabled/inactive`.

### Failure and Retry Drill

- Drill memakai endpoint sementara yang tidak tersedia.
- Dilakukan tepat dua percobaan dengan delay nol.
- Kedua percobaan menerima HTTP 404.
- Script keluar nonzero dengan exit code `1`.
- Tidak ada perubahan unit final, credential, atau data bisnis.
- Output hanya memuat safe counts nol dan error `http_non_2xx`.

### Manual Rehearsal

Run pertama:

```json
{"ok":true,"statusCode":201,"endedCount":0,"cancelledCount":0,"activatedCount":0,"affectedUserCount":0}
```

Run kedua:

```json
{"ok":true,"statusCode":201,"endedCount":0,"cancelledCount":0,"activatedCount":0,"affectedUserCount":0}
```

Kedua run sukses, service kembali inactive, dan run kedua tidak mengulang transition.

## Gate 2 - Timer Activation

Gate 2 diotorisasi secara terpisah pada exact production SHA. Preflight SHA, clean checkout,
checksum, health, migration, token boolean, dan timer state diulang sebelum aktivasi.

Perintah aktivasi resmi:

```text
systemctl enable --now diis-appointment-due-activation.timer
```

Hasil aktivasi final:

- timer: `enabled/active`;
- service: `static/inactive` di antara run;
- schedule: `*-*-* 00:15:00 Asia/Jakarta`;
- `Persistent=true`;
- hanya satu timer DIIS Appointment terdaftar;
- tidak ada service drop-in.

## First Scheduled Run

First scheduled run terjadi pada:

```text
2026-09-01 00:15:04 WIB
```

Exact scheduled result:

```json
{"ok":true,"statusCode":201,"endedCount":0,"cancelledCount":0,"activatedCount":0,"affectedUserCount":0}
```

Runtime evidence:

- result: `success`;
- exit status: `0`;
- service kembali `inactive`;
- tepat satu result line pada jendela scheduled run;
- tidak ada failure line;
- journal sensitive-pattern match: `0`;
- next trigger: `2026-09-02 00:15:00 WIB`.

## Database Reconciliation

Aggregate sebelum Gate 1 rehearsal, setelah Gate 1, setelah aktivasi Gate 2, dan setelah first
scheduled run tetap identik:

```json
{
  "activeYearCount": 1,
  "dueApprovedCount": 0,
  "expiredApprovedCount": 0,
  "expiredActiveCount": 0,
  "activeCount": 0
}
```

Interpretasi:

- satu tahun ajaran aktif tersedia;
- tidak ada Appointment approved yang jatuh tempo;
- tidak ada Appointment approved atau active yang kedaluwarsa;
- tidak ada transition yang perlu dilakukan;
- scheduled run nol bukan kegagalan, melainkan hasil idempoten yang sesuai data produksi.

## Final Health and Privacy Evidence

Verifikasi live terakhir pada 2026-09-01:

- production SHA tetap `c413e2d4f4506f296c7a4bf3820f4457722b7a20`;
- checkout production tetap bersih;
- timer tetap `enabled/active`;
- service tetap `success`, exit `0`, dan `inactive`;
- API internal: HTTP 200;
- API publik: HTTP 200;
- web publik: HTTP 200;
- PostgreSQL: healthy;
- journal token/authorization/PII/Keycloak/UUID/payload scan: `0` match.

Tidak ada nilai token, credential, PII, Keycloak ID, UUID internal, atau payload Appointment yang
disimpan dalam evidence.

## Governance State

Verifikasi terakhir:

- classic protection `develop`: satu approval;
- classic protection `staging`: satu approval;
- classic protection `main`: satu approval;
- ruleset `staging`: satu approval;
- ruleset `main`: satu approval;
- environment production: satu required reviewer;
- `can_admins_bypass=false` pada environment production;
- tidak ada PR terbuka.

Residual P3 governance tetap dicatat: ruleset repository `main` memiliki bypass actor
`RepositoryRole`. Classic protection tetap enforce dan environment production tidak mengizinkan
admin bypass. Residual ini tidak memengaruhi hasil timer, tetapi tidak boleh digambarkan sebagai
pemisahan tugas dua-orang penuh.

## Procedural Events and Lessons

### SSH Source-IP Ban

SSH sempat timeout hanya dari source IP Executor. Lima node eksternal dapat mencapai port 22,
Hetzner Cloud Firewall tidak terpasang, dan kedua key gagal sebelum authentication. Ban source IP
kemudian dilepas melalui root console. Akses `root` dan `appuser` kembali berhasil. Tidak ada
allow-rule sementara yang tertinggal.

### Gate 2 Safety Rollback

Aktivasi pertama mencapai timer `enabled/active`, tetapi harness PowerShell-to-Bash membawa
karakter akhir baris Windows pada perintah penutup. Safety trap menonaktifkan timer. Unit, service,
health, response contract, dan data tidak gagal.

Preflight kemudian diulang dan aktivasi final dijalankan. Reviewer mengklasifikasikan kejadian ini
sebagai P3 prosedural tanpa dampak runtime/data. Untuk kejadian serupa di masa depan, proses harus
berhenti dan meminta approval baru sebelum mengulang aktivasi.

## Rollback Contract

Jika scheduled run berikutnya gagal, respons tidak exact, health turun, aggregate tidak dapat
direkonsiliasi, atau journal membocorkan data, tindakan fail-closed adalah:

```text
systemctl disable --now diis-appointment-due-activation.timer
```

Setelah itu wajib membuktikan timer `disabled/inactive` dan menghentikan perubahan lain sampai
investigasi serta approval baru tersedia.

## Evidence Index

- `APPOINTMENT-SCHOOL-DATE-FOLLOWUP-IMPLEMENTATION-2026-08-31.md`
- `APPOINTMENT-SCHOOL-DATE-FOLLOWUP-SOURCE-REVIEW-2026-08-31.md`
- `APPOINTMENT-SCHOOL-DATE-FOLLOWUP-STAGING-QA-2026-08-31.md`
- `APPOINTMENT-SCHOOL-DATE-FOLLOWUP-STAGING-REVIEW-2026-08-31.md`
- `APPOINTMENT-AUTOMATION-PRODUCTION-GATE1-EXECUTION-2026-08-31.md`
- `APPOINTMENT-AUTOMATION-PRODUCTION-GATE1-REVIEW-2026-08-31.md`
- `APPOINTMENT-AUTOMATION-PRODUCTION-GATE2-EXECUTION-2026-08-31.md`
- `APPOINTMENT-AUTOMATION-PRODUCTION-FINAL-REVIEW-2026-09-01.md`
- `APPOINTMENT-AUTOMATION-EXPIRY-LIFECYCLE-FOLLOWUP-IMPLEMENTATION-2026-09-01.md`
- Source runbook: `docs/runbooks/appointment-due-activation-systemd.md`

## Final Decision

Timer Appointment production dinyatakan **ACTIVE**, dan instalasi serta first empty scheduled run
telah terverifikasi pada exact production SHA. **Business lifecycle sign-off tetap HOLD** sampai
rekonsiliasi expiry dipromosikan dan positive transition evidence lulus. Timer boleh tetap aktif
selama pembuatan dan approval Appointment production tetap dibekukan secara administratif.

Laporan ini belum merupakan izin untuk mengubah scheduler, token, endpoint, source, atau kebijakan
Appointment. Setiap perubahan berikutnya harus kembali melalui source review, staging proof, dan
approval produksi yang sesuai.
