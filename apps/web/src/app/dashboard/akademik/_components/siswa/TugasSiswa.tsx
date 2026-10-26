'use client';

import React, { useState } from 'react';
import {
  BookOpen,
  ClipboardList,
  Calendar,
  AlertCircle,
  CheckCircle,
  RotateCcw,
} from 'lucide-react';
import { mpColor } from './siswa-data';
import type { SiswaScreen, ModalState } from './SiswaWorkspace';
import type { SiswaTugas } from './siswa-types';
import { filterStudentTasksForWorkflow } from '@/lib/academic-workflow-deep-link';
import DashboardReadNotice from '../DashboardReadNotice';
import type { DashboardReadState } from '@/lib/learner-dashboard-read';

type TaskSourceFilter = 'all' | 'assessment' | 'remedial' | 'module';
type TaskStatusFilter = 'all' | 'pending' | 'submitted' | 'graded' | 'closed';

const REMEDIAL_STATUS_LABEL: Record<
  NonNullable<SiswaTugas['remedialParticipant']>['status'],
  string
> = {
  assigned: 'Ditugaskan',
  in_progress: 'Sedang dikerjakan',
  submitted: 'Menunggu finalisasi guru',
  passed: 'Tuntas',
  needs_retry: 'Perlu percobaan berikutnya',
};

const REMEDIAL_BADGE_LABEL: Record<
  NonNullable<SiswaTugas['remedialParticipant']>['status'],
  string
> = {
  assigned: 'DITUGASKAN',
  in_progress: 'DIKERJAKAN',
  submitted: 'DIKIRIM',
  passed: 'TUNTAS',
  needs_retry: 'PERLU ULANG',
};

function taskActionPriority(task: SiswaTugas): number {
  const remedialStatus = task.remedialParticipant?.status;
  if (
    remedialStatus === 'assigned' ||
    remedialStatus === 'in_progress' ||
    remedialStatus === 'needs_retry'
  )
    return 0;
  if (remedialStatus === 'submitted') return 1;
  if (remedialStatus === 'passed') return 3;

  if (task.status === 'pending') return 0;
  if (task.status === 'submitted') return 1;
  return 3;
}

interface Props {
  tasks: SiswaTugas[];
  taskState?: DashboardReadState;
  onRetryTasks?: () => void;
  showToast: (msg: string) => void;
  go: (screen: SiswaScreen) => void;
  setModal: (modal: ModalState) => void;
  initialSourceFilter?: 'all' | 'assessment' | 'remedial';
}

