import type { Metadata } from 'next';
import { Inter, Plus_Jakarta_Sans, Fraunces } from 'next/font/google';
import './globals.css';

// =============================================================================
// Root Layout — Server Component (WAJIB Server Component agar metadata export
// bekerja dan Next.js bisa static-generate halaman seperti /404).
//
// Font strategy:
// - Inter → dashboard (existing, via inter.className)
// - Plus Jakarta Sans + Fraunces → landing page (via CSS variables)
//   Keduanya dimuat di root agar next/font bisa subset + self-host dengan benar.
//   Landing page mengakses via --font-jakarta / --font-fraunces CSS vars.
//
// SessionProvider TIDAK di-mount di root — hanya di /dashboard/* via DashboardProviders.tsx.
// Lihat: apps/web/src/components/providers/DashboardProviders.tsx
// =============================================================================

const inter = Inter({ subsets: ['latin'] });

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
  axes: ['opsz'],
});

export const metadata: Metadata = {
  title: {
    default: 'DIIS — SMK Darussalam Subah',
    template: '%s | DIIS SMK Darussalam Subah',
  },
  description: 'Digital Integrated Information System — Smart AI School 5.0',
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className="h-full">
      <body className={`${inter.className} ${plusJakarta.variable} ${fraunces.variable} h-full`}>
        {children}
      </body>
    </html>
  );
}
