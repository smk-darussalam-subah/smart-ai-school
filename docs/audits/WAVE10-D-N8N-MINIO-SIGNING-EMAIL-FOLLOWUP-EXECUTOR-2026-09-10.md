# W10-D n8n MinIO Signing and Email Consolidated Follow-up

Tanggal: 2026-09-10 (Asia/Jakarta)

Peran: Executor, bukan Independent Reviewer

Verdict: **`SOURCE COMPLETE - INDEPENDENT REVIEW REQUIRED - ALL OPERATIONAL MUTATIONS HOLD`**

## Hasil

Sepuluh finding Independent Reviewer ditutup dalam follow-up source terkonsolidasi:

1. kegagalan download S3, object absent, credential invalid, dan kegagalan parse JSON
   sekarang diarahkan ke email teredaksi tepat satu kali, kemudian execution tetap
   berakhir `error` secara eksplisit;
2. evaluator menerima signed negative growth yang sah dari producer canonical, tetapi
   tetap menolak tipe/overflow/status dan relasi growth/days-to-full yang kontradiktif;
3. jalur SMTP sukses dan rejection dibuktikan dengan sink disposable;
4. README memakai credential store, jadwal canonical `02:45 Asia/Jakarta`, dan tidak
   lagi memberi instruksi environment variable atau cron lama;
5. tipe kanal `smtp` dipisahkan dari readiness runtime `unbound`, sehingga source
   tidak mengklaim credential sudah siap;
6. harness mempertahankan exit status utama dan menjadikan teardown serta bounded
   absence proof sebagai syarat sebelum TAP success plan dicetak;
7. negative controls membuktikan cleanup failure keluar `74` tanpa success plan dan
   `SIGTERM` tetap keluar `143` setelah resource test dinyatakan absent.
8. producer sekarang menerbitkan `estimatedDatabaseBytes`; consumer menghitung ulang
   percent dan days-to-full memakai input serta pembulatan canonical, dengan arithmetic
   intermediate yang tidak dapat overflow diam-diam.
9. fixture negative `estimatedDatabaseBytes` yang hilang sekarang membentuk object
   tanpa field tersebut sebelum memanggil evaluator. Exact contract mengeksekusi kasus
   itu dan lulus `44/44` tanpa perubahan formula produksi.
10. entrypoint Git Bash tidak lagi mencoba mengemulasi permission/lock Linux pada NTFS.
    Ia memverifikasi `cygpath` dan WSL, mengikat path script yang sama, lalu melakukan
    fail-closed re-exec di WSL/Linux. Eksekusi WSL langsung tetap diuji terpisah.

Tidak ada workflow, credential, provider, SMTP sekolah, MinIO operasional, Shared
Drive, VPS, scheduler, staging, atau production yang dimutasi. Seluruh email dalam
pengujian masuk ke sink lokal sintetis; tidak ada email eksternal terkirim.

## Exact binding

| Item              | Nilai                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------- |
| Merge baseline    | `380080b2d92f064c1221395c9a525a953d94a163`                                            |
| Tree baseline     | `6de3c10f7853b8ee46fe72eaf2f27c4f9cc9da54`                                            |
| Working checkout  | `0e0b341e47c7badc0d1f35ccca2c67614f161ddf`                                            |
| n8n image         | `n8nio/n8n@sha256:9f1f8e4c093c9924338bd168e3f813f746041d13b337753af0dbdd329e7b50f7`   |
| MinIO image       | `minio/minio@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e` |
| MinIO client      | `minio/mc@sha256:a7fe349ef4bd8521fb8497f55c6042871b2ae640607cf99d9bede5e9bdf11727`    |
| Proof environment | Local disposable Docker `linux/amd64`, synthetic data and credentials only            |

## Source closure

### Error routing fail-closed

`Baca completion manifests` dan `Parse completion manifest` memakai error output
terpisah. Masing-masing menuju Code node yang hanya membentuk reason code statis:

- `TELEMETRY_READ_FAILED`; atau
- `TELEMETRY_PARSE_FAILED`.

