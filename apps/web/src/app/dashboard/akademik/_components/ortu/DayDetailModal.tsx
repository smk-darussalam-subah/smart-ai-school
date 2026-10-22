'use client';

import React, { useRef } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useBellPattern } from '@/components/providers/BellPatternProvider';
import { fmtMin } from '@/lib/bell-times';
import type { AttendanceCellStatus } from '@/lib/academic';
import { ATT_STATUS_LABELS } from './ortu-data';

interface DayDetailModalProps {
  day: number;
  status: AttendanceCellStatus;
  month: string;
  year: number;
  date?: string;
  notes?: string | null;
  onClose: () => void;
}

/** Status colors supplement the written label; they never imply attendance per JP. */
function statusColor(status: AttendanceCellStatus): string {
  switch (status) {
    case 'hadir':
      return 'var(--em)';
    case 'izin':
      return 'var(--sky)';
    case 'sakit':
      return 'var(--amber)';
    case 'alpha':
      return 'var(--rose)';
    default:
      return 'var(--muted)';
  }
}

export default function DayDetailModal({
  day,
  status,
  month,
  year,
  date,
  notes,
  onClose,
}: DayDetailModalProps) {
  const returnFocus = useRef(
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  // Keep legacy callers compatible, but prefer the calendar's exact ISO date.
  const monthIndex = [
    'jan',
    'feb',
    'mar',
    'apr',
    'mei',
    'jun',
    'jul',
    'agu',
    'sep',
    'okt',
    'nov',
    'des',
  ].findIndex((prefix) => month.toLowerCase().startsWith(prefix));
  const selectedDate =
    date ?? `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const parsedDate = new Date(`${selectedDate}T00:00:00Z`);
  const validDate =
    /^\d{4}-\d{2}-\d{2}$/.test(selectedDate) &&
    Number.isFinite(parsedDate.getTime()) &&
    parsedDate.toISOString().slice(0, 10) === selectedDate;
  const label = validDate
    ? new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Asia/Jakarta',
      }).format(parsedDate)
    : null;
  const { slots, available } = useBellPattern(
    validDate ? selectedDate : '',
    validDate ? parsedDate.getUTCDay() || 7 : 1,
  );
  const recorded = ['hadir', 'izin', 'sakit', 'alpha'].includes(status);

  return (
    <Dialog
      open
      onOpenChange={(open: boolean) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="ortu-app max-h-[85dvh] max-w-[calc(100%-2rem)] overflow-y-auto border-[var(--border)] bg-[var(--bg2)] text-[var(--text)] sm:max-w-[560px]"
        onCloseAutoFocus={(event: Event) => {
          event.preventDefault();
          if (returnFocus.current?.isConnected) returnFocus.current.focus();
        }}
      >
        <DialogTitle className="pr-10 text-base font-extrabold leading-6">
          Detail kehadiran{label ? ` — ${label}` : ''}
        </DialogTitle>
        <DialogDescription className="text-[var(--muted)]">
          Catatan harian kelas, terpisah dari rincian sesi pada bagian Kehadiran per JP.
        </DialogDescription>
        <dl className="space-y-3 text-sm leading-6">
          <div>
            <dt className="text-[var(--muted)]">Status</dt>
            <dd className="flex items-center gap-2 font-bold text-[var(--text)]">
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: statusColor(status) }}
              />
              {validDate
                ? (ATT_STATUS_LABELS[status] ?? 'Belum ada catatan')
                : 'Tanggal belum tersedia'}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">Keterangan sekolah</dt>
            <dd className="whitespace-pre-wrap [overflow-wrap:anywhere]">
              {validDate && recorded
                ? notes?.trim() || 'Tidak ada keterangan tambahan.'
                : 'Belum ada catatan kehadiran untuk tanggal ini.'}
            </dd>
          </div>
        </dl>
        {validDate && (
          <details className="rounded-lg border border-[var(--border)] px-3">
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-[var(--pri)]">
              Pola Jam Pelajaran
            </summary>
            <p className="pb-3 text-sm leading-6 text-[var(--muted)]">
              Jam berikut hanya menunjukkan pola bel sekolah, bukan bukti kehadiran siswa per JP.
            </p>
            {available && slots.length > 0 ? (
              slots.map((slot) => (
                <div
                  key={slot.jp}
                  className="flex items-center justify-between gap-3 border-t border-[var(--border)] py-2 text-sm"
                >
                  <span className="font-semibold">JP {slot.jp}</span>
                  <span className="tabular-nums text-[var(--muted)]">
                    {fmtMin(slot.startMin)}–{fmtMin(slot.endMin)}
                  </span>
                  <span className="text-xs text-[var(--muted)]">Pola bel</span>
                </div>
              ))
            ) : (
              <p className="pb-3 text-sm text-[var(--muted)]">
                Pola bel belum tersedia untuk tanggal ini.
              </p>
            )}
          </details>
        )}
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-bold transition-colors hover:bg-[var(--bg)] focus-visible:ring-2 focus-visible:ring-[var(--pri)]"
        >
          Tutup
        </button>
      </DialogContent>
    </Dialog>
  );
}
