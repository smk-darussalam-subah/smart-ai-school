'use client';

// GradeRow — baris nilai per mapel (W0b): ringkasan komponen + bar + NA berbobot.
// Dipakai bersama dashboard Nilai siswa & ortu. NA dihitung via naOf (RESMI berbobot,
// W0a). Tema-agnostik. Klik opsional → buka GradeDetailModal.

import { TrendingUp, TrendingDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { naOf, gradeStatus, GRADE_COMPONENT_KEYS, KKTP_DEFAULT, type StudentGradeComponents } from '@/lib/academic';
import { ScoreBar } from './ScoreBar';
import { COMP_LABEL_SHORT, STATUS_TEXT_CLASS } from './grade-meta';

// Komponen yang diringkas di subjudul (Sikap dirinci di modal detail saja).
const SUMMARY_KEYS = GRADE_COMPONENT_KEYS.filter((k) => k !== 'sikap');

interface GradeRowProps {
  subject: string;
  components: StudentGradeComponents;
  kktp?: number;
  trend?: 'up' | 'down' | null;
  onClick?: () => void;
  className?: string;
}

export function GradeRow({ subject, components, kktp = KKTP_DEFAULT, trend, onClick, className }: GradeRowProps) {
  const na = naOf(components);
  const status = na != null ? gradeStatus(na, kktp) : null;
  const summary = SUMMARY_KEYS.map((k) => `${COMP_LABEL_SHORT[k]} ${components[k] ?? '—'}`).join(' · ');

  const content = (
    <>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold">{subject}</div>
        <div className="mt-0.5 truncate text-[11px] font-medium text-zinc-400">{summary}</div>
        {na != null && <ScoreBar value={na} kktp={kktp} tone={status ?? undefined} className="mt-1.5" />}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className={cn('text-lg font-extrabold tabular-nums', status ? STATUS_TEXT_CLASS[status] : 'text-zinc-400')}>
          {na ?? '—'}
        </span>
        {trend === 'up' && <TrendingUp className="h-3.5 w-3.5 text-emerald-500" aria-label="naik" />}
        {trend === 'down' && <TrendingDown className="h-3.5 w-3.5 text-rose-500" aria-label="turun" />}
        {onClick && <ChevronRight className="h-4 w-4 text-zinc-400/60" aria-hidden />}
      </div>
    </>
  );

  const base = 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left';
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(base, 'transition hover:bg-zinc-500/5', className)}>
      {content}
    </button>
  ) : (
    <div className={cn(base, className)}>{content}</div>
  );
}
