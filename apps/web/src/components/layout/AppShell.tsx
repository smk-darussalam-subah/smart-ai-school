'use client';

// =============================================================================
// AppShell (2L) — kerangka dashboard: sidebar desktop yang bisa disembunyikan
// ke kiri (collapse) + TopBar + area konten. Mobile tetap pakai MobileNav.
// Dipakai oleh dashboard/layout.tsx (server) yang mengoper props non-sensitif.
// =============================================================================

import { useState } from 'react';
import clsx from 'clsx';
import { Sidebar } from './Sidebar';
import MobileNav from './MobileNav';
import TopBar from './TopBar';
import ViewAsBanner from './ViewAsBanner';
import { visiblePositionRoles } from '@/lib/sidebar-position-roles';

interface Props {
  viewAs: string | null;
  permissions: string[];
  permError: boolean;
  hideChrome?: boolean;
  positionRoles?: string[];
  children: React.ReactNode;
}

export default function AppShell({ viewAs, permissions, permError, hideChrome, positionRoles = [], children }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const effectivePositionRoles = visiblePositionRoles(viewAs, [], positionRoles);

  // SISWA & ORANG_TUA dashboards are self-contained mobile-first apps with
  // native bottom navigation. Skip all AppShell chrome and render children directly.
  if (hideChrome) {
    return <div className="min-h-screen">{children}</div>;
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-[100] -translate-y-20 rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white focus:translate-y-0"
      >
        Lewati ke konten utama
      </a>
      {/* Mobile: top bar + drawer (komponen sudah md:hidden) */}
      <MobileNav viewAs={viewAs} permissions={permissions} permError={permError} positionRoles={effectivePositionRoles} />

      {/* Desktop sidebar — disembunyikan ke kiri saat collapsed */}
      <div
        className={clsx(
          'hidden md:block shrink-0 transition-[margin] duration-200 ease-out',
          collapsed && '-ml-64',
        )}
        aria-hidden={collapsed}
      >
        <Sidebar viewAs={viewAs} permissions={permissions} permError={permError} positionRoles={effectivePositionRoles} />
      </div>

      {/* Konten */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar viewAs={viewAs} positionRoles={effectivePositionRoles} onToggleSidebar={() => setCollapsed((c) => !c)} />
        {viewAs && <ViewAsBanner viewAs={viewAs} />}
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-auto bg-gray-50 outline-none">
          <div className="p-4 md:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
