'use client';

import { AlertTriangle, RotateCw } from 'lucide-react';

export default function DashboardError({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="grid min-h-[40vh] place-items-center">
      <div className="flex max-w-md flex-col items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50/60 px-6 py-8 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-rose-100 text-rose-600">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-[15px] font-bold text-gray-900">Terjadi Kesalahan</h2>
          <p className="mt-1 text-[13px] text-gray-500">
            Halaman tidak dapat dimuat. Coba lagi, atau keluar lalu masuk lagi bila masalah berlanjut.
          </p>
        </div>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-[13px] font-bold text-white transition hover:bg-emerald-700"
        >
          <RotateCw className="h-4 w-4" />Coba lagi
        </button>
      </div>
    </div>
  );
}
