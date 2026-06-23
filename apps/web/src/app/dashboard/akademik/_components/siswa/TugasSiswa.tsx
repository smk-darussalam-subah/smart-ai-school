'use client';

import { useState } from 'react';
import { ClipboardList, Calendar, AlertCircle, CheckCircle } from 'lucide-react';
import { mpColor, mpIcon, SIM_TUGAS } from './siswa-data';
import type { SiswaScreen, ModalState } from './SiswaWorkspace';
import type { SiswaTugas } from './siswa-types';

interface Props {
  tasks: SiswaTugas[];
  showToast: (msg: string) => void;
  go: (screen: SiswaScreen) => void;
  setModal: (modal: ModalState) => void;
}

export default function TugasSiswa({ tasks, showToast: _showToast, go: _go, setModal }: Props) {
  const [filter, setFilter] = useState<'pending' | 'submitted' | 'graded'>('pending');
  
  const displayTasks = tasks.length > 0 ? tasks : SIM_TUGAS;
  const filtered = displayTasks.filter((t) => t.status === filter);

  const stats = {
    pending: displayTasks.filter((t) => t.status === 'pending').length,
    submitted: displayTasks.filter((t) => t.status === 'submitted').length,
    graded: displayTasks.filter((t) => t.status === 'graded').length,
  };

  return (
    <div>
      {/* Header */}
      <div className="px-5 py-4">
        <h1 className="text-2xl font-extrabold tracking-tight">Tugas</h1>
        <div className="mt-2 flex items-center gap-2 text-sm text-[var(--muted)]">
          <ClipboardList className="h-4 w-4" />
          <span>{stats.pending} pending · {stats.submitted} submitted · {stats.graded} graded</span>
        </div>
      </div>

      {/* Filters */}
      <div className="sticky top-[57px] z-10 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-3">
        <div className="flex gap-1.5">
          {([
            ['pending', 'Pending', 'bg-rose-500'],
            ['submitted', 'Submitted', 'bg-amber-500'],
            ['graded', 'Graded', 'bg-emerald-500'],
          ] as const).map(([key, label, color]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all ${
                filter === key
                  ? `${color} text-white`
                  : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--border2)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Task List */}
      <div className="px-5 py-4 space-y-3">
        {filtered.length > 0 ? (
          filtered
            .sort((a, b) => {
              if (filter === 'pending') return a.dlDays - b.dlDays;
              return 0;
            })
            .map((t) => {
              const c = mpColor(t.mp);
              const urgent = t.dlDays <= 1 && t.status === 'pending';
              const overdue = t.dlDays < 0 && t.status === 'pending';

              return (
                <button
                  key={t.id}
                  onClick={() => setModal({ type: 'task', data: { task: t } })}
                  className="w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] text-left transition-all hover:border-[var(--border2)] hover:-translate-y-0.5"
                >
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <div
                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
                        style={{ background: `${c}20`, color: c }}
                      >
                        <span className="text-lg font-extrabold">{(mpIcon(t.mp) || 'book').charAt(0).toUpperCase()}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-base font-bold">{t.title}</div>
                        <div className="mt-0.5 text-[11px] font-semibold text-[var(--muted)]">
                          {t.mp} · {t.type}
                        </div>

                        {/* Deadline */}
                        {t.status === 'pending' && (
                          <div className={`mt-2 flex items-center gap-1.5 text-[11px] font-bold ${
                            overdue ? 'text-rose-500' : urgent ? 'text-amber-500' : 'text-[var(--muted)]'
                          }`}>
                            <Calendar className="h-3.5 w-3.5" />
                            {overdue ? '⚠ Overdue!' : urgent ? `⚠ ${t.dlDays === 0 ? 'Deadline hari ini!' : `${t.dlDays} hari lagi`}` : `${t.dlDays} hari lagi`}
                          </div>
                        )}

                        {/* Submitted status */}
                        {t.status === 'submitted' && (
                          <div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-amber-500">
                            <CheckCircle className="h-3.5 w-3.5" />
                            Submitted · Menunggu penilaian
                          </div>
                        )}

                        {/* Graded status */}
                        {t.status === 'graded' && t.score !== null && (
                          <div className="mt-2 flex items-center gap-2">
                            <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-500">
                              <CheckCircle className="h-3.5 w-3.5" />
                              Dinilai
                            </div>
                            <div className="text-lg font-extrabold text-emerald-500">{t.score}</div>
                          </div>
                        )}
                      </div>

                      {/* Status badge */}
                      <span
                        className={`flex-shrink-0 rounded-lg px-2 py-1 text-[10px] font-extrabold ${
                          overdue
                            ? 'bg-rose-500/15 text-rose-500'
                            : urgent
                            ? 'bg-amber-500/15 text-amber-500'
                            : t.status === 'submitted'
                            ? 'bg-amber-500/15 text-amber-500'
                            : 'bg-emerald-500/15 text-emerald-500'
                        }`}
                      >
                        {overdue ? 'OVERDUE' : t.status === 'pending' ? 'PENDING' : t.status === 'submitted' ? 'SUBMITTED' : 'GRADED'}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })
        ) : (
          <div className="py-12 text-center text-[var(--dim)]">
            <div className="mx-auto mb-3 h-12 w-12 opacity-50">
              {filter === 'pending' ? '✓' : filter === 'submitted' ? '📤' : '📝'}
            </div>
            <div className="text-lg">Tidak ada tugas {filter === 'pending' ? 'pending' : filter === 'submitted' ? 'submitted' : 'graded'}</div>
          </div>
        )}
      </div>

      {/* Info Footer */}
      {filter === 'pending' && stats.pending > 0 && (
        <div className="mx-5 mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-[var(--muted)]">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-500" />
            <div>
              <div className="font-bold text-amber-500">Tugas Mendesak</div>
              <div className="mt-1">Kerjakan tugas dengan deadline terdekat terlebih dahulu. Klik tugas untuk melihat detail dan submit.</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
