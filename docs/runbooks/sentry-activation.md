# Runbook: Aktivasi Sentry

> Terakhir diperbarui: 2026-06-13 | Versi: 1.0

## Ringkasan

Sentry SDK sudah ter-wire di kode (`apps/api/src/instrument.ts`):
- Env-gated: bila `SENTRY_DSN` kosong → **no-op** (tidak ada error, CI tetap hijau)
- PII scrubbing aktif — header sensitif, body, URL query, dan exception values di-scrub
- Breadcrumbs dimatikan (bisa mengandung PII minor)

Tugasmu (Director): buat Sentry project, isi env, deploy, verifikasi satu error uji.

---

## Langkah 1: Buat Sentry Project

1. Login ke [sentry.io](https://sentry.io) (atau self-hosted Sentry bila ada)
2. Organization → **New Project** → Platform: **Node.js**
3. Nama project: `diis-api` · Environment: `production`
4. Salin **DSN** yang diberikan (format: `https://xxx@yyy.ingest.sentry.io/zzz`)

---

## Langkah 2: Tambahkan SENTRY_DSN ke .env produksi

```bash
# Di VPS, edit .env aktif
nano /home/appuser/smart-ai-school/infrastructure/docker/.env

# Tambahkan baris:
SENTRY_DSN=https://xxx@yyy.ingest.sentry.io/zzz
SENTRY_RELEASE=2K-konsolidasi   # tag rilis untuk mudah identifikasi
```

Kemudian di `docker-compose.yml`, pastikan service `api` menerima env ini (sudah
di-pass via `environment` block sebagai env biasa — tidak perlu perubahan):

```yaml
api:
  environment:
    SENTRY_DSN: ${SENTRY_DSN}
    SENTRY_RELEASE: ${SENTRY_RELEASE}
```

> **Catatan**: Bila belum ada kedua baris ini di `docker-compose.yml`, tambahkan
> ke block `environment` service `api`. Ini adalah additive change.

---

## Langkah 3: Deploy

```bash
cd /home/appuser/smart-ai-school
git pull origin staging   # setelah 2K-konsolidasi di-merge ke staging
docker compose up -d api --build
```

Verifikasi API healthy:
```bash
curl -s http://localhost:3001/health | jq .status
# Output yang diharapkan: "ok"
```

---

## Langkah 4: Kirim error uji — verifikasi muncul di Sentry

Endpoint uji tersedia di `GET /health/sentry-test` (SA only, hanya tersedia bila
`NODE_ENV != production` ATAU direktur menggunakan token SA):

```bash
# Dapatkan token SA dari session (atau gunakan curl dengan cookie session)
curl -H "Authorization: Bearer <SA_TOKEN>" \
  https://api.smkdarussalamsubah.sch.id/api/v1/health/sentry-test
```

Alternatif: panggil endpoint yang belum ada untuk memicu 500 dari middleware, atau
gunakan Sentry SDK `captureException` manual melalui NestJS REPL (mode dev).

**Bukti yang harus dipenuhi:**
- Error uji muncul di Sentry dashboard dalam < 2 menit
- Di detail error: **tidak ada** header `Authorization`, `Cookie`, atau body field
  yang mengandung password/phone/email/NIS
- Environment terbaca `production`
- Release terbaca `2K-konsolidasi`

---

## Perilaku bila SENTRY_DSN Tidak Di-set

Kode `instrument.ts` mengecek:
```typescript
const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({ dsn, ... });
}
```

Bila `SENTRY_DSN` kosong string atau tidak di-set:
- `Sentry.init()` **tidak dipanggil** → SDK no-op
- API tetap berjalan normal
- Log tidak mencatat apa-apa ke Sentry
- CI test tetap hijau (tidak ada dependency Sentry di test)

---

## PII Scrubbing — Apa yang Discrub

File: `apps/api/src/common/sentry.utils.ts`

| Jenis data | Diperlakukan |
|---|---|
| Header `Authorization`, `Cookie`, `X-Api-Key` | Dihapus |
| Body field dengan kata kunci `password`, `phone`, `email`, `nis`, `token` | Nilai diganti `[Filtered]` |
| URL query params yang mengandung kata kunci sensitif | Diganti `[Filtered]` |
| Stack trace exception message | Discan — bila mengandung pola PII (email, nomor HP) diganti |

---

## Troubleshooting

### Error tidak muncul di Sentry

1. Cek `SENTRY_DSN` sudah di-set di env container:
   ```bash
   docker exec smk-api env | grep SENTRY_DSN
   ```
2. Cek log API saat startup — tidak boleh ada error Sentry init
3. Pastikan domain Sentry dapat dijangkau dari VPS:
   ```bash
   curl -s https://yyy.ingest.sentry.io/api/ | head -20
   ```

### Error muncul tapi PII masih ada

1. Cek `beforeSend` di `instrument.ts` — scrubPii harus dipanggil
2. Jalankan unit test scrub:
   ```bash
   npx jest apps/api/src/common/sentry.utils.spec.ts --verbose
   ```
