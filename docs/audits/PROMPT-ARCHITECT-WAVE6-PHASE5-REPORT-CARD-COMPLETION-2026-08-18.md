# Prompt Architect - Wave 6 Phase 5 Report Card Completion

Tanggal: 2026-08-18
Status: final, source-validated Executor prompt
Target production baseline: `origin/main@ff20b235dd1d5ee5d5e8e4a7220944c10cdbef7d`
Wave: **Wave 6 - Phase 5 Pipeline Rapor**

## Verdict Scope Revalidation

Wave 6 tetap diperlukan, tetapi scope lama tidak boleh dieksekusi ulang secara utuh.
Academic Operational yang sudah masuk production telah menutup sebagian besar backlog Rapor.

| Kontrak Wave 0 | Status pada production baseline | Keputusan Wave 6 |
|---|---|---|
| W6-01 wali generate/catatan pada kelas wali | Closed: ownership, transaction, CAS, UI dan staging QA tersedia | Regression-only |
| W6-02 Waka check/return, KS publish, TU distribute, SA assistance terbatas | Closed: UI/controller/service/audit/test konsisten | Regression-only |
| W6-03 snapshot attendance per semester | Closed dan telah diuji | Regression-only |
| W6-04 family membaca immutable distributed ReportCard | **Partially open**: route kanonik benar, tetapi workspace ORANG_TUA masih membuka modal dari live Grade dan workspace SISWA masih memakai CTA placeholder | Fix |
| W6-05 WA + push/in-app saat distribusi | **Open**: listener hanya WA; tidak ada actual Web Push dispatch atau service-worker push handler; history belum diwiring dan masih mencari log berdasarkan phone/email | Fix |
| W6-06 return stamps, mass generation, section snapshot, error UX | Closed secara substantif | Regression-only |

## Temuan Tambahan Terverifikasi

### P0 - Filter `classId` dapat menimpa scope GURU

`ReportCardsService.findAll()` menyebarkan ownership `{ classId: { in: allowedIds } }`,
lalu menggantinya dengan `query.classId`. Direct API GURU dapat meminta kelas di luar
assignment/wali dan membaca pipeline Rapor kelas tersebut. KAPROG sudah memiliki assertion,
tetapi GURU belum.

### P0 - Workspace keluarga masih memiliki Rapor semu berbasis nilai hidup

- `OrtuWorkspace` membuka `_components/ortu/RaporModal.tsx` memakai `childGrades`, default
  KKTP 75, dan CTA PDF placeholder; tidak membaca distributed `ReportCard`.
- `NilaiSiswa.tsx` hanya menampilkan toast bahwa Rapor tersedia akhir semester, bukan
  membuka source resmi.
- Route `/dashboard/rapor` dan official sections sudah distributed-only; masalahnya adalah
  permukaan keluarga lain masih membuat kontrak tandingan.

### P1 - KKTP bukan bagian immutable dari snapshot

`SubjectSnapshot` hanya menyimpan nilai dan komponen. Official sections kemudian memakai
literal `75` untuk KKTP/predikat. Ini dapat menghasilkan dokumen historis salah bila
`KktpConfig` adalah 72/80 dan bertentangan dengan resolver authoritative Wave 5.

### P1 - Distribusi belum memakai durable intent

Status `distributed` di-commit dahulu, lalu event in-process mencoba membuat WA log.
Crash atau listener failure setelah commit dapat kehilangan notifikasi permanen. Jalur ini
belum memakai pola transaction + pending `NotificationLog` + deterministic BullMQ handoff
yang sudah dibakukan Wave 5.

### P1 - PWA Push baru merupakan subscription shell

`PushSubscription` dan enum channel `push` sudah ada, tetapi queue job/worker hanya menerima
WhatsApp/email, tidak ada Web Push provider, `sw.js` tidak menangani event `push`, dan UI
tidak memasok `onFetchNotifications`. `findMyNotifications()` mencari recipient berdasarkan
phone/email, bukan user identity, sehingga tidak cocok sebagai in-app ownership contract.

