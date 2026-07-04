'use client';

// =============================================================================
// RaporPipelineKs — KS screen for rapor pipeline management (U1 / GAP-5).
// Flow: draft → checked → published → distributed.
// KS can: review rapor per class, approve/publish, distribute to siswa/ortu.
// =============================================================================

import { useEffect, useMemo, useState, useTransition } from 'react';
import {
  FileText, CheckCircle2, Send, Loader2, AlertTriangle, Search,
  FileCheck2, X, ChevronRight,
} from 'lucide-react';
import clsx from 'clsx';
import {
  fetchReportCardsByClass,
  transitionReportStatus,
  type ReportCardItem,
} from '../../actions';
import type { ClassRef } from '../guru-types';

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<ReportCardItem['status'], string> = {
  draft: 'Draft',
  checked: 'Diperiksa',
  published: 'Diterbitkan',
  distributed: 'Dibagikan',
};

const STATUS_BADGE: Record<ReportCardItem['status'], string> = {
  draft: 'bg-slate-100 text-slate-600',
  checked: 'bg-sky-100 text-sky-700',
  published: 'bg-amber-100 text-amber-700',
  distributed: 'bg-emerald-100 text-emerald-700',
};

interface ClassRaporSummary {
  classId: string;
  className: string;
  total: number;
  draft: number;
  checked: number;
  published: number;
  distributed: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface RaporPipelineKsProps {
  classes: ClassRef[];
  academicYear: string;
  semester: number;
}

export default function RaporPipelineKs({ classes, academicYear, semester }: RaporPipelineKsProps) {
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<ReportCardItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selClass, setSelClass] = useState<string>('all');
  const [selStatus, setSelStatus] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [detailReport, setDetailReport] = useState<ReportCardItem | null>(null);

