'use client';

import { useMemo, useState } from 'react';
import {
  LayoutDashboard, CalendarClock, BookOpenCheck, ClipboardPenLine, CalendarCheck,
  ClipboardList, Award, ClipboardCheck, BookMarked, Calendar, UserCheck, FileText, GraduationCap,
} from 'lucide-react';
import clsx from 'clsx';
import type { GradeItem, AttendanceItem } from '@/lib/api';
import type { ScheduleItem, ActivityItem, RppItem, TodayClass, ClassRef } from './guru-types';
import { KKTP_DEFAULT } from './guru-types';
import RingkasanGuru from './RingkasanGuru';
import JadwalTimetable from './JadwalTimetable';
import RekapPembelajaran from './RekapPembelajaran';
import AbsenModal from './AbsenModal';
import JurnalModal from './JurnalModal';

interface Assignment { id: string; subject: string; class: { name: string } }

interface Props {
  grades: GradeItem[];
  attendances: AttendanceItem[];
  classes: ClassRef[];
  assignments: Assignment[];
  schedules: ScheduleItem[];
  activities: ActivityItem[];
  approvedRpp: RppItem[];
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

const scoreCell = (s: number) =>
  s >= KKTP_DEFAULT ? 'bg-emerald-50 text-emerald-700' : s >= KKTP_DEFAULT - 8 ? 'bg-orange-50 text-orange-700' : 'bg-rose-50 text-rose-600';

export default function AkademikWorkspace({
  grades, attendances, assignments, schedules, activities, approvedRpp, todayClasses, academicYear, semester,
}: Props) {
  const subjects = useMemo(() => {
    const set = new Set<string>();
    assignments.forEach((a) => set.add(a.subject));
    schedules.forEach((s) => set.add(s.teachingAssignment?.subject ?? ''));
    return [...set].filter(Boolean).sort();
  }, [assignments, schedules]);

  const [screen, setScreen] = useState<Screen>('ringkasan');
  const [subject, setSubject] = useState<string>('all');
  const [absen, setAbsen] = useState<{ classId: string; className: string } | null>(null);
  const [jurnal, setJurnal] = useState<{ classId: string; className: string; subject: string; startLabel: string; jpStart: number } | null>(null);

  const sGrades = subject === 'all' ? grades : grades.filter((g) => g.assignment.subject === subject);
  const sAtt = attendances; // absensi tak punya subject; ditampilkan apa adanya

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
          <BookMarked className="h-[15px] w-[15px] text-emerald-600" />
          <select value={subject} onChange={(e) => setSubject(e.target.value)} className="bg-transparent outline-none">
            <option value="all">Semua Mapel</option>
            {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setScreen('rekap')}
          className={clsx('inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[12.5px] font-bold shadow-sm',
            screen === 'rekap' ? 'bg-emerald-700 text-white' : 'bg-emerald-600 text-white hover:bg-emerald-700')}
        >
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
            grades={grades} attendances={attendances} activities={activities} todayClasses={todayClasses}
            onAbsen={(c) => setAbsen(c)}
            onJurnal={(c) => setJurnal(c)}
          />
        )}

        {screen === 'jadwal' && <JadwalTimetable schedules={schedules} />}

        {screen === 'rekap' && (
          <RekapPembelajaran
            subject={subject === 'all' ? (subjects[0] ?? '') : subject}
            grades={grades} attendances={attendances} activities={activities} approvedRpp={approvedRpp}
            onBack={() => setScreen('ringkasan')}
          />
        )}

        {screen === 'pembelajaran' && (
          <Card title="Modul Ajar (disetujui)" icon={FileText}>
            {approvedRpp.length === 0 ? <Empty label="Belum ada Modul Ajar disetujui" /> : (
              <ul className="divide-y divide-[#e6efea]">
                {approvedRpp.map((r) => (
                  <li key={r.id} className="flex items-center justify-between py-2.5 text-[13px]">
                    <span className="font-semibold text-[#0f2e25]">{r.title}</span>
                    <span className="text-[#6b8079]">{r.subject}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[11.5px] text-[#6b8079]">Pemetaan CP→TP→ATP terstruktur hadir di modul Pembelajaran berikutnya.</p>
          </Card>
        )}

        {screen === 'penilaian' && (
          <Card title={`Nilai${subject !== 'all' ? ` — ${subject}` : ''}`} icon={ClipboardPenLine}>
            {sGrades.length === 0 ? <Empty label="Belum ada data nilai" /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead><tr className="border-b border-[#e6efea] text-left text-[11px] uppercase tracking-wide text-[#6b8079]">
                    <th className="py-2 pr-3">Siswa</th><th className="py-2 pr-3">Mapel</th><th className="py-2 pr-3">Kelas</th><th className="py-2 pr-3">Tipe</th><th className="py-2 text-right">Nilai</th></tr></thead>
                  <tbody>
                    {sGrades.map((g) => (
                      <tr key={g.id} className="border-b border-[#f0f4f2]">
                        <td className="py-2.5 pr-3 font-semibold text-[#0f2e25]">{g.student.user.fullName}</td>
                        <td className="py-2.5 pr-3 text-[#355a4e]">{g.assignment.subject}</td>
                        <td className="py-2.5 pr-3 text-[#355a4e]">{g.assignment.class.name}</td>
                        <td className="py-2.5 pr-3 uppercase text-[#6b8079]">{g.type}</td>
                        <td className="py-2.5 text-right"><span className={clsx('inline-block rounded-md px-2 py-0.5 font-extrabold', scoreCell(Number(g.score)))}>{g.score}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {screen === 'kehadiran' && (
          <Card title="Kehadiran" icon={CalendarCheck}>
            <p className="mb-3 text-[12px] text-[#6b8079]">Absensi cepat tersedia dari kartu kelas di <b>Ringkasan</b> (popup, default hadir). Rekap di bawah.</p>
            {sAtt.length === 0 ? <Empty label="Belum ada data absensi" /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead><tr className="border-b border-[#e6efea] text-left text-[11px] uppercase tracking-wide text-[#6b8079]">
                    <th className="py-2 pr-3">Siswa</th><th className="py-2 pr-3">Kelas</th><th className="py-2 pr-3">Tanggal</th><th className="py-2">Status</th></tr></thead>
                  <tbody>
                    {sAtt.slice(0, 100).map((a) => (
                      <tr key={a.id} className="border-b border-[#f0f4f2]">
                        <td className="py-2.5 pr-3 font-semibold text-[#0f2e25]">{a.student.user.fullName}</td>
                        <td className="py-2.5 pr-3 text-[#355a4e]">{a.class.name}</td>
                        <td className="py-2.5 pr-3 text-[#355a4e]">{new Date(a.date).toLocaleDateString('id')}</td>
                        <td className="py-2.5"><StatusBadge status={a.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
          <Card title="Capaian & Rapor" icon={GraduationCap}>
            <p className="text-[13px] text-[#355a4e]">Deskripsi capaian per TP (otomatis dari penilaian, dapat disunting) → diperiksa Kepala Sekolah → terbit ke orang tua. Terhubung ke modul <b>Rapor</b>.</p>
          </Card>
        )}
      </div>

      {absen && (
        <AbsenModal classId={absen.classId} className={absen.className} onClose={() => setAbsen(null)} />
      )}
      {jurnal && (
        <JurnalModal
          classId={jurnal.classId} className={jurnal.className} subject={jurnal.subject}
          startLabel={jurnal.startLabel} jpStart={jurnal.jpStart}
          approvedRpp={approvedRpp} activities={activities}
          onClose={() => setJurnal(null)}
        />
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
