'use client';

import { useState, type ReactNode } from 'react';
import { BookOpenCheck, Settings2 } from 'lucide-react';

interface Props {
  teachingWorkspace: ReactNode;
  operationsWorkspace: ReactNode;
  operationsLabel?: string;
  initialMode?: Mode;
}

type Mode = 'teaching' | 'operations';

const MODES = [
  {
    key: 'teaching',
    label: 'Pengajaran Saya',
    description: 'Kelas, modul, asesmen, nilai, dan aktivitas mengajar pribadi.',
    icon: BookOpenCheck,
  },
  {
    key: 'operations',
    label: 'Operasional Kurikulum',
    description: 'Penugasan mengajar dan koordinasi akademik sekolah.',
    icon: Settings2,
  },
] as const;

export default function AcademicRoleModeSwitcher({
  teachingWorkspace,
  operationsWorkspace,
  operationsLabel = 'Operasional Kurikulum',
  initialMode = 'teaching',
}: Props) {
  const [mode, setMode] = useState<Mode>(initialMode);

  return (
    <div className="space-y-5">
      <div className="border-b border-slate-200 pb-4">
        <p className="text-sm font-medium text-emerald-700">Peran aktif</p>
        <div
          className="mt-2 grid max-w-2xl gap-2 sm:grid-cols-2"
          role="tablist"
          aria-label="Pilih ruang kerja akademik"
        >
          {MODES.map(({ key, label, description, icon: Icon }) => {
            const active = mode === key;
            return (
              <button
                key={key}
                id={`academic-mode-${key}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`academic-panel-${key}`}
                tabIndex={active ? 0 : -1}
                onClick={() => setMode(key)}
                onKeyDown={(event) => {
                  if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
                  event.preventDefault();
                  const next =
                    event.key === 'Home'
                      ? 'teaching'
                      : event.key === 'End'
                        ? 'operations'
                        : key === 'teaching'
                          ? 'operations'
                          : 'teaching';
                  setMode(next);
                  document.getElementById(`academic-mode-${next}`)?.focus();
                }}
                className={`min-h-20 border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 ${
                  active
                    ? 'border-emerald-700 bg-emerald-50 text-emerald-950'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="flex items-center gap-2 font-semibold">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {key === 'operations' ? operationsLabel : label}
                </span>
                <span className="mt-1 block text-xs leading-5 text-slate-600">
                  {key === 'operations'
                    ? 'Tugas jabatan sesuai kewenangan dan lingkup yang ditetapkan.'
                    : description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        id="academic-panel-teaching"
        role="tabpanel"
        aria-labelledby="academic-mode-teaching"
        hidden={mode !== 'teaching'}
      >
        {teachingWorkspace}
      </div>
      <div
        id="academic-panel-operations"
        role="tabpanel"
        aria-labelledby="academic-mode-operations"
        hidden={mode !== 'operations'}
      >
        {operationsWorkspace}
      </div>
    </div>
  );
}
