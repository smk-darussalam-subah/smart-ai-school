'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCheck, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { createAttendance } from '../actions';
import { useClassRoster } from './use-class-roster';
import { wibTodayISO, wibDateLabel } from '@/lib/bell-times';
import SessionAbsenModal,{type SessionAttendanceInput} from './SessionAbsenModal';

type Status = 'hadir' | 'izin' | 'sakit' | 'alpha';
const STAT: Status[] = ['hadir', 'izin', 'sakit', 'alpha'];
const SHORT: Record<Status, string> = { hadir: 'H', izin: 'I', sakit: 'S', alpha: 'A' };
const ON: Record<Status, string> = {
  hadir: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  izin: 'bg-sky-50 border-sky-200 text-sky-700',
  sakit: 'bg-amber-50 border-amber-200 text-amber-700',
  alpha: 'bg-rose-50 border-rose-200 text-rose-600',
};

export function DailyAbsenModal({
  classId,
  className,
  onClose,
}: {
  classId: string;
  className: string;
  onClose: () => void;
}) {
  const { roster, status: rosterStatus, error: rosterError, retry } = useClassRoster(classId);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const loading = rosterStatus === 'loading';
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const inFlight = useRef(false);
  const opener = useRef<HTMLElement | null>(
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );

  useEffect(() => {
    if (rosterStatus === 'ready')
      setStatuses((previous) =>
        Object.fromEntries(roster.map((student) => [student.id, previous[student.id] ?? 'hadir'])),
      );
  }, [roster, rosterStatus]);

  const counts = STAT.reduce(
    (acc, s) => ({ ...acc, [s]: Object.values(statuses).filter((x) => x === s).length }),
    {} as Record<Status, number>,
  );
  const setAll = () =>
    setStatuses(Object.fromEntries(roster.map((s) => [s.id, 'hadir' as Status])));

  const save = async () => {
    if (rosterStatus !== 'ready' || roster.length === 0 || inFlight.current || done) return;
    inFlight.current = true;
    setSaving(true);
    setError('');
    try {
      const r = await createAttendance({
        classId,
        date: wibTodayISO(),
        records: roster.map((s) => ({ studentId: s.id, status: statuses[s.id] ?? 'hadir' })),
      });
      if (r?.success) setDone(true);
      else setError(r?.error || 'Absensi belum tersimpan. Silakan coba lagi.');
    } catch {
      setError('Absensi belum tersimpan. Periksa koneksi lalu coba lagi.');
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o: boolean) => {
        if (!o && !inFlight.current) onClose();
      }}
    >
      <DialogContent
        closeDisabled={saving}
        onCloseAutoFocus={(event: Event) => {
          if (opener.current?.isConnected && opener.current !== document.body) {
            event.preventDefault();
            opener.current.focus();
          }
        }}
        onEscapeKeyDown={(event: Event) => {
          if (inFlight.current) event.preventDefault();
        }}
        onInteractOutside={(event: Event) => {
          if (inFlight.current) event.preventDefault();
        }}
        className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto bg-white text-slate-950 dark:bg-slate-900 dark:text-slate-100 sm:max-w-lg"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>Absensi — {className}</DialogTitle>
          <DialogDescription className="text-slate-600 dark:text-slate-300">
            {wibDateLabel()} · default semua hadir, ubah pengecualian saja.
          </DialogDescription>
        </DialogHeader>

        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-[11.5px] font-bold text-emerald-700">
            Hadir {counts.hadir} · Izin {counts.izin} · Sakit {counts.sakit} · Alpha {counts.alpha}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            onClick={setAll}
            disabled={rosterStatus !== 'ready' || saving || done}
          >
            <CheckCheck className="mr-1 h-4 w-4 text-emerald-600" />
            Semua hadir
          </Button>
        </div>

        <div className="max-h-[48vh] overflow-y-auto rounded-xl border border-[#e6efea]">
          {loading ? (
            <div className="grid h-28 place-items-center text-[#9bb0a8]">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : rosterStatus === 'error' ? (
            <div role="alert" className="space-y-2 p-4 text-sm text-red-800 dark:text-red-200">
              <p>{rosterError}</p>
              <Button
                type="button"
                variant="outline"
                onClick={retry}
                className="min-h-11 bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100"
              >
                Coba muat daftar siswa
              </Button>
            </div>
          ) : roster.length === 0 ? (
            <div className="grid h-28 place-items-center text-[12.5px] text-[#9bb0a8]">
              Belum ada siswa aktif di kelas ini.
            </div>
          ) : (
            roster.map((s) => (
              <div
                key={s.id}
                className="flex flex-col gap-2 border-b border-[#f0f4f2] px-3 py-2 last:border-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 break-words text-[12.5px]">
                  <b className="text-slate-950 dark:text-slate-100">{s.name}</b>{' '}
                  <span className="text-slate-600 dark:text-slate-300">· {s.nis}</span>
                </div>
                <div className="flex gap-1">
                  {STAT.map((st) => {
                    const on = (statuses[s.id] ?? 'hadir') === st;
                    return (
                      <button
                        key={st}
                        type="button"
                        disabled={saving || done}
                        aria-label={`${s.name}: ${st}`}
                        aria-pressed={on}
                        onClick={() => setStatuses((p) => ({ ...p, [s.id]: st }))}
                        className={clsx(
                          'grid min-h-11 min-w-11 place-items-center rounded-lg border text-[12px] font-extrabold',
                          on
                            ? ON[st]
                            : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200',
                        )}
                      >
                        {SHORT[st]}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {error && (
          <p role="alert" className="text-[12.5px] text-rose-700 dark:text-rose-300">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={saving}
            className="min-h-11 bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            {done ? 'Tutup' : 'Batal'}
          </Button>
          <Button
            type="button"
            onClick={save}
            disabled={saving || done || rosterStatus !== 'ready' || roster.length === 0}
            className="min-h-11 bg-emerald-700 text-white hover:bg-emerald-800"
          >
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            {done ? 'Tersimpan ✓' : 'Simpan Absensi'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AbsenModal(props:SessionAttendanceInput&{onClose:()=>void}){return props.classSessionId||props.scheduleId?<SessionAbsenModal key={`${props.classSessionId??props.scheduleId}:${props.serviceDate}`} input={{...props,serviceDate:props.serviceDate??wibTodayISO()}} onClose={props.onClose}/>:<DailyAbsenModal {...props}/>;}
