# Staging Smoke Test — Analysis & Action Plan

**Test Date:** 2026-07-11T07:28:29Z
**Environment:** `https://staging-api.smkdarussalamsubah.sch.id` / `https://staging.smkdarussalamsubah.sch.id`
**Script:** `scripts/smoke-test-staging.ts` (PR #322, merged to `staging`)

---

## Executive Summary

| Metric | Value |
|--------|-------|
| TOTAL | 25 |
| PASS | 5 |
| FAIL | 6 |
| SKIP | 14 |
| Duration | 12.4s |

**Verdict:** Staging environment is **NOT READY for QA**. The staging API is completely inaccessible via public HTTPS due to a missing nginx routing configuration.

---

## 1. Critical Issues

### 1.1 Nginx Staging-API Server Block Not Active (P1-P5 — 5 FAIL)

| Test | Endpoint | Latency | Status | Response |
|------|----------|---------|--------|----------|
| P1 | `GET /health` | 1369ms | 200 | HTML (Next.js) |
| P2 | `GET /metrics` | 2346ms | 200 | HTML (Next.js) |
| P3 | `GET /api/v1/school/profile` | 1138ms | 200 | HTML |
| P4 | `GET /api/v1/school/academic-years/active` | 520ms | 200 | HTML |
| P5 | `GET /api/v1/school/semesters/active` | 558ms | 200 | HTML |

All return HTTP 200 with HTML body — nginx routes requests to `smk-web:3000` (production web) instead of `smk-staging-api:3001`.

### 1.2 SSR Proxy Broken (W3 — 1 FAIL)

| Test | Endpoint | Latency | Status | Response |
|------|----------|---------|--------|----------|
| W3 | `GET /api/backend/school/profile` | 661ms | 200 | HTML (not JSON) |

`smk-staging-web` cannot reach `smk-staging-api` via Docker internal DNS.

---

## 2. Root Cause Analysis

### RCA-A: deploy.yml staging path skips nginx recreation

**File:** `.github/workflows/deploy.yml` lines 157-181

The nginx `--force-recreate` and `smk-staging-net` reconnect steps are gated behind `if [ "$BRANCH" = "main" ]`. Staging branch deploys (line 93-155) handle DB init, Prisma migration, and api/web container restart — but **never recreate nginx**. Therefore the new `staging-api` server block added in `nginx.conf` (PR #322) is never loaded by the running nginx container.

**Evidence:**
- PR #322 merged `staging-api.smkdarussalamsubah.sch.id` server block into `nginx.conf`
- DNS resolves correctly (Cloudflare wildcard CNAME → same IP as prod)
- TCP connects to port 443 (PF1 PASS, 114ms)
- But nginx has no `server_name staging-api.smkdarussalamsubah.sch.id` block loaded → falls through to default server (`smkdarussalamsubah.sch.id` → `smk-web:3000`)

### RCA-B: Docker network isolation for smk-staging-web

**File:** `docker-compose.staging.yml` lines 174-182

The `smk-staging-web` container uses `networks: !override` to restrict to `smk-staging-net` only. The `smk-staging-api` is on both `smk-network` and `smk-staging-net`. If the staging API container is not running or nginx is not on `smk-staging-net`, the web container's SSR fetch fails silently.

---

## 3. Priority Actions

### P0 — Immediate (Blocks all staging QA)

| # | Action | Target | Effort |
|---|--------|--------|--------|
| P0-1 | **Fix deploy.yml** — Add nginx recreate + smk-staging-net reconnect for staging branch | `deploy.yml` | 30 min |
| P0-2 | **Deploy fix** — Merge PR, trigger deploy.yml, verify on VPS | GitHub + VPS | 20 min |
| P0-3 | **Verify staging API container running** — After deploy: `docker ps`, `docker inspect smk-staging-api` | VPS | 5 min |

### P1 — Same Day (Enables authenticated testing)

| # | Action | Target | Effort |
|---|--------|--------|--------|
| P1-1 | **Provision Keycloak test user** — `smoke-test` user with `SUPER_ADMIN` realm role | Keycloak admin | 15 min |
| P1-2 | **Verify token realm roles** — Decode JWT, confirm `realm_access.roles` has `SUPER_ADMIN` | Local | 10 min |

### P2 — Short Term (Complete coverage)

| # | Action | Target | Effort |
|---|--------|--------|--------|
| P2-1 | **Debug Docker network** — Verify `smk-staging-net` has both containers | VPS | 15 min |
| P2-2 | **Seed staging DB permissions** — Run `seed-keycloak-roles.sh` | VPS | 30 min |

---

## 4. Impact Assessment

| Dimension | Status | Blocker |
|-----------|--------|---------|
| Public API access | BLOCKED | P0-1, P0-2 |
| Authenticated API access | BLOCKED | P1-1 |
| RBAC validation | BLOCKED | P1-1 + P2-2 |
| Web frontend | PARTIAL | W3 needs P2-1 |
| Data isolation | UNVERIFIABLE | Needs auth |
| **Overall QA ready** | **NO** | 3 P0 items |

---

## 5. Timeline

```
Phase 1 — Unblock API access (P0)
├── P0-1: Fix deploy.yml staging nginx path      [T+0:30]
├── P0-2: Merge PR + deploy to VPS               [T+0:50]
├── P0-3: Verify staging API container            [T+0:55]
└── Re-run smoke test (expect P1-P5 PASS)         [T+1:00]

Phase 2 — Enable auth testing (P1)
├── P1-1: Provision Keycloak test user            [T+1:15]
├── P1-2: Verify token                            [T+1:25]
└── Re-run smoke test (expect A1, R0 PASS)        [T+1:30]

Phase 3 — Full coverage (P2)
├── P2-1: Debug smk-staging-net (W3 fix)          [T+1:45]
├── P2-2: Seed staging DB                         [T+2:15]
└── Final smoke test (target 22+ PASS)            [T+2:30]

Total: ~2.5 hours
```

---

## 6. Verification Steps

### After P0-2 (deploy fix):
```bash
curl -s https://staging-api.smkdarussalamsubah.sch.id/health | head -c 100
# Expected: {"status":"ok","info":{"database":{"status":"up",...
```

### After P1-1 (Keycloak user):
```bash
# Token must contain realm_access.roles with SUPER_ADMIN
curl -s -X POST "https://auth.smkdarussalamsubah.sch.id/realms/diis/protocol/openid-connect/token" \
  -d "grant_type=password&client_id=diis-web&username=smoke-test&password=..." | jq -r '.access_token' | cut -d. -f2 | base64 -d | jq '.realm_access.roles'
```

### Final full smoke test:
```bash
SMOKE_TEST_USERNAME=smoke-test SMOKE_TEST_PASSWORD=... \
  npm run test:smoke:staging
# Target: 22-25 PASS, 0 FAIL
```
