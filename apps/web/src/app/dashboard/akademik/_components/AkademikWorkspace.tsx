'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import QuestionBankEditor, { type QuestionSourceOption } from './QuestionBankEditor';
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
import { fetchAssessmentSessions, fetchWaliClasses, type AssessmentSessionData, type WaliClassItem } from '../actions';
import {
  assessmentSessionPanelState,
  assessmentSessionQueryKey,
  buildAssessmentSessionCards,
  buildQuestionSourceOptions,
  canStartAssessmentSessionPageRequest,
  createAssessmentSessionRequestGate,
  isAssessmentSessionResponseCurrent,
  mergeAssessmentSessionRegistry,
} from './assessment-workspace-mappers';
import {
  buildAssignmentSessionCandidates,
  type AssessmentTeachingAssignment,
} from './assessment-assignment-candidates';

type Assignment = AssessmentTeachingAssignment;

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
  assessmentSessions: AssessmentSessionData[];
  assessmentSessionTotal?: number;
  assessmentSessionPage?: number;
  assessmentSessionLimit?: number;
  academicYear: string;
  semester: number;
  /** true bila sebagian data inti (nilai/kehadiran) gagal dimuat. */
  dataWarning?: boolean;
  canManageReportCards: boolean;
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
  grades, attendances, assignments, schedules, activities, rpp, lmsModules, todayClasses, assessmentSessions,
  assessmentSessionTotal, assessmentSessionPage, assessmentSessionLimit, academicYear, semester, dataWarning,
  canManageReportCards,
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
    if (!canManageReportCards) {
      setWaliClasses([]);
      return;
    }
    fetchWaliClasses().then((res) => {
      if (res.success && res.data) setWaliClasses(res.data.classes);
    });
  }, [canManageReportCards]);
  // W2-13: 'Rapor Kelas' tab only visible when guru is actually a wali kelas
  const NAV = useMemo(() =>
    canManageReportCards && waliClasses.length > 0
      ? NAV_ALL
      : NAV_ALL.filter((n) => n.key !== 'rapor'),
  [canManageReportCards, waliClasses.length]);
  const [subject, setSubject] = useState<string>('all');
  const [selClass, setSelClass] = useState<string>('all');
  const [absen, setAbsen] = useState<{ classId: string; className: string } | null>(null);
  const [jurnal, setJurnal] = useState<{ classId: string; className: string; subject: string; startLabel: string; jpStart: number } | null>(null);
  const [inputNilai, setInputNilai] = useState(false);
  const [penilaian, setPenilaian] = useState<{ session: TodayClass; mode: 'preview' | 'monitor' | 'analysis'; tab: 'diag' | 'form' | 'fb' } | null>(null);
  const [penilaianPanel, setPenilaianPanel] = useState<'nilai' | 'sesi' | 'bank' | 'koreksi'>('nilai');
  const [penilaianBankOpen, setPenilaianBankOpen] = useState(false);
  const [sessFlow, setSessFlow] = useState<TodayClass | null>(null);
  // Step "Buka Modul Ajar" dari session flow: buka ModulAjarForm DI ATAS modal sesi.
  // RPP match dicari berdasarkan subject + class sesi; bila tak ada → create dgn subject pre-select.
  const [modulFromSession, setModulFromSession] = useState<{ rpp: RppItem | null; subject: string; classId: string } | null>(null);
  // Opsi B (mobile nav): filter sheet collapsible + auto-center active tab.
  const [filterOpen, setFilterOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const activeFilterCount = (selClass !== 'all' ? 1 : 0) + (subject !== 'all' ? 1 : 0);
  const [sessionRegistry, setSessionRegistry] = useState<AssessmentSessionData[]>(assessmentSessions);
  const [sessionTotal, setSessionTotal] = useState(assessmentSessionTotal ?? assessmentSessions.length);
  const [sessionPage, setSessionPage] = useState(assessmentSessionPage ?? 1);
  const [sessionLimit, setSessionLimit] = useState(assessmentSessionLimit ?? 100);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const sessionRequestSeq = useRef(0);
  const sessionFilterKeyRef = useRef('');
  const sessionRequestGate = useMemo(() => createAssessmentSessionRequestGate(), []);
  useEffect(() => {
    setSessionRegistry(assessmentSessions);
    setSessionTotal(assessmentSessionTotal ?? assessmentSessions.length);
    setSessionPage(assessmentSessionPage ?? 1);
    setSessionLimit(assessmentSessionLimit ?? 100);
  }, [assessmentSessionLimit, assessmentSessionPage, assessmentSessionTotal, assessmentSessions]);
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
  const savedAssessmentCards = useMemo<TodayClass[]>(() => buildAssessmentSessionCards({
    assessmentSessions: sessionRegistry,
    subject,
    classId: selClass,
  }), [selClass, sessionRegistry, subject]);
  const correctionAssessmentCards = useMemo(() =>
    savedAssessmentCards.filter((item) => item.assessmentSessionId),
  [savedAssessmentCards]);
  const todaySessionCandidates = useMemo(() => todayClasses
    .filter((item) => subject === 'all' || item.subject === subject)
    .filter((item) => selClass === 'all' || item.classId === selClass),
  [selClass, subject, todayClasses]);
  const assignmentSessionCandidates = useMemo<TodayClass[]>(() =>
    buildAssignmentSessionCandidates({
      assignments,
      lmsModules,
      todayClasses: todaySessionCandidates,
      subject,
      classId: selClass,
      academicYear,
      semester,
    }),
  [academicYear, assignments, lmsModules, selClass, semester, subject, todaySessionCandidates]);
  const bankSourceOptions = useMemo<QuestionSourceOption[]>(() => buildQuestionSourceOptions({
    subject,
    classId: selClass,
    lmsModules,
    rpp,
  }), [lmsModules, rpp, selClass, subject]);
  const sessionFilterKey = useMemo(() => assessmentSessionQueryKey({
    subject,
    classId: selClass,
    academicYear,
    semester,
    limit: sessionLimit,
  }), [academicYear, selClass, semester, sessionLimit, subject]);
  sessionFilterKeyRef.current = sessionFilterKey;
  const loadSessionPage = useCallback(async (page: number, mode: 'replace' | 'append') => {
    const requestKey = sessionFilterKey;
    await sessionRequestGate.run(requestKey, async () => {
      const requestId = sessionRequestSeq.current + 1;
      sessionRequestSeq.current = requestId;
      setSessionLoading(true);
      setSessionError(null);
      try {
        const res = await fetchAssessmentSessions({
          page,
          limit: sessionLimit,
          subject: subject === 'all' ? undefined : subject,
          classId: selClass === 'all' ? undefined : selClass,
          academicYear: academicYear || undefined,
          semester,
        });
        if (!isAssessmentSessionResponseCurrent({
          requestId,
          latestRequestId: sessionRequestSeq.current,
          requestKey,
          currentKey: sessionFilterKeyRef.current,
        })) return;
        setSessionLoading(false);
        if (!res.success || !res.data) {
          setSessionError(res.error ?? (mode === 'append' ? 'Gagal memuat halaman sesi berikutnya.' : 'Gagal memuat sesi asesmen.'));
          return;
        }
        setSessionRegistry((current) => mode === 'append'
          ? mergeAssessmentSessionRegistry(current, res.data!.data)
          : res.data!.data);
        setSessionTotal(res.data.total);
        setSessionPage(res.data.page);
        setSessionLimit(res.data.limit);
      } catch {
        if (!isAssessmentSessionResponseCurrent({
          requestId,
          latestRequestId: sessionRequestSeq.current,
          requestKey,
          currentKey: sessionFilterKeyRef.current,
        })) return;
        setSessionLoading(false);
        setSessionError(mode === 'append' ? 'Gagal memuat halaman sesi berikutnya.' : 'Gagal memuat sesi asesmen.');
      }
    });
  }, [academicYear, selClass, semester, sessionFilterKey, sessionLimit, sessionRequestGate, subject]);
  useEffect(() => {
    void loadSessionPage(1, 'replace');
  }, [loadSessionPage]);
  const hasMoreSessions = sessionRegistry.length < sessionTotal;
  const loadMoreSessions = async () => {
    const appendKey = sessionFilterKey;
    if (!canStartAssessmentSessionPageRequest({
      loading: sessionLoading,
      hasMore: hasMoreSessions,
      inFlight: sessionRequestGate.isInFlight(appendKey),
    })) return;
    await loadSessionPage(sessionPage + 1, 'append');
  };
  const retrySessionRegistry = async () => {
    await loadSessionPage(1, 'replace');
  };
  const sessionPanelState = assessmentSessionPanelState({
    hasSavedSessions: savedAssessmentCards.length > 0,
    hasTodayCandidates: todaySessionCandidates.length > 0 || assignmentSessionCandidates.length > 0,
    loading: sessionLoading,
    error: sessionError,
  });

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
            <div className="mb-3 grid grid-cols-4 gap-1 rounded-xl bg-[#f4f7f5] p-1">
              {([
                ['nilai', 'Nilai'],
                ['sesi', 'Sesi Asesmen'],
                ['bank', 'Bank Soal'],
                ['koreksi', 'Koreksi'],
              ] as const).map(([key, label]) => (
                <button key={key} type="button" onClick={() => setPenilaianPanel(key)} className={clsx('rounded-lg px-2 py-2 text-[11px] font-bold', penilaianPanel === key ? 'bg-white text-emerald-700 shadow-sm' : 'text-[#6b8079]')}>
                  {label}
                </button>
              ))}
            </div>
            {penilaianPanel === 'nilai' && (
              <GradebookPenilaian grades={penilaianGrades} className={selClassName || 'Semua Kelas'} subject={subject === 'all' ? '' : subject} onInputNilai={() => setInputNilai(true)} />
            )}
            {penilaianPanel === 'sesi' && (
              <div className="space-y-2" aria-busy={sessionLoading}>
                {savedAssessmentCards.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-extrabold uppercase tracking-wide text-[#6b8079]">Sesi tersimpan</div>
                    {savedAssessmentCards.map((item) => (
                      <article key={item.assessmentSessionId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#e6efea] px-3 py-2">
                        <div>
                          <div className="text-[12.5px] font-bold text-[#0f2e25]">{item.subject} - {item.className}</div>
                          <div className="text-[11px] font-semibold text-[#6b8079]">{item.startLabel}</div>
                        </div>
                        <button type="button" onClick={() => setPenilaian({ session: item, mode: 'preview', tab: 'diag' })} className="rounded-lg bg-emerald-600 px-3 py-2 text-[11.5px] font-bold text-white">Buka Studio</button>
                      </article>
                    ))}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold text-[#6b8079]">
                      <span>{sessionRegistry.length} dari {sessionTotal} sesi termuat</span>
                      {hasMoreSessions && (
                        <button
                          type="button"
                          onClick={loadMoreSessions}
                          disabled={sessionLoading}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#dfe9e4] bg-white px-2 py-1 font-bold text-emerald-700 disabled:opacity-50"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                          {sessionLoading ? 'Memuat...' : 'Muat sesi berikutnya'}
                        </button>
                      )}
                    </div>
                    {sessionError && (
                      <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700">
                        <span>{sessionError}</span>
                        <button type="button" onClick={retrySessionRegistry} disabled={sessionLoading} className="rounded-md border border-amber-200 bg-white px-2 py-1 text-amber-700 disabled:opacity-50">Coba lagi</button>
                      </div>
                    )}
                  </div>
                )}
                {savedAssessmentCards.length === 0 && todaySessionCandidates.length > 0 && sessionError && (
                  <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700">
                    <span>{sessionError}</span>
                    <button type="button" onClick={retrySessionRegistry} disabled={sessionLoading} className="rounded-md border border-amber-200 bg-white px-2 py-1 text-amber-700 disabled:opacity-50">Coba lagi</button>
                  </div>
                )}
                {todaySessionCandidates.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-extrabold uppercase tracking-wide text-[#6b8079]">Jadwal hari ini</div>
                    {todaySessionCandidates.map((item) => (
                      <article key={`${item.classId}-${item.subject}-${item.startLabel}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#e6efea] px-3 py-2">
                        <div>
                          <div className="text-[12.5px] font-bold text-[#0f2e25]">{item.subject} - {item.className}</div>
                          <div className="text-[11px] font-semibold text-[#6b8079]">{item.startLabel}</div>
                        </div>
                        <button type="button" onClick={() => setPenilaian({ session: item, mode: 'preview', tab: 'diag' })} className="rounded-lg bg-emerald-600 px-3 py-2 text-[11.5px] font-bold text-white">Buka Studio</button>
                      </article>
                    ))}
                  </div>
                )}
                {assignmentSessionCandidates.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-extrabold uppercase tracking-wide text-[#6b8079]">Penugasan mengajar</div>
                    {assignmentSessionCandidates.map((item) => (
                      <article key={`${item.classId}-${item.subject}-assignment`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#e6efea] px-3 py-2">
                        <div>
                          <div className="text-[12.5px] font-bold text-[#0f2e25]">{item.subject} - {item.className}</div>
                          <div className="text-[11px] font-semibold text-[#6b8079]">Siap membuat sesi, jadwal tidak wajib.</div>
                        </div>
                        <button type="button" onClick={() => setPenilaian({ session: item, mode: 'preview', tab: 'diag' })} className="rounded-lg bg-emerald-600 px-3 py-2 text-[11.5px] font-bold text-white">Buka Studio</button>
                      </article>
                    ))}
                  </div>
                )}
                {sessionPanelState === 'loading' && (
                  <div role="status" className="rounded-xl border border-dashed border-[#dfe9e4] p-6 text-center text-[12.5px] font-semibold text-[#6b8079]">Memuat sesi asesmen...</div>
                )}
                {sessionPanelState === 'error' && (
                  <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
                    <div className="text-[12.5px] font-bold text-amber-800">{sessionError}</div>
                    <button type="button" onClick={retrySessionRegistry} disabled={sessionLoading} className="mt-3 rounded-lg bg-amber-600 px-3 py-2 text-[11.5px] font-bold text-white disabled:opacity-50">Coba lagi</button>
                  </div>
                )}
                {sessionPanelState === 'empty' && (
                  <div className="rounded-xl border border-dashed border-[#dfe9e4] p-6 text-center text-[12.5px] font-semibold text-[#9bb0a8]">Belum ada sesi atau penugasan mengajar yang cocok untuk filter ini.</div>
                )}
              </div>
            )}
            {penilaianPanel === 'bank' && (
              <div className="rounded-xl border border-[#e6efea] p-4">
                <div className="text-[13px] font-bold text-[#0f2e25]">Bank Soal</div>
                <div className="mt-1 text-[12px] font-semibold text-[#6b8079]">Kelola soal manual, import CSV, dan draft AI berbasis Modul/RPP dari Session Studio.</div>
                <button type="button" onClick={() => setPenilaianBankOpen(true)} disabled={subject === 'all'} className="mt-3 rounded-lg bg-emerald-600 px-3 py-2 text-[12px] font-bold text-white disabled:opacity-50">Buka Bank Soal</button>
              </div>
            )}
            {penilaianPanel === 'koreksi' && (
              <div className="space-y-2" aria-busy={sessionLoading}>
                {correctionAssessmentCards.length === 0 && sessionLoading ? (
                  <div role="status" className="rounded-xl border border-dashed border-[#dfe9e4] p-6 text-center text-[12.5px] font-semibold text-[#6b8079]">Memuat sesi koreksi...</div>
                ) : correctionAssessmentCards.length === 0 && sessionError ? (
                  <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
                    <div className="text-[12.5px] font-bold text-amber-800">{sessionError}</div>
                    <button type="button" onClick={retrySessionRegistry} disabled={sessionLoading} className="mt-3 rounded-lg bg-amber-600 px-3 py-2 text-[11.5px] font-bold text-white disabled:opacity-50">Coba lagi</button>
                  </div>
                ) : correctionAssessmentCards.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[#dfe9e4] p-6 text-center text-[12.5px] font-semibold text-[#9bb0a8]">Belum ada sesi asesmen aktif/selesai yang bisa dibuka untuk koreksi.</div>
                ) : correctionAssessmentCards.map((item) => (
                  <article key={`${item.assessmentSessionId}-correction`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#e6efea] px-3 py-2">
                    <div>
                      <div className="text-[12.5px] font-bold text-[#0f2e25]">{item.subject} - {item.className}</div>
                      <div className="text-[11px] font-semibold text-[#6b8079]">Buka analisis untuk koreksi esai pending.</div>
                    </div>
                    <button type="button" onClick={() => setPenilaian({ session: item, mode: 'analysis', tab: 'form' })} className="rounded-lg bg-amber-500 px-3 py-2 text-[11.5px] font-bold text-white">Buka Koreksi</button>
                  </article>
                ))}
              </div>
            )}
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
          academicYear={academicYear}
          semester={semester}
          initialMode={penilaian.mode}
          initialTab={penilaian.tab}
          onClose={() => setPenilaian(null)}
        />
      )}

      {/* Modul Ajar popup dari session flow (step "Buka Modul Ajar") — DI ATAS modal sesi.
          z-50 (Dialog) > z-40 (SessionFlowModal). Modal sesi tetap terbuka di bawah. */}
      {penilaianBankOpen && subject !== 'all' && (
        <QuestionBankEditor
          subject={subject}
          sourceOptions={bankSourceOptions}
          onClose={() => setPenilaianBankOpen(false)}
        />
      )}
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
