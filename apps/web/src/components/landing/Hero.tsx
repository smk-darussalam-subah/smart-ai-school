// C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\apps\web\src\components\landing\Hero.tsx
import Image from 'next/image';
import { ParallaxLayer } from './ParallaxLayer';

const SPMB_URL = 'https://taplink.cc/smkdarussalamsubah';
const WA_URL = 'https://wa.me/6287775564779';

/**
 * Hero section — 2-column editorial layout.
 * Left: copy + CTAs + trust stats.
 * Right: asymmetric collage of 3 real photos + accreditation badge.
 *
 * Server Component. Parallax decoration delegates to ParallaxLayer (client).
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden bg-smk-cream">
      {/* Ambient gradient backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 60% 70% at 10% 60%, #064534 0%, transparent 70%), radial-gradient(ellipse 50% 55% at 85% 15%, #c5f04a 0%, transparent 60%)',
        }}
      />

      {/* Parallax dot pattern — top-right decorative */}
      <ParallaxLayer
        speed={0.08}
        className="pointer-events-none absolute right-[-24px] top-[-24px] h-40 w-40 opacity-[0.15]"
      >
        <div
          className="h-full w-full"
          style={{
            backgroundImage:
              'radial-gradient(circle, #064534 1.5px, transparent 1.5px)',
            backgroundSize: '10px 10px',
          }}
        />
      </ParallaxLayer>

      {/* Parallax dot pattern — bottom-left decorative */}
      <ParallaxLayer
        speed={0.12}
        className="pointer-events-none absolute bottom-8 left-[-20px] h-28 w-28 opacity-[0.10]"
      >
        <div
          className="h-full w-full"
          style={{
            backgroundImage:
              'radial-gradient(circle, #c5f04a 1.5px, transparent 1.5px)',
            backgroundSize: '10px 10px',
          }}
        />
      </ParallaxLayer>

      <div className="relative mx-auto grid max-w-[1180px] items-center gap-8 px-5 py-12 md:grid-cols-[1.1fr_0.9fr] md:gap-10 md:px-6 md:py-[72px]">
        {/* ── LEFT COLUMN ── */}
        <div className="order-2 md:order-1">
          {/* Sub-brand tagline */}
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-smk-emerald md:text-[12px]">
            Sekolah Industri Berbasis Pesantren
          </p>

          {/* SPMB eyebrow pill */}
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-[#e7f3ec] px-3.5 py-1.5 text-[12px] font-semibold text-smk-emerald-deep md:mb-6 md:text-[13px]">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-smk-emerald-bright" />
            SPMB 2026/2027 Telah Dibuka
          </div>

          {/* H1 */}
          <h1 className="font-fraunces text-[36px] font-semibold leading-[1.04] tracking-tight text-smk-ink sm:text-[44px] md:text-[clamp(40px,5vw,62px)]">
            Berakhlak,
            <br />
            Berkeahlian,
            <br />
            <em className="not-italic text-smk-emerald">Siap Masa Depan.</em>
          </h1>

          {/* Lead text */}
          <p className="mb-6 mt-4 max-w-[44ch] text-base leading-relaxed text-smk-ink-soft md:mb-8 md:mt-5 md:text-[17px]">
            SMK Darussalam Subah memadukan pendidikan pesantren dengan keahlian
            vokasi terkini — lulusan santun, terampil, dan melek teknologi.
          </p>

          {/* CTA buttons */}
          <div className="flex flex-wrap gap-3">
            <a
              href={SPMB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-smk-emerald-deep px-5 py-3 text-[14px] font-semibold text-white shadow-sm shadow-smk-emerald-deep/30 transition-all hover:-translate-y-px hover:bg-smk-emerald md:px-6 md:py-3.5 md:text-[15px]"
            >
              Daftar Sekarang <span aria-hidden>→</span>
            </a>
            <a
              href={WA_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-smk-ink/12 px-5 py-3 text-[14px] font-semibold text-smk-ink transition-all hover:border-smk-emerald hover:text-smk-emerald md:px-6 md:py-3.5 md:text-[15px]"
            >
              Tanya via WhatsApp
            </a>
          </div>

          {/* Trust stats */}
          <div className="mt-8 flex flex-wrap gap-5 border-t border-smk-ink/8 pt-6 md:mt-10 md:gap-8 md:pt-8">
            {[
              { val: '318', label: '318 siswa telah bergabung' },
              { val: '3', label: 'Program Keahlian' },
              { val: '2008', label: 'Sejak Berdiri' },
            ].map((s) => (
              <div key={s.label}>
                <b className="block font-fraunces text-2xl font-semibold leading-none text-smk-ink md:text-[26px]">
                  {s.val}
                </b>
                <span className="mt-1 block text-[12px] text-smk-ink-soft md:text-[13px]">
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT COLUMN — photo collage ── */}
        <div className="relative order-1 h-[300px] sm:h-[380px] md:order-2 md:h-[500px]">
          {/* Large primary card — school-front.jpg (hero-1 removed by director) */}
          <div className="absolute inset-0 bottom-[32%] right-[26%] overflow-hidden rounded-[20px] bg-smk-emerald-deep/20 md:rounded-[24px]">
            <Image
              src="/landing/school-front.jpg"
              alt="Tampak depan SMK Darussalam Subah"
              fill
              priority
              className="object-cover"
              sizes="(max-width: 768px) 70vw, 35vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-smk-emerald-deep/40 to-transparent" />
          </div>

          {/* Top-right secondary card — campus.jpg (hero-2 removed by director) */}
          <div className="absolute right-0 top-[4%] h-[47%] w-[47%] overflow-hidden rounded-[16px] bg-smk-sand md:rounded-[20px]">
            <Image
              src="/landing/campus.jpg"
              alt="Suasana kampus SMK Darussalam Subah"
              fill
              className="object-cover"
              sizes="(max-width: 768px) 45vw, 22vw"
            />
            <div className="absolute inset-0 bg-gradient-to-br from-smk-emerald-deep/20 to-transparent" />
          </div>

          {/* Bottom-right tertiary card — transparent remove-bg PNG */}
          <div className="absolute bottom-0 right-[4%] h-[38%] w-[43%] overflow-hidden rounded-[16px] bg-smk-lime/40 md:rounded-[20px]">
            <Image
              src="/landing/hero-3-removebg-preview.png"
              alt="Siswa SMK Darussalam Subah"
              fill
              className="object-contain p-2"
              sizes="(max-width: 768px) 42vw, 20vw"
            />
          </div>

          {/* Floating badge — Akreditasi */}
          <div className="absolute bottom-[28%] left-[-4px] flex items-center gap-2.5 rounded-xl border border-smk-ink/10 bg-white px-3 py-2.5 shadow-[0_12px_32px_-16px_rgba(6,69,52,0.45)] md:left-[-12px] md:rounded-2xl md:px-4 md:py-3">
            <div className="relative h-8 w-8 flex-shrink-0 md:h-9 md:w-9">
              <Image
                src="/landing/logo-smk.png"
                alt="Logo SMK Darussalam Subah"
                fill
                className="rounded-lg object-contain"
                sizes="36px"
              />
            </div>
            <div>
              <b className="block text-[12px] text-smk-ink md:text-sm">Akreditasi B</b>
              <small className="text-[10px] text-smk-ink-soft md:text-[11px]">
                BAN-S/M · NPSN 20350670
              </small>
            </div>
          </div>

          {/* Decorative dot grid — top-right of collage */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-3 -top-3 h-20 w-20 opacity-20"
            style={{
              backgroundImage:
                'radial-gradient(circle, #064534 1px, transparent 1px)',
              backgroundSize: '8px 8px',
            }}
          />
        </div>
      </div>
    </section>
  );
}