Payload itu dikirim ke node SMTP kegagalan tanpa raw provider error, endpoint,
credential, atau object key. Node berikutnya sengaja melempar
`DIIS_BACKUP_MONITOR_FAILED_AFTER_REDACTED_ALERT`; karena itu notifikasi tidak dapat
mengubah kegagalan observasi menjadi execution sukses.

SMTP rejection juga tetap menghasilkan execution `error`. Tidak ada retry diam-diam
atau fallback ke telemetry kosong.

### Konsistensi telemetry

Evaluator sekarang mengikat:

```text
projectedFreePercent = floor(((targetFreeBytes - estimatedDatabaseBytes) * 100) / targetTotalBytes)
projectedDaysToFull = floor((targetFreeBytes * 30) / growth30Bytes)  # growth positif
```

Formula pertama sekarang sama persis dengan capacity guard producer: `targetFreeBytes`
adalah ruang sebelum backup dan persentase projected memakai estimasi database dari
`pg_database_size`, bukan ukuran dump terkompresi. Formula kedua sama dengan producer
off-site untuk growth 30 hari positif. Producer memasukkan estimasi tersebut ke payload
telemetry; consumer tidak lagi menebak input yang hilang.

Semua byte/growth wajib safe integer. Perkalian untuk kedua nilai turunan memakai
`BigInt` hanya sebagai intermediate, lalu hasil wajib kembali berada pada rentang safe
integer. `backupBytes` tidak boleh negatif, estimasi/total wajib positif, dan free wajib
mencakup estimasi serta tidak melampaui total. Growth berstatus `available` boleh
bertanda negatif. Status `insufficient_history` wajib memakai nilai `0`. Growth 30 hari
nol/negatif atau history belum cukup wajib memakai days `-1`; growth positif wajib sama
persis dengan hasil formula. Tipe, overflow, status, percent, atau days kontradiktif
menghasilkan `TELEMETRY_INVALID`, bukan false healthy.

Fixture end-to-end diambil dari `monitor/latest.json` yang benar-benar dihasilkan oleh
`backup.sh` dalam success path sintetis. Fixture itu sengaja memiliki estimasi database
`4096` byte dan dump `2048` byte, sehingga kontrak membuktikan consumer memakai authority
producer, bukan kembali menyamakan estimate dengan dump.

### Status kanal

Output evaluator tidak lagi memakai `notificationChannelStatus: smtp`. Source hanya
mencatat:

- `notificationChannelType: smtp`;
- `notificationChannelReadiness: unbound`.

Readiness hanya dapat dinaikkan melalui proof credential/runtime pada commissioning
terpisah. Workflow source tetap `active: false`.

## Behavioral matrix disposable

| Kasus                    | Status execution | Last node                         | SMTP sink | Hasil |
| ------------------------ | ---------------- | --------------------------------- | --------- | ----- |
| Growth negatif sah/sehat | `success`        | `Alert diperlukan?`               | 0         | PASS  |
| Alert kapasitas valid    | `success`        | `Kirim email alert teredaksi`     | 1         | PASS  |
| Object telemetry absent  | `error`          | `Tandai monitor gagal`            | 1         | PASS  |
| JSON malformed           | `error`          | `Tandai monitor gagal`            | 1         | PASS  |
| Credential S3 invalid    | `error`          | `Tandai monitor gagal`            | 1         | PASS  |
| SMTP menolak recipient   | `error`          | `Kirim email alert teredaksi`     | 0         | PASS  |
| Scan isi email kegagalan | n/a              | tidak memuat data sensitif mentah | n/a       | PASS  |
| Cleanup dan absence      | n/a              | prefix task dinyatakan absent     | n/a       | PASS  |

Harness memverifikasi jumlah delivery, status execution, last node, redaction, dan
teardown. Semua operasi cleanup dan observasi Docker dibatasi 20 detik. Penghapusan
hanya menargetkan nama exact di bawah prefix task yang divalidasi, kemudian inventory
container/network/volume harus membuktikan seluruh prefix absent. TAP success plan baru
dicetak setelah proof itu lulus. Fault injection cleanup dan `SIGTERM` diuji sebelum
matriks utama. Remainder count akhir `0/0/0`.

