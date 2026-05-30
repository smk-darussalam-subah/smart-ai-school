# n8n Workflows — DIIS Smart AI School

Direktori ini berisi workflow JSON yang siap diimpor ke n8n.

---

## Daftar Workflow

| File | Fungsi | Trigger |
|---|---|---|
| `workflows/health-check.json` | Monitor endpoint `/health` API, kirim WA jika DOWN | Setiap 5 menit |
| `workflows/backup-daily.json` | Konfirmasi backup PostgreSQL ada di MinIO, kirim WA status | Setiap hari 02:00 WIB |

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

## Variabel Lingkungan yang Dibutuhkan

Tambahkan ke service `n8n` di `infrastructure/docker/docker-compose.yml` dan isi nilainya di `.env`:

```env
# WhatsApp notification via Fonnte
FONNTE_API_KEY=your-fonnte-api-key-here
ADMIN_PHONE_NUMBER=6281234567890
```

| Variabel | Deskripsi | Contoh |
|---|---|---|
| `FONNTE_API_KEY` | API key dari dashboard Fonnte | `AbCd1234...` |
| `ADMIN_PHONE_NUMBER` | Nomor WA tujuan notifikasi (format: 628xxx) | `628123456789` |

Variabel ini diakses dalam workflow via ekspresi `={{ $env.NAMA_VARIABEL }}`.

---

## Konfigurasi Credential: MinIO (untuk backup-daily)

Workflow `backup-daily.json` menggunakan credential AWS (dengan endpoint MinIO) untuk autentikasi ke MinIO S3 API.

### Langkah setup credential

1. Di n8n, buka **Settings** → **Credentials** → **Add Credential**.
2. Pilih tipe: **AWS**.
3. Isi field:
   - **Credential Name**: `MinIO Backup Credentials` _(nama ini harus sama persis)_
   - **Access Key ID**: nilai `MINIO_ROOT_USER` dari `.env` (default: `smkadmin`)
   - **Secret Access Key**: nilai `MINIO_ROOT_PASSWORD` dari `.env`
   - **Region**: `us-east-1` _(nilai apapun, MinIO tidak memeriksa region)_
   - **Custom Endpoint**: `http://minio:9000`
   - Centang **Force path style** jika tersedia.
4. Klik **Save**.

Setelah credential dibuat, buka workflow `backup-daily` → klik node **Daftar File MinIO** → pada bagian Credential, pilih `MinIO Backup Credentials`.

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

- Node `Siapkan Tanggal` → `{"datePrefix":"2026-05-30","listUrl":"http://..."}`
- Node `Daftar File MinIO` → XML S3 ListObjectsV2 response
- Node `Cek Ada Backup?` → `{"backupFound":true,"fileCount":1,"sizeKB":"225.0 KiB","fileName":"postgres/2026-05-30_19-00.sql.gz"}`
- Node `Backup Ada?` → output ke true branch → `Notif WA — Backup OK`

---

## Catatan Timing (backup-daily)

Workflow `backup-daily` dan service `pg-backup` keduanya dijadwalkan pada `0 19 * * *` (UTC). 

- **pg-backup** (Docker cron) mulai pg_dump + upload ke MinIO pada 19:00 UTC.
- **n8n workflow** juga trigger pada 19:00 UTC untuk memeriksa keberadaan file.

Jika pg_dump selesai dalam < 1 menit, n8n akan menemukan file. Jika database besar dan dump membutuhkan waktu lebih, pertimbangkan mengubah cron n8n ke `15 19 * * *` (15 menit setelah backup dimulai) untuk menghindari false alert.

---

## Arsitektur Notifikasi

```
n8n workflow ──→ Fonnte API (api.fonnte.com) ──→ WhatsApp Admin IT
```

Fonnte adalah gateway WhatsApp Indonesia. Pastikan nomor pengirim di akun Fonnte sudah aktif dan verifikasi API key dari dashboard Fonnte.

---

## Referensi

- n8n dokumentasi: https://docs.n8n.io
- Fonnte API: https://fonnte.com/docs
- MinIO S3 API (ListObjectsV2): https://min.io/docs/minio/linux/developers/go/API.html
- Backup script: `infrastructure/docker/scripts/backup.sh`
- Docker Compose: `infrastructure/docker/docker-compose.yml`
