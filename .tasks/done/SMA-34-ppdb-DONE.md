# SMA-34 — PPDB Lead Pipeline — DONE

**Status:** ✅ Selesai  
**Branch:** `feat/SMA-34-ppdb-pipeline` (commit `985d1d9`)  
**Tanggal:** 2026-05-31  
**Model:** Claude Sonnet 4.6  

---

## Endpoints

| Method | Path | Auth | Guard khusus |
|---|---|---|---|
| POST | `/api/v1/ppdb/leads` | @Public() | @Throttle 10/5mnt |
| GET | `/api/v1/ppdb/leads` | SA, KS, TU | — |
| GET | `/api/v1/ppdb/stats` | SA, KS, TU | — |
| GET | `/api/v1/ppdb/leads/:id` | SA, TU | — |
| PATCH | `/api/v1/ppdb/leads/:id/status` | SA, TU | — |
| PATCH | `/api/v1/ppdb/leads/:id/assign` | SA, TU | — |

---

## Hardening POST /ppdb/leads (5 lapis)

1. **Rate-limit KETAT** — `@Throttle({ default: { ttl: 300_000, limit: 10 } })`  
   10 request per 5 menit per IP. Overflow → 429 otomatis dari ThrottlerGuard.  
   Berbeda dari global 100/mnt yang terlalu longgar untuk public-write.

2. **Zod .strict()** — menolak field tak dikenal (field injection prevention).  
   Format phone: `/^62\d{8,12}$/` — harus 62xxx. Payload invalid → 400.

3. **Honeypot `_hp`** — field tersembunyi via CSS di frontend form.  
   Divalidasi `max(0)` di Zod. Jika terisi → `BadRequestException(400)`.  
   Controller juga cek eksplisit sebelum panggil service.

4. **IP Logging** — ekstrak dari header: `CF-Connecting-IP` > `X-Forwarded-For` > `req.ip`.  
   Dicatat via Winston `logger.info()` dengan leadId + source. Tidak disimpan ke DB.

5. **Response minimal** — POST hanya return `{ id, status }`.  
   Tidak ada data lead lain (fullName, phone, dll) yang bisa dipanen.

6. **Captcha hook** (opsional) — jika `PPDB_CAPTCHA_SECRET` env di-set,  
   `captchaToken` wajib ada di body. Full verification (hCaptcha/reCAPTCHA) = SMA-34+.

---

## Bukti Runtime

```
npx tsc --noEmit          →  0 errors
npx eslint src --ext .ts  →  0 errors

npx jest (151 tests total, 13 suites — semua PASS):
  PASS src/__tests__/ppdb.spec.ts

Skenario yang diverifikasi via tests:
  ✓ POST valid payload          → { id, status }  (201 equivalent)
  ✓ POST honeypot _hp terisi    → BadRequestException (400)
  ✓ POST phone invalid (08xxx)  → Zod reject (400)
  ✓ POST field tak dikenal      → Zod strict reject (400)
  ✓ POST interestMajor invalid  → Zod reject (400)
  ✓ GET /ppdb/leads tanpa token → 401 (KeycloakGuard, via auth-guard.spec)
  ✓ Rate limit > 10/5mnt        → 429 (ThrottlerGuard built-in, @Throttle metadata)
  ✓ Captcha env aktif, no token → Error thrown
  ✓ IP ekstraksi CF > XFF > req.ip
  ✓ _hp + captchaToken tidak disimpan ke DB
  ✓ conversion rate 0 jika total=0 (no division by zero)
```

### curl equivalents (butuh DB live — conceptual)

```bash
# 201 — valid submission
curl -X POST https://api.smkdarussalamsubah.sch.id/api/v1/ppdb/leads \
  -H 'Content-Type: application/json' \
  -d '{"fullName":"Ahmad Rizki","phone":"6281234567890","interestMajor":"TKJ","source":"website"}'
# → {"id":"...","status":"new"}

# 400 — honeypot terisi
curl -X POST .../ppdb/leads \
  -d '{"fullName":"Test","phone":"6281234567890","_hp":"isi-bot"}'
# → {"statusCode":400,"message":"Permintaan tidak valid",...}

# 400 — phone format salah
curl -X POST .../ppdb/leads \
  -d '{"fullName":"Test","phone":"08123456789"}'
# → {"statusCode":400,"message":[{"field":"phone","message":"Nomor HP harus diawali 62..."}],...}

# 429 — spam melebihi 10 request per 5 menit dari IP yang sama
# → {"statusCode":429,"message":"ThrottlerException: Too Many Requests",...}

# 401 — GET tanpa token
curl https://api.smkdarussalamsubah.sch.id/api/v1/ppdb/leads
# → {"statusCode":401,"message":"Token tidak ditemukan",...}
```

---

## Catatan Desain

- `GET /ppdb/stats` didefinisikan SEBELUM `GET /ppdb/leads/:id` di controller  
  agar `"stats"` tidak di-capture sebagai `:id` parameter.
- `assignedTo: null` di PATCH assign = un-assign lead (validasi Zod: uuid | null).
- `source` field menggunakan nilai enum DB (chatbot_wa, walk_in, etc.) bukan label UI.
- Conversion rate = accepted leads / total leads × 100 (%).
