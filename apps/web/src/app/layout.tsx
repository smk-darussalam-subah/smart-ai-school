import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

// =============================================================================
// Root Layout — Server Component (WAJIB Server Component agar metadata export
// bekerja dan Next.js bisa static-generate halaman seperti /404).
//
// Arsitektur SessionProvider:
// - SessionProvider TIDAK di-mount di root, tetapi di-mount per-segment via
//   DashboardProviders.tsx hanya di bawah /dashboard/*.
// - Rationale: halaman publik (/, /login, /404) tidak butuh SessionProvider,
//   jadi hindari "use client" boundary yang tidak perlu di root → memungkinkan
//   /404 dan halaman publik di-static-prerender dengan zero client JS.
// - Login page pakai signIn() langsung; redirect auth ditangani middleware.ts.
//
// Lihat: apps/web/src/components/providers/DashboardProviders.tsx
// =============================================================================

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
        {children}
      </body>
    </html>
  );
}