### P1 - Generate tidak terikat tepat satu periode aktif

UI membolehkan tahun/semester diedit. Service hanya mencocokkan tahun dengan kelas dan
menerima semester 1/2 tanpa membuktikan tepat satu semester aktif milik tahun ajaran aktif.
Ini dapat membuat draft untuk periode lama/mendatang akibat input atau data konfigurasi stale.

## Scope Final

1. Fail-closed report list/filter ownership.
2. Satu source resmi Rapor untuk SISWA/ORANG_TUA di seluruh entry point.
3. Immutable per-subject KKTP value + provenance dalam JSON snapshot tanpa schema change.
4. Transactional durable distribution intent, immediate queue handoff, in-app history, dan
   actual Web Push.
5. Generate hanya untuk authoritative active academic period.
6. Focused/full automated proof, PostgreSQL concurrency/outbox proof, local browser proof,
   report, dan independent Reviewer gate.

## Non-Goals

- Jangan mengulang actor matrix, recovery, CAS notes, private media, Appointment, Wave 4,
  atau Wave 5 yang sudah production.
- Jangan membuat PDF engine. Hapus/ubah CTA PDF palsu menjadi akses modul Rapor resmi;
  PDF dapat menjadi product scope terpisah bila benar-benar diputuskan.
- Jangan mengimplementasikan semester close, final audit/export, archive terminal, atau
  period cutover. Itu tetap **Wave 7 - Phase 6**.
- Jangan membuat notification center baru, queue kedua, scheduler kedua, base role baru,
  atau mengembalikan jabatan ke Keycloak.
- Jangan mengubah schema Prisma. Existing `NotificationLog.recipient` dapat menyimpan UUID
  user untuk channel push; existing enum `push`, ref index, dan partial unique index direuse.
- Jangan mengubah production/staging, secret, VAPID key, Docker, atau infrastructure pada
  source execution.

## Approval Tunggal

Schema migration tidak diperlukan. Satu dependency yang layak diperlukan karena Web Push
tidak boleh diimplementasikan dengan crypto/protocol buatan sendiri. Executor meminta satu
approval bersamaan dengan baseline synchronization:

> Setujui dua precondition Wave 6: (1) sinkronkan `main@ff20b235dd1d5ee5d5e8e4a7220944c10cdbef7d`
> ke `develop` melalui branch/PR terpisah dengan CI dan approval normal, tanpa relaxation
> protection kecuali diotorisasi lagi secara eksplisit; (2) tambahkan dependency runtime
> `web-push` dan devDependency `@types/web-push` pada workspace API untuk actual
> standards-based PWA
> Push. Tidak ada perubahan Prisma schema/migration, base role, queue baru, atau dependency
> lain. VAPID secret tidak dibuat, dibaca, atau dicetak pada source run.

Executor harus meminta kedua keputusan sekali, bukan bertahap. Sambil menunggu, executor
boleh menyelesaikan inventory, plan, test design, dan perubahan independen yang tidak
mengubah dependency/Git remote; setelah approval, seluruh Wave 6 diselesaikan dalam batch
yang sama.

## Draft Prompt Awal

Perbaiki pipeline Rapor, notifikasi push, KKTP, dan UI keluarga. Tambah tests dan report.

## Kritik Draft

Draft ditolak karena akan mengulang pekerjaan Academic Operational, tidak mengenali
`develop` yang tertinggal dari `main`, tidak menutup query override GURU, dapat mengubah
snapshot historis, mencampur in-app dengan nomor telepon, dan dapat mengklaim push hanya
dari subscription shell. Draft juga tidak mengunci transaction/outbox, active-period
authority, PostgreSQL concurrency, family negative tests, dependency approval, atau stop
gate sebelum Git packaging.

## Prompt Final Untuk Executor

Salin seluruh blok berikut ke sesi Executor baru.

````md
Anda adalah Senior Full-Stack Executor untuk DIIS `smart-ai-school`.

### Misi

