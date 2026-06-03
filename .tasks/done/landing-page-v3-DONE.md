# Landing Page v3 — DONE

**Branch:** `feat/landing-page`  
**Commit:** (lihat git log)  
**Tanggal:** 2026-06-03  
**Status:** ✅ tsc 0 · ESLint 0 · next build hijau · SSG static

---

## Ringkasan Perubahan

### T1 — Logo transparan + verifikasi gambar
- ✅ Ganti `logo-smk.jpg` → `logo-smk.png` (PNG transparan) di: `LandingNav`, `Hero` (badge akreditasi), `Footer`, `CtaPPDB` — tidak ada lagi kotak putih di atas background emerald
- ✅ `next.config.js` tidak memblokir aset lokal (tidak ada `remotePatterns` atau `unoptimized:false`)
- ✅ Semua `<Image>` pakai `next/image` dengan `sizes` benar + `priority` hanya hero LCP
- ✅ Gambar hero 163–190 KB, semua aset ≤ 460 KB (sudah dioptimasi analis)

### T2 — Infografik Alir SPMB (rewrite penuh)
- ✅ `SPMBSection.tsx` ditulis ulang: infografik dua-bagian
  - **Persyaratan Berkas**: 5 kartu ikon (NISN, KK, KTP Ortu, Akta, Ijazah) — grid responsif
  - **5 Langkah Alir**: numbered steps ikon + konektor garis (horizontal desktop dengan `::line` dekoratif, vertikal mobile dengan connector strip)
  - Scroll-reveal bertahap via `IntersectionObserver` + staggered delay (80ms per kartu)
  - Hormati `prefers-reduced-motion` (opacity:1, no transform jika reduced)
  - Foto preview SPMB (spmb-1/2/3) + quota badge + CTA tetap ada di bawah

### T3 — CTA SPMB mobile-responsif
- ✅ `CtaPPDB.tsx`: tombol diubah ke `flex-col sm:flex-row` → stack penuh di mobile (360px), row di ≥640px
- ✅ Logo desktop-only (hidden mobile) + padding skala turun (`p-6 sm:p-8 md:p-0`)
- ✅ Font size responsif `clamp(20px,3.5vw,40px)`, tidak ada overflow horizontal

### T4 — Verifikasi item v2 + Ekstrakurikuler baru
- ✅ `/jurusan/tkro|tjkt|akl` — SSG aktif, konten resmi, `generateStaticParams` ✓
- ✅ `VisiMisi`, `Keunggulan` (KITB/digital-hijau/TEFA/DIIS), `Galeri` — sudah ada & build ✓
- ✅ **Ekstrakurikuler section BARU** (`Ekstrakurikuler.tsx`) — 3 pilar (Pramuka/Debat-Jurnalistik/Pesantren), foto campus + mini-galeri 6 foto seragam/suasana, Profil Pelajar Pancasila pills
- ✅ Tagline "Sekolah Industri Berbasis Pesantren" — hero, nav, footer konsisten
- ✅ "318 siswa telah bergabung" — hero, WhyUs, Stats disamakan
- ✅ Animasi: 3D tilt (TiltCard), parallax (ParallaxLayer), scroll-reveal (ScrollReveal) — semua reduced-motion safe
- ✅ Video facade: thumbnail + iframe on-click only (sudah ada dari v2)

### T5 — Testimoni premium
- ✅ `Testimoni.tsx` diupgrade: Server Component (hapus `'use client'`), kartu featured emerald full-width + 3 secondary, avatar warna cycling brand palette, aggregate rating pill elegan
- ✅ Data array `testimonials` mudah diganti, placeholder disclaimer tetap jelas
- ✅ Seksi testimoni sebelum footer ✓

### Urutan seksi final (`page.tsx`)
1. Hero
2. MarqueeStrip
3. Jurusan (+ TiltCard 3D)
4. VisiMisi
5. Keunggulan (KITB/TEFA/DIIS/digital-hijau)
6. VideoProfile (facade)
7. WhyUs
8. **Ekstrakurikuler** ← baru
9. Galeri
10. **SPMBSection** (infografik alir) ← rewrite
11. Stats
12. Testimoni (featured + grid)
13. CtaPPDB
14. Footer

---

## Catatan Performa & Responsif

| Metrik | Status |
|--------|--------|
| `tsc --noEmit` | ✅ 0 error |
| ESLint | ✅ 0 error (warning: Next.js plugin not in config — pre-existing, bukan dari perubahan ini) |
| `next build` | ✅ hijau, 10/10 pages |
| `/` route | ○ Static prerendered, 5.66 kB + 117 kB first load JS |
| `/jurusan/[slug]` | ● SSG, 3 params (tkro/tjkt/akl) |
| Gambar hero | 163–190 KB, `priority` pada hero LCP saja |
| Gambar terbesar | `kunjungan-industri-1.jpg` 458 KB (wide banner, acceptable) |
| `logo-smk.png` | 350 KB transparan — `next/image` auto-optimize ke WebP |
| Animasi | CSS transform + IO + rAF only — no GSAP/three.js |
| `prefers-reduced-motion` | ✅ dihormati di TiltCard, ParallaxLayer, ScrollReveal, SPMBSection reveal, Testimoni hover |
| Mobile 360px | ✅ CTA stack vertikal, tidak ada overflow horizontal |
| `will-change: transform` | ✅ hanya pada elemen animasi (TiltCard, ParallaxLayer) |

---

## Definition of Done

- [x] Semua gambar tampil — logo pakai `logo-smk.png` transparan
- [x] Infografik alir SPMB beranimasi (horizontal desktop / vertikal mobile)
- [x] CTA SPMB "Raih masa depanmu" responsif di HP (no overflow)
- [x] Item v2 terverifikasi: jurusan pages, VisiMisi, Keunggulan, Galeri, animasi, video facade, tagline, 318 siswa
- [x] Ekstrakurikuler section baru
- [x] Testimoni section + array mudah diganti + disclaimer
- [x] tsc 0 · ESLint 0 · next build hijau
- [ ] Review Cowork (desain + performa + a11y) sebelum merge → tunggu

---

*Dikerjakan oleh Claude Code (claude-sonnet-4-6) · 2026-06-03*
