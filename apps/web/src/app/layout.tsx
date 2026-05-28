import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import dynamic from 'next/dynamic';
import './globals.css';

// SessionProvider di-load dengan ssr: false — ini adalah fix untuk
// next-auth v4 + React 19 incompatibility.
//
// Root cause: next-auth v4 menggunakan React 18 internal APIs (refs, context)
// yang incompatible dengan React 19 saat server-side rendering / static generation.
// Hasilnya: React error #31 saat Next.js mencoba static-generate halaman seperti /404.
//
// Dengan ssr: false:
// - SessionProvider TIDAK di-render di server (tidak ada SSR / static gen masalah)
// - SessionProvider di-mount di client setelah hydration
// - Session difetch client-side via /api/auth/session endpoint next-auth
// - Auth protection tetap aman: middleware.ts redirect ke /login jika tidak ada session
//
// Trade-off: initial server render tidak punya session context (status: 'loading')
// → acceptable untuk app berbasis auth seperti DIIS (semua pages di-protect middleware)
const SessionProvider = dynamic(
  () => import('@/components/providers/SessionProvider').then((mod) => mod.SessionProvider),
  { ssr: false },
);

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
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}

