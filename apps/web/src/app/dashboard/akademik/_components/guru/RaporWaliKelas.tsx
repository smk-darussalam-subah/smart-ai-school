'use client';

// =============================================================================
// RaporWaliKelas — Wali Kelas screen for rapor compilation (U1 / GAP-5).
// Wali kelas can: generate rapor per class, edit catatan, submit to KS.
// =============================================================================

import { useEffect, useMemo, useState, useTransition } from 'react';
import {
  FileText, Loader2, AlertTriangle, Search, Send, Save,
  CheckCircle2, Info, RefreshCw, X,
} from 'lucide-react';
import clsx from 'clsx';
import {
  fetchReportCardsByClass,
  generateReportCards,
  transitionReportStatus,
  updateReportNotes,
  type ReportCardItem,
} from '../../actions';
import type { ClassRef } from '../guru-types';

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

interface RaporWaliKelasProps {
  /** Classes where this guru is the wali kelas (homeroom teacher). */
  waliClasses: ClassRef[];
  academicYear: string;
  semester: number;
}

export default function RaporWaliKelas({ waliClasses, academicYear, semester }: RaporWaliKelasProps) {
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<ReportCardItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selClass, setSelClass] = useState<string>(waliClasses[0]?.id ?? '');
  const [search, setSearch] = useState('');
  const [editingNotes, setEditingNotes] = useState<ReportCardItem | null>(null);
  const [genPending, startGenTransition] = useTransition();

  // Fetch rapor for selected class
  const reload = (classId: string) => {
    if (!classId) return;
    setLoading(true);
    fetchReportCardsByClass(classId, academicYear, semester).then((res) => {
      if (res.success && res.data) {
        setReports(res.data.data);
        setError(null);
      } else {
        setError(res.error ?? 'Gagal memuat data rapor');
        setReports([]);
      }
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    reload(selClass);
    // eslint-disable-next-line
  }, [selClass, academicYear, semester]);

  const handleGenerate = () => {
    if (!selClass) return;
    startGenTransition(async () => {
      const res = await generateReportCards(selClass, academicYear, semester);
      if (res.success) {
        reload(selClass);
      } else {
        setError(res.error ?? 'Gagal membuat rapor');
      }
    });
  };

  const handleCheck = (reportId: string) => {
    startGenTransition(async () => {
      const res = await transitionReportStatus(reportId, 'check');
      if (res.success) {
        reload(selClass);
      }
    });
  };

  const filtered = useMemo(() => {
    if (!search) return reports;
    const q = search.toLowerCase();
    return reports.filter(
      (r) => r.student?.user?.fullName?.toLowerCase().includes(q) || r.student?.nis?.includes(q),
    );
  }, [reports, search]);

  if (waliClasses.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#e6efea] bg-white px-4 py-10 text-center">
        <FileText className="mx-auto mb-2 h-8 w-8 text-[#c5d5ce]" />
        <p className="text-[13px] font-bold text-[#355a4e]">Anda bukan wali kelas</p>
        <p className="mt-1 text-[11.5px] text-[#6b8079]">
          Modul kompilasi rapor hanya untuk guru yang ditugaskan sebagai wali kelas.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <FileText className="h-5 w-5 text-emerald-600" />
          <h2 className="text-lg font-bold text-[#0f2e25]">Kompilasi Rapor Wali Kelas</h2>
        </div>
        <p className="text-[12.5px] text-[#6b8079]">
          Buat rapor untuk siswa kelas Anda, edit catatan wali kelas, lalu kirim ke KS untuk ditinjau.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-600">
            TA {academicYear} · Semester {semester}
          </span>
        </div>
      </div>

      {/* Class selector + Generate button */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={selClass}
          onChange={(e) => setSelClass(e.target.value)}
          className="rounded-xl border border-[#e6efea] bg-white px-3 py-2 text-[12.5px] font-bold text-[#355a4e] shadow-sm outline-none"
        >
          {waliClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button
          type="button"
          disabled={genPending}
          onClick={handleGenerate}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-[12.5px] font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {genPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Kompilasi Rapor
        </button>
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

      {/* Generate info banner */}
      <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-[11.5px] font-medium text-sky-700">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Tombol <b>Kompilasi Rapor</b> akan membuat rapor draft untuk semua siswa aktif di kelas ini.
          Siswa yang sudah punya rapor akan dilewati (idempoten).
        </span>
      </div>

      {/* States */}
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
            Klik <b>Kompilasi Rapor</b> untuk membuat rapor draft untuk kelas ini.
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
                <th className="px-2 text-center">Status</th>
                <th className="px-2 text-center">Catatan</th>
                <th className="px-2 text-right">Aksi</th>
                <th className="pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <WaliRaporRow
                  key={r.id}
                  report={r}
                  onEditNotes={() => setEditingNotes(r)}
                  onCheck={() => handleCheck(r.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Notes editor modal */}
      {editingNotes && (
        <NotesEditorModal
          report={editingNotes}
          academicYear={academicYear}
          semester={semester}
          onClose={() => setEditingNotes(null)}
          onSaved={() => { reload(selClass); setEditingNotes(null); }}
        />
      )}
    </div>
  );
}

// ── Wali Rapor Row ────────────────────────────────────────────────────────────

function WaliRaporRow({
  report,
  onEditNotes,
  onCheck,
}: {
  report: ReportCardItem;
  onEditNotes: () => void;
  onCheck: () => void;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <tr className="border-b border-[#f0f5f2] hover:bg-[#f9fbfa]">
      <td className="py-3 pl-4 pr-2">
        <div className="font-semibold text-[#0f2e25]">{report.student?.user?.fullName ?? '—'}</div>
        <div className="text-[10px] text-[#9bb0a8]">NIS: {report.student?.nis ?? '—'}</div>
      </td>
      <td className="px-2 text-center">
        <span className={clsx('rounded-full px-2.5 py-1 text-[10px] font-bold', STATUS_BADGE[report.status])}>
          {STATUS_LABEL[report.status]}
        </span>
      </td>
      <td className="px-2 text-center text-[11px] text-[#6b8079]">
        {report.notes ? <span className="text-emerald-600 font-semibold">Ada</span> : '—'}
      </td>
      <td className="px-2 text-right">
        <div className="flex justify-end gap-1.5">
          {/* Edit notes: only in draft status */}
          {report.status === 'draft' && (
            <button
              type="button"
              onClick={onEditNotes}
              className="inline-flex items-center gap-1 rounded-lg border border-[#e6efea] bg-white px-2.5 py-1.5 text-[10px] font-bold text-[#355a4e] shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50"
            >
              <Save className="h-3 w-3" /> Catatan
            </button>
          )}
          {/* Submit to KS: draft → checked */}
          {report.status === 'draft' && (
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(onCheck)}
              className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-2.5 py-1.5 text-[10px] font-bold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              Kirim ke KS
            </button>
          )}
          {report.status === 'checked' && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-600">
              <CheckCircle2 className="h-3 w-3" /> Menunggu KS
            </span>
          )}
          {report.status === 'published' && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600">
              <CheckCircle2 className="h-3 w-3" /> Diterbitkan KS
            </span>
          )}
          {report.status === 'distributed' && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600">
              <CheckCircle2 className="h-3 w-3" /> Dibagikan
            </span>
          )}
        </div>
      </td>
      <td className="pr-4" />
    </tr>
  );
}

