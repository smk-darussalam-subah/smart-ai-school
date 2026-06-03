'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';

const SPMB_URL = 'https://taplink.cc/smkdarussalamsubah';

const navLinks = [
  { href: '#jurusan', label: 'Jurusan' },
  { href: '#kenapa', label: 'Kenapa Kami' },
  { href: '#video', label: 'Profil' },
  { href: '#kontak', label: 'Kontak' },
] as const;

export function LandingNav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-smk-cream/92 backdrop-blur-md shadow-sm border-b border-smk-ink/8'
          : 'bg-transparent'
      }`}
    >
      <nav className="max-w-[1180px] mx-auto px-5 md:px-6 flex items-center justify-between h-16 md:h-[72px]">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5 min-w-0">
          <div className="relative w-9 h-9 md:w-10 md:h-10 flex-shrink-0">
            <Image
              src="/landing/logo-smk.png"
              alt="Logo SMK Darussalam Subah"
              fill
              className="object-contain rounded-xl"
              sizes="40px"
              priority
            />
          </div>
          <span className="font-bold text-smk-ink leading-tight text-[13px] md:text-sm">
            SMK Darussalam Subah
            <small className="block font-medium text-[10px] md:text-[11px] tracking-wider uppercase text-smk-ink-soft">
              Sekolah Industri Berbasis Pesantren
            </small>
          </span>
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-7 text-[14px] font-medium text-smk-ink/80">
          {navLinks.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="hover:text-smk-emerald transition-colors py-1"
            >
              {l.label}
            </a>
          ))}
        </div>

        {/* CTA */}
        <a
          href={SPMB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden md:inline-flex items-center gap-1.5 font-semibold text-[14px] px-5 py-2.5 rounded-full bg-smk-emerald-deep text-white hover:bg-smk-emerald hover:-translate-y-px transition-all"
        >
          Daftar SPMB <span aria-hidden className="text-smk-lime">→</span>
        </a>

        {/* Mobile hamburger */}
        <button
          className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg text-smk-ink hover:bg-smk-ink/5 transition-colors"
          aria-label={open ? 'Tutup menu' : 'Buka menu'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="text-xl leading-none">{open ? '✕' : '☰'}</span>
        </button>
      </nav>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden bg-smk-cream border-t border-smk-ink/8 px-5 pb-5 pt-3">
          {navLinks.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="flex items-center text-smk-ink font-medium text-base py-3 border-b border-smk-ink/6 hover:text-smk-emerald transition-colors last:border-0"
            >
              {l.label}
            </a>
          ))}
          <a
            href={SPMB_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="mt-4 flex items-center justify-center gap-2 font-semibold text-[15px] px-5 py-3.5 rounded-full bg-smk-emerald-deep text-white"
          >
            Daftar SPMB <span aria-hidden className="text-smk-lime">→</span>
          </a>
        </div>
      )}
    </header>
  );
}
