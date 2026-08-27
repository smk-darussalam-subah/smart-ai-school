'use client';

import { CircleAlert, RotateCcw } from 'lucide-react';

export default function HelpError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-3xl border-y border-red-200 py-12 text-center">
      <CircleAlert className="mx-auto h-8 w-8 text-red-700" aria-hidden="true" />
      <h1 className="mt-3 text-xl font-bold text-slate-950">Panduan belum dapat dimuat</h1>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">Koneksi atau layanan sedang bermasalah. Tidak ada topik tersembunyi yang ditampilkan sebagai pengganti.</p>
      <button type="button" onClick={reset} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-800 px-4 text-sm font-semibold text-white hover:bg-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"><RotateCcw className="h-4 w-4" aria-hidden="true" />Coba lagi</button>
    </div>
  );
}
