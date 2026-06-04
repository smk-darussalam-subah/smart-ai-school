# OBS-1a — Hardening PII Scrub Sentry — DONE

**Branch:** `fix/OBS-1a-scrub-hardening`
**Tanggal selesai:** 2026-06-05
**Model:** Sonnet 4.6

---

## Deliverable

### Backend — `apps/api`

| File | Perubahan |
|------|-----------|
| `src/common/sentry.utils.ts` | EXPANDED — tambah `SentryExceptionValue` interface, `PII_PATTERNS`, `redactPiiFromText()`, `scrubBreadcrumb()`, dan perluasan `scrubPii()` (exception values + URL query-strip) |
| `src/instrument.ts` | MOD — tambah `maxBreadcrumbs: 0` + `beforeBreadcrumb: scrubBreadcrumb` |
| `src/__tests__/sentry.spec.ts` | MOD — +21 test baru (case e, f, g, + redactPiiFromText) |

### Frontend — `apps/web`

| File | Perubahan |
|------|-----------|
| `src/lib/sentry.utils.ts` | EXPANDED — sama dengan API: `PII_PATTERNS_NEXT`, `redactPiiFromTextNext()`, `scrubBreadcrumbNext()`, perluasan `scrubPiiNext()` |
| `sentry.client.config.ts` | MOD — tambah `maxBreadcrumbs: 0` + `beforeBreadcrumb: scrubBreadcrumbNext` |
| `sentry.server.config.ts` | MOD — tambah `maxBreadcrumbs: 0` + `beforeBreadcrumb: scrubBreadcrumbNext` |
| `sentry.edge.config.ts` | MOD — tambah `maxBreadcrumbs: 0` + `beforeBreadcrumb: scrubBreadcrumbNext` |

---

## Arsitektur Perluasan

### PII Patterns (4 pola, konsisten api ↔ web)
| Pola | Target |
|------|--------|
| `/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g` | Email addresses |
| `/(?:\+62\|62\|0)[0-9]{8,12}\b/g` | Nomor HP Indonesia |
| `/\bNIS\s*:?\s*\d{5,20}\b/gi` | NIS berlabel |
| `/\b(?:nama\|fullname\|full_name\|...)\s*[:=]?\s*[A-Za-zÀ-ÿ]..../gi` | Nama berlabel |

### Scrub coverage setelah OBS-1a
| Field | OBS-1 | OBS-1a |
|-------|-------|--------|
| `request.headers` (Auth, Cookie) | ✅ | ✅ |
| `request.data` (body) | ✅ | ✅ |
| `request.cookies` | ✅ | ✅ |
| `request.url` query-string | ❌ | ✅ |
| `exception.values[].value` | ❌ | ✅ |
| Breadcrumbs | ❌ | ✅ (`maxBreadcrumbs: 0` + `beforeBreadcrumb → null`) |

### Env-gating
Tidak berubah — tanpa `SENTRY_DSN`, `Sentry.init()` tidak dipanggil. Semua fungsi scrub tetap pure dan dapat dipanggil tanpa SDK.

---

## Bukti Runtime

### tsc --noEmit
```
apps/api → exit 0 (0 errors)
apps/web → exit 0 (0 errors)
```

### eslint --max-warnings=0
```
apps/api sentry.utils.ts + sentry.spec.ts → exit 0 (0 warnings)
apps/web sentry.utils.ts + sentry.*.config.ts → exit 0 (0 warnings)
```

### jest (sentry.spec.ts — OBS-1a)
```
Tests: 41 passed, 41 total  (+21 dari OBS-1 baseline 20)
sentry.utils.ts coverage: 100% statements | 100% branches | 100% functions | 100% lines
```

Test cases baru yang dibuktikan:
- **(e)** NIS: 9876543210 → `[REDACTED]` ✅
- **(e)** email: siswa.dummy@sekolah.id → `[REDACTED]` ✅
- **(e)** phone: 081298765432 → `[REDACTED]` ✅
- **(e)** fullName: Ahmad Fauzi → `[REDACTED]` ✅
- **(e)** teks tanpa PII → tidak berubah ✅
- **(f)** URL `/api/v1/students?nis=123456` → `/api/v1/students` ✅
- **(g)** `scrubBreadcrumb()` → `null` ✅

### jest (full suite)
```
Test Suites: 25 passed, 25 total
Tests:       432 passed, 432 total
```

---

## Kepatuhan Constraint

- ✅ Env-gated utuh — tanpa SENTRY_DSN tetap no-op
- ✅ Tidak hardcode nilai sekolah — pola regex generik
- ✅ Tidak mengubah perilaku non-PII
- ✅ Pola regex konsisten api ↔ web (tidak duplikasi divergen)
- ✅ Working tree bersih setelah commit

---

*Tunggu review Cowork sebelum merge ke develop.*
