'use client';
import React, { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
/** Legacy data stays explicitly daily; never manufacture a per-JP denominator. */
export default function DailyAttendanceCalculation({
  children,
  shell,
  stats,
  available = true,
  label,
}: {
  children: React.ReactNode;
  shell: 'siswa' | 'ortu';
  stats: { hadir: number; izin: number; sakit: number; alpha: number };
  available?: boolean;
  label: string;
}) {
  const [open, setOpen] = useState(false),
    trigger = useRef<HTMLButtonElement>(null),
    total = stats.hadir + stats.izin + stats.sakit + stats.alpha;
  return (
    <>
      <button
        type="button"
        ref={trigger}
        className="relative shrink-0 rounded-full focus-visible:ring-2 focus-visible:ring-[var(--pri)]"
        aria-label="Lihat ringkasan catatan harian"
        onClick={() => setOpen(true)}
      >
        {children}
      </button>
      <Dialog open={open} onOpenChange={(value: boolean) => setOpen(value)}>
        <DialogContent
          className={`${shell}-app max-h-[85dvh] max-w-[calc(100%-2rem)] overflow-y-auto bg-[var(--bg2)] text-[var(--text)] sm:max-w-lg`}
          onCloseAutoFocus={(event: Event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <DialogTitle className="pr-10 leading-6">Ringkasan catatan harian</DialogTitle>
          <DialogDescription className="text-[var(--muted)]">
            {label} · Catatan harian, bukan per JP.
          </DialogDescription>
          {!available ? (
            <p role="alert">Data harian belum tersedia. Coba muat ulang.</p>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                {(['hadir', 'izin', 'sakit', 'alpha'] as const).map((key) => (
                  <React.Fragment key={key}>
                    <dt className="capitalize">{key}</dt>
                    <dd>{stats[key]} hari</dd>
                  </React.Fragment>
                ))}
              </dl>
              <p className="rounded-lg bg-[var(--surface)] p-3 text-sm leading-6">
                {total
                  ? `${stats.hadir} dari ${total} hari hadir (${Math.round((stats.hadir / total) * 1000) / 10}%).`
                  : 'Belum ada catatan harian.'}
              </p>
            </>
          )}
          <button
            type="button"
            className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-bold"
            onClick={() => setOpen(false)}
          >
            Tutup rincian
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}
