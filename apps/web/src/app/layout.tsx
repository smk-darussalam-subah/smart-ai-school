import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { headers } from 'next/headers';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { SessionProvider } from '@/components/providers/SessionProvider';
import './globals.css';

// Force dynamic rendering — layout ini memanggil headers() dan getServerSession()
// yang butuh HTTP request context. Tanpa ini, Next.js mencoba static-generate
// halaman seperti /404 di build time (tidak ada request → React error #31).
// Semua halaman di app ini auth-protected, jadi static generation tidak relevan.
export const dynamic = 'force-dynamic';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: 'DIIS — SMK Darussalam Subah',
    template: '%s | DIIS SMK Darussalam Subah',
  },
  description: 'Digital Integrated Information System — Smart AI School 5.0',
  icons: { icon: '/favicon.ico' },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  // Baca nonce yang diinjeksi oleh middleware (x-nonce request header).
  // Digunakan untuk <Script> components dan elemen yang memerlukan nonce.
  // Ref: apps/web/src/middleware.ts → generateNonce() + requestHeaders.set('x-nonce', nonce)
  const headersList = await headers();
  const nonce = headersList.get('x-nonce') ?? '';

  return (
    <html lang="id" className="h-full">
      <body className={`${inter.className} h-full`}>
        {/*
         * nonce diteruskan ke SessionProvider agar client components
         * yang membutuhkan inline scripts dapat menggunakannya.
         * Contoh penggunaan di komponen lain:
         *   import { use } from 'react';
         *   const nonce = use(NonceContext); // jika diperlukan di client component
         */}
        <SessionProvider session={session}>{children}</SessionProvider>
      </body>
    </html>
  );
}

