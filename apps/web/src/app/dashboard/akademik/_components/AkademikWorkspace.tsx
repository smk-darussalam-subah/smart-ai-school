'use client';

import { useMemo, useState } from 'react';
import {
  LayoutDashboard, CalendarClock, BookOpenCheck, ClipboardPenLine, CalendarCheck,
  ClipboardList, Award, ClipboardCheck, BookMarked, Calendar, UserCheck, Users,
} from 'lucide-react';
import clsx from 'clsx';
import type { GradeItem, AttendanceItem } from '@/lib/api';
import type { ScheduleItem, ActivityItem, RppItem, TodayClass, ClassRef, LmsModuleItem } from './guru-types';
import RingkasanGuru from './RingkasanGuru';
import JadwalTimetable from './JadwalTimetable';
import RekapPembelajaran from './RekapPembelajaran';
import GradebookPenilaian from './GradebookPenilaian';
import CapaianRapor from './CapaianRapor';
import PembelajaranGuru from './PembelajaranGuru';
import AbsenModal from './AbsenModal';
import JurnalModal from './JurnalModal';
import InputNilaiModal from './InputNilaiModal';

interface Assignment { id: string; subject: string; class: { id: string; name: string } }

interface Props {
  grades: GradeItem[];
  attendances: AttendanceItem[];
  classes: ClassRef[];
  assignments: Assignment[];
  schedules: ScheduleItem[];
  activities: ActivityItem[];
  rpp: RppItem[];
  lmsModules: LmsModuleItem[];
  todayClasses: TodayClass[];
  academicYear: string;
  semester: number;
}

type Screen = 'ringkasan' | 'jadwal' | 'pembelajaran' | 'penilaian' | 'kehadiran' | 'penugasan' | 'capaian' | 'rekap';

const NAV: { key: Screen; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'ringkasan', label: 'Ringkasan', icon: LayoutDashboard },
  { key: 'jadwal', label: 'Jadwal', icon: CalendarClock },
  { key: 'pembelajaran', label: 'Pembelajaran', icon: BookOpenCheck },
  { key: 'penilaian', label: 'Penilaian', icon: ClipboardPenLine },
  { key: 'kehadiran', label: 'Kehadiran', icon: CalendarCheck },
  { key: 'penugasan', label: 'Penugasan', icon: ClipboardList },
  { key: 'capaian', label: 'Capaian & Rapor', icon: Award },
];

