'use client';
import React, { useRef } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

interface Props {
  day: number;
  status: string;
  date?: string;
  notes?: string | null;
  onClose: () => void;
}

export default function DayDetailModal({ day, status, date, notes, onClose }: Props) {
  const returnFocus = useRef(
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  const labels: Record<string, string> = {
    hadir: 'Hadir',
    izin: 'Izin',
    sakit: 'Sakit',
    alpha: 'Alpha',
  };
  const label =
    date && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? new Intl.DateTimeFormat('id-ID', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'Asia/Jakarta',
        }).format(new Date(`${date}T00:00:00+07:00`))
      : `Tanggal ${day}`;
  return (
    <Dialog
      open
      onOpenChange={(open: boolean) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="siswa-app max-w-[calc(100%-2rem)] bg-[var(--bg2)] text-[var(--text)] sm:max-w-md"
        onCloseAutoFocus={(event: Event) => {
          event.preventDefault();
          if (returnFocus.current?.isConnected) returnFocus.current.focus();
        }}
      >
        <DialogTitle>Detail kehadiran — {label}</DialogTitle>
        <DialogDescription className="text-[var(--muted)]">
          Catatan absensi harian kelas, bukan kehadiran per JP atau sesi.
        </DialogDescription>
        <dl className="space-y-3 text-sm leading-6">
          <div>
            <dt className="text-[var(--muted)]">Status</dt>
            <dd className="font-bold">{labels[status] ?? 'Belum ada catatan'}</dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">Keterangan sekolah</dt>
            <dd className="whitespace-pre-wrap break-words">
              {notes?.trim() || 'Tidak ada keterangan tambahan.'}
            </dd>
          </div>
        </dl>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-bold focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          Tutup
        </button>
      </DialogContent>
    </Dialog>
  );
}
