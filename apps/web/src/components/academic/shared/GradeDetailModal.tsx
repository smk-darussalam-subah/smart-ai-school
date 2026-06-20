'use client';

// GradeDetailModal — rincian nilai satu mapel (W0b): skor per komponen + bar + NA
// berbobot + status ketuntasan. Dipakai bersama siswa & ortu. Memakai shadcn Dialog
// (permukaan terang; siswa/ortu mode gelap dapat override via contentClassName).

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  naOf,
  gradeStatus,
  GRADE_COMPONENT_KEYS,
  NA_WEIGHTS,
  KKTP_DEFAULT,
  type StudentGradeComponents,
} from '@/lib/academic';
import { cn } from '@/lib/utils';
import { ScoreBar } from './ScoreBar';
import { COMP_LABEL_FULL, STATUS_TEXT_CLASS, STATUS_LABEL, STATUS_PILL_CLASS } from './grade-meta';

interface GradeDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject: string;
  components: StudentGradeComponents;
  kktp?: number;
  contentClassName?: string;
}

const pctLabel = (w: number): string => `${Math.round(w * 100)}%`;

export function GradeDetailModal({
  open,
  onOpenChange,
  subject,
  components,
  kktp = KKTP_DEFAULT,
  contentClassName,
}: GradeDetailModalProps) {
  const na = naOf(components);
  const status = na != null ? gradeStatus(na, kktp) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={contentClassName}>
        <DialogHeader>
          <DialogTitle>{subject}</DialogTitle>
          <DialogDescription>
            Rincian Nilai Akhir berbobot · KKTP {kktp}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {GRADE_COMPONENT_KEYS.map((k) => {
            const v = components[k];
            return (
              <div key={k} className="flex items-center gap-3">
                <div className="w-40 shrink-0">
                  <div className="text-sm font-semibold text-slate-700">{COMP_LABEL_FULL[k]}</div>
                  <div className="text-[11px] text-slate-400">Bobot {pctLabel(NA_WEIGHTS[k])}</div>
                </div>
                <ScoreBar value={v ?? 0} kktp={kktp} className="flex-1" />
                <span className="w-8 shrink-0 text-right text-sm font-bold tabular-nums text-slate-700">
                  {v ?? '—'}
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-1 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Nilai Akhir</div>
            <div className={`text-2xl font-extrabold tabular-nums ${status ? STATUS_TEXT_CLASS[status] : 'text-slate-400'}`}>
              {na ?? '—'}
            </div>
          </div>
          {status && (
            <span className={cn('rounded-lg px-3 py-1 text-xs font-bold', STATUS_PILL_CLASS[status])}>
              {STATUS_LABEL[status]}
            </span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
