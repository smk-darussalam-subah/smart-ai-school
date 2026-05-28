import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from '@/components/providers/Providers';
import './globals.css';

// layout.tsx tetap Server Component agar metadata export bisa bekerja.
// SessionProvider di-load via Providers.tsx ('use client') dengan ssr:false
// untuk menghindari next-auth v4 + React 19 SSR incompatibility.
// Lihat: src/components/providers/Providers.tsx untuk penjelasan lengkap.

const inter = Inter({ subsets: ['latin'] });

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
      <body className={`${inter.className} h-full`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

