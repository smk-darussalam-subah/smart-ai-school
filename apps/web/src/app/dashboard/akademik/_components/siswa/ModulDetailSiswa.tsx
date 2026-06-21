'use client';

import type { SiswaScreen } from './SiswaWorkspace';

interface Props {
  moduleId: number;
  go: (screen: SiswaScreen) => void;
  setActiveModulId: (id: number | null) => void;
  setBadgeCelebration: (data: any) => void;
  showToast: (msg: string) => void;
}

export default function ModulDetailSiswa({ moduleId: _moduleId, go: _go, setActiveModulId: _setActiveModulId, setBadgeCelebration: _setBadgeCelebration, showToast: _showToast }: Props) {
  return (
    <div className="px-5 py-4">
      <p className="text-sm text-[var(--muted)]">Modul Detail screen — Batch D</p>
    </div>
  );
}
