'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Target,
  Users,
  Download,
  Plus,
  GitBranch,
  ArrowRight,
  Database,
  Printer,
} from 'lucide-react';
import QuestionBankEditor from './QuestionBankEditor';
import clsx from 'clsx';
import type { GradeItem } from '@/lib/api';
import { updateGrade } from '../actions';
import {
  naOf as computeNa,
  gradeStatus,
  type StudentGradeComponents,
  type GradeNaStatus,
} from '@/lib/academic';
import {
  gradeCsvCell,
  meanGradeScores,
  subjectThreshold,
  gradeRecordScore,
  type AcknowledgedGradeEdit,
  type GradeReadSnapshot,
} from '@/lib/grade-consumers';
import type { SummaryReadState, TeacherThreshold } from '@/lib/teacher-summary';

type Mode = 'rekap' | 'per-tp' | 'rubrik';
const COLS = [
  { key: 'uh', label: 'UH', grp: 'Formatif' },
  { key: 'praktik', label: 'Praktik', grp: 'Formatif' },
  { key: 'sikap', label: 'Sikap', grp: 'Formatif' },
  { key: 'uts', label: 'UTS', grp: 'Sumatif' },
  { key: 'uas', label: 'UAS', grp: 'Sumatif' },
] as const;

interface CellVal {
  id: string;
  score: number;
}

// Warna sel per status ketuntasan (ambang via gradeStatus = identik perilaku lama).
const CELL_TONE: Record<GradeNaStatus, string> = {
  tuntas: 'bg-emerald-50 text-emerald-700',
  mid: 'bg-orange-50 text-orange-700',
  remedial: 'bg-rose-50 text-rose-600',
};
function cellColor(v: number, kktp: number | null) {
  return kktp === null ? 'bg-slate-50 text-slate-700' : CELL_TONE[gradeStatus(v, kktp)];
}

