'use client';

import React from 'react';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Download,
  Eye,
  FileClock,
  Lock,
  Printer,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  closeSemesterAction,
  exportClosureCsvAction,
  getSemesterClosureDetailAction,
  listSemesterClosuresAction,
  refreshSemesterReadiness,
  type ReadinessItem,
  type SemesterClosureDetail,
  type SemesterClosureSummary,
  type SemesterFinalReport,
  type SemesterReadiness,
} from '../actions';
import {
  buildSemesterCloseIdempotencyKey,
  canSubmitSemesterClose,
  closureCsvFilename,
  formatKktpProvenance,
  formatSemesterDateTime,
  formatReadinessMetric,
  isReadinessStale,
  semesterClosingUnavailableCopy,
  type SemesterClosingUnavailableReason,
} from '../semester-closing-ui';

type Tab = 'readiness' | 'report' | 'history';

const ACTION_LINKS: Record<string, { label: string; href: string }> = {
  complete_rpp_review: { label: 'Review Modul Ajar', href: '/dashboard/rpp' },
  finish_rpp_pipeline: { label: 'Modul Ajar', href: '/dashboard/akademik' },
  archive_lms_modules: { label: 'Modul LMS', href: '/dashboard/akademik' },
  complete_assessment_sessions: { label: 'Sesi Asesmen', href: '/dashboard/akademik' },
  grade_pending_responses: { label: 'Koreksi Esai', href: '/dashboard/akademik' },
  finalize_remedials: { label: 'Remedial', href: '/dashboard/akademik' },
  finish_report_distribution: { label: 'Rapor', href: '/dashboard/rapor' },
  configure_kktp: { label: 'KKTP', href: '/dashboard/akademik' },
  review_kktp_defaults: { label: 'KKTP', href: '/dashboard/akademik' },
  review_attendance: { label: 'Kehadiran', href: '/dashboard/akademik' },
  configure_next_semester: { label: 'Tahun Ajaran', href: '/dashboard/tahun-ajaran' },
  review_teaching_assignments: { label: 'Jadwal & Assignment', href: '/dashboard/jadwal' },
  view_closure: { label: 'Riwayat', href: '#history' },
};

function MetricGrid({ readiness }: { readiness: { metrics: SemesterReadiness['metrics'] } }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {readiness.metrics.map((metric) => (
        <div key={metric.code} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{metric.label}</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{formatReadinessMetric(metric)}</p>
        </div>
      ))}
    </div>
  );
}

