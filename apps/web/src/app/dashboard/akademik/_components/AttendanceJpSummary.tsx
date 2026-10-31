'use client';
import React, { useEffect, useRef, useState } from 'react';
import { ClipboardCheck, Download, RefreshCw, ShieldAlert, WifiOff } from 'lucide-react';
import { fetchSessionAttendanceOverview } from '../session-attendance-actions';
import {
  JpOverviewQuerySchema,
  jpOverviewCsv,
  type JpOverview,
  type JpOverviewQuery,
  type JpRead,
} from '@/lib/session-attendance';
import { attendanceNumber as n, attendanceRangeLabel } from '@/lib/attendance-presentation';

export function JpSummaryContent({ data }: { data: JpOverview }) {
  const t = data.totals;
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([jpOverviewCsv(data)], { type: 'text/csv;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `kehadiran-jp-${data.from}-${data.to}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };
  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-bold text-slate-950 dark:text-slate-100">
            <ClipboardCheck
              className="h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-400"
              aria-hidden="true"
            />
            Kehadiran siswa per JP
          </h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {attendanceRangeLabel(data.from, data.to)}
          </p>
        </div>
        <button
          type="button"
          title="Unduh CSV ringkasan JP"
          aria-label="Unduh CSV ringkasan JP"
          onClick={download}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-slate-300 bg-white text-slate-700 transition-colors hover:border-emerald-700 hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-emerald-400 dark:hover:bg-emerald-950 dark:focus-visible:outline-emerald-400"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-5 grid min-w-0 gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:items-center">
        <div>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Persentase hadir</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-emerald-900 dark:text-emerald-200">
            {t.pct === null ? '—' : `${n(t.pct)}%`}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {n(t.recorded)} dari {n(t.expected)} siswa-JP tercatat
          </p>
          <progress
            aria-label="Kelengkapan pencatatan JP"
            max={t.expected || 1}
            value={t.recorded}
            className="mt-2 h-2 w-full accent-emerald-700 dark:accent-emerald-400"
          />
          <dl className="mt-3 grid grid-cols-4 gap-3 text-sm">
            {(
              [
                ['Hadir', t.hadir],
                ['Izin', t.izin],
                ['Sakit', t.sakit],
                ['Alpha', t.alpha],
              ] as const
            ).map(([label, count]) => (
              <div key={label} className="min-w-0">
                <dt className="text-slate-600 dark:text-slate-300">{label}</dt>
                <dd className="mt-0.5 font-bold tabular-nums text-slate-950 dark:text-slate-100">
                  {n(count)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        {!t.expected
          ? 'Belum ada absensi sesi yang dapat diringkas pada rentang ini.'
          : t.unknown
            ? `${n(t.unknown)} siswa-JP belum lengkap atau perlu diperiksa; persentase belum disimpulkan.`
            : 'Berdasarkan JP yang tercatat pada sesi pembelajaran.'}{' '}
        Bukan jumlah hari atau siswa unik.
      </p>
    </>
  );
}

export default function AttendanceJpSummary({
  query,
  refreshToken = 0,
}: {
  query: JpOverviewQuery;
  refreshToken?: number;
}) {
  const key = JSON.stringify(query);
  const section = useRef<HTMLElement>(null);
  const retryFocus = useRef<string | null>(null);
  const [result, setResult] = useState<{ key: string; read: JpRead<JpOverview> } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setResult(null);
    const parsed = JpOverviewQuerySchema.safeParse(JSON.parse(key));
    if (!parsed.success) {
      setResult({ key, read: { state: 'error', message: 'Periode kehadiran belum tersedia.' } });
      return;
    }
    fetchSessionAttendanceOverview(parsed.data)
      .then((read) => {
        if (active) setResult({ key, read });
      })
      .catch(() => {
        if (active)
          setResult({
            key,
            read: { state: 'error', message: 'Ringkasan JP belum dapat dimuat. Coba lagi.' },
          });
      });
    return () => {
      active = false;
    };
  }, [key, retry, refreshToken]);
  const read = result?.key === key ? result.read : null;
  useEffect(() => {
    if (!read || !retryFocus.current) return;
    const requestedKey = retryFocus.current;
    retryFocus.current = null;
    if (requestedKey !== key || document.activeElement !== document.body) return;
    (section.current?.querySelector<HTMLButtonElement>('button') ?? section.current)?.focus();
  }, [key, read]);
  return (
    <section
      ref={section}
      tabIndex={-1}
      aria-label="Ringkasan kehadiran per JP"
      aria-busy={!read}
      data-state={read?.state ?? 'loading'}
      className="min-w-0 rounded-2xl border border-[#e3ece8] bg-white p-4 text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:shadow-none"
    >
      {!read ? (
        <div className="min-h-[228px] sm:min-h-[196px]">
          <p role="status" className="flex items-center gap-2 text-sm font-semibold">
            <RefreshCw className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
            Memuat kehadiran per JP…
          </p>
          <div aria-hidden="true" className="mt-6 space-y-4 motion-safe:animate-pulse">
            <div className="h-7 w-24 rounded bg-slate-100 dark:bg-slate-800" />
            <div className="h-3 w-2/3 rounded bg-slate-100 dark:bg-slate-800" />
            <div className="h-3 w-full rounded bg-slate-100 dark:bg-slate-800" />
          </div>
        </div>
      ) : read.state === 'ready' ? (
        <JpSummaryContent data={read.data} />
      ) : (
        <div className="flex min-h-[228px] flex-wrap content-start items-start justify-between gap-4 sm:min-h-[196px]">
          <div
            role={read.state === 'error' ? 'alert' : 'status'}
            className="flex min-w-0 flex-1 items-start gap-3"
          >
            {read.state === 'denied' ? (
              <ShieldAlert
                className="mt-0.5 h-5 w-5 shrink-0 text-slate-600 dark:text-slate-300"
                aria-hidden="true"
              />
            ) : (
              <WifiOff
                className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300"
                aria-hidden="true"
              />
            )}
            <div className="min-w-0">
              <h3 className="text-base font-bold">Kehadiran siswa per JP</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {read.message}
              </p>
            </div>
          </div>
          {read.state !== 'denied' && (
            <button
              type="button"
              onClick={() => {
                retryFocus.current = key;
                setRetry((x) => x + 1);
              }}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold transition-colors hover:border-emerald-700 hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-emerald-950 dark:focus-visible:outline-emerald-400"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Coba lagi
            </button>
          )}
        </div>
      )}
    </section>
  );
}
