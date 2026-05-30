# SMA-12 — n8n Workflow (W2-04) DONE

**Branch:** `feat/SMA-12-n8n-workflows`
**Selesai:** 2026-05-30
**Dikerjakan oleh:** Claude Code

---

## File Dibuat

| File | Keterangan |
|---|---|
| `infrastructure/n8n/workflows/health-check.json` | Workflow monitor API /health setiap 5 menit |
| `infrastructure/n8n/workflows/backup-daily.json` | Workflow konfirmasi backup PostgreSQL di MinIO setiap 02:00 WIB |
| `infrastructure/n8n/README.md` | Panduan import, konfigurasi credential, cara tes manual |

## File Diubah

| File | Perubahan |
|---|---|
| `infrastructure/docker/docker-compose.yml` | Tambah `FONNTE_API_KEY` dan `ADMIN_PHONE_NUMBER` ke env service n8n |

---

## Ringkasan Teknis

### health-check.json

- **Trigger:** `scheduleTrigger` — setiap 5 menit.
- **Node Cek API:** `httpRequest GET http://api:3001/health` dengan `neverError: true` dan `onError: continueRegularOutput` — workflow tidak berhenti meski API tidak bisa dijangkau.
- **Node IF `API DOWN?`:** kondisi `$json.status !== "ok"` — output true → notifikasi. Ini mencakup dua kasus: (a) API unreachable (tidak ada field `status`) dan (b) API merespons tapi status bukan "ok".
- **Notifikasi:** `httpRequest POST https://api.fonnte.com/send` — `Authorization` header dari `$env.FONNTE_API_KEY`, nomor target dari `$env.ADMIN_PHONE_NUMBER`.
- **URL health:** `http://api:3001/health` (nama service Docker, bukan localhost; dikecualikan dari prefix `/api/v1`).

### backup-daily.json

- **Trigger:** `scheduleTrigger` cron `0 19 * * *` (19:00 UTC = 02:00 WIB).
- **Peran:** MONITOR konfirmasi — bukan menduplikasi pg_dump. Backup sebenarnya dilakukan oleh service `pg-backup` via `backup.sh`.
- **Node `Siapkan Tanggal`:** Code node JS — hitung prefix tanggal UTC saat ini (`YYYY-MM-DD`) untuk filter query MinIO.
- **Node `Daftar File MinIO`:** `httpRequest GET http://minio:9000/diis-backup?list-type=2&prefix=postgres/{date}&max-keys=10` dengan AWS credential reference (`MinIO Backup Credentials`) — n8n menangani Signature V4 secara otomatis. Response format `text` agar dapat diparsing regex.
- **Node `Cek Ada Backup?`:** Code node JS — parse XML response MinIO via regex, ekstrak `KeyCount`, ukuran file (`Size`), dan nama file (`Key`).
- **Node IF `Backup Ada?`:** kondisi `$json.backupFound === true` — true → Notif OK, false → Notif GAGAL.
- **Notifikasi:** dua node Fonnte terpisah — "Backup OK" dengan info nama file + ukuran, "Backup GAGAL" dengan instruksi cek `pg-backup`.
- **Credential:** `aws` (MinIO) — ID placeholder `REPLACE_WITH_CREDENTIAL_ID`, harus diganti setelah import.

### Constraints yang Dipenuhi

- Tidak ada secret hardcoded: semua token/password via `$env.*` atau credential reference.
- URL health-check menggunakan `http://api:3001/health` (Docker internal network, bukan localhost).
- backup-daily berperan sebagai MONITOR, bukan duplikasi pg_dump.
- JSON valid: `node -e "JSON.parse(...)"` → OK untuk kedua file.

---

## Bukti Runtime

```
# 1) Validasi JSON
$ node -e "JSON.parse(require('fs').readFileSync('infrastructure/n8n/workflows/health-check.json','utf8')); console.log('OK health-check.json')"
OK health-check.json

$ node -e "JSON.parse(require('fs').readFileSync('infrastructure/n8n/workflows/backup-daily.json','utf8')); console.log('OK backup-daily.json')"
OK backup-daily.json

# 2) Cek tidak ada secret hardcoded
$ grep -riE "(token|password|secret|api_key)" infrastructure/n8n/workflows/ | grep -v '\$env\.' | grep -v 'REPLACE_WITH_CREDENTIAL_ID' | grep -v '"notes"'
(output kosong = tidak ada secret hardcoded di luar $env.* / credential reference)
```

**Catatan:** Verifikasi import n8n + trigger manual tidak bisa dilakukan karena n8n tidak jalan di environment lokal pengembangan (berjalan di VPS via Docker). Langkah import dan test manual sudah didokumentasikan di `infrastructure/n8n/README.md`.

---

## Langkah Import di VPS

1. SSH ke VPS, buka https://n8n.smkdarussalamsubah.sch.id
2. Tambah env vars ke `.env` di VPS: `FONNTE_API_KEY=` dan `ADMIN_PHONE_NUMBER=`
3. Restart service n8n: `docker compose -f infrastructure/docker/docker-compose.yml up -d n8n`
4. Di n8n UI: Workflows → Import from File → pilih `health-check.json`
5. Di n8n UI: Workflows → Import from File → pilih `backup-daily.json`
6. Setup credential `MinIO Backup Credentials` (AWS type, endpoint: http://minio:9000)
7. Di workflow backup-daily: klik node `Daftar File MinIO` → pilih credential `MinIO Backup Credentials`
8. Aktifkan kedua workflow (toggle Active → ON)

---

## Pertanyaan / Catatan untuk Kang Sholah

1. **Timing backup-daily:** Cron `0 19 * * *` di n8n dan `pg-backup` berjalan bersamaan. Jika database besar dan dump butuh > 1 menit, n8n mungkin memeriksa sebelum backup selesai (false alarm). Rekomendasi: ubah n8n cron ke `15 19 * * *` di workflow setelah import.
2. **Fonnte sender number:** Pastikan `FONNTE_SENDER_NUMBER` di `.env` sudah terdaftar dan aktif di dashboard Fonnte (field ini dipakai sebagai pengirim WA, berbeda dengan `ADMIN_PHONE_NUMBER` yang adalah tujuan).
3. **n8n di production:** Saat ini n8n tidak ada volume mount untuk folder workflows — import dilakukan via UI dan tersimpan di PostgreSQL schema `n8n`. File JSON di repo ini adalah source of truth untuk re-import jika n8n di-reset.
