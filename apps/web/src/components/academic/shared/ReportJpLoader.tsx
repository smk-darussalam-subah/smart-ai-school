'use client';

import { useEffect, useState } from 'react';
import { fetchOfficialReportSections } from '@/app/dashboard/akademik/actions';
import ReportJpAnnex from './ReportJpAnnex';

type Report = {
  id: string;
  updatedAt: string;
  studentId: string;
  classId: string;
  academicYear: string;
  semester: number;
};
type Read = {
  key: string;
  state: 'loading' | 'ready' | 'error';
  value?: unknown;
  message?: string;
};

/** Fetch only the selected saved report, refusing a newer/different snapshot. */
export default function ReportJpLoader({
  report,
  value,
  available,
  studentName,
}: {
  report: Report;
  value: unknown;
  available?: boolean;
  studentName: string;
}) {
  const key = report.id + ':' + report.updatedAt;
  const needsRead = available === true && value === undefined;
  const [read, setRead] = useState<Read>({ key: '', state: 'loading' });
  const [retry, setRetry] = useState(0),
    [errorKey, setErrorKey] = useState('');
  useEffect(() => {
    if (!needsRead) return;
    let active = true;
    setRead({ key, state: 'loading' });
    fetchOfficialReportSections(report.studentId, report.academicYear, report.semester)
      .then((result) => {
        if (!active) return;
        if (!result.success) throw Error('Lampiran kehadiran belum dapat dimuat.');
        if (
          result.data.reportCardId !== report.id ||
          result.data.snapshotUpdatedAt !== report.updatedAt
        )
          throw Error('Rapor sudah berubah. Tutup rincian lalu muat ulang halaman.');
        if (result.data.attendance.jp === undefined || result.data.attendance.jp === null)
          throw Error('Lampiran kehadiran belum dapat diverifikasi.');
        setRead({ key, state: 'ready', value: result.data.attendance.jp });
      })
      .catch((error) => {
        if (!active) return;
        setErrorKey(key);
        const known = [
          'Rapor sudah berubah. Tutup rincian lalu muat ulang halaman.',
          'Lampiran kehadiran belum dapat diverifikasi.',
        ];
        const message =
          error instanceof Error && known.includes(error.message)
            ? error.message
            : 'Lampiran kehadiran belum dapat dimuat.';
        setRead({ key, state: 'error', message });
      });
    return () => {
      active = false;
    };
  }, [
    key,
    needsRead,
    report.id,
    report.updatedAt,
    report.studentId,
    report.academicYear,
    report.semester,
    retry,
  ]);
  const state = read.key === key ? read.state : 'loading';
  return (
    <div>
      {!needsRead || state === 'ready' ? (
        <ReportJpAnnex
          value={needsRead ? read.value : value}
          identity={report}
          studentName={studentName}
        />
      ) : (
        <section
          aria-label="Lampiran kehadiran JP"
          className="space-y-2 border-t border-slate-200 pt-4 text-sm dark:border-slate-700"
        >
          <h3 className="font-semibold">Lampiran kehadiran per JP</h3>
          <p role="status">{state === 'loading' ? 'Memuat lampiran kehadiran…' : read.message}</p>
        </section>
      )}
      {needsRead && errorKey === key && (
        <button
          type="button"
          aria-label="Muat ulang lampiran"
          aria-disabled={state === 'loading'}
          onClick={() => {
            if (state !== 'loading') {
              setRead({ key, state: 'loading' });
              setRetry((n) => n + 1);
            }
          }}
          className="mt-2 min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700"
        >
          {state === 'loading' ? 'Memuat…' : 'Muat ulang lampiran'}
        </button>
      )}
    </div>
  );
}
