# Landing Page v5 — Polish Akhir — DONE

**Branch:** `feat/landing-page`
**Tanggal:** 2026-06-04
**Status:** ✅ 3 revisi selesai · `next build` hijau · TypeScript 0 error

---

## Ringkasan Revisi

| # | Revisi | Status | Catatan |
|---|---|---|---|
| P1 | Galeri tampil rapi di mobile | ✅ | `columns-1` → `columns-2` dari 360px. Item ~160px/col tidak kebesaran. Aspek rasio dinormalisasi (hapus portrait terlalu tinggi). Gap kecil `gap-2` mobile, `gap-3` sm, `gap-4` lg |
| P2 | Model CTA diperbesar & proporsional | ✅ | `md:w-[290px] lg:w-[360px]` · `h-[300px] lg:h-[390px]` · bottom-aligned · overflow banner natural clip di atas |
| P3 | SPMB bottom section tata letak proporsional | ✅ | Hapus `overflow-x-auto` scroll horizontal · foto `grid-cols-2` (bukan 3) · `aspect-[3/4]` konsisten · kol stats lebih lebar `[1.1fr_0.9fr]` · siap foto pengganti Director |

---

## Diagnosis Root Cause

- **P1 galeri mobile**: `columns-1` → item 100% lebar viewport. `aspect-[3/4]` = 360px × 480px = foto raksasa. Fix: `columns-2` → tiap item ≈160px × max 213px — compact.
- **P2 model kecil**: `h-[230px]` terlalu pendek relatif tinggi banner (≈310px). Model terlihat mengambang kecil. Fix: `h-[300px]/[390px]` → lebih gagah, menyentuh batas banner.
- **P3 foto SPMB**: `grid-cols-3` dengan 2 foto → kolom ketiga kosong. `overflow-x-auto` ciptakan scroll tidak elegan di mobile. Fix: `grid-cols-2` + hapus overflow horizontal.

---

## File yang Diubah

- `apps/web/src/components/landing/Galeri.tsx` — columns-2 mobile, normalized aspect ratios (P1)
- `apps/web/src/components/landing/CtaPPDB.tsx` — model diperbesar (P2)
- `apps/web/src/components/landing/SPMBSection.tsx` — bottom section proporsional (P3)

---

## Bukti Runtime

```
next build:
✓ Compiled successfully in 5.3s
✓ Generating static pages (10/10)
TypeScript: 0 errors
Route /: 6.08 kB · 117 kB First Load JS
```

## Catatan Responsif

| Breakpoint | Galeri | Model CTA | SPMB Bottom |
|---|---|---|---|
| 360px | 2 col rapat, foto ≈160px/kol | model hidden | foto grid-2-col di bawah stats |
| 768px | 2 col | model 290px×300px, bottom-align | 2 kolom seimbang |
| 1280px | 3 col | model 360px×390px, gagah | 2 kolom, stats lebih lebar |

---

*Tunggu review Cowork sebelum merge.*
