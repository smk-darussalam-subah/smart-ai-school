// ScoreBar — bar nilai 0–100 berwarna sesuai ketuntasan (W0b). Primitif dipakai
// GradeRow & GradeDetailModal. Murni presentasional, tema-agnostik (track netral
// translucent). Warna mengikuti gradeStatus: tuntas=emerald · mid=amber · remedial=rose.

import { cn } from '@/lib/utils';
import { gradeStatus, KKTP_DEFAULT, type GradeNaStatus } from '@/lib/academic';

const TONE_CLASS: Record<GradeNaStatus, string> = {
  tuntas: 'bg-emerald-500',
  mid: 'bg-amber-500',
  remedial: 'bg-rose-500',
};

interface ScoreBarProps {
  /** Nilai 0–100 (di-clamp). */
  value: number;
  kktp?: number;
  /** Paksa warna; default diturunkan dari gradeStatus(value). */
  tone?: GradeNaStatus;
  className?: string;
}

export function ScoreBar({ value, kktp = KKTP_DEFAULT, tone, className }: ScoreBarProps) {
  const pct = Math.max(0, Math.min(100, value));
  const t = tone ?? gradeStatus(value, kktp);
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-zinc-500/15', className)}>
      <div
        className={cn('h-full rounded-full transition-[width] duration-500', TONE_CLASS[t])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
