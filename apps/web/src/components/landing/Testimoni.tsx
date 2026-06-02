// C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\apps\web\src\components\landing\Testimoni.tsx
'use client';

/**
 * Testimoni section — grid layout, 2×2 desktop / 1-col mobile.
 *
 * ⚠️  ALL DATA BELOW IS PLACEHOLDER.
 *     Replace with real testimonials + written permission before going public.
 *
 * 'use client' is used only for hover effect that respects prefers-reduced-motion.
 * If you prefer a Server Component, remove hover styles and drop 'use client'.
 */

// ⚠️ PLACEHOLDER — ganti dengan testimoni nyata + izin sebelum publik
const testimonials = [
  {
    name: '[Nama Alumni]',
    role: 'Alumni TKRO · Angkatan [Tahun]',
    rating: 5,
    quote:
      'Belajar di sini bukan cuma dapat skill kerja, tapi juga akhlak. Saya langsung diterima kerja di kawasan industri setelah lulus.',
  },
  {
    name: '[Nama Siswa]',
    role: 'Siswa TJKT',
    rating: 5,
    quote:
      'Praktik jaringannya nyata, gurunya sabar membimbing. Lingkungan pesantrennya bikin disiplin.',
  },
  {
    name: '[Nama Orang Tua]',
    role: 'Orang Tua Siswa',
    rating: 5,
    quote:
      'Anak saya jadi lebih mandiri dan religius. Kombinasi pesantren dan keahlian yang dicari zaman sekarang.',
  },
  {
    name: '[Nama Alumni]',
    role: 'Alumni AKL · Angkatan [Tahun]',
    rating: 4,
    quote:
      'Pembelajaran akuntansinya aplikatif, siap kerja di perkantoran.',
  },
] as const;

// Rating agregat juga placeholder: segera ganti dengan data nyata
const aggregateRating = { score: 4.9, count: '[jumlah]' };

/** Returns the first 2 characters of a name as avatar initials. */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
  }
  return (parts[0]?.slice(0, 2) ?? '??').toUpperCase();
}

/** Renders ★ rating as filled / empty stars. */
function StarRating({ rating, max = 5 }: { rating: number; max?: number }) {
  return (
    <span className="flex gap-0.5" aria-label={`${rating} dari ${max} bintang`}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={i < rating ? 'text-amber-400' : 'text-smk-ink/15'}
          aria-hidden
        >
          ★
        </span>
      ))}
    </span>
  );
}

export function Testimoni() {
  return (
    <section id="testimoni" className="bg-smk-cream py-[70px] md:py-[90px]">
      <div className="mx-auto max-w-[1180px] px-5 md:px-6">
        {/* Header */}
        <div className="mb-10 text-center md:mb-12">
          <div className="mb-3 text-[12px] font-bold uppercase tracking-[0.12em] text-smk-emerald md:text-[13px]">
            Kata Mereka
          </div>
          <h2 className="font-fraunces text-[clamp(26px,3.4vw,42px)] font-semibold leading-[1.1] tracking-tight text-smk-ink">
            Dirasakan langsung oleh siswa &amp; alumni.
          </h2>

          {/* Aggregate rating bar */}
          <div className="mt-4 inline-flex flex-col items-center gap-1">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-fraunces font-semibold text-smk-ink">
                ★ {aggregateRating.score}
              </span>
              <span className="text-[14px] text-smk-ink-soft">
                · {aggregateRating.count} ulasan
              </span>
            </div>
            {/* Placeholder disclaimer */}
            <p className="text-[11px] text-smk-ink-soft/70">
              (data placeholder — segera diperbarui)
            </p>
          </div>
        </div>

        {/* Grid 2×2 */}
        <div className="grid gap-4 sm:grid-cols-2 md:gap-[18px]">
          {testimonials.map((t) => (
            <article
              key={t.name + t.role}
              className="flex flex-col gap-4 rounded-[18px] border border-smk-ink/8 bg-white p-6 transition-shadow duration-200 hover:shadow-[0_8px_32px_-12px_rgba(6,69,52,0.18)] md:rounded-[20px] md:p-7"
            >
              {/* Stars */}
              <StarRating rating={t.rating} />

              {/* Quote */}
              <blockquote className="flex-1 text-[14px] leading-[1.7] text-smk-ink-soft md:text-[15px]">
                &ldquo;{t.quote}&rdquo;
              </blockquote>

              {/* Author */}
              <div className="flex items-center gap-3 border-t border-smk-ink/6 pt-4">
                {/* Avatar — initials circle */}
                <div
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-smk-emerald-deep text-[13px] font-bold text-smk-lime"
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

        {/* Global placeholder warning */}
        <p className="mt-6 text-center text-[12px] text-smk-ink-soft/60">
          ⚠️ Testimoni di atas adalah placeholder. Segera ganti dengan data nyata
          beserta persetujuan tertulis sebelum publikasi.
        </p>
      </div>
    </section>
  );
}
