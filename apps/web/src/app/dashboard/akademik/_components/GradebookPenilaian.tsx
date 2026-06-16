'use client';

import { useMemo, useState } from 'react';
import { Target, Users, Download, Plus, GitBranch, ArrowRight } from 'lucide-react';
import clsx from 'clsx';
import type { GradeItem } from '@/lib/api';
import { updateGrade } from '../actions';
import { KKTP_DEFAULT } from './guru-types';

type Mode = 'rekap' | 'per-tp' | 'rubrik';
const COLS = [
  { key: 'uh', label: 'UH', grp: 'Formatif' },
  { key: 'praktik', label: 'Praktik', grp: 'Formatif' },
  { key: 'sikap', label: 'Sikap', grp: 'Formatif' },
  { key: 'uts', label: 'UTS', grp: 'Sumatif' },
  { key: 'uas', label: 'UAS', grp: 'Sumatif' },
] as const;

interface CellVal { id: string; score: number }

function cellColor(v: number) {
  return v >= KKTP_DEFAULT ? 'bg-emerald-50 text-emerald-700' : v >= KKTP_DEFAULT - 8 ? 'bg-orange-50 text-orange-700' : 'bg-rose-50 text-rose-600';
}

export default function GradebookPenilaian({
  grades, className, subject, onInputNilai,
}: { grades: GradeItem[]; className: string; subject: string; onInputNilai: () => void }) {
  const [mode, setMode] = useState<Mode>('rekap');
  const [remedialOnly, setRemedialOnly] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, number>>({}); // key id → score
  const [editing, setEditing] = useState<string | null>(null); // cell key sid|col

  const base = useMemo(() => {
    const byStudent = new Map<string, { name: string; nis: string; cells: Map<string, CellVal> }>();
    for (const g of grades) {
      const sid = g.studentId;
      let row = byStudent.get(sid);
      if (!row) { row = { name: g.student.user.fullName, nis: g.student.nis, cells: new Map() }; byStudent.set(sid, row); }
      row.cells.set(g.type, { id: g.id, score: Number(g.score) });
    }
    return [...byStudent.entries()].map(([sid, r]) => ({ sid, ...r })).sort((a, b) => a.name.localeCompare(b.name));
  }, [grades]);

  const scoreOf = (c: CellVal | undefined) => (c ? (overrides[c.id] ?? c.score) : null);
  const naOf = (cells: Map<string, CellVal>) => {
    const vals = COLS.map((c) => scoreOf(cells.get(c.key))).filter((v): v is number => v !== null);
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
  };

  const rows = base.map((r) => ({ ...r, na: naOf(r.cells) }));
  const remedialCount = rows.filter((r) => r.na !== null && r.na < KKTP_DEFAULT).length;
  const shown = remedialOnly ? rows.filter((r) => r.na !== null && r.na < KKTP_DEFAULT) : rows;

  const avgCol = (key: string) => {
    const vals = rows.map((r) => scoreOf(r.cells.get(key))).filter((v): v is number => v !== null);
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
  };
  const avgNa = (() => { const v = rows.map((r) => r.na).filter((x): x is number => x !== null); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null; })();

  const commit = async (cell: CellVal, raw: string) => {
    setEditing(null);
    const n = Number(raw);
    if (Number.isNaN(n) || n < 0 || n > 100 || n === cell.score) return;
    setOverrides((p) => ({ ...p, [cell.id]: n }));
    await updateGrade(cell.id, { score: n }); // auto-save
  };

  const exportCsv = () => {
    const head = ['Siswa', 'NIS', ...COLS.map((c) => c.label), 'NA', 'Status'];
    const lines = rows.map((r) => [r.name, r.nis, ...COLS.map((c) => scoreOf(r.cells.get(c.key)) ?? ''), r.na ?? '', r.na === null ? '' : r.na >= KKTP_DEFAULT ? 'Tuntas' : 'Remedial'].join(','));
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `nilai-${className}-${subject}.csv`.replace(/\s+/g, '_'); a.click();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl bg-[#f4f7f5] p-1">
          {([['rekap', 'Rekap Nilai'], ['per-tp', 'Per-TP'], ['rubrik', 'Rubrik / KKTP']] as [Mode, string][]).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setMode(k)}
              className={clsx('rounded-lg px-3 py-1.5 text-[12.5px] font-bold', mode === k ? 'bg-white text-emerald-700 shadow-sm' : 'text-[#6b8079]')}>{l}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-amber-400 px-2.5 py-1.5 text-[11px] font-extrabold text-amber-600"><Target className="h-3.5 w-3.5" />KKTP {KKTP_DEFAULT}</span>
          <button type="button" onClick={() => setRemedialOnly((v) => !v)}
            className={clsx('inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12.5px] font-bold', remedialOnly ? 'border-rose-300 bg-rose-50 text-rose-600' : 'border-[#e6efea] bg-white text-[#355a4e] hover:bg-[#f4f7f5]')}>
            <Users className="h-4 w-4" />Remedial ({remedialCount})
          </button>
          <button type="button" onClick={exportCsv} className="inline-flex items-center gap-1.5 rounded-xl border border-[#e6efea] bg-white px-3 py-2 text-[12.5px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]"><Download className="h-4 w-4 text-emerald-600" />Ekspor</button>
          <button type="button" onClick={onInputNilai} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-[12.5px] font-bold text-white hover:bg-emerald-700"><Plus className="h-4 w-4" />Input Nilai</button>
        </div>
      </div>

      {mode !== 'rekap' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-700">
          {mode === 'per-tp' ? 'Penilaian per Tujuan Pembelajaran (TP) menyusul saat modul ATP/Pembelajaran aktif.' : 'Rubrik & KKTP per-TP menyusul saat modul ATP/Pembelajaran aktif.'} Saat ini tampil Rekap Nilai.
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-[#e6efea] bg-white shadow-sm">
        <table className="w-full border-separate" style={{ borderSpacing: 0 }}>
          <thead>
            <tr className="bg-[#f3f8f5] text-[11px] font-extrabold uppercase tracking-wide text-emerald-800">
              <th className="sticky left-0 z-10 bg-[#f3f8f5] px-3 py-2 text-left">Siswa</th>
              <th colSpan={3} className="border-b border-[#e6efea] px-2 py-2">Formatif</th>
              <th colSpan={2} className="border-b border-[#e6efea] px-2 py-2">Sumatif</th>
              <th className="border-b border-[#e6efea] px-2 py-2">Akhir</th>
              <th className="border-b border-[#e6efea] px-2 py-2">KKTP</th>
            </tr>
            <tr className="text-[11px] font-bold text-[#355a4e]">
              <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left">&nbsp;</th>
              {COLS.map((c) => <th key={c.key} className="border-b border-[#e6efea] px-2 py-2">{c.label}</th>)}
              <th className="border-b border-[#e6efea] px-2 py-2">NA</th>
              <th className="border-b border-[#e6efea] px-2 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-10 text-center text-[12.5px] font-medium text-[#9bb0a8]">{remedialOnly ? 'Tidak ada siswa remedial.' : 'Belum ada nilai untuk kelas/mapel ini.'}</td></tr>
            ) : shown.map((r) => (
              <tr key={r.sid} className="border-b border-[#f0f4f2]">
                <td className="sticky left-0 z-10 bg-white px-3 py-2 text-left text-[12.5px]"><b className="text-[#0f2e25]">{r.name}</b><span className="block text-[10.5px] text-[#9bb0a8]">NIS {r.nis}</span></td>
                {COLS.map((c) => {
                  const cell = r.cells.get(c.key);
                  const v = scoreOf(cell);
                  const ck = `${r.sid}|${c.key}`;
                  return (
                    <td key={c.key} className="px-2 py-2 text-center">
                      {cell ? (
                        editing === ck ? (
                          <input autoFocus type="number" min={0} max={100} defaultValue={v ?? ''}
                            onBlur={(e) => commit(cell, e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') commit(cell, (e.target as HTMLInputElement).value); if (e.key === 'Escape') setEditing(null); }}
                            className="w-12 rounded-md border border-emerald-400 px-1 py-0.5 text-center text-[12px] font-bold outline-none" />
                        ) : (
                          <button type="button" onClick={() => setEditing(ck)} title="Klik untuk edit cepat"
                            className={clsx('min-w-[34px] rounded-md px-2 py-1 text-[12.5px] font-extrabold', cellColor(v ?? 0))}>{v}</button>
                        )
                      ) : <span className="text-[#cbd5e1]">—</span>}
                    </td>
                  );
                })}
                <td className="px-2 py-2 text-center text-[12.5px] font-extrabold text-[#0f2e25]">{r.na ?? '—'}</td>
                <td className="px-2 py-2 text-center">{r.na === null ? <span className="text-[#cbd5e1]">—</span> : r.na >= KKTP_DEFAULT ? <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">Tuntas</span> : <span className="rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-600">Remedial</span>}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="text-[12px] font-extrabold text-[#355a4e]">
                <td className="sticky left-0 z-10 bg-[#f9fbfa] px-3 py-2 text-left text-[#6b8079]">Rata-rata kelas</td>
                {COLS.map((c) => <td key={c.key} className="bg-[#f9fbfa] px-2 py-2 text-center">{avgCol(c.key) ?? '—'}</td>)}
                <td className="bg-[#f9fbfa] px-2 py-2 text-center">{avgNa ?? '—'}</td>
                <td className="bg-[#f9fbfa] px-2 py-2 text-center">—</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-[11px] font-semibold text-[#6b8079]">
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500 align-[-1px]" />≥ KKTP (tuntas)</span>
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-orange-400 align-[-1px]" />Mendekati KKTP</span>
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-rose-500 align-[-1px]" />Di bawah KKTP → remedial</span>
        <span className="ml-auto font-bold text-emerald-700">Klik sel untuk edit cepat · tersimpan otomatis</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[12px] font-bold text-emerald-800">
        <GitBranch className="h-3.5 w-3.5 text-emerald-600" />Alur penilaian:
        {['Pilih TP', 'Input formatif/sumatif', 'Bandingkan KKTP', 'Remedial / pengayaan', 'Nilai Akhir → Rapor'].map((s, i, arr) => (
          <span key={s} className="inline-flex items-center gap-1.5"><span className="rounded-md border border-emerald-200 bg-white px-2 py-0.5">{s}</span>{i < arr.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-emerald-600" />}</span>
        ))}
      </div>
    </div>
  );
}