function CompactReportTable({
  title,
  columns,
  rows,
}: {
  title: string;
  columns: string[];
  rows: Array<Array<string | number>>;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-6 text-sm text-slate-500">Tidak ada data pada kategori ini.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                {columns.map((column) => <th key={column} className="px-4 py-3">{column}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, index) => (
                <tr key={`${title}-${index}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${title}-${index}-${cellIndex}`} className="px-4 py-3 text-slate-700">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FinalReportView({ finalReport }: { finalReport?: SemesterFinalReport }) {
  return (
    <div className="space-y-5">
      <CompactReportTable
        title="Heatmap Kelas"
        columns={['Kelas', 'Jurusan', 'Siswa', 'Rapor', 'Nilai', 'Rata-rata', 'Di bawah KKTP']}
        rows={(finalReport?.classHeatmap ?? []).map((row) => [
          row.className,
          row.majorCode ?? '-',
          row.activeStudents,
          row.distributedReports,
          row.gradeRecords,
          row.averageScore === null ? '-' : row.averageScore.toFixed(1),
          row.belowKktpCount,
        ])}
      />
      <CompactReportTable
        title="Heatmap Jurusan"
        columns={['Jurusan', 'Siswa', 'Rapor', 'Nilai', 'Rata-rata', 'Di bawah KKTP']}
        rows={(finalReport?.majorHeatmap ?? []).map((row) => [
          row.majorCode,
          row.activeStudents,
          row.distributedReports,
          row.gradeRecords,
          row.averageScore === null ? '-' : row.averageScore.toFixed(1),
          row.belowKktpCount,
        ])}
      />
      <CompactReportTable
        title="Kepatuhan KKTP per Mapel"
        columns={['Mapel', 'KKTP', 'Provenance', 'Nilai', 'Di bawah KKTP', 'Tuntas']}
        rows={(finalReport?.subjectKktp ?? []).map((row) => [
          row.subject,
          row.kktp ?? '-',
          formatKktpProvenance(row.provenance),
          row.gradeRecords,
          row.belowKktpCount,
          row.passRate === null ? '-' : `${row.passRate.toFixed(1)}%`,
        ])}
      />
      <CompactReportTable
        title="Pemetaan CP/TP/ATP"
        columns={['Kelas', 'Mapel', 'CP', 'TP', 'ATP Terpetakan', 'Status']}
        rows={(finalReport?.curriculumMap ?? []).map((row) => [
          row.className,
          row.subject,
          row.cpStatus === 'terisi' ? 'Terisi' : 'Belum terisi',
          row.tpRefs.length ? row.tpRefs.join(', ') : '-',
          `${row.mappedAtpCount}/${row.atpCount}`,
          row.invalidReasonCodes.length ? `Belum terpetakan: ${row.invalidReasonCodes.join(', ')}` : 'Terpetakan',
        ])}
      />
    </div>
  );
}

function periodLabel(period: { academicYear: string; semester: number }) {
  return `Semester ${period.semester} ${period.academicYear}`;
}

export function HistoricalReportPanel({
  closure,
  onDownload,
  onPrint,
  pending,
}: {
  closure: SemesterClosureDetail;
  onDownload: (closure: SemesterClosureSummary | SemesterClosureDetail) => void;
  onPrint: () => void;
  pending: boolean;
}) {
  const snapshot = closure.snapshot;
  return (
    <section
      id="semester-closure-print"
      className="rounded-lg border border-slate-200 bg-white shadow-sm"
      aria-labelledby="historical-report-title"
    >
      <div className="flex flex-col gap-4 border-b border-slate-200 px-4 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Laporan Final Historis</p>
          <h2 id="historical-report-title" className="mt-1 text-xl font-bold text-slate-950">
            {periodLabel(snapshot.period)}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Laporan ini membaca snapshot resmi saat semester ditutup. Nilai hidup atau koreksi setelah close tidak mengubah isi tampilan ini.
          </p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onPrint}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            <Printer className="h-4 w-4" />
            Cetak
          </button>
          <button
            type="button"
            onClick={() => onDownload(closure)}
            disabled={pending}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
          >
            <Download className="h-4 w-4" />
            CSV
          </button>
        </div>
      </div>

      <dl className="grid gap-3 border-b border-slate-200 px-4 py-4 text-sm md:grid-cols-2 xl:grid-cols-4">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ditutup</dt>
          <dd className="mt-1 font-semibold text-slate-950">{formatSemesterDateTime(closure.closedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Aktor</dt>
          <dd className="mt-1 font-semibold text-slate-950">{closure.closedBy.fullName ?? '-'}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Hash Snapshot</dt>
          <dd className="mt-1 font-mono text-xs text-slate-700">{closure.readinessHash.slice(0, 16)}...</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Periode Berikutnya</dt>
          <dd className="mt-1 font-semibold text-slate-950">
            {snapshot.nextPeriod ? periodLabel(snapshot.nextPeriod) : 'Tidak ada'}
          </dd>
        </div>
      </dl>

      <div className="space-y-5 p-4">
        <MetricGrid readiness={snapshot} />
        <FindingTable title="Blocker pada Snapshot" tone="blocker" items={snapshot.blockers} />
        <FindingTable title="Warning pada Snapshot" tone="warning" items={snapshot.warnings} />
        <FinalReportView finalReport={snapshot.finalReport} />
      </div>
    </section>
  );
}

function FindingTable({ title, tone, items }: { title: string; tone: 'blocker' | 'warning'; items: ReadinessItem[] }) {
  const icon = tone === 'blocker'
    ? <XCircle className="h-4 w-4 text-red-600" />
    : <AlertTriangle className="h-4 w-4 text-amber-600" />;
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
        {icon}
        <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-6 text-sm text-slate-500">Tidak ada item pada kategori ini.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Kode</th>
                <th className="px-4 py-3">Pemilik</th>
                <th className="px-4 py-3 text-right">Jumlah</th>
                <th className="px-4 py-3">Tindakan</th>
                <th className="px-4 py-3">Ringkasan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => {
                const link = ACTION_LINKS[item.action] ?? null;
                return (
                  <tr key={`${item.code}-${item.owner}`}>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{item.code}</td>
                    <td className="px-4 py-3 text-slate-700">{item.owner}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-950">{item.count}</td>
                    <td className="px-4 py-3">
                      {link ? (
                        <a className="font-semibold text-emerald-800 underline-offset-4 hover:underline" href={link.href}>
                          {link.label}
                        </a>
                      ) : (
                        <span className="text-slate-500">Tinjau data</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{item.message}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function SemesterClosingClient({
  initialReadiness,
  initialClosures,
  canReadFinalReport,
  canCloseSemester,
  initialTab = 'readiness',
  unavailableReason = 'api-error',
  initialClosuresError = null,
  initialSelectedClosure = null,
}: {
  initialReadiness: SemesterReadiness | null;
  initialClosures: SemesterClosureSummary[];
  canReadFinalReport: boolean;
  canCloseSemester: boolean;
  initialTab?: Tab;
  unavailableReason?: SemesterClosingUnavailableReason;
  initialClosuresError?: string | null;
  initialSelectedClosure?: SemesterClosureDetail | null;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [readiness, setReadiness] = useState(initialReadiness);
  const [closures, setClosures] = useState(initialClosures);
  const [selectedClosure, setSelectedClosure] = useState<SemesterClosureDetail | null>(initialSelectedClosure);
  const [historyError, setHistoryError] = useState<string | null>(initialClosuresError);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [isPending, startTransition] = useTransition();
  const requestLockRef = useRef<string | null>(null);
  const latestHashRef = useRef(initialReadiness?.readinessHash ?? '');
  const cancelCloseRef = useRef<HTMLButtonElement | null>(null);
  const stale = isReadinessStale(readiness, latestHashRef.current, nowMs);
  const canClose = canSubmitSemesterClose({
    canCloseSemester,
    readiness,
    confirmation,
    stale,
    pending: isPending,
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const status = useMemo(() => {
    if (!readiness) return { label: 'Tidak tersedia', className: 'bg-slate-100 text-slate-700' };
    if (readiness.closedAt) return { label: 'Sudah ditutup', className: 'bg-slate-900 text-white' };
    if (readiness.ready) return { label: 'Siap ditutup', className: 'bg-emerald-100 text-emerald-900' };
    return { label: 'Belum siap', className: 'bg-red-100 text-red-900' };
  }, [readiness]);

  function refresh() {
    if (requestLockRef.current) return;
    requestLockRef.current = 'refresh';
    startTransition(async () => {
      try {
        const result = await refreshSemesterReadiness();
        if (result.success) {
          latestHashRef.current = result.data.readinessHash;
          setReadiness(result.data);
          setNowMs(Date.now());
          setMessage({ tone: 'success', text: 'Preview kesiapan diperbarui.' });
        } else {
          setMessage({ tone: 'error', text: result.error });
        }
      } finally {
        requestLockRef.current = null;
      }
    });
  }

  function reloadClosures() {
    if (requestLockRef.current) return;
    requestLockRef.current = 'closures';
    startTransition(async () => {
      try {
        const result = await listSemesterClosuresAction();
        if (result.success) {
          setClosures(result.data.data);
          setHistoryError(null);
          setMessage({ tone: 'success', text: 'Riwayat snapshot diperbarui.' });
        } else {
          setHistoryError(result.error);
          setMessage({ tone: 'error', text: result.error });
        }
      } finally {
        requestLockRef.current = null;
      }
    });
  }

  function closeSemester() {
    if (!readiness || confirmation !== 'TUTUP SEMESTER' || requestLockRef.current) return;
    if (isReadinessStale(readiness, latestHashRef.current, Date.now())) {
      setConfirmOpen(false);
      setMessage({ tone: 'error', text: 'Preview kesiapan sudah kedaluwarsa. Segarkan sebelum menutup semester.' });
      setNowMs(Date.now());
      return;
    }
    requestLockRef.current = 'close';
    startTransition(async () => {
      try {
        setConfirmOpen(false);
        const result = await closeSemesterAction({
          semesterId: readiness.period.semesterId,
          nextSemesterId: readiness.nextPeriod?.semesterId ?? null,
          readinessVersion: readiness.readinessVersion,
          readinessHash: readiness.readinessHash,
          idempotencyKey: buildSemesterCloseIdempotencyKey(readiness),
          confirmation: 'TUTUP SEMESTER',
        });
        if (result.success) {
          setSelectedClosure(result.data);
          setTab('history');
          setConfirmation('');
          setMessage({
            tone: 'success',
            text: `${periodLabel(result.data.snapshot.period)} berhasil ditutup. Laporan final historis siap dibuka, dicetak, dan diexport dari riwayat.`,
          });
          const [refreshed, history] = await Promise.all([
            refreshSemesterReadiness(),
            canReadFinalReport ? listSemesterClosuresAction() : Promise.resolve(null),
          ]);
          if (refreshed.success) {
            latestHashRef.current = refreshed.data.readinessHash;
            setReadiness(refreshed.data);
            setNowMs(Date.now());
          }
          if (history?.success) {
            setClosures(history.data.data);
            setHistoryError(null);
          } else if (history && !history.success) {
            const error = `Riwayat belum berhasil dimuat ulang. ${history.error}`;
            setHistoryError(error);
            setMessage({ tone: 'error', text: error });
          }
        } else {
          setMessage({ tone: 'error', text: result.error });
        }
      } finally {
        requestLockRef.current = null;
      }
    });
  }

  function openClosureReport(closure: SemesterClosureSummary) {
    if (requestLockRef.current) return;
    requestLockRef.current = `detail:${closure.id}`;
    startTransition(async () => {
      try {
        const result = await getSemesterClosureDetailAction(closure.id);
        if (!result.success) {
          setMessage({ tone: 'error', text: result.error });
          return;
        }
        setSelectedClosure(result.data);
        setMessage({
          tone: 'success',
          text: `${periodLabel(result.data.snapshot.period)} dibuka dari snapshot historis.`,
        });
      } finally {
        requestLockRef.current = null;
      }
    });
  }

  function printSelectedClosure() {
    if (!selectedClosure) return;
    window.print();
  }

  function downloadCsv(closure: SemesterClosureSummary | SemesterClosureDetail) {
    if (requestLockRef.current) return;
    requestLockRef.current = 'csv';
    startTransition(async () => {
      try {
        const result = await exportClosureCsvAction(closure.id);
        if (!result.success) {
          setMessage({ tone: 'error', text: result.error });
          return;
        }
        const blob = new Blob([result.data], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = closureCsvFilename({
          academicYear: 'snapshot' in closure
            ? closure.snapshot.period.academicYear
            : closure.semester.academicYear.code,
          semester: 'snapshot' in closure
            ? closure.snapshot.period.semester
            : closure.semester.number,
        });
        anchor.click();
        URL.revokeObjectURL(url);
      } finally {
        requestLockRef.current = null;
      }
    });
  }

  if (!readiness) {
    const unavailable = semesterClosingUnavailableCopy(unavailableReason);
    return (
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className={`rounded-lg border p-5 ${unavailable.className}`}>
          <h1 className="text-base font-semibold">{unavailable.title}</h1>
          <p className="mt-1 text-sm">{unavailable.description}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #semester-closure-print,
          #semester-closure-print * {
            visibility: visible !important;
          }
          #semester-closure-print {
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            border: 0 !important;
            box-shadow: none !important;
          }
          #semester-closure-print .no-print {
            display: none !important;
          }
          #semester-closure-print table {
            min-width: 0 !important;
          }
        }
      `}</style>
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {readiness.scope.kind === 'major' ? `Scope jurusan ${readiness.scope.majorCodes?.join(', ')}` : readiness.scope.kind === 'teacher' ? 'Scope guru' : 'Scope sekolah'}
            </span>
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">
            Penutupan Semester {readiness.period.semester} {readiness.period.academicYear}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Preview ini dihitung dari data akademik authoritative. Final close membuat snapshot immutable dan mengunci mutasi pada semester tersebut.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={refresh}
            disabled={isPending}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className="h-4 w-4" />
            Segarkan
          </button>
        </div>
      </div>

      {message && (
        <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
          message.tone === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
            : 'border-red-200 bg-red-50 text-red-950'
        }`}>
          {message.text}
        </div>
      )}

      <div className="mt-5 flex gap-2 overflow-x-auto border-b border-slate-200">
        {[
          ['readiness', 'Kesiapan', ShieldCheck],
          ['report', 'Capaian', FileClock],
          ['history', 'Riwayat', Archive],
        ].filter(([value]) => canReadFinalReport || value === 'readiness').map(([value, label, Icon]) => {
          const active = tab === value;
          const TabIcon = Icon as typeof ShieldCheck;
          return (
            <button
              key={value as string}
              type="button"
              onClick={() => setTab(value as Tab)}
              className={`inline-flex min-h-11 items-center gap-2 border-b-2 px-4 text-sm font-semibold ${
                active
                  ? 'border-emerald-700 text-emerald-800'
                  : 'border-transparent text-slate-600 hover:text-slate-950'
              }`}
            >
              <TabIcon className="h-4 w-4" />
              {label as string}
            </button>
          );
        })}
      </div>

      {tab === 'readiness' && (
        <div className="mt-5 space-y-5">
          <MetricGrid readiness={readiness} />
          <FindingTable title="Blocker Wajib Selesai" tone="blocker" items={readiness.blockers} />
          <FindingTable title="Warning dan Risiko Operasional" tone="warning" items={readiness.warnings} />
          {canCloseSemester ? (
            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="flex items-center gap-2 text-base font-semibold text-slate-950">
                    <Lock className="h-4 w-4" />
                    Final Close
                  </h2>
                  <p className="mt-1 max-w-3xl text-sm text-slate-600">
                    Hanya Kepala Sekolah dengan Appointment aktif yang dapat menutup semester. Super Admin tetap dapat membaca audit, tetapi tidak menjadi aktor close.
                  </p>
                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <div><dt className="text-slate-500">Preview</dt><dd className="font-semibold text-slate-900">{formatSemesterDateTime(readiness.generatedAt)}</dd></div>
                    <div><dt className="text-slate-500">Hash</dt><dd className="font-mono text-xs text-slate-700">{readiness.readinessHash.slice(0, 16)}...</dd></div>
                    <div><dt className="text-slate-500">Periode</dt><dd className="font-semibold text-slate-900">{readiness.period.startDate} - {readiness.period.endDate}</dd></div>
                    <div><dt className="text-slate-500">Berikutnya</dt><dd className="font-semibold text-slate-900">{readiness.nextPeriod ? `Semester ${readiness.nextPeriod.semester}` : 'Tidak ada'}</dd></div>
                  </dl>
                </div>
                <div className="w-full shrink-0 lg:w-80">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="semester-close-confirmation">
                    Ketik TUTUP SEMESTER
                  </label>
                  <input
                    id="semester-close-confirmation"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    className="mt-2 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                    placeholder="TUTUP SEMESTER"
                  />
                  <button
                    type="button"
                    onClick={() => setConfirmOpen(true)}
                    disabled={!canClose}
                    className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Tutup Semester Final
                  </button>
                </div>
              </div>
            </section>
          ) : canReadFinalReport ? (
            <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h2 className="flex items-center gap-2 text-base font-semibold text-slate-950">
                <Lock className="h-4 w-4" />
                Mode Tinjau
              </h2>
              <p className="mt-1 max-w-3xl text-sm text-slate-600">
                Anda dapat meninjau kesiapan, capaian, dan riwayat penutupan semester. Aksi final close hanya tersedia untuk Kepala Sekolah dengan Appointment aktif.
              </p>
            </section>
          ) : null}
        </div>
      )}

      {canReadFinalReport && tab === 'report' && (
        <div className="mt-5 space-y-5">
          <FinalReportView finalReport={readiness.finalReport} />
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold text-slate-950">Audit Capaian Akademik</h2>
            <p className="mt-1 text-sm text-slate-600">
              Laporan ini memakai preview live sebelum close. Setelah close, riwayat dan export membaca snapshot closure agar tidak berubah saat data hidup dikoreksi.
            </p>
          </section>
        </div>
      )}

      {canReadFinalReport && tab === 'history' && (
        <div id="history" className="mt-5 space-y-5">
          {selectedClosure ? (
            <HistoricalReportPanel
              closure={selectedClosure}
              onDownload={downloadCsv}
              onPrint={printSelectedClosure}
              pending={isPending}
            />
          ) : (
            <section className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
              Pilih laporan dari tabel riwayat untuk membuka snapshot final yang dapat dicetak.
            </section>
          )}
          <section className="rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-base font-semibold text-slate-950">Riwayat Snapshot</h2>
            </div>
            {historyError ? (
              <div className="space-y-3 px-4 py-6">
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950">
                  <p className="font-semibold">Riwayat belum dapat dimuat.</p>
                  <p className="mt-1">{historyError}</p>
                </div>
                <button
                  type="button"
                  onClick={reloadClosures}
                  disabled={isPending}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                >
                  <RefreshCw className="h-4 w-4" />
                  Coba lagi
                </button>
              </div>
            ) : closures.length === 0 ? (
              <div className="px-4 py-6 text-sm text-slate-500">Belum ada semester yang ditutup.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Periode</th>
                      <th className="px-4 py-3">Ditutup</th>
                      <th className="px-4 py-3">Aktor</th>
                      <th className="px-4 py-3">Hash</th>
                      <th className="px-4 py-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {closures.map((closure) => (
                      <tr key={closure.id}>
                        <td className="px-4 py-3 font-semibold text-slate-950">Semester {closure.semester.number} {closure.semester.academicYear.code}</td>
                        <td className="px-4 py-3 text-slate-600">{formatSemesterDateTime(closure.closedAt)}</td>
                        <td className="px-4 py-3 text-slate-600">{closure.closedBy.fullName ?? '-'}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{closure.readinessHash.slice(0, 16)}...</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openClosureReport(closure)}
                              disabled={isPending}
                              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                            >
                              <Eye className="h-4 w-4" />
                              Lihat laporan
                            </button>
                            <button
                              type="button"
                              onClick={() => downloadCsv(closure)}
                              disabled={isPending}
                              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                            >
                              <Download className="h-4 w-4" />
                              CSV
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent
          className="max-w-lg"
          onOpenAutoFocus={(event: Event) => {
            event.preventDefault();
            cancelCloseRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              Konfirmasi Final Close
            </DialogTitle>
            <DialogDescription>
              Penutupan semester akan menyimpan snapshot immutable dan mengunci perubahan akademik pada periode ini.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              ref={cancelCloseRef}
              type="button"
              onClick={() => setConfirmOpen(false)}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={closeSemester}
              disabled={!canClose || isPending}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Tutup Semester
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
