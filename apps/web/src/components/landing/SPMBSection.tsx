'use client';

import Image from 'next/image';
import { useEffect, useRef } from 'react';

const SPMB_URL = 'https://taplink.cc/smkdarussalamsubah';
const WA_URL = 'https://wa.me/6287775564779';

/**
 * SPMB Section — infografik alir pendaftaran.
 * Layout: persyaratan berkas (kartu ikon) + 5 langkah alir (horizontal desktop / vertikal mobile).
 * Animasi: staggered scroll-reveal via IntersectionObserver, rAF connector draw.
 * Hormati prefers-reduced-motion.
 *
 * Server Component tidak memungkinkan karena butuh IntersectionObserver → 'use client'.
 */

const REQUIREMENTS = [
  { icon: '🪪', label: 'NISN' },
  { icon: '📋', label: 'Kartu Keluarga (KK)' },
  { icon: '🪪', label: 'KTP Orang Tua' },
  { icon: '📄', label: 'Akta Kelahiran' },
  { icon: '📜', label: 'Ijazah / SKL (jika sudah ada)' },
] as const;

const STEPS = [
  {
    num: '01',
    icon: '📂',
    title: 'Siapkan Berkas',
    desc: 'NISN, KK, KTP Ortu, Akta Kelahiran, dan Ijazah/SKL siap di tangan.',
  },
  {
    num: '02',
    icon: '✍️',
    title: 'Isi Biodata',
    desc: 'Lengkap & benar sesuai data calon murid.',
  },
  {
    num: '03',
    icon: '📝',
    title: '4 Bagian Formulir',
    desc: '① Data Siswa → ② Program Studi → ③ Sekolah Asal → ④ Data Orang Tua. Klik Next tiap bagian.',
  },
  {
    num: '04',
    icon: '✅',
    title: 'Submit',
    desc: 'Klik Submit setelah semua bagian terisi lengkap.',
  },
  {
    num: '05',
    icon: '📧',
    title: 'Bukti via Email',
    desc: 'Formulir & Bukti Pendaftaran otomatis dikirim ke email pendaftar.',
  },
] as const;

/** Hook: fade-in + slide-up on enter viewport, staggered by index */
function useReveal() {
  const refs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      refs.current.forEach((el) => {
        if (el) el.style.opacity = '1';
      });
      return;
    }

    refs.current.forEach((el) => {
      if (!el) return;
      el.style.opacity = '0';
      el.style.transform = 'translateY(20px)';
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target as HTMLElement;
          const idx = Number(el.dataset.revealIdx ?? 0);
          el.style.transition = `opacity 0.45s ease ${idx * 80}ms, transform 0.45s ease ${idx * 80}ms`;
          el.style.opacity = '1';
          el.style.transform = 'translateY(0)';
          observer.unobserve(el);
        });
      },
      { threshold: 0.1 }
    );

    refs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []); // intentionally run once on mount — refs populated at render time

  return refs;
}

const spmbPhotos = [
  { src: '/landing/spmb-1.png', alt: 'Preview seragam & suasana SPMB SMK Darussalam Subah 2026' },
  { src: '/landing/spmb-2.png', alt: 'Kegiatan pendaftaran SPMB SMK Darussalam Subah' },
  { src: '/landing/spmb-3.png', alt: 'Siswa baru SMK Darussalam Subah' },
] as const;

