import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Database,
  GraduationCap,
  HeartHandshake,
  LockKeyhole,
  ShieldCheck,
  Smartphone,
  Users,
  Workflow,
} from 'lucide-react';
import { DiisRoleLens } from '@/components/diis/DiisRoleLens';
import { InstallDiisAction } from '@/components/diis/InstallDiisAction';
import { Footer } from '@/components/landing/Footer';
import { LandingNav } from '@/components/landing/LandingNav';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'DIIS — Sistem Sekolah Terhubung SMK Darussalam Subah',
  description:
    'Kenali DIIS, sistem yang menghubungkan pembelajaran, administrasi, komunikasi orang tua, dan tindak lanjut sekolah di SMK Darussalam Subah.',
  alternates: { canonical: 'https://smkdarussalamsubah.sch.id/diis' },
  openGraph: {
    title: 'DIIS — Cara SMK Darussalam Subah Menjalankan Sekolah yang Terhubung',
    description:
      'Satu sistem untuk membantu guru, siswa, orang tua, pengelola sekolah, dan mitra industri bergerak dalam arah yang sama.',
    url: 'https://smkdarussalamsubah.sch.id/diis',
    siteName: 'SMK Darussalam Subah',
    locale: 'id_ID',
    type: 'website',
    images: [
      {
        url: '/diis/opengraph-diis.webp',
        width: 1200,
        height: 630,
        alt: 'DIIS, Digital Integrated Information System SMK Darussalam Subah.',
      },
    ],
  },
};

const workflowSteps = [
  {
    time: '06.45',
    title: 'Sekolah bersiap',
    body: 'Jadwal, kelas, ruang, dan agenda hari itu berada pada sumber informasi yang sama.',
    icon: CalendarDays,
  },
  {
    time: '07.15',
    title: 'Pembelajaran dimulai',
    body: 'Guru memulai sesi, mencatat kehadiran, dan menjalankan pembelajaran sesuai penugasan.',
    icon: BookOpen,
  },
  {
    time: '10.30',
    title: 'Kemajuan terlihat',
    body: 'Tugas, asesmen, dan catatan belajar membantu guru menentukan tindak lanjut.',
    icon: ClipboardCheck,
  },
  {
    time: '13.30',
    title: 'Informasi sampai',
    body: 'Siswa, orang tua, dan pengelola menerima informasi yang sesuai dengan kewenangannya.',
    icon: Users,
  },
  {
    time: 'Hari berikutnya',
    title: 'Tindak lanjut dimulai',
    body: 'Pimpinan dan tim sekolah dapat segera melihat hal yang perlu mendapat perhatian.',
    icon: Workflow,
  },
] as const;

const capabilities = [
  {
    icon: CalendarDays,
    title: 'Operasional sekolah',
    body: 'Tahun ajaran, kelas, mata pelajaran, jadwal, kalender, kegiatan, dan pengumuman.',
  },
  {
    icon: GraduationCap,
    title: 'Pembelajaran',
    body: 'Rencana pembelajaran, modul, asesmen, nilai, rapor, dan tindak lanjut belajar.',
  },
  {
    icon: Users,
    title: 'Siswa dan keluarga',
    body: 'Informasi siswa dan orang tua yang disajikan sesuai hubungan serta kewenangan.',
  },
  {
    icon: Building2,
    title: 'Administrasi',
    body: 'SPMB, data sekolah, keuangan, struktur organisasi, dan pekerjaan tata usaha.',
  },
  {
    icon: HeartHandshake,
    title: 'Dunia kerja',
    body: 'PKL, lowongan, kegiatan kelas, dan hubungan sekolah dengan mitra industri.',
  },
  {
    icon: Database,
    title: 'Kendali dan audit',
    body: 'Dashboard eksekutif, persetujuan, audit, dan pemantauan operasional sekolah.',
  },
] as const;