export default function AkademikWorkspace({
  grades, attendances, assignments, schedules, activities, rpp, lmsModules, todayClasses, academicYear, semester,
}: Props) {
  const approvedRpp = useMemo(() => rpp.filter((r) => r.status === 'approved'), [rpp]);
  const subjects = useMemo(() => {
    const set = new Set<string>();
    assignments.forEach((a) => set.add(a.subject));
    schedules.forEach((s) => set.add(s.teachingAssignment?.subject ?? ''));
    return [...set].filter(Boolean).sort();
  }, [assignments, schedules]);
  // Kelas yang diampu: dari teaching-assignments (otoritatif — guru bisa pilih kelasnya
  // walau belum ada jadwal/timetable) + dilengkapi dari schedules. Memperbaiki dropdown
  // kelas yang kosong saat assignment ada tapi Schedule belum dibuat.
  const guruClasses = useMemo(() => {
    const m = new Map<string, string>();
    assignments.forEach((a) => { if (a.class?.id) m.set(a.class.id, a.class.name); });
    schedules.forEach((s) => { if (s.class) m.set(s.classId, s.class.name); });
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [assignments, schedules]);

  const [screen, setScreen] = useState<Screen>('ringkasan');
  const [subject, setSubject] = useState<string>('all');
  const [selClass, setSelClass] = useState<string>('all');
  const [absen, setAbsen] = useState<{ classId: string; className: string } | null>(null);
  const [jurnal, setJurnal] = useState<{ classId: string; className: string; subject: string; startLabel: string; jpStart: number } | null>(null);
  const [inputNilai, setInputNilai] = useState(false);

  const selClassName = selClass === 'all' ? '' : (guruClasses.find((c) => c.id === selClass)?.name ?? '');

  const penilaianGrades = grades.filter((g) =>
    (subject === 'all' ? false : g.assignment.subject === subject) &&
    (selClass === 'all' ? true : g.assignment.class.name === selClassName));
  const sAtt = attendances.filter((a) => selClass === 'all' ? true : a.class.name === selClassName);
  const inputAssignmentId = assignments.find((a) => a.subject === subject && a.class?.name === selClassName)?.id;

  return (
    <div className="space-y-1">
      <h1 className="text-2xl font-bold tracking-tight text-[#0f2e25]">Akademik</h1>
      <p className="text-sm text-[#6b8079]">Dashboard Guru — pembelajaran, penilaian &amp; jadwal mengajar</p>

      {/* context bar */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-xl border border-[#e6efea] bg-white px-3 py-2 text-[12.5px] font-semibold text-[#355a4e] shadow-sm">
          <Calendar className="h-[15px] w-[15px] text-emerald-600" />TA {academicYear || '—'} · Semester {semester}
        </span>
        <label className="inline-flex items-center gap-2 rounded-xl border border-[#e6efea] bg-white px-3 py-2 text-[12.5px] font-semibold text-[#355a4e] shadow-sm">
          <Users className="h-[15px] w-[15px] text-emerald-600" />
          <select value={selClass} onChange={(e) => setSelClass(e.target.value)} className="bg-transparent outline-none">
            <option value="all">Semua Kelas</option>
            {guruClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="inline-flex items-center gap-2 rounded-xl border border-[#e6efea] bg-white px-3 py-2 text-[12.5px] font-semibold text-[#355a4e] shadow-sm">
          <BookMarked className="h-[15px] w-[15px] text-emerald-600" />
          <select value={subject} onChange={(e) => setSubject(e.target.value)} className="bg-transparent outline-none">
            <option value="all">Semua Mapel</option>
            {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => setScreen('rekap')}
          className={clsx('inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[12.5px] font-bold shadow-sm',
            screen === 'rekap' ? 'bg-emerald-700 text-white' : 'bg-emerald-600 text-white hover:bg-emerald-700')}>
          <ClipboardCheck className="h-[15px] w-[15px]" />Rekap Pembelajaran
        </button>
        <span className="ml-auto inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11.5px] font-bold text-blue-700">
          <UserCheck className="h-3.5 w-3.5" />Tampilan guru · kelas yang diampu
        </span>
      </div>

      {/* sub-nav */}
      <nav className="mt-4 flex flex-wrap gap-2 border-b border-[#e6efea] pb-3">
        {NAV.map((n) => {
          const Icon = n.icon;
          const on = screen === n.key;
          return (
            <button key={n.key} type="button" onClick={() => setScreen(n.key)}
              className={clsx('inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-[13px] font-bold',
                on ? 'border-emerald-600 bg-emerald-600 text-white shadow-[0_8px_18px_-8px_rgba(5,150,105,.5)]' : 'border-[#e6efea] bg-white text-[#355a4e] hover:border-emerald-200')}>
              <Icon className={clsx('h-4 w-4', on ? 'text-white' : 'text-[#6b8079]')} />{n.label}
            </button>
          );
        })}
      </nav>

      <div className="pt-4">
        {screen === 'ringkasan' && (
          <RingkasanGuru
            grades={grades} attendances={attendances} activities={activities} rpp={rpp} todayClasses={todayClasses}
            onAbsen={(c) => setAbsen(c)} onJurnal={(c) => setJurnal(c)}
          />
        )}

        {screen === 'jadwal' && <JadwalTimetable schedules={schedules} />}

        {screen === 'rekap' && (
          <RekapPembelajaran
            subject={subject} grades={grades} attendances={attendances} activities={activities} approvedRpp={approvedRpp}
            onBack={() => setScreen('ringkasan')}
          />
        )}

        {screen === 'pembelajaran' && (
          <PembelajaranGuru rpp={rpp} lmsModules={lmsModules} subjects={subjects} classes={guruClasses} academicYear={academicYear} semester={semester} />
        )}

        {screen === 'penilaian' && (
          <Card title={`Penilaian${subject !== 'all' ? ` — ${subject}` : ''}${selClassName ? ` · ${selClassName}` : ''}`} icon={ClipboardPenLine}>
            {subject === 'all' && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-700">Pilih <b>Mapel</b> di bar atas untuk menampilkan nilai gradebook.</p>}
            <GradebookPenilaian grades={penilaianGrades} className={selClassName || 'Semua Kelas'} subject={subject === 'all' ? '' : subject} onInputNilai={() => setInputNilai(true)} />
          </Card>
        )}

        {screen === 'kehadiran' && (
          <Card title={`Kehadiran${selClassName ? ` — ${selClassName}` : ''}`} icon={CalendarCheck}>
            <p className="mb-3 text-[12px] text-[#6b8079]">Absensi cepat tersedia dari kartu kelas di <b>Ringkasan</b> (popup, default hadir). Rekap di bawah.</p>
            <div className="overflow-x-auto rounded-2xl border border-[#e6efea]">
              <table className="w-full text-[12.5px]">
                <thead><tr className="border-b border-[#e6efea] bg-[#f9fbfa] text-left text-[11px] uppercase tracking-wide text-[#6b8079]">
                  <th className="px-3 py-2">Siswa</th><th className="px-3 py-2">Kelas</th><th className="px-3 py-2">Tanggal</th><th className="px-3 py-2">Status</th></tr></thead>
                <tbody>
                  {sAtt.length === 0 ? (
                    <tr><td colSpan={4} className="px-3 py-10 text-center text-[12.5px] font-medium text-[#9bb0a8]">Belum ada data absensi</td></tr>
                  ) : sAtt.slice(0, 100).map((a) => (
                    <tr key={a.id} className="border-b border-[#f0f4f2]">
                      <td className="px-3 py-2.5 font-semibold text-[#0f2e25]">{a.student.user.fullName}</td>
                      <td className="px-3 py-2.5 text-[#355a4e]">{a.class.name}</td>
                      <td className="px-3 py-2.5 text-[#355a4e]">{new Date(a.date).toLocaleDateString('id')}</td>
                      <td className="px-3 py-2.5"><StatusBadge status={a.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {screen === 'penugasan' && (
          <Card title="Penugasan Mengajar" icon={ClipboardList}>
            {assignments.length === 0 ? <Empty label="Belum ada penugasan" /> : (
              <ul className="divide-y divide-[#e6efea]">
                {assignments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between py-2.5 text-[13px]">
                    <span className="font-semibold text-[#0f2e25]">{a.subject}</span>
                    <span className="text-[#6b8079]">{a.class?.name ?? '—'}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[11.5px] text-[#6b8079]">Pengumpulan tugas online (submission) menyusul.</p>
          </Card>
        )}

        {screen === 'capaian' && (
          <CapaianRapor grades={grades} className={selClassName} academicYear={academicYear} semester={semester} />
        )}
      </div>

      {absen && <AbsenModal classId={absen.classId} className={absen.className} onClose={() => setAbsen(null)} />}
      {jurnal && (
        <JurnalModal classId={jurnal.classId} className={jurnal.className} subject={jurnal.subject}
          startLabel={jurnal.startLabel} jpStart={jurnal.jpStart} approvedRpp={approvedRpp} activities={activities} onClose={() => setJurnal(null)} />
      )}
      {inputNilai && (
        <InputNilaiModal classId={selClass} className={selClassName || 'Semua Kelas'} subject={subject === 'all' ? '' : subject}
          assignmentId={inputAssignmentId} academicYear={academicYear} semester={semester} onClose={() => setInputNilai(false)} />
      )}
    </div>
  );
}

// ── kecil ──────────────────────────────────────────────────────────────────
function Card({ title, icon: Icon, children }: { title: string; icon: typeof LayoutDashboard; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
      <h3 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]"><Icon className="h-[18px] w-[18px] text-emerald-600" />{title}</h3>
      {children}
    </div>
  );
}
function Empty({ label }: { label: string }) {
  return <div className="grid h-24 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] font-medium text-[#9bb0a8]">{label}</div>;
}
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = { hadir: 'bg-emerald-50 text-emerald-700', izin: 'bg-sky-50 text-sky-700', sakit: 'bg-amber-50 text-amber-700', alpha: 'bg-rose-50 text-rose-600' };
  return <span className={clsx('rounded-md px-2 py-0.5 text-[11px] font-bold capitalize', map[status] ?? 'bg-slate-100 text-slate-600')}>{status}</span>;
}
