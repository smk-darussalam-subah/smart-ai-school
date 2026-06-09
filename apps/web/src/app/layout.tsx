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
  description: 'Digital Integrated Information System — Smart AI School 5.0',
  icons: { icon: '/favicon.ico' },
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
