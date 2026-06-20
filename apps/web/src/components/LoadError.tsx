'use client';

// LoadError — state "gagal memuat" (bukan "data kosong") dengan tombol coba lagi.
// Dipakai saat fetch server gagal (apiFetch mengembalikan null pada 4xx/5xx/network;
// sukses-kosong mengembalikan { data: [] }, jadi null = benar-benar gagal, bukan kosong).

import { useRouter } from 'next/navigation';
import { AlertTriangle, RotateCw } from 'lucide-react';

interface LoadErrorProps {
  title?: string;
  message?: string;
}

export default function LoadError({
  title = 'Gagal memuat data',
  message = 'Gagal memuat data dari server. Coba muat ulang; bila tetap gagal, sesi mungkin berakhir — keluar lalu masuk lagi.',
}: LoadErrorProps) {
  const router = useRouter();
  return (
    <div className="grid min-h-[40vh] place-items-center">
      <div className="flex max-w-md flex-col items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50/60 px-6 py-8 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-rose-100 text-rose-600">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-[15px] font-bold text-[#0f2e25]">{title}</h2>
          <p className="mt-1 text-[13px] text-[#6b8079]">{message}</p>
        </div>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-[13px] font-bold text-white transition hover:bg-emerald-700"
        >
          <RotateCw className="h-4 w-4" />Coba lagi
        </button>
      </div>
    </div>
  );
}
