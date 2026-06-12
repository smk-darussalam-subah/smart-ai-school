'use client';

import { useState } from 'react';
import clsx from 'clsx';
import type { GradeItem, AttendanceItem, StudentRef } from '@/lib/api';
import { Card } from '@/components/ui/card';

// ── Helpers ───────────────────────────────────────────────────────────────────

const GRADE_TYPE_LABEL: Record<string, string> = {
  uts: 'UTS',
  uh: 'UH',
  uas: 'UAS',
  praktik: 'Praktik',
  sikap: 'Sikap',
};

const SCORE_COLOR = (score: number) => {
  if (score >= 85) return 'text-green-700 font-semibold';
  if (score >= 70) return 'text-blue-700';
  return 'text-red-600';
};

// ── Sub-components ────────────────────────────────────────────────────────────

function AttendanceSummary({ records }: { records: AttendanceItem[] }) {
  const counts = { hadir: 0, izin: 0, sakit: 0, alpha: 0 };
  records.forEach((r) => { counts[r.status as keyof typeof counts]++; });
  const total = records.length;
  const pct = total > 0 ? Math.round((counts.hadir / total) * 100) : 0;

  const items = [
    { key: 'hadir',  icon: '✅', label: 'Hadir',       count: counts.hadir,  bg: 'bg-green-50',  text: 'text-green-700' },
    { key: 'izin',   icon: '📋', label: 'Izin',        count: counts.izin,   bg: 'bg-blue-50',   text: 'text-blue-700' },
    { key: 'sakit',  icon: '🤒', label: 'Sakit',       count: counts.sakit,  bg: 'bg-yellow-50', text: 'text-yellow-700' },
    { key: 'alpha',  icon: '❌', label: 'Tidak Hadir', count: counts.alpha,  bg: 'bg-red-50',    text: 'text-red-700' },
  ] as const;

  return (
    <section aria-labelledby="absensi-heading">
      <div className="flex items-center justify-between mb-3">
        <h2 id="absensi-heading" className="font-semibold text-gray-800">Rekap Kehadiran</h2>
        {total > 0 && (
          <span className="text-sm text-gray-500">
            {total} pertemuan · kehadiran{' '}
            <span className={pct >= 80 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
              {pct}%
            </span>
          </span>
        )}
      </div>

      {total === 0 ? (
        <Card className="p-6 text-center py-8 text-gray-400 text-sm">Belum ada data kehadiran</Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {items.map(({ key, icon, label, count, bg, text }) => (
            <Card key={key} className={clsx('p-4 flex items-center gap-3', bg)}>
              <span className="text-2xl" role="img" aria-label={label}>{icon}</span>
              <div>
                <p className={clsx('text-xl font-bold leading-tight', text)}>{count}</p>
                <p className="text-xs text-gray-500">{label}</p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

function GradeTable({ grades }: { grades: GradeItem[] }) {
  if (grades.length === 0) {
    return (
      <Card className="p-6 text-center py-8 text-gray-400 text-sm">
        Belum ada data nilai
      </Card>
    );
  }

  // Group by subject for cleaner display
  const bySubject = grades.reduce<Record<string, GradeItem[]>>((acc, g) => {
    const subjectKey = `${g.assignment.subject}___${g.academicYear}`;
    (acc[subjectKey] ??= []).push(g);
    return acc;
  }, {});

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
      <table className="w-full text-sm bg-white" aria-label="Tabel nilai">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            <th scope="col" className="text-left px-4 py-3 font-semibold text-gray-600">Mata Pelajaran</th>
            <th scope="col" className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Tahun / Smt</th>
            <th scope="col" className="text-left px-4 py-3 font-semibold text-gray-600">Tipe</th>
            <th scope="col" className="text-right px-4 py-3 font-semibold text-gray-600">Nilai</th>
            <th scope="col" className="text-left px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">Catatan</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(bySubject).map(([_key, rows]) =>
            rows
              .sort((a, b) => a.semester - b.semester || a.type.localeCompare(b.type))
              .map((g, i) => (
                <tr
                  key={g.id}
                  className={clsx(
                    'border-b border-gray-50 hover:bg-gray-50 transition-colors',
                    i === 0 && 'border-t-2 border-t-gray-100',
                  )}
                >
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {i === 0 ? g.assignment.subject : ''}
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {g.academicYear} / {g.semester}
                  </td>
                  <td className="px-4 py-3">
                    <span className="badge bg-gray-100 text-gray-700">
                      {GRADE_TYPE_LABEL[g.type] ?? g.type}
                    </span>
                  </td>
                  <td className={clsx('px-4 py-3 text-right tabular-nums', SCORE_COLOR(parseFloat(g.score)))}>
                    {parseFloat(g.score).toFixed(0)}
                  </td>
                  <td className="px-4 py-3 text-gray-400 hidden sm:table-cell">
                    {g.notes ?? '—'}
                  </td>
                </tr>
              )),
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Child selector (ORANG_TUA with >1 child) ─────────────────────────────────

interface PortalNilaiClientProps {
  grades: GradeItem[];
  attendance: AttendanceItem[];
  isOrangTua: boolean;
}

export function PortalNilaiClient({ grades, attendance, isOrangTua }: PortalNilaiClientProps) {
  // Derive unique children from data (avoid extra API call)
  const children: StudentRef[] = isOrangTua
    ? [...new Map(grades.map((g) => [g.studentId, g.student])).values()]
    : [];

  const [selectedChildId, setSelectedChildId] = useState<string>(children[0]?.id ?? '');

  const filteredGrades = isOrangTua && children.length > 1
    ? grades.filter((g) => g.studentId === selectedChildId)
    : grades;

  const filteredAttendance = isOrangTua && children.length > 1
    ? attendance.filter((a) => a.studentId === selectedChildId)
    : attendance;

  const selectedChild = children.find((c) => c.id === selectedChildId);

  return (
    <div className="space-y-6">
      {/* Child selector — hanya tampil jika ORANG_TUA dengan >1 anak */}
      {isOrangTua && children.length > 1 && (
        <div>
          <p className="text-sm text-gray-500 mb-2">Pilih anak:</p>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Pilih anak">
            {children.map((child) => (
              <button
                key={child.id}
                role="tab"
                aria-selected={child.id === selectedChildId}
                onClick={() => setSelectedChildId(child.id)}
                className={clsx(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-smk-blue focus:ring-offset-1',
                  child.id === selectedChildId
                    ? 'bg-smk-blue text-white shadow-sm'
                    : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50',
                )}
              >
                {child.user.fullName}
                <span className="ml-1.5 text-xs opacity-70">({child.nis})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Student context label */}
      {isOrangTua && selectedChild && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="badge bg-green-100 text-green-700">Siswa</span>
          <span className="font-medium text-gray-700">{selectedChild.user.fullName}</span>
          <span>· NIS {selectedChild.nis}</span>
        </div>
      )}

      {/* Rekap Kehadiran */}
      <AttendanceSummary records={filteredAttendance} />

      {/* Tabel Nilai */}
      <section aria-labelledby="nilai-heading">
        <h2 id="nilai-heading" className="font-semibold text-gray-800 mb-3">
          Nilai per Mata Pelajaran
          {filteredGrades.length > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-400">
              ({filteredGrades.length} entri)
            </span>
          )}
        </h2>
        <GradeTable grades={filteredGrades} />
      </section>
    </div>
  );
}