Selesaikan **Wave 6 - Phase 5 Report Card Completion** pada satu branch setelah baseline
tersinkron: tutup report ownership bypass, satukan family Rapor ke immutable distributed
snapshot, simpan KKTP authoritative dalam snapshot, buat distribusi durable, hidupkan
actual in-app/Web Push, ikat generate ke periode aktif, dan buktikan semuanya end-to-end.

Berhenti pada independent Reviewer gate. Jangan commit/push/PR untuk perubahan produk,
merge, deploy, atau mengakses production secara mutatif sebelum Reviewer menyetujui
explicit Git packaging.

### Gate 0 - Wajib baca dan inventory

Baca lengkap:

1. `C:\Users\USER\Documents\Claude\Projects\DIIS\AGENTS.md`.
2. repo `AGENTS.md` bila tersedia, `docs/WAYS-OF-WORKING.md`, `docs/decision-log.md`.
3. `docs/architecture/academic-lifecycle.md`, khusus Phase 5 dan dependency Phase 6.
4. `docs/audits/WAVE0-STABILIZATION-ACCEPTANCE-CONTRACT-2026-07-16.md`.
5. `docs/audits/PHASE5-COMPREHENSIVE-AUDIT-2026-07-15.md` bila tersedia lokal; perlakukan
   sebagai audit historis, bukan current truth.
6. `docs/audits/ACADEMIC-OPERATIONAL-E2E-REMEDIATION-2026-08-12.md`.
7. `docs/audits/ACADEMIC-OPERATIONAL-E2E-SOURCE-REVIEW-2026-08-13.md`.
8. `docs/audits/ACADEMIC-OPERATIONAL-E2E-STAGING-BROWSER-QA-2026-08-13.md`.
9. Final source/staging reports Wave 5 dan prompt Wave 6 ini.

Fetch/prune dan rekam refs. Baseline tervalidasi saat prompt dibuat:

- `origin/main = ff20b235dd1d5ee5d5e8e4a7220944c10cdbef7d`;
- `origin/staging = eb6886ef9e3f757a8e8c194a3108dd0db4b72ed2`, ancestor main;
- `origin/develop = e99807245b3134b00e86a3b40e4ff5a4331b5d50` dan tertinggal 15
  commit dari main;
- branch protection/ruleset akhir dilaporkan kembali membutuhkan satu approval.

Verifikasi ulang karena refs dapat berubah. Jangan membuat feature branch dari develop
yang belum memuat main.

### Gate 0A - Satu request keputusan, lalu baseline synchronization

Kirim sekali teks `Approval Tunggal` dari prompt ini. Bila disetujui:

1. Sinkronkan main ke develop lewat branch/PR terpisah; jangan direct-push protected branch,
   force-push, menghapus branch permanen, atau melakukan temporary relaxation tanpa
   authorization baru yang eksplisit.
2. Tunggu CI dan approval/merge normal. Fetch ulang dan buktikan
   `origin/main` ancestor dari `origin/develop`.
3. Baru buat worktree bersih dan branch
   `feat/wave6-phase5-report-card-completion-20260818` dari latest `origin/develop`.
4. Baseline synchronization bukan commit Wave 6 dan tidak boleh dicampur ke product diff.

Bila synchronization belum diizinkan/selesai, lanjutkan read-only inventory tetapi jangan
edit source. Bila dependency ditolak, tandai actual push blocked dan jangan mengklaim W6-05
closed; pekerjaan lain tetap boleh dianalisis tetapi jangan pecah implementasi menjadi wave
baru tanpa keputusan Director.

### Gate 0B - Plan, critique, fixed plan

Petakan setiap entry point Rapor ke action, controller, service, transaction, DB snapshot,
notification queue, reload state, dan family visibility. Buat plan, kritik terhadap
authorization/privacy/history/concurrency/UX/testability, perbaiki plan, lalu implementasi.

Jaga worktree pengguna. Jangan bersihkan historical/untracked artifacts, jangan hard reset,
jangan memakai `git add .`/`git add -A`, dan jangan mengubah file di luar scope.