interface Props {
  grades: GradeItem[];
  className: string;
  subject: string;
  onInputNilai: () => void;
  academicYear?: string;
  semester?: number;
  thresholds?: TeacherThreshold[];
  thresholdState?: SummaryReadState;
  dataState?: SummaryReadState;
  /** Unfiltered server read identity; filtering or unrelated UI renders are not new reads. */
  sourceSnapshot?: readonly GradeItem[];
}
export default function GradebookPenilaian(props: Props) {
  return (
    <PeriodGradebook
      key={`${props.academicYear}|${props.semester}|${props.className}|${props.subject}`}
      {...props}
    />
  );
}
function PeriodGradebook({
  grades,
  className,
  subject,
  onInputNilai,
  academicYear,
  semester,
  thresholds = [],
  thresholdState = 'unavailable',
  dataState = 'unavailable',
  sourceSnapshot,
}: Props) {
  const [mode, setMode] = useState<Mode>('rekap');
  const [remedialOnly, setRemedialOnly] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, AcknowledgedGradeEdit>>({});
  const source = sourceSnapshot ?? grades;
  const [read, setRead] = useState<GradeReadSnapshot>(() => ({ rows: source, state: dataState }));
  let currentRead = read;
  if (read.rows !== source || read.state !== dataState) {
    // Only a new authoritative read/state transition retires acknowledgements.
    // Preserve the active input draft: no remount, editing reset or render-time I/O.
    currentRead = { rows: source, state: dataState };
    setRead(currentRead);
    setOverrides({});
  }
  const [editing, setEditing] = useState<string | null>(null); // exact grade record id
  const [saving, setSaving] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const pending = useRef(new Set<string>()),
    mounted = useRef(true);
  const cancelled = useRef<string | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [pgBankOpen, setPgBankOpen] = useState(false);
  const kktp = thresholdState === 'ready' ? subjectThreshold(thresholds, subject) : null;

  const base = useMemo(() => {
    const byStudent = new Map<
      string,
      { name: string; nis: string; cells: Map<string, CellVal[]> }
    >();
    for (const g of dataState === 'ready' ? grades : []) {
      if (
        g.assignment.subject !== subject ||
        (academicYear &&
          (g.academicYear !== academicYear || g.assignment.academicYear !== academicYear)) ||
        (semester && g.semester !== semester) ||
        g.score.trim() === '' ||
        !Number.isFinite(Number(g.score)) ||
        Number(g.score) < 0 ||
        Number(g.score) > 100
      )
        continue;
      const sid = g.studentId;
      let row = byStudent.get(sid);
      if (!row) {
        row = { name: g.student.user.fullName, nis: g.student.nis, cells: new Map() };
        byStudent.set(sid, row);
      }
      const records = row.cells.get(g.type) ?? [];
      records.push({ id: g.id, score: Number(g.score) });
      row.cells.set(g.type, records);
    }
    for (const row of byStudent.values())
      for (const records of row.cells.values())
        records.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return [...byStudent.entries()]
      .map(([sid, r]) => ({ sid, ...r }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [grades, dataState, subject, academicYear, semester]);

  const scoreFor = (cell: CellVal) => gradeRecordScore(cell.score, currentRead, overrides[cell.id]);
  const scoreOf = (records: CellVal[] | undefined) =>
    meanGradeScores((records ?? []).map(scoreFor));
  // NA RESMI berbobot NA_WEIGHTS (lib/academic, keputusan Kang 2026-06-20). Komponen
  // yg ada dipetakan dari sel (menghormati override edit) lalu dihitung via computeNa.
  const naOf = (cells: Map<string, CellVal[]>): number | null => {
    const comp: StudentGradeComponents = {};
    for (const c of COLS) {
      const s = scoreOf(cells.get(c.key));
      if (s !== null) comp[c.key] = s;
    }
    return computeNa(comp);
  };

  const rows = base.map((r) => ({ ...r, na: naOf(r.cells) }));
  const remedialCount =
    kktp === null ? null : rows.filter((r) => r.na !== null && r.na < kktp).length;
  const shown =
    remedialOnly && kktp !== null ? rows.filter((r) => r.na !== null && r.na < kktp) : rows;
  const statusOf = (na: number | null) =>
    na === null || kktp === null ? 'Belum tersedia' : na >= kktp ? 'Tuntas' : 'Remedial';

  const avgCol = (key: string) => {
    const vals = rows.map((r) => scoreOf(r.cells.get(key))).filter((v): v is number => v !== null);
    return vals.length
      ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
      : null;
  };
  const avgNa = (() => {
    const v = rows.map((r) => r.na).filter((x): x is number => x !== null);
    return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
  })();

  const commit = async (cell: CellVal, raw: string) => {
    if (dataState !== 'ready' || cancelled.current === cell.id) return;
    const n = Number(raw);
    if (pending.current.has(cell.id)) return;
    if (!raw.trim() || !Number.isFinite(n) || n < 0 || n > 100) {
      setSaveError('Masukkan nilai 0–100. Catatan sebelumnya tidak berubah.');
      return;
    }
    setEditing(null);
    if (n === scoreFor(cell)) return;
    pending.current.add(cell.id);
    setSaving(cell.id);
    setSaveError(null);
    try {
      const result = await updateGrade(cell.id, { score: n });
      if (!mounted.current) return;
      if (result.success)
        setOverrides((previous) => ({
          ...previous,
          [cell.id]: { score: n, snapshot: currentRead },
        }));
      else setSaveError('Nilai belum tersimpan. Catatan sebelumnya tetap digunakan; coba lagi.');
    } catch {
      if (mounted.current)
        setSaveError('Nilai belum tersimpan. Catatan sebelumnya tetap digunakan; coba lagi.');
    } finally {
      pending.current.delete(cell.id);
      if (mounted.current) setSaving(null);
    }
  };

  const exportCsv = () => {
    if (dataState !== 'ready') return;
    const values: (string | number | null)[][] = [
      [
        'Rekap Nilai',
        'Tahun ajaran',
        academicYear ?? '',
        'Semester',
        semester ?? '',
        'Kelas',
        className,
        'Mapel',
        subject,
      ],
      ['Siswa', 'NIS', ...COLS.map((c) => c.label), 'NA', 'KKTP', 'Status'],
      ...rows.map((r) => [
        r.name,
        r.nis,
        ...COLS.map((c) => scoreOf(r.cells.get(c.key))),
        r.na,
        kktp,
        statusOf(r.na),
      ]),
    ];
    const blob = new Blob(
      ['\uFEFF' + values.map((row) => row.map(gradeCsvCell).join(',')).join('\r\n')],
      { type: 'text/csv;charset=utf-8' },
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `nilai-${className}-${subject}.csv`.replace(/\s+/g, '_');
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const recordEditor = (cell: CellVal, label: string) =>
    editing === cell.id ? (
      <input
        autoFocus
        aria-label={label}
        type="number"
        min={0}
        max={100}
        step="any"
        defaultValue={scoreFor(cell)}
        onBlur={(e) => void commit(cell, e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void commit(cell, e.currentTarget.value);
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            cancelled.current = cell.id;
            setEditing(null);
          }
        }}
        className="min-h-11 w-20 rounded-md border border-emerald-400 px-1 text-center text-base font-bold outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
      />
    ) : (
      <button
        type="button"
        disabled={saving !== null}
        onClick={() => {
          cancelled.current = null;
          setEditing(cell.id);
          setSaveError(null);
        }}
        aria-label={label}
        title="Edit catatan nilai ini"
        className={clsx(
          'min-h-11 min-w-11 rounded-md px-2 py-1 text-[12.5px] font-extrabold disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-emerald-600',
          cellColor(scoreFor(cell), kktp),
        )}
      >
        {saving === cell.id ? 'Menyimpan...' : scoreFor(cell)}
      </button>
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl bg-[#f4f7f5] p-1">
          {(
            [
              ['rekap', 'Rekap Nilai'],
              ['per-tp', 'Per-TP'],
              ['rubrik', 'Rubrik / KKTP'],
            ] as [Mode, string][]
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setMode(k)}
              className={clsx(
                'rounded-lg px-3 py-1.5 text-[12.5px] font-bold',
                mode === k ? 'bg-white text-emerald-700 shadow-sm' : 'text-[#6b8079]',
              )}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-amber-400 px-2.5 py-1.5 text-[11px] font-extrabold text-amber-700">
            <Target className="h-3.5 w-3.5" />
            KKTP {kktp ?? 'belum tersedia'}
          </span>
          <button
            type="button"
            disabled={kktp === null || dataState !== 'ready'}
            onClick={() => setRemedialOnly((v) => !v)}
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12.5px] font-bold',
              remedialOnly
                ? 'border-rose-300 bg-rose-50 text-rose-600'
                : 'border-[#e6efea] bg-white text-[#355a4e] hover:bg-[#f4f7f5]',
            )}
          >
            <Users className="h-4 w-4" />
            Remedial ({remedialCount ?? '—'})
          </button>
          <button
            type="button"
            disabled={dataState !== 'ready'}
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#e6efea] bg-white px-3 py-2 text-[12.5px] font-bold text-[#355a4e] hover:bg-[#f4f7f5] disabled:opacity-50"
          >
            <Download className="h-4 w-4 text-emerald-600" />
            Ekspor
          </button>
          <button
            type="button"
            onClick={onInputNilai}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-[12.5px] font-bold text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            Input Nilai
          </button>
          <button
            type="button"
            onClick={() => setPgBankOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#e6efea] bg-white px-3 py-2 text-[12.5px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]"
          >
            <Database className="h-4 w-4 text-emerald-600" />
            Bank Soal
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#e6efea] bg-white px-3 py-2 text-[12.5px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]"
          >
            <Printer className="h-4 w-4 text-emerald-600" />
            Cetak
          </button>
        </div>
      </div>

      {dataState !== 'ready' && (
        <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          {dataState === 'denied'
            ? 'Anda tidak memiliki izin melihat nilai.'
            : 'Nilai belum dapat dimuat. Coba muat ulang halaman.'}
        </p>
      )}
      {dataState === 'ready' && kktp === null && (
        <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Batas ketuntasan mapel pada periode ini belum tersedia. Nilai tetap ditampilkan, tetapi
          status tuntas dan remedial belum dapat ditentukan.
        </p>
      )}
      {saveError && (
        <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
          {saveError}
        </p>
      )}

      {mode !== 'rekap' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-700">
          {mode === 'per-tp'
            ? 'Penilaian per Tujuan Pembelajaran (TP) menyusul saat modul ATP/Pembelajaran aktif.'
            : 'Rubrik & KKTP per-TP menyusul saat modul ATP/Pembelajaran aktif.'}{' '}
          Saat ini tampil Rekap Nilai.
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-[#e6efea] bg-white shadow-sm">
        <table className="w-full border-separate" style={{ borderSpacing: 0 }}>
          <thead>
            <tr className="bg-[#f3f8f5] text-[11px] font-extrabold uppercase tracking-wide text-emerald-800">
              <th className="sticky left-0 z-10 bg-[#f3f8f5] px-3 py-2 text-left">Siswa</th>
              <th colSpan={3} className="border-b border-[#e6efea] px-2 py-2">
                Formatif
              </th>
              <th colSpan={2} className="border-b border-[#e6efea] px-2 py-2">
                Sumatif
              </th>
              <th className="border-b border-[#e6efea] px-2 py-2">Akhir</th>
              <th className="border-b border-[#e6efea] px-2 py-2">KKTP</th>
            </tr>
            <tr className="text-[11px] font-bold text-[#355a4e]">
              <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left">&nbsp;</th>
              {COLS.map((c) => (
                <th key={c.key} className="border-b border-[#e6efea] px-2 py-2">
                  {c.label}
                </th>
              ))}
              <th className="border-b border-[#e6efea] px-2 py-2">NA</th>
              <th className="border-b border-[#e6efea] px-2 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-10 text-center text-[12.5px] font-medium text-[#526b62]"
                >
                  {dataState !== 'ready'
                    ? 'Data nilai belum tersedia.'
                    : remedialOnly
                      ? 'Tidak ada siswa remedial.'
                      : 'Belum ada nilai untuk kelas/mapel ini.'}
                </td>
              </tr>
            ) : (
              shown.map((r) => (
                <tr key={r.sid} className="border-b border-[#f0f4f2]">
                  <td className="sticky left-0 z-10 bg-white px-3 py-2 text-left text-[12.5px]">
                    <b className="text-[#0f2e25]">{r.name}</b>
                    <span className="block text-[10.5px] text-[#9bb0a8]">NIS {r.nis}</span>
                  </td>
                  {COLS.map((c) => {
                    const records = r.cells.get(c.key);
                    const v = scoreOf(records);
                    return (
                      <td key={c.key} className="px-2 py-2 text-center">
                        {records?.length === 1 ? (
                          recordEditor(records[0]!, `${c.label} ${r.name}`)
                        ) : records?.length ? (
                          <details className="min-w-28 rounded-lg border border-[#e6efea] bg-[#f9fbfa]">
                            <summary className="min-h-11 cursor-pointer px-2 py-1 text-[12px] font-bold text-[#355a4e] focus-visible:ring-2 focus-visible:ring-emerald-600">
                              <span className="block">
                                {v === null ? '—' : Math.round(v * 10) / 10}
                              </span>
                              <span className="block text-[10px] font-medium">
                                Rata-rata {records.length} catatan
                              </span>
                            </summary>
                            <div className="space-y-1 border-t border-[#e6efea] p-2">
                              {records.map((cell, index) => (
                                <div
                                  key={cell.id}
                                  className="flex items-center justify-between gap-2"
                                >
                                  <span className="text-[10px] text-[#526b62]">
                                    Catatan {index + 1}
                                  </span>
                                  {recordEditor(cell, `${c.label} ${r.name}, catatan ${index + 1}`)}
                                </div>
                              ))}
                            </div>
                          </details>
                        ) : (
                          <span className="text-[#cbd5e1]">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-center text-[12.5px] font-extrabold text-[#0f2e25]">
                    {r.na ?? '—'}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <span
                      className={clsx(
                        'rounded-md px-2 py-0.5 text-[11px] font-bold',
                        r.na !== null ? cellColor(r.na, kktp) : 'text-[#526b62]',
                      )}
                    >
                      {statusOf(r.na)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="text-[12px] font-extrabold text-[#355a4e]">
                <td className="sticky left-0 z-10 bg-[#f9fbfa] px-3 py-2 text-left text-[#6b8079]">
                  Rata-rata kelas
                </td>
                {COLS.map((c) => (
                  <td key={c.key} className="bg-[#f9fbfa] px-2 py-2 text-center">
                    {avgCol(c.key) ?? '—'}
                  </td>
                ))}
                <td className="bg-[#f9fbfa] px-2 py-2 text-center">{avgNa ?? '—'}</td>
                <td className="bg-[#f9fbfa] px-2 py-2 text-center">—</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-[11px] font-semibold text-[#6b8079]">
        <span>
          <i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500 align-[-1px]" />≥
          KKTP (tuntas)
        </span>
        <span>
          <i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-orange-400 align-[-1px]" />
          Mendekati KKTP
        </span>
        <span>
          <i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-rose-500 align-[-1px]" />
          Di bawah KKTP → remedial
        </span>
        <span className="ml-auto font-bold text-emerald-700">
          Beberapa catatan dihitung rata-rata. Buka rinciannya untuk mengedit satu nilai; perubahan
          tampil setelah berhasil disimpan.
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[12px] font-bold text-emerald-800">
        <GitBranch className="h-3.5 w-3.5 text-emerald-600" />
        Alur penilaian:
        {['Penilaian Sesi', 'Gradebook', 'Capaian CP', 'Rapor', 'Rekap Audit'].map((s, i, arr) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className="rounded-md border border-emerald-200 bg-white px-2 py-0.5">{s}</span>
            {i < arr.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-emerald-600" />}
          </span>
        ))}
      </div>

      {/* Bank Soal — real CRUD via /questions API (P20) */}
      {pgBankOpen && (
        <QuestionBankEditor
          subject={subject}
          academicYear={academicYear}
          semester={semester}
          onClose={() => setPgBankOpen(false)}
        />
      )}
    </div>
  );
}
