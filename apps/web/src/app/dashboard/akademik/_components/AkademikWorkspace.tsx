'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutDashboard, CalendarClock, BookOpenCheck, ClipboardPenLine, CalendarCheck,
  ClipboardList, Award, ClipboardCheck, BookMarked, Calendar, UserCheck, Users, AlertTriangle,
  SlidersHorizontal, ChevronDown,
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
import PenilaianSesiModal from './PenilaianSesiModal';
import SessionFlowModal from './SessionFlowModal';
import ModulAjarForm from './ModulAjarForm';
import KehadiranGuru from './KehadiranGuru';
import PenugasanGuru from './PenugasanGuru';
import RaporWaliKelas from './guru/RaporWaliKelas';
import { fetchWaliClasses, type WaliClassItem } from '../actions';

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
  /** true bila sebagian data inti (nilai/kehadiran) gagal dimuat. */
  dataWarning?: boolean;
}

type Screen = 'ringkasan' | 'jadwal' | 'pembelajaran' | 'penilaian' | 'kehadiran' | 'penugasan' | 'capaian' | 'rekap' | 'rapor';

const NAV_ALL: { key: Screen; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'ringkasan', label: 'Ringkasan', icon: LayoutDashboard },
  { key: 'jadwal', label: 'Jadwal', icon: CalendarClock },
  { key: 'pembelajaran', label: 'Pembelajaran', icon: BookOpenCheck },
  { key: 'penilaian', label: 'Penilaian', icon: ClipboardPenLine },
  { key: 'kehadiran', label: 'Kehadiran', icon: CalendarCheck },
  { key: 'penugasan', label: 'Penugasan', icon: ClipboardList },
  { key: 'capaian', label: 'Capaian & Rapor', icon: Award },
  { key: 'rekap', label: 'Rekap', icon: ClipboardCheck },
  { key: 'rapor', label: 'Rapor Kelas', icon: Award }, // W2-13: conditional on waliClasses
];

