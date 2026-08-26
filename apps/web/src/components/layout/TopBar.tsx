'use client';

// =============================================================================
// TopBar (desktop) — 2L shell. Tombol sembunyikan sidebar, layar penuh (kiosk
// ruang guru), dan menu pengguna. Jam besar khusus Beranda ada di halamannya.
// =============================================================================

import { useSession } from 'next-auth/react';
import React from 'react';
import { PanelLeft, LogOut } from 'lucide-react';
import { identityRoleLabel, positionRoleLabel } from '@/lib/display-shell';

function initials(name?: string | null): string {
  if (!name) return 'U';
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

export default function TopBar({ viewAs = null, onToggleSidebar, positionRoles = [] }: { viewAs?: string | null; onToggleSidebar: () => void; positionRoles?: string[] }) {
  const { data: session } = useSession();
  const identity = identityRoleLabel(viewAs ?? ((session?.roles as string[] | undefined) ?? [])[0] ?? '');
  const appointment = positionRoles[0] ? positionRoleLabel(positionRoles[0]) : null;

  return (
    <header className="hidden md:flex h-16 shrink-0 items-center justify-between px-6 bg-white/85 backdrop-blur border-b border-emerald-900/10 sticky top-0 z-30">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label="Sembunyikan atau tampilkan menu"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
        >
          <PanelLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase text-slate-500">{viewAs ? 'Mode tinjau' : 'Konteks aktif'}</p>
          <p className="truncate text-sm font-medium text-slate-800">
            {identity}{appointment ? ` · ${appointment}` : ''}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
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
            className="ml-1 flex min-h-11 min-w-11 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
