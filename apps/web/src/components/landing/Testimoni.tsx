/**
 * Testimoni section — Server Component, no client JS needed.
 * Layout: 1 featured card (full-width, emerald) + 3 secondary cards grid.
 * Hover via CSS only (no client state). Reduced-motion aman.
 *
 * ⚠️  DATA PLACEHOLDER — WAJIB DIGANTI sebelum publikasi.
 *     Ganti isi array `testimonials` dan `aggregateRating` dengan data nyata + izin tertulis.
 */

// ⚠️ PLACEHOLDER — replace with real testimonials + written consent before going public
export const testimonials = [
  {
    name: '[Nama Alumni]',
    role: 'Alumni TKRO · Angkatan [Tahun]',
    rating: 5,
    quote:
      'Belajar di sini bukan cuma dapat skill kerja, tapi juga akhlak. Saya langsung diterima kerja di kawasan industri setelah lulus.',
    featured: true,
  },
  {
    name: '[Nama Siswa]',
    role: 'Siswa TJKT',
    rating: 5,
    quote:
      'Praktik jaringannya nyata, gurunya sabar membimbing. Lingkungan pesantrennya bikin disiplin.',
    featured: false,
  },
  {
    name: '[Nama Orang Tua]',
    role: 'Orang Tua Siswa',
    rating: 5,
    quote:
      'Anak saya jadi lebih mandiri dan religius. Kombinasi pesantren dan keahlian yang dicari zaman sekarang.',
    featured: false,
  },
  {
    name: '[Nama Alumni]',
    role: 'Alumni AKL · Angkatan [Tahun]',
    rating: 4,
    quote:
      'Pembelajaran akuntansinya aplikatif dan langsung praktik — saya siap kerja di perkantoran sejak lulus.',
    featured: false,
  },
] as const;

// ⚠️ PLACEHOLDER — ganti dengan data rating nyata (Google Maps / survey alumni terverifikasi)
const aggregateRating = { score: 4.9, count: '[jumlah]' };

/** Avatar color cycling — maps index to brand palette */
const AVATAR_COLORS = [
  'bg-smk-lime text-[#22330a]',
  'bg-smk-emerald text-white',
  'bg-smk-sand text-smk-emerald-deep border border-smk-emerald/20',
  'bg-smk-emerald-deep text-smk-lime',
] as const;

function getInitials(name: string): string {
  const clean = name.replace(/[[\]]/g, '').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
  }
  return (parts[0]?.slice(0, 2) ?? '??').toUpperCase();
}

function StarRating({ rating, max = 5, light = false }: { rating: number; max?: number; light?: boolean }) {
  return (
    <span className="flex gap-0.5" aria-label={`${rating} dari ${max} bintang`} role="img">
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={
            i < rating
              ? light ? 'text-smk-lime' : 'text-amber-400'
              : light ? 'text-white/25' : 'text-smk-ink/15'
          }
          aria-hidden
        >
          ★
        </span>
      ))}
    </span>
  );
}

export function Testimoni() {
  const [featured, ...rest] = testimonials;

  return (
    <section id="testimoni" className="bg-smk-sand py-[70px] md:py-[90px]">
      <div className="mx-auto max-w-[1180px] px-5 md:px-6">

        {/* ── HEADER ── */}
        <div className="mb-10 text-center md:mb-14">
          <div className="mb-3 text-[12px] font-bold uppercase tracking-[0.12em] text-smk-emerald md:text-[13px]">
            Kata Mereka
          </div>
          <h2 className="font-fraunces text-[clamp(26px,3.4vw,42px)] font-semibold leading-[1.1] tracking-tight text-smk-ink">
            Dirasakan langsung oleh siswa &amp; alumni.
          </h2>

          {/* Aggregate rating */}
          <div className="mt-5 inline-flex items-center gap-3 rounded-full border border-smk-ink/10 bg-white px-5 py-2.5 shadow-sm">
            <span className="font-fraunces text-xl font-semibold text-smk-ink">★ {aggregateRating.score}</span>
            <span className="text-[13px] text-smk-ink-soft">
              · {aggregateRating.count} ulasan
            </span>
            <span className="text-[11px] text-smk-ink-soft/60 border-l border-smk-ink/10 pl-3">
              (data placeholder)
            </span>
          </div>
        </div>

        {/* ── FEATURED CARD — full width, emerald bg ── */}
        {featured && (
          <article className="mb-4 rounded-[22px] bg-smk-emerald-deep p-7 md:mb-5 md:rounded-[26px] md:p-10">
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:gap-10">
              {/* Quote mark decoration */}
              <div
                aria-hidden
                className="font-fraunces flex-shrink-0 text-[80px] leading-none text-smk-lime/20 md:text-[100px]"
                style={{ lineHeight: '0.7', userSelect: 'none' }}
              >
                &ldquo;
              </div>
              <div className="flex-1">
                <StarRating rating={featured.rating} light />
                <blockquote className="mt-3 font-fraunces text-[clamp(17px,2.2vw,22px)] font-semibold leading-[1.45] tracking-tight text-white md:mt-4">
                  &ldquo;{featured.quote}&rdquo;
                </blockquote>
                <div className="mt-5 flex items-center gap-3 border-t border-white/12 pt-4 md:mt-6">
                  <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${AVATAR_COLORS[0]}`} aria-hidden>
                    {getInitials(featured.name)}
                  </div>
                  <div>
                    <p className="text-[14px] font-semibold text-white">{featured.name}</p>
                    <p className="text-[12px] text-[#9fc3b4]">{featured.role}</p>
                  </div>
                </div>
              </div>
            </div>
          </article>
        )}

        {/* ── SECONDARY GRID — 3 cards ── */}
        <div className="grid gap-4 sm:grid-cols-3 md:gap-5">
          {rest.map((t, i) => (
            <article
              key={t.name + t.role}
              className="group flex flex-col gap-4 rounded-[18px] border border-smk-ink/8 bg-white p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_40px_-12px_rgba(6,69,52,0.18)] md:rounded-[20px]"
            >
              <StarRating rating={t.rating} />
              <blockquote className="flex-1 text-[13px] leading-[1.75] text-smk-ink-soft md:text-[14px]">
                &ldquo;{t.quote}&rdquo;
              </blockquote>
              <div className="flex items-center gap-3 border-t border-smk-ink/6 pt-4">
                <div
                  className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${AVATAR_COLORS[(i + 1) % AVATAR_COLORS.length]}`}
                  aria-hidden
                >
                  {getInitials(t.name)}
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-smk-ink">{t.name}</p>
                  <p className="text-[12px] text-smk-ink-soft">{t.role}</p>
                </div>
              </div>
            </article>
          ))}
        </div>

        {/* ── PLACEHOLDER WARNING — visible to dev/editor, muted to user ── */}
        <p className="mt-6 text-center text-[11px] text-smk-ink/40 md:text-[12px]">
          ⚠️ Testimoni &amp; rating di atas adalah <strong>placeholder contoh</strong>.
          Wajib diganti dengan data nyata beserta persetujuan tertulis sebelum publikasi.
        </p>
      </div>
    </section>
  );
}
