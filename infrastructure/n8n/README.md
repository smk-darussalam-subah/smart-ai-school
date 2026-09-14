# n8n Workflows — DIIS Smart AI School

Direktori ini berisi workflow JSON yang siap diimpor ke n8n.

---

## Daftar Workflow

| File                          | Fungsi                                                                           | Trigger               |
| ----------------------------- | -------------------------------------------------------------------------------- | --------------------- |
| `workflows/health-check.json` | Monitor endpoint `/health` API, kirim WA jika DOWN                               | Setiap 5 menit        |
| `workflows/backup-daily.json` | Baca telemetry completion backup dari MinIO, kirim email sekolah bila bermasalah | Setiap hari 02:45 WIB |

---

## Cara Import

### 1. Buka n8n

n8n berjalan di internal Docker network. Akses via Nginx reverse proxy:

```
https://n8n.smkdarussalamsubah.sch.id
```

Login dengan `N8N_BASIC_AUTH_USER` dan `N8N_BASIC_AUTH_PASSWORD` dari `.env`.

### 2. Import workflow

1. Klik **Workflows** di sidebar kiri.
2. Klik **Add Workflow** → **Import from File**.
3. Pilih file JSON dari folder ini.
4. Klik **Import**.

Ulangi untuk setiap workflow.

### 3. Konfigurasi setelah import

Setiap workflow memerlukan konfigurasi tambahan sebelum diaktifkan.

---

## Konfigurasi Workflow Backup

Workflow backup tidak membaca environment variables. Credential S3-compatible dan
SMTP disimpan terenkripsi di credential store n8n. Alamat pengirim dan penerima
terikat ke `admin@smkdarussalamsubah.sch.id` pada workflow yang direview.

Appointment due activation tidak dijalankan oleh n8n. Gunakan systemd timer pada VPS sesuai `docs/runbooks/appointment-due-activation-systemd.md`.

---

## Konfigurasi Credential: MinIO (untuk backup-daily)

Workflow `backup-daily.json` menggunakan node S3-compatible n8n. Jangan memakai node HTTP generik dengan credential AWS: autodeteksi service dari hostname internal `minio` menghasilkan scope SigV4 yang bukan `s3`.

### Langkah setup credential

1. Di n8n, buka **Settings** → **Credentials** → **Add Credential**.
2. Pilih tipe: **S3**.
3. Isi field:
   - **Credential Name**: `MinIO Backup Readonly S3 Credential` _(nama ini harus sama persis)_
   - **S3 Endpoint**: `http://minio:9000`
   - **Region**: `us-east-1`
   - **Access Key ID / Secret Access Key**: service account khusus monitor, bukan credential root MinIO.
   - **Force Path Style**: aktif.
   - **Ignore SSL Issues**: nonaktif.
4. Klik **Save**.

Policy service account hanya boleh `s3:GetObject` untuk object telemetry completion yang tepat. Setelah credential dibuat, buka workflow `backup-daily` → klik node **Baca completion manifests** → pilih `MinIO Backup Readonly S3 Credential`.

## Konfigurasi Credential: Email Sekolah (untuk backup-daily)

1. Di n8n, buat credential bertipe **SMTP** bernama `DIIS School SMTP` melalui kanal credential resmi.
2. Gunakan akun SMTP sekolah yang diizinkan mengirim sebagai
   `admin@smkdarussalamsubah.sch.id`.
3. Jangan menaruh password atau app password pada workflow, `.env` contoh, repository, atau laporan.
4. Recipient backup alert terikat ke `admin@smkdarussalamsubah.sch.id`.
5. Uji binding saat workflow masih inactive. Aktivasi memerlukan gate commissioning terpisah.

---

## Mengaktifkan Workflow

Setelah konfigurasi selesai, aktifkan workflow:

1. Buka workflow yang ingin diaktifkan.
2. Klik toggle **Active** di pojok kanan atas (dari OFF ke ON).
3. Workflow akan berjalan sesuai jadwal yang dikonfigurasi.

**Catatan:** Workflow di-import dalam status `active: false` (tidak aktif) agar tidak berjalan sebelum credential dikonfigurasi.

---

## Testing Manual

Untuk menguji workflow tanpa menunggu jadwal:

1. Buka workflow di editor n8n.
2. Klik node pertama (Schedule Trigger).
3. Klik **Execute Step** atau **Test Workflow** di toolbar atas.
4. Periksa output setiap node di panel kanan.

### Expected output — health-check

- Node `Cek API /health` → `{"status":"ok","uptime":...}`
- Node `API DOWN?` → output ke false branch (API OK, tidak ada notif)

### Expected output — backup-daily

- Node `Baca completion manifests` → binary `completionManifest` dari object telemetry terikat.
- Node `Parse completion manifest` → JSON di field `data`.
- Node `Nilai freshness completion` → `alertRequired: false` untuk telemetry valid dan segar.
- Validator menghitung ulang `projectedFreePercent` dari ruang bebas, estimasi database
  pra-dump, dan kapasitas total yang diterbitkan producer. Untuk growth 30 hari positif,
  validator juga menghitung ulang `projectedDaysToFull` dari ruang bebas dan growth;
  growth nol/negatif atau history yang belum cukup wajib memakai `-1`.
- Alert bermasalah diarahkan ke `admin@smkdarussalamsubah.sch.id` melalui credential SMTP terenkripsi.
- Kegagalan S3/parse mengirim payload statis teredaksi, lalu execution berakhir gagal
  eksplisit. Error mentah tidak boleh masuk subject atau body.
- Output evaluator memakai `notificationChannelType: smtp` dan
  `notificationChannelReadiness: unbound`. Readiness hanya boleh menjadi `validated`
  setelah credential diuji dalam gate commissioning.
- SMTP rejection harus berakhir gagal eksplisit dan tidak boleh berubah menjadi sukses.

---

## Catatan Timing (backup-daily)

Service `pg-backup` berjalan pada 02:00 WIB dan workflow `backup-daily` dijadwalkan pada 02:45 WIB.

- **pg-backup** mulai membuat backup pada 02:00 WIB.
- **n8n workflow** membaca telemetry completion setelah grace period 45 menit.

Jadwal canonical hanya `45 2 * * *` pada timezone `Asia/Jakarta`. Jangan mengubah
jadwal atau memakai ekspresi UTC lama tanpa review baru atas grace period backup.

---

## Arsitektur Notifikasi Backup

```
n8n workflow ──→ SMTP sekolah ──→ admin@smkdarussalamsubah.sch.id
```

WAHA direncanakan sebagai kanal WhatsApp pada sesi instalasi terpisah. Jangan mengaktifkan Fonnte untuk workflow backup: probe 2026-09-09 menunjukkan token existing tidak valid.

---

## Referensi

- n8n dokumentasi: https://docs.n8n.io
- MinIO S3 API (ListObjectsV2): https://min.io/docs/minio/linux/developers/go/API.html
- Backup script: `infrastructure/docker/scripts/backup.sh`
- Docker Compose: `infrastructure/docker/docker-compose.yml`