export default function TugasSiswa({
  tasks: suppliedTasks,
  taskState = 'ready',
  onRetryTasks,
  showToast: _showToast,
  go: _go,
  setModal,
  initialSourceFilter = 'all',
}: Props) {
  const [filter, setFilter] = useState<TaskStatusFilter>(
    initialSourceFilter === 'remedial' ? 'all' : 'pending',
  );
  const [sourceFilter, setSourceFilter] = useState<TaskSourceFilter>(initialSourceFilter);
  const tasks = taskState === 'ready' ? suppliedTasks : [];
  if (taskState !== 'ready')
    return (
      <div className="space-y-4 px-5 py-4">
        <h1 className="text-2xl font-extrabold tracking-tight">Tugas</h1>
        <DashboardReadNotice state={taskState} domain="Tugas" onRetry={onRetryTasks} />
      </div>
    );

  // T1-04 (audit v2): langsung dari props. Empty → empty state, BUKAN SIM_TUGAS.
  const displayTasks =
    sourceFilter === 'module'
      ? tasks.filter((task) => !task.assessmentSessionId)
      : filterStudentTasksForWorkflow(tasks, sourceFilter);
  const filtered =
    filter === 'all' ? displayTasks : displayTasks.filter((t) => t.status === filter);

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
          <span>
            {stats.pending} perlu dikerjakan · {stats.submitted} dalam proses · {stats.graded}{' '}
            selesai
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="sticky top-[57px] z-10 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-3">
        <div className="mb-2 flex gap-1.5" role="group" aria-label="Sumber tugas">
          {(
            [
              ['all', 'Semua'],
              ['assessment', 'Asesmen'],
              ['remedial', 'Remedial'],
              ['module', 'Modul'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSourceFilter(key)}
              className={`min-h-11 rounded-lg px-3 text-xs font-bold transition-colors ${
                sourceFilter === key
                  ? 'bg-[var(--em)] text-[#032a20]'
                  : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--border2)]'
              }`}
              aria-pressed={sourceFilter === key}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Status tugas">
          {(
            [
              ['all', 'Semua'],
              ['pending', 'Perlu dikerjakan'],
              ['submitted', 'Dalam proses'],
              ['graded', 'Selesai'],
              ['closed', 'Ditutup'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              aria-pressed={filter === key}
              className={`min-h-11 rounded-lg border px-3 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                filter === key
                  ? 'border-emerald-700 bg-emerald-700 text-white'
                  : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--border2)]'
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
          [...filtered]
            .sort((a, b) => {
              if (filter === 'all') {
                const priorityDelta = taskActionPriority(a) - taskActionPriority(b);
                if (priorityDelta !== 0) return priorityDelta;
              }
              if (filter === 'pending' || filter === 'all') return a.dlDays - b.dlDays;
              return 0;
            })
            .map((t) => {
              const c = mpColor(t.mp);
              const hasDeadline = Boolean(t.dueAt) && Number.isFinite(t.dlDays);
              const urgent = hasDeadline && t.dlDays <= 1 && t.status === 'pending';
              const overdue = hasDeadline && t.dlDays < 0 && t.status === 'pending';
              const remedialStatus = t.remedialParticipant?.status ?? null;
              const isRemedial = t.purpose === 'remedial' && remedialStatus !== null;
              const isModule = !t.assessmentSessionId;
              const badgeLabel = isRemedial
                ? REMEDIAL_BADGE_LABEL[remedialStatus]
                : t.status === 'closed'
                  ? 'DITUTUP'
                  : isModule
                    ? t.status === 'graded'
                      ? 'SELESAI'
                      : t.status === 'submitted'
                        ? 'DIBACA'
                        : 'BELUM DIBACA'
                    : overdue
                      ? 'TERLAMBAT'
                      : t.status === 'pending'
                        ? 'PENDING'
                        : t.status === 'submitted'
                          ? 'DIKIRIM'
                          : 'DINILAI';
              const badgeClass = isRemedial
                ? remedialStatus === 'passed'
                  ? 'bg-emerald-500/15 text-emerald-500'
                  : remedialStatus === 'needs_retry'
                    ? 'bg-rose-500/15 text-rose-500'
                    : remedialStatus === 'submitted'
                      ? 'bg-amber-500/15 text-amber-500'
                      : 'bg-sky-500/15 text-sky-400'
                : overdue
                  ? 'bg-rose-500/15 text-rose-500'
                  : urgent || t.status === 'submitted'
                    ? 'bg-amber-500/15 text-amber-500'
                    : 'bg-emerald-500/15 text-emerald-500';

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
                        {isModule ? (
                          <BookOpen aria-hidden="true" className="h-5 w-5" />
                        ) : (
                          <ClipboardList aria-hidden="true" className="h-5 w-5" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-base font-bold">{t.title}</div>
                        <div className="mt-0.5 text-[11px] font-semibold text-[var(--muted)]">
                          {t.mp} · {t.type}
                        </div>

                        {isRemedial && (
                          <div className="mt-2 flex items-center gap-1.5 text-xs font-bold text-sky-400">
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                            {REMEDIAL_STATUS_LABEL[remedialStatus]}
                          </div>
                        )}

                        {/* Deadline */}
                        {hasDeadline && (
                          <div
                            className={`mt-2 flex items-center gap-1.5 text-[11px] font-bold ${
                              overdue
                                ? 'text-rose-500'
                                : urgent
                                  ? 'text-amber-500'
                                  : 'text-[var(--muted)]'
                            }`}
                          >
                            <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                            Tenggat {t.deadline}
                            {t.status === 'pending' && (
                              <span>
                                {overdue
                                  ? '· Terlewat'
                                  : t.dlDays === 0
                                    ? '· Hari ini'
                                    : `· ${t.dlDays} hari lagi`}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Submitted status */}
                        {!isRemedial && !isModule && t.status === 'submitted' && (
                          <div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-amber-500">
                            <CheckCircle className="h-3.5 w-3.5" />
                            {t.lateSubmissionStatus === 'pending'
                              ? 'Menunggu keputusan guru'
                              : t.lateSubmissionStatus === 'rejected'
                                ? 'Jawaban terlambat ditolak'
                                : 'Menunggu penilaian'}
                          </div>
                        )}

                        {/* Graded status */}
                        {!isRemedial &&
                          !isModule &&
                          t.status === 'graded' &&
                          typeof t.score === 'number' && (
                            <div className="mt-2 flex items-center gap-2">
                              <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-500">
                                <CheckCircle className="h-3.5 w-3.5" />
                                Dinilai
                              </div>
                              <div className="text-lg font-extrabold text-emerald-500">
                                {t.score}
                              </div>
                            </div>
                          )}
                        {isModule && (
                          <p className="mt-2 text-sm font-semibold text-[var(--muted)]">
                            {t.status === 'graded'
                              ? 'Bacaan ditandai selesai'
                              : `Progres membaca ${t.progress ?? 0}%`}
                          </p>
                        )}
                      </div>

                      {/* Status badge */}
                      <span
                        className={`flex-shrink-0 whitespace-nowrap rounded-lg px-2 py-1 text-[10px] font-extrabold ${badgeClass}`}
                      >
                        {badgeLabel}
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
            <div className="text-lg">
              {filter === 'all'
                ? 'Belum ada tugas pada kategori ini'
                : `Tidak ada tugas ${filter === 'pending' ? 'yang perlu dikerjakan' : filter === 'submitted' ? 'dalam proses' : filter === 'closed' ? 'yang ditutup' : 'yang selesai'}`}
            </div>
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
              <div className="mt-1">
                Kerjakan tugas dengan deadline terdekat terlebih dahulu. Klik tugas untuk melihat
                detail dan submit.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
