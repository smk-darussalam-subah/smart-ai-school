'use client';

import React, { useId, useState } from 'react';
import { ChevronDown, Settings2 } from 'lucide-react';

/** Default-closed, keyboard-native disclosure; hidden content stays mounted so drafts are preserved. */
export default function SchedulingDisclosure({
  children,
  summary,
}: {
  children: React.ReactNode;
  summary: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-14 w-full items-center gap-3 rounded-xl px-4 py-2 text-left text-sm text-slate-900 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:text-slate-100 dark:hover:bg-slate-800"
      >
        <Settings2
          className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-300"
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Konfigurasi Jam Pelajaran</span>
          <span className="mt-0.5 block text-xs font-normal text-slate-600 dark:text-slate-300">
            {summary}
          </span>
        </span>
        <span className="hidden text-xs text-slate-600 sm:inline dark:text-slate-300">
          {open ? 'Sembunyikan' : 'Tampilkan'}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`h-5 w-5 shrink-0 transition-transform duration-150 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div id={panelId} hidden={!open} className="border-t border-slate-200 dark:border-slate-700">
        {children}
      </div>
    </section>
  );
}
