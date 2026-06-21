'use client';

// CapaianRapor — layar "Capaian & Rapor" Dashboard Guru (W1). Pratinjau rapor per
// siswa dari data NYATA /grades, NA berbobot (lib/academic). Klik siswa → RaporModal.
// JUJUR: hanya mencakup mapel yang diampu guru ini; rapor lengkap lintas mapel
// dikompilasi wali kelas / modul Rapor.

import { useMemo, useState } from 'react';
import { GraduationCap, FileText, Info, Users, Award, GitBranch, ArrowRight, Download, TrendingUp, CheckCircle } from 'lucide-react';
import clsx from 'clsx';
import type { GradeItem } from '@/lib/api';
import { naOf, predikat, gradeStatus, KKTP_DEFAULT, NA_WEIGHTS, type StudentGradeComponents } from '@/lib/academic';
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

// SIMULASI: CP Progress per CP (backend /cp-progress belum tersedia)
const CP_RAPOR = [
  { cp: 'CP 1', desc: 'Antarmuka web fungsional', progres: 88, tuntas: 28, total: 32 },
  { cp: 'CP 2', desc: 'Layout responsif', progres: 74, tuntas: 24, total: 32 },
  { cp: 'CP 3', desc: 'Form & validasi', progres: 35, tuntas: 11, total: 32 },
  { cp: 'CP 4', desc: 'Interaktivitas dasar', progres: 0, tuntas: 0, total: 32 },
];

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
  const [tab, setTab] = useState<'ringkas' | 'rapor'>('ringkas');
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2800); };

  // Extract unique subjects for rapor matrix columns
  const allSubjects = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => s.rows.forEach((r) => set.add(r.subject)));
    return [...set].sort();
  }, [students]);

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

  // KPIs for Ringkasan Capaian
  const tuntasCount = students.filter((s) => s.avg !== null && s.avg >= KKTP_DEFAULT).length;
  const allNas = students.map((s) => s.avg).filter((x): x is number => x !== null);
  const rataNa = allNas.length ? Math.round((allNas.reduce((a, b) => a + b, 0) / allNas.length) * 10) / 10 : null;
  const remedialCount = students.filter((s) => s.avg !== null && s.avg < KKTP_DEFAULT).length;
  // SIMULASI: CP Tercapai (backend /cp-progress belum ada)
  const cpTercapai = 3; const cpTotal = 4;

  return (
    <div className="space-y-4">
    {/* Tab bar */}
    <div className="inline-flex rounded-xl bg-[#f4f7f5] p-1">
      <button type="button" onClick={() => setTab('ringkas')}
        className={clsx('inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[12.5px] font-bold', tab === 'ringkas' ? 'bg-white text-emerald-700 shadow-sm' : 'text-[#6b8079]')}>
        <Award className="h-4 w-4" />Ringkasan Capaian
      </button>
      <button type="button" onClick={() => setTab('rapor')}
        className={clsx('inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[12.5px] font-bold', tab === 'rapor' ? 'bg-white text-emerald-700 shadow-sm' : 'text-[#6b8079]')}>
        <FileText className="h-4 w-4" />Rapor Semester
      </button>
    </div>

    {tab === 'ringkas' && (
      <>
      {/* Capaian Pembelajaran KPIs */}
      <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]">
          <Award className="h-[18px] w-[18px] text-emerald-600" />Capaian Pembelajaran — {className}
        </h3>
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-[10.5px] font-bold text-amber-700">
          <Info className="h-3 w-3" /> CP Grid = Simulasi (backend /cp-progress belum tersedia)
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiSmall label="Tuntas" value={`${tuntasCount}/${students.length}`} valueClass="text-emerald-700" />
          <KpiSmall label="Rata² NA" value={rataNa !== null ? `${rataNa}` : '—'} />
          <KpiSmall label="Remedial" value={`${remedialCount}`} valueClass="text-rose-600" />
          <KpiSmall label="CP Tercapai" value={`${cpTercapai}/${cpTotal}`} />
        </div>
      </div>

      {/* Student list */}
      <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]">
            <GraduationCap className="h-[18px] w-[18px] text-emerald-600" />Pratinjau Rapor per Siswa
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

      </div>

      {/* Struktur Nilai & Alur Data */}
      <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]">
          <GitBranch className="h-[18px] w-[18px] text-emerald-600" />Struktur Nilai &amp; Alur Data
        </h3>
        <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-[11.5px] font-semibold text-emerald-800">
          <Info className="mr-1 inline h-3 w-3" />
          <b>Komposisi Nilai Akhir (NA):</b> UH×{Math.round(NA_WEIGHTS.uh * 100)}% + Praktik×{Math.round(NA_WEIGHTS.praktik * 100)}% + Sikap×{Math.round(NA_WEIGHTS.sikap * 100)}% + UTS×{Math.round(NA_WEIGHTS.uts * 100)}% + UAS×{Math.round(NA_WEIGHTS.uas * 100)}%. UH = rata² formatif harian TP. Praktik = tugas/proyek/observasi. Sikap = observasi langsung.
        </div>
        <div className="flex flex-col items-start gap-2 text-[12px] font-semibold text-[#355a4e]">
          <div className="flex items-center gap-2"><ArrowRight className="h-3.5 w-3.5 text-emerald-600" /> <b>Formatif harian (TP)</b> → rata² → UH di Gradebook</div>
          <div className="flex items-center gap-2"><ArrowRight className="h-3.5 w-3.5 text-emerald-600" /> <b>Sumatif per CP</b> → ukur ketercapaian CP</div>
          <div className="flex items-center gap-2"><ArrowRight className="h-3.5 w-3.5 text-emerald-600" /> <b>UTS</b> = sumatif beberapa CP tahap 1 · <b>UAS</b> = sumatif semua CP tahap 1+2</div>
          <div className="flex items-center gap-2"><ArrowRight className="h-3.5 w-3.5 text-emerald-600" /> <b>NA ≥ KKTP</b> → CP terkait bertambah progres → Rapor</div>
          <div className="flex items-center gap-2"><ArrowRight className="h-3.5 w-3.5 text-emerald-600" /> <b>Semua agregasi</b> → Rekap Audit KS/Wakakur</div>
        </div>
      </div>
      </>
    )}

    {tab === 'rapor' && (
      <>
      {/* Rapor Preview Matrix */}
      <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]">
            <FileText className="h-[18px] w-[18px] text-emerald-600" />Pratinjau Rapor — {className}
          </h3>
          <button type="button" onClick={() => showToast('Ekspor rapor PDF akan tersedia di modul Rapor')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#e6efea] bg-white px-3 py-2 text-[12px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]">
            <Download className="h-3.5 w-3.5" />Ekspor PDF
          </button>
        </div>
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] font-semibold text-amber-700">
          <Info className="mt-px h-3.5 w-3.5 shrink-0" />
          Pratinjau mencakup <b className="mx-1">mapel yang Anda ampu</b>. Rapor lengkap (muatan lokal, Ekskul, ketidakhadiran, catatan guru, pengesahan) dikompilasi wali kelas / modul Rapor.
        </p>
        {students.length === 0 ? (
          <div className="mt-3 grid h-24 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] font-medium text-[#9bb0a8]">
            Belum ada nilai untuk kelas ini.
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-[#e6efea] text-left text-[10.5px] uppercase tracking-wide text-[#6b8079]">
                  <th className="py-2 pr-3">Siswa</th>
                  {allSubjects.map((sub) => (
                    <th key={sub} className="py-2 px-2 text-center">{sub}</th>
                  ))}
                  <th className="py-2 pl-3 text-right">Rata² NA</th>
                  <th className="py-2 pl-3 text-center">Predikat</th>
                  <th className="py-2 pl-3 text-center">Rapor</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const tone = s.avg != null ? STATUS_TEXT_CLASS[gradeStatus(s.avg)] : 'text-[#9bb0a8]';
                  return (
                    <tr key={s.studentId} className="border-b border-[#f0f4f2]">
                      <td className="py-2 pr-3">
                        <div className="font-semibold text-[#0f2e25]">{s.name}</div>
                        <div className="text-[10.5px] text-[#9bb0a8]">{s.nis}</div>
                      </td>
                      {allSubjects.map((sub) => {
                        const row = s.rows.find((r) => r.subject === sub);
                        const na = row ? naOf(row.components) : null;
                        return (
                          <td key={sub} className={`py-2 px-2 text-center font-bold tabular-nums ${na != null ? STATUS_TEXT_CLASS[gradeStatus(na)] : 'text-[#9bb0a8]'}`}>
                            {na ?? '—'}
                          </td>
                        );
                      })}
                      <td className={`py-2 pl-3 text-right font-extrabold tabular-nums ${tone}`}>{s.avg ?? '—'}</td>
                      <td className={`py-2 pl-3 text-center font-extrabold ${tone}`}>
                        {s.avg != null ? predikat(s.avg) : '—'}
                      </td>
                      <td className="py-2 pl-3 text-center">
                        <button type="button" onClick={() => setSel(s)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#e6efea] bg-white px-2 py-1 text-[11px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]">
                          <FileText className="h-3 w-3 text-emerald-600" />Lihat
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CP Progress Grid — SIMULASI */}
      <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
        <h3 className="mb-1 flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]">
          <TrendingUp className="h-[18px] w-[18px] text-emerald-600" />Progres Ketercapaian CP
        </h3>
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-[10.5px] font-bold text-amber-700">
          <Info className="h-3 w-3" /> SIMULASI — backend /cp-progress belum tersedia
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {CP_RAPOR.map((c) => (
            <div key={c.cp} className="rounded-xl border border-[#e6efea] bg-[#f9fbfa] p-3">
              <b className="text-[11px] text-[#0f2e25]">{c.cp}</b>
              <div className="text-[10px] text-[#9bb0a8]">{c.desc}</div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#f0f4f2]">
                <div className={`h-full rounded-full ${c.progres >= 75 ? 'bg-emerald-500' : c.progres > 0 ? 'bg-amber-400' : 'bg-slate-200'}`} style={{ width: `${c.progres}%` }} />
              </div>
              <small className={`mt-1 block text-[10px] font-bold ${c.progres >= 75 ? 'text-emerald-700' : 'text-amber-600'}`}>
                {c.progres > 0 ? `${c.progres}% · ${c.tuntas}/${c.total} siswa` : 'belum mulai'}
              </small>
            </div>
          ))}
        </div>
      </div>

      {/* Capaian → Rapor Publication Flow */}
      <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]">
          <GitBranch className="h-[18px] w-[18px] text-emerald-600" />Alur Capaian → Rapor
        </h3>
        <div className="flex flex-col items-start gap-2 text-[12px] font-semibold text-[#355a4e]">
          <div className="flex items-center gap-2"><ArrowRight className="h-3.5 w-3.5 text-emerald-600" /> <b>Formatif harian (TP)</b> → rata² → UH di Gradebook</div>
          <div className="flex items-center gap-2"><ArrowRight className="h-3.5 w-3.5 text-emerald-600" /> <b>Sumatif per CP</b> → ukur ketercapaian CP</div>
          <div className="flex items-center gap-2"><ArrowRight className="h-3.5 w-3.5 text-emerald-600" /> <b>NA ≥ KKTP</b> → CP terkait bertambah progres → Rapor</div>
          <div className="flex items-center gap-2"><ArrowRight className="h-3.5 w-3.5 text-emerald-600" /> <b>Deskripsi capaian per TP</b> → diperiksa Kepala Sekolah → terbit ke orang tua</div>
          <div className="flex items-center gap-2"><ArrowRight className="h-3.5 w-3.5 text-emerald-600" /> <b>Rapor lengkap</b> (muatan lokal, Ekskul, ketidakhadiran, catatan guru) → modul Rapor / Wali Kelas</div>
        </div>
      </div>
      </>
    )}

    {toast && (
      <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-[#0f2e25] px-4 py-3 text-[13px] font-semibold text-white shadow-xl">
        <span className="inline-flex items-center gap-2"><CheckCircle className="h-4 w-4 text-emerald-300" />{toast}</span>
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

function KpiSmall({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-xl border border-[#e6efea] bg-[#f9fbfa] p-3">
      <div className="text-[11px] font-semibold text-[#6b8079]">{label}</div>
      <div className={`mt-1 text-[20px] font-extrabold tracking-tight text-[#0f2e25] ${valueClass ?? ''}`}>{value}</div>
    </div>
  );
}