  // Fetch all rapor for this TA/semester
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchReportCardsByClass(undefined, academicYear, semester).then((res) => {
      if (cancelled) return;
      if (res.success && res.data) {
        setReports(res.data.data);
        setError(null);
      } else {
        setError(res.error ?? 'Gagal memuat data rapor');
        setReports([]);
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [academicYear, semester]);

  // Build per-class summary
  const classSummaries = useMemo<ClassRaporSummary[]>(() => {
    const map = new Map<string, ClassRaporSummary>();
    // Initialize all classes (even those with no rapor yet)
    for (const c of classes) {
      map.set(c.id, {
        classId: c.id, className: c.name,
        total: 0, draft: 0, checked: 0, published: 0, distributed: 0,
      });
    }
    for (const r of reports) {
      const key = r.classId;
      const entry = map.get(key) ?? {
        classId: key, className: r.class?.name ?? '—',
        total: 0, draft: 0, checked: 0, published: 0, distributed: 0,
      };
      entry.total++;
      entry[r.status]++;
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => a.className.localeCompare(b.className));
  }, [reports, classes]);

  // Filtered reports for table view
  const filtered = useMemo(() => {
    return reports.filter((r) => {
      if (selClass !== 'all' && r.classId !== selClass) return false;
      if (selStatus !== 'all' && r.status !== selStatus) return false;
      if (search) {
        const q = search.toLowerCase();
        return r.student?.user?.fullName?.toLowerCase().includes(q) || r.student?.nis?.includes(q);
      }
      return true;
    });
  }, [reports, selClass, selStatus, search]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <FileText className="h-5 w-5 text-emerald-600" />
          <h2 className="text-lg font-bold text-[#0f2e25]">Pipeline Rapor Semester</h2>
        </div>
        <p className="text-[12.5px] text-[#6b8079]">
          Kelola penerbitan rapor: review dari wali kelas → setujui → terbitkan → bagikan ke siswa/ortu.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-600">
            TA {academicYear} · Semester {semester}
          </span>
          <span className="rounded-full bg-[#f4f7f5] px-3 py-1.5 text-[11px] font-bold text-[#355a4e]">
            {reports.length} rapor total
          </span>
        </div>
      </div>

      {/* Per-class summary cards */}
      {!loading && !error && classSummaries.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {classSummaries.map((cs) => (
            <div key={cs.classId} className="rounded-xl border border-[#e6efea] bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[14px] font-bold text-[#0f2e25]">{cs.className}</h3>
                <button
                  type="button"
                  onClick={() => setSelClass(cs.classId === selClass ? 'all' : cs.classId)}
                  className={clsx(
                    'rounded-lg px-2 py-1 text-[10px] font-bold transition',
                    selClass === cs.classId
                      ? 'bg-emerald-600 text-white'
                      : 'bg-[#f4f7f5] text-[#355a4e] hover:bg-emerald-50',
                  )}
                >
                  {selClass === cs.classId ? 'Dipilih' : 'Filter'}
                </button>
              </div>
              {cs.total === 0 ? (
                <p className="text-[11px] font-medium text-slate-400">Belum ada rapor dibuat</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {cs.draft > 0 && <StatusPill label="Draft" count={cs.draft} className="bg-slate-100 text-slate-600" />}
                  {cs.checked > 0 && <StatusPill label="Diperiksa" count={cs.checked} className="bg-sky-100 text-sky-700" />}
                  {cs.published > 0 && <StatusPill label="Diterbitkan" count={cs.published} className="bg-amber-100 text-amber-700" />}
                  {cs.distributed > 0 && <StatusPill label="Dibagikan" count={cs.distributed} className="bg-emerald-100 text-emerald-700" />}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={selClass}
          onChange={(e) => setSelClass(e.target.value)}
          className="rounded-xl border border-[#e6efea] bg-white px-3 py-2 text-[12.5px] font-bold text-[#355a4e] shadow-sm outline-none"
        >
          <option value="all">Semua Kelas</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select
          value={selStatus}
          onChange={(e) => setSelStatus(e.target.value)}
          className="rounded-xl border border-[#e6efea] bg-white px-3 py-2 text-[12.5px] font-bold text-[#355a4e] shadow-sm outline-none"
        >
          <option value="all">Semua Status</option>
          <option value="draft">Draft</option>
          <option value="checked">Diperiksa</option>
          <option value="published">Diterbitkan</option>
          <option value="distributed">Dibagikan</option>
        </select>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9bb0a8]" />
          <input
            type="text"
            placeholder="Cari nama/NIS siswa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-[#e6efea] bg-white py-2 pl-9 pr-3 text-[12.5px] font-medium text-[#355a4e] shadow-sm outline-none focus:border-emerald-300"
          />
        </div>
      </div>

      {/* Loading / error / empty states */}
      {loading && (
        <div className="flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-6 text-[12.5px] font-semibold text-sky-700">
          <Loader2 className="h-4 w-4 animate-spin" /> Memuat data rapor...
        </div>
      )}

      {error && !loading && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-6 text-[12.5px] font-semibold text-rose-700">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-[#e6efea] bg-white px-4 py-10 text-center">
          <FileText className="mx-auto mb-2 h-8 w-8 text-[#c5d5ce]" />
          <p className="text-[13px] font-bold text-[#355a4e]">Belum ada rapor</p>
          <p className="mt-1 text-[11.5px] text-[#6b8079]">
            Rapor belum dibuat untuk filter ini. Wali kelas perlu mengompilasi rapor terlebih dahulu.
          </p>
        </div>
      )}

      {/* Rapor table */}
      {!loading && !error && filtered.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-[#e6efea] bg-white shadow-sm">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-[#e6efea] bg-[#f9fbfa] text-left text-[10px] font-bold uppercase tracking-wide text-[#9bb0a8]">
                <th className="py-3 pl-4 pr-2">Siswa</th>
                <th className="px-2 text-center">Kelas</th>
                <th className="px-2 text-center">Status</th>
                <th className="px-2 text-center">Catatan</th>
                <th className="px-2 text-right">Aksi</th>
                <th className="pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <RaporRow key={r.id} report={r} onDetail={() => setDetailReport(r)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail modal */}
      {detailReport && (
        <RaporDetailModal
          report={detailReport}
          onClose={() => setDetailReport(null)}
        />
      )}
    </div>
  );
}

// ── Rapor Row ─────────────────────────────────────────────────────────────────

function RaporRow({ report, onDetail }: { report: ReportCardItem; onDetail: () => void }) {
  const [pending, startTransition] = useTransition();

  const handleAction = (action: 'check' | 'publish' | 'distribute') => {
    startTransition(async () => {
      const res = await transitionReportStatus(report.id, action);
      if (res.success) {
        // Force reload by navigating detail and back
        window.location.reload();
      }
    });
  };

  return (
    <tr className="border-b border-[#f0f5f2] hover:bg-[#f9fbfa]">
      <td className="py-3 pl-4 pr-2">
        <div className="font-semibold text-[#0f2e25]">{report.student?.user?.fullName ?? '—'}</div>
        <div className="text-[10px] text-[#9bb0a8]">NIS: {report.student?.nis ?? '—'}</div>
      </td>
      <td className="px-2 text-center font-medium text-[#355a4e]">{report.class?.name ?? '—'}</td>
      <td className="px-2 text-center">
        <span className={clsx('rounded-full px-2.5 py-1 text-[10px] font-bold', STATUS_BADGE[report.status])}>
          {STATUS_LABEL[report.status]}
        </span>
      </td>
      <td className="px-2 text-center text-[11px] text-[#6b8079]">
        {report.notes ? 'Ada' : '—'}
      </td>
      <td className="px-2 text-right">
        <div className="flex justify-end gap-1.5">
          {/* Check: draft → checked (KS reviews and checks) */}
          {report.status === 'draft' && (
            <button
              type="button"
              disabled={pending}
              onClick={() => handleAction('check')}
              className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-2.5 py-1.5 text-[10px] font-bold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
              Periksa
            </button>
          )}
          {/* Publish: checked → published */}
          {report.status === 'checked' && (
            <button
              type="button"
              disabled={pending}
              onClick={() => handleAction('publish')}
              className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1.5 text-[10px] font-bold text-white shadow-sm transition hover:bg-amber-700 disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileCheck2 className="h-3 w-3" />}
              Terbitkan
            </button>
          )}
          {/* Distribute: published → distributed */}
          {report.status === 'published' && (
            <button
              type="button"
              disabled={pending}
              onClick={() => handleAction('distribute')}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[10px] font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              Bagikan
            </button>
          )}
          {report.status === 'distributed' && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600">
              <CheckCircle2 className="h-3 w-3" /> Selesai
            </span>
          )}
        </div>
      </td>
      <td className="pr-4">
        <button
          type="button"
          onClick={onDetail}
          className="rounded-lg p-1.5 text-[#9bb0a8] transition hover:bg-[#f4f7f5] hover:text-[#355a4e]"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
}

// ── Rapor Detail Modal ────────────────────────────────────────────────────────

function RaporDetailModal({ report, onClose }: { report: ReportCardItem; onClose: () => void }) {
  const grades = report.grades as Array<{ subject: string; count: number; average: number; byType: Record<string, number> }> | null;
  const att = report.attendance;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#0f2e25]">Rapor — {report.student?.user?.fullName}</h2>
            <p className="text-[12px] text-[#6b8079]">
              {report.class?.name} · TA {report.academicYear} · Semester {report.semester}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-[#9bb0a8] hover:bg-[#f4f7f5]">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Status badge */}
        <div className="mb-4">
          <span className={clsx('rounded-full px-3 py-1.5 text-[11px] font-bold', STATUS_BADGE[report.status])}>
            {STATUS_LABEL[report.status]}
          </span>
        </div>

        {/* Grades snapshot */}
        <div className="mb-4">
          <h3 className="mb-2 text-[13px] font-bold text-[#0f2e25]">Nilai per Mapel</h3>
          {grades && grades.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-[#e6efea]">
              <table className="w-full text-[11.5px]">
                <thead>
                  <tr className="border-b border-[#e6efea] bg-[#f9fbfa] text-left text-[9px] font-bold uppercase text-[#9bb0a8]">
                    <th className="py-2 pl-3 pr-2">Mapel</th>
                    <th className="px-2 text-center">Jumlah</th>
                    <th className="px-2 text-right">Rata-rata</th>
                    <th className="pr-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {grades.map((g, i) => (
                    <tr key={i} className="border-b border-[#f0f5f2]">
                      <td className="py-2 pl-3 pr-2 font-semibold text-[#355a4e]">{g.subject}</td>
                      <td className="px-2 text-center text-[#6b8079]">{g.count}</td>
                      <td className="px-2 text-right font-bold tabular-nums text-[#0f2e25]">{g.average}</td>
                      <td className="pr-3"></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-[#e6efea] px-3 py-3 text-center text-[11px] text-slate-400">
              Belum ada nilai pada periode ini
            </p>
          )}
        </div>

        {/* Attendance summary */}
        <div className="mb-4">
          <h3 className="mb-2 text-[13px] font-bold text-[#0f2e25]">Ketidakhadiran</h3>
          <div className="grid grid-cols-4 gap-2">
            <AttStat label="Hadir" value={att?.hadir ?? 0} className="text-emerald-600" />
            <AttStat label="Izin" value={att?.izin ?? 0} className="text-sky-600" />
            <AttStat label="Sakit" value={att?.sakit ?? 0} className="text-amber-600" />
            <AttStat label="Alpha" value={att?.alpha ?? 0} className="text-rose-600" />
          </div>
        </div>

        {/* Catatan wali kelas */}
        {report.notes && (
          <div className="mb-4">
            <h3 className="mb-1.5 text-[13px] font-bold text-[#0f2e25]">Catatan Wali Kelas</h3>
            <div className="rounded-lg border border-[#e6efea] bg-[#f9fbfa] px-3 py-2.5 text-[12px] leading-relaxed text-[#355a4e]">
              {report.notes}
            </div>
          </div>
        )}

        {/* Timestamps */}
        <div className="flex flex-wrap gap-2 text-[10px] font-medium text-[#9bb0a8]">
          {report.generatedAt && <span>Dibuat: {new Date(report.generatedAt).toLocaleDateString('id-ID')}</span>}
          {report.checkedAt && <span>· Diperiksa: {new Date(report.checkedAt).toLocaleDateString('id-ID')}</span>}
          {report.publishedAt && <span>· Diterbitkan: {new Date(report.publishedAt).toLocaleDateString('id-ID')}</span>}
          {report.distributedAt && <span>· Dibagikan: {new Date(report.distributedAt).toLocaleDateString('id-ID')}</span>}
        </div>
      </div>
    </div>
  );
}

// ── Small UI helpers ──────────────────────────────────────────────────────────

function StatusPill({ label, count, className }: { label: string; count: number; className: string }) {
  return (
    <span className={clsx('rounded-full px-2 py-0.5 text-[9px] font-bold', className)}>
      {count} {label}
    </span>
  );
}

function AttStat({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className="rounded-lg bg-[#f9fbfa] px-2 py-2 text-center">
      <div className="text-[9px] font-semibold uppercase text-[#9bb0a8]">{label}</div>
      <div className={clsx('text-lg font-extrabold tabular-nums', className)}>{value}</div>
    </div>
  );
}
