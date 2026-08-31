# Appointment School-Date Follow-up Staging QA

Tanggal: 2026-08-31

Peran: Delivery dan Staging QA Executor

Status: **READY FOR INDEPENDENT STAGING REVIEW; MAIN DAN PRODUCTION HOLD**

## Batas kerja

- Scope hanya merge ke `develop`, promosi ke `staging`, deploy, dan QA terarah staging.
- Tidak ada promosi `main`, deploy production, perubahan credential production, instalasi
  systemd, rehearsal production, aktivasi timer, Keycloak, n8n, atau database manual.
- Tidak ada browser QA karena delta tidak menyentuh `apps/web`, UI, Help, screenshot, PDF,
  deck, atau artifact binary.

## Git delivery

| Tahap | Bukti |
|---|---|
| Feature commit | `00fd78bca33a90c1473e0fa07ccbf68cdb82a3d7` |
| Feature PR | `#622`, tepat 15 file, merged ke `develop` |
| Develop merge | `4bdc402faf182b5d418387e72d9fe5a2e41fced5` |
| Feature CI | Run `33357394321`; Build, Lint & Type Check, Unit Tests lulus |
| Promotion head | `2bc1b621b0dcb568e28313e4fb6bf056a7b5d1ac` |
| Promotion PR | `#623`, delta tetap tepat 15 file, tanpa conflict resolution |
| Staging merge | `b0fcb0d4e891a92a6dea9364d83bc75a01cc24ae` |
| Promotion CI | Run `33358689965`; Build, Lint & Type Check, Unit Tests lulus |
| Deploy | Run `33358979134`; sukses pada exact staging merge SHA |

Relaksasi approval dilakukan sesingkat mungkin setelah CI hijau:

- `develop` classic review count `1 -> 0 -> 1` untuk merge PR `#622`;
- `staging` classic dan ruleset `Protect Staging` masing-masing `1 -> 0 -> 1` untuk merge
  PR `#623`;
- status checks, admin enforcement, non-fast-forward, deletion, dan aturan lain tidak diubah.

Closeout protection:

```text
develop classic = 1
staging classic = 1
staging ruleset = 1
main classic = 1
main ruleset = 1
open PR = 0
```

## Exact-SHA dan runtime preflight

VPS staging:

- checkout: `/opt/diis-staging/smart-ai-school`;
- branch: `staging`;
- SHA: `b0fcb0d4e891a92a6dea9364d83bc75a01cc24ae`;
- checkout bersih;
- `smk-staging-api` running dan healthy;
- `smk-staging-web` running;
- API health menyatakan database `up`;
- public staging web HTTP `200`;
- public staging API health HTTP `200`;
- Prisma menemukan 46 migration dan menyatakan schema up to date;
- token automation staging tersedia dengan panjang minimum yang sah, diverifikasi hanya sebagai
  boolean; nilainya tidak dibaca atau dicetak.

## QA endpoint dan one-shot

### Guard negatif

Request internal tanpa token:

```text
POST /api/v1/appointments/activate-due -> 403
```

### Manual one-shot staging

Script dijalankan langsung dari source staging dengan container target
`smk-staging-api`, maksimum dua attempt, dan jeda retry lima detik. Tidak ada unit atau drop-in
staging yang dibuat.

Run pertama:

```json
{"ok":true,"statusCode":201,"endedCount":0,"cancelledCount":0,"activatedCount":0,"affectedUserCount":0}
```

Run kedua:

```json
{"ok":true,"statusCode":201,"endedCount":0,"cancelledCount":0,"activatedCount":0,"affectedUserCount":0}
```

Hasil:

- exact allowlist empat count diterima;
- seluruh count integer non-negatif;
- run kedua tidak mengulang transition;
- staging pada saat QA tidak memiliki appointment due yang perlu ditransisikan;
- boundary `00:15 WIB` tidak diuji dengan mengubah clock staging. Boundary tersebut tetap
  dibuktikan oleh fake-clock source regression pada scheduler, create year, dan update year.

## Log dan scheduler containment

- Tiga log terkait endpoint/aktivasi diperiksa secara teredaksi.
- Tidak ditemukan token, Authorization/Bearer, Keycloak ID, email, nomor telepon, nama lengkap,
  staff/appointment ID, UUID internal, atau payload Appointment.
- `/etc/systemd/system/diis-appointment-due-activation.service.d` tidak ada.
- Unit timer production tetap `LoadState=not-found` dan `ActiveState=inactive`.
- Tidak ada `daemon-reload`, instalasi unit, `enable`, `start`, atau perubahan timer.

## Freeze impact

Delta dari staging sebelumnya `78fad2edffcea27ce0308ddef19200de45cd7a66` ke staging baru
tepat 15 file yang direview:

- tujuh source backend;
- enam test backend;
- dua laporan audit.

Tidak ada delta `apps/web`, Help catalog/evidence, screenshot registry, PDF, deck, adoption
package, artifact binary, schema, migration, dependency, atau infrastructure. Karena itu:

- isi 40 screenshot, 24 PDF, dan 4 deck tidak perlu diregenerasi;
- exact application SHA staging baru harus dicatat sebagai
  `b0fcb0d4e891a92a6dea9364d83bc75a01cc24ae`;
- tree `develop` dan `staging` identik pada
  `50a40483a434cbd37070045436d2a96ff60e911a`.

## Production containment

- `origin/main` tetap `76d64c6582fdf959d5868d89f36a3e36ea02beea`.
- Checkout production pada VPS tetap pada SHA yang sama.
- Environment production tetap memiliki required reviewer dan
  `can_admins_bypass=false`.
- Tidak ada production credential, container, unit, timer, database, atau runtime mutation.

## Handoff

Executor berhenti pada **Independent Staging Reviewer gate**. Main/production, Gate 1 credential
dan unit installation, manual production rehearsal, serta Gate 2 timer activation tetap HOLD dan
memerlukan approval terpisah yang terikat exact SHA.
