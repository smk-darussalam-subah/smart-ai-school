import type { Metadata } from 'next';
import { Inter, Plus_Jakarta_Sans, Fraunces } from 'next/font/google';
import './globals.css';

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
  description: 'Digital Integrated Information System SMK Darussalam Subah',
  applicationName: 'DIIS SMK Darussalam Subah',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '16x16 32x32', type: 'image/x-icon' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className="h-full" data-scroll-behavior="smooth">
      <body className={`${inter.className} ${plusJakarta.variable} ${fraunces.variable} h-full`}>
        {children}
      </body>
    </html>
  );
}
