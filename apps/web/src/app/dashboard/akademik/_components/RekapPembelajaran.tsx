'use client';

import React, { useMemo } from 'react';
import {
  ArrowLeft,
  ClipboardCheck,
  FileText,
  BookOpenCheck,
  Target,
  GraduationCap,
  PenLine,
  LayoutGrid,
} from 'lucide-react';
import type { GradeItem, AttendanceItem } from '@/lib/api';
import type { ActivityItem, RppItem } from './guru-types';
import { averageGradeComponents, subjectThreshold } from '@/lib/grade-consumers';
import { naOf } from '@/lib/academic';
import {
  summaryReadMessage,
  type SummaryReadState,
  type TeacherThreshold,
} from '@/lib/teacher-summary';

interface Props {
  subject: string; // 'all' = semua mapel
  grades: GradeItem[];
  attendances: AttendanceItem[];
  activities: ActivityItem[];
  approvedRpp: RppItem[];
  academicYear: string;
  semester: number;
  thresholds?: TeacherThreshold[];
  thresholdState?: SummaryReadState;
  dataState?: SummaryReadState;
  onBack: () => void;
}

/** Each student contributes one canonical NA per class/subject in the selected period. */
function recapMetrics(rows: GradeItem[], thresholds: TeacherThreshold[], state: SummaryReadState) {
  const students = new Map<string, { subject: string; records: GradeItem[] }>();
  for (const row of rows) {
    const key = JSON.stringify([row.studentId, row.assignment.classId, row.assignment.subject]);
    const student = students.get(key) ?? { subject: row.assignment.subject, records: [] };
    student.records.push(row);
    students.set(key, student);
  }
  const evaluated = [...students.values()]
    .map((student) => ({
      score: naOf(averageGradeComponents(student.records)),
      limit: state === 'ready' ? subjectThreshold(thresholds, student.subject) : null,
    }))
    .filter(
      (student): student is { score: number; limit: number | null } => student.score !== null,
    );
  const scores = evaluated.map((student) => student.score);
  const limits = evaluated.map((student) => student.limit);
  const unknown = limits.filter((limit) => limit === null).length;
  const passed = scores.filter(
    (score, index) => limits[index] !== null && score >= limits[index]!,
  ).length;
  return {
    count: scores.length,
    average: scores.length
      ? Math.round(scores.reduce((sum, score) => sum + Math.round(score * 10), 0) / scores.length) /
        10
      : null,
    passed: unknown ? null : passed,
    below: unknown ? null : scores.length - passed,
    percentage: scores.length && !unknown ? Math.round((passed / scores.length) * 100) : null,
    unknown,
  };
}

