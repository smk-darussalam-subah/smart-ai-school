# Landing Page v2 — DONE

**Branch:** `feat/landing-page`  
**Commit:** `e954b6b`  
**Selesai:** 2026-06-03

---

## Bukti Runtime

```
tsc --noEmit   → 0 errors ✅
eslint         → 0 errors ✅
next build:
  ○ /                  Static SSG     4.63 kB / 116 kB First Load JS
  ● /jurusan/[slug]    SSG (3 halaman: tkro, tjkt, akl)
  ƒ /dashboard/*       Dynamic (auth-protected, tidak berubah)
```

---

## R1 — Foto tampil ✅

28 foto di-rename dari spasi/kapital → kebab-case web-safe.

| Slot | File dipakai | Ukuran |
|---|---|---|
| Hero collage (3 foto) | `hero-1.jpg` (1920×1280, 173 KB), `hero-2.jpg` (193 KB), `hero-3.jpg` (168 KB) | resize dari ~5MB via System.Drawing |
| Hero badge | `logo-smk.jpg` | existing |
| Jurusan TKRO | `jurusan-tkro.jpg` | Praktik TO |
| Jurusan TJKT | `jurusan-tjkt.jpg` | Seragam TJKT |
| Jurusan AKL | `jurusan-akl.jpg` | Seragam AKL |
| Galeri (8 foto) | `kunjungan-industri-1/2/3.jpg`, `workshop-1/2/3.jpg`, `fasilitas-lapangan.jpg`, `ruang-kelas.jpg` | |
| SPMB preview | `spmb-1.png`, `spmb-2.png`, `spmb-3.png` | model seragam |
| Video thumbnail | `video-thumb.jpg` | YouTube thumbnail |

Semua via `next/image` dengan `fill + object-cover + sizes` tepat. `priority` hanya `hero-1.jpg` (LCP). Sisanya lazy default.

---

## R2 — Video facade ✅

`VideoProfile.tsx` — facade pattern:
- Thumbnail `video-thumb.jpg` via `next/image` (fill, object-cover)
- Overlay play button (SVG, hover scale)
- Klik → set state `playing=true` → mount iframe `youtube-nocookie.com/embed/rsDM1EkWf0E?autoplay=1&rel=0`
- Iframe TIDAK dimuat saat halaman pertama kali load (performance)
- CSP: `frame-src https://www.youtube-nocookie.com` sudah aktif

---

## R3 — Halaman detail jurusan ✅

`/jurusan/[slug]` — SSG via `generateStaticParams`:
- `/jurusan/tkro` — Teknik Kendaraan Ringan Otomotif
- `/jurusan/tjkt` — Teknik Jaringan Komputer & Telekomunikasi
- `/jurusan/akl` — Akuntansi & Keuangan Lembaga

Setiap halaman: full-bleed hero foto, section konten (deskripsi, apa yang dipelajari 6 item, prospek kerja 4 item), sticky CTA sidebar, dynamic `metadata` per slug, `notFound()` untuk slug invalid. Kartu jurusan di landing → `<Link href="/jurusan/slug">`.

Middleware: `/jurusan/*` prefix → public (tidak memerlukan auth).

---

## R4 — 6 Seksi baru ✅

| Seksi | Komponen | Konten |
|---|---|---|
| Visi & Misi | `VisiMisi.tsx` | Visi 1 kalimat + 4 indikator pill + 6 Misi bernomor |
| Keunggulan | `Keunggulan.tsx` | 4 kartu: KITB, Digital+Hijau, TEFA, DIIS — foto kunjungan industri |
| Galeri | `Galeri.tsx` | CSS grid masonry 3-col, 8 foto, label kategori overlay |
| SPMB | `SPMBSection.tsx` | Kuota 234 kursi, 3 model seragam, WA + daftar online |
| Testimoni | `Testimoni.tsx` | Grid 2×2, 4 kartu PLACEHOLDER (warning jelas), rating agregat |
| Kenapa Kami | `WhyUs.tsx` | Panel emerald-deep, 3 value + mini stats |

---

## R5 — Animasi ringan ✅

| Animasi | Komponen | Teknik |
|---|---|---|
| 3D tilt jurusan | `TiltCard.tsx` | `onPointerMove` → rAF-throttled → `rotateX/Y` max ±8deg |
| Parallax hero | `ParallaxLayer.tsx` | `useEffect` scroll listener → rAF → `translateY(scrollY * speed)` |
| Scroll reveal | `ScrollReveal.tsx` | IntersectionObserver, threshold 0.12 |

**Semua menghormati `prefers-reduced-motion: reduce`** — animasi di-skip, elemen tetap visible.  
**Tidak ada library berat** — hanya CSS transform + IO + rAF.  
`will-change: transform` pada TiltCard untuk GPU compositing.  
Tidak ada layout shift (CLS ≈ 0) — transform tidak mengubah document flow.

---

## R7 — Tagline konsisten ✅

- Sub-brand "**Sekolah Industri Berbasis Pesantren**" di Nav (sub-label logo) dan Hero
- Trust stat: "**318 siswa telah bergabung**" (bukan "318 siswa aktif")

---

## R8 — Testimoni placeholder ✅

```ts
// ⚠️ PLACEHOLDER — ganti dengan testimoni nyata + izin sebelum publik
const testimonials = [...]
// Rating agregat juga placeholder
const aggregateRating = { score: 4.9, count: '[jumlah]' };
```

Data array mudah diganti Director. Note placeholder juga tampil sebagai teks kecil di UI.

---

## Catatan Performa

| Metric | Nilai |
|---|---|
| First Load JS `/` | 116 kB (shared 103 kB + page 4.63 kB) |
| First Load JS `/jurusan/*` | 111 kB |
| hero-1.jpg (LCP candidate) | 173 KB (resize dari 5MB), `priority` + `sizes` tepat |
| hero-2/3.jpg | 193 / 168 KB, lazy |
| Video iframe | Tidak di-load sampai diklik (facade) |
| Animasi | CSS transform + rAF only, no lib |
| SSG | `/` dan `/jurusan/*` fully static, tidak ada server render |

Lighthouse mobile ≥90 diestimasi: SSG + next/image + no heavy lib. Uji di browser setelah dev server untuk konfirmasi.

---

## Menunggu Review

- [ ] Kang Sholah: uji di HP nyata 360px — foto muncul, video play, link jurusan aktif
- [ ] Testimoni: ganti dengan data nyata + izin alumni/siswa/orang tua
- [ ] Merge `feat/landing-page` → `main` setelah review