const principles = [
  {
    icon: LockKeyhole,
    title: 'Akses sesuai tanggung jawab',
    body: 'Guru, siswa, orang tua, dan pengelola melihat informasi yang memang mereka perlukan.',
  },
  {
    icon: ClipboardCheck,
    title: 'Perubahan penting tercatat',
    body: 'Riwayat tindakan membantu sekolah memeriksa kembali apa yang terjadi dan siapa yang bertugas.',
  },
  {
    icon: ShieldCheck,
    title: 'Sekolah tetap memutuskan',
    body: 'DIIS membantu menyiapkan informasi; keputusan tetap dibuat oleh guru dan pengelola sekolah.',
  },
] as const;

const faq = [
  {
    question: 'Apa sebenarnya DIIS?',
    answer:
      'DIIS adalah Digital Integrated Information System milik SMK Darussalam Subah. Sistem ini menghubungkan pekerjaan akademik, administrasi, komunikasi, dan tindak lanjut sekolah dalam satu alur yang sesuai kewenangan pengguna.',
  },
  {
    question: 'Apakah semua orang dapat membuat akun sendiri?',
    answer:
      'Tidak. Akses DIIS mengikuti hubungan resmi dengan sekolah. Jika Anda seharusnya memiliki akses tetapi belum dapat masuk, hubungi pengelola sekolah melalui saluran resmi.',
  },
  {
    question: 'Apakah DIIS dapat dipasang di ponsel dan komputer?',
    answer:
      'Ya. DIIS tersedia sebagai aplikasi web yang dapat dipasang langsung dari browser yang mendukung. Pengalaman tetap menyesuaikan layar ponsel maupun komputer.',
  },
  {
    question: 'Apakah DIIS menggantikan keputusan guru dan sekolah?',
    answer:
      'Tidak. DIIS membantu menyusun informasi, menjaga alur kerja, dan memperjelas tindak lanjut. Keputusan akademik maupun operasional tetap dibuat oleh manusia yang berwenang.',
  },
  {
    question: 'Bagaimana DIIS menjaga informasi pengguna?',
    answer:
      'Setiap pengguna hanya memperoleh akses sesuai peran dan hubungan yang sah. Kebijakan data sekolah menjelaskan tujuan pemrosesan, batas akses, serta hak pengguna secara lebih lengkap.',
  },
] as const;

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'DIIS',
  alternateName: 'Digital Integrated Information System',
  applicationCategory: 'EducationalApplication',
  operatingSystem: 'Web',
  url: 'https://smkdarussalamsubah.sch.id/diis',
  publisher: {
    '@type': 'EducationalOrganization',
    name: 'SMK Darussalam Subah',
    url: 'https://smkdarussalamsubah.sch.id',
  },
};

