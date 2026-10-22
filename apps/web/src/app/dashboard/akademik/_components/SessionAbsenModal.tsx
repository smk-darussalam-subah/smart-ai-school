'use client';
import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { fetchSessionAttendanceRoster, saveSessionAttendance } from '../session-attendance-actions';
import {
  jpLabels,
  jpDate,
  jpTime,
  type SessionRoster,
  type JpRead,
} from '@/lib/session-attendance';
type Status = keyof typeof jpLabels;
type Cell = { status: Status | ''; notes: string; revision: number };
export type SessionAttendanceInput = {
  classId: string;
  className: string;
  classSessionId?: string;
  scheduleId?: string;
  serviceDate?: string;
};
const btn =
  'min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100';
export default function SessionAbsenModal({
  input,
  onClose,
}: {
  input: SessionAttendanceInput;
  onClose: () => void;
}) {
  const [loaded, setLoaded] = useState<JpRead<SessionRoster> | null>(null),
    [cells, setCells] = useState<Record<string, Cell>>({}),
    [retry, setRetry] = useState(0),
    [saving, setSaving] = useState(false),
    [saved, setSaved] = useState(false),
    [error, setError] = useState('');
  const busy = useRef(false),
    opener = useRef(
      typeof document !== 'undefined' ? (document.activeElement as HTMLElement) : null,
    );
  useEffect(() => {
    let active = true;
    setLoaded(null);
    fetchSessionAttendanceRoster({
      sessionId: input.classSessionId,
      scheduleId: input.scheduleId,
      date: input.serviceDate,
    })
      .then((read) => {
        if (!active) return;
        setLoaded(read);
        if (read.state === 'ready')
          setCells(
            Object.fromEntries(
              read.data.students.flatMap((student) =>
                read.data.slots.map((slot) => {
                  const record = read.data.records.find(
                    (r) => r.studentId === student.id && r.jp === slot.jp,
                  );
                  return [
                    student.id + ':' + slot.jp,
                    {
                      status: record?.status ?? '',
                      notes: record?.notes ?? '',
                      revision: record?.revision ?? 0,
                    },
                  ];
                }),
              ),
            ),
          );
      })
      .catch(() => {
        if (active)
          setLoaded({ state: 'error', message: 'Daftar absensi belum dapat dimuat. Coba lagi.' });
      });
    return () => {
      active = false;
    };
  }, [input.classSessionId, input.scheduleId, input.serviceDate, retry]);
  const data = loaded?.state === 'ready' ? loaded.data : null;
  const complete = Boolean(
    data?.students.length &&
    data.slots.length &&
    data.students.every((s) => data.slots.every((slot) => cells[s.id + ':' + slot.jp]?.status)),
  );
  function block(studentId: string, status: Status) {
    if (!data) return;
    setCells((previous) => ({
      ...previous,
      ...Object.fromEntries(
        data.slots.map((slot) => {
          const key = studentId + ':' + slot.jp;
          return [key, { ...previous[key]!, status }];
        }),
      ),
    }));
    setSaved(false);
  }
  async function save() {
    if (!data || !complete || busy.current || saved) return;
    busy.current = true;
    setSaving(true);
    setError('');
    try {
      const result = await saveSessionAttendance(
        data.sessionId,
        data.students.flatMap((student) =>
          data.slots.map((slot) => {
            const cell = cells[student.id + ':' + slot.jp]!;
            return {
              studentId: student.id,
              jp: slot.jp,
              status: cell.status as Status,
              notes: cell.notes.trim() || null,
              revision: cell.revision,
            };
          }),
        ),
      );
      if (result.success) setSaved(true);
      else setError(result.error ?? 'Absensi belum tersimpan.');
    } catch {
      setError('Absensi belum tersimpan. Periksa koneksi.');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open: boolean) => {
        if (!open && !busy.current) onClose();
      }}
    >
      <DialogContent
        closeDisabled={saving}
        onEscapeKeyDown={(event: Event) => {
          if (busy.current) event.preventDefault();
        }}
        onInteractOutside={(event: Event) => {
          if (busy.current) event.preventDefault();
        }}
        onCloseAutoFocus={(event: Event) => {
          event.preventDefault();
          if (opener.current?.isConnected) opener.current.focus();
        }}
        className="max-h-[90dvh] max-w-[calc(100%-2rem)] overflow-y-auto bg-white text-slate-950 dark:bg-slate-900 dark:text-slate-100 sm:max-w-3xl"
      >
        <DialogTitle className="pr-10 leading-6">Absensi sesi — {input.className}</DialogTitle>
        <DialogDescription className="text-slate-600 dark:text-slate-300">
          {data
            ? `${jpDate(data.date)} · ${data.subject} · JP ${data.slots.map((s) => s.jp).join(', ')}`
            : 'Daftar siswa dan JP berasal dari sesi yang sudah dimulai.'}
        </DialogDescription>
        {!loaded ? (
          <p role="status">Memuat absensi sesi...</p>
        ) : loaded.state !== 'ready' ? (
          <div role="alert">
            <p>{loaded.message}</p>
            <button type="button" className={btn} onClick={() => setRetry((x) => x + 1)}>
              Coba muat ulang
            </button>
          </div>
        ) : (
          data && (
            <>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Pilih status satu blok untuk tiap siswa. Buka “Ubah per JP” bila siswa hanya hadir
                sebagian blok. Tidak ada status yang diisi otomatis.
              </p>
              <button
                type="button"
                className={btn}
                disabled={saving || saved || !data.students.length}
                onClick={() => {
                  for (const student of data.students) block(student.id, 'hadir');
                }}
              >
                Semua hadir
              </button>
              {!data.students.length && <p>Belum ada siswa aktif yang sesuai dengan sesi ini.</p>}
              <div className="space-y-3">
                {data.students.map((student) => {
                  const values = data.slots.map(
                    (slot) => cells[student.id + ':' + slot.jp]?.status ?? '',
                  );
                  const same = values.every((x) => x === values[0]);
                  return (
                    <article
                      key={student.id}
                      className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="break-words text-sm font-bold">{student.name}</h3>
                          <p className="text-xs text-slate-600 dark:text-slate-300">
                            {student.nis}
                          </p>
                        </div>
                        <label className="text-sm">
                          Status blok
                          <select
                            aria-label={`Status blok ${student.name}`}
                            disabled={saving || saved}
                            value={same ? values[0] : 'mixed'}
                            onChange={(event) => block(student.id, event.target.value as Status)}
                            className={`${btn} ml-2`}
                          >
                            <option value="" disabled>
                              Pilih status
                            </option>
                            <option value="mixed" disabled>
                              Berbeda per JP
                            </option>
                            {Object.entries(jpLabels).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <details className="mt-2">
                        <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">
                          Ubah per JP / keterangan
                        </summary>
                        <div className="space-y-3">
                          {data.slots.map((slot) => {
                            const key = student.id + ':' + slot.jp,
                              cell = cells[key];
                            return (
                              <div
                                key={slot.jp}
                                className="grid gap-2 border-t border-slate-200 pt-3 dark:border-slate-700 sm:grid-cols-[1fr_1fr]"
                              >
                                <label className="text-sm">
                                  JP {slot.jp} · {jpTime(slot.startAt)}–{jpTime(slot.endAt)}
                                  <select
                                    aria-label={`${student.name} JP ${slot.jp}`}
                                    className={`${btn} mt-1 block w-full`}
                                    value={cell?.status ?? ''}
                                    disabled={saving || saved}
                                    onChange={(event) => {
                                      setCells((previous) => ({
                                        ...previous,
                                        [key]: {
                                          ...previous[key]!,
                                          status: event.target.value as Status,
                                        },
                                      }));
                                    }}
                                  >
                                    <option value="" disabled>
                                      Pilih status
                                    </option>
                                    {Object.entries(jpLabels).map(([value, label]) => (
                                      <option key={value} value={value}>
                                        {label}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="text-sm">
                                  Keterangan (opsional)
                                  <textarea
                                    aria-label={`Keterangan ${student.name} JP ${slot.jp}`}
                                    maxLength={1000}
                                    disabled={saving || saved}
                                    value={cell?.notes ?? ''}
                                    onChange={(event) =>
                                      setCells((previous) => ({
                                        ...previous,
                                        [key]: { ...previous[key]!, notes: event.target.value },
                                      }))
                                    }
                                    className="mt-1 min-h-20 w-full rounded-lg border border-slate-300 bg-transparent p-2 dark:border-slate-600"
                                  />
                                </label>
                              </div>
                            );
                          })}
                        </div>
                      </details>
                    </article>
                  );
                })}
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Setelah disimpan, ketidakhadiran dikirim ke pesan masuk orang tua sesuai status.
                Catatan harian lama tidak ditimpa.
              </p>
            </>
          )
        )}
        {error && (
          <p role="alert" className="text-sm text-rose-700 dark:text-rose-200">
            {error}
          </p>
        )}
        {saved && (
          <p role="status" className="text-sm font-bold text-emerald-700 dark:text-emerald-200">
            Absensi sesi tersimpan.
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={btn} disabled={saving} onClick={onClose}>
            Tutup
          </button>
          <button
            type="button"
            className="min-h-11 rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-emerald-500"
            disabled={!complete || saving || saved}
            onClick={save}
          >
            {saving ? 'Menyimpan...' : saved ? 'Tersimpan' : 'Simpan absensi sesi'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
