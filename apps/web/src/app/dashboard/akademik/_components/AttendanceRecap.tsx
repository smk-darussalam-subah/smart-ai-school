'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BarChart3, CalendarDays, Download, Printer, RefreshCw, Users } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  attendanceRecapCsv,
  recapStatusLabels,
  type AttendanceRecap,
  type RecapQuery,
  type RecapRead,
} from '@/lib/attendance-recap';
import { fetchAttendanceRecap } from '../attendance-recap-actions';

const panel =
  'min-w-0 rounded-2xl border border-slate-200 bg-white p-4 text-slate-950 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:p-6';
const button =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800';
const field =
  'min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const muted = 'text-sm text-slate-600 dark:text-slate-300';
const n = (v: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(v);
const pct = (v: number | null) => (v === null ? 'Belum tersedia' : `${n(v)}%`);
type Metrics = AttendanceRecap['metrics'];
type Context = NonNullable<RecapQuery['context']>;

function useRecap(query: RecapQuery | null, retry: number) {
  const key = query ? JSON.stringify(query) : null;
  const requestKey = key ? `${key}|${retry}` : null;
  const [result, setResult] = useState<{ key: string; read: RecapRead } | null>(null);
  useEffect(() => {
    if (!key) return;
    let active = true;
    void fetchAttendanceRecap(JSON.parse(key) as RecapQuery)
      .then((read) => {
        if (active) setResult({ key: requestKey!, read });
      })
      .catch(() => {
        if (active)
          setResult({
            key: requestKey!,
            read: { state: 'error', message: 'Rekap belum dapat dimuat. Coba lagi.' },
          });
      });
    return () => {
      active = false;
    };
  }, [key, requestKey]);
  return result?.key === requestKey ? result.read : null;
}

function Status({ value }: { value: keyof typeof recapStatusLabels }) {
  const color = {
    H: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
    I: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
    S: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
    A: 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200',
    U: 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-100',
    N: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    C: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  }[value];
  return (
    <span
      title={recapStatusLabels[value]}
      className={`inline-flex min-h-8 min-w-8 items-center justify-center rounded-md px-2 py-1 text-xs font-semibold ${color}`}
    >
      {value === 'U' ? '—' : value === 'N' ? '·' : value}
      <span className="sr-only"> {recapStatusLabels[value]}</span>
    </span>
  );
}

function MetricsCards({
  value: m,
  partialScope = false,
}: {
  value: Metrics;
  partialScope?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Ringkasan kehadiran">
      <div className={panel}>
        <p className={muted}>Kehadiran tercatat</p>
        <p className="mt-2 text-3xl font-bold tabular-nums" data-testid="recap-attendance">
          {pct(m.attendancePct)}
        </p>
        <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-200">
          {m.provisional || partialScope ? 'Sementara · ' : ''}
          {n(m.H)} Hadir dari {n(m.recorded)} JP tercatat
        </p>
      </div>
      <div className={panel}>
        <p className={muted}>Kelengkapan absensi</p>
        <p className="mt-2 text-3xl font-bold tabular-nums" data-testid="recap-coverage">
          {pct(m.coveragePct)}
        </p>
        <p className={`mt-2 ${muted}`}>
          {m.due
            ? `${n(m.recorded)} dari ${n(m.due)} catatan JP jatuh tempo`
            : 'Belum ada JP yang jatuh tempo'}
        </p>
      </div>
      <div className={panel}>
        <p className={muted}>Ketidakhadiran tercatat</p>
        <p className="mt-2 text-3xl font-bold tabular-nums">
          {n(m.I + m.S + m.A)} <span className="text-sm font-medium">JP</span>
        </p>
        <p className={`mt-2 ${muted}`}>
          Izin {n(m.I)} · Sakit {n(m.S)} · Alpha {n(m.A)}
        </p>
      </div>
      <div className={panel}>
        <p className={muted}>Belum dicatat</p>
        <p className="mt-2 text-3xl font-bold tabular-nums">
          {n(m.U)} <span className="text-sm font-medium">JP</span>
        </p>
        <p className={`mt-2 ${muted}`}>
          {n(m.students)} siswa dalam cakupan · {n(m.N)} JP belum jatuh tempo
        </p>
      </div>
    </div>
  );
}

function Pager({ data, onPage }: { data: AttendanceRecap; onPage: (p: number) => void }) {
  const p = data.pagination,
    pages = Math.max(1, Math.ceil(p.total / p.pageSize));
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className={muted}>
        Halaman {p.page} dari {pages} · {n(p.total)} hasil
      </p>
      <div className="flex gap-2">
        <button
          className={button}
          data-recap-focus="page-previous"
          disabled={p.page <= 1}
          onClick={() => onPage(p.page - 1)}
        >
          Sebelumnya
        </button>
        <button
          className={button}
          data-recap-focus="page-next"
          disabled={p.page >= pages}
          onClick={() => onPage(p.page + 1)}
        >
          Berikutnya
        </button>
      </div>
    </div>
  );
}

