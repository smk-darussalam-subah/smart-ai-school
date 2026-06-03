# Landing Page SMK Darussalam Subah — DONE

**Branch:** `feat/landing-page`
**Commit:** e3ddfa4
**Selesai:** 2026-06-03

---

## Apa yang dibangun

Route publik `/` (SSG) — landing page SMK Darussalam Subah dengan 8 seksi:

| Seksi | File | Catatan |
|---|---|---|
| Nav sticky | `LandingNav.tsx` | `'use client'`, hamburger mobile |
| Hero collage | `Hero.tsx` | Server Component, placeholder foto |
| Marquee strip | `MarqueeStrip.tsx` | CSS-only animation, 5 values |
| Jurusan bento | `Jurusan.tsx` | 3 kartu (dark/sand/lime), TO·TJKT·AKL |
| Why Us | `WhyUs.tsx` | Panel emerald-deep, 3 values |
| Statistik | `Stats.tsx` | 4 angka, grid 2×2 mobile |
| CTA SPMB | `CtaPPDB.tsx` | Badge kuota 234 kursi, WA + taplink |
| Footer | `Footer.tsx` | 4 kolom, kontak terverifikasi |

**Komponen helper:** `ScrollReveal.tsx` — IntersectionObserver, respects `prefers-reduced-motion`

---

## Konten terverifikasi

- Jurusan: **TO (TKRO & TBSM) · TJKT · AKL** (dari IG bio "TO • TJKT • AKL")
- SPMB: **2026/2027**, kuota **234 kursi · 26 siswa/kelas**
- Kontak WA: +62 877-7556-4779
- Email: smkdarussalamsubah.08@gmail.com
- NPSN: 20350670 | Berdiri: 2008 | Akreditasi: B
- Alamat: Jl. Lapangan Selatan No. 05, Kemiri Barat, Subah, Batang
- CTA link: https://taplink.cc/smkdarussalamsubah

---

## Bukti Runtime

```
Route (app)       Size    First Load JS
○ /               1.42 kB    107 kB     ← Static SSG ✅

tsc --noEmit  → 0 errors ✅
next build    → ○ (Static) ✅
```

---

## SEO / A11y

- `metadata` title + description + openGraph
- JSON-LD `EducationalOrganization` (nama, alamat, koordinat, kontak, NPSN)
- `lang="id"` di root layout ✅
- Alt text di semua elemen visual ✅
- Heading hierarkis (h1 → h2 per seksi) ✅
- `prefers-reduced-motion` di ScrollReveal ✅

---

## Responsif

- **360px** — Hero 1 kolom, trust stats wrap, bento 1 kolom, stats 2×2
- **640px** — Bento 2 kolom, footer 2 kolom
- **768px+** — Hero 2 kolom, footer 4 kolom, CTA row
- **1180px** — Full desktop layout sesuai mockup

---

## Aset foto yang perlu diganti (task lanjutan)

Letakkan di `apps/web/public/landing/` lalu ganti `<div>` placeholder di `Hero.tsx` dengan `<Image>`:

| File | Konten |
|---|---|
| `hero-main.jpg` | Suasana belajar/praktik (foto utama, terbesar) |
| `hero-santri.jpg` | Kegiatan santri/ibadah |
| `hero-lab.jpg` | Praktik bengkel/lab komputer |

Sumber: IG @smkdarussalamsubah / galeri internal. Format AVIF/WebP ≤ 200 KB.

---

## Middleware update

`isPublicPath()` sekarang pakai **exact match** untuk `/` (bukan prefix — kalau prefix semua path jadi publik). Dashboard tetap terlindungi.

---

## Menunggu review

- [ ] Kang Sholah: cek kualitas desain + responsif di HP nyata
- [ ] Tambah foto asli dari IG @smkdarussalamsubah
- [ ] PR merge ke main setelah review
