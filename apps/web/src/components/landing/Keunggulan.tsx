// C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\apps\web\src\components\landing\Keunggulan.tsx
import Image from 'next/image';

/**
 * Keunggulan section — 4 differentiators in a 2×2 editorial grid.
 * Cards alternate between dark emerald, sand, lime, and emerald variants.
 *
 * Server Component.
 */

type CardVariant = 'dark' | 'sand' | 'lime' | 'emerald';

interface KeunggulanCard {
  num: string;
  icon: string;
  title: string;
  desc: string;
  variant: CardVariant;
  photo?: string;
  photoAlt?: string;
}

const cards: readonly KeunggulanCard[] = [
  {
    num: '01',
    icon: '🏭',
    title: 'Dekat KITB & PLTU Batang',
    desc: 'Kawasan Industri Terpadu Batang (KITB) dan PLTU Batang berada di dekat sekolah — memberikan peluang PKL, rekrutmen langsung, dan penyerapan tenaga kerja terampil yang luar biasa bagi lulusan kami.',
    variant: 'dark',
    photo: '/landing/kunjungan-industri-1.jpg',
    photoAlt: 'Kunjungan industri siswa SMK Darussalam ke kawasan KITB Batang',
  },
  {
    num: '02',
    icon: '🌿',
    title: 'Era Digital & Industri Hijau',
    desc: 'Kurikulum kami dirancang untuk menghadapi masa depan: kompetensi digitalisasi, otomasi, dan kesadaran lingkungan (green industry) menjadi bagian integral dari setiap program keahlian.',
    variant: 'sand',
  },
  {
    num: '03',
    icon: '🔧',
    title: 'Teaching Factory (TEFA)',
    desc: 'Praktik kerja riil melalui model Teaching Factory — bengkel otomotif layanan masyarakat, POS bengkel, dan jasa jaringan TJKT. Siswa belajar sambil menghasilkan karya nyata berstandar industri.',
    variant: 'lime',
  },
  {
    num: '04',
    icon: '🤖',
    title: 'Ekosistem DIIS',
    desc: 'SMK Darussalam Subah adalah sekolah pertama yang membangun sistem AI terintegrasi sendiri (DIIS). Dari manajemen kelas, absensi digital, hingga talent scouting bersama mitra industri KITB — semua dalam satu platform.',
    variant: 'emerald',
  },
] as const;

const variantStyles: Record<
  CardVariant,
  {
    card: string;
    num: string;
    iconBg: string;
    title: string;
    desc: string;
    iconText: string;
  }
> = {
  dark: {
    card: 'bg-smk-emerald-deep text-white',
    num: 'text-smk-lime/40',
    iconBg: 'bg-smk-lime/15',
    iconText: 'text-smk-lime',
    title: 'text-white',
    desc: 'text-[#a9cdbd]',
  },
  sand: {
    card: 'bg-smk-sand text-smk-ink',
    num: 'text-smk-ink/20',
    iconBg: 'bg-smk-emerald/12',
    iconText: 'text-smk-emerald-deep',
    title: 'text-smk-ink',
    desc: 'text-smk-ink-soft',
  },
  lime: {
    card: 'bg-smk-lime text-[#22330a]',
    num: 'text-[#22330a]/20',
    iconBg: 'bg-smk-emerald-deep/12',
    iconText: 'text-smk-emerald-deep',
    title: 'text-[#22330a]',
    desc: 'text-[#3f5417]',
  },
  emerald: {
    card: 'bg-smk-emerald text-white',
    num: 'text-white/25',
    iconBg: 'bg-white/15',
    iconText: 'text-white',
    title: 'text-white',
    desc: 'text-[#cce8df]',
  },
};

export function Keunggulan() {
  return (
    <section id="keunggulan" className="bg-smk-cream py-[70px] md:py-[90px]">
      <div className="mx-auto max-w-[1180px] px-5 md:px-6">
        {/* Header */}
        <div className="mb-10 flex flex-col gap-4 md:mb-12 md:flex-row md:items-end md:justify-between">
          <div className="max-w-[560px]">
            <div className="mb-3 text-[12px] font-bold uppercase tracking-[0.12em] text-smk-emerald md:text-[13px]">
              Keunggulan Kami
            </div>
            <h2 className="font-fraunces text-[clamp(26px,3.4vw,42px)] font-semibold leading-[1.1] tracking-tight text-smk-ink">
              Empat alasan memilih Darussalam.
            </h2>
          </div>
          <p className="max-w-[38ch] text-[14px] leading-relaxed text-smk-ink-soft md:text-right md:text-[15px]">
            Posisi strategis, kurikulum futuristik, pembelajaran berbasis kerja nyata,
            dan teknologi AI sekolah sendiri.
          </p>
        </div>

        {/* 2×2 grid */}
        <div className="grid gap-4 sm:grid-cols-2 md:gap-[18px]">
          {cards.map((card) => {
            const s = variantStyles[card.variant];
            return (
              <div
                key={card.num}
                className={`relative min-h-[280px] overflow-hidden rounded-[20px] p-7 md:min-h-[300px] md:rounded-[22px] md:p-9 ${s.card}`}
              >
                {/* Background photo (only for card 1) */}
                {card.photo && (
                  <>
                    <Image
                      src={card.photo}
                      alt={card.photoAlt ?? ''}
                      fill
                      className="object-cover opacity-25"
                      sizes="(max-width: 640px) 100vw, 50vw"
                    />
                    <div className="absolute inset-0 bg-smk-emerald-deep/70" />
                  </>
                )}

                {/* Content (relative so it sits above the photo overlay) */}
                <div className="relative flex h-full flex-col justify-between gap-6">
                  <div>
                    {/* Icon + number */}
                    <div className="mb-5 flex items-center justify-between">
                      <div
                        className={`flex h-12 w-12 items-center justify-center rounded-xl text-2xl md:h-14 md:w-14 md:rounded-[14px] md:text-3xl ${s.iconBg} ${s.iconText}`}
                      >
                        {card.icon}
                      </div>
                      <span
                        className={`font-fraunces text-4xl font-semibold md:text-5xl ${s.num}`}
                      >
                        {card.num}
                      </span>
                    </div>

                    <h3
                      className={`font-fraunces text-[20px] font-semibold leading-tight tracking-tight md:text-[24px] mb-3 ${s.title}`}
                    >
                      {card.title}
                    </h3>
                    <p className={`text-[13px] leading-[1.65] md:text-sm ${s.desc}`}>
                      {card.desc}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
