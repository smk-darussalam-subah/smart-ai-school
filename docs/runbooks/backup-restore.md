# Runbook: Backup & Restore Database DIIS

> Terakhir diperbarui: 2026-06-13 | Versi: 1.0

## Ringkasan

DIIS menggunakan strategi **backup host-cron** (bukan container cron):
- `appuser` menjalankan `pg_dump` via `docker exec` ke container `smk-postgres`
- Dump disimpan di `/opt/diis-backups/` (lokal VPS, retensi 14 hari)
- Opsional: rclone ke remote cloud bila `BACKUP_RCLONE_REMOTE` di-set
- **Drill restore wajib setiap bulan** — backup yang tidak pernah di-restore tidak terpercaya

---

## Setup Awal

### 1. Buat direktori backup

```bash
# Jalankan sebagai root atau appuser dengan sudo
sudo mkdir -p /opt/diis-backups
sudo chown appuser:appuser /opt/diis-backups
sudo chmod 750 /opt/diis-backups
```

### 2. Pastikan script executable

```bash
chmod +x /home/appuser/smart-ai-school/scripts/backup-db.sh
chmod +x /home/appuser/smart-ai-school/scripts/restore-drill.sh
```

### 3. Test backup manual pertama kali

```bash
# Jalankan sebagai appuser
cd /home/appuser/smart-ai-school
bash scripts/backup-db.sh

# Cek output
ls -lh /opt/diis-backups/
tail -20 /opt/diis-backups/backup.log
```

**Output yang diharapkan:**
```
[backup-db 2026-06-13 02:30:00] Mulai backup smk_db → /opt/diis-backups/smk_db_20260613_0230.dump
[backup-db 2026-06-13 02:30:15] OK — file: smk_db_20260613_0230.dump, ukuran: 4.2M, sha256: abc123...
[backup-db 2026-06-13 02:30:15] BACKUP_RCLONE_REMOTE tidak di-set — skip rclone (hanya backup lokal)
[backup-db 2026-06-13 02:30:15] Backup selesai
```

### 4. Jadwalkan cron (appuser)

```bash
# Edit crontab sebagai appuser
crontab -e

# Tambahkan baris berikut (02:30 WIB = 19:30 UTC):
2  19  * * *  /home/appuser/smart-ai-school/scripts/backup-db.sh >> /opt/diis-backups/backup.log 2>&1
```

Verifikasi cron terdaftar:
```bash
crontab -l | grep backup-db
```

---

## Konfigurasi rclone (Off-VPS Backup)

> Langkah ini opsional tapi sangat dianjurkan untuk keandalan data.

### 1. Install rclone

```bash
curl https://rclone.org/install.sh | sudo bash
```

### 2. Konfigurasi remote

```bash
# Jalankan sebagai appuser — ikuti wizard interaktif
rclone config

# Contoh: Google Drive
# n → new remote
# Name: diis-backup
# Type: drive (Google Drive)
# Ikuti wizard OAuth
```

### 3. Test rclone

```bash
rclone lsd diis-backup:
```

### 4. Aktifkan di backup

Tambahkan ke environment cron:
```bash
# Edit /etc/environment atau ~/.bashrc appuser
BACKUP_RCLONE_REMOTE=diis-backup:smk-darussalam-subah-db
```

Atau langsung di crontab:
```
2  19  * * *  BACKUP_RCLONE_REMOTE=diis-backup:smk-darussalam-subah-db /home/appuser/smart-ai-school/scripts/backup-db.sh >> /opt/diis-backups/backup.log 2>&1
```

---

## Drill Restore (Wajib Tiap Bulan)

```bash
# Jalankan sebagai appuser di VPS
cd /home/appuser/smart-ai-school
bash scripts/restore-drill.sh
```

**Output laporan yang diharapkan:**
```
============================================================
  LAPORAN DRILL RESTORE — 2026-06-13 10:00:00
  Dump: smk_db_20260613_0230.dump (4.2M)
============================================================

--- Jumlah Tabel per Schema ---
academic|8
ai_knowledge|2
audit|1
auth|5
finance|1
notification|3
ppdb|2
school|5
student|2
teacher|2

--- Row Count Tabel Kunci ---
auth.users|47
student.students|38
audit.audit_log|1523

============================================================
  DRILL SELESAI — database sementara akan di-DROP
============================================================
```

