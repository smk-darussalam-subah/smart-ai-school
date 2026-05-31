# Portal Nilai & Absensi — DONE

**Status:** ✅ SELESAI 2026-05-31
**Branch:** `feat/portal-nilai` (commit `1e8c342`)
**Route:** `/dashboard/nilai`

---

## Ringkasan Deliverable

### Files dibuat / diubah

| File | Keterangan |
|---|---|
| `apps/web/src/lib/api.ts` | `apiFetch<T>()` helper + shared types `GradeItem`, `AttendanceItem` |
| `apps/web/src/app/dashboard/nilai/page.tsx` | Server Component — fetch + error states |
| `apps/web/src/app/dashboard/nilai/loading.tsx` | Animated skeleton (Suspense fallback) |
| `apps/web/src/app/dashboard/nilai/_components/PortalNilaiClient.tsx` | `'use client'` — child selector + tabel + absensi |
| `apps/web/src/components/layout/Sidebar.tsx` | Gabungkan "Nilai Anak"+"Kehadiran Anak" → "Nilai & Absensi"; tambah SISWA |

---

## Arsitektur

### Data Flow

```
/dashboard/nilai (Server Component)
  │
  ├─ getServerSession(authOptions)      → token + roles
  ├─ apiFetch('/grades', token)         → GradeItem[] (API enforce ownership)
  ├─ apiFetch('/attendance', token)     → AttendanceItem[] (API enforce ownership)
  │
  └─ <PortalNilaiClient grades attendance isOrangTua>   ('use client')
       ├─ Derive unique children dari grades.student (tanpa extra API call)
       ├─ Child selector tab (visible jika ORANG_TUA + >1 anak)
       ├─ <AttendanceSummary> — 4 kartu + % kehadiran
       └─ <GradeTable> — grup per mapel, warna nilai, responsive
```

### Ownership

Ditegakkan sepenuhnya di API (NestJS):
- SISWA → hanya nilai/absensi diri (API filter `studentId = self`)
- ORANG_TUA → hanya nilai/absensi anak (API filter `studentId IN [childIds]`)
- Halaman hanya forward token; `null` response (403/5xx/network) → graceful error state

### Child Selector (ORANG_TUA)

Derived dari `grades` response: `Map<studentId, StudentRef>`.
State lokal (useState) — tidak perlu URL param karena tidak ada deep-link ke anak spesifik.
Accessible: `role="tablist"`, `aria-selected`, focus ring.

### Error States

| Kondisi | Tampilan |
|---|---|
| Role bukan SISWA/ORANG_TUA | `<AccessDenied>` — lock icon + pesan |
| API mengembalikan null (network/5xx) | `<FetchError>` — warning + "muat ulang" |
| Data kosong (belum ada nilai) | Empty state per section: "Belum ada data" |

### Sidebar Update

```diff
- { label: 'Nilai Anak',      href: '/dashboard/nilai',    roles: ['ORANG_TUA'] },
- { label: 'Kehadiran Anak',  href: '/dashboard/kehadiran', roles: ['ORANG_TUA'] },
+ { label: 'Nilai & Absensi', href: '/dashboard/nilai',    roles: ['SISWA', 'ORANG_TUA'] },
```

---

## Bukti Runtime

### tsc
```
npx tsc --noEmit → 0 errors (clean)
```

### next build
```
▲ Next.js 15.5.18
✓ Compiled successfully in 3.1s
✓ Generating static pages (7/7)

Route (app)                          Size   First Load JS
├ ƒ /dashboard/nilai               2.27 kB       105 kB
```

`/dashboard/nilai` terdaftar sebagai `ƒ (Dynamic)` — server-rendered on demand. ✅

### Ownership (unit-level, verified via API tests SMA-37/38)

| Skenario | Mekanisme | Status |
|---|---|---|
| SISWA hanya lihat nilai sendiri | `GradeService` filter `studentId = self` | ✅ (api test) |
| ORANG_TUA hanya lihat nilai anak | `GradeService` filter `IN [childIds]` | ✅ (api test) |
| Role lain akses `/dashboard/nilai` | `AccessDenied` component | ✅ |
| API down / 403 | `FetchError` component | ✅ |

### Catatan: Live UI test

Login browser ke halaman tidak bisa dilakukan tanpa VPS/Keycloak running di dev environment.
Evidence runtime: `next build` sukses + tsc clean adalah bukti yang valid per CLAUDE.md §9 (frontend halaman yang memerlukan auth Keycloak tidak bisa di-curl tanpa env lengkap).

---

## Catatan

- Tidak memakai shadcn/ui karena belum terinstall di project. Menggunakan Tailwind + existing design tokens (`.card`, `.badge`, `smk-blue`, `primary-*`).
- `lib/api.ts` bisa dipakai ulang untuk halaman server-fetching lain (keuangan SPP, dll.) — forward-compat.
- `export const dynamic = 'force-dynamic'` pada page → mencegah stale cache nilai.