export default function AkademikWorkspace({
  grades, attendances, assignments, schedules, activities, rpp, lmsModules, todayClasses, academicYear, semester, dataWarning,
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
  // W2-B-5: Wali kelas detection — fetch real wali classes from /teachers/me/wali-classes
  const [waliClasses, setWaliClasses] = useState<WaliClassItem[]>([]);
  useEffect(() => {
    fetchWaliClasses().then((res) => {
      if (res.success && res.data) setWaliClasses(res.data.classes);
    });
  }, []);
  // W2-13: 'Rapor Kelas' tab only visible when guru is actually a wali kelas
  const NAV = useMemo(() =>
    waliClasses.length > 0 ? NAV_ALL : NAV_ALL.filter((n) => n.key !== 'rapor'),
  [waliClasses.length]);
  const [subject, setSubject] = useState<string>('all');
  const [selClass, setSelClass] = useState<string>('all');
  const [absen, setAbsen] = useState<{ classId: string; className: string } | null>(null);
  const [jurnal, setJurnal] = useState<{ classId: string; className: string; subject: string; startLabel: string; jpStart: number } | null>(null);
  const [inputNilai, setInputNilai] = useState(false);
  const [penilaian, setPenilaian] = useState<{ session: TodayClass; mode: 'preview' | 'monitor' | 'analysis'; tab: 'diag' | 'form' | 'fb' } | null>(null);
  const [sessFlow, setSessFlow] = useState<TodayClass | null>(null);
  // Step "Buka Modul Ajar" dari session flow: buka ModulAjarForm DI ATAS modal sesi.
  // RPP match dicari berdasarkan subject + class sesi; bila tak ada → create dgn subject pre-select.
  const [modulFromSession, setModulFromSession] = useState<{ rpp: RppItem | null; subject: string; classId: string } | null>(null);
  // Opsi B (mobile nav): filter sheet collapsible + auto-center active tab.
  const [filterOpen, setFilterOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const activeFilterCount = (selClass !== 'all' ? 1 : 0) + (subject !== 'all' ? 1 : 0);
  useEffect(() => {
    // Auto-scroll tab aktif ke posisi terlihat (anti hidden saat ganti screen).
    const nav = navRef.current;
    if (!nav) return;
    const active = nav.querySelector<HTMLElement>('[data-active="true"]');
    if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [screen]);

  const selClassName = selClass === 'all' ? '' : (guruClasses.find((c) => c.id === selClass)?.name ?? '');

  const penilaianGrades = grades.filter((g) =>
    (subject === 'all' ? false : g.assignment.subject === subject) &&
    (selClass === 'all' ? true : g.assignment.class.name === selClassName));
  const inputAssignmentId = assignments.find((a) => a.subject === subject && a.class?.name === selClassName)?.id;

  return (
    <div className="space-y-1">
      {/* Header + filter pill (mobile) */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0f2e25]">Akademik</h1>
          <p className="text-sm text-[#6b8079]">Dashboard Guru — pembelajaran, penilaian &amp; jadwal mengajar</p>
        </div>
        {/* Filter pill — mobile only. Desktop pakai context bar inline di bawah. */}
        <button
          type="button"
          onClick={() => setFilterOpen((o) => !o)}
          aria-expanded={filterOpen}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#e6efea] bg-white px-3 py-2 text-[12.5px] font-bold text-[#355a4e] shadow-sm sm:hidden"
        >
          <SlidersHorizontal className="h-4 w-4 text-emerald-600" />
          Filter
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-extrabold text-emerald-700">{activeFilterCount}</span>
          )}
          <ChevronDown className={clsx('h-3.5 w-3.5 text-[#6b8079] transition-transform', filterOpen && 'rotate-180')} />
        </button>
      </div>

      {dataWarning && (
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Sebagian data gagal dimuat dari server. Muat ulang halaman; bila berlanjut, sesi mungkin berakhir — keluar lalu masuk lagi.
        </div>
      )}

      {/* Mobile filter sheet — collapsible (Opsi B). Desktop bar di bawah. */}
      {filterOpen && (
        <div className="mt-2 flex flex-col gap-2 sm:hidden">
          <span className="inline-flex items-center gap-2 rounded-xl border border-[#e6efea] bg-white px-3 py-2 text-[12.5px] font-semibold text-[#355a4e] shadow-sm">
            <Calendar className="h-[15px] w-[15px] text-emerald-600" />TA {academicYear || '—'} · Semester {semester}
          </span>
          <label className="inline-flex items-center gap-2 rounded-xl border border-[#e6efea] bg-white px-3 py-2 text-[12.5px] font-semibold text-[#355a4e] shadow-sm">
            <Users className="h-[15px] w-[15px] text-emerald-600" />
            <select value={selClass} onChange={(e) => setSelClass(e.target.value)} className="w-full bg-transparent outline-none">
              <option value="all">Semua Kelas</option>
              {guruClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="inline-flex items-center gap-2 rounded-xl border border-[#e6efea] bg-white px-3 py-2 text-[12.5px] font-semibold text-[#355a4e] shadow-sm">
            <BookMarked className="h-[15px] w-[15px] text-emerald-600" />
            <select value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full bg-transparent outline-none">
              <option value="all">Semua Mapel</option>
              {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        </div>
      )}

      {/* Context bar — desktop only (sm:flex). Mobile pakai filter pill di atas. */}
      <div className="mt-3 hidden flex-wrap items-center gap-2 sm:flex">
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
        <span className="ml-auto inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11.5px] font-bold text-blue-700">
          <UserCheck className="h-3.5 w-3.5" />Tampilan guru · kelas yang diampu
        </span>
      </div>

      {/* Sub-nav — Opsi B: horizontal scroll + fade affordance + auto-center active (mobile), wrap (desktop) */}
      <div className="relative">
        <nav
          ref={navRef}
          className="mt-4 flex gap-2 overflow-x-auto border-b border-[#e6efea] pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-x-visible"
        >
          {NAV.map((n) => {
            const Icon = n.icon;
            const on = screen === n.key;
            return (
              <button
                key={n.key}
                type="button"
                data-active={on || undefined}
                onClick={() => setScreen(n.key)}
                className={clsx('inline-flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2 text-[13px] font-bold',
                  on ? 'border-emerald-600 bg-emerald-600 text-white shadow-[0_8px_18px_-8px_rgba(5,150,105,.5)]' : 'border-[#e6efea] bg-white text-[#355a4e] hover:border-emerald-200')}
              >
                <Icon className={clsx('h-4 w-4', on ? 'text-white' : 'text-[#6b8079]')} />{n.label}
              </button>
            );
          })}
        </nav>
        {/* Edge fade gradient — sinyal visual "masih ada tab →" (mobile only, fix discoverability) */}
        <div className="pointer-events-none absolute right-0 top-0 h-[calc(100%-0.75rem)] w-10 bg-gradient-to-r from-transparent to-gray-50 sm:hidden" />
      </div>

      <div className="pt-4">
        {screen === 'ringkasan' && (
          <RingkasanGuru
            grades={grades} attendances={attendances} activities={activities} rpp={rpp} todayClasses={todayClasses}
            onAbsen={(c) => setAbsen(c)} onJurnal={(c) => setJurnal(c)} onNavigate={(s) => setScreen(s as Screen)}
            onStartSession={(c) => setSessFlow(c)} onPenilaian={(c) => setPenilaian({ session: c, mode: 'preview', tab: 'diag' })}
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
          <PembelajaranGuru rpp={rpp} lmsModules={lmsModules} subjects={subjects} classes={guruClasses} academicYear={academicYear} semester={semester} activeSubject={subject} onClearSubject={() => setSubject('all')} />
        )}

        {screen === 'penilaian' && (
          <Card title={`Penilaian${subject !== 'all' ? ` — ${subject}` : ''}${selClassName ? ` · ${selClassName}` : ''}`} icon={ClipboardPenLine}>
            {subject === 'all' && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-700">Pilih <b>Mapel</b> di bar atas untuk menampilkan nilai gradebook.</p>}
            <GradebookPenilaian grades={penilaianGrades} className={selClassName || 'Semua Kelas'} subject={subject === 'all' ? '' : subject} onInputNilai={() => setInputNilai(true)} />
          </Card>
        )}

        {screen === 'kehadiran' && (
          <KehadiranGuru attendances={attendances} className={selClassName} classId={selClass === 'all' ? undefined : selClass} />
        )}

        {screen === 'penugasan' && (
          <PenugasanGuru />
        )}

        {screen === 'capaian' && (
          <CapaianRapor grades={grades} className={selClassName} academicYear={academicYear} semester={semester} />
        )}

        {screen === 'rapor' && (
          <RaporWaliKelas waliClasses={waliClasses.map((c) => ({ id: c.id, name: c.name }))} academicYear={academicYear} semester={semester} />
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
      {sessFlow && (
        <SessionFlowModal
          session={sessFlow}
          onAbsen={(c) => setAbsen(c)}
          onJurnal={(c) => setJurnal(c)}
          onOpenPenilaian={(s, mode, tab) => setPenilaian({ session: s, mode, tab })}
          onOpenModule={(session) => {
            // Buka popup Modul Ajar DI ATAS modal sesi (z-50 > z-40).
            // Cari RPP match subject (+classId sesi); bila tak ada → create dgn subject pre-select.
            // Modal sesi TETAP TERBUKA — flow tak terputus (pola sama dgn step 3).
            const match =
              rpp.find((r) => r.subject === session.subject && (r.classId ?? '') === session.classId) ??
              rpp.find((r) => r.subject === session.subject) ??
              null;
            setModulFromSession({ rpp: match, subject: session.subject, classId: session.classId });
          }}
          onClose={() => setSessFlow(null)}
        />
      )}
      {penilaian && (
        <PenilaianSesiModal
          session={penilaian.session}
          initialMode={penilaian.mode}
          initialTab={penilaian.tab}
          onClose={() => setPenilaian(null)}
        />
      )}

      {/* Modul Ajar popup dari session flow (step "Buka Modul Ajar") — DI ATAS modal sesi.
          z-50 (Dialog) > z-40 (SessionFlowModal). Modal sesi tetap terbuka di bawah. */}
      {modulFromSession && (
        <ModulAjarForm
          key={modulFromSession.rpp?.id ?? 'session-modul'}
          open={true}
          onClose={() => setModulFromSession(null)}
          subjects={subjects}
          classes={guruClasses}
          academicYear={academicYear}
          semester={semester}
          editing={modulFromSession.rpp}
          defaultSubject={modulFromSession.subject}
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

