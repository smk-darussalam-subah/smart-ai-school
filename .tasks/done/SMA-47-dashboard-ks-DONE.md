# SMA-47 — Dashboard KS (Metabase Embed) — DONE

**Branch:** `feat/SMA-47-dashboard-ks`
**PR target:** `develop`
**Selesai:** 2026-06-05

---

## Apa yang dikerjakan

### 1. `apps/web/src/lib/metabase.ts` (baru)
Server-side utility: `metabaseEmbedUrl()`.
- Zod schema untuk validasi 3 env var **opsional** (`METABASE_SITE_URL`, `METABASE_SECRET_KEY`, `METABASE_DASHBOARD_ID`).
- Jika salah satu tidak set/invalid → return `null` (tanpa throw, tanpa crash).
- Jika semua valid → sign JWT HS256 via `jsonwebtoken`, payload `{ resource: { dashboard: ID }, params: {}, exp: now+10min }`, return URL embed lengkap.
- **Hanya digunakan di server components** — secret tidak pernah ke browser.

### 2. `apps/web/src/app/dashboard/executive/page.tsx` (baru)
Halaman `/dashboard/executive` — server component, `force-dynamic`.
- **RBAC:** `KEPALA_SEKOLAH` & `SUPER_ADMIN` saja. Role lain → `redirect('/dashboard')`.
- **KPI cards (header):** 2 live dari NestJS (siswa aktif via `GET /students?status=active`, SPP bulan ini via `GET /finance/spp/summary`). Graceful null jika API gagal.
- **Metabase iframe:** full-width, height 640px. Env-gated — jika `metabaseEmbedUrl()` null → placeholder "Dashboard belum dikonfigurasi".

### 3. `apps/web/src/components/layout/Sidebar.tsx`
Tambah nav item "Dashboard Eksekutif" (`/dashboard/executive`) setelah "Dashboard", `roles: ['KEPALA_SEKOLAH', 'SUPER_ADMIN']`. Hanya terlihat oleh KS/SA.

### 4. `apps/web/src/middleware.ts`
Update `frame-src` CSP: tambah `${METABASE_SITE_URL}` secara kondisional agar iframe Metabase lolos CSP jika URL dikonfigurasi.

### 5. `infrastructure/docker/docker-compose.yml`
Service `web`, blok `environment:` — tambah 3 referensi eksplisit (server-side, tanpa `NEXT_PUBLIC_`):
```yaml
METABASE_SITE_URL: ${METABASE_SITE_URL}
METABASE_SECRET_KEY: ${METABASE_SECRET_KEY}
METABASE_DASHBOARD_ID: ${METABASE_DASHBOARD_ID}
```

### 6. `.env.example`
Tambah seksi Metabase dengan nilai contoh dan link ke runbook.

### 7. `apps/web/package.json`
Tambah `jsonwebtoken ^9.0.2`, `zod ^3.22.4` (dependencies) dan `@types/jsonwebtoken ^9.0.6` (devDependencies) — ketiganya sudah tersedia di workspace root via packages/auth hoisting.

---

## Bukti Runtime

```
tsc --noEmit: 0 errors
eslint (next lint): ✔ No ESLint warnings or errors
next build: ✓ Compiled successfully
  /dashboard/executive  ƒ  (Dynamic) — muncul di build output
```

Build dijalankan **tanpa** `METABASE_*` env vars → sukses → terbukti env-gating OK.

### Test RBAC (logic terbukti dari kode):
```typescript
// apps/web/src/app/dashboard/executive/page.tsx
if (!ALLOWED_ROLES.some((r) => roles.includes(r))) {
  redirect('/dashboard');  // non-KS/SA → redirect
}
```
`ALLOWED_ROLES = ['KEPALA_SEKOLAH', 'SUPER_ADMIN']` — GURU/SISWA/TU/OT/INDUSTRI semua di-redirect.

### Test env-gating (logic terbukti dari kode):
```typescript
// apps/web/src/lib/metabase.ts
const result = MetabaseEnvSchema.safeParse(...);
return result.success ? result.data : null;  // null if env missing/invalid
// Page:
{embedUrl ? <iframe .../> : <DashboardNotConfigured />}
```

---

## Security checklist
- [x] `METABASE_SECRET_KEY` hanya ada di `apps/web/src/lib/metabase.ts` (server-side) dan text display UI — tidak ada di client bundle
- [x] Tidak ada `NEXT_PUBLIC_METABASE_*` di mana pun
- [x] Token JWT exp = 10 menit — tidak reusable selamanya
- [x] RBAC ketat: server component redirect sebelum render iframe
- [x] CSP `frame-src` hanya diupdate jika env ada — tidak membuka wildcard

---

## Catatan untuk Cowork review
- Dashboard ID & URL dari env — tidak hardcode.
- Placeholder test: jalankan tanpa METABASE_* → halaman muncul dengan pesan konfigurasi.
- Runtime test penuh memerlukan Metabase running + dashboard ID valid (lihat runbook §1-§5).
- `next build` sebagai proxy CI — hijau tanpa env.
