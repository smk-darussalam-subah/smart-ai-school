'use client';

// ThemeToggle — pengalih tema gelap/terang untuk dashboard siswa & ortu (W0b).
// Menulis attribute data-theme di <html> + menyimpan ke localStorage. Kunci
// penyimpanan berbeda per peran: siswa 'diis-theme', ortu 'diis-ortu-theme'.
// (Skrip anti-flash di <head> layout per-peran membaca kunci yang sama saat load.)

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';

type Theme = 'dark' | 'light';

interface ThemeToggleProps {
  /** Kunci localStorage, mis. 'diis-theme' (siswa) atau 'diis-ortu-theme' (ortu). */
  storageKey: string;
  defaultTheme?: Theme;
  className?: string;
}

export function ThemeToggle({ storageKey, defaultTheme = 'dark', className }: ThemeToggleProps) {
  const [theme, setTheme] = useState<Theme>(defaultTheme);

  // Selaraskan state dgn tema aktual yang sudah dipasang skrip anti-flash.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey) as Theme | null;
      const attr = document.documentElement.getAttribute('data-theme') as Theme | null;
      const initial = saved ?? attr ?? defaultTheme;
      setTheme(initial);
      document.documentElement.setAttribute('data-theme', initial);
    } catch {
      /* localStorage tak tersedia (SSR / mode privasi) — biarkan default. */
    }
  }, [storageKey, defaultTheme]);

  const toggle = () => {
    setTheme((cur) => {
      const next: Theme = cur === 'dark' ? 'light' : 'dark';
      try {
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem(storageKey, next);
      } catch {
        /* abaikan kegagalan persist; tema tetap berubah utk sesi ini. */
      }
      return next;
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
      className={cn(
        'grid h-9 w-9 place-items-center rounded-lg text-current transition hover:bg-zinc-500/10',
        className,
      )}
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
