# Audit UI/UX Dashboard DIIS — 2026-06-12

> Auditor: Claude (Fable 5) atas mandat Director, metode: review kode seluruh
> 18 rute dashboard terhadap kriteria skill `ui-ux-pro-max` (hierarchy, konsistensi,
> states, a11y, kejujuran data, responsif). Catatan: audit BERBASIS KODE — verifikasi
> visual live menyusul via akun inspektur + mode "Masuk sebagai" (2I-1).

## Vonis ringkas
**Layak dan profesional untuk fase saat ini — SETELAH perbaikan 2I diterapkan.**
Fondasi bagus: design system konsisten (shadcn + token `.card/.badge`), pinned/empty/
loading state hampir merata, bahasa Indonesia konsisten, RBAC-gating rapi.
Dua dosa besar ditemukan & DIPERBAIKI di 2I: **data palsu** dan **indikator status palsu**.

## Temuan & status
| # | Temuan | Berat | Status |
|---|--------|-------|--------|
| 1 | Dashboard GURU/SISWA menampilkan ANGKA HARDCODED (24 jp, 156 siswa, 82.4, 94%) — menyesatkan pengguna nyata | KRITIS (kepercayaan) | ✅ FIXED 2I: GURU = data nyata (jp/minggu, kelas diampu, RPP submitted, presensi hari ini); SISWA/ORTU = kartu navigasi jujur tanpa angka palsu |
| 2 | "Status Sistem" selalu hijau (hardcoded) padahal tidak mengecek apa pun | KRITIS (kejujuran) | ✅ FIXED 2I: hanya SA, dari GET /health nyata, merah saat gangguan |
| 3 | TATA_USAHA tidak mendapat kartu statistik padahal datanya di-fetch | TINGGI | ✅ FIXED 2I |
| 4 | loading.tsx absen di /executive & /lowongan (CLS + blank saat fetch) | SEDANG | ✅ FIXED 2I |
| 5 | Label & warna role TATA_USAHA hilang di sidebar | SEDANG | ✅ FIXED 2I-1 |
| 6 | Dua sistem kartu paralel: `.card` (globals.css) vs shadcn `<Card>` — visual serupa, tapi dua sumber kebenaran gaya | RENDAH | ⏳ backlog: konsolidasi bertahap ke shadcn |
| 7 | Ikon emoji (bukan icon set) — konsisten dipakai, khas, ringan; keputusan sadar, BUKAN cacat; revisit bila rebrand | INFO | dipertahankan |
| 8 | Heatmap & matrix sudah a11y-benar (bukan warna-saja); beberapa tabel staf belum ada caption/scope penuh | RENDAH | ⏳ backlog |
| 9 | Mobile: sidebar w-64 statis, belum ada drawer/hamburger → dashboard kurang nyaman <768px | SEDANG | ⏳ backlog prioritas berikut |
| 10 | Konsistensi pola halaman (h1 2xl + sub muted + aksi kanan) — 18/18 rute SERAGAM | — | ✓ sudah baik |

## Skor per area (kode, skala 5)
Dashboard home 4.5 (pasca-fix) · Siswa 4 · Keuangan 4 · Jadwal 4.5 · Pengumuman 4.5 ·
Presensi 4.5 · RPP 4.5 · Rapor 4 · Kegiatan 4 · Users 4 · AI 3.5 (butuh indikator
streaming) · Health 4 · Executive 3.5 (tergantung Metabase) · Nilai 4 · PPDB 4.

## Rekomendasi berikut (urut dampak)
1. **Responsive sidebar** (drawer mobile) — guru/ortu mayoritas akses via HP.
2. Konsolidasi `.card` → shadcn Card (sekali sapu, low-risk).
3. AI chat: indikator mengetik + auto-scroll.
4. Verifikasi visual end-to-end via akun inspektur (runbook 2I-1) — bukti tangkapan
   layar per role dilampirkan ke audit berikutnya.
