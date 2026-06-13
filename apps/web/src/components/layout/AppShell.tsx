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

interface Props {
  viewAs: string | null;
  permissions: string[];
  permError: boolean;
  children: React.ReactNode;
}

export default function AppShell({ viewAs, permissions, permError, children }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex flex-col md:flex-row h-full min-h-screen">
      {/* Mobile: top bar + drawer (komponen sudah md:hidden) */}
      <MobileNav viewAs={viewAs} permissions={permissions} permError={permError} />

      {/* Desktop sidebar — disembunyikan ke kiri saat collapsed */}
      <div
        className={clsx(
          'hidden md:block shrink-0 transition-[margin] duration-200 ease-out',
          collapsed && '-ml-64',
        )}
        aria-hidden={collapsed}
      >
        <Sidebar viewAs={viewAs} permissions={permissions} permError={permError} />
      </div>

      {/* Konten */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar onToggleSidebar={() => setCollapsed((c) => !c)} />
        {viewAs && <ViewAsBanner viewAs={viewAs} />}
        <main className="flex-1 overflow-auto bg-gray-50">
          <div className="p-4 md:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
