'use client';

// =============================================================================
// TopBar (desktop) — 2L shell. Tombol sembunyikan sidebar, layar penuh (kiosk
// ruang guru), dan menu pengguna. Jam besar khusus Beranda ada di halamannya.
// =============================================================================

import { useSession } from 'next-auth/react';
import { useState } from 'react';
import { PanelLeft, Maximize, LogOut } from 'lucide-react';

function initials(name?: string | null): string {
  if (!name) return 'U';
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

export default function TopBar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const { data: session } = useSession();
  const [fs, setFs] = useState(false);

  const toggleFullscreen = () => {
    const el = document.documentElement;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().then(() => setFs(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setFs(false)).catch(() => {});
    }
  };

  return (
    <header className="hidden md:flex h-16 shrink-0 items-center justify-between px-6 bg-white/85 backdrop-blur border-b border-emerald-900/10 sticky top-0 z-30">
      <button
        onClick={onToggleSidebar}
        aria-label="Sembunyikan / tampilkan menu"
        className="w-9 h-9 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500"
      >
        <PanelLeft className="w-5 h-5" />
      </button>

      <div className="flex items-center gap-3">
        <button
          onClick={toggleFullscreen}
          className="flex items-center gap-1.5 text-xs font-medium px-3 h-9 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors"
        >
          <Maximize className="w-4 h-4" />
          {fs ? 'Keluar Layar Penuh' : 'Mode Ruang Guru'}
        </button>
        <div className="h-6 w-px bg-gray-200" />
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-700 text-xs font-semibold">
            {initials(session?.user?.name)}
          </div>
          <span className="text-sm font-medium text-gray-700 max-w-[140px] truncate">
            {session?.user?.name ?? 'Pengguna'}
          </span>
          <button
            onClick={() => { window.location.href = '/api/auth/federated-logout'; }}
            aria-label="Keluar"
            className="ml-1 w-9 h-9 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 flex items-center justify-center transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