export default function DiisPublicPage() {
  return (
    <div className="min-h-screen bg-smk-cream font-jakarta text-smk-ink">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <a
        href="#main-content"
        className="sr-only z-[100] bg-smk-lime px-4 py-3 font-bold text-smk-ink focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Lewati ke konten utama
      </a>

      <LandingNav activePage="diis" />

      <main id="main-content">
        <section className="relative isolate min-h-[660px] overflow-hidden border-b border-smk-emerald/10 md:min-h-[min(760px,calc(100svh-104px))]">
          <Image
            src="/diis/connected-school-day.webp"
            alt="Guru, siswa, orang tua, pengelola sekolah, dan mitra industri terhubung dalam satu alur kerja DIIS."
            fill
            priority
            sizes="100vw"
            className="-z-20 object-cover object-[62%_center] opacity-50 min-[640px]:object-center min-[640px]:opacity-100"
          />
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-0 -z-10 w-full bg-smk-cream/75 min-[640px]:w-[58%] min-[1024px]:w-[52%]"
          />

          <div className="mx-auto flex min-h-[660px] max-w-[1180px] items-center px-5 py-14 md:min-h-[min(760px,calc(100svh-104px))] md:px-6">
            <div className="max-w-[650px]">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-smk-emerald">
                Digital Integrated Information System
              </p>
              <h1 className="mt-3 font-fraunces text-[clamp(4rem,11vw,8rem)] font-semibold leading-[0.86] text-smk-emerald-deep">
                DIIS
              </h1>
              <p className="mt-6 max-w-[19ch] font-fraunces text-[clamp(2rem,4.25vw,3.8rem)] font-semibold leading-[1.04] text-smk-ink">
                Satu sekolah. Banyak peran. Satu arah kemajuan.
              </p>
              <p className="mt-6 max-w-[62ch] text-base leading-8 text-smk-ink-soft md:text-lg">
                DIIS menghubungkan pekerjaan guru, siswa, orang tua, tata usaha, pimpinan, dan mitra
                industri agar setiap kabar tiba pada orang yang tepat dan setiap keputusan punya
                pijakan yang jelas.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a
                  href="#cara-kerja"
                  className="inline-flex min-h-12 items-center justify-center gap-2 bg-smk-emerald-deep px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-smk-emerald focus:outline-none focus-visible:ring-2 focus-visible:ring-smk-emerald focus-visible:ring-offset-2"
                >
                  Lihat DIIS bekerja <ArrowDown aria-hidden="true" className="h-4 w-4" />
                </a>
                <Link
                  href="/login"
                  className="inline-flex min-h-12 items-center justify-center border border-smk-emerald/25 bg-smk-cream/75 px-5 py-3 text-sm font-bold text-smk-emerald-deep backdrop-blur-sm transition-colors hover:border-smk-emerald hover:bg-smk-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-smk-emerald"
                >
                  Masuk ke DIIS
                </Link>
              </div>
              <p className="mt-6 flex items-center gap-2 text-sm font-medium text-smk-ink-soft">
                <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-smk-emerald" />
                Dibangun di sekolah. Diuji oleh keseharian sekolah.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-white py-16 md:py-24" aria-labelledby="why-diis-title">
          <div className="mx-auto grid max-w-[1180px] gap-9 px-5 md:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-smk-emerald">
                Mengapa DIIS
              </p>
              <h2
                id="why-diis-title"
                className="mt-4 font-fraunces text-[clamp(2rem,4.2vw,3.35rem)] font-semibold leading-[1.08]"
              >
                Semua bekerja lebih baik ketika informasi tidak terpencar.
              </h2>
            </div>
            <div className="border-l-4 border-smk-lime pl-6 md:pl-8">
              <p className="text-lg leading-8 text-smk-ink-soft md:text-xl md:leading-9">
                Pekerjaan sekolah menjadi lebih ringan ketika jadwal, pembelajaran, administrasi,
                komunikasi, dan keputusan saling terhubung tanpa membuat orang kehilangan kendali.
              </p>
              <p className="mt-5 text-base font-semibold leading-7 text-smk-emerald-deep">
                DIIS menyatukan pekerjaan itu dalam satu ruang kerja milik sekolah.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-[#061c20] py-8 md:py-12" aria-label="Gambaran produk DIIS">
          <div className="mx-auto max-w-[1320px] px-4 md:px-6">
            <Image
              src="/diis/product-overview.webp"
              alt="Tampilan DIIS pada komputer, tablet, dan ponsel untuk sekolah, guru, siswa, dan orang tua."
              width={1672}
              height={941}
              sizes="(max-width: 1320px) 100vw, 1320px"
              className="h-auto w-full border border-white/10"
            />
          </div>
        </section>

        <section
          id="cara-kerja"
          className="scroll-mt-24 bg-smk-emerald-deep py-16 text-white md:py-24"
          aria-labelledby="workflow-title"
        >
          <div className="mx-auto max-w-[1180px] px-5 md:px-6">
            <div className="grid gap-7 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-smk-lime">
                  Satu hari bersama DIIS
                </p>
                <h2
                  id="workflow-title"
                  className="mt-4 font-fraunces text-[clamp(2rem,4.2vw,3.35rem)] font-semibold leading-[1.08]"
                >
                  Yang terjadi di kelas tidak berhenti di kelas.
                </h2>
              </div>
              <p className="max-w-2xl text-base leading-8 text-white/72 lg:justify-self-end">
                Dari jadwal pagi hingga tindak lanjut, informasi bergerak bersama pekerjaan sekolah
                dan sampai kepada orang yang membutuhkannya.
              </p>
            </div>

            <ol className="mt-12 grid border-y border-white/15 md:grid-cols-5">
              {workflowSteps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <li
                    key={step.title}
                    className="relative border-b border-white/15 px-4 py-6 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <Icon aria-hidden="true" className="h-5 w-5 text-smk-lime" />
                      <span className="text-xs font-bold text-white/45">0{index + 1}</span>
                    </div>
                    <p className="mt-8 text-xs font-bold uppercase tracking-[0.12em] text-smk-lime">
                      {step.time}
                    </p>
                    <h3 className="mt-2 text-base font-bold">{step.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-white/65">{step.body}</p>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        <section className="bg-smk-sand py-16 md:py-24" aria-labelledby="roles-title">
          <div className="mx-auto max-w-[1180px] px-5 md:px-6">
            <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr] lg:items-end">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-smk-emerald">
                  DIIS untuk setiap peran
                </p>
                <h2
                  id="roles-title"
                  className="mt-4 max-w-3xl font-fraunces text-[clamp(2rem,4.2vw,3.35rem)] font-semibold leading-[1.08]"
                >
                  Sistem yang sama. Pandangan yang sesuai tanggung jawab.
                </h2>
              </div>
              <p className="text-base leading-8 text-smk-ink-soft">
                Setiap orang mendapatkan ruang kerja yang sesuai dengan tugasnya di sekolah.
              </p>
            </div>
            <DiisRoleLens />
          </div>
        </section>

        <section className="bg-white py-16 md:py-24" aria-labelledby="capabilities-title">
          <div className="mx-auto max-w-[1180px] px-5 md:px-6">
            <div className="max-w-3xl">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-smk-emerald">
                Yang tersedia di DIIS
              </p>
              <h2
                id="capabilities-title"
                className="mt-4 font-fraunces text-[clamp(2rem,4.2vw,3.35rem)] font-semibold leading-[1.08]"
              >
                Pekerjaan sekolah tersusun dalam satu tempat.
              </h2>
            </div>

            <div className="mt-12 divide-y divide-smk-emerald/12 border-y border-smk-emerald/12">
              {capabilities.map((capability, index) => {
                const Icon = capability.icon;
                return (
                  <article
                    key={capability.title}
                    className="grid gap-4 py-6 md:grid-cols-[64px_0.65fr_1.35fr] md:items-center md:gap-8 md:py-7"
                  >
                    <div className="flex items-center gap-3 md:block">
                      <Icon aria-hidden="true" className="h-7 w-7 text-smk-emerald" />
                      <span className="text-xs font-bold text-smk-emerald/55 md:mt-2 md:block">
                        0{index + 1}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-smk-ink">{capability.title}</h3>
                    <p className="text-[15px] leading-7 text-smk-ink-soft">{capability.body}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="bg-[#dff2e9] py-16 md:py-24" aria-labelledby="trust-title">
          <div className="mx-auto grid max-w-[1180px] gap-10 px-5 md:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-smk-emerald">
                Aman untuk dipakai setiap hari
              </p>
              <h2
                id="trust-title"
                className="mt-4 font-fraunces text-[clamp(2rem,4.2vw,3.35rem)] font-semibold leading-[1.08]"
              >
                Data dijaga. Keputusan tetap di tangan sekolah.
              </h2>
              <p className="mt-6 text-base leading-8 text-smk-ink-soft">
                Setiap pengguna melihat informasi sesuai tugasnya. Perubahan penting dicatat, dan
                keputusan tetap berada pada guru serta pengelola sekolah.
              </p>
              <Link
                href="/privacy"
                className="mt-7 inline-flex min-h-11 items-center gap-2 font-bold text-smk-emerald underline decoration-smk-emerald/35 underline-offset-4 hover:decoration-smk-emerald focus:outline-none focus-visible:ring-2 focus-visible:ring-smk-emerald"
              >
                Baca kebijakan data <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>

            <div className="divide-y divide-smk-emerald/20 border-y border-smk-emerald/20">
              {principles.map((principle) => {
                const Icon = principle.icon;
                return (
                  <article key={principle.title} className="grid grid-cols-[44px_1fr] gap-4 py-6">
                    <Icon aria-hidden="true" className="mt-1 h-6 w-6 text-smk-emerald" />
                    <div>
                      <h3 className="font-bold text-smk-ink">{principle.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-smk-ink-soft">{principle.body}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="bg-smk-cream py-16 md:py-24" aria-labelledby="installed-title">
          <div className="mx-auto grid max-w-[1180px] overflow-hidden bg-smk-emerald-deep text-white lg:grid-cols-[0.9fr_1.1fr]">
            <div className="p-7 md:p-12 lg:p-14">
              <Smartphone aria-hidden="true" className="h-8 w-8 text-smk-lime" />
              <p className="mt-7 text-xs font-bold uppercase tracking-[0.18em] text-smk-lime">
                DIIS di perangkat Anda
              </p>
              <h2
                id="installed-title"
                className="mt-4 font-fraunces text-[clamp(2rem,4vw,3.2rem)] font-semibold leading-[1.08]"
              >
                DIIS selalu dekat, di perangkat yang Anda gunakan.
              </h2>
              <p className="mt-5 max-w-xl text-base leading-8 text-white/72">
                Pasang langsung dari browser di ponsel atau komputer Anda. Setelah itu, buka DIIS
                dari layar utama dan masuk dengan akun sekolah yang sama.
              </p>
              <div className="mt-8">
                <InstallDiisAction />
              </div>
            </div>
            <div className="relative aspect-[16/9] self-center border-t border-white/10 bg-[#061c20] lg:border-l lg:border-t-0">
              <Image
                src="/diis/student-experience.webp"
                alt="Tampilan aplikasi DIIS untuk siswa pada perangkat seluler."
                fill
                sizes="(max-width: 1024px) 100vw, 640px"
                className="object-contain"
              />
            </div>
          </div>
        </section>

        <section className="bg-white py-16 md:py-24" aria-labelledby="faq-title">
          <div className="mx-auto grid max-w-[1180px] gap-10 px-5 md:px-6 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-smk-emerald">
                Pertanyaan yang sering muncul
              </p>
              <h2
                id="faq-title"
                className="mt-4 font-fraunces text-[clamp(2rem,4.2vw,3.35rem)] font-semibold leading-[1.08]"
              >
                Hal penting sebelum Anda masuk.
              </h2>
            </div>
            <div className="border-t border-smk-emerald/15">
              {faq.map((item, index) => (
                <details
                  key={item.question}
                  open={index === 0}
                  className="group border-b border-smk-emerald/15 py-1"
                >
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-base font-bold text-smk-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-smk-emerald [&::-webkit-details-marker]:hidden">
                    {item.question}
                    <span
                      aria-hidden="true"
                      className="text-xl font-normal text-smk-emerald transition-transform group-open:rotate-45 motion-reduce:transition-none"
                    >
                      +
                    </span>
                  </summary>
                  <p className="max-w-3xl pb-5 pr-8 text-[15px] leading-7 text-smk-ink-soft">
                    {item.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#05201a] py-16 text-white md:py-20" aria-labelledby="final-title">
          <div className="mx-auto flex max-w-[1180px] flex-col gap-8 px-5 md:px-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-smk-lime">
                Mari melangkah bersama
              </p>
              <h2
                id="final-title"
                className="mt-4 font-fraunces text-[clamp(2rem,4.2vw,3.35rem)] font-semibold leading-[1.08]"
              >
                Lanjutkan pekerjaan sekolah Anda di DIIS.
              </h2>
              <p className="mt-5 text-base leading-8 text-white/70">
                Jika Anda sudah memiliki akun sekolah, masuk untuk melihat jadwal, pekerjaan, dan
                informasi yang perlu Anda tindak lanjuti.
              </p>
            </div>
            <Link
              href="/login"
              className="inline-flex min-h-12 flex-none items-center justify-center gap-2 bg-smk-lime px-6 py-3 text-sm font-bold text-smk-ink transition-colors hover:bg-[#d5f778] focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Masuk ke DIIS <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
