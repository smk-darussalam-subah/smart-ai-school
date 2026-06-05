# N21 — CSP Nonce Request Header Fix — DONE

**Tanggal:** 2026-06-06  
**Branch:** `fix/N21-csp-nonce-request-header`  
**PR:** #60 → develop  
**Severity:** BLOCKER PRODUKSI (JS diblokir CSP → login & dashboard mati)

---

## Root Cause

`middleware.ts` mengeset `x-nonce` di `requestHeaders` tapi **tidak** mengeset
`Content-Security-Policy` di `requestHeaders`. Next.js 15 membaca CSP dari
**request headers** (bukan hanya response headers) saat SSR untuk mengetahui
nonce yang harus di-stempel ke `<script>` tags. Tanpa ini, semua JS diblokir
oleh CSP strict-dynamic karena script tags tidak punya atribut `nonce`.

---

## Fix

**`apps/web/src/middleware.ts`** — 1 baris ditambahkan:

```typescript
// SEBELUM (hanya x-nonce):
requestHeaders.set('x-nonce', nonce);

// SESUDAH (+ CSP ke requestHeaders — pola resmi Next.js 15):
requestHeaders.set('x-nonce', nonce);
requestHeaders.set('Content-Security-Policy', csp);  // ← FIX N21
```

Posisi: setelah `requestHeaders.set('x-nonce', nonce)`, sebelum `getToken()`.

CSP tidak dilonggarkan — strict-dynamic + nonce tetap berlaku untuk semua
halaman dinamis. Pola ini sesuai dokumentasi resmi Next.js 15.

---

## File yang Diubah

| File | Perubahan |
|------|-----------|
| `apps/web/src/middleware.ts` | +2 baris (fix + komentar) |
| `apps/web/src/__tests__/middleware.test.ts` | BARU — 5 test |
| `apps/web/jest.config.ts` | BARU — jest config dengan rootDir + modulePathIgnorePatterns |
| `apps/web/tsconfig.test.json` | BARU — tsconfig untuk ts-jest (commonjs/node) |
| `apps/web/package.json` | +script `test`, +`@types/jest` devDep |

---

## Bukti Runtime

### ✅ 5/5 Unit Test Hijau

```
PASS apps/web/src/__tests__/middleware.test.ts
  middleware — CSP nonce in requestHeaders (N21)
    ✓ sets Content-Security-Policy in requestHeaders for /login (4 ms)
    ✓ sets x-nonce in requestHeaders (1 ms)
    ✓ nonce in x-nonce matches nonce in CSP
    ✓ CSP contains strict-dynamic for protected dynamic routes (1 ms)
    ✓ CSP does NOT contain unsafe-eval outside development

Tests: 5 passed, 5 total  Time: 2.665 s
```

### ✅ `next build` Sukses

```
▲ Next.js 15.5.18
✓ Compiled successfully in 5.0s
✓ Generating static pages (10/10)

Route (app)                                 Size  First Load JS
├ ƒ /dashboard                             137 B         103 kB
├ ƒ /dashboard/executive                   137 B         103 kB
└ ○ /login                                 934 B         112 kB

ƒ Middleware   109 kB
```

### ✅ tsc 0 error · eslint 0 error

```
$ npx tsc --noEmit        → (no output = 0 errors)
$ npx next lint           → ✔ No ESLint warnings or errors
```

---

## DoD Checklist

- [x] tsc 0 error
- [x] eslint 0 error
- [x] 5 unit test hijau (verifikasi CSP di requestHeaders)
- [x] `next build` sukses
- [x] Branch `fix/N21-csp-nonce-request-header` dari develop
- [x] PR #60 ke develop terbuka
- [x] Working tree bersih (fix files committed)
- [x] Done report ini dibuat
- [ ] CI hijau setelah PR merge
- [ ] Staging: verifikasi /login tombol responsif
- [ ] Main: promote setelah staging OK
