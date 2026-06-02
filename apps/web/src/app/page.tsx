import type { Metadata } from 'next';
import { LandingNav } from '@/components/landing/LandingNav';
import { Hero } from '@/components/landing/Hero';
import { MarqueeStrip } from '@/components/landing/MarqueeStrip';
import { Jurusan } from '@/components/landing/Jurusan';
import { VideoProfile } from '@/components/landing/VideoProfile';
import { WhyUs } from '@/components/landing/WhyUs';
import { Stats } from '@/components/landing/Stats';
import { CtaPPDB } from '@/components/landing/CtaPPDB';
import { Footer } from '@/components/landing/Footer';
import { ScrollReveal } from '@/components/landing/ScrollReveal';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'SMK Darussalam Subah — Sekolah Industri Berbasis Pesantren',
  description:
    'SMK Darussalam Subah, Batang Jawa Tengah. 3 program keahlian: Teknik Otomotif (TKRO & TBSM), TJKT, AKL. Berbasis Pondok Pesantren Darussalam. SPMB 2026/2027 dibuka, terbatas 234 kursi.',
  keywords: [
    'SMK Darussalam Subah',
    'SPMB 2026',
    'sekolah vokasi pesantren Batang',
    'teknik otomotif Batang',
    'TJKT Subah',
    'AKL SMK Batang',
  ],
  openGraph: {
    title: 'SMK Darussalam Subah — Sekolah Industri Berbasis Pesantren',
    description:
      'Memadukan pendidikan pesantren dengan keahlian vokasi terkini. SPMB 2026/2027 dibuka, terbatas 234 kursi.',
    url: 'https://smkdarussalamsubah.sch.id',
    siteName: 'SMK Darussalam Subah',
    locale: 'id_ID',
    type: 'website',
  },
  alternates: {
    canonical: 'https://smkdarussalamsubah.sch.id',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'EducationalOrganization',
  name: 'SMK Darussalam Subah',
  alternateName: 'SMK Darussalam',
  description:
    'Sekolah Menengah Kejuruan berbasis pondok pesantren di Subah, Batang, Jawa Tengah. Program keahlian: Teknik Otomotif, TJKT, AKL.',
  url: 'https://smkdarussalamsubah.sch.id',
  telephone: '+62877-7556-4779',
  email: 'smkdarussalamsubah.08@gmail.com',
  sameAs: [
    'https://instagram.com/smkdarussalamsubah',
    'https://facebook.com/smkdarussalamsubah',
  ],
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Jl. Lapangan Selatan No. 05, Kemiri Barat',
    addressLocality: 'Subah',
    addressRegion: 'Batang, Jawa Tengah',
    addressCountry: 'ID',
  },
  geo: {
    '@type': 'GeoCoordinates',
    latitude: -6.952,
    longitude: 109.8993,
  },
  identifier: {
    '@type': 'PropertyValue',
    name: 'NPSN',
    value: '20350670',
  },
  foundingDate: '2008',
  numberOfStudents: 318,
};

export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="font-jakarta bg-smk-cream text-smk-ink min-h-screen">
        <LandingNav />

        <main>
          <Hero />
          <MarqueeStrip />

          <ScrollReveal>
            <Jurusan />
          </ScrollReveal>

          <ScrollReveal delay={60}>
            <VideoProfile />
          </ScrollReveal>

          <ScrollReveal delay={60}>
            <WhyUs />
          </ScrollReveal>

          <ScrollReveal delay={60}>
            <Stats />
          </ScrollReveal>

          <ScrollReveal delay={40}>
            <CtaPPDB />
          </ScrollReveal>
        </main>

        <Footer />
      </div>
    </>
  );
}
