# OBS-1 — Integrasi Sentry Error Monitoring (NestJS + Next.js) — DONE

**Branch:** `feat/OBS-1-sentry`
**Commit:** `7d6eddf`
**Tanggal selesai:** 2026-06-02
**Model:** Sonnet 4.6

---

## Deliverable

### Backend — `apps/api` (`@sentry/nestjs` v10.55.0)

| File | Perubahan |
|------|-----------|
| `src/instrument.ts` | NEW — Sentry.init env-gated + PII scrubber beforeSend |
| `src/common/sentry.utils.ts` | NEW — `scrubPii()` pure function (100% test coverage) |
| `src/main.ts` | MOD — `import './instrument'` sebagai baris pertama |
| `src/common/filters/http-exception.filter.ts` | MOD — `captureException` untuk 5xx + unhandled |
| `src/common/filters/prisma-exception.filter.ts` | MOD — `captureException` untuk unknown Prisma codes |
| `src/config/env.validation.ts` | MOD — SENTRY_DSN + SENTRY_RELEASE optional |
| `src/__tests__/sentry.spec.ts` | NEW — 20 unit tests |

### Frontend — `apps/web` (`@sentry/nextjs`)

| File | Perubahan |
|------|-----------|
| `sentry.client.config.ts` | NEW — browser init env-gated |
| `sentry.server.config.ts` | NEW — Node.js server init env-gated |
| `sentry.edge.config.ts` | NEW — Edge runtime init env-gated |
| `src/instrumentation.ts` | NEW — Next.js 15 register() hook |
| `src/lib/sentry.utils.ts` | NEW — `scrubPiiNext()` mirror backend |
| `next.config.js` | MOD — `withSentryConfig` conditional (only when DSN set) |

### Docs

- `docs/deployment/env-variables.md §11d` — env vars Sentry + PII scrubbing policy

---

## Arsitektur Keputusan

### Filter coexistence
`SentryGlobalFilter` TIDAK dipakai (akan menggantikan `HttpExceptionFilter` + `PrismaExceptionFilter`). Strategi terpilih: tambah `captureException()` selektif di dalam filter existing:
- `HttpExceptionFilter`: capture jika `statusCode >= 500` ATAU bukan `HttpException` (always 5xx)
- `PrismaExceptionFilter`: capture hanya untuk Prisma codes yang tidak dikenal (5xx); P2002/P2003/P2025 (4xx) TIDAK di-capture

### PII Scrubbing (UU PDP — data minor wajib)
`beforeSend` aktif di semua runtime:
- `sendDefaultPii: false`
- Header `Authorization`, `Cookie`, `Set-Cookie`, `X-Api-Key` dihapus
- `request.data` (body) di-redact seluruhnya → `[REDACTED - request body tidak dikirim ke Sentry (UU PDP)]`
- `request.cookies` dikosongkan
- Session replay dimatikan (`replaysSessionSampleRate: 0`)

### Env-gated total
- Tanpa `SENTRY_DSN`: `Sentry.init()` tidak dipanggil. `captureException()` adalah no-op (Sentry SDK by design).
- CI/dev tanpa DSN: semua test hijau, build hijau.

---

## Bukti Runtime

### tsc --noEmit
```
apps/api → exit 0 (0 errors)
apps/web → exit 0 (0 errors)
```

### eslint --max-warnings=0
```
apps/api → exit 0 (0 warnings)
apps/web → exit 0 (0 warnings)
```

### jest (full suite)
```
Test Suites: 25 passed, 25 total
Tests:       411 passed, 411 total  (20 test Sentry baru + 391 existing)
sentry.utils.ts coverage: 100% statements | 100% branches | 100% functions | 100% lines
```

Test cases Sentry:
- **(a)** no-op tanpa DSN: `captureException()` tidak throw, `scrubPii()` berfungsi tanpa init
- **(b)** 5xx: HttpException 500/503 + unhandled Error + unknown Prisma code → captured
- **(c)** 4xx (400/401/403/404/409/422, P2002, P2025) → NOT captured
- **(d)** scrubPii: hapus Authorization/Cookie/Set-Cookie, redact body, kosongkan cookies, immutable

### next build
```
✓ Compiled successfully
✓ Generating static pages (7/7)
Route /dashboard/knowledge ƒ (Dynamic) 4.82 kB — tanpa perubahan ukuran
```

---

## Langkah Uji Pasca-Deploy (dengan DSN asli)

1. **Set env di VPS:**
   ```bash
   # /etc/environment atau docker-compose.yml
   SENTRY_DSN=https://xxx@o123.ingest.sentry.io/456
   SENTRY_RELEASE=$(git rev-parse --short HEAD)
   # Restart api service
   docker compose restart api
   ```

2. **Trigger error test 5xx (pastikan muncul di Sentry):**
   ```bash
   # Panggil endpoint yang throw Error tidak tertangani
   # Atau sementara inject error di route test
   curl -X POST https://api.smkdarussalamsubah.sch.id/api/v1/ai/knowledge \
     -H "Authorization: Bearer <token-sa>" \
     -H "Content-Type: application/json" \
     -d '{"title":"test","content":"test","category":"test"}'
   ```
   Buka Sentry dashboard → Issues → verifikasi error muncul.

3. **Verifikasi PII ter-redaksi di Sentry:**
   - Buka event di Sentry → Request → Headers: `authorization` tidak ada, `content-type` ada
   - Request body: `[REDACTED - request body tidak dikirim ke Sentry (UU PDP)]`
   - Tidak ada `cookies`

4. **Verifikasi 4xx TIDAK muncul di Sentry:**
   - Trigger 422 (publish tanpa embedding): tidak boleh muncul di Sentry Issues

5. **Set Next.js DSN:**
   ```bash
   NEXT_PUBLIC_SENTRY_DSN=https://xxx@o123.ingest.sentry.io/456
   # Rebuild Next.js agar NEXT_PUBLIC_ masuk bundle
   docker compose build web && docker compose up -d web
   ```
   Buka browser → trigger error client-side → verifikasi di Sentry (tanpa session replay).

---

## Keputusan Terbuka

1. **Source map upload:** Belum dikonfigurasi (`SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` tidak di-set). Stack trace di Sentry akan menunjukkan compiled code. Aktifkan di Sprint 4 jika diinginkan.
2. **Performance tracing:** `tracesSampleRate: 0` (off). Aktifkan > 0 jika ingin distributed tracing (tambah overhead kecil per request).
3. **Sentry `onRequestError` Next.js 15:** Export `onRequestError` dari `instrumentation.ts` tidak ditambahkan — membutuhkan import Sentry langsung di file yang tidak boleh ada DSN check. Bisa ditambahkan Sprint 4 jika server error Next.js perlu lebih banyak ditangkap.

---

*Tunggu gerbang review Cowork (keamanan PII + integrasi filter) sebelum merge ke main.*
