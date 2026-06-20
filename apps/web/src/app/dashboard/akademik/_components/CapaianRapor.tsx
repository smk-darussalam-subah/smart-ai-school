'use client';

// CapaianRapor — layar "Capaian & Rapor" Dashboard Guru (W1). Pratinjau rapor per
// siswa dari data NYATA /grades, NA berbobot (lib/academic). Klik siswa → RaporModal.
// JUJUR: hanya mencakup mapel yang diampu guru ini; rapor lengkap lintas mapel
// dikompilasi wali kelas / modul Rapor.

import { useMemo, useState } from 'react';
import { GraduationCap, FileText, Info, Users } from 'lucide-react';
import type { GradeItem } from '@/lib/api';
import { naOf, predikat, gradeStatus, KKTP_DEFAULT, type StudentGradeComponents } from '@/lib/academic';
import { RaporModal, type RaporRow } from '@/components/academic/shared';
import { STATUS_TEXT_CLASS } from '@/components/academic/shared/grade-meta';

interface Props {
  grades: GradeItem[];
  className: string; // '' = belum pilih kelas
  academicYear: string;
  semester: number;
}

interface StudentRapor {
  studentId: string;
  name: string;
  nis: string;
  rows: RaporRow[];
  avg: number | null;
  tuntas: number;
  total: number;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

export default function CapaianRapor({ grades, className, academicYear, semester }: Props) {
  const students = useMemo<StudentRapor[]>(() => {
    if (!className) return [];
    const classGrades = grades.filter((g) => g.assignment.class.name === className);
    const byStudent = new Map<string, { name: string; nis: string; subjects: Map<string, StudentGradeComponents> }>();
    for (const g of classGrades) {
      let st = byStudent.get(g.studentId);
      if (!st) {
        st = { name: g.student.user.fullName, nis: g.student.nis, subjects: new Map() };
        byStudent.set(g.studentId, st);
      }
      const comp = st.subjects.get(g.assignment.subject) ?? {};
      comp[g.type] = Number(g.score);
      st.subjects.set(g.assignment.subject, comp);
    }
    return [...byStudent.entries()]
      .map(([studentId, st]) => {
        const rows: RaporRow[] = [...st.subjects.entries()].map(([subject, components]) => ({ subject, components }));
        const nas = rows.map((r) => naOf(r.components)).filter((n): n is number => n !== null);
        const avg = nas.length ? round1(nas.reduce((a, b) => a + b, 0) / nas.length) : null;
        const tuntas = rows.filter((r) => { const na = naOf(r.components); return na !== null && na >= KKTP_DEFAULT; }).length;
        return { studentId, name: st.name, nis: st.nis, rows, avg, tuntas, total: rows.length };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [grades, className]);

  const [sel, setSel] = useState<StudentRapor | null>(null);

  if (!className) {
    return (
      <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]">
          <GraduationCap className="h-[18px] w-[18px] text-emerald-600" />Capaian &amp; Rapor
        </h3>
        <div className="grid h-24 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] font-medium text-[#9bb0a8]">
          Pilih <b className="mx-1">Kelas</b> di bar atas untuk menampilkan pratinjau rapor.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]">
          <GraduationCap className="h-[18px] w-[18px] text-emerald-600" />Capaian &amp; Rapor — {className}
        </h3>
        <span className="inline-flex items-center gap-1.5 rounded-md bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700">
          <Users className="h-3.5 w-3.5" />{students.length} siswa
        </span>
      </div>

      <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] font-semibold text-amber-700">
        <Info className="mt-px h-3.5 w-3.5 shrink-0" />
        Pratinjau mencakup <b className="mx-1">mapel yang Anda ampu</b>. Rapor lengkap lintas mapel dikompilasi wali kelas / modul Rapor.
      </p>

      {students.length === 0 ? (
        <div className="mt-3 grid h-24 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] font-medium text-[#9bb0a8]">
          Belum ada nilai untuk kelas ini.
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-[#e6efea] text-left text-[11px] uppercase tracking-wide text-[#6b8079]">
                <th className="py-2 pr-3">Siswa</th>
                <th className="py-2 pr-3 text-right">Rata² NA</th>
                <th className="py-2 pr-3 text-center">Predikat</th>
                <th className="py-2 pr-3 text-right">Tuntas</th>
                <th className="py-2 text-right">Rapor</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const tone = s.avg != null ? STATUS_TEXT_CLASS[gradeStatus(s.avg)] : 'text-[#9bb0a8]';
                return (
                  <tr key={s.studentId} className="border-b border-[#f0f4f2]">
                    <td className="py-2.5 pr-3">
                      <div className="font-semibold text-[#0f2e25]">{s.name}</div>
                      <div className="text-[11px] text-[#9bb0a8]">{s.nis}</div>
                    </td>
                    <td className={`py-2.5 pr-3 text-right font-extrabold tabular-nums ${tone}`}>{s.avg ?? '—'}</td>
                    <td className={`py-2.5 pr-3 text-center font-extrabold ${tone}`}>
                      {s.avg != null ? predikat(s.avg) : '—'}
                    </td>
                    <td className="py-2.5 pr-3 text-right text-[#355a4e]">{s.tuntas}/{s.total}</td>
                    <td className="py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => setSel(s)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#e6efea] bg-white px-2.5 py-1.5 text-[12px] font-bold text-[#355a4e] transition hover:bg-[#f4f7f5]"
                      >
                        <FileText className="h-3.5 w-3.5 text-emerald-600" />Lihat
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {sel && (
        <RaporModal
          open={!!sel}
          onOpenChange={(o) => !o && setSel(null)}
          studentName={sel.name}
          subtitle={`${className} · Semester ${semester} · ${academicYear || '—'}`}
          rows={sel.rows}
        />
      )}
    </div>
  );
}