### A - P0 Report list ownership

1. Perbaiki `ReportCardsService.findAll()` agar filter tidak dapat mengganti ownership.
   Gunakan `AND`/intersection terstruktur atau assertion eksplisit sebelum query.
2. Untuk GURU, `classId` harus termasuk union TeachingAssignment + wali class dari resolver
   existing. Forged class wajib 403 sebelum query data, bukan fallback ke kelas lain.
3. KAPROG tetap major-scoped dan fail-closed; SISWA hanya own; ORANG_TUA hanya linked child;
   family selalu `distributed` walaupun query meminta status lain.
4. Jika menambah `studentId` sebagai selected-child filter untuk UI keluarga, filter harus
   diinterseksikan dengan ownership. Missing/forged/cross-child ID tidak boleh membuka data.
5. Jangan memberi elevated access hanya karena role label jabatan lama. Pertahankan
   effective Appointment/permission contract dan mode tinjau.

Acceptance tests:

- GURU assigned, wali-only, unrelated class, forged `classId`, dan no-class;
- KAPROG same-major/cross-major/ambiguous active period;
- SISWA own/other; ORANG_TUA child-1/child-2/other;
- family query `status=draft|checked|published` tidak pernah mengembalikan protected rows;
- positive filters tetap paginated dan total konsisten.

### B - P0 Satu family Rapor resmi

1. Retire/hapus local ORANG_TUA Rapor modal yang menghitung dari `childGrades`,
   `KKTP_DEFAULT`, dan fake PDF. Jangan mempertahankan dua domain presentation.
2. Dari workspace ORANG_TUA, aksi `Rapor resmi` untuk anak aktif membuka canonical
   `/dashboard/rapor` dengan selected `studentId` yang server-validated, atau canonical
   detail component yang memakai endpoint ReportCard yang sama. Jangan fetch semua anak
   lalu memilih client-side bila endpoint selected-child tersedia.
3. Dari workspace SISWA, CTA Rapor membuka canonical own distributed report, bukan toast.
4. Sebelum distribusi tampilkan empty state jujur `Rapor belum dibagikan`; jangan render
   live Grade seolah dokumen Rapor. Current grades tetap boleh tampil sebagai `Nilai
   berjalan` di fitur Nilai, dengan label yang tidak ambigu.
5. Canonical detail hanya merender JSON snapshot ReportCard dan official sections dari
   report yang sama. Tidak boleh menghitung ulang Grade, Attendance, Class, homeroom, atau
   Appointment hidup.
6. Parent child switch, direct URL, back/refresh, dan quick switching tidak boleh leak atau
   menampilkan respons lama. Gunakan request key/abort/sequence guard bila ada client fetch.
7. Hapus CTA `Unduh/Ekspor PDF` yang hanya toast dari family flow. Teacher preview boleh
   tetap sebagai `Pratinjau nilai`, tetapi CTA harus mengarah ke modul Rapor; jangan
   mengimplementasikan PDF dalam Wave 6.

UI wajib mengikuti Tailwind/shadcn/Lucide existing, compact operational layout, semantic
dialog/title/label, keyboard focus, clear loading/empty/error, stable mobile dimensions,
dan tanpa nested interactive control atau overflow halaman pada 390 px.

### C - P1 Immutable KKTP snapshot

1. Reuse `apps/api/src/academic/kktp-resolver.ts`; dilarang membuat resolver kedua atau
   literal keputusan 75.
2. Saat generate/refresh draft, setiap `SubjectSnapshot` menyimpan:
   `{ subject, count, average, byType, kktp, kktpProvenance }`.
3. Untuk konteks Rapor/Grade, resolve exact `KktpConfig(subject, academicYear, semester)`,
   lalu approved `system_default=75`. Missing subject/year/semester adalah unconfigured.
4. Official sections, tuntas/predikat, hub, dan family detail membaca nilai KKTP snapshot.
   Perubahan config setelah publish/distribute tidak boleh mengubah dokumen lama.
