'use client';

import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Menu } from 'lucide-react';

export default function MobileNav({ viewAs = null, permissions = [], permError = false, positionRoles = [] }: { viewAs?: string | null; permissions?: string[]; permError?: boolean; positionRoles?: string[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex md:hidden items-center justify-between px-4 py-3 bg-white border-b border-gray-100 sticky top-0 z-40">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-smk-blue rounded-lg flex items-center justify-center">
          <span className="text-white text-xs font-bold">D</span>
        </div>
        <p className="font-bold text-gray-900 text-sm">DIIS</p>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <Menu className="h-6 w-6 text-gray-600" />
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-64 border-none">
          <Sidebar viewAs={viewAs} permissions={permissions} permError={permError} positionRoles={positionRoles} className="w-full h-full border-none shadow-none" />
        </SheetContent>
      </Sheet>
    </div>
  );
}
