import Link from 'next/link';
import { TiltCard } from './TiltCard';

/**
 * Jurusan section — Bento 3-card layout.
 * V1: kartu solid bersih tanpa background foto — teks tajam terbaca.
 * Palet bento: TKRO emerald gelap, TJKT sand, AKL lime.
 * Foto jurusan dipakai di halaman /jurusan/[slug].
 */

const jurusan = [
  {
    num: '01',
    slug: 'tkro',
    name: 'Teknik Kendaraan Ringan',
    sub: 'TKRO',
    desc: 'Perawatan & perbaikan kendaraan ringan, sistem kelistrikan, chassis, hingga diagnosa mesin via scanner — praktik bengkel nyata berstandar industri.',
    tags: ['Kendaraan Ringan', 'Kelistrikan', 'Diagnosa Scanner'],
    variant: 'dark' as const,
  },
  {
    num: '02',
    slug: 'tjkt',
    name: 'Jaringan Komputer & Telekomunikasi',
    sub: 'TJKT',
    desc: 'Instalasi LAN/WAN, server Linux & Windows, fiber optik, keamanan jaringan, dan infrastruktur telekomunikasi — kompetensi paling dicari di era digital.',
    tags: ['Network', 'Fiber Optik', 'Server Linux'],
    variant: 'sand' as const,
  },
  {
    num: '03',
    slug: 'akl',
    name: 'Akuntansi & Keuangan Lembaga',
    sub: 'AKL',
    desc: 'Siklus akuntansi lengkap, perpajakan, administrasi perkantoran, software akuntansi — keterampilan keuangan fundamental yang dibutuhkan semua jenis usaha.',
    tags: ['Pembukuan', 'Perpajakan', 'Software Akuntansi'],
    variant: 'lime' as const,
  },
] as const;

type Variant = 'dark' | 'sand' | 'lime';

/* Icon SVG per jurusan */
function IconTKRO({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconTJKT({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
      <path d="M7 8h.01M11 8h.01M15 8h.01" />
    </svg>
  );
}

function IconAKL({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M9 7H6a2 2 0 00-2 2v9a2 2 0 002 2h12a2 2 0 002-2V9a2 2 0 00-2-2h-3" />
      <path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M9 7h6" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  );
}

const icons = {
  dark: IconTKRO,
  sand: IconTJKT,
  lime: IconAKL,
} as const;

const styles: Record<
  Variant,
  {
    card: string;
    num: string;
    iconBg: string;
    iconColor: string;
    title: string;
    sub: string;
    desc: string;
    tag: string;
    go: string;
    border: string;
  }
> = {
  dark: {
    card: 'bg-smk-emerald-deep',
    num: 'text-smk-lime/20',
    iconBg: 'bg-smk-lime/15',
    iconColor: 'text-smk-lime',
    title: 'text-[#d7efe4]',
    sub: 'text-smk-lime/80',
    desc: 'text-[#a9cdbd]',
    tag: 'bg-white/10 text-smk-lime/90',
    go: 'text-smk-lime hover:text-white',
    border: 'border-white/8',
  },
  sand: {
    card: 'bg-[#f0ebe0]',
    num: 'text-smk-ink/15',
    iconBg: 'bg-smk-emerald/12',
    iconColor: 'text-smk-emerald-deep',
    title: 'text-smk-ink',
    sub: 'text-smk-emerald',
    desc: 'text-smk-ink-soft',
    tag: 'bg-smk-emerald/10 text-smk-emerald-deep',
    go: 'text-smk-emerald-deep hover:text-smk-emerald',
    border: 'border-smk-ink/8',
  },
  lime: {
    card: 'bg-[#c5f04a]',
    num: 'text-[#22330a]/20',
    iconBg: 'bg-smk-emerald-deep/12',
    iconColor: 'text-smk-emerald-deep',
    title: 'text-[#22330a]',
    sub: 'text-smk-emerald-deep',
    desc: 'text-[#3f5417]',
    tag: 'bg-smk-emerald-deep/10 text-smk-emerald-deep',
    go: 'text-smk-emerald-deep hover:text-smk-emerald',
    border: 'border-[#22330a]/10',
  },
};

export function Jurusan() {
  return (
    <section id="jurusan" className="bg-smk-cream py-[70px] md:py-[90px]">
      <div className="mx-auto max-w-[1180px] px-5 md:px-6">
        {/* Header */}
        <div className="mb-10 flex flex-col gap-4 md:mb-12 md:flex-row md:items-end md:justify-between">
          <div className="max-w-[560px]">
            <div className="mb-3 text-[12px] font-bold uppercase tracking-[0.12em] text-smk-emerald md:text-[13px]">
              Program Keahlian
            </div>
            <h2 className="font-fraunces text-[clamp(26px,3.4vw,42px)] font-semibold leading-[1.1] tracking-tight text-smk-ink">
              Tiga jurusan, satu tujuan: lulusan siap kerja.
            </h2>
          </div>
          <p className="max-w-[36ch] text-[14px] leading-relaxed text-smk-ink-soft md:text-right md:text-[15px]">
            Kurikulum berbasis industri, dipadu nilai pesantren. Pilih jalur sesuai
            minat dan masa depanmu.
          </p>
        </div>

        {/* Bento grid — solid cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 md:gap-[18px]">
          {jurusan.map((j) => {
            const s = styles[j.variant];
            const Icon = icons[j.variant];
            return (
              <TiltCard
                key={j.num}
                className={`group relative min-h-[320px] overflow-hidden rounded-[20px] border md:min-h-[360px] md:rounded-[22px] ${s.card} ${s.border}`}
              >
                {/* Decorative large number — background watermark */}
                <span
                  aria-hidden
                  className={`pointer-events-none absolute -right-2 -top-3 font-fraunces text-[120px] font-semibold leading-none select-none md:text-[140px] ${s.num}`}
                >
                  {j.num}
                </span>

                {/* Content */}
                <div className="relative flex h-full flex-col justify-between p-6 md:p-7">
                  <div>
                    {/* Icon */}
                    <div className={`mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl md:h-12 md:w-12 md:rounded-[14px] ${s.iconBg} ${s.iconColor}`}>
                      <Icon className="h-5 w-5 md:h-6 md:w-6" />
                    </div>

                    <h3
                      className={`font-fraunces mb-1 text-[22px] font-semibold leading-tight tracking-tight md:text-2xl ${s.title}`}
                    >
                      {j.name}
                    </h3>
                    <p className={`mb-3 text-[11px] font-bold uppercase tracking-widest ${s.sub}`}>
                      {j.sub}
                    </p>
                    <p className={`text-[13px] leading-[1.6] md:text-sm ${s.desc}`}>
                      {j.desc}
                    </p>

                    {/* Tags */}
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {j.tags.map((t) => (
                        <span
                          key={t}
                          className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${s.tag}`}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>

                  <Link
                    href={`/jurusan/${j.slug}`}
                    className={`mt-5 inline-flex items-center gap-1.5 text-[13px] font-semibold transition-colors md:text-sm ${s.go}`}
                  >
                    Lihat Detail Jurusan →
                  </Link>
                </div>
              </TiltCard>
            );
          })}
        </div>
      </div>
    </section>
  );
}
