# N22 — Web Auth Env Fix — DONE

**Tanggal:** 2026-06-06  
**Branch:** `fix/N22-web-auth-env`  
**PR:** #65 → develop  
**Severity:** BLOCKER PRODUKSI (login gagal, session tidak terbentuk)

---

## Root Cause

Service `web` di `docker-compose.yml` tidak punya env vars server-side yang
dibutuhkan next-auth + api client. Di container produksi:

| Var | Efek tanpa nilai |
|-----|-----------------|
| `NEXTAUTH_SECRET` | Session JWT tidak bisa di-sign → semua request unauthenticated |
| `KEYCLOAK_ISSUER` | `auth.ts` gagal init KeycloakProvider, refresh token 500 |
| `KEYCLOAK_CLIENT_ID` | KeycloakProvider tidak terkonfigurasi |
| `KEYCLOAK_CLIENT_SECRET` | Handshake OAuth2 gagal |
| `NEXTAUTH_URL` | Callback URL salah setelah redirect Keycloak |
| `API_URL` | `api.ts` fallback ke `http://localhost:3001` (tidak exist di container) |

---

## Fix — `infrastructure/docker/docker-compose.yml`

Tambah ke blok `environment:` service `web`:

```yaml
# Next-Auth server-side (N22) — JANGAN NEXT_PUBLIC_ untuk secret
NEXTAUTH_URL: https://smkdarussalamsubah.sch.id        # literal, bukan secret
NEXTAUTH_SECRET: ${NEXTAUTH_SECRET}                     # secret via ${}
KEYCLOAK_ISSUER: https://auth.smkdarussalamsubah.sch.id/realms/diis  # literal
KEYCLOAK_CLIENT_ID: diis-web                            # literal, bukan secret
KEYCLOAK_CLIENT_SECRET: ${KEYCLOAK_WEB_CLIENT_SECRET}  # secret via ${}
API_URL: https://api.smkdarussalamsubah.sch.id          # literal
```

## Security Checklist

- [x] Secrets hanya via `${}` — tidak ada nilai hardcode
- [x] Tidak ada `NEXT_PUBLIC_` untuk `NEXTAUTH_SECRET` atau `KEYCLOAK_CLIENT_SECRET`
- [x] `KEYCLOAK_WEB_CLIENT_SECRET` sudah ada di `.env` VPS (dari setup Keycloak)
- [x] `NEXTAUTH_SECRET` sudah ada di `.env` VPS (dari initial setup)

---

## Bukti Runtime

- **`next build` sukses** — 10 routes, compiled 4.5s
- **`tsc --noEmit`** → 0 error
- **`next lint`** → 0 error/warning

---

## DoD Checklist

- [x] tsc 0 · eslint 0 · next build ✓
- [x] Secret tidak di-commit (hanya `${}`)
- [x] Branch `fix/N22-web-auth-env` dari develop
- [x] PR #65 → develop terbuka
- [x] Done report ini
- [ ] CI hijau setelah merge
- [ ] Staging: login → redirect Keycloak → `/dashboard` terbuka
- [ ] Main: promote setelah staging verified