### Integritas eksekusi contract P1-IR09

Reproduksi reviewer berhenti pada test ke-44 karena fixture missing-field memberikan
function object kepada `evaluate`, lalu mencoba memanggil hasil evaluator sebagai
fungsi. Perbaikannya hanya mendestrukturisasi `estimatedDatabaseBytes` dari payload
fixture dan memberikan object sisanya langsung kepada evaluator. Negative case kini
benar-benar menegaskan `TELEMETRY_INVALID`.

Exact `backup-contract.sh` setelah patch keluar `0` dan mencetak `1..44`. Formula
producer/consumer, workflow n8n, dan integration harness tidak diubah oleh follow-up
IR09. Matrix disposable `8/8` yang masih segar dipakai ulang sesuai batas reviewer dan
tidak diklaim dijalankan kembali.

### Portabilitas entrypoint P1-IR10

Kontrak backup bergantung pada permission POSIX, `/proc`, PID namespace, dan signal
Linux. Git Bash pada NTFS dapat membuat direktori secara atomik tetapi gagal menerapkan
`mkdir -m 0700`; menjalankan kontrak secara native di sana akan memberi hasil yang tidak
mewakili runtime produksi.

Harness sekarang mendeteksi `MINGW/MSYS/CYGWIN` sebelum membuat state test. Entry point
memerlukan `cygpath` dan WSL, mengonversi path script secara eksplisit dengan
`wsl.exe -e wslpath`, lalu menjalankan byte script yang sama di WSL/Linux. Kegagalan
dependency atau resolusi path berhenti nonzero. Negative control tanpa `wsl.exe` keluar
`1` sebelum state kontrak dibuat. Tidak ada environment flag atau fallback yang dapat
melewati re-exec.

Dua run dilakukan berurutan dan independen:

1. Git Bash entrypoint dengan fail-closed WSL/Linux re-exec: `44/44`, exit `0`;
2. direct WSL invocation: `44/44`, exit `0`.

Laporan tidak mengklaim native Git Bash sebagai proof permission POSIX.

## Verification

| Pemeriksaan                               | Hasil                                                  |
| ----------------------------------------- | ------------------------------------------------------ |
| Workflow strict JSON parse                | PASS                                                   |
| Git Bash entrypoint -> WSL/Linux contract | `44/44` PASS, exit `0`                                 |
| Direct WSL/Linux contract                 | `44/44` PASS, exit `0`                                 |
| Git Bash tanpa WSL negative control       | PASS, exit `1` sebelum contract state                  |
| Disposable n8n/MinIO/SMTP behavioral test | `8/8` PASS                                             |
| Signed growth/capacity consistency        | PASS                                                   |
| Actual producer-to-consumer fixture       | PASS                                                   |
| Derived formula edge matrix               | PASS: positive/zero/negative/history/rounding/overflow |
| Cleanup failure/signal controls           | PASS: exit `74`/`143`, no false plan                   |
| Bash syntax                               | PASS                                                   |
| Node fixture syntax                       | PASS                                                   |
| Diff/whitespace/conflict marker           | PASS                                                   |
| Secret scan                               | PASS, synthetic fixture values only                    |
| Staged files                              | `0`                                                    |
| Disposable residue                        | container/network/volume `0/0/0`                       |

## Findings terkonsolidasi

