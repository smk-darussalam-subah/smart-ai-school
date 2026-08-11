'use client';

import { ArrowLeft, BookOpen, CheckCircle, Loader2, Target } from 'lucide-react';
import { useTransition } from 'react';
import type { SiswaScreen } from './SiswaWorkspace';
import type { BadgeCelebrationData, SiswaModul } from './siswa-types';
import { updateLmsProgress } from '../../actions';

interface Props {
  module: SiswaModul | null;
  moduleId: number;
  go: (screen: SiswaScreen) => void;
  setActiveModulId: (id: number | null) => void;
  setBadgeCelebration: (data: BadgeCelebrationData) => void;
  showToast: (msg: string) => void;
  onModuleCompleted: (moduleUuid: string) => void;
}

export default function ModulDetailSiswa({
  module,
  moduleId: _moduleId,
  go,
  setActiveModulId,
  setBadgeCelebration: _setBadgeCelebration,
  showToast,
  onModuleCompleted,
}: Props) {
  const [pending, startTransition] = useTransition();

  const back = () => {
    setActiveModulId(null);
    go('modul');
  };

  if (!module) {
    return (
      <div className="px-5 py-4">
        <button type="button" onClick={back} className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-emerald-500">
          <ArrowLeft className="h-4 w-4" />Kembali
        </button>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 text-sm font-semibold text-[var(--muted)]">
          Modul tidak ditemukan atau belum tersedia untuk akun ini.
        </div>
      </div>
    );
  }

  const completed = module.status === 'Selesai' || module.prog >= 100;
  const locked = module.status === 'Terkunci';

  return (
    <div className="px-5 py-4">
      <button type="button" onClick={back} className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-emerald-500">
        <ArrowLeft className="h-4 w-4" />Kembali ke Modul
      </button>

      <article className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-800 p-5 text-white">
          <div className="text-[11px] font-extrabold uppercase tracking-wider opacity-85">{module.mapel} - {module.alokasi}</div>
          <h1 className="mt-2 text-xl font-extrabold leading-tight">{module.judul}</h1>
          <p className="mt-2 text-sm font-semibold opacity-90">{module.tp}</p>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <div className="mb-1 flex items-center justify-between text-xs font-bold text-[var(--muted)]">
              <span>Progres belajar</span>
              <span>{completed ? 100 : module.prog}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--bar-bg)]">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${completed ? 100 : module.prog}%` }} />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <InfoCard icon={BookOpen} label="Status LMS" value={completed ? 'Selesai' : locked ? 'Terkunci' : 'Aktif'} />
            <InfoCard icon={Target} label="KKTP" value={String(module.kktp)} />
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
            <div className="text-sm font-bold text-[var(--text)]">Ringkasan kegiatan</div>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              Pelajari materi pada modul ini, lanjutkan latihan atau asesmen yang tersedia di tab Tugas,
              lalu tandai selesai setelah aktivitas belajar benar-benar tuntas.
            </p>
          </div>

          {!locked && module.uuid && !completed && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  const result = await updateLmsProgress(module.uuid!, 100);
                  if (result.success) {
                    onModuleCompleted(module.uuid!);
                    showToast('Modul ditandai selesai.');
                  } else {
                    showToast(result.error ?? 'Gagal memperbarui progres modul.');
                  }
                });
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-extrabold text-white disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              Tandai Modul Selesai
            </button>
          )}

          {completed && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm font-bold text-emerald-500">
              <CheckCircle className="h-4 w-4" />Selesai - 100%
            </div>
          )}
        </div>
      </article>
    </div>
  );
}

function InfoCard({ icon: Icon, label, value }: { icon: typeof BookOpen; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
      <Icon className="h-4 w-4 text-emerald-500" />
      <div className="mt-2 text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">{label}</div>
      <div className="mt-0.5 text-sm font-extrabold text-[var(--text)]">{value}</div>
    </div>
  );
}
