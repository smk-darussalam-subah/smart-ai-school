import Image from 'next/image';

/**
 * Ekstrakurikuler & Pembinaan Karakter section.
 * Konten dari LANDING_CONTENT_resmi.md §Ekstrakurikuler.
 * Tiga pilar: Pramuka / Debat & Jurnalistik / Keagamaan Pesantren.
 * Layout: editorial 2-col — foto kampus kiri, kartu nilai kanan.
 *
 * Server Component.
 */

const PILLARS = [
  {
    icon: '⚜️',
    title: 'Pramuka',
    desc: 'Melatih kemandirian, kedisiplinan, dan kepemimpinan — fondasi Profil Pelajar Pancasila yang tangguh.',
    tags: ['Kepemimpinan', 'Disiplin', 'Mandiri'],
  },
  {
    icon: '🗣️',
    title: 'Debat & Jurnalistik',
    desc: 'Mengembangkan berpikir kritis, komunikasi efektif, dan kepercayaan diri tampil di publik.',
    tags: ['Bernalar Kritis', 'Komunikatif', 'Kolaborasi'],
  },
  {
    icon: '☪️',
    title: 'Pembinaan Pesantren',
    desc: 'Kajian keagamaan harian, tahfidz, dan pengembangan akhlak — karakter religius dan rahmatan lil \'alamin.',
    tags: ['Religius', 'Akhlak Mulia', 'Toleran'],
  },
] as const;

const VALUES = [
  { label: 'Beriman & Bertaqwa', color: 'bg-smk-emerald-deep text-smk-lime' },
  { label: 'Mandiri', color: 'bg-smk-lime text-[#22330a]' },
  { label: 'Kreatif', color: 'bg-smk-sand text-smk-ink border border-smk-ink/10' },
  { label: 'Bernalar Kritis', color: 'bg-smk-emerald text-white' },
  { label: 'Kolaboratif', color: 'bg-smk-sand text-smk-ink border border-smk-ink/10' },
  { label: 'Komunikatif', color: 'bg-smk-emerald-deep text-smk-lime' },
] as const;

export function Ekstrakurikuler() {
  return (
    <section id="ekskul" className="bg-smk-cream py-[70px] md:py-[90px]">
      <div className="mx-auto max-w-[1180px] px-5 md:px-6">

        {/* ── HEADER ── */}
        <div className="mb-10 flex flex-col gap-4 md:mb-14 md:flex-row md:items-end md:justify-between">
          <div className="max-w-[520px]">
            <div className="mb-3 text-[12px] font-bold uppercase tracking-[0.12em] text-smk-emerald md:text-[13px]">
              Ekstrakurikuler &amp; Karakter
            </div>
            <h2 className="font-fraunces text-[clamp(26px,3.4vw,42px)] font-semibold leading-[1.1] tracking-tight text-smk-ink">
              Skill kerja tumbuh bersama akhlak mulia.
            </h2>
          </div>
          <p className="max-w-[38ch] text-[14px] leading-relaxed text-smk-ink-soft md:text-right md:text-[15px]">
            Pesantren bukan sekadar tempat menginap — ini ekosistem pembentukan
            karakter yang hidup setiap hari.
          </p>
        </div>

        {/* ── MAIN GRID: foto + kartu nilai ── */}
        <div className="grid gap-6 md:grid-cols-[1fr_1.15fr] md:gap-10 lg:gap-14 mb-8 md:mb-10">

          {/* Left: campus photo + profil pelajar pills */}
          <div className="flex flex-col gap-4">
            <div className="relative h-[260px] overflow-hidden rounded-[20px] sm:h-[320px] md:h-full md:min-h-[380px] md:rounded-[24px]">
              <Image
                src="/landing/campus.jpg"
                alt="Suasana kampus dan lingkungan pesantren SMK Darussalam Subah"
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 45vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-smk-emerald-deep/70 via-smk-emerald-deep/15 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-5 md:p-6">
                <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-smk-lime/80">
                  Profil Pelajar Pancasila
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {VALUES.map((v) => (
                    <span
                      key={v.label}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold md:text-[12px] ${v.color}`}
                    >
                      {v.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right: 3 pillars */}
          <div className="flex flex-col gap-4">
            {PILLARS.map((p) => (
              <div
                key={p.title}
                className="flex gap-4 rounded-[18px] border border-smk-ink/8 bg-white p-5 md:rounded-[20px] md:p-6"
              >
                {/* Icon */}
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-smk-sand text-2xl md:h-12 md:w-12 md:rounded-[14px]">
                  {p.icon}
                </div>
                <div className="flex-1">
                  <h3 className="font-fraunces mb-1 text-[16px] font-semibold text-smk-ink md:text-[18px]">
                    {p.title}
                  </h3>
                  <p className="mb-3 text-[13px] leading-[1.65] text-smk-ink-soft md:text-[14px]">
                    {p.desc}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {p.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-smk-emerald/10 px-2.5 py-0.5 text-[11px] font-medium text-smk-emerald-deep"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── BOTTOM STRIP: mini-galeri seragam & suasana ── */}
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:gap-4 lg:grid-cols-6">
          {[
            { src: '/landing/seragam-olahraga.jpg', alt: 'Seragam olahraga siswa SMK Darussalam Subah', label: 'Olahraga' },
            { src: '/landing/seragam-to.jpg',       alt: 'Seragam Teknik Otomotif TKRO', label: 'TKRO' },
            { src: '/landing/suasana-tjkt.jpg',     alt: 'Suasana praktik TJKT lab komputer', label: 'TJKT' },
            { src: '/landing/guru.jpg',             alt: 'Guru SMK Darussalam Subah', label: 'Guru' },
            { src: '/landing/school-front.jpg',     alt: 'Tampak depan gedung SMK Darussalam Subah', label: 'Gedung' },
            { src: '/landing/gedung-to.jpg',        alt: 'Gedung bengkel Teknik Otomotif', label: 'Bengkel' },
          ].map((img) => (
            <div
              key={img.src}
              className="relative aspect-square overflow-hidden rounded-[12px] md:rounded-[14px]"
            >
              <Image
                src={img.src}
                alt={img.alt}
                fill
                className="object-cover transition-transform duration-500 hover:scale-[1.05]"
                sizes="(max-width: 640px) 33vw, (max-width: 1024px) 25vw, 16vw"
              />
              <div className="absolute inset-0 bg-smk-ink/0 transition-colors hover:bg-smk-ink/12" />
              <div className="absolute bottom-2 left-2">
                <span className="rounded-md bg-smk-emerald-deep/75 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                  {img.label}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
