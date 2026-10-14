'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, ChevronRight, FileText, Info, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { NA_WEIGHTS } from '@/lib/academic';
import {
  learnerGradeStatus,
  learnerGradeSummary,
  type LearnerGrade,
  type LearnerGradeState,
} from '@/lib/learner-grades';

export function LearnerGradeNotice({
  state,
  empty = false,
}: {
  state: LearnerGradeState;
  empty?: boolean;
}) {
  if (state === 'ready' && !empty) return null;
  const message =
    state === 'denied'
      ? 'Anda tidak memiliki izin melihat nilai.'
      : state === 'period-unavailable'
        ? 'Pilih periode sekolah yang tersedia untuk melihat nilai.'
        : state === 'unavailable'
          ? 'Nilai belum dapat dimuat. Coba muat ulang.'
          : 'Belum ada nilai pada periode ini.';
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface2)] p-3 text-xs font-semibold text-[var(--text)]"
    >
      <Info aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">{message}</span>
      {state !== 'ready' && state !== 'denied' && <LearnerGradeRetry />}
    </div>
  );
}

function LearnerGradeRetry() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.refresh()}
      className="flex min-h-11 items-center gap-1.5 rounded-lg px-3 font-bold hover:bg-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
    >
      <RefreshCw aria-hidden="true" className="h-4 w-4" />
      Muat ulang
    </button>
  );
}

type Filter = 'all' | 'tuntas' | 'remedial';
export default function LearnerGradeView({
  grades,
  state = 'ready',
  title,
  onReport,
  onDetail,
  initialFilter = 'all',
  shell,
}: {
  grades: LearnerGrade[];
  state?: LearnerGradeState;
  title: string;
  onReport: () => void;
  onDetail?: (grade: LearnerGrade) => void;
  initialFilter?: Filter;
  shell: 'siswa' | 'ortu';
}) {
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [detailSubject, setDetailSubject] = useState<string | null>(null);
  const rows = state === 'ready' ? grades : [];
  const detail = rows.find((grade) => grade.mp === detailSubject);
  const summary = learnerGradeSummary(rows);
  const shown = rows.filter((g) => filter === 'all' || g.status === filter);
  return (
    <div className="space-y-3 px-4 pb-4">
      <header className="flex flex-wrap items-center justify-between gap-2 py-3">
        <div>
          <h1 className="text-xl font-extrabold">{title}</h1>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Nilai berjalan pada periode pilihan; rapor resmi tersedia terpisah.
          </p>
        </div>
        <button
          type="button"
          onClick={onReport}
          className="flex min-h-11 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          <FileText aria-hidden="true" className="h-4 w-4" />
          Rapor resmi
        </button>
      </header>
      <LearnerGradeNotice state={state} empty={rows.length === 0} />
      {state === 'ready' && rows.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {[
              ['Rata-rata', summary.average ?? '—'],
              ['Tuntas', summary.assessed ? `${summary.tuntas}/${summary.assessed}` : '—'],
              ['Perlu remedial', summary.assessed ? summary.remedial : '—'],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-center"
              >
                <div className="text-xl font-extrabold tabular-nums">{value}</div>
                <div className="mt-1 text-[11px] font-semibold text-[var(--muted)]">{label}</div>
              </div>
            ))}
          </div>
          <p className="text-xs leading-5 text-[var(--muted)]">
            Ketuntasan mengikuti KKTP masing-masing mapel. Mapel tanpa KKTP belum dinilai tuntas
            atau remedial.
          </p>
          <div className="flex flex-wrap gap-2" aria-label="Filter ketuntasan">
            {(
              [
                { key: 'all', label: 'Semua' },
                { key: 'tuntas', label: 'Tuntas' },
                { key: 'remedial', label: 'Remedial' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                aria-pressed={filter === tab.key}
                onClick={() => setFilter(tab.key)}
                className={`min-h-11 rounded-lg border border-[var(--border)] px-3 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${filter === tab.key ? 'bg-emerald-700 text-white' : 'bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface2)]'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            {shown.length === 0 && (
              <p className="p-4 text-xs text-[var(--muted)]">Tidak ada mapel pada kategori ini.</p>
            )}
            {shown.map((grade) => (
              <button
                key={grade.mp}
                type="button"
                onClick={() => (onDetail ? onDetail(grade) : setDetailSubject(grade.mp))}
                className="flex w-full items-center gap-3 p-3 text-left hover:bg-[var(--surface2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500"
              >
                <BookOpen aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--muted)]" />
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-bold">{grade.mp}</span>
                  <span className="mt-1 block text-xs text-[var(--muted)]">
                    {learnerGradeStatus(grade)} · KKTP {grade.kktp ?? '—'}
                  </span>
                </span>
                <span
                  className={`shrink-0 text-xl font-extrabold tabular-nums ${grade.status === 'tuntas' ? 'text-[var(--em)]' : grade.status === 'remedial' ? 'text-[var(--amber)]' : 'text-[var(--muted)]'}`}
                >
                  {grade.na ?? '—'}
                </span>
                <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0" />
              </button>
            ))}
          </div>
        </>
      )}
      {detail && (
        <LearnerGradeDetail grade={detail} shell={shell} onClose={() => setDetailSubject(null)} />
      )}
    </div>
  );
}

export function LearnerGradeDetail({
  grade,
  shell,
  onClose,
}: {
  grade: LearnerGrade;
  shell: 'siswa' | 'ortu';
  onClose: () => void;
}) {
  const labels = {
    uh: 'Ulangan Harian',
    praktik: 'Praktik',
    sikap: 'Sikap',
    uts: 'UTS',
    uas: 'UAS',
  };
  return (
    <Dialog
      open
      onOpenChange={(open: boolean) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className={`${shell}-app max-h-[85dvh] w-[calc(100%-2rem)] overflow-y-auto border-[var(--border)] bg-[var(--surface)] text-[var(--text)]`}
      >
        <DialogTitle className="pr-12 break-words text-base">{grade.mp}</DialogTitle>
        <DialogDescription className="text-xs text-[var(--muted)]">
          Rincian nilai pada periode pilihan.
        </DialogDescription>
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
          <div>
            <p className="text-xs text-[var(--muted)]">Nilai Akhir (NA)</p>
            <p className="mt-1 text-sm font-bold">
              {learnerGradeStatus(grade)} · KKTP {grade.kktp ?? '—'}
            </p>
          </div>
          <strong className="text-3xl tabular-nums">{grade.na ?? '—'}</strong>
        </div>
        <dl className="divide-y divide-[var(--border)]">
          {(Object.keys(labels) as Array<keyof typeof labels>).map((key) => (
            <div key={key} className="flex items-center justify-between gap-3 py-2 text-xs">
              <dt>
                {labels[key]}
                <span className="mt-0.5 block text-[var(--muted)]">
                  Bobot {NA_WEIGHTS[key] * 100}%
                </span>
              </dt>
              <dd className="font-bold tabular-nums">
                {grade.components[key] ?? 'Belum ada nilai'}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-xs leading-5 text-[var(--muted)]">
          Nilai komponen merupakan rata-rata yang dihitung sekolah. Nilai akhir memakai bobot
          komponen yang sudah terisi; komponen kosong tidak dianggap nol.
        </p>
      </DialogContent>
    </Dialog>
  );
}
