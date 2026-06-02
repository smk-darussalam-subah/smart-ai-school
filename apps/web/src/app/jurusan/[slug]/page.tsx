// C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\apps\web\src\app\jurusan\[slug]\page.tsx
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

const SPMB_URL = 'https://taplink.cc/smkdarussalamsubah';
const WA_URL = 'https://wa.me/6287775564779';

// =============================================================================
// DATA
// =============================================================================

type JurusanSlug = 'tkro' | 'tjkt' | 'akl';
type Variant = 'dark' | 'sand' | 'lime';

interface JurusanData {
  slug: JurusanSlug;
  nama: string;
  sub: string;
  bidang: string;
  konsentrasi: string;
  deskripsi: string;
  dipelajari: readonly string[];
  prospek: readonly string[];
  foto: string;
  variant: Variant;
}

const jurusanData: Record<JurusanSlug, JurusanData> = {
  tkro: {
    slug: 'tkro',
    nama: 'Teknik Kendaraan Ringan Otomotif',
    sub: 'TKRO',
    bidang: 'Teknologi Manufaktur & Rekayasa',
    konsentrasi: 'Teknik Kendaraan Ringan',
    deskripsi:
      'Program keahlian TKRO membekali siswa dengan kompetensi teknis mendalam di bidang kendaraan ringan. Mulai dari perawatan berkala, perbaikan mesin, sistem kelistrikan modern, hingga diagnosa elektronik menggunakan scanner — semua dipelajari dalam bengkel berstandar industri. Lulusan siap bekerja di dealer resmi, industri manufaktur di kawasan KITB Batang, atau membuka bengkel mandiri.',
    dipelajari: [
      'Perawatan & perbaikan mesin kendaraan ringan',
      'Sistem kelistrikan dan elektronika kendaraan',
      'Chassis, suspensi, dan sistem pengereman',
      'Sistem bahan bakar konvensional & injeksi',
      'Diagnosa kerusakan menggunakan scanner OBD',
      'Keselamatan dan Kesehatan Kerja (K3) bengkel',
    ],
    prospek: [
      'Teknisi / mekanik bengkel resmi',
      'Industri manufaktur & perakitan (kawasan KITB)',
      'Wirausaha bengkel kendaraan mandiri',
      'Teknisi dealer otomotif nasional',
    ],
    foto: '/landing/jurusan-tkro.jpg',
    variant: 'dark',
  },
  tjkt: {
    slug: 'tjkt',
    nama: 'Teknik Jaringan Komputer & Telekomunikasi',
    sub: 'TJKT',
    bidang: 'Teknologi Informasi',
    konsentrasi: 'Teknik Komputer dan Jaringan',
    deskripsi:
      'Program keahlian TJKT menyiapkan tenaga profesional di bidang jaringan komputer dan infrastruktur digital. Siswa mempelajari desain, instalasi, konfigurasi, dan manajemen jaringan LAN/WAN, server, fiber optik, serta keamanan jaringan. Melalui Teaching Factory (TEFA), siswa mendapatkan pengalaman kerja nyata dalam proyek instalasi jaringan untuk lembaga dan UMKM sekitar.',
    dipelajari: [
      'Instalasi & konfigurasi jaringan LAN/WAN',
      'Administrasi server Linux & Windows Server',
      'Instalasi fiber optik & structured cabling',
      'Keamanan jaringan dasar & troubleshooting',
      'Administrasi sistem dan cloud computing dasar',
      'Infrastruktur telekomunikasi & VoIP',
    ],
    prospek: [
      'Teknisi jaringan & IT support',
      'Network engineer perusahaan swasta & pemerintah',
      'Instalatur fiber optik (ISP & provider)',
      'Industri digital, startup, & lembaga pemerintah',
    ],
    foto: '/landing/jurusan-tjkt.jpg',
    variant: 'sand',
  },
  akl: {
    slug: 'akl',
    nama: 'Akuntansi & Keuangan Lembaga',
    sub: 'AKL',
    bidang: 'Bisnis dan Manajemen',
    konsentrasi: 'Akuntansi',
    deskripsi:
      'Program keahlian AKL membentuk tenaga profesional yang kompeten di bidang akuntansi dan keuangan. Siswa mempelajari siklus akuntansi lengkap secara manual maupun digital, perpajakan, administrasi perkantoran modern, dan pengelolaan keuangan lembaga. Kurikulum berbasis praktik memastikan lulusan siap terjun langsung ke dunia kerja perkantoran, perbankan, atau wirausaha.',
    dipelajari: [
      'Siklus akuntansi lengkap (jurnal hingga laporan keuangan)',
      'Pembukuan manual & digital (spreadsheet & software)',
      'Perpajakan dan pengisian SPT',
      'Administrasi perkantoran modern',
      'Keuangan lembaga dan pengelolaan kas',
      'Software akuntansi (MYOB, Zahir, dll.)',
    ],
    prospek: [
      'Staf akuntansi & keuangan perusahaan',
      'Admin perkantoran & sekretaris',
      'Perbankan, koperasi, & lembaga keuangan mikro',
      'Wirausaha mandiri & pengelola keuangan UMKM',
    ],
    foto: '/landing/jurusan-akl.jpg',
    variant: 'lime',
  },
};

