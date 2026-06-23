'use client';

import { X, List, FileText } from 'lucide-react';
import { KKTP_DEFAULT, NA_WEIGHTS, gradeStatus } from '@/lib/academic';
import type { OrtuNilai } from './ortu-types';
import { mpColor, gradeCls } from './ortu-data';

interface GradeDetailModalProps {
  nilai: OrtuNilai;
  onClose: () => void;
}

/** Average an array of scores, rounded to integer. */
function avgArr(arr: number[]): number {
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

export default function GradeDetailModal({ nilai, onClose }: GradeDetailModalProps) {
  const { mp, na, raw } = nilai;
  const color = mpColor(mp);
  const status = gradeStatus(na, KKTP_DEFAULT);
  const cls = gradeCls(na);

  const uhAvg = avgArr(raw.uh);
  const pkAvg = avgArr(raw.praktik);

  const rows = [
    { l: 'Ulangan Harian', v: uhAvg, w: NA_WEIGHTS.uh },
    { l: 'Praktik', v: pkAvg, w: NA_WEIGHTS.praktik },
    { l: 'Sikap', v: raw.sikap, w: NA_WEIGHTS.sikap },
    { l: 'UTS', v: raw.uts, w: NA_WEIGHTS.uts },
    { l: 'UAS', v: raw.uas, w: NA_WEIGHTS.uas },
  ];

  return (
    <div
      className="ortu-app fixed inset-0 z-50 flex items-end justify-center bg-[var(--ovl-bg)] backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={`Detail nilai ${mp}`}
    >
      <div className="max-h-[85vh] w-full max-w-[560px] overflow-auto rounded-t-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg2)] p-4 pb-8 animate-[slideUp_0.3s_cubic-bezier(0.22,0.61,0.36,1)]">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <b className="text-[15px] font-extrabold">{mp}</b>
          <button
            onClick={onClose}
            className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]"
            aria-label="Tutup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Big NA display */}
        <div className="mb-4 text-center">
          <div
            className="inline-block rounded-[var(--r)] px-7 py-4 text-white"
            style={{ background: color }}
          >
            <div className="text-4xl font-extrabold">{na}</div>
            <div className="mt-0.5 text-[11px] font-semibold opacity-85">
              {status === 'tuntas' ? 'Tuntas' : 'Perlu Remedial'} · KKTP {KKTP_DEFAULT}
            </div>
          </div>
        </div>

        {/* Breakdown */}
        <div className="mb-2.5 rounded-[var(--r)] border border-[var(--border)] bg-[var(--surface)] p-3.5">
          <div className="mb-2.5 flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-wide text-[var(--muted)]">
            <List className="h-[15px] w-[15px] text-[var(--pri)]" />
            Breakdown Nilai
          </div>
          {rows.map((r) => (
            <div
              key={r.l}
              className="flex items-center gap-2.5 border-b border-[var(--border)] py-2 last:border-0"
            >
              <div className="flex-1">
                <b className="text-[12px]">{r.l}</b>
                <small className="block text-[10px] text-[var(--muted)]">
                  Bobot {Math.round(r.w * 100)}%
                </small>
              </div>
              <div className="h-1.5 w-20 overflow-hidden rounded bg-[var(--bar-bg)]">
                <div
                  className="h-full rounded"
                  style={{ width: `${r.v}%`, background: color }}
                />
              </div>
              <span className="w-8 text-right text-[14px] font-extrabold">{r.v}</span>
            </div>
          ))}
          <div className="mt-1 flex items-center justify-between border-t-2 border-[var(--border2)] pt-2.5">
            <b className="text-[13px]">Nilai Akhir (NA)</b>
            <span
              className="text-xl font-extrabold"
              style={{ color: cls === 'ok' ? 'var(--em)' : 'var(--rose)' }}
            >
              {na}
            </span>
          </div>
        </div>

        {/* Individual UH scores */}
        <div className="rounded-[var(--r)] border border-[var(--border)] bg-[var(--surface)] p-3.5">
          <div className="mb-2.5 flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-wide text-[var(--muted)]">
            <FileText className="h-[15px] w-[15px] text-[var(--pri)]" />
            Detail Ulangan Harian
          </div>
          {raw.uh.map((v, i) => (
            <div
              key={i}
              className="flex justify-between border-b border-[var(--border)] py-1.5 last:border-0"
            >
              <span className="text-[12px] text-[var(--muted)]">UH {i + 1}</span>
              <span className="text-[12px] font-bold">{v}</span>
            </div>
          ))}
          <div className="mt-2 text-[11px] font-semibold text-[var(--muted)]">
            Praktik: {raw.praktik.join(', ')}
          </div>
        </div>
      </div>
    </div>
  );
}
