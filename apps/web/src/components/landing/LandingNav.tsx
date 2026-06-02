'use client';

import { useState } from 'react';
import Link from 'next/link';

const SPMB_URL = 'https://taplink.cc/smkdarussalamsubah';

const navLinks = [
  { href: '#jurusan', label: 'Jurusan' },
  { href: '#kenapa', label: 'Kenapa Kami' },
  { href: '#profil', label: 'Profil' },
  { href: '#kontak', label: 'Kontak' },
] as const;

export function LandingNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-smk-ink/10 backdrop-blur-md bg-smk-cream/82">
      <nav className="max-w-[1180px] mx-auto px-6 flex items-center justify-between h-[72px]">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-3 font-bold tracking-tight text-smk-ink">
          <span className="w-10 h-10 rounded-xl bg-smk-emerald-deep grid place-items-center text-smk-lime font-fraunces font-extrabold text-lg">
            D
          </span>
          <span className="leading-tight">
            SMK Darussalam Subah
            <small className="block font-medium text-[11px] tracking-widest uppercase text-smk-ink-soft">
              Sekolah Vokasi Berbasis Pesantren
            </small>
          </span>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden md:flex gap-7 text-[15px] font-medium text-smk-ink">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="hover:text-smk-emerald transition-colors"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* CTA button */}
        <a
          href={SPMB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden md:inline-flex items-center gap-2 font-semibold text-[15px] px-5 py-3 rounded-full bg-smk-emerald-deep text-white hover:bg-smk-emerald hover:-translate-y-px transition-all"
        >
          Daftar SPMB <span aria-hidden>→</span>
        </a>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 text-smk-ink text-2xl leading-none"
          aria-label={open ? 'Tutup menu' : 'Buka menu'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? '✕' : '☰'}
        </button>
      </nav>

      {/* Mobile menu dropdown */}
      {open && (
        <div className="md:hidden bg-smk-cream border-t border-smk-ink/10 px-6 pb-6 pt-4 flex flex-col gap-4">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-smk-ink font-medium text-base py-1 hover:text-smk-emerald transition-colors"
              onClick={() => setOpen(false)}
            >
              {link.label}
            </a>
          ))}
          <a
            href={SPMB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 font-semibold text-[15px] px-5 py-3 rounded-full bg-smk-emerald-deep text-white hover:bg-smk-emerald transition-all mt-2"
            onClick={() => setOpen(false)}
          >
            Daftar SPMB <span aria-hidden>→</span>
          </a>
        </div>
      )}
    </header>
  );
}