const variantStyles: Record<
  Variant,
  { badge: string; badgeText: string; accent: string }
> = {
  dark: {
    badge: 'bg-smk-emerald-deep text-smk-lime',
    badgeText: 'text-smk-lime',
    accent: 'text-smk-emerald-deep',
  },
  sand: {
    badge: 'bg-smk-sand text-smk-ink',
    badgeText: 'text-smk-emerald-deep',
    accent: 'text-smk-emerald-deep',
  },
  lime: {
    badge: 'bg-smk-lime text-[#22330a]',
    badgeText: 'text-[#22330a]',
    accent: 'text-smk-emerald-deep',
  },
};

// =============================================================================
// STATIC PARAMS — SSG
// =============================================================================

export function generateStaticParams(): Array<{ slug: JurusanSlug }> {
  return [{ slug: 'tkro' }, { slug: 'tjkt' }, { slug: 'akl' }];
}

// =============================================================================
// METADATA
// =============================================================================

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = jurusanData[slug as JurusanSlug];
  if (!data) {
    return { title: 'Jurusan tidak ditemukan — SMK Darussalam Subah' };
  }

  const title = `${data.nama} (${data.sub}) — SMK Darussalam Subah`;
  const description = `Program keahlian ${data.nama} di SMK Darussalam Subah. ${data.deskripsi.slice(0, 150)}…`;

  return {
    title,
    description,
    keywords: [
      data.nama,
      data.sub,
      `${data.sub} SMK Darussalam`,
      'SMK Darussalam Subah',
      'SPMB 2026',
      data.bidang,
    ],
    openGraph: {
      title,
      description,
      url: `https://smkdarussalamsubah.sch.id/jurusan/${data.slug}`,
      siteName: 'SMK Darussalam Subah',
      locale: 'id_ID',
      type: 'website',
    },
    alternates: {
      canonical: `https://smkdarussalamsubah.sch.id/jurusan/${data.slug}`,
    },
  };
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default async function JurusanDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = jurusanData[slug as JurusanSlug];

  if (!data) {
    notFound();
  }

  const vs = variantStyles[data.variant];

  return (
    <div className="font-jakarta min-h-screen bg-smk-cream text-smk-ink">
      {/* ── HERO — full-bleed photo, 40vh ── */}
      <div className="relative h-[40vh] min-h-[240px] w-full overflow-hidden">
        <Image
          src={data.foto}
          alt={`Jurusan ${data.nama} SMK Darussalam Subah`}
          fill
          priority
          className="object-cover"
          sizes="100vw"
        />
        {/* Gradient overlay — darkens bottom for text legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-smk-emerald-deep/80 via-smk-emerald-deep/30 to-transparent" />

        {/* Back button */}
        <div className="absolute left-0 right-0 top-0 mx-auto max-w-[1180px] px-5 pt-5 md:px-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-2 text-[13px] font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/25"
          >
            ← Kembali ke Beranda
          </Link>
        </div>

        {/* Hero title overlay */}
        <div className="absolute bottom-0 left-0 right-0 mx-auto max-w-[1180px] px-5 pb-8 md:px-6">
          <span
            className={`mb-3 inline-block rounded-full px-3.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] md:text-[12px] ${vs.badge}`}
          >
            {data.sub} · {data.bidang}
          </span>
          <h1 className="font-fraunces text-[clamp(24px,4vw,48px)] font-semibold leading-tight tracking-tight text-white">
            {data.nama}
          </h1>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div className="mx-auto max-w-[1180px] px-5 py-12 md:px-6 md:py-16">
        <div className="grid gap-10 md:grid-cols-[1fr_340px] lg:grid-cols-[1fr_380px] md:gap-14">
          {/* Left: main content */}
          <div>
            {/* Deskripsi */}
            <section className="mb-10">
              <h2 className="font-fraunces mb-4 text-[22px] font-semibold tracking-tight text-smk-ink md:text-[26px]">
                Tentang Program
              </h2>
              <p className="text-[15px] leading-[1.75] text-smk-ink-soft md:text-[16px]">
                {data.deskripsi}
              </p>
            </section>

            {/* Apa yang dipelajari */}
            <section className="mb-10">
              <h2 className="font-fraunces mb-5 text-[22px] font-semibold tracking-tight text-smk-ink md:text-[26px]">
                Apa yang Dipelajari
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {data.dipelajari.map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-smk-emerald-deep/10 text-[11px] font-bold ${vs.accent}`}
                    >
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="text-[14px] leading-[1.6] text-smk-ink-soft md:text-[15px]">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Prospek kerja */}
            <section className="rounded-[18px] bg-smk-sand p-6 md:rounded-[22px] md:p-8">
              <h2 className="font-fraunces mb-5 text-[22px] font-semibold tracking-tight text-smk-ink md:text-[26px]">
                Prospek Karir Lulusan
              </h2>
              <ul className="flex flex-col gap-3">
                {data.prospek.map((p, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-smk-emerald-deep text-[11px] font-bold text-smk-lime">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="text-[14px] font-medium text-smk-ink md:text-[15px]">
                      {p}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* Right: sticky sidebar */}
          <aside className="self-start md:sticky md:top-24">
            {/* Info card */}
            <div className="mb-4 rounded-[18px] border border-smk-ink/8 bg-white p-6 md:rounded-[20px]">
              <p className="mb-4 text-[12px] font-bold uppercase tracking-wider text-smk-ink-soft">
                Info Program
              </p>
              <dl className="flex flex-col gap-3 text-[14px]">
                {[
                  { term: 'Kode', def: data.sub },
                  { term: 'Bidang', def: data.bidang },
                  { term: 'Konsentrasi', def: data.konsentrasi },
                  { term: 'Masa Studi', def: '3 tahun (6 semester)' },
                  { term: 'Akreditasi', def: 'B — BAN-S/M' },
                ].map(({ term, def }) => (
                  <div key={term} className="flex justify-between gap-4">
                    <dt className="text-smk-ink-soft">{term}</dt>
                    <dd className="font-semibold text-smk-ink text-right">{def}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* CTA card */}
            <div className="rounded-[18px] bg-smk-emerald-deep p-6 md:rounded-[20px]">
              <p className="mb-1 text-[12px] font-bold uppercase tracking-wider text-smk-lime/70">
                SPMB 2026/2027
              </p>
              <p className="mb-4 font-fraunces text-[18px] font-semibold text-white">
                Tertarik masuk {data.sub}?
              </p>
              <p className="mb-5 text-[13px] text-[#a9cdbd] leading-relaxed">
                Daftar sekarang sebelum kuota habis. 234 kursi tersedia untuk 3
                program keahlian.
              </p>
              <a
                href={SPMB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mb-3 flex items-center justify-center gap-2 rounded-full bg-smk-lime px-5 py-3 text-[14px] font-semibold text-[#22330a] transition-all hover:-translate-y-px hover:bg-white"
              >
                Daftar Online <span aria-hidden>→</span>
              </a>
              <a
                href={WA_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-full border border-white/25 px-5 py-3 text-[14px] font-semibold text-white transition-all hover:bg-white/10"
              >
                Tanya via WhatsApp
              </a>
            </div>

            {/* Back link */}
            <Link
              href="/#jurusan"
              className="mt-4 flex items-center justify-center gap-1.5 text-[13px] font-medium text-smk-ink-soft transition-colors hover:text-smk-emerald"
            >
              ← Lihat jurusan lainnya
            </Link>
          </aside>
        </div>
      </div>
    </div>
  );
}