5. Legacy published/distributed snapshot tanpa KKTP tidak boleh ditebak atau dimutasi.
   Render explicit `KKTP snapshot tidak tersedia` dan hindari label tuntas palsu. Legacy
   draft harus di-refresh sebelum check.
6. Check transition fail-closed bila snapshot baru tidak lengkap/valid. Jangan backfill
   historical official reports dari konfigurasi saat ini.

Test wajib: config 72, config 80, system default 75 dengan provenance, missing context,
legacy snapshot, config berubah setelah distribute, serta no remaining operational literal
75 di report-card/UI selain centralized constant/test fixture.

### D - P1 Active-period generation

1. Generate hanya untuk **tepat satu** semester aktif yang parent academic year-nya juga
   aktif. Query 0/ganda/mismatch harus fail-closed dengan error operasional jelas.
2. Class harus aktif, tahun kelas harus sama dengan active year, dan actor tetap wali kelas.
3. UI menampilkan periode authoritative sebagai read-only label; user tidak mengetik tahun
   atau memilih semester lain pada generate dialog.
4. Existing historical reports tetap dapat dibaca sesuai ownership; jangan mengubah global
   school-period lifecycle atau mengimplementasikan close semester.
5. Pertahankan advisory transaction lock, all-class transaction, unique/idempotent behavior,
   CAS status, dan exact generated/refreshed/skipped response.

Test 0/1/2 active semester, active semester pada inactive year, stale active class, forged
period payload, concurrent generate, dan non-draft skip.

### E - P1 Durable distribution, in-app, dan actual Web Push

Gunakan fondasi Wave 5. Jangan membuat queue/scheduler/outbox kedua.

1. Pada transaction pemenang `published -> distributed`, resolve linked active student user
   dan parent user/phone secara PII-minimal lalu buat pending `NotificationLog` atomik:
   - WhatsApp parent bila nomor valid;
   - channel `push` recipient = internal user UUID untuk student;
   - channel `push` recipient = internal user UUID untuk setiap linked parent yang sah.
2. Pakai stable `refType/refId/recipient/channel`, existing partial unique index, dan
   `createMany(skipDuplicates)` + committed pending ID query pattern Wave 5.
3. Setelah commit, panggil `enqueueCommittedPendingLogs(ids)` dengan deterministic
   `jobId=notificationLog.id`. Queue failure tidak me-rollback distribution; response/log
   menyatakan `recovery_pending`, dan stale recovery mengantre row yang sama.
4. EventEmitter boleh tetap menjadi domain signal, tetapi listener
   `report.distributed` tidak boleh lagi membuat notification intent kedua. Hapus jalur
   duplikat atau jadikan non-delivery observer yang aman.
5. Extend queue job/worker secara type-safe untuk channel push. WhatsApp/email adapter
   existing tidak boleh menerima channel push secara tidak sengaja.
6. Implement service Web Push memakai dependency approved `web-push`, existing VAPID env,
   dan all active `PushSubscription` milik user. Jangan log endpoint, keys, VAPID secret,
   phone, student name, score, atau report content.
7. Payload lock-screen harus generik, misalnya `Rapor semester tersedia`, dengan same-origin
   route `/dashboard/rapor`; tidak memuat nama siswa/NIS/nilai/kelas.
8. HTTP 404/410 endpoint menghapus subscription stale secara scoped. Retriable provider
   failure tetap mengikuti BullMQ retry. Multiple subscription dan retry tidak membuat
   business transition/log baru; gunakan stable push topic/collapse key bila didukung.
9. Jika user tidak memiliki subscription, in-app notification tetap tersedia dan job
   diselesaikan tanpa false external-delivery claim. Definisikan channel `push` sebagai
   canonical user notification: row-nya adalah durable in-app availability, sedangkan
   `sent` berarti dispatch processing selesai, bukan bukti bahwa OS menampilkan pesan.
   UI/report tidak boleh menyamakan queue success dengan external visibility.