export default function RekapPembelajaran({
  subject,
  grades,
  attendances,
  activities,
  approvedRpp,
  academicYear,
  semester,
  thresholds = [],
  thresholdState = 'unavailable',
  dataState = 'unavailable',
  onBack,
}: Props) {
  const isAll = subject === 'all' || subject === '';
  const g = useMemo(
    () =>
      dataState !== 'ready'
        ? []
        : grades.filter(
            (row) =>
              row.academicYear === academicYear &&
              row.assignment.academicYear === academicYear &&
              row.semester === semester &&
              (isAll || row.assignment.subject === subject) &&
              row.score.trim() !== '' &&
              Number.isFinite(Number(row.score)) &&
              Number(row.score) >= 0 &&
              Number(row.score) <= 100,
          ),
    [grades, academicYear, semester, dataState, isAll, subject],
  );
  const metrics = recapMetrics(g, thresholds, thresholdState);
  const { average: rata, passed: tuntas, below: remedial, percentage: tuntasPct } = metrics;
  const modulCount = isAll
    ? approvedRpp.length
    : approvedRpp.filter((r) => r.subject === subject).length;
  const hadirPct = attendances.length
    ? Math.round(
        (attendances.filter((a) => a.status === 'hadir').length / attendances.length) * 100,
      )
    : null;
  const lastJurnal = activities[0];

  // Breakdown per mapel (mode Semua Mapel)
  const perMapel = useMemo(() => {
    if (!isAll) return [];
    const m = new Map<string, GradeItem[]>();
    g.forEach((x) => {
      const arr = m.get(x.assignment.subject) ?? [];
      arr.push(x);
      m.set(x.assignment.subject, arr);
    });
    return [...m.entries()]
      .map(([subj, arr]) => {
        const summary = recapMetrics(arr, thresholds, thresholdState);
        return {
          subject: subj,
          count: summary.count,
          avg: summary.average,
          tuntasPct: summary.percentage,
          kktp: thresholdState === 'ready' ? subjectThreshold(thresholds, subj) : null,
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [g, isAll, thresholds, thresholdState]);

  // Per Kelas×Mapel breakdown + Matriks Ketuntasan
  const kelasMapel = useMemo(() => {
    const m = new Map<
      string,
      { classId: string; kelas: string; mapel: string; rows: GradeItem[] }
    >();
    g.forEach((rowGrade) => {
      const key = JSON.stringify([rowGrade.assignment.classId, rowGrade.assignment.subject]);
      let row = m.get(key);
      if (!row) {
        row = {
          classId: rowGrade.assignment.classId,
          kelas: rowGrade.assignment.class.name,
          mapel: rowGrade.assignment.subject,
          rows: [],
        };
        m.set(key, row);
      }
      row.rows.push(rowGrade);
    });
    return [...m.values()]
      .map((r) => {
        const summary = recapMetrics(r.rows, thresholds, thresholdState);
        return {
          ...r,
          count: summary.count,
          rata: summary.average,
          tuntasPct: summary.percentage,
          kktp: thresholdState === 'ready' ? subjectThreshold(thresholds, r.mapel) : null,
        };
      })
      .sort((a, b) => a.kelas.localeCompare(b.kelas) || a.mapel.localeCompare(b.mapel));
  }, [g, thresholds, thresholdState]);

  const kelasList = [
    ...new Map(kelasMapel.map((r) => [r.classId, { id: r.classId, name: r.kelas }])).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));
  const mapelList = [...new Set(kelasMapel.map((r) => r.mapel))].sort();

  const tuntasColor = (pct: number | null) =>
    pct === null
      ? 'bg-slate-100 text-slate-600'
      : pct >= 80
        ? 'bg-emerald-100 text-emerald-800'
        : pct >= 65
          ? 'bg-amber-100 text-amber-800'
          : 'bg-rose-100 text-rose-700';
  const percentageLabel = (pct: number | null) => (pct === null ? 'Belum tersedia' : `${pct}%`);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-[17px] font-bold text-[#0f2e25]">
            <ClipboardCheck className="h-[18px] w-[18px] text-emerald-600" />
            Rekap Pembelajaran — {isAll ? 'Semua Mapel' : subject}
          </h2>
          <p className="text-[12.5px] text-[#6b8079]">
            Ringkasan ketercapaian, nilai, kehadiran &amp; jurnal
            {isAll ? ' seluruh mapel yang diampu' : ' mapel ini'}.
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#e6efea] bg-white px-3 py-2 text-[12.5px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]"
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali
        </button>
      </div>

      <p className="text-[12.5px] text-[#6b8079]">
        Tahun ajaran {academicYear} · Semester {semester}. Setiap siswa dihitung sekali per mapel
        berdasarkan nilai akhir resmi. Siswa yang belum memiliki nilai tidak dianggap remedial.
      </p>
      {dataState !== 'ready' ? (
        <p
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          {summaryReadMessage(dataState, 'Nilai')}
        </p>
      ) : thresholdState !== 'ready' || metrics.unknown > 0 ? (
        <p
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          {thresholdState !== 'ready'
            ? summaryReadMessage(thresholdState, 'KKTP')
            : 'KKTP resmi untuk sebagian mapel belum tersedia.'}{' '}
          Ketuntasan belum dapat dipastikan.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={FileText} label="Modul Ajar disetujui" value={`${modulCount}`} />
        <Kpi icon={BookOpenCheck} label="Jurnal tercatat" value={`${activities.length}`} />
        <Kpi icon={Target} label="Tuntas KKTP" value={tuntasPct !== null ? `${tuntasPct}%` : '—'} />
        <Kpi
          icon={GraduationCap}
          label="Rata-rata nilai akhir"
          value={rata !== null ? `${rata}` : '—'}
        />
      </div>
      {isAll && (
        <p className="text-[12.5px] text-[#6b8079]">
          Untuk semua mapel, ringkasan menggabungkan hasil siswa pada tiap mapel, bukan jumlah siswa
          unik lintas mapel. Persentase hanya mencakup siswa yang sudah memiliki nilai.
        </p>
      )}

      {isAll && perMapel.length > 0 && (
        <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-[14px] font-bold text-[#0f2e25]">Rekap per Mapel</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-[#e6efea] text-left text-[11px] uppercase tracking-wide text-[#6b8079]">
                  <th className="py-2 pr-3">Mapel</th>
                  <th className="py-2 pr-3 text-right">Siswa dinilai</th>
                  <th className="py-2 pr-3 text-right">Rata-rata akhir</th>
                  <th className="py-2 pr-3 text-right">KKTP</th>
                  <th className="py-2 text-right">Tuntas KKTP</th>
                </tr>
              </thead>
              <tbody>
                {perMapel.map((m) => (
                  <tr key={m.subject} className="border-b border-[#f0f4f2]">
                    <td className="py-2.5 pr-3 font-semibold text-[#0f2e25]">{m.subject}</td>
                    <td className="py-2.5 pr-3 text-right text-[#355a4e]">{m.count}</td>
                    <td className="py-2.5 pr-3 text-right font-bold text-[#0f2e25]">{m.avg}</td>
                    <td className="py-2.5 pr-3 text-right">{m.kktp ?? '—'}</td>
                    <td className="py-2.5 text-right">
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${tuntasColor(m.tuntasPct)}`}
                      >
                        {percentageLabel(m.tuntasPct)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Rincian per Kelas × Mapel */}
      {kelasMapel.length > 0 && (
        <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 text-[14px] font-bold text-[#0f2e25]">
            <ClipboardCheck className="h-4 w-4 text-emerald-600" />
            Rincian per Kelas × Mapel
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
              {kelasMapel.length} baris
            </span>
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-[#e6efea] text-left text-[10.5px] uppercase tracking-wide text-[#6b8079]">
                  <th className="py-2 pr-3">Kelas</th>
                  <th className="py-2 pr-3">Mapel</th>
                  <th className="py-2 pr-3 text-right">Rata-rata akhir</th>
                  <th className="py-2 pr-3 text-right">Siswa dinilai</th>
                  <th className="py-2 pr-3 text-right">KKTP</th>
                  <th className="py-2 text-right">Tuntas KKTP</th>
                </tr>
              </thead>
              <tbody>
                {kelasMapel.map((r, i) => (
                  <tr key={i} className="border-b border-[#f0f4f2]">
                    <td className="py-2.5 pr-3 font-bold text-[#0f2e25]">{r.kelas}</td>
                    <td className="py-2.5 pr-3 text-[#355a4e]">{r.mapel}</td>
                    <td className="py-2.5 pr-3 text-right font-bold text-[#0f2e25]">{r.rata}</td>
                    <td className="py-2.5 pr-3 text-right text-[#355a4e]">{r.count}</td>
                    <td className="py-2.5 pr-3 text-right">{r.kktp ?? '—'}</td>
                    <td className="py-2.5 text-right">
                      <span
                        className={`rounded-md px-2 py-0.5 text-[10.5px] font-bold ${tuntasColor(r.tuntasPct)}`}
                      >
                        {percentageLabel(r.tuntasPct)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Matriks Ketuntasan KKTP */}
      {kelasList.length > 0 && mapelList.length > 0 && (
        <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 text-[14px] font-bold text-[#0f2e25]">
            <LayoutGrid className="h-4 w-4 text-emerald-600" />
            Matriks Ketuntasan KKTP
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] border-separate" style={{ borderSpacing: 0 }}>
              <thead>
                <tr className="text-[10.5px] font-extrabold uppercase text-[#6b8079]">
                  <th className="px-2 py-2 text-left">Kelas</th>
                  {mapelList.map((m) => (
                    <th key={m} className="px-2 py-2 text-center">
                      {m.length > 12 ? m.slice(0, 10) + '…' : m}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {kelasList.map((k) => (
                  <tr key={k.id}>
                    <td className="px-2 py-2 text-left font-bold text-[#0f2e25]">{k.name}</td>
                    {mapelList.map((mp) => {
                      const r = kelasMapel.find((x) => x.classId === k.id && x.mapel === mp);
                      return r ? (
                        <td
                          key={mp}
                          className={`px-2 py-2 text-center font-bold ${tuntasColor(r.tuntasPct)}`}
                          style={{ borderRadius: 4 }}
                        >
                          {percentageLabel(r.tuntasPct)}
                        </td>
                      ) : (
                        <td key={mp} className="px-2 py-2 text-center text-[#cbd5e1]">
                          –
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[10.5px] font-semibold text-[#6b8079]">
            <span>
              <i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-emerald-300 align-[-1px]" />
              ≥ 80% tuntas
            </span>
            <span>
              <i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-amber-300 align-[-1px]" />
              65–79%
            </span>
            <span>
              <i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-rose-300 align-[-1px]" />
              &lt; 65%
            </span>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-[14px] font-bold text-[#0f2e25]">Rekap Nilai</h3>
          <div className="space-y-2.5 text-[12.5px] font-semibold text-[#355a4e]">
            <Row label="Entri nilai" value={dataState === 'ready' ? `${g.length}` : '—'} />
            <Row
              label={isAll ? 'Penilaian siswa per mapel' : 'Siswa dengan nilai akhir'}
              value={dataState === 'ready' ? `${metrics.count}` : '—'}
            />
            <Row
              label="Tuntas / Remedial"
              value={
                <span>
                  <b className="text-emerald-700">
                    {dataState === 'ready' ? (tuntas ?? '—') : '—'}
                  </b>{' '}
                  /{' '}
                  <b className="text-rose-600">{dataState === 'ready' ? (remedial ?? '—') : '—'}</b>
                </span>
              }
            />
            <Row label="Rata-rata" value={rata !== null ? `${rata}` : '—'} />
            <Row label="Kehadiran (kelas)" value={hadirPct !== null ? `${hadirPct}%` : '—'} />
          </div>
          <p className="mt-3 text-[11px] text-[#9bb0a8]">
            Progres TP terstruktur (ATP) menyusul di modul Pembelajaran.
          </p>
        </div>

        <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 text-[14px] font-bold text-[#0f2e25]">
            <PenLine className="h-4 w-4 text-emerald-600" />
            Jurnal Terakhir
          </h3>
          {lastJurnal ? (
            <div className="rounded-xl bg-[#f4f7f5] p-3 text-[12.5px]">
              <b className="text-[#0f2e25]">{lastJurnal.title}</b>
              <div className="mt-1 text-[#6b8079]">
                {lastJurnal.class?.name ?? '—'} ·{' '}
                {new Date(lastJurnal.date).toLocaleDateString('id')}
              </div>
              {lastJurnal.description && (
                <p className="mt-2 line-clamp-3 text-[#355a4e]">{lastJurnal.description}</p>
              )}
            </div>
          ) : (
            <div className="grid h-20 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] text-[#9bb0a8]">
              Belum ada jurnal
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FileText;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-[#e6efea] bg-white p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[#6b8079]">
        <Icon className="h-3.5 w-3.5 text-emerald-600" />
        {label}
      </div>
      <div className="mt-1.5 text-[24px] font-extrabold tracking-tight text-[#0f2e25]">{value}</div>
    </div>
  );
}
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