| ID                         | Severity | Status                | Evidence                                                                 |
| -------------------------- | -------- | --------------------- | ------------------------------------------------------------------------ |
| N8N-READ-PARSE-ALERT       | P1       | CLOSED SOURCE         | Missing, malformed, dan auth failure alert sekali lalu tetap `error`.    |
| N8N-TELEMETRY-CONSISTENCY  | P1       | CLOSED SOURCE         | Cross-field contradiction ditolak fail-closed.                           |
| N8N-SIGNED-GROWTH          | P1       | CLOSED SOURCE         | Signed negative growth canonical diterima; invalid combinations ditolak. |
| N8N-HARNESS-CLEANUP        | P2       | CLOSED SOURCE         | Cleanup/absence wajib sebelum success; fault dan signal diuji.           |
| N8N-PRODUCER-CONSUMER      | P1       | CLOSED SOURCE         | Estimate dipublikasi; percent/days divalidasi dengan formula canonical.  |
| N8N-SMTP-BEHAVIOR          | P2       | CLOSED SOURCE         | Accept/reject sink paths dieksekusi secara behavioral.                   |
| N8N-README-DRIFT           | P2       | CLOSED SOURCE         | Credential-store dan jadwal `02:45 Asia/Jakarta` menjadi canonical.      |
| N8N-CHANNEL-STATUS         | P2       | CLOSED SOURCE         | Channel type dipisahkan dari runtime readiness.                          |
| IR09-CONTRACT-EXECUTION    | P1       | CLOSED SOURCE         | Missing-estimate dieksekusi; Linux contract mencapai exact `44/44`.      |
| IR10-HARNESS-PORTABILITY   | P1       | CLOSED SOURCE         | Git Bash fail-closed re-exec ke WSL; direct WSL diuji terpisah.          |
| N8N-RUNTIME-CREDENTIAL     | P1       | OPEN RUNTIME          | S3 dan SMTP credential belum diikat pada runtime.                        |
| N8N-RUNTIME-ACTIVATION     | P1       | OPEN RUNTIME          | Import/publish/activation belum diizinkan dan belum diuji operasional.   |
| OFFSITE-RUNTIME-CONNECTION | P1       | OPEN RUNTIME          | rclone crypt/copy/restore Shared Drive belum terbukti.                   |
| PREP-GC-CAPACITY           | P1       | OPEN RUNTIME          | Native GC/capacity cleanup tetap gate terpisah.                          |
| PREP-WRITER-PRESERVATION   | P1       | OPEN EVIDENCE/RUNTIME | Root cron, writer lock, dan preservation masih gate terpisah.            |

Tidak ditemukan P0 atau finding source P1/P2/P3 baru pada completion sweep affected
slice. Status source tidak mengubah blocker runtime di atas.

## Shared Drive dan notification state yang dipertahankan

- Shared Drive organisasi `DIIS Recovery` dan folder `BACKUP_DIIS` siap sebagai
  destination milik sekolah berdasarkan observasi read-only sebelumnya.
- Runtime belum memiliki `rclone`, config crypt, copy encrypted, atau disposable
  restore proof. Kesiapan destination bukan bukti koneksi off-site.
- MinIO monitor service account tetap least-privilege dan expiry
  `2027-03-08T00:00:00Z`; owner/rotation H-30, H-14, H-7 tetap dipertahankan.
- SMTP sekolah masih `UNBOUND`; test hanya memakai credential sintetis disposable.
- WAHA tetap sesi terpisah. Fonnte tidak dipakai oleh workflow backup.

## Keputusan minimum berikutnya

1. Independent Reviewer memeriksa narrow closure P1-IR09/P1-IR10 pada exact nine-file
   manifest: missing-estimate negative case, fail-closed Git Bash-to-WSL entrypoint,
   direct WSL run, hash terbaru, dan konsistensi klaim laporan/evidence. Bukti formula
   serta matrix disposable yang tidak berubah dapat dipakai ulang.
2. Setelah source approval, Director dapat menilai paket credential/runtime terpisah:
   replacement S3 credential, SMTP sekolah, binding saat inactive, proof healthy,
   alert, read/parse failure, dan SMTP rejection.
3. Import/publish/activation tetap menunggu capacity, preservation, writer/scheduler,
   dan quiet-window gate.
4. Off-site Google Drive serta WAHA tetap commissioning terpisah dan tidak boleh
   disimpulkan aktif dari laporan ini.

## Literal changed-file manifest