10. `PushService.findMyNotifications()` wajib query `channel=push` dan `recipient=resolved
    userId`, bukan phone/email. Return bounded/paginated safe fields; cross-user query tidak
    tersedia.
11. Wire server action `fetchMyNotifications` dan pass ke `PushNotificationToggle` pada
    SISWA/ORANG_TUA. Label UI tidak boleh menyatakan push aktif bila backend registration
    gagal; unsubscribe harus menampilkan failure secara jujur.
12. Tambah `push` dan `notificationclick` handlers pada `apps/web/public/sw.js`, safe JSON
    fallback, generic content, focus/open same-origin Rapor route, dan `event.waitUntil`.
    Jangan membuat service-worker install gagal karena precache URL direktori yang invalid.

Concurrency/security tests:

- dua distributor: satu transition winner, satu 409, satu exact notification set;
- queue unavailable setelah commit -> distributed + pending -> recovery enqueue;
- repeated event/request tidak menggandakan log/job;
- parent tanpa phone tetap menerima in-app/push intent;
- student/parent/non-related user history isolation;
- zero/one/multiple/stale push subscriptions;
- 404/410 cleanup, retriable error, redacted logs;
- service-worker push/click malformed and valid payload;
- existing finance/remedial/announcement queue paths tetap hijau.

### F - Automated verification

Tambahkan focused API/web tests pada file existing atau file sempit yang sesuai. Test harus
membuktikan behavior, bukan source-string assertion saja. Gunakan Fastify injection untuk
controller/guard/HTTP boundary dan real service methods untuk ownership/transaction logic.

Jalankan focused terlebih dahulu, lalu seluruh gate:

```powershell
npm.cmd --workspace @smk/api run test -- --runInBand --cacheDirectory=.tmp/jest-cache-wave6
npm.cmd --workspace @smk/web run test -- --runInBand
npm.cmd --workspace @smk/api run type-check
npm.cmd --workspace @smk/web run type-check
npm.cmd --workspace @smk/database run type-check
npm.cmd --workspace @smk/types run type-check
npm.cmd --workspace @smk/api run lint
npm.cmd --workspace @smk/web run lint
npm.cmd --workspace @smk/api run build
npm.cmd --workspace @smk/web run build
npm.cmd --workspace @smk/database exec -- prisma validate
npm.cmd --workspace @smk/database run db:generate
```

Laporkan exact suite/test/page counts. Jangan menghapus test benar, melonggarkan assertion,
atau mengubah auth supaya hijau.

### G - PostgreSQL dan local runtime proof

Tidak ada migration baru. Tetap gunakan PostgreSQL disposable + Redis namespace lokal dan
PII-safe fixtures untuk membuktikan:

1. seluruh migration production baseline apply pada database kosong;
2. exact notification rows per recipient/channel dan existing partial uniqueness;
3. two-connection distribute race: satu winner, satu conflict;
4. commit + simulated queue failure + recovery row yang sama;
5. two-connection generate lock/idempotency;
6. KKTP config/snapshot immutability dan legacy no-guess behavior;
7. ownership filters pada real query tidak dapat dioverride.

Jangan memakai staging live, production, data siswa nyata, `db push`, atau secret. Bersihkan
container/fixture/cache sementara setelah evidence dicatat.

### H - Local authenticated browser QA

Gunakan local stack, synthetic roles/data, viewport 1440x900 dan 390x844:

1. Wali menyiapkan draft pada active period read-only; forged old/future period ditolak API.
2. GURU assigned/wali/unrelated mencoba filter dan direct report route; unrelated 403.
3. Waka check/return, KS publish, TU distribute, dan SA assistance matrix tetap benar.
4. ORANG_TUA dua anak: sebelum distribute tidak ada Rapor resmi; setelah distribute hanya
   selected child snapshot; switch cepat/back/refresh/direct URL tidak leak.
5. SISWA melihat Nilai berjalan terpisah dan CTA Rapor membuka own distributed snapshot.
6. Snapshot config KKTP non-75 tampil; ubah config fixture setelah distribute dan dokumen
   tetap identik.
