# Landing Page v4 — Polish UI/UX — DONE

**Branch:** `feat/landing-page`
**Tanggal:** 2026-06-04
**Status:** ✅ Semua 11 revisi selesai · `next build` hijau · TypeScript 0 error

---

## Ringkasan Revisi

| # | Revisi | Status | Catatan |
|---|---|---|---|
| V1 | Kartu jurusan solid (tanpa bg foto) | ✅ | TKRO emerald-deep · TJKT sand · AKL lime · ikon SVG per jurusan · watermark number |
| V2 | Cutout di hero diganti foto kelas | ✅ | `ruang-kelas.jpg` dengan gradient overlay · object-cover |
| V3 | Ekstrakurikuler 6 kartu | ✅ | Pramuka · Jurnalistik · IPNU-IPPNU · English Club · PMR · Pecinta Alam |
| V4 | Apple dock effect pada foto seragam | ✅ | `DockStrip.tsx` (client) · scale cubic-bezier · neighbor magnify · reduced-motion safe |
| V5 | Galeri masonry rapi tanpa ruang kosong | ✅ | CSS `columns-1 sm:columns-2 lg:columns-3` · `break-inside-avoid` · mb spacing |
| V6 | Seragam 4 foto di DockStrip | ✅ | Olahraga · TJKT · AKL · TO · `seragam-*.jpg` semua valid |
| V7 | SPMB persyaratan terkoreksi | ✅ | Hapus "usia maks 21 tahun" · hapus baris WA teks berdiri sendiri |
| V8 | CTA visual model | ✅ | `model-cut-out.png` (aset Director tersedia) · bottom-aligned · object-contain |
| V9 | Badge "N" disembunyikan | ✅ | `devIndicators: false` di `next.config.js` · dev-only, tidak ada efek di produksi |
| V10 | Hiasan geometrik islami | ✅ | SVG bintang 8 tipis di Hero + Keunggulan + CtaPPDB · opacity 4–7% · pointer-events-none · aria-hidden |
| V11 | Scroll-reveal replay tiap masuk viewport | ✅ | Reset instant saat keluar (transition:none) · rAF animate-in saat masuk ulang · reduced-motion skip |

---

## File yang Diubah

- `apps/web/next.config.js` — devIndicators: false (V9)
- `apps/web/src/components/landing/ScrollReveal.tsx` — replay (V11)
- `apps/web/src/components/landing/Jurusan.tsx` — solid cards, ikon SVG (V1)
- `apps/web/src/components/landing/Hero.tsx` — replace cutout + Islamic stars (V2, V10)
- `apps/web/src/components/landing/DockStrip.tsx` — **NEW** dock magnify client component (V4)
- `apps/web/src/components/landing/Ekstrakurikuler.tsx` — 6 ekskul + DockStrip seragam (V3, V6)
- `apps/web/src/components/landing/Galeri.tsx` — masonry columns (V5)
- `apps/web/src/components/landing/SPMBSection.tsx` — persyaratan terkoreksi (V7)
- `apps/web/src/components/landing/CtaPPDB.tsx` — model-cut-out.png + Islamic stars (V8, V10)
- `apps/web/src/components/landing/Keunggulan.tsx` — Islamic stars (V10)

---

## Keputusan Terbuka (perlu konfirmasi Director)

### V3 — Bahasa Jepang
Bahasa Jepang **tidak ada di KSP/RENSTRA** → diganti **Pecinta Alam** (resmi di KSP).
Jika Director ingin Bahasa Jepang tetap tampil, perlu validasi dokumen resmi terlebih dahulu.

### V8 — Model Cutout
`model-cut-out.png` sudah terdeteksi di `public/landing/` dan **sudah dipakai** di CTA.
Jika ada aset model yang lebih baik (membawa buku, pose berbeda), tinggal ganti file.

---

## Bukti Runtime

```
next build output:
✓ Compiled successfully in 15.7s
✓ Generating static pages (10/10)
TypeScript: 0 errors
Route / (landing page): 6.11 kB, 117 kB First Load JS
```

## Catatan Responsif & Performa
- **360px**: Jurusan 1-col, Ekskul 2-col, Galeri 1-col, DockStrip 4-col seragam
- **768px**: Jurusan 2-col, Ekskul 2-col, Galeri 2-col, dock effect aktif
- **1280px**: Jurusan 3-col, Ekskul 3-col, Galeri 3-col, model CTA visible
- **CLS ≈ 0**: tidak ada layout shift dari animasi (transform only, no layout properties)
- **Reduced-motion**: DockStrip (skip scale), ScrollReveal (skip animation, tampil statis)
- **Lighthouse**: SSG static page, no heavy JS libs ditambahkan

---

*Tunggu review Cowork sebelum merge ke develop.*
