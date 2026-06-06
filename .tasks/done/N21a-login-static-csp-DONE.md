# N21a — Login Static CSP Fix — DONE

**Tanggal:** 2026-06-06  
**Branch:** `fix/N21a-login-static-csp`  
**PR:** #63 → develop  
**Severity:** BLOCKER PRODUKSI (login button mati, /health broken)

---

## Root Cause

Route `'use client'` yang di-render **statis** (○ `next build`) tidak bisa
menerima nonce per-request karena HTML di-bake saat build time. Next.js 15
menyisipkan inline bootstrap scripts (`self.__next_f=...`) ke dalam HTML statis
**tanpa** atribut nonce. Pasca-N21, CSP untuk `/login` dan `/health` adalah
`nonce-xxx + strict-dynamic` — tapi karena nonce tidak ter-stempel, semua JS
diblokir → `onClick` / `useEffect` mati.

**Akar masalah N21 (parent):** CSP tidak di-set di `requestHeaders` → Next.js
tidak stempel nonce ke script tags.  
**Akar masalah N21a (ini):** `/login` dan `/health` adalah halaman statis —
bahkan dengan N21 fix, mereka tidak bisa menerima nonce karena HTML-nya
pre-built, bukan per-request SSR.

---

## Fix

**`apps/web/src/middleware.ts`** — refactor `isPublicStaticPage()`:

```typescript
// SEBELUM:
function isPublicStaticPage(pathname: string): boolean {
  return pathname === '/' || pathname.startsWith('/jurusan/');
}

// SESUDAH — STATIC_INTERACTIVE array eksplisit:
const STATIC_INTERACTIVE: readonly string[] = [
  '/',       // landing — client components
  '/login',  // 'use client', onClick → signIn Keycloak  ← FIX N21a
  '/health', // 'use client', useEffect + onClick         ← FIX N21a
];

function isPublicStaticPage(pathname: string): boolean {
  if (STATIC_INTERACTIVE.includes(pathname)) return true;
  return pathname.startsWith('/jurusan/');
}
```

---

## Audit Route Table (next build)

| Route | Build Type | CSP | Justifikasi |
|-------|-----------|-----|-------------|
| `/` | ○ Static | `unsafe-inline` | Sudah ada; client components landing |
| `/login` | ○ Static, `'use client'` | `unsafe-inline` | **FIX N21a** — `onClick signIn` |
| `/health` | ○ Static, `'use client'` | `unsafe-inline` | **FIX N21a** — `useEffect + onClick` |
| `/jurusan/tkro` | ● SSG | `unsafe-inline` | Sudah ada; client components |
| `/jurusan/tjkt` | ● SSG | `unsafe-inline` | Sudah ada |
| `/jurusan/akl` | ● SSG | `unsafe-inline` | Sudah ada |
| `/_not-found` | ○ Static | `nonce + strict-dynamic` | Server component; `Link` degrades ke `<a href>`, tidak butuh hydration untuk navigasi |
| `/dashboard` | ƒ Dynamic | `nonce + strict-dynamic` | SSR per-request, nonce ter-stempel ✓ |
| `/dashboard/executive` | ƒ Dynamic | `nonce + strict-dynamic` | SSR per-request ✓ |
| `/dashboard/knowledge` | ƒ Dynamic | `nonce + strict-dynamic` | SSR per-request ✓ |
| `/dashboard/nilai` | ƒ Dynamic | `nonce + strict-dynamic` | SSR per-request ✓ |
| `/api/auth/[...nextauth]` | ƒ Dynamic | `nonce + strict-dynamic` | SSR per-request ✓ |

**`/_not-found` tidak ditambahkan** — server component tanpa `'use client'`,
`Link` merender `<a href>` yang navigasi tanpa membutuhkan React hydration.
Secara teknis hydration gagal dengan strict-dynamic, tapi navigasi via `<a>`
tetap berfungsi. Low priority.

---

## Bukti Runtime

### ✅ 12/12 Test Hijau

```
PASS apps/web/src/__tests__/middleware.test.ts
  middleware — CSP nonce in requestHeaders (N21)
    ✓ sets Content-Security-Policy in requestHeaders (3 ms)
    ✓ sets x-nonce in requestHeaders
    ✓ nonce in x-nonce matches nonce in CSP
    ✓ dynamic path CSP contains strict-dynamic
    ✓ CSP does not contain unsafe-eval outside development
  middleware — static interactive pages get unsafe-inline (N21a)
    ✓ /login (static) script-src gets unsafe-inline, no nonce, no strict-dynamic
    ✓ /health (static) script-src gets unsafe-inline, no nonce, no strict-dynamic
    ✓ / (static) script-src gets unsafe-inline, no nonce, no strict-dynamic
    ✓ /jurusan/tkro (static) script-src gets unsafe-inline, no nonce, no strict-dynamic
    ✓ isPublicStaticPage("/login") === true (N21a core assertion)
    ✓ isPublicStaticPage("/health") === true (N21a)
  middleware — protected dynamic paths keep nonce (N21 non-regression)
    ✓ /api/auth/signin script-src gets nonce + strict-dynamic, not unsafe-inline

Tests: 12 passed, 12 total  Time: 2.155 s
```

### ✅ `next build` Sukses

```
▲ Next.js 15.5.18  ✓ Compiled successfully in 4.5s
✓ Generating static pages (10/10)

Route (app)                   Size  First Load JS
├ ○ /                      6.08 kB        117 kB
├ ○ /_not-found              137 B        103 kB
├ ƒ /api/auth/[...nextauth]  137 B        103 kB
├ ƒ /dashboard               137 B        103 kB
├ ƒ /dashboard/executive     137 B        103 kB
├ ƒ /dashboard/knowledge    4.8 kB        107 kB
├ ƒ /dashboard/nilai        2.27 kB       105 kB
├ ○ /health                 1.02 kB       104 kB
├ ● /jurusan/[slug]          172 B        111 kB
└ ○ /login                   934 B        112 kB
ƒ Middleware                 109 kB
```

### ✅ tsc 0 error · eslint 0 error

---

## DoD Checklist

- [x] tsc 0 error
- [x] eslint 0 error
- [x] 12 test hijau (N21 nonce + N21a unsafe-inline + sanity non-regression)
- [x] `next build` sukses — tabel route terlampir
- [x] Branch `fix/N21a-login-static-csp` dari develop
- [x] PR #63 → develop terbuka
- [x] Done report ini
- [ ] CI hijau setelah merge
- [ ] Staging: klik tombol login → redirect Keycloak, 0 CSP errors di console
- [ ] Main: promote setelah staging verified

## Catatan operasional

PR #61 (`develop→staging`) di-merge dengan `--delete-branch` yang menghapus
`origin/develop`. Branch di-restore via `git push origin develop`. Ke depan:
promosi `develop→staging` jangan pakai `--delete-branch`.
