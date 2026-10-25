'use client';
import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { jakartaToday, type AttendancePeriod } from '@/lib/learner-attendance';
import {
  jpLabels,
  jpTone,
  jpDate,
  jpTime,
  validSessionDate,
  groupAttendanceSlots,
  type LearnerJp,
  type JpRead,
} from '@/lib/session-attendance';
import { fetchLearnerSessionAttendance } from '../session-attendance-actions';

const colors = ['#059669', '#0284c7', '#d97706', '#e11d48', '#94a3b8'];
const box = 'rounded-xl border border-[var(--border)] bg-[var(--bg2)] p-4';
const btn =
  'min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-[var(--pri)]';
type Props = {
  studentId?: string;
  period?: AttendancePeriod;
  shell: 'ortu' | 'siswa';
  compact?: boolean;
  initialDate?: string;
};

export default function LearnerSessionAttendance({
  studentId,
  period,
  shell,
  compact = false,
  initialDate,
}: Props) {
  const candidate = validSessionDate(initialDate) ? initialDate : jakartaToday();
  const initial = period
    ? [period.dateFrom, [candidate, period.dateTo].sort()[0]!].sort().at(-1)!
    : candidate;
  const [month, setMonth] = useState(initial.slice(0, 7)),
    [retry, setRetry] = useState(0),
    [modal, setModal] = useState<string | null>(validSessionDate(initialDate) ? initialDate : null);
  const [loaded, setLoaded] = useState<{ key: string; read: JpRead<LearnerJp> } | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const year = Number(month.slice(0, 4)),
    m = Number(month.slice(5, 7)),
    last = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const from = [month + '-01', period?.dateFrom ?? month + '-01'].sort().at(-1)!;
  const to = [month + '-' + last, period?.dateTo ?? month + '-' + last, jakartaToday()].sort()[0]!;
  const key = `${studentId ?? 'own'}|${period?.academicYear ?? ''}|${period?.semester ?? ''}|${from}|${to}|${retry}`;
  const read = loaded?.key === key ? loaded.read : null;
  useEffect(() => {
    let active = true;
    if (!period || from > to) {
      setLoaded({
        key,
        read: {
          state: 'error',
          message: !period
            ? 'Pilih periode sekolah untuk melihat kehadiran per JP.'
            : 'Belum ada tanggal pembelajaran pada bulan/periode ini.',
        },
      });
      return () => {
        active = false;
      };
    }
    fetchLearnerSessionAttendance({
      from,
      to,
      ...(studentId ? { studentId } : {}),
      ...(period.academicYear && period.semester
        ? { academicYear: period.academicYear, semester: period.semester }
        : {}),
    })
      .then((result) => {
        if (active) setLoaded({ key, read: result });
      })
      .catch(() => {
        if (active)
          setLoaded({
            key,
            read: { state: 'error', message: 'Kehadiran sesi belum dapat dimuat. Coba lagi.' },
          });
      });
    return () => {
      active = false;
    };
  }, [key, from, to, period, studentId]);
  const data = read?.state === 'ready' ? read.data : null;
  const totals = data?.totals;
  function open(value: string, event: React.MouseEvent<HTMLButtonElement>) {
    opener.current = event.currentTarget;
    setModal(value);
  }
  function move(delta: number) {
    const next = new Date(Date.UTC(year, m - 1 + delta, 1));
    setMonth(next.toISOString().slice(0, 7));
    setModal(null);
  }
  const selected = data?.days.find((day) => day.date === modal);
  const sessions = data?.sessions.filter((session) => session.date === modal) ?? [];
  const segments = totals
    ? [totals.hadir, totals.izin, totals.sakit, totals.alpha, totals.unknown]
    : [];
  let offset = 0;
  return (
    <section className={`${box} ${shell}-app space-y-4`} aria-label="Kehadiran siswa per JP">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Kehadiran per JP</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Pilih tanggal atau diagram untuk melihat rincian.
          </p>
        </div>
        <button
          type="button"
          className={btn}
          onClick={() => setRetry((x) => x + 1)}
          aria-label="Muat ulang kehadiran JP"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className={btn}
          aria-label="Bulan JP sebelumnya"
          onClick={() => move(-1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-bold">
          {new Intl.DateTimeFormat('id-ID', {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          }).format(new Date(month + '-01T00:00:00Z'))}
        </span>
        <button
          type="button"
          className={btn}
          aria-label="Bulan JP berikutnya"
          onClick={() => move(1)}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      {!read ? (
        <p role="status" className="text-sm">
          Memuat kehadiran per JP...
        </p>
      ) : read.state !== 'ready' ? (
        <p role="alert" className="text-sm text-[var(--muted)]">
          {read.message}
        </p>
      ) : (
        totals && (
          <>
            <div className="flex flex-wrap items-center gap-5">
              <button
                type="button"
                className="relative min-h-28 min-w-28 rounded-full focus-visible:ring-2 focus-visible:ring-[var(--pri)]"
                aria-label="Lihat ringkasan kehadiran JP"
                onClick={(event) => open('summary', event)}
              >
                <svg
                  width="112"
                  height="112"
                  viewBox="0 0 112 112"
                  aria-hidden="true"
                  className="-rotate-90"
                >
                  <circle
                    cx="56"
                    cy="56"
                    r="43"
                    fill="none"
                    stroke="var(--border)"
                    strokeWidth="10"
                  />
                  {segments.map((count, index) => {
                    const length = totals.expected ? (count / totals.expected) * 270.177 : 0;
                    const start = offset;
                    offset += length;
                    return (
                      <circle
                        key={index}
                        cx="56"
                        cy="56"
                        r="43"
                        fill="none"
                        stroke={colors[index]}
                        strokeWidth="10"
                        strokeDasharray={`${length} ${270.177 - length}`}
                        strokeDashoffset={-start}
                      />
                    );
                  })}
                </svg>
                <span className="absolute inset-0 grid place-content-center text-center">
                  <b className="text-xl">{totals.pct === null ? '—' : `${totals.pct}%`}</b>
                  <span className="text-xs text-[var(--muted)]">
                    {totals.complete ? 'Hadir' : 'Belum lengkap'}
                  </span>
                </span>
              </button>
              <div className="min-w-0 flex-1 space-y-1 text-sm">
                <b>
                  {totals.hadir} dari {totals.expected} JP hadir
                </b>
                {(['hadir', 'izin', 'sakit', 'alpha'] as const).map((status, index) => (
                  <p key={status} className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 rounded-full"
                      style={{ background: colors[index] }}
                    />
                    {jpLabels[status]} <b>{totals[status]} JP</b>
                  </p>
                ))}
                {totals.unknown > 0 && (
                  <p>
                    Belum dicatat <b>{totals.unknown} JP</b>
                  </p>
                )}
              </div>
            </div>
            {!totals.expected && (
              <p className="text-sm text-[var(--muted)]">
                Belum ada catatan kehadiran sesi pada periode ini.
              </p>
            )}
            {!compact && (
              <>
                <div className="grid grid-cols-7 gap-1 text-center text-sm">
                  {['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].map((label) => (
                    <span key={label} className="py-1 text-xs text-[var(--muted)]">
                      {label}
                    </span>
                  ))}
                  {Array.from(
                    { length: new Date(month + '-01T00:00:00Z').getUTCDay() },
                    (_, index) => (
                      <span key={'pad' + index} />
                    ),
                  )}
                  {Array.from({ length: last }, (_, index) => {
                    const date = month + '-' + String(index + 1).padStart(2, '0'),
                      day = data?.days.find((x) => x.date === date);
                    return (
                      <button
                        type="button"
                        key={date}
                        disabled={date < from || date > to}
                        className={`min-h-12 rounded-lg px-1 py-2 text-xs focus-visible:ring-2 focus-visible:ring-[var(--pri)] ${jpTone[day?.tone ?? 'unknown']}`}
                        aria-label={`${jpDate(date)}: ${day?.complete ? day.pct + '% hadir' : day ? day.recorded + '/' + day.expected + ' JP tercatat, belum lengkap' : 'Belum ada catatan JP'}`}
                        onClick={(event) => open(date, event)}
                      >
                        <b className="block text-sm">{index + 1}</b>
                        <span>
                          {day?.complete
                            ? `${day.pct}%`
                            : day
                              ? `${day.recorded}/${day.expected}`
                              : '—'}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs leading-5 text-[var(--muted)]">
                  Hijau 100% · Biru &gt;50–&lt;100% · Kuning &gt;0–50% · Merah 0% · Abu-abu belum
                  lengkap
                </p>
              </>
            )}
          </>
        )
      )}
      {modal && data && (
        <Dialog
          open
          onOpenChange={(open: boolean) => {
            if (!open) setModal(null);
          }}
        >
          <DialogContent
            className={`${shell}-app max-h-[85dvh] max-w-[calc(100%-2rem)] overflow-y-auto border-[var(--border)] bg-[var(--bg2)] text-[var(--text)] sm:max-w-3xl`}
            onCloseAutoFocus={(event: Event) => {
              event.preventDefault();
              if (opener.current?.isConnected) opener.current.focus();
            }}
          >
            <DialogTitle className="pr-10 leading-6">
              {modal === 'summary' ? 'Ringkasan kehadiran' : `Kehadiran — ${jpDate(modal)}`}
            </DialogTitle>
            <DialogDescription className="text-[var(--muted)]">
              {modal === 'summary'
                ? `${jpDate(data.from)} – ${jpDate(data.to)}`
                : 'Rincian sesi dan catatan guru.'}
            </DialogDescription>
            {modal === 'summary' ? (
              <>
                <p className="text-sm font-semibold">
                  {totals!.expected
                    ? `${totals!.hadir} dari ${totals!.expected} JP hadir`
                    : 'Belum ada catatan kehadiran.'}
                  {totals!.unknown > 0 ? ` · ${totals!.unknown} JP belum dicatat` : ''}
                </p>
                <div className="space-y-3 sm:hidden">
                  {data.days.map((day) => (
                    <article
                      key={day.date}
                      className="rounded-lg border border-[var(--border)] p-3"
                    >
                      <button
                        type="button"
                        className="min-h-11 w-full text-left text-sm font-bold underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-[var(--pri)]"
                        onClick={() => setModal(day.date)}
                      >
                        {jpDate(day.date)}
                      </button>
                      <p
                        className={`mb-3 rounded-lg px-2 py-1 text-sm font-semibold ${jpTone[day.tone]}`}
                      >
                        {day.pct === null ? 'Belum lengkap' : `${day.pct}% hadir`}
                      </p>
                      <dl className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                        {(['hadir', 'izin', 'sakit', 'alpha', 'unknown'] as const)
                          .filter((status) => day[status] > 0)
                          .map((status) => (
                            <div key={status}>
                              <dt className="text-xs text-[var(--muted)]">
                                {status === 'unknown' ? 'Belum dicatat' : jpLabels[status]}
                              </dt>
                              <dd className="mt-1 font-bold">{day[status]} JP</dd>
                            </div>
                          ))}
                      </dl>
                    </article>
                  ))}
                </div>
                <div className="hidden overflow-x-auto sm:block">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr>
                        {[
                          'Tanggal',
                          'Hadir',
                          'Izin',
                          'Sakit',
                          'Alpha',
                          'Belum dicatat',
                          'Kehadiran',
                        ].map((label) => (
                          <th
                            key={label}
                            className="whitespace-nowrap border-b border-[var(--border)] p-2"
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.days.map((day) => (
                        <tr key={day.date}>
                          <td className="p-2">
                            <button
                              type="button"
                              className="min-h-11 text-left font-semibold underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-[var(--pri)]"
                              onClick={() => setModal(day.date)}
                            >
                              {jpDate(day.date)}
                            </button>
                          </td>
                          {[
                            day.hadir,
                            day.izin,
                            day.sakit,
                            day.alpha,
                            day.unknown,
                            day.pct === null ? 'Belum lengkap' : `${day.pct}%`,
                          ].map((value, index) => (
                            <td key={index} className="p-2 tabular-nums">
                              {value === 0 ? '—' : value}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={`${btn} justify-self-start`}
                  onClick={() => setModal('summary')}
                >
                  Ringkasan bulan ini
                </button>
                <p
                  className={`rounded-lg px-3 py-2 text-sm ${jpTone[selected?.tone ?? 'unknown']}`}
                >
                  {selected
                    ? `${selected.hadir} dari ${selected.expected} JP hadir · ${selected.complete ? selected.pct + '%' : selected.unknown + ' JP belum dicatat'}`
                    : 'Belum ada catatan sesi pada tanggal ini.'}
                </p>
                {selected && (
                  <p className="text-sm leading-6 text-[var(--muted)]">
                    {(['izin', 'sakit', 'alpha'] as const)
                      .filter((status) => selected[status] > 0)
                      .map((status) => `${jpLabels[status]} ${selected[status]} JP`)
                      .join(' · ')}
                    {sessions.reduce((count, s) => count + s.slots.length, 0) > selected.expected
                      ? ' Ada sesi bertumpang tindih; catatan perlu diperiksa guru.'
                      : ''}
                  </p>
                )}
                {sessions.map((session) => (
                  <article
                    key={session.id}
                    className="rounded-lg border border-[var(--border)] p-3"
                  >
                    <h3 className="font-bold">
                      {session.subject}
                      {session.subjectCode ? ` — ${session.subjectCode}` : ''}
                    </h3>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {session.teacher} · {session.className}
                    </p>
                    <ul className="mt-2 divide-y divide-[var(--border)]">
                      {groupAttendanceSlots(session.slots).map((slot) => (
                        <li key={slot.fromJp} className="py-2 text-sm">
                          <div className="flex flex-wrap justify-between gap-2">
                            <b>
                              JP {slot.fromJp}
                              {slot.toJp !== slot.fromJp ? `–${slot.toJp}` : ''} ·{' '}
                              {jpTime(slot.startAt)}–{jpTime(slot.endAt)}
                            </b>
                            <span>{slot.status ? jpLabels[slot.status] : 'Belum dicatat'}</span>
                          </div>
                          {slot.notes && (
                            <p className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">
                              {slot.notes}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </>
            )}
            <button type="button" className={btn} onClick={() => setModal(null)}>
              Tutup rincian
            </button>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
