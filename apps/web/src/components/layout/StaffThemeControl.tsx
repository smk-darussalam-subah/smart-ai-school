'use client';

import { Lightbulb, Moon } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { isStaffTheme, STAFF_THEME_COOKIE, type StaffTheme } from '@/lib/staff-theme';

export function StaffThemeControl({ value, onChange }: {
  value: StaffTheme;
  onChange: (value: StaffTheme) => void;
}) {
  const label = value === 'system' ? 'Ikuti perangkat' : value === 'light' ? 'Terang' : 'Gelap';

  function selectTheme(event: ChangeEvent<HTMLSelectElement>) {
    const next = event.currentTarget.value;
    if (!isStaffTheme(next)) return;
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    const maxAge = next === 'system' ? 0 : 31536000;
    document.cookie = `${STAFF_THEME_COOKIE}=${next}; Path=/dashboard; Max-Age=${maxAge}; SameSite=Lax${secure}`;

    const shell = event.currentTarget.closest('[data-staff-theme]');
    shell?.setAttribute('data-staff-theme-switching', next);
    onChange(next);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (shell?.getAttribute('data-staff-theme-switching') === next) {
        shell.removeAttribute('data-staff-theme-switching');
      }
    }));
  }

  return (
    <div
      title={`Tema · ${label}`}
      className="relative grid min-h-11 min-w-11 shrink-0 place-items-center rounded-lg border border-[var(--staff-line)] text-[var(--staff-text)] hover:bg-gray-100 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--staff-focus)] dark:hover:bg-slate-800"
    >
      <Moon aria-hidden="true" className="h-5 w-5 dark:hidden" />
      <Lightbulb aria-hidden="true" className="hidden h-5 w-5 dark:block" />
      <select
        aria-label="Tema tampilan staf"
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        value={value}
        onChange={selectTheme}
      >
        <option value="system">Ikuti perangkat</option>
        <option value="light">Terang</option>
        <option value="dark">Gelap</option>
      </select>
    </div>
  );
}