1. `infrastructure/docker/scripts/backup.sh`
2. `infrastructure/n8n/workflows/backup-daily.json`
3. `infrastructure/docker/tests/backup-contract.sh`
4. `infrastructure/n8n/README.md`
5. `infrastructure/docker/tests/n8n-backup-monitor-integration.sh`
6. `infrastructure/docker/tests/fixtures/n8n-smtp-sink.js`
7. `docs/audits/WAVE10-D-CLEANUP-PREPARATION-OWNER-EVIDENCE-AND-LOCAL-BUNDLE-EVIDENCE-2026-09-09.json`
8. `docs/audits/WAVE10-D-N8N-MINIO-SIGNING-EMAIL-FOLLOWUP-EXECUTOR-2026-09-10.md`
9. `docs/audits/WAVE10-D-N8N-MINIO-SIGNING-EMAIL-FOLLOWUP-EVIDENCE-2026-09-10.json`

Laporan Reviewer historis dipertahankan tetapi tidak dimasukkan ke manifest source
follow-up baru. Tidak ada file staged.

## Artifact integrity sebelum independent review

| Path                                                                                                | SHA-256                                                            |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `infrastructure/docker/scripts/backup.sh`                                                           | `60e599df403f5083348b58a729ae11f5443c4031924a8b423eb8f6d6240f3a01` |
| `infrastructure/n8n/workflows/backup-daily.json`                                                    | `f0cf4ec47282cd0661c7cecb75e190a300644081b1875084cb509866caac4352` |
| `infrastructure/docker/tests/backup-contract.sh`                                                    | `8e42bdc0e05fcc04c34e62e01d3a930aff54d608beeb1d2bf95189ca59981ef2` |
| `infrastructure/n8n/README.md`                                                                      | `ddd19f6b1002647bd8e1b72f1db9db457d3a647557100d21f0751cfe212bd377` |
| `infrastructure/docker/tests/n8n-backup-monitor-integration.sh`                                     | `b247c7b9dbd02acb7fe915aa3ed70389e569bc040f5b38f97725c1172e8d839c` |
| `infrastructure/docker/tests/fixtures/n8n-smtp-sink.js`                                             | `690a13d99e1c878069448012ca38b3c91d135d1b9286fe18af18d1969a4fafcb` |
| `docs/audits/WAVE10-D-CLEANUP-PREPARATION-OWNER-EVIDENCE-AND-LOCAL-BUNDLE-EVIDENCE-2026-09-09.json` | `c7ab9cd0131c3b89fa44cb67d5ff002c5c836865b262e0daff45f6afc744dfa4` |
| `docs/audits/WAVE10-D-N8N-MINIO-SIGNING-EMAIL-FOLLOWUP-EVIDENCE-2026-09-10.json`                    | `df21b51c022f3f59a2663d681333180237e5c308e7eb3ebb491aad2f510d7532` |

Hash laporan Executor tidak ditulis ke file sendiri. Full-file SHA-256 dihitung dan
disampaikan setelah finalisasi.

## HOLD

Git packaging/commit/push/PR, runtime workflow import/update, credential creation atau
revocation, publish/activation, WAHA installation, off-site runtime connection, bundle
delivery/install, native GC change, Docker restart, cleanup/prune, backup/restore,
staging/production deployment, scheduler handoff, dan commissioning tetap **HOLD**.

## Rekomendasi model untuk tindak lanjut

Task berikutnya: Independent Reviewer memeriksa narrow closure P1-IR09/P1-IR10, exact
nine-file manifest, hash terbaru, dua run contract `44/44`, dan seluruh runtime hold.

Model / effort: **GPT-5.6 Terra (`gpt-5.6-terra`) / high**.

Alasan: perubahan terisolasi pada fixture dan entrypoint harness dengan acceptance
contract deterministik; semantik formula dan matrix disposable tidak berubah.

Syarat kualitas: hash manifest cocok; missing-estimate dieksekusi; Git Bash entrypoint
fail-closed ke WSL dan direct WSL masing-masing mereproduksi `44/44`; mutation tetap HOLD.

Eskalasi bila contract membuka mismatch formula atau regresi runtime baru:
**GPT-5.6 Sol (`gpt-5.6-sol`) / high**.

Sesi laporan ini: model/effort aktual tidak terverifikasi.
