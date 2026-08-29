'use client';

import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Menu } from 'lucide-react';
import { identityRoleLabel, positionRoleLabel } from '@/lib/display-shell';

export default function MobileNav({ viewAs = null, permissions = [], permError = false, positionRoles = [] }: { viewAs?: string | null; permissions?: string[]; permError?: boolean; positionRoles?: string[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex md:hidden items-center justify-between px-4 py-3 bg-white border-b border-gray-100 sticky top-0 z-40">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-smk-emerald-deep">
          <span className="text-white text-xs font-bold">D</span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900">DIIS</p>
          <p className="max-w-[13rem] truncate text-[11px] text-slate-500">
            {viewAs ? `Mode tinjau · ${identityRoleLabel(viewAs)}` : positionRoles[0] ? positionRoleLabel(positionRoles[0]) : 'Ruang kerja sekolah'}
          </p>
        </div>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button type="button" aria-label="Buka menu navigasi" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-gray-100 transition-colors">
            <Menu className="h-6 w-6 text-gray-600" aria-hidden="true" />
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-64 border-none">
          <SheetTitle className="sr-only">Menu navigasi</SheetTitle>
          <SheetDescription className="sr-only">
            Navigasi utama sesuai peran dan kewenangan aktif.
          </SheetDescription>
          <Sidebar viewAs={viewAs} permissions={permissions} permError={permError} positionRoles={positionRoles} onNavigate={() => setOpen(false)} className="h-full w-full border-none shadow-none" />
        </SheetContent>
      </Sheet>
    </div>
  );
}
