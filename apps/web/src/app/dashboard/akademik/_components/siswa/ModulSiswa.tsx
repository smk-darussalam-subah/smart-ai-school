'use client';

import { useState } from 'react';
import { BookOpen, CheckCircle, Lock, Play, ChevronRight, Award } from 'lucide-react';
import { mpColor, mpIcon } from './siswa-data';
import type { SiswaScreen } from './SiswaWorkspace';

interface Props {
  modules: any[];
  badges: any[];
  showToast: (msg: string) => void;
  go: (screen: SiswaScreen) => void;
  setModal: (modal: any) => void;
  setBadgeCelebration: (data: any) => void;
  setActiveModulId: (id: number | null) => void;
}

export default function ModulSiswa({ modules, badges, showToast, go, setModal, setBadgeCelebration, setActiveModulId }: Props) {
  const [filter, setFilter] = useState<'all' | 'aktif' | 'selesai' | 'terkunci'>('all');

  const filtered = modules.filter((m: any) => {
    if (filter === 'all') return true;
    return m.status.toLowerCase() === filter;
  });

  const stats = {
    selesai: modules.filter((m: any) => m.status === 'Selesai').length,
    aktif: modules.filter((m: any) => m.status === 'Aktif').length,
    terkunci: modules.filter((m: any) => m.status === 'Terkunci').length,
  };

  return (
    <div>
      {/* Header */}
      <div className="px-5 py-4">
        <h1 className="text-2xl font-extrabold tracking-tight">Modul Ajar</h1>
        <div className="mt-2 flex items-center gap-2 text-sm text-[var(--muted)]">
          <BookOpen className="h-4 w-4" />
          <span>{stats.selesai} selesai · {stats.aktif} aktif · {stats.terkunci} terkunci</span>
        </div>
      </div>

      {/* Filters */}
      <div className="sticky top-[57px] z-10 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-3">
        <div className="flex gap-1.5">
          {(['all', 'aktif', 'selesai', 'terkunci'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all ${
                filter === f
                  ? 'bg-emerald-500 text-white'
                  : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--border2)]'
              }`}
            >
              {f === 'all' ? 'Semua' : f}
            </button>
          ))}
        </div>
      </div>

      {/* Module List */}
      <div className="px-5 py-4 space-y-3">
        {filtered.map((mod: any) => {
          const c = mpColor(mod.mapel);
          const isLocked = mod.status === 'Terkunci';
          const isSelesai = mod.status === 'Selesai';

          return (
            <button
              key={mod.id}
              onClick={() => {
                if (!isLocked) {
                  setActiveModulId(mod.id);
                  go('modul');
                }
              }}
              disabled={isLocked}
              className={`w-full overflow-hidden rounded-xl border text-left transition-all ${
                isLocked
                  ? 'border-[var(--border)] bg-[var(--surface)] opacity-60 cursor-not-allowed'
                  : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border2)] hover:-translate-y-0.5 cursor-pointer'
              }`}
            >
              <div
                className="relative flex h-10 items-center px-4"
                style={{ background: isLocked ? 'var(--bar-bg)' : `linear-gradient(135deg, ${c}, ${c}80)` }}
              >
                <div className="absolute left-2.5 top-1.5 rounded bg-white/20 px-1.5 py-0.5 text-[9px] font-extrabold text-white backdrop-blur">
                  {mod.tp}
                </div>
                <div className="ml-auto grid h-6 w-6 place-items-center rounded-lg bg-white/20 backdrop-blur">
                  <span className="text-white text-xs font-bold">{(mpIcon(mod.mapel) || 'book')[0].toUpperCase()}</span>
                </div>
              </div>
              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold">{mod.judul}</div>
                    <div className="mt-0.5 text-[11px] font-semibold text-[var(--muted)]">
                      {mod.mapel} · {mod.alokasi}
                    </div>
                  </div>
                  {isSelesai && <CheckCircle className="h-5 w-5 text-emerald-500 flex-shrink-0" />}
                  {isLocked && <Lock className="h-5 w-5 text-[var(--muted)] flex-shrink-0" />}
                </div>

                {!isLocked && mod.status === 'Aktif' && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-[var(--bar-bg)]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-700"
                        style={{ width: `${mod.prog}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-extrabold text-emerald-500">{mod.prog}%</span>
                  </div>
                )}

                {mod.badge && (
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-amber-500">
                    <Award className="h-3.5 w-3.5" />
                    {mod.badge}
                  </div>
                )}

                {isSelesai && mod.lms && (
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-500">
                    <CheckCircle className="h-3.5 w-3.5" />
                    LMS · Nilai tercatat
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