export function SPMBSection() {
  const reqRefs = useReveal();
  const stepRefs = useReveal();

  return (
    <section id="spmb" className="bg-smk-cream py-[70px] md:py-[90px] overflow-hidden">
      <div className="mx-auto max-w-[1180px] px-5 md:px-6">

        {/* ── HEADER ── */}
        <div className="mb-10 text-center md:mb-14">
          <div className="mb-3 text-[12px] font-bold uppercase tracking-[0.12em] text-smk-emerald md:text-[13px]">
            SPMB 2026/2027
          </div>
          <h2 className="font-fraunces text-[clamp(26px,3.4vw,42px)] font-semibold leading-[1.1] tracking-tight text-smk-ink">
            Daftar sekarang, raih masa depanmu.
          </h2>
          <p className="mx-auto mt-3 max-w-[50ch] text-[14px] leading-relaxed text-smk-ink-soft md:text-[15px]">
            Kuota terbatas 234 kursi — ikuti alur pendaftaran di bawah ini.
          </p>
        </div>

        {/* ── PERSYARATAN BERKAS ── */}
        <div className="mb-12 md:mb-16">
          <h3 className="mb-5 text-center text-[13px] font-bold uppercase tracking-[0.1em] text-smk-emerald-deep md:text-[14px]">
            Siapkan berkas ini terlebih dahulu
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 md:gap-4">
            {REQUIREMENTS.map((req, i) => (
              <div
                key={req.label}
                ref={(el) => { reqRefs.current[i] = el; }}
                data-reveal-idx={i}
                className="flex flex-col items-center gap-2.5 rounded-[16px] border border-smk-ink/8 bg-smk-sand px-4 py-5 text-center md:rounded-[18px]"
              >
                <span className="text-[28px] leading-none md:text-[32px]" aria-hidden>
                  {req.icon}
                </span>
                <span className="text-[12px] font-semibold leading-snug text-smk-ink md:text-[13px]">
                  {req.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── ALUR LANGKAH ── */}
        <div className="mb-12 md:mb-16">
          <h3 className="mb-8 text-center text-[13px] font-bold uppercase tracking-[0.1em] text-smk-emerald-deep md:mb-10 md:text-[14px]">
            Alur pendaftaran online (5 langkah)
          </h3>

          {/* Desktop: horizontal row with connectors / Mobile: vertical stack */}
          <div className="relative">
            {/* Desktop connector line — purely decorative */}
            <div
              aria-hidden
              className="absolute left-[10%] right-[10%] top-[38px] hidden h-px bg-smk-emerald/25 lg:block"
              style={{ zIndex: 0 }}
            />

            <ol className="relative grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 lg:gap-3 lg:items-start">
              {STEPS.map((step, i) => (
                <li
                  key={step.num}
                  ref={(el) => { stepRefs.current[i] = el; }}
                  data-reveal-idx={i}
                  className="relative flex lg:flex-col items-start lg:items-center gap-4 lg:gap-3 lg:text-center"
                >
                  {/* Mobile: vertical connector (except last) */}
                  {i < STEPS.length - 1 && (
                    <div
                      aria-hidden
                      className="absolute left-[19px] top-[52px] h-[calc(100%+1rem)] w-px bg-smk-emerald/20 lg:hidden"
                    />
                  )}

                  {/* Step circle */}
                  <div
                    className="relative z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-smk-emerald-deep text-smk-lime text-[24px] shadow-md lg:h-[76px] lg:w-[76px] lg:rounded-[20px] lg:text-[32px] lg:shadow-[0_8px_24px_-8px_rgba(6,69,52,0.4)]"
                    aria-hidden
                  >
                    {step.icon}
                  </div>

                  {/* Text */}
                  <div className="flex-1 pb-4 lg:pb-0">
                    <span className="mb-0.5 block text-[11px] font-bold uppercase tracking-widest text-smk-emerald/70">
                      Langkah {step.num}
                    </span>
                    <h4 className="font-fraunces mb-1.5 text-[15px] font-semibold leading-snug tracking-tight text-smk-ink md:text-[16px]">
                      {step.title}
                    </h4>
                    <p className="text-[12px] leading-[1.6] text-smk-ink-soft md:text-[13px]">
                      {step.desc}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* ── BOTTOM: photos + CTA + info ── */}
        <div className="grid gap-10 md:grid-cols-2 md:gap-14 lg:gap-20 items-start">
          {/* Left: quota + CTA */}
          <div>
            {/* Quota badges */}
            <div className="mb-6 flex flex-wrap gap-3">
              <div className="flex items-center gap-2 rounded-full border border-smk-ink/10 bg-smk-sand px-4 py-2.5">
                <span className="text-xl">🎓</span>
                <div>
                  <b className="block text-[15px] font-fraunces font-semibold text-smk-ink leading-none">
                    234 Kursi
                  </b>
                  <small className="text-[11px] text-smk-ink-soft">Total kuota tersedia</small>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-smk-ink/10 bg-smk-sand px-4 py-2.5">
                <span className="text-xl">👥</span>
                <div>
                  <b className="block text-[15px] font-fraunces font-semibold text-smk-ink leading-none">
                    26 Siswa
                  </b>
                  <small className="text-[11px] text-smk-ink-soft">Per kelas</small>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-full bg-smk-lime px-4 py-2.5">
                <span className="text-xl">⏳</span>
                <span className="text-[12px] font-bold text-[#22330a]">Terbatas!</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <a
                href={SPMB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-smk-emerald-deep px-5 py-3 text-[14px] font-semibold text-white shadow-sm shadow-smk-emerald-deep/30 transition-all hover:-translate-y-px hover:bg-smk-emerald md:px-6 md:py-3.5 md:text-[15px]"
              >
                Daftar Online <span aria-hidden>→</span>
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

            {/* Persyaratan umum */}
            <div className="mt-6 rounded-[14px] border border-smk-emerald/20 bg-[#e7f3ec] p-4 md:mt-7 md:rounded-[16px]">
              <p className="text-[13px] font-semibold text-smk-emerald-deep mb-1">
                Persyaratan Umum Pendaftar
              </p>
              <ul className="list-inside list-disc text-[13px] text-smk-ink-soft space-y-0.5">
                <li>Lulusan SMP/MTs atau sederajat</li>
                <li>Foto copy ijazah/SKL &amp; rapor semester 1–5</li>
                <li>Pas foto terbaru 3×4 (2 lembar)</li>
              </ul>
            </div>
          </div>

          {/* Right: photos preview */}
          <div className="flex gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-3 md:overflow-visible md:pb-0 md:gap-4">
            {spmbPhotos.map((photo) => (
              <div
                key={photo.src}
                className="relative aspect-[3/4] w-[180px] flex-shrink-0 overflow-hidden rounded-[14px] md:w-auto md:rounded-[16px]"
              >
                <Image
                  src={photo.src}
                  alt={photo.alt}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 180px, (max-width: 1024px) 33vw, 180px"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
