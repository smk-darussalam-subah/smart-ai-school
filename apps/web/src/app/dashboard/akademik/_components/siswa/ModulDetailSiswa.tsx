'use client';

import { ArrowLeft, BookOpen, CheckCircle, Loader2, Target } from 'lucide-react';
import { useEffect, useRef, useState, useTransition } from 'react';
import type { SiswaScreen } from './SiswaWorkspace';
import type { BadgeCelebrationData, SiswaModul } from './siswa-types';
import { updateLmsProgress } from '../../actions';
import MaterialContent from '@/components/learning/MaterialContent';

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
  const [openingError, setOpeningError] = useState<string | null>(null);
  const [openingRetry, setOpeningRetry] = useState(0);
  const openingRequests = useRef(new Map<string, ReturnType<typeof updateLmsProgress>>());
  const readableId =
    module?.uuid && module.status !== 'Terkunci' && module.content?.trim() ? module.uuid : null;
  useEffect(() => {
    setOpeningError(null);
    if (!readableId) return;
    let active = true;
    // Reuse the same request across effect replay. The server keeps progress monotonic.
    let request = openingRequests.current.get(readableId);
    if (!request) {
      request = updateLmsProgress(readableId, 0);
      openingRequests.current.set(readableId, request);
    }
    void request
      .then((result) => {
        if (active && !result.success) setOpeningError('Progres membaca belum tersimpan.');
      })
      .catch(() => {
        if (active) setOpeningError('Progres membaca belum tersimpan.');
      });
    return () => {
      active = false;
    };
  }, [readableId, openingRetry]);

  const back = () => {
    setActiveModulId(null);
    go('modul');
  };

  if (!module) {
    return (
      <div className="px-5 py-4">
        <button
          type="button"
          onClick={back}
          className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-bold text-[var(--em)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--em)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali
        </button>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 text-sm font-semibold text-[var(--muted)]">
          Modul tidak ditemukan atau belum tersedia untuk akun ini.
        </div>
      </div>
    );
  }

  const progress = Math.min(100, Math.max(0, Number.isFinite(module.prog) ? module.prog : 0));
  const completed = module.status === 'Selesai' || progress >= 100;
  const locked = module.status === 'Terkunci';

  return (
    <div className="px-5 py-4">
      <button
        type="button"
        onClick={back}
        className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-bold text-[var(--em)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--em)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali ke Modul
      </button>

      <article className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg2)]">
        <header className="relative overflow-hidden bg-gradient-to-br from-emerald-700 to-emerald-950 p-5 text-white sm:p-7">
          <BookOpen
            aria-hidden="true"
            className="pointer-events-none absolute -right-4 bottom-0 h-36 w-36 rotate-[-12deg] text-emerald-400/10"
          />
          <div className="relative flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-emerald-100">
            <span className="min-w-0 break-words">{module.mapel}</span>
            {module.alokasi && <span className="shrink-0">{module.alokasi}</span>}
          </div>
          <h1 className="relative mt-3 max-w-[28ch] break-words text-2xl font-bold leading-snug">
            {module.judul}
          </h1>
          {module.tp && (
            <p className="relative mt-3 text-sm leading-6 text-emerald-100">{module.tp}</p>
          )}
        </header>

        <div className="space-y-6 p-5 sm:p-7">
          {openingError && !completed && (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 p-3 text-sm"
            >
              <span>{openingError}</span>
              <button
                type="button"
                className="min-h-11 px-3 font-semibold text-[var(--em)]"
                onClick={() => {
                  if (readableId) openingRequests.current.delete(readableId);
                  setOpeningRetry((retry) => retry + 1);
                }}
              >
                Coba lagi
              </button>
            </div>
          )}
          <div>
            <div className="mb-1 flex items-center justify-between text-xs font-bold text-[var(--muted)]">
              <span>Progres belajar</span>
              <span className="tabular-nums text-[var(--text)]">{completed ? 100 : progress}%</span>
            </div>
            <div
              role="progressbar"
              aria-label="Progres belajar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={completed ? 100 : progress}
              className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--bar-bg)]"
            >
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{ width: `${completed ? 100 : progress}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <InfoCard
              icon={BookOpen}
              label="Status LMS"
              value={completed ? 'Selesai' : locked ? 'Terkunci' : 'Aktif'}
            />
            <InfoCard icon={Target} label="KKTP" value={String(module.kktp)} />
          </div>

          <section
            aria-label="Materi pembelajaran"
            className="min-w-0 border-t border-[var(--border)] pt-6"
          >
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-[var(--text)]">
              <BookOpen aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--em)]" />
              Materi pembelajaran
            </h2>
            {locked ? (
              <p className="mt-3 text-sm text-[var(--muted)]">Materi belum dibuka oleh guru.</p>
            ) : module.content?.trim() ? (
              <MaterialContent content={module.content} />
            ) : (
              <p className="mt-3 text-sm text-[var(--muted)]">
                Materi belum tersedia. Silakan tanyakan kepada guru.
              </p>
            )}
          </section>

          {!locked && module.uuid && !completed && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  try {
                    const result = await updateLmsProgress(module.uuid!, 100);
                    if (result.success) {
                      onModuleCompleted(module.uuid!);
                      showToast('Modul ditandai selesai.');
                    } else {
                      showToast(result.error ?? 'Gagal memperbarui progres modul.');
                    }
                  } catch {
                    showToast('Status selesai belum terkonfirmasi. Muat ulang untuk memeriksa.');
                  }
                });
              }}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--em)] focus-visible:ring-offset-2 disabled:opacity-60"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4" />
              )}
              Tandai Modul Selesai
            </button>
          )}

          {completed && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm font-bold text-emerald-500">
              <CheckCircle className="h-4 w-4" />
              Selesai · 100%
            </div>
          )}
        </div>
      </article>
    </div>
  );
}

function InfoCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BookOpen;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4">
      <Icon aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--em)]" />
      <div className="min-w-0">
        <div className="text-xs font-medium text-[var(--muted)]">{label}</div>
        <div className="mt-1 break-words text-base font-bold text-[var(--text)]">{value}</div>
      </div>
    </div>
  );
}
