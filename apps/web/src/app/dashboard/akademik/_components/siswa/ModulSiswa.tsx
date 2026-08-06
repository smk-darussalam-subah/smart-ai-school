'use client';

import React, { useState, useTransition } from 'react';
import { BookOpen, CheckCircle, Lock, Award, Loader2 } from 'lucide-react';
import { mpColor, mpIcon } from './siswa-data';
import type { SiswaScreen, ModalState } from './SiswaWorkspace';
import type { SiswaModul, SiswaBadge, BadgeCelebrationData } from './siswa-types';
import { updateLmsProgress } from '../../actions';

interface Props {
  modules: SiswaModul[];
  badges: SiswaBadge[];
  showToast: (msg: string) => void;
  go: (screen: SiswaScreen) => void;
  setModal: (modal: ModalState) => void;
  setBadgeCelebration: (data: BadgeCelebrationData) => void;
  setActiveModulId: (id: number | null) => void;
  onModuleCompleted: (moduleUuid: string) => void;
}

interface ModuleCardProps {
  module: SiswaModul;
  isPending: boolean;
  onOpen: () => void;
  onComplete: () => void;
}

export function ModuleCard({ module, isPending, onOpen, onComplete }: ModuleCardProps) {
  const color = mpColor(module.mapel);
  const isLocked = module.status === 'Terkunci';
  const isCompleted = module.status === 'Selesai';
  const progress = isCompleted ? 100 : module.prog;

  return (
    <article
      className={`overflow-hidden rounded-xl border transition-all ${
        isLocked
          ? 'border-[var(--border)] bg-[var(--surface)] opacity-60'
          : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border2)] hover:-translate-y-0.5'
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        disabled={isLocked}
        aria-label={`Buka modul ${module.judul}`}
        className={`block w-full overflow-hidden text-left ${
          isLocked ? 'cursor-not-allowed' : 'cursor-pointer'
        }`}
      >
        <div
          className="relative flex h-10 items-center px-4"
          style={{ background: isLocked ? 'var(--bar-bg)' : `linear-gradient(135deg, ${color}, ${color}80)` }}
        >
          <div className="absolute left-2.5 top-1.5 rounded bg-white/20 px-1.5 py-0.5 text-[9px] font-extrabold text-white backdrop-blur">
            {module.tp}
          </div>
          <div className="ml-auto grid h-6 w-6 place-items-center rounded-lg bg-white/20 backdrop-blur">
            <span className="text-white text-xs font-bold">{(mpIcon(module.mapel) || 'book').charAt(0).toUpperCase()}</span>
          </div>
        </div>
        <div className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold">{module.judul}</div>
              <div className="mt-0.5 text-[11px] font-semibold text-[var(--muted)]">
                {module.mapel} · {module.alokasi}
              </div>
            </div>
            {isCompleted && <CheckCircle className="h-5 w-5 flex-shrink-0 text-emerald-500" aria-hidden="true" />}
            {isLocked && <Lock className="h-5 w-5 flex-shrink-0 text-[var(--muted)]" aria-hidden="true" />}
          </div>

          {!isLocked && (
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--bar-bg)]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-700"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-[11px] font-extrabold text-emerald-500">{progress}%</span>
            </div>
          )}

          {isCompleted && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-500" role="status">
              <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
              Selesai
            </div>
          )}

          {module.badge && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-amber-500">
              <Award className="h-3.5 w-3.5" />
              {module.badge}
            </div>
          )}

          {isCompleted && module.lms && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-500">
              <CheckCircle className="h-3.5 w-3.5" />
              LMS · Nilai tercatat
            </div>
          )}
        </div>
      </button>

      {!isLocked && module.status === 'Aktif' && module.uuid && module.prog < 100 && (
        <div className="px-3 pb-3">
          <button
            type="button"
            onClick={onComplete}
            disabled={isPending}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[11px] font-bold text-emerald-600 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
          >
            {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
            Tandai Selesai
          </button>
        </div>
      )}
    </article>
  );
}

export default function ModulSiswa({ modules, badges: _badges, showToast, go, setModal: _setModal, setBadgeCelebration: _setBadgeCelebration, setActiveModulId, onModuleCompleted }: Props) {
  const [filter, setFilter] = useState<'all' | 'aktif' | 'selesai' | 'terkunci'>('all');
  const [pendingModuleUuid, startTransition] = useTransition();

  const filtered = modules.filter((m: SiswaModul) => {
    if (filter === 'all') return true;
    return m.status.toLowerCase() === filter;
  });

  const stats = {
    selesai: modules.filter((m: SiswaModul) => m.status === 'Selesai').length,
    aktif: modules.filter((m: SiswaModul) => m.status === 'Aktif').length,
    terkunci: modules.filter((m: SiswaModul) => m.status === 'Terkunci').length,
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
        {filtered.map((module: SiswaModul) => (
          <ModuleCard
            key={module.id}
            module={module}
            isPending={pendingModuleUuid}
            onOpen={() => {
              setActiveModulId(module.id);
              go('modul');
            }}
            onComplete={() => {
              if (!module.uuid) return;

              startTransition(async () => {
                const result = await updateLmsProgress(module.uuid!, 100);
                if (result.success) {
                  onModuleCompleted(module.uuid!);
                  showToast('Modul ditandai selesai!');
                } else {
                  showToast(result.error ?? 'Gagal memperbarui progres');
                }
              });
            }}
          />
        ))}
      </div>
    </div>
  );
}