Catat tanggal, ukuran dump, dan row count di logbook/tiket setelah drill selesai.

---

## Prosedur Restore Darurat (Produksi)

> ⚠️ **HATI-HATI**: Restore produksi = risiko kehilangan data pasca-backup terakhir.
> Lakukan HANYA bila terjadi kerusakan data yang tidak bisa diperbaiki cara lain.
> **Koordinasi dengan Director sebelum eksekusi.**

### Langkah 1: Stop API (cegah tulis baru)

```bash
cd /home/appuser/smart-ai-school/infrastructure/docker
docker compose stop api
```

### Langkah 2: Tentukan dump yang akan digunakan

```bash
ls -lht /opt/diis-backups/smk_db_*.dump | head -5
# Pilih dump terakhir sebelum insiden
```

### Langkah 3: Drop + recreate database target

```bash
docker exec smk-postgres psql -U smk_admin -d postgres \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='smk_db';"
docker exec smk-postgres psql -U smk_admin -d postgres \
  -c "DROP DATABASE smk_db;"
docker exec smk-postgres psql -U smk_admin -d postgres \
  -c "CREATE DATABASE smk_db OWNER smk_admin;"
```

### Langkah 4: Restore

```bash
DUMP_FILE=/opt/diis-backups/smk_db_YYYYMMDD_HHMM.dump  # ganti dengan nama aktual

docker exec -i smk-postgres \
  pg_restore --username=smk_admin --dbname=smk_db \
  --no-owner --no-privileges --exit-on-error \
  < "${DUMP_FILE}"
```

### Langkah 5: Verifikasi

```bash
docker exec smk-postgres psql -U smk_admin -d smk_db \
  -c "SELECT count(*) FROM auth.users;"
docker exec smk-postgres psql -U smk_admin -d smk_db \
  -c "SELECT count(*) FROM student.students;"
```

### Langkah 6: Jalankan Prisma migration (bila restore ke versi lebih lama)

```bash
docker compose --profile migrate up api-migrate
```

### Langkah 7: Start API kembali

```bash
docker compose up -d api
```

### Langkah 8: Health check

```bash
curl -s http://localhost:3001/health | jq .
```

---

## Kebijakan Backup

| Item | Nilai |
|------|-------|
| Jadwal | 02:30 WIB setiap hari (cron host appuser) |
| Retensi lokal | 14 hari |
| Format | pg_dump custom (-Fc) |
| Enkripsi | Tidak (VPS private, filesystem milik appuser) — pertimbangkan rclone crypt untuk remote |
| Drill restore | **Wajib tiap bulan, tanggal bebas** |
| Notifikasi gagal | Log file — cron gagal tidak mengirim notifikasi otomatis; pantau log setiap minggu |

---

## Pemantauan Backup

```bash
# Cek log backup terbaru
tail -20 /opt/diis-backups/backup.log

# Cek ukuran semua dump
ls -lht /opt/diis-backups/smk_db_*.dump

# Konfirmasi dump terakhir kurang dari 25 jam
find /opt/diis-backups -name "smk_db_*.dump" -mtime -1 | wc -l
# Harus: 1 (atau lebih bila ada drill manual)
```

---

## Troubleshooting

### Backup gagal: container tidak berjalan

```bash
docker ps --filter "name=smk-postgres"
# Bila tidak muncul: docker compose up -d postgres
```

### pg_dump error: permission denied

```bash
# Pastikan POSTGRES_USER punya hak SUPERUSER atau minimal REPLICATION
docker exec smk-postgres psql -U smk_admin -c "\du smk_admin"
```

### Restore gagal: role tidak ditemukan

```bash
# pg_restore --no-owner --no-privileges menghindari konflik role
# Bila masih gagal, tambahkan --single-transaction dan cek error spesifik
```
