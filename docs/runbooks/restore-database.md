# Runbook: Restore Database PostgreSQL dari Backup MinIO

**Berlaku untuk:** DIIS Smart AI School — SMK Darussalam Subah
**Backup location:** MinIO bucket `diis-backup` → prefix `postgres/`
**Format file:** `YYYY-MM-DD_HH-MM.sql.gz`
**Retention:** 7 hari terakhir

---

## Prasyarat

- [ ] Akses SSH ke VPS (atau sudah di dalam VPS)
- [ ] Container `smk-postgres` dalam kondisi running
- [ ] Container `smk-minio` dalam kondisi running
- [ ] Container `smk-pg-backup` sudah pernah jalan (mc alias `myminio` sudah tersetting)

---

## Skenario A — Restore ke Database Aktif (Full Restore)

> ⚠️ **PERHATIAN:** Operasi ini akan **menimpa semua data** di database saat ini.
> Gunakan hanya saat disaster recovery, bukan untuk partial restore.

### Langkah 1 — List backup yang tersedia

```bash
docker exec smk-pg-backup /opt/backup-bin/mc ls myminio/diis-backup/postgres/
```

Output contoh:
```
[2026-05-27 19:00:14 UTC]  18MiB STANDARD postgres/2026-05-27_19-00.sql.gz
[2026-05-26 19:00:12 UTC]  17MiB STANDARD postgres/2026-05-26_19-00.sql.gz
[2026-05-25 19:00:09 UTC]  16MiB STANDARD postgres/2026-05-25_19-00.sql.gz
```

### Langkah 2 — Download backup yang diinginkan ke VPS

```bash
# Ganti YYYY-MM-DD_HH-MM dengan tanggal yang diinginkan
RESTORE_FILE="2026-05-27_19-00.sql.gz"

docker exec smk-pg-backup \
  /opt/backup-bin/mc cp \
  myminio/diis-backup/postgres/${RESTORE_FILE} \
  /tmp/${RESTORE_FILE}
```

### Langkah 3 — Salin file dari container backup ke host

```bash
docker cp smk-pg-backup:/tmp/${RESTORE_FILE} /tmp/${RESTORE_FILE}
```

### Langkah 4 — Salin file dari host ke container postgres

```bash
docker cp /tmp/${RESTORE_FILE} smk-postgres:/tmp/${RESTORE_FILE}
```

### Langkah 5 — Hentikan service yang bergantung pada database

> Ini mencegah koneksi baru masuk saat restore berlangsung.

```bash
docker compose -f /opt/diis/infrastructure/docker/docker-compose.yml stop api web n8n metabase
```

### Langkah 6 — Drop schema dan restore

```bash
# Masuk ke container postgres
docker exec -it smk-postgres sh

# Di dalam container postgres:
psql -U diis_admin -d diis_db -c "
  DROP SCHEMA IF EXISTS auth CASCADE;
  DROP SCHEMA IF EXISTS academic CASCADE;
  DROP SCHEMA IF EXISTS student CASCADE;
  DROP SCHEMA IF EXISTS teacher CASCADE;
  DROP SCHEMA IF EXISTS ppdb CASCADE;
  DROP SCHEMA IF EXISTS finance CASCADE;
  DROP SCHEMA IF EXISTS notification CASCADE;
  DROP SCHEMA IF EXISTS ai_knowledge CASCADE;
"

# Restore dari backup
gunzip -c /tmp/${RESTORE_FILE} | psql -U diis_admin -d diis_db

# Keluar dari container
exit
```

### Langkah 7 — Verifikasi data

```bash
docker exec smk-postgres psql -U diis_admin -d diis_db -c "
  SELECT COUNT(*) AS total_users FROM auth.users;
  SELECT COUNT(*) AS total_students FROM student.students;
  SELECT COUNT(*) AS total_classes FROM academic.classes;
"
```

Output yang diharapkan (nilai mendekati data sebelum disaster):
```
 total_users
-------------
          40

 total_students
----------------
             20

 total_classes
--------------
             10
```

### Langkah 8 — Jalankan kembali service

```bash
docker compose -f /opt/diis/infrastructure/docker/docker-compose.yml start api web n8n metabase
```

### Langkah 9 — Hapus file backup lokal

```bash
rm -f /tmp/${RESTORE_FILE}
docker exec smk-postgres rm -f /tmp/${RESTORE_FILE}
docker exec smk-pg-backup rm -f /tmp/${RESTORE_FILE}
```

---

## Skenario B — Restore Satu Tabel / Schema (Partial Restore)

Gunakan ini jika hanya satu schema/tabel yang korup.

### Download dan extract ke file .sql

```bash
RESTORE_FILE="2026-05-27_19-00.sql.gz"

docker exec smk-pg-backup \
  /opt/backup-bin/mc cp \
  myminio/diis-backup/postgres/${RESTORE_FILE} \
  /tmp/${RESTORE_FILE}

docker cp smk-pg-backup:/tmp/${RESTORE_FILE} /tmp/${RESTORE_FILE}
gunzip /tmp/${RESTORE_FILE}  # → /tmp/2026-05-27_19-00.sql
```

### Ekstrak schema/tabel tertentu

```bash
# Contoh: ekstrak hanya tabel auth.users
grep -A 1000 "COPY auth.users" /tmp/2026-05-27_19-00.sql | grep -B 1 "\\." | head -n -1
```

> Untuk partial restore yang kompleks, pertimbangkan restore ke database sementara:
> ```bash
> createdb -U diis_admin diis_restore
> gunzip -c /tmp/${RESTORE_FILE} | psql -U diis_admin -d diis_restore
> # Lalu copy tabel yang dibutuhkan ke diis_db
> ```

---

## Verifikasi Backup (Rutin)

Jalankan ini setiap minggu untuk memastikan backup bisa di-restore:

```bash
# 1. Cek backup tersedia
docker exec smk-pg-backup \
  /opt/backup-bin/mc ls myminio/diis-backup/postgres/ | tail -5

# 2. Cek ukuran file (harus > 1MB untuk DB yang berisi data)
docker exec smk-pg-backup \
  /opt/backup-bin/mc du myminio/diis-backup/postgres/

# 3. Trigger backup manual untuk test
docker exec smk-pg-backup sh /backup.sh
```

---

## Pemicu Cron (Referensi)

| Jadwal | Waktu |
|--------|-------|
| `0 19 * * *` (UTC) | 02:00 WIB setiap hari |
| Retention | 7 hari (file lebih lama otomatis dihapus) |
| Log | Container log `smk-pg-backup` atau `/var/log/backup.log` di dalam container |

```bash
# Lihat log backup
docker logs smk-pg-backup --tail 50
```

---

## Troubleshooting

### "mc: command not found"

mc belum didownload (container baru start pertama kali):
```bash
docker restart smk-pg-backup
# Tunggu 30 detik, mc akan didownload otomatis
docker logs smk-pg-backup --tail 20
```

### "pg_dump: connection refused"

Container postgres belum siap atau password salah:
```bash
docker compose ps postgres
docker exec smk-pg-backup pg_isready -h postgres -U diis_admin
```

### "ERROR: bucket 'diis-backup' access denied"

Cek environment variable MinIO credentials:
```bash
docker exec smk-pg-backup env | grep MINIO
```

---

*Runbook ini dibuat otomatis oleh Claude Code — FIX-T06 (SMA-27) | 2026-05-27*
