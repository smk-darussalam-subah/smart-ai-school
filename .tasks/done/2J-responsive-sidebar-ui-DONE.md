# DONE — 2J: Responsive Sidebar & UI Consolidation (2026-06-12)

> Berdasarkan rekomendasi Audit UI/UX 2026-06-12 (#1 dan #2).
> Fokus: drawer mobile untuk sidebar dan penghapusan sistem kartu paralel.

## 2J-1 — Responsive Sidebar (Drawer Mobile)
- Menambahkan komponen `Sheet` (drawer) di `apps/web/src/components/ui/sheet.tsx` menggunakan Radix UI.
- Membuat komponen `MobileNav` di `apps/web/src/components/layout/MobileNav.tsx` untuk toggle sidebar di mobile.
- Refactor `Sidebar.tsx` agar menerima `className` dan mendukung visibilitas responsif (`hidden md:flex`).
- Update `DashboardLayout` untuk menyertakan `MobileNav` (sticky top di mobile) dan menyembunyikan sidebar statis pada layar kecil.
- Padding main content disesuaikan: `p-4` di mobile, `p-6` di desktop.

## 2J-2 — UI Consolidation (.card → shadcn Card)
- Refactor seluruh 18 penggunaan class `.card` (dari `globals.css`) menjadi komponen shadcn/ui `<Card>`.
- File yang diperbarui:
    - `app/dashboard/page.tsx` (StatCard, role links, SystemStatus)
    - `app/dashboard/_components/AttendanceHeatmap.tsx`
    - `app/dashboard/executive/page.tsx`
    - `app/dashboard/knowledge/_components/KnowledgeManager.tsx`
    - `app/dashboard/knowledge/page.tsx`
    - `app/dashboard/nilai/_components/PortalNilaiClient.tsx`
    - `app/dashboard/nilai/page.tsx`
    - `app/health/page.tsx`
- Menghapus definisi `.card` dari `apps/web/src/app/globals.css` untuk mencegah penggunaan kembali sistem paralel.

## Bukti runtime
- `npm run type-check --workspace=apps/web` → **PASS**
- `next build` divalidasi via pipeline (lokal sandbox SIGBUS).
- Verifikasi visual (simulasi mobile): Header "DIIS" dengan ikon hamburger muncul di <768px, sidebar muncul dari kiri saat diklik.

## Wajib sebelum CLOSED
- Konfirmasi visual drawer di perangkat mobile oleh Director.
- Pastikan tidak ada regresi gaya pada kartu (shadow/border/padding) di berbagai halaman dashboard.
