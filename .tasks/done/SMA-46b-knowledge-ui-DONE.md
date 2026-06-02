# SMA-46b — Frontend /dashboard/knowledge — DONE

**Branch:** `feat/SMA-46b-knowledge-ui`
**Commit:** `bb54047`
**Tanggal selesai:** 2026-06-02
**Model:** Sonnet 4.6

---

## Deliverable

### Route /dashboard/knowledge
- `page.tsx` — Server Component: `getServerSession(authOptions)` → role-gate SA/KS/TU → `apiFetch('/ai/knowledge')` → `<AccessDenied>` / `<FetchError>` / `<KnowledgeManager>`
- `loading.tsx` — skeleton Suspense fallback (pola portal-nilai)
- `_components/KnowledgeManager.tsx` — `'use client'` interaktivitas penuh
- `actions.ts` — Server Actions: token server-side, tidak bocor ke client

### Fitur
- **List + filter** (Semua/Draft/Published) + **search judul** (client-side)
- **Tabel:** Judul · Kategori · Status badge (Draft abu/Published hijau) · Embedding (✓ hijau/⚠ kuning) · Dipublish (tanggal)
- **Empty state** dengan copy sesuai konteks filter/search
- **Buat** (SA/KS/TU): form inline + notice "Tersimpan sebagai Draft" + status embedding
- **Edit** (SA/KS/TU): form prefilled via `getKnowledgeDetailAction` + peringatan re-embed saat konten diubah
- **Publish** (SA/KS): konfirmasi overlay → handle 422 (embedding NULL) dengan pesan jelas
- **Unpublish** (SA/KS): konfirmasi overlay → optimistic update local state
- **Hapus** (SA): konfirmasi tegas + label hard-delete ireversibel → optimistic remove
- **Backfill** (SA): POST `/ai/knowledge/backfill` → tampilkan ringkasan {total, success, failed}
- **Sidebar:** item "Basis Pengetahuan" `href: '/dashboard/knowledge'` `icon: '🧠'` roles SA/KS/TU

### Pendekatan auth mutasi
**Server Actions** (pilihan per task brief): `getServerSession(authOptions)` di server → `apiMutate` (fetch langsung ke API) → `revalidatePath('/dashboard/knowledge')`. Token tidak terekspos ke client component.

### Tipe baru di api.ts (additive)
- `KnowledgeListItem`, `KnowledgeDetail`, `BackfillResult`

---

## Bukti Runtime

### tsc --noEmit
```
(0 output = 0 errors)
```
Exit code 0 — TypeScript strict pass.

### eslint
```
(0 output = 0 warnings)
```
Exit code 0 dari root dengan `npx eslint "apps/web/src/**/*.{ts,tsx}" --max-warnings=0`.

### next build
```
Route (app)                                 Size  First Load JS
┌ ○ /                                      137 B         103 kB
├ ○ /_not-found                            137 B         103 kB
├ ƒ /api/auth/[...nextauth]                137 B         103 kB
├ ƒ /dashboard                             137 B         103 kB
├ ƒ /dashboard/knowledge                 4.82 kB         107 kB   ← BARU
├ ƒ /dashboard/nilai                     2.27 kB         105 kB
├ ○ /health                              1.02 kB         104 kB
└ ○ /login                                 934 B         112 kB
```
`ƒ (Dynamic)` — server-rendered on demand (sesuai `force-dynamic`). Build sukses 7/7 pages.

### Login browser nyata
Butuh Keycloak (tidak tersedia di dev — sama seperti portal-nilai). Penjelasan:
- **(a) Role-gate:** `getServerSession(authOptions)` → `ALLOWED_ROLES.some(r => roles.includes(r))` — peran selain SA/KS/TU akan melihat `<AccessDenied>`. Backend tetap penjaga akhir via `@Roles()` decorator.
- **(b) Tombol kondisional:** `canCreate`, `canPublish`, `canDelete`, `canBackfill` di-compute dari `userRoles` — tombol **disembunyikan** (bukan hanya disabled) jika tidak memiliki hak. TU melihat Edit saja; KS melihat Edit+Publish+Unpublish; SA melihat semua.
- **(c) Penanganan 422:** `publishKnowledgeAction` cek `result.status === 422` → return error spesifik "Belum ada embedding — jalankan Backfill atau edit konten dulu". Pesan ditampilkan di `NoticeBar` merah.

---

## Keputusan terbuka

1. **Modal vs halaman edit terpisah** → dipilih form inline dalam halaman (toggles view state). Keputusan ini dipilih karena form sederhana dan konsisten dengan gaya komponen bestehend. Jika content sangat panjang, halaman terpisah mungkin lebih nyaman — bisa diubah di Sprint 4 tanpa breaking change.
2. **Source field di edit** → UpdateKnowledgeDto backend tidak menerima `source` (schema `.strict()`). Field source hanya tersedia di Create. Jika perlu di edit, perlu perubahan backend DTO.
3. **Optimistic update vs router.refresh()** → delete/publish/unpublish = optimistic local state; create/edit = `router.refresh()` untuk fetch list fresh dari server. Konsisten dengan revalidatePath.
4. **Backfill scope** → Backend hanya backfill chunk dengan `is_active = true AND embedding IS NULL`. Draft chunk tidak di-backfill. Jika draft perlu di-backfill juga, perlu perubahan backend query.

---

## Files changed
```
apps/web/src/app/dashboard/knowledge/page.tsx             (baru)
apps/web/src/app/dashboard/knowledge/loading.tsx          (baru)
apps/web/src/app/dashboard/knowledge/actions.ts           (baru)
apps/web/src/app/dashboard/knowledge/_components/KnowledgeManager.tsx  (baru)
apps/web/src/components/layout/Sidebar.tsx                (diubah: +1 nav item)
apps/web/src/lib/api.ts                                   (diubah: +3 types)
```

---

*Tunggu gerbang review Cowork (RBAC UI + keamanan mutasi) sebelum merge ke main.*
