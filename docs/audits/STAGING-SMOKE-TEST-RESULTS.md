# Staging Smoke Test — Analysis & Action Plan

**Latest Test Date:** 2026-07-11T13:48:17Z (Post-PR #329 deploy)
**Environment:** `https://staging-api.smkdarussalamsubah.sch.id` / `https://staging.smkdarussalamsubah.sch.id`
**Script:** `scripts/smoke-test-staging.ts` (PR #322)

---

## Executive Summary — Latest Run

| Metric | Run 1 (Pre-fix) | Run 3 (Post W3 fix) | Delta |
|--------|-----------------|---------------------|-------|
| Date | 2026-07-11T07:28:29Z | 2026-07-11T13:48:17Z | — |
| TOTAL | 25 | 25 | — |
| PASS | 5 | **11** | **+6** |
| FAIL | 6 | **0** | **-6** |
| SKIP | 14 | 14 | — |
| Duration | 12.4s | 8.9s | -3.5s |

**Verdict:** ALL non-auth tests PASS (11/11). Zero failures. 14 SKIPs require Keycloak test user provisioning on VPS.

---

## 1. Critical Issues — Current State

### 1.1 RESOLVED: Nginx Staging-API Server Block (P1-P5 — 5 PASS)

Fixed via PR #324 — nginx recreate from prod context + copy staging `nginx.conf`.

### 1.2 RESOLVED: SSR Proxy (W3 — now PASS)

**Root cause chain (3 issues discovered sequentially):**

1. **Build-time freeze**: Next.js standalone mode freezes `rewrites()` destination into `routes-manifest.json` at build time. The Dockerfile `ARG API_URL=http://api:3001` (prod default) was baked in. PR #326 added `--build-arg` to deploy.yml; PR #327 added `build.args` to compose — but neither reached the Dockerfile.

2. **Middleware redirect**: The real blocker was the Next.js middleware (`middleware.ts`) intercepting `/api/backend/*` requests and redirecting to `/login` (HTML 307) because `/api/backend` was not in `PUBLIC_PREFIXES`.

**Final fix (PR #328 + #329):**
- PR #328: Created runtime catch-all route handler at `app/api/backend/[...path]/route.ts` that reads `process.env.API_URL` at runtime (not build time)
- PR #329: Added `/api/backend` to middleware `PUBLIC_PREFIXES` so the proxy route handler can process requests without auth redirect

### 1.3 REMAINING: 14 Auth Tests SKIP

All tests A1, R0-R9, I1-I2, P6 are SKIP because `SMOKE_TEST_USERNAME` / `SMOKE_TEST_PASSWORD` environment variables are not set (no Keycloak test user provisioned).

**Discovery:** `realm-diis.json` has `directAccessGrantsEnabled: false` for BOTH `diis-web` and `diis-api` clients — password grant won't work even with a test user. Solution: `scripts/provision-smoke-test.sh` creates dedicated `smoke-test` client with `directAccessGrantsEnabled=true`.

---

## 2. Next Steps — Unlock Authenticated Tests

### 2.1 Provision Keycloak Test User (VPS Manual Step)

SSH to VPS and run:
```bash
cd /opt/diis-staging/smart-ai-school
./scripts/provision-smoke-test.sh
```

This creates:
- Client `smoke-test` with `directAccessGrantsEnabled=true`
- User `smoke-test` with `SUPER_ADMIN` realm role

### 2.2 Re-run Smoke Test with Auth

```bash
export SMOKE_TEST_USERNAME=smoke-test
export SMOKE_TEST_PASSWORD=<password dari step 2.1>
export STAGING_API_URL=https://staging-api.smkdarussalamsubah.sch.id
export STAGING_WEB_URL=https://staging.smkdarussalamsubah.sch.id
export KEYCLOAK_URL=https://auth.smkdarussalamsubah.sch.id
npx ts-node --project apps/api/tsconfig.json scripts/smoke-test-staging.ts
```

**Target: 22-25 PASS, 0 FAIL** (A1, R0-R9, I1-I2 should all PASS after provisioning).

---

## 3. PR Summary — Fixes Applied

| PR | Title | Fix |
|----|-------|-----|
| #322 | feat: staging smoke test script | Initial smoke test script |
| #323 | fix: deploy.yml nginx staging | Removed `if main` guard for nginx recreate |
| #324 | fix: nginx recreate from prod context | Copy nginx.conf to prod dir + recreate from prod compose |
| #325 | fix: smoke test client_id + provisioning | `client_id: 'smoke-test'` + `provision-smoke-test.sh` |
| #326 | fix: deploy build-arg API_URL | `--build-arg API_URL` for staging (didn't work alone) |
| #327 | fix: compose build.args API_URL | `build.args` in compose override (didn't work alone) |
| #328 | fix: runtime API backend proxy | Route handler at `/api/backend/[...path]` |
| #329 | fix: middleware PUBLIC_PREFIXES | Added `/api/backend` to bypass auth redirect |

---

## 2. Root Cause Analysis — Remaining Failures

### RCA-W3: Docker network connectivity (`smk-staging-net`)

**File:** `docker-compose.staging.yml` lines 174-182

The `smk-staging-web` container uses `networks: !override` to restrict to `smk-staging-net` only. The `smk-staging-api` is on both `smk-network` and `smk-staging-net`. The SSR proxy (`/api/backend/:path*` rewrite to `http://smk-staging-api:3001/api/v1/:path*`) depends on DNS resolution within `smk-staging-net`.

**Possible causes (must be verified on VPS):**
1. `smk-staging-web` container was recreated but lost connection to `smk-staging-net`
2. `smk-staging-api` container is not on `smk-staging-net` after deploy
3. `smk-staging-api` container is running but not healthy

**Verification command (requires SSH to VPS):**
```bash
docker network inspect smk-staging-net --format '{{range .Containers}}{{.Name}} {{end}}'
# Expected: smk-staging-api smk-staging-web smk-nginx
```

### RCA-SKIP: No Keycloak test user

The smoke test uses `password` grant (not `client_credentials` — see plan §Keycloak Prasyarat). No test user has been provisioned in the Keycloak `diis` realm with `SUPER_ADMIN` realm role.

---

## 3. Priority Actions — Updated

### P0 — COMPLETED

| # | Action | Status | PR |
|---|--------|--------|-----|
| P0-1 | Fix deploy.yml staging nginx path | **DONE** | #323 |
| P0-2 | Fix container name conflict (prod context recreate) | **DONE** | #324 |
| P0-3 | Deploy and verify P1-P5 PASS | **DONE** | Deploy 2026-07-11T08:27:19Z |

### P1 — Immediate (Blocks authenticated QA)

| # | Action | Target | Effort | Status |
|---|--------|--------|--------|--------|
| P1-1 | **Provision Keycloak test user** — Create `smoke-test` user in realm `diis` with `SUPER_ADMIN` realm role via Keycloak admin console | Keycloak (`https://auth.smkdarussalamsubah.sch.id`) | 15 min | PENDING |
| P1-2 | **Verify token** — Obtain JWT via password grant, decode at jwt.io, confirm `realm_access.roles` includes `SUPER_ADMIN` | Local | 10 min | PENDING |
| P1-3 | **Re-run smoke test with creds** — `SMOKE_TEST_USERNAME=smoke-test SMOKE_TEST_PASSWORD=... npm run test:smoke:staging` | Local | 5 min | PENDING |

### P2 — Short Term (Complete coverage)

| # | Action | Target | Effort | Status |
|---|--------|--------|--------|--------|
| P2-1 | **Debug Docker network** — SSH to VPS, inspect `smk-staging-net`, verify both containers attached | VPS | 15 min | PENDING |
| P2-2 | **Fix W3 SSR proxy** — Based on P2-1 findings, may need `docker network connect` or compose fix | VPS/code | 30 min | PENDING |
| P2-3 | **Seed staging DB** — Run `seed-keycloak-roles.sh` to ensure RBAC permission mapping | VPS | 30 min | PENDING |
| P2-4 | **Get kiosk token** — `GET /api/v1/school/kiosk-link` with SUPER_ADMIN token for P6 | API | 10 min | PENDING |

---

## 4. Impact Assessment — Updated

| Dimension | Run 1 Status | Run 2 Status | Blocker |
|-----------|-------------|-------------|---------|
| Public API access | BLOCKED | **WORKING** | None — P1-P5 all PASS |
| Authenticated API access | BLOCKED | BLOCKED | P1-1 (Keycloak user) |
| RBAC validation | BLOCKED | BLOCKED | P1-1 + P2-3 (permission seed) |
| Web frontend | PARTIAL | PARTIAL | P2-2 (W3 SSR proxy) |
| Data isolation | UNVERIFIABLE | UNVERIFIABLE | Needs auth (I1/I2) |
| **Overall QA ready** | **NO** | **PARTIAL** | P1-1 + P2-1 |

**Bottom line:** Staging public API layer is now functional. QA can begin testing public endpoints and web frontend immediately. Authenticated testing requires Keycloak user provisioning (~15 min).

---

## 5. Timeline — Updated

```
Phase 1 — Unblock API access (P0)                    [COMPLETED]
├── P0-1: Fix deploy.yml staging nginx path          [DONE - PR #323]
├── P0-2: Fix container name conflict                [DONE - PR #324]
├── P0-3: Deploy and verify                          [DONE - 08:27Z]
└── Re-run smoke test (P1-P5 PASS)                   [DONE - 10 PASS]

Phase 2 — Enable auth testing (P1)                   [NEXT - T+0:30]
├── P1-1: Provision Keycloak test user               [T+0:15]
├── P1-2: Verify token realm roles                   [T+0:25]
└── P1-3: Re-run smoke test with creds               [T+0:30]

Phase 3 — Full coverage (P2)                         [T+1:15]
├── P2-1: Debug smk-staging-net (SSH VPS)            [T+0:15]
├── P2-2: Fix W3 SSR proxy                           [T+0:45]
├── P2-3: Seed staging DB permissions                [T+1:15]
├── P2-4: Get kiosk token                            [T+1:25]
└── Final smoke test (target 22+ PASS)               [T+1:30]

Remaining estimated time: ~1.5 hours
```

---

## 6. Verification Steps

### After P1-1 (Keycloak user provisioned):
```bash
# Verify token contains realm_access.roles with SUPER_ADMIN
curl -s -X POST "https://auth.smkdarussalamsubah.sch.id/realms/diis/protocol/openid-connect/token" \
  -d "grant_type=password&client_id=diis-web&username=smoke-test&password=<password>"
# Decode JWT payload at jwt.io — realm_access.roles must include "SUPER_ADMIN"
```

### After P2-1 (Docker network debug):
```bash
# On VPS via SSH:
docker network inspect smk-staging-net --format '{{range .Containers}}{{.Name}} {{end}}'
# Must show: smk-staging-api smk-staging-web smk-nginx

# If smk-staging-web missing from network:
docker network connect smk-staging-net smk-staging-web

# Test SSR proxy from web container:
docker exec smk-staging-web curl -s http://smk-staging-api:3001/health
# Expected: {"status":"ok",...}
```

### After all fixes — Full smoke test:
```bash
cd smart-ai-school
SMOKE_TEST_USERNAME=smoke-test \
SMOKE_TEST_PASSWORD=<password> \
SMOKE_KIOSK_TOKEN=<token> \
npm run test:smoke:staging
# Target: 22-25 PASS, 0 FAIL
```

---

## 7. PR Delivery Log

| PR | Title | Status | Impact |
|----|-------|--------|--------|
| #322 | Smoke test script + nginx staging-api server block | MERGED | Script + nginx config |
| #323 | Recreate nginx on ALL branches (v1) | MERGED | Caused container conflict |
| #324 | Recreate nginx from prod context + copy staging nginx.conf | MERGED | **Fixed P1-P5** |

## 8. Full Test Results — Latest Run (2026-07-11T08:33:30Z)

| # | Test | Status | Latency | Detail |
|---|------|--------|---------|--------|
| PF1 | TCP connect | PASS | 169ms | `staging-api.smkdarussalamsubah.sch.id:443` |
| PF2 | JWKS reachability | PASS | 2328ms | `jwks_uri` present |
| PF3 | Environment validation | PASS | — | `KEYCLOAK_URL` OK |
| P1 | `GET /health` | **PASS** | 953ms | `status=ok` |
| P2 | `GET /metrics` | **PASS** | 264ms | Prometheus format |
| P3 | `GET /api/v1/school/profile` | **PASS** | 299ms | `status=200` |
| P4 | `GET /api/v1/school/academic-years/active` | **PASS** | 260ms | `status=200` |
| P5 | `GET /api/v1/school/semesters/active` | **PASS** | 246ms | `status=200` |
| P6 | `GET /api/v1/public/kiosk` | SKIP | — | `SMOKE_KIOSK_TOKEN` not set |
| A1 | Keycloak token (password grant) | SKIP | — | No test user creds |
| R0 | `GET /api/v1/auth/me` | SKIP | — | A1 skipped |
| R1-R9 | Authenticated endpoints (9 tests) | SKIP | — | A1/R0 skipped |
| I1 | `/auth/me` DB origin check | SKIP | — | No auth token |
| I2 | Students count sanity | SKIP | — | No auth token |
| W1 | `GET /` (homepage) | PASS | 1569ms | HTML returned |
| W2 | `GET /auth/login` | PASS | 1256ms | Login page rendered |
| W3 | `GET /api/backend/school/profile` | **FAIL** | 598ms | HTML — SSR proxy not forwarding to staging API |