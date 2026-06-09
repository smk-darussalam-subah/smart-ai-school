# 2B-1 — AuditLog Persisten (tabel + interceptor + read API) — DONE

**Branch:** `feat/2B-1-audit-log`
**PR:** #89 → `develop`
**Tanggal:** 2026-06-09
**Model:** deepseek-v4-pro
**Commit fix:** `1b4112b` — fix(audit): remove unused ZodPipe import to pass lint

---

## Ringkasan Perubahan

### A. Schema — `AuditLog` di schema `audit`

| Tempat | Status |
|---|---|
| `datasource schemas=[...]` | ✅ `"audit"` di `schema.prisma:21` |
| `init-db.sql` | ✅ `CREATE SCHEMA IF NOT EXISTS audit` di baris 21 |
| `init-staging-db.sh` | ✅ `CREATE SCHEMA IF NOT EXISTS audit` di baris 37 |
| `docker-compose.staging.yml` | ✅ `CREATE SCHEMA IF NOT EXISTS audit` di service `db-init-staging` |

Model `AuditLog`: `id` (cuid), `createdAt`, `actorId`, `actorUsername`, `actorRoles` (denormalisasi),
`action`, `resourceType`, `resourceId`, `method`, `path`, `statusCode`, `outcome`, `ip`, `userAgent`,
`metadata` (Json?, PII-minimal). 3 index: `(createdAt)`, `(actorId, createdAt)`, `(resourceType, resourceId)`.

Migration: `20260609000001_2B1_audit_log` — additive CREATE-only.

### B. AuditInterceptor (global, `APP_INTERCEPTOR`)

File: `apps/api/src/audit-log/interceptors/audit.interceptor.ts`

- **Mutasi saja:** POST/PUT/PATCH/DELETE dicatat; GET tidak (volume)
- **@SkipAudit()** untuk endpoint baca audit, /health, /metrics
- **@Audit({ action?, resourceType?, captureBody? })** untuk presisi per-handler
- **Redaksi PII:** denylist field (`password`, `token`, `secret`, `nik`, dll.) → `[REDACTED]`
- **IP klien asli:** `x-forwarded-for` (di belakang proxy) → ambil hop pertama
- **resourceId:** heuristik — POST dari response body `.id`, PATCH/PUT/DELETE dari `params.id`
- **Fail-soft:** `try/catch` di `writeLog()` — kegagalan audit TIDAK menggagalkan request
- **Status success:** POST→201, lainnya→200; failure dari `HttpException.getStatus()` atau 500

### C. Read API — `GET /api/v1/audit-logs`

File: `apps/api/src/audit-log/audit-log.controller.ts`

- `@Roles('SUPER_ADMIN')` — hanya Super Admin
- `@SkipAudit()` — tidak mengaudit pembacaan audit
- Filter Zod: `actorId?`, `resourceType?`, `action?`, `from?`, `to?`, `statusCode?`
- Pagination: `limit` (1-100, default 20), `offset` (≥0, default 0)
- Urut `createdAt desc`

### D. Decorators

File: `apps/api/src/audit-log/decorators/audit.decorator.ts`

- `@Audit(options)` — override action/resourceType/captureBody
- `@SkipAudit()` — exclude dari audit logging

---

## Bukti Runtime

### 1. `tsc --noEmit` + `eslint` + `build`

| Check | Hasil |
|---|---|
| `apps/api: tsc --noEmit` | 0 errors |
| `packages/database: tsc --noEmit` | 0 errors |
| `packages/auth: tsc --noEmit` | 0 errors |
| `apps/api: eslint src --ext .ts` | 0 errors |
| `apps/api: nest build` | OK |
| `packages/database: npm run build` | OK (prisma generate + tsc) |

### 2. Unit Tests — 26/26 pass

```
PASS src/__tests__/audit-log.spec.ts
PASS src/__tests__/audit-interceptor.spec.ts

Test Suites: 2 passed, 2 total
Tests:       26 passed, 26 total
```

**Cakupan test:**
- (a) POST mutasi → `create` dipanggil, field `actorId`/`action`/`outcome`/`resourceId` benar
- (b) GET → `create` TIDAK dipanggil
- (c) `captureBody=true` + field `password` → `[REDACTED]`, field biasa tetap
- (d) `create` throw (DB error) → request tetap sukses (fail-soft)
- PATCH → action `*.update`, resourceId dari `params.id`
- DELETE → action `*.delete`
- `@SkipAudit()` → tidak dicatat meski POST
- Error path: NotFoundException → outcome `"failure"`, statusCode 404
- Anonim → actorId=null, actorRoles=[]
- IP multi-hop → hop pertama diambil

### 3. Full Test Suite — 503/503 pass (29 suites)

### 4. GitHub CI — ALL GREEN

| Job | Hasil | Durasi |
|---|---|---|
| Lint & Type Check | ✅ pass | 1m33s |
| Build Check | ✅ pass | 2m10s |
| Unit Tests | ✅ pass | 2m16s |

### 5. DB verification (staging) ⚠️ PENDING

Docker tidak tersedia di mesin lokal. Perlu diverifikasi dari VPS atau environment dengan Docker:

```bash
docker compose -p smk-staging --env-file .env.staging \
  -f docker-compose.yml -f docker-compose.staging.yml \
  exec db-init-staging bash

# Lalu di dalam container:
psql -d smk_staging_db -c "CREATE SCHEMA IF NOT EXISTS audit;"
psql -d smk_staging_db -c "\dt audit.*"
psql -d smk_staging_db -c "SELECT * FROM audit.audit_log LIMIT 5;"
```

Atau jalankan migration via staging API:
```bash
cd packages/database && DATABASE_URL=<url_staging> npx prisma migrate deploy
```

---

## Trade-off Fail-Soft

**Keputusan:** `writeLog()` fire-and-forget — error log di-swallow, request tetap jalan.

**Justifikasi:**
- 350 user = volume rendah, insert tunggal cukup cepat
- Audit = secondary concern, bukan bisnis utama; kegagalan audit ≠ kegagalan operasi
- Jika perlu jaminan keras (at-most-once/at-least-once) → outbox pattern / BullMQ queue sebagai backlog
- Untuk saat ini, `try/catch` + Sentry/logger cukup

**Alternatif ditunda:** Outbox/queue (backlog → `docs/decision-log.md` bila perlu).

---

## Catatan PII-Minimal

- `actorRoles` denormalisasi → tetap bisa baca role meski user dihapus dari Keycloak
- `metadata` hanya berisi field names + nilai non-sensitif; nilai sensitif → `[REDACTED]`
- Tidak pernah menyimpan: password, token, secret, NIK, kredensial login
- `captureBody` default OFF; bila ON, nested objects direduksi ke `[object]`

---

## Reminder Pasca-Merge

1. **`prisma generate`** di environment staging/prod setelah merge
2. **Deploy via staging** terlebih dahulu, verifikasi `audit.audit_log` terisi
3. Endpoint `GET /api/v1/audit-logs` hanya bisa diakses dengan token Keycloak role SUPER_ADMIN
