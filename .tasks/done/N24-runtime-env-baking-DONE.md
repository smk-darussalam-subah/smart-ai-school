# N24 — Runtime Env Baking Fix — DONE

**Tanggal:** 2026-06-06
**Branch:** `fix/N24-runtime-env-baking`
**PR:** → develop
**Severity:** BLOCKER PRODUKSI (redirect_uri salah → login gagal)

---

## Root Cause

### Bug 1 — `NEXTAUTH_URL` ter-bake sebagai `http://localhost:3000` (akar utama)

`apps/web/next.config.js` punya blok `env:`:
```js
env: {
  NEXTAUTH_URL: process.env.NEXTAUTH_URL || 'http://localhost:3000',
},
```

`env:` di `next.config.js` di-**bake ke bundle saat `next build`**, bukan dibaca runtime.
Saat Docker image dibangun di CI/VPS, `NEXTAUTH_URL` tidak di-set → fallback ter-bake permanen
sebagai `http://localhost:3000` di dalam image.

Efek: next-auth selalu mengirim `redirect_uri=http://localhost:3000/api/auth/callback/keycloak`
ke Keycloak. Menambah URI di Keycloak admin console tidak membantu karena masalah ada di image,
bukan di Keycloak config.

### Bug 2 — Rewrite destination ter-bake sebagai `http://localhost:3001`

`rewrites()` di `next.config.js` menggunakan `process.env.API_URL || 'http://localhost:3001'`
sebagai destination. Next.js standalone **membekukan `routes-manifest.json` saat `next build`** —
file ini tidak di-evaluasi ulang saat container start.

Saat Docker build, `API_URL` tidak tersedia (tidak ada `ARG` di Dockerfile) →
rewrite destination baked sebagai `http://localhost:3001` → `/api/backend/*` proxy
di `health/page.tsx` gagal di production (localhost tidak exist di container web).

---

## Fix

### 1. `apps/web/next.config.js` — Hapus blok `env:`

```diff
-  env: {
-    NEXTAUTH_URL: process.env.NEXTAUTH_URL || 'http://localhost:3000',
-  },
```

next-auth membaca `NEXTAUTH_URL` langsung dari `process.env` di runtime.
Tidak perlu (dan tidak boleh) di-bake via `env:` block.

### 2. `apps/web/Dockerfile` — Tambah `ARG API_URL` sebelum `next build`

```dockerfile
ARG API_URL=http://api:3001
ENV API_URL=${API_URL}

RUN cd apps/web && npx next build
```

- Default `http://api:3001` = Docker internal service name → benar untuk produksi
- Rewrite destination ter-bake sebagai URL internal Docker (efisien, tanpa roundtrip publik)
- Runtime `API_URL=https://api.smkdarussalamsubah.sch.id` (dari docker-compose) tetap
  override untuk `lib/api.ts` server-side calls di runtime
- Local dev (`next dev`): `process.env.API_URL` dibaca langsung dari `.env.local` (tidak frozen)

### 3. `.dockerignore` (root repo) — Baru

Mencegah file dev mengotori build context:
- `**/.env.local`, `**/.env*.local` — secrets lokal tidak masuk image
- `**/node_modules` — tidak perlu di-copy (di-install ulang via `npm ci`)
- `**/.next`, `**/dist` — artifact stale tidak masuk build
- `.git`, `.gitignore` — metadata git tidak dibutuhkan

---

## Alur Env Vars Setelah Fix

| Var | Sumber | Kapan dibaca | Dipakai oleh |
|-----|--------|--------------|-------------|
| `NEXTAUTH_URL` | docker-compose `environment:` | Runtime | next-auth (session, callback URL) |
| `API_URL` (build) | Dockerfile `ARG API_URL=http://api:3001` | Build-time | `rewrites()` destination di routes-manifest |
| `API_URL` (runtime) | docker-compose `environment:` | Runtime | `lib/api.ts` server-side fetch |

---

## Bukti Runtime

- **`next build`**: diverifikasi CI setelah merge ke develop
- **Konfirmasi tidak ada baking localhost**: `grep -r 'localhost:3000' .next/standalone/`
  harus kosong setelah build dengan fix ini
- **`tsc --noEmit`**: 0 error (tidak ada perubahan TypeScript)
- **`eslint`**: 0 error (hanya perubahan config/Dockerfile)

---

## DoD Checklist

- [x] `env:` block dihapus dari `next.config.js`
- [x] `ARG API_URL=http://api:3001` ditambah ke Dockerfile sebelum `next build`
- [x] `.dockerignore` dibuat di root repo
- [x] Tidak ada secret di-commit
- [x] Done report ini
- [ ] CI hijau setelah merge ke develop
- [ ] Staging: rebuild + login → redirect Keycloak → `/dashboard` terbuka
- [ ] Main: promote setelah staging verified