7. Simulasikan queue failure; UI transition sukses dengan delivery pending recovery, lalu
   notification muncul tepat satu setelah recovery.
8. Dengan Push API mock/local harness, subscribe/unsubscribe/history/error states dan
   service-worker push/click berfungsi. Actual external Web Push tetap wajib dibuktikan pada
   staging candidate SHA sebelum staging sign-off.
9. Periksa keyboard/focus/loading/empty/error, long content, no nested controls, 390 px no
   page overflow, console/network, serta no PII/secret/subscription endpoint/answer leakage.

Screenshot/evidence harus redacted.

### I - Self-review dan report

Trace ulang seluruh CTA sampai DB/queue/reload. Cari dan tutup same-scope P0/P1/P2:
filter overwrite, cross-class/child leak, live-data masquerading as report, KKTP literal,
historical recomputation, active-period ambiguity, notification after-commit gap, duplicate
intent/job, phone-based in-app ownership, fake success, stale response, raw provider/Prisma
error, push endpoint/key/PII log, dan misleading CTA.

Buat:

`docs/audits/WAVE6-PHASE5-REPORT-CARD-COMPLETION-2026-08-18.md`

Report wajib memuat:

- refs/base SHA dan main->develop synchronization proof;
- scope closure matrix W6-01..W6-06 plus additional findings;
- exact authority/ownership matrix;
- active-period and immutable KKTP contracts;
- distribution transaction/outbox/queue/recovery sequence;
- in-app/Web Push ownership, retry, stale-subscription, privacy behavior;
- changed-file manifest dan dependency approval;
- focused/full test/build counts;
- PostgreSQL/Redis/browser evidence;
- residual gates separated into source, staging, and production.

### J - Stop gate

Jalankan status, diff stat, `git diff --check`, cached diff check, conflict-marker/trailing
whitespace scan, dan dependency audit relevant to the one added package. Pastikan tidak ada
staged changes dan tidak ada historical artifact terikut.

Jangan commit, push, PR, merge, deploy, atau mutate staging/production. Akhiri dengan:

`STOPPED AT WAVE 6 INDEPENDENT SOURCE REVIEW GATE - NO PRODUCT COMMIT/PUSH/PR/DEPLOY`
````

## Acceptance Contract Wave 6

- Enam backlog lama ditutup atau dibuktikan regression-only; tidak ada klaim berdasarkan
  audit Juli tanpa current-source proof.
- GURU tidak dapat mengganti own class scope melalui query.
- Semua family entry point membedakan Nilai berjalan dari Rapor resmi dan hanya merender
  own/child distributed snapshot.
- KKTP value/provenance immutable per subject; legacy tidak ditebak.
- Generate hanya active period authoritative dan fail-closed pada ambiguity.
- Distribution, notification intent, audit event, dan recipient set atomik/idempotent.
- In-app history user-bound; actual Web Push bekerja melalui service worker dan tidak
  membocorkan PII/secret.
- Source independent Reviewer target: **>=96%**.
- E2E validated target setelah PostgreSQL/Redis/local browser: **>=92%**.
- Staging sign-off tetap membutuhkan candidate-SHA browser QA dan actual Web Push proof.

## Confidence Dan Risiko

Confidence Prompt Architect: **97%**.

Risiko utama yang wajib dibuktikan, bukan diasumsikan:

1. actual Web Push pada browser/VAPID staging tanpa mencetak secret/subscription;
2. notification intent tetap durable bila proses gagal setelah commit;
3. JSON snapshot compatibility untuk legacy reports tanpa mengubah dokumen historis;
4. direct query ownership setelah selected-child/student filter ditambahkan;
5. active-period ambiguity tidak membuat fail-open.

Wave 6 belum boleh digabung dengan Wave 7. Setelah independent source review, packaging,
CI, dan staging QA Wave 6 lulus, barulah Prompt Architect memvalidasi ulang scope atomic
semester closing terhadap baseline baru.
