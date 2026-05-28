import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { SessionProvider } from '@/components/providers/SessionProvider';
import './globals.css';

// Root layout sengaja TIDAK memanggil getServerSession() atau headers() di sini.
//
// Alasan:
// - next-auth v4 + React 19 incompatibility: memanggil getServerSession di luar
//   HTTP context (e.g. saat Next.js static-generate /404) memicu React error #31.
// - nonce sudah di-generate middleware.ts via x-nonce header, tapi tidak perlu
//   di-pass dari sini — component yang butuh nonce bisa baca sendiri via headers().
//
// Session difetch client-side oleh SessionProvider (via /api/auth/session).
// Auth protection tetap aman karena middleware.ts redirect ke /login jika tidak ada session.

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