// ── Notes Editor Modal ────────────────────────────────────────────────────────

function NotesEditorModal({
  report,
  onClose,
  onSaved,
}: {
  report: ReportCardItem;
  academicYear: string;
  semester: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [notes, setNotes] = useState(report.notes ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const res = await updateReportNotes(report.id, notes.trim() || null);
    setSaving(false);
    if (res.success) {
      onSaved();
    } else {
      alert(res.error ?? 'Gagal menyimpan catatan');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#0f2e25]">Catatan Wali Kelas</h2>
            <p className="text-[12px] text-[#6b8079]">
              {report.student?.user?.fullName} · {report.class?.name}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-[#9bb0a8] hover:bg-[#f4f7f5]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={5}
          maxLength={5000}
          placeholder="Tulis catatan perkembangan siswa untuk rapor..."
          className="w-full rounded-xl border border-[#e6efea] bg-white px-3 py-2.5 text-[12.5px] leading-relaxed text-[#355a4e] outline-none focus:border-emerald-300"
        />
        <p className="mt-1 text-right text-[10px] text-[#9bb0a8]">{notes.length} / 5000 karakter</p>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[#e6efea] bg-white px-4 py-2 text-[12.5px] font-bold text-[#355a4e] shadow-sm transition hover:bg-[#f4f7f5]"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-[12.5px] font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Simpan
          </button>
        </div>
      </div>
    </div>
  );
}