function sessionHref(id: string, data: AttendanceRecap) {
  return (
    '/dashboard/akademik?' +
    new URLSearchParams({
      view: 'learning-recap',
      workspace: data.context === 'own' ? 'teaching' : 'operations',
      sessionId: id,
      academicYear: data.academicYear,
      semester: String(data.semester),
    })
  );
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div
      className="max-w-full overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700"
      tabIndex={0}
      aria-label="Tabel rekap kehadiran, dapat digeser"
    >
      <table className="w-full text-left text-sm [&_td]:border-t [&_td]:border-slate-200 [&_td]:px-4 [&_td]:py-3 dark:[&_td]:border-slate-700">
        <thead className="bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <tr>
            {headers.map((h) => (
              <th key={h} scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Detail({
  student,
  query,
  onClose,
  trigger,
}: {
  student: { id: string; name: string };
  query: RecapQuery;
  onClose: () => void;
  trigger: React.RefObject<HTMLElement | null>;
}) {
  const [view, setView] = useState<'detail' | 'audit'>('detail'),
    [page, setPage] = useState(1),
    [retry, setRetry] = useState(0);
  const title = useRef<HTMLHeadingElement>(null);
  const read = useRecap(
    { ...query, view, studentId: student.id, page, status: undefined, search: '' },
    retry,
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90dvh] max-w-5xl overflow-y-auto bg-white text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          if (trigger.current?.isConnected) trigger.current.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle ref={title} tabIndex={-1}>
            {student.name}
          </DialogTitle>
          <DialogDescription>
            Rincian kehadiran pada periode dan cakupan yang dipilih.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2" role="group" aria-label="Rincian atau audit">
          <button
            className={button}
            aria-pressed={view === 'detail'}
            onClick={() => {
              setView('detail');
              setPage(1);
            }}
          >
            Kronologi JP
          </button>
          <button
            className={button}
            aria-pressed={view === 'audit'}
            onClick={() => {
              setView('audit');
              setPage(1);
            }}
          >
            Riwayat koreksi
          </button>
        </div>
        {!read ? (
          <p role="status">Memuat rincian…</p>
        ) : read.state !== 'ready' ? (
          <div role="status">
            <p>{read.message}</p>
            <button
              className={button}
              onClick={() => {
                title.current?.focus();
                setRetry((x) => x + 1);
              }}
            >
              Coba lagi
            </button>
          </div>
        ) : (
          <>
            <p className={muted}>
              {read.data.scopeLabel} · {read.data.from}–{read.data.to} ·{' '}
              {pct(read.data.metrics.attendancePct)} hadir tercatat
              {read.data.metrics.provisional ? ' (sementara)' : ''}
            </p>
            {view === 'detail' ? (
              <Table headers={['Tanggal / JP', 'Mapel / Guru', 'Status', 'Keterangan', 'Sesi']}>
                {read.data.timeline.map((r) => (
                  <tr key={`${r.studentId}:${r.date}:${r.jp}`}>
                    <td className="whitespace-nowrap">
                      {r.date}
                      <br />
                      JP {r.jp}
                    </td>
                    <td>
                      <p className="font-semibold">{r.subject}</p>
                      <p className={muted}>{r.teacher}</p>
                      <p className={muted}>{r.className}</p>
                    </td>
                    <td>
                      <Status value={r.status} />
                    </td>
                    <td>
                      <p className="max-w-xs whitespace-pre-wrap break-words">{r.notes || '—'}</p>
                      {r.recordedAt && (
                        <p className={`mt-1 ${muted}`}>
                          Tersimpan{' '}
                          {new Date(r.recordedAt).toLocaleString('id-ID', {
                            timeZone: 'Asia/Jakarta',
                          })}{' '}
                          WIB
                        </p>
                      )}
                    </td>
                    <td>
                      {read.data.context === 'homeroom' ? (
                        <span className={muted}>Kelas binaan · baca</span>
                      ) : (
                        <Link href={sessionHref(r.sessionId, read.data)} className={button}>
                          Buka sesi
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
            ) : (
              <div className="space-y-3">
                {read.data.audits.map((a) => (
                  <article
                    key={a.id}
                    className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"
                  >
                    <p className="font-semibold">
                      {new Date(a.at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB
                    </p>
                    <p className={muted}>Pencatat: {a.actor}</p>
                    <ul className="mt-2 space-y-1">
                      {a.changes.map((c, i) => (
                        <li key={i}>
                          JP {c.jp}: {c.from || 'Belum dicatat'} → {c.to}
                          {c.notesChanged ? ' · Keterangan diperbarui' : ''}
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            )}
            {!read.data.pagination.total && (
              <p className={muted}>
                {view === 'audit'
                  ? 'Belum ada riwayat koreksi yang tersedia dalam cakupan ini.'
                  : 'Belum ada rincian pada cakupan ini.'}
              </p>
            )}
            <Pager
              data={read.data}
              onPage={(page) => {
                title.current?.focus();
                setPage(page);
              }}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function AttendanceRecap({
  academicYear,
  semester,
  classId,
  subject,
  teacherId,
  context = 'own',
  allowHomeroom = false,
  compact = false,
  date,
}: {
  academicYear?: string;
  semester?: number;
  classId?: string;
  subject?: string;
  teacherId?: string;
  context?: Context;
  allowHomeroom?: boolean;
  compact?: boolean;
  date?: string;
}) {
  const searchParams = useSearchParams();
  const headingId = useId();
  // URL chooses the requested surface, never authority; the server may deny it.
  const initialContext =
    searchParams.get('attendanceContext') === 'homeroom' ? 'homeroom' : context;
  const initial: RecapQuery = {
    context: initialContext,
    academicYear,
    semester,
    classId: classId ?? searchParams.get('attendanceClass') ?? undefined,
    subject: subject ?? searchParams.get('attendanceSubject') ?? undefined,
    teacherId: teacherId ?? searchParams.get('attendanceTeacher') ?? undefined,
    from: date ?? searchParams.get('attendanceFrom') ?? undefined,
    to: date ?? searchParams.get('attendanceTo') ?? undefined,
    jp: searchParams.has('attendanceJp') ? Number(searchParams.get('attendanceJp')) : undefined,
    jpFrom: searchParams.has('attendanceJpFrom')
      ? Number(searchParams.get('attendanceJpFrom'))
      : undefined,
    jpTo: searchParams.has('attendanceJpTo')
      ? Number(searchParams.get('attendanceJpTo'))
      : undefined,
    view: 'summary',
    page: 1,
  };
  const [filters, setFilters] = useState<RecapQuery>(initial);
  const [retry, setRetry] = useState(0),
    [search, setSearch] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const [student, setStudent] = useState<{ id: string; name: string } | null>(null),
    trigger = useRef<HTMLElement | null>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const section = useRef<HTMLElement>(null),
    pendingFocus = useRef<string | null>(null);
  const key = JSON.stringify(initial);
  const previous = useRef(key);
  useEffect(() => {
    if (previous.current === key) return;
    previous.current = key;
    setStudent(null);
    setSearch('');
    setFilters(JSON.parse(key) as RecapQuery);
  }, [key]);
  const read = useRecap(previous.current === key ? filters : null, retry),
    data = read?.state === 'ready' ? read.data : null;
  useEffect(() => {
    if (!read || !pendingFocus.current) return;
    const requested = pendingFocus.current;
    pendingFocus.current = null;
    if (document.activeElement !== document.body) return;
    const target = Array.from(
      section.current?.querySelectorAll<HTMLElement>('[data-recap-focus]') ?? [],
    ).find((el) => el.dataset.recapFocus === requested);
    (
      target ??
      section.current?.querySelector<HTMLElement>(
        '[data-recap-focus^="view-"][aria-pressed="true"]',
      ) ??
      heading.current
    )?.focus();
  }, [read]);
  const change = (patch: RecapQuery) => {
    pendingFocus.current =
      (document.activeElement as HTMLElement | null)?.dataset.recapFocus ?? 'active-view';
    setNotice('');
    setFilters((q) => ({
      ...q,
      ...(patch.from !== undefined || patch.to !== undefined ? { matrixDate: undefined } : {}),
      ...patch,
      page: patch.page ?? 1,
    }));
  };
  const choosePeriod = (days: number) => {
    if (!data) return;
    const to =
      data.serverDate < data.periodRange.from
        ? data.periodRange.from
        : data.serverDate > data.periodRange.to
          ? data.periodRange.to
          : data.serverDate;
    const from = new Date(
      Math.max(Date.parse(data.periodRange.from), Date.parse(to) - (days - 1) * 86400000),
    )
      .toISOString()
      .slice(0, 10);
    change({ from, to });
  };
  const openStudent = (id: string, name: string, element: HTMLElement) => {
    trigger.current = element;
    setStudent({ id, name });
  };
  const recapHref =
    '/dashboard/akademik?' +
    new URLSearchParams({
      view: 'attendance-recap',
      workspace: filters.context === 'authorized' ? 'operations' : 'teaching',
      ...(academicYear ? { academicYear } : {}),
      ...(semester ? { semester: String(semester) } : {}),
      ...(filters.context === 'homeroom' ? { attendanceContext: 'homeroom' } : {}),
      ...((filters.from ?? data?.from) ? { attendanceFrom: filters.from ?? data!.from } : {}),
      ...((filters.to ?? data?.to) ? { attendanceTo: filters.to ?? data!.to } : {}),
      ...(filters.classId ? { attendanceClass: filters.classId } : {}),
      ...(filters.subject ? { attendanceSubject: filters.subject } : {}),
      ...(filters.teacherId ? { attendanceTeacher: filters.teacherId } : {}),
      ...(filters.jp ? { attendanceJp: String(filters.jp) } : {}),
      ...(filters.jpFrom
        ? { attendanceJpFrom: String(filters.jpFrom), attendanceJpTo: String(filters.jpTo) }
        : {}),
    });
  async function exportRows(print = false) {
    setBusy(true);
    setNotice('');
    // Open synchronously for browser popup policy, then fill only validated, scoped data.
    const popup = print ? window.open('', '_blank', 'width=1000,height=800') : null;
    if (print && !popup) {
      setBusy(false);
      setNotice('Izinkan jendela cetak pada browser lalu coba lagi.');
      return;
    }
    if (popup) {
      popup.opener = null;
      popup.document.body.textContent = 'Menyiapkan ringkasan…';
    }
    try {
      const result = await fetchAttendanceRecap({ ...filters, view: 'export', page: 1 });
      if (result.state !== 'ready') {
        popup?.close();
        setNotice(result.message);
        return;
      }
      if (print && popup) {
        const doc = popup.document,
          title = doc.createElement('h1');
        title.textContent = 'Rekap Kehadiran Siswa';
        doc.body.replaceChildren(title);
        for (const text of [
          `${result.data.academicYear} · Semester ${result.data.semester} · ${result.data.from}–${result.data.to}`,
          result.data.scopeLabel,
          `Kehadiran tercatat ${pct(result.data.metrics.attendancePct)}${result.data.metrics.provisional || result.data.coverage.classesWithoutSessions > 0 ? ' (sementara)' : ''} · Kelengkapan ${pct(result.data.metrics.coveragePct)}`,
          `Berdasarkan sesi yang tersedia. ${result.data.coverage.classesWithoutSessions} kelas belum mempunyai sesi dalam cakupan ini.`,
          'H/I/S/A dan belum dicatat berunit catatan JP. Filter status/pencarian menyaring baris; KPI tetap cakupan periode.',
        ]) {
          const p = doc.createElement('p');
          p.textContent = text;
          doc.body.append(p);
        }
        const table = doc.createElement('table');
        table.style.cssText = 'border-collapse:collapse;width:100%;font:13px sans-serif';
        for (const row of [
          [
            'Kelas',
            'Siswa',
            'Hadir',
            'Izin',
            'Sakit',
            'Alpha',
            'Belum dicatat',
            'Hadir tercatat',
            'Kelengkapan',
          ],
          ...result.data.classes.map((c) => [
            c.name,
            c.metrics.students,
            c.metrics.H,
            c.metrics.I,
            c.metrics.S,
            c.metrics.A,
            c.metrics.U,
            pct(c.metrics.attendancePct),
            pct(c.metrics.coveragePct),
          ]),
        ]) {
          const tr = doc.createElement('tr');
          for (const value of row) {
            const td = doc.createElement('td');
            td.textContent = String(value);
            td.style.cssText = 'padding:8px;border:1px solid #ccc';
            tr.append(td);
          }
          table.append(tr);
        }
        doc.body.append(table);
        popup.focus();
        popup.print();
      } else {
        const url = URL.createObjectURL(
          new Blob([attendanceRecapCsv(result.data)], { type: 'text/csv;charset=utf-8' }),
        );
        const link = document.createElement('a');
        link.href = url;
        link.download = `kehadiran-jp-${result.data.from}-${result.data.to}.csv`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        setNotice('Ekspor sesuai cakupan dan filter sudah disiapkan.');
      }
    } catch {
      popup?.close();
      setNotice('Ekspor belum berhasil. Coba lagi.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      ref={section}
      className="min-w-0 space-y-4 rounded-2xl bg-slate-50 p-3 text-slate-950 dark:bg-slate-950 dark:text-slate-100 sm:p-4"
      aria-labelledby={headingId}
      data-attendance-recap
      aria-busy={!read}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            ref={heading}
            tabIndex={-1}
            id={headingId}
            className="flex items-center gap-2 text-xl font-bold"
          >
            <Users className="h-5 w-5 text-emerald-700 dark:text-emerald-400" aria-hidden />
            Kehadiran siswa
          </h2>
          <p className={`mt-1 ${muted}`}>
            {compact && date
              ? 'Ringkasan hari ini berdasarkan jam pelajaran.'
              : 'Rekap per jam pelajaran sesuai sesi dan kewenangan Anda.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className={button}
            disabled={busy || !read}
            onClick={() => setRetry((x) => x + 1)}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Muat ulang
          </button>
          {compact ? (
            <Link href={recapHref} className={button}>
              Lihat rekap
            </Link>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button className={button} disabled={busy || !data} onClick={() => void exportRows()}>
                <Download className="h-4 w-4" aria-hidden />
                Ekspor CSV
              </button>
              <button
                className={button}
                disabled={busy || !data}
                onClick={() => void exportRows(true)}
              >
                <Printer className="h-4 w-4" aria-hidden />
                Cetak / PDF
              </button>
            </div>
          )}
        </div>
      </div>
      {!compact && (
        <div className={panel}>
          {(allowHomeroom || data?.availableContexts.includes('homeroom')) && (
            <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Cakupan kehadiran">
              <button
                className={button}
                aria-pressed={filters.context === 'own'}
                onClick={() =>
                  change({
                    context: 'own',
                    classId: undefined,
                    teacherId: undefined,
                    subject: undefined,
                  })
                }
              >
                Pengajaran Saya
              </button>
              <button
                className={button}
                aria-pressed={filters.context === 'homeroom'}
                onClick={() =>
                  change({
                    context: 'homeroom',
                    classId: undefined,
                    teacherId: undefined,
                    subject: undefined,
                  })
                }
              >
                Kelas Binaan
              </button>
            </div>
          )}
          <details className="group">
            <summary className="min-h-11 cursor-pointer font-semibold">
              Filter dan cakupan data
            </summary>
            <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <label className={muted}>
                Periode cepat
                <select
                  aria-label="Periode cepat"
                  className={field}
                  value="custom"
                  disabled={!data}
                  onChange={(e) => choosePeriod(Number(e.target.value))}
                >
                  <option value="custom">Rentang tanggal pilihan</option>
                  <option
                    value="1"
                    disabled={
                      !!data &&
                      (data.serverDate < data.periodRange.from ||
                        data.serverDate > data.periodRange.to)
                    }
                  >
                    Hari ini
                  </option>
                  <option value="7">7 hari terakhir pada semester</option>
                  <option value="30">30 hari terakhir pada semester</option>
                </select>
              </label>
              <label className={muted}>
                Dari tanggal
                <input
                  type="date"
                  min={data?.periodRange.from}
                  max={data?.periodRange.to}
                  className={field}
                  value={filters.from ?? data?.from ?? ''}
                  onChange={(e) =>
                    change({ from: e.target.value, to: filters.to ?? data?.to ?? e.target.value })
                  }
                />
              </label>
              <label className={muted}>
                Sampai tanggal
                <input
                  type="date"
                  min={data?.periodRange.from}
                  max={data?.periodRange.to}
                  className={field}
                  value={filters.to ?? data?.to ?? ''}
                  onChange={(e) =>
                    change({
                      to: e.target.value,
                      from: filters.from ?? data?.from ?? e.target.value,
                    })
                  }
                />
              </label>
              <label className={muted}>
                Kelas
                <select
                  aria-label="Kelas"
                  className={field}
                  value={filters.classId ?? ''}
                  onChange={(e) => change({ classId: e.target.value || undefined })}
                >
                  <option value="">Semua kelas yang diizinkan</option>
                  {data?.options.classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={muted}>
                Mata pelajaran
                <select
                  aria-label="Mata pelajaran"
                  className={field}
                  value={filters.subject ?? ''}
                  onChange={(e) => change({ subject: e.target.value || undefined })}
                >
                  <option value="">Semua mapel dalam cakupan</option>
                  {data?.options.subjects.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className={muted}>
                Guru
                <select
                  aria-label="Guru"
                  className={field}
                  value={filters.teacherId ?? ''}
                  onChange={(e) => change({ teacherId: e.target.value || undefined })}
                >
                  <option value="">Semua guru dalam cakupan</option>
                  {data?.options.teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={muted}>
                Jurusan
                <select
                  aria-label="Jurusan"
                  className={field}
                  value={filters.majorCode ?? ''}
                  onChange={(e) =>
                    change({ majorCode: e.target.value || undefined, classId: undefined })
                  }
                >
                  <option value="">Semua jurusan dalam cakupan</option>
                  {[...new Set(data?.options.classes.map((c) => c.majorCode) ?? [])]
                    .sort()
                    .map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                </select>
              </label>
              <label className={muted}>
                Tingkat
                <select
                  aria-label="Tingkat"
                  className={field}
                  value={filters.grade ?? ''}
                  onChange={(e) =>
                    change({
                      grade: e.target.value ? Number(e.target.value) : undefined,
                      classId: undefined,
                    })
                  }
                >
                  <option value="">Semua tingkat</option>
                  {[10, 11, 12].map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </label>
              <label className={muted}>
                Jam pelajaran
                <select
                  aria-label="Jam pelajaran"
                  className={field}
                  value={filters.jpFrom ? 'range' : (filters.jp ?? '')}
                  onChange={(e) =>
                    change(
                      e.target.value === 'range'
                        ? {
                            jp: undefined,
                            jpFrom: data?.options.jps[0] ?? 1,
                            jpTo: data?.options.jps.at(-1) ?? 1,
                          }
                        : {
                            jp: e.target.value ? Number(e.target.value) : undefined,
                            jpFrom: undefined,
                            jpTo: undefined,
                          },
                    )
                  }
                >
                  <option value="">Semua JP</option>
                  <option value="range">Rentang JP</option>
                  {data?.options.jps.map((j) => (
                    <option key={j} value={j}>
                      JP {j}
                    </option>
                  ))}
                </select>
              </label>
              {filters.jpFrom && (
                <>
                  <label className={muted}>
                    Dari JP
                    <select
                      aria-label="Dari JP"
                      className={field}
                      value={filters.jpFrom}
                      onChange={(e) => {
                        const from = Number(e.target.value);
                        change({ jpFrom: from, jpTo: Math.max(from, filters.jpTo ?? from) });
                      }}
                    >
                      {data?.options.jps.map((j) => (
                        <option key={j} value={j}>
                          JP {j}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={muted}>
                    Sampai JP
                    <select
                      aria-label="Sampai JP"
                      className={field}
                      value={filters.jpTo}
                      onChange={(e) => {
                        const to = Number(e.target.value);
                        change({ jpFrom: Math.min(to, filters.jpFrom!), jpTo: to });
                      }}
                    >
                      {data?.options.jps.map((j) => (
                        <option key={j} value={j}>
                          JP {j}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
          </details>
        </div>
      )}
      {!read ? (
        <div className={panel}>
          <p role="status" className={muted}>
            Memuat rekap kehadiran…
          </p>
        </div>
      ) : read.state !== 'ready' ? (
        <div className={panel}>
          <p role="status" className={muted}>
            {read.message}
          </p>
          <button
            className={`${button} mt-3`}
            onClick={() => {
              setRetry((x) => x + 1);
              heading.current?.focus();
            }}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Coba lagi
          </button>
        </div>
      ) : (
        <>
          <p className={muted}>
            {data!.scopeLabel} · {data!.from}–{data!.to}
          </p>
          <MetricsCards
            value={data!.metrics}
            partialScope={data!.coverage.classesWithoutSessions > 0}
          />
          {!compact && (
            <p className={muted}>
              Berdasarkan sesi yang tersedia · Diperbarui{' '}
              {new Date(data!.generatedAt).toLocaleTimeString('id-ID', {
                timeZone: 'Asia/Jakarta',
                hour: '2-digit',
                minute: '2-digit',
              })}{' '}
              WIB
            </p>
          )}
          {data!.coverage.classesWithoutSessions > 0 && (
            <p
              role="status"
              className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
            >
              {data!.coverage.classesWithoutSessions} kelas belum mempunyai sesi dalam cakupan ini.
              Persentase hanya mewakili sesi yang tersedia.
            </p>
          )}
          {!compact && (
            <>
              <div className="grid gap-4 xl:grid-cols-2">
                <div className={panel}>
                  <h3 className="flex items-center gap-2 font-bold">
                    <BarChart3 className="h-4 w-4" aria-hidden />
                    Tren kehadiran harian
                  </h3>
                  <div className="mt-4 max-h-60 space-y-2 overflow-y-auto">
                    {data!.days.map((d) => (
                      <div
                        key={d.date}
                        className="grid grid-cols-[5rem_1fr_4rem] items-center gap-3 text-sm"
                      >
                        <span>{d.date.slice(5)}</span>
                        {d.attendancePct === null ? (
                          <span
                            className="h-2 rounded bg-slate-100 dark:bg-slate-800"
                            aria-label={`Belum ada kehadiran tercatat ${d.date}`}
                          />
                        ) : (
                          <progress
                            aria-label={`Hadir tercatat ${d.date}`}
                            value={d.attendancePct ?? 0}
                            max={100}
                            className="w-full accent-emerald-700"
                          />
                        )}
                        <span>
                          {d.attendancePct === null ? '—' : `${n(d.attendancePct)}%`}
                          {d.provisional ? '*' : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className={`mt-3 ${muted}`}>* Pencatatan belum lengkap.</p>
                </div>
                <div className={panel}>
                  <h3 className="font-bold">Kehadiran per jam pelajaran</h3>
                  <div className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-5">
                    {data!.jps.map((j) => (
                      <div key={j.jp}>
                        <p className={muted}>JP {j.jp}</p>
                        <p className="mt-1 font-bold">
                          {j.attendancePct === null ? '—' : `${n(j.attendancePct)}%`}
                          {j.provisional ? '*' : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className={panel}>
                <div
                  className="mb-4 flex gap-2 overflow-x-auto"
                  role="group"
                  aria-label="Tampilan rekap"
                >
                  {(
                    [
                      ['summary', 'Ringkasan'],
                      ['matrix', 'Matriks JP'],
                      ['students', 'Per Siswa'],
                      ['missing', 'Belum Dicatat'],
                    ] as const
                  ).map(([view, label]) => (
                    <button
                      key={view}
                      className={`${button} shrink-0 ${filters.view === view ? 'border-emerald-700 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100' : ''}`}
                      aria-pressed={filters.view === view}
                      data-recap-focus={`view-${view}`}
                      onClick={() => change({ view })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <form
                  className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto_1fr_1fr]"
                  onSubmit={(e) => {
                    e.preventDefault();
                    change({ search });
                  }}
                >
                  <label className={muted}>
                    Nama siswa / NIS
                    <input
                      className={field}
                      value={search}
                      data-recap-focus="search"
                      maxLength={100}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <button
                    className={`${button} self-end`}
                    data-recap-focus="search-submit"
                    type="submit"
                  >
                    Cari
                  </button>
                  <label className={muted}>
                    Status hasil
                    <select
                      aria-label="Status hasil"
                      className={field}
                      value={filters.status ?? ''}
                      data-recap-focus="status"
                      onChange={(e) =>
                        change({
                          status: e.target.value
                            ? (e.target.value as RecapQuery['status'])
                            : undefined,
                        })
                      }
                    >
                      <option value="">Semua status</option>
                      {Object.entries(recapStatusLabels).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={muted}>
                    Urutan
                    <select
                      aria-label="Urutan"
                      className={field}
                      value={filters.sort ?? 'name'}
                      data-recap-focus="sort"
                      onChange={(e) => change({ sort: e.target.value as RecapQuery['sort'] })}
                    >
                      <option value="name">Nama</option>
                      <option value="attendance">Kehadiran terendah</option>
                      <option value="alpha">Alpha terbanyak</option>
                    </select>
                  </label>
                </form>
                <p className={`mb-4 ${muted}`}>
                  Pencarian dan status menyaring hasil di bawah. KPI tetap mengikuti cakupan
                  periode, kelas, mapel dan JP.
                </p>
                {filters.view === 'matrix' && (
                  <label className={`mb-4 block max-w-xs ${muted}`}>
                    <CalendarDays className="mr-2 inline h-4 w-4" aria-hidden />
                    Tanggal matriks
                    <input
                      className={field}
                      type="date"
                      min={data!.from}
                      max={data!.to}
                      value={data!.matrixDate}
                      onChange={(e) => change({ matrixDate: e.target.value })}
                    />
                  </label>
                )}
                {(!filters.view || filters.view === 'summary') && (
                  <Table
                    headers={[
                      'Kelas',
                      'Siswa',
                      'JP tercatat',
                      'Kehadiran tercatat',
                      'Izin',
                      'Sakit',
                      'Alpha',
                      'Belum dicatat',
                      'Kelengkapan',
                      'Rincian',
                    ]}
                  >
                    {data!.classes.map((c) => (
                      <tr key={c.id}>
                        <td className="font-semibold">{c.name}</td>
                        <td>{n(c.metrics.students)}</td>
                        <td>{n(c.metrics.recorded)}</td>
                        <td>
                          {pct(c.metrics.attendancePct)}
                          {c.metrics.provisional ? ' *' : ''}
                        </td>
                        <td>{c.metrics.I}</td>
                        <td>{c.metrics.S}</td>
                        <td>{c.metrics.A}</td>
                        <td>{c.metrics.U}</td>
                        <td>{c.hasSessions ? pct(c.metrics.coveragePct) : 'Belum ada sesi'}</td>
                        <td>
                          <button
                            className={button}
                            onClick={() => change({ classId: c.id, view: 'students' })}
                          >
                            Lihat siswa
                          </button>
                        </td>
                      </tr>
                    ))}
                  </Table>
                )}
                {filters.view === 'students' && (
                  <Table
                    headers={[
                      'Siswa / NIS',
                      'Kelas',
                      'Hadir',
                      'Izin',
                      'Sakit',
                      'Alpha',
                      'Belum dicatat',
                      'Kehadiran tercatat',
                      'Rincian',
                    ]}
                  >
                    {data!.students.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <p className="font-semibold">{s.name}</p>
                          <p className={muted}>{s.nis}</p>
                        </td>
                        <td>{s.className}</td>
                        <td>{s.metrics.H}</td>
                        <td>{s.metrics.I}</td>
                        <td>{s.metrics.S}</td>
                        <td>{s.metrics.A}</td>
                        <td>{s.metrics.U}</td>
                        <td>
                          {pct(s.metrics.attendancePct)}
                          {s.metrics.provisional ? ' *' : ''}
                        </td>
                        <td>
                          <button
                            className={button}
                            onClick={(e) => openStudent(s.id, s.name, e.currentTarget)}
                          >
                            Lihat rincian
                          </button>
                        </td>
                      </tr>
                    ))}
                  </Table>
                )}
                {filters.view === 'matrix' && (
                  <Table headers={['Siswa', ...data!.options.jps.map((j) => `JP ${j}`)]}>
                    {data!.students.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <button
                            className="min-h-11 text-left font-semibold underline decoration-emerald-500 underline-offset-4"
                            onClick={(e) => openStudent(s.id, s.name, e.currentTarget)}
                          >
                            {s.name}
                          </button>
                          <p className={muted}>{s.className}</p>
                        </td>
                        {data!.options.jps.map((j) => {
                          const slot = s.slots.find((r) => r.jp === j);
                          return (
                            <td key={j}>
                              {slot ? (
                                <button
                                  className="min-h-11 min-w-11"
                                  aria-label={`${s.name}, JP ${j}, ${recapStatusLabels[slot.status]}`}
                                  onClick={(e) => openStudent(s.id, s.name, e.currentTarget)}
                                >
                                  <Status value={slot.status} />
                                </button>
                              ) : (
                                <span aria-label="Di luar cakupan">·</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Table>
                )}
                {filters.view === 'missing' && (
                  <>
                    <p className={`mb-4 ${muted}`}>
                      Belum dicatat adalah pekerjaan pencatatan, bukan ketidakhadiran siswa. Buka
                      sesi untuk melihat atau melengkapi sesuai hak Anda.
                    </p>
                    <Table
                      headers={[
                        'Tanggal',
                        'Kelas',
                        'JP',
                        'Mapel / Guru',
                        'Siswa terdampak',
                        'Aksi',
                      ]}
                    >
                      {data!.missing.map((s) => (
                        <tr key={s.sessionId}>
                          <td>{s.date}</td>
                          <td>{s.className}</td>
                          <td>{s.jps.join(', ')}</td>
                          <td>
                            <p className="font-semibold">{s.subject}</p>
                            <p className={muted}>{s.teacher}</p>
                          </td>
                          <td>{s.students}</td>
                          <td>
                            {data!.context === 'homeroom' ? (
                              <button
                                className={button}
                                onClick={() =>
                                  change({
                                    view: 'matrix',
                                    classId: s.classId,
                                    subject: s.subject,
                                    matrixDate: s.date,
                                  })
                                }
                              >
                                Lihat rincian
                              </button>
                            ) : (
                              <Link className={button} href={sessionHref(s.sessionId, data!)}>
                                Buka sesi
                              </Link>
                            )}
                          </td>
                        </tr>
                      ))}
                    </Table>
                  </>
                )}
                {!data!.pagination.total && (
                  <p role="status" className={`mt-4 ${muted}`}>
                    Tidak ada hasil pada filter ini. Coba ubah periode atau filter.
                  </p>
                )}
                <Pager data={data!} onPage={(page) => change({ page })} />
              </div>
              <p className={muted}>
                H/I/S/A dan belum dicatat berunit catatan JP. Keterangan izin/sakit tersedia pada
                rincian. Rekap mengikuti daftar kelas dan catatan yang tersedia.
              </p>
            </>
          )}
        </>
      )}
      {notice && (
        <p role="status" className={muted}>
          {notice}
        </p>
      )}
      {student && (
        <Detail
          key={student.id}
          student={student}
          query={filters}
          trigger={trigger}
          onClose={() => {
            setStudent(null);
            if (!trigger.current?.isConnected) heading.current?.focus();
          }}
        />
      )}
    </section>
  );
}
