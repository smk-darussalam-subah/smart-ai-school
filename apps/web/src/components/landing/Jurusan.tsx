// C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\apps\web\src\components\landing\Jurusan.tsx
import Image from 'next/image';
import Link from 'next/link';
import { TiltCard } from './TiltCard';

/**
 * Jurusan section — Bento 3-card layout.
 * Each card uses a real photo as full-bleed background (fill + overlay gradient).
 * Cards are wrapped in TiltCard for 3D tilt on pointer move.
 *
 * Server Component — TiltCard is imported as a 'use client' boundary.
 */

const jurusan = [
  {
    num: '01',
    slug: 'tkro',
    photo: '/landing/jurusan-tkro.jpg',
    name: 'Teknik Kendaraan Ringan',
    sub: 'TKRO',
    desc: 'Perawatan & perbaikan kendaraan ringan, sistem kelistrikan, chassis, hingga diagnosa mesin via scanner — praktik bengkel nyata berstandar industri.',
    tags: ['Kendaraan Ringan', 'Kelistrikan', 'Diagnosa Scanner'],
    variant: 'dark' as const,
  },
  {
    num: '02',
    slug: 'tjkt',
    photo: '/landing/jurusan-tjkt.jpg',
    name: 'Jaringan Komputer & Telekomunikasi',
    sub: 'TJKT',
    desc: 'Instalasi LAN/WAN, server Linux & Windows, fiber optik, keamanan jaringan, dan infrastruktur telekomunikasi — kompetensi paling dicari di era digital.',
    tags: ['Network', 'Fiber Optik', 'Server Linux'],
    variant: 'sand' as const,
  },
  {
    num: '03',
    slug: 'akl',
    photo: '/landing/jurusan-akl.jpg',
    name: 'Akuntansi & Keuangan Lembaga',
    sub: 'AKL',
    desc: 'Siklus akuntansi lengkap, perpajakan, administrasi perkantoran, software akuntansi — keterampilan keuangan fundamental yang dibutuhkan semua jenis usaha.',
    tags: ['Pembukuan', 'Perpajakan', 'Software Akuntansi'],
    variant: 'lime' as const,
  },
] as const;

type Variant = 'dark' | 'sand' | 'lime';

const styles: Record<
  Variant,
  {
    overlay: string;
    num: string;
    title: string;
    sub: string;
    desc: string;
    tag: string;
    go: string;
    border: string;
  }
> = {
  dark: {
    overlay: 'from-smk-emerald-deep/90 via-smk-emerald-deep/70 to-transparent',
    num: 'text-smk-lime/50',
    title: 'text-[#d7efe4]',
    sub: 'text-smk-lime/80',
    desc: 'text-[#a9cdbd]',
    tag: 'bg-white/10 text-smk-lime/90',
    go: 'text-smk-lime hover:text-white',
    border: 'border-white/8',
  },
  sand: {
    overlay: 'from-white/95 via-white/80 to-white/20',
    num: 'text-smk-ink/25',
    title: 'text-smk-ink',
    sub: 'text-smk-emerald',
    desc: 'text-smk-ink-soft',
    tag: 'bg-smk-emerald/10 text-smk-emerald-deep',
    go: 'text-smk-emerald-deep hover:text-smk-emerald',
    border: 'border-smk-ink/8',
  },
  lime: {
    overlay: 'from-[#c5f04a]/95 via-[#c5f04a]/80 to-[#c5f04a]/20',
    num: 'text-[#22330a]/30',
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

        {/* Bento grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 md:gap-[18px]">
          {jurusan.map((j) => {
            const s = styles[j.variant];
            return (
              <TiltCard
                key={j.num}
                className={`group relative min-h-[320px] overflow-hidden rounded-[20px] border bg-smk-emerald-deep/10 md:min-h-[360px] md:rounded-[22px] ${s.border}`}
              >
                {/* Background photo */}
                <Image
                  src={j.photo}
                  alt={`Jurusan ${j.name} SMK Darussalam Subah`}
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
                {/* Gradient overlay */}
                <div
                  className={`absolute inset-0 bg-gradient-to-t ${s.overlay}`}
                />

                {/* Content */}
                <div className="relative flex h-full flex-col justify-between p-6 md:p-7">
                  <div>
                    <p className={`font-fraunces text-sm mb-1.5 ${s.num}`}>{j.num}</p>
                    <h3
                      className={`font-fraunces text-[22px] font-semibold leading-tight tracking-tight md:text-2xl mb-1 ${s.title}`}
                    >
                      {j.name}
                    </h3>
                    <p
                      className={`text-[11px] font-bold uppercase tracking-widest mb-3 ${s.sub}`}
                    >
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
