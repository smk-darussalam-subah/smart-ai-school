'use client';

import { X } from 'lucide-react';
import { JP_SLOTS, fmtMin } from '@/lib/bell-times';
import type { AttendanceCellStatus } from '@/lib/academic';
import { ATT_STATUS_LABELS } from './ortu-data';

interface DayDetailModalProps {
  day: number;
  status: AttendanceCellStatus;
  month: string;
  year: number;
  onClose: () => void;
}

/** Status → color CSS variable. */
function statusColor(status: AttendanceCellStatus): string {
  switch (status) {
    case 'hadir': return 'var(--em)';
    case 'izin': return 'var(--sky)';
    case 'sakit': return 'var(--amber)';
    case 'alpha': return 'var(--rose)';
    default: return 'var(--muted)';
  }
}

export default function DayDetailModal({ day, status, month, year, onClose }: DayDetailModalProps) {
  const isEmpty = status === 'empty' || status === 'future';
  const color = statusColor(status);
  const label = ATT_STATUS_LABELS[status] ?? status;

  return (
    <div
      className="ortu-app fixed inset-0 z-50 flex items-end justify-center bg-[var(--ovl-bg)] backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={`Detail kehadiran ${day} ${month} ${year}`}
    >
      <div className="max-h-[85vh] w-full max-w-[560px] overflow-auto rounded-t-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg2)] p-4 pb-8 animate-[slideUp_0.3s_cubic-bezier(0.22,0.61,0.36,1)]">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <b className="text-[15px] font-extrabold">{day} {month} {year}</b>
          <button
            onClick={onClose}
            className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]"
            aria-label="Tutup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {isEmpty ? (
          <div className="py-6 text-center text-[12px] font-semibold text-[var(--dim)]">
            {status === 'future' ? 'Tanggal future — belum ada data' : 'Libur (Minggu)'}
          </div>
        ) : (
          <>
            {/* Status label */}
            <div className="mb-2.5 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-2.5">
              <b className="text-[13px]" style={{ color }}>{label}</b>
            </div>

            {/* Per-session breakdown */}
            <b className="mb-2 block text-[12px] font-bold uppercase tracking-wide text-[var(--muted)]">
              Detail per Sesi
            </b>
            {JP_SLOTS.map((slot) => (
              <div
                key={slot.jp}
                className="flex items-center gap-2.5 border-b border-[var(--border)] py-2 last:border-0"
              >
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ background: color }}
                />
                <div className="flex-1">
                  <b className="text-[12px]">JP {slot.jp}</b>
                  <small className="block text-[10px] text-[var(--muted)]">
                    {fmtMin(slot.startMin)}–{fmtMin(slot.endMin)}
                  </small>
                </div>
                <span
                  className="text-[10px] font-bold capitalize"
                  style={{ color }}
                >
                  {status}
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
