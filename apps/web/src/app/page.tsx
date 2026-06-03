// C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\apps\web\src\app\page.tsx
import type { Metadata } from 'next';
import { LandingNav } from '@/components/landing/LandingNav';
import { Hero } from '@/components/landing/Hero';
import { MarqueeStrip } from '@/components/landing/MarqueeStrip';
import { Jurusan } from '@/components/landing/Jurusan';
import { VisiMisi } from '@/components/landing/VisiMisi';
import { Keunggulan } from '@/components/landing/Keunggulan';
import { VideoProfile } from '@/components/landing/VideoProfile';
import { WhyUs } from '@/components/landing/WhyUs';
import { Ekstrakurikuler } from '@/components/landing/Ekstrakurikuler';
import { Galeri } from '@/components/landing/Galeri';
import { SPMBSection } from '@/components/landing/SPMBSection';
import { Stats } from '@/components/landing/Stats';
import { Testimoni } from '@/components/landing/Testimoni';
import { CtaPPDB } from '@/components/landing/CtaPPDB';
import { Footer } from '@/components/landing/Footer';
import { ScrollReveal } from '@/components/landing/ScrollReveal';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'SMK Darussalam Subah — Sekolah Industri Berbasis Pesantren',
  description:
    'SMK Darussalam Subah, Batang Jawa Tengah. 3 program keahlian: TKRO, TJKT, AKL. Berbasis Pondok Pesantren Darussalam. Dekat kawasan industri KITB & PLTU Batang. SPMB 2026/2027 dibuka, terbatas 234 kursi.',
  keywords: [
    'SMK Darussalam Subah',
    'SPMB 2026',
    'sekolah vokasi pesantren Batang',
    'teknik otomotif Batang',
    'TJKT Subah',
    'AKL SMK Batang',
    'SMK Batang Jawa Tengah',
    'sekolah kejuruan pesantren',
    'KITB Batang',
    'Teaching Factory SMK',
  ],
  openGraph: {
    title: 'SMK Darussalam Subah — Sekolah Industri Berbasis Pesantren',
    description:
      'Memadukan pendidikan pesantren dengan keahlian vokasi terkini. Dekat KITB & PLTU Batang. SPMB 2026/2027 dibuka, terbatas 234 kursi.',
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
    'Sekolah Menengah Kejuruan berbasis pondok pesantren di Subah, Batang, Jawa Tengah. Program keahlian: TKRO, TJKT, AKL.',
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
          {/* 1. Hero — above the fold, no scroll reveal */}
          <Hero />

          {/* 2. MarqueeStrip */}
          <MarqueeStrip />

          {/* 3. Jurusan */}
          <ScrollReveal>
            <Jurusan />
          </ScrollReveal>

          {/* 4. VisiMisi */}
          <ScrollReveal delay={60}>
            <VisiMisi />
          </ScrollReveal>

          {/* 5. Keunggulan */}
          <ScrollReveal delay={60}>
            <Keunggulan />
          </ScrollReveal>

          {/* 6. VideoProfile */}
          <ScrollReveal delay={60}>
            <VideoProfile />
          </ScrollReveal>

          {/* 7. WhyUs */}
          <ScrollReveal delay={60}>
            <WhyUs />
          </ScrollReveal>

          {/* 8. Ekstrakurikuler */}
          <ScrollReveal delay={60}>
            <Ekstrakurikuler />
          </ScrollReveal>

          {/* 9. Galeri */}
          <ScrollReveal delay={60}>
            <Galeri />
          </ScrollReveal>

          {/* 10. SPMBSection */}
          <ScrollReveal delay={60}>
            <SPMBSection />
          </ScrollReveal>

          {/* 11. Stats */}
          <ScrollReveal delay={60}>
            <Stats />
          </ScrollReveal>

          {/* 12. Testimoni */}
          <ScrollReveal delay={60}>
            <Testimoni />
          </ScrollReveal>

          {/* 13. CtaPPDB */}
          <ScrollReveal delay={40}>
            <CtaPPDB />
          </ScrollReveal>
        </main>

        <Footer />
      </div>
    </>
  );
}
