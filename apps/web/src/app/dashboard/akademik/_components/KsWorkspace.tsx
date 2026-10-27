'use client';

// =============================================================================
// KsWorkspace — Dashboard KS / Waka Kurikulum (F4 — mockup adoption).
// 7 screens: Beranda · Modul Ajar (RPP approval) · Monitoring Sumatif ·
// Monitoring KBM · Rekap Audit · KKTP · Jadwal & Tugas.
// Desktop-first. Real data where APIs exist.
// Mockup ref: .tasks/akademik-mockup/akademik-ks.html (1,305 lines)
// =============================================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ScheduleBoard, { ScheduleReadProvider, useScheduleRead } from './ks/ScheduleBoard';
import SchedulingMonitoringPanel from './ks/SchedulingMonitoringPanel';
import LearningRecap from './LearningRecap';
import { MonitoringSchema, type SchedulingMonitoring } from '@/lib/scheduling-monitoring';
import {
  LayoutDashboard, FileCheck2, ClipboardPenLine, Monitor, ClipboardCheck,
  Target, CalendarClock, Users, BadgeCheck, Presentation, FileClock,
  AlertTriangle, Activity, TrendingUp, ListChecks, ChevronRight,
  Check, CheckCircle2, Info, LayoutGrid, SlidersHorizontal,
  Route, Lightbulb, Paperclip, FileText,
  type LucideIcon,
} from 'lucide-react';
import clsx from 'clsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import type { GradeItem, AttendanceItem } from '@/lib/api';
import type { ScheduleItem, ActivityItem, RppItem, ClassRef, LmsModuleItem } from './guru-types';
import { resolveProfileFramework } from './modul-ajar-profile';
import KktpKs from './ks/KktpKs';
import { scheduleDayOfWeek, wibTodayISO, wibDateLabel } from '@/lib/bell-times';
import { fetchMonitoringKbm, fetchTeacherAttendanceToday } from '../actions';
import type { AssessmentSessionData, TeacherAttendanceSummary } from '../actions';
import RaporPipelineKs from './ks/RaporPipelineKs';
import {
  academicWorkflowPresentation,
  type AcademicWorkflowView,
} from '@/lib/academic-workflow-deep-link';

// ── Types ────────────────────────────────────────────────────────────────────

interface Assignment { id: string; subject: string; teacherId?: string; teacher?: { id: string; user: { fullName: string } }; class: { id: string; name: string } }

interface Props {
  grades: GradeItem[];
  attendances: AttendanceItem[];
  classes: ClassRef[];
  assignments: Assignment[];
  rpp: RppItem[];
  schedules: ScheduleItem[];
  activities: ActivityItem[];
  lmsModules: LmsModuleItem[];
  realSumatif?: AssessmentSessionData[];
  subjects?: { id: string; code: string; name: string; isActive: boolean }[];
  academicYear: string;
  semester: number;
  dataWarning?: boolean;
  rppAvailable?: boolean;
  assessmentsAvailable?: boolean;
  scheduleAvailable?: boolean;
  initialWorkflowView?: AcademicWorkflowView | null;
  canReadClassSessions?: boolean;
}

type Screen = 'beranda' | 'modul' | 'sumatif' | 'monitor' | 'rekap' | 'kktp' | 'jadwal' | 'rapor' | 'sesi';

const NAV: { key: Screen; label: string; icon: LucideIcon; badge?: number }[] = [
  { key: 'beranda', label: 'Beranda', icon: LayoutDashboard },
  { key: 'sesi', label: 'Rekap Pembelajaran', icon: CalendarClock },
  { key: 'modul', label: 'Modul Ajar', icon: FileCheck2 },
  { key: 'sumatif', label: 'Sumatif', icon: ClipboardPenLine },
  { key: 'monitor', label: 'Monitoring KBM', icon: Monitor },
  { key: 'rekap', label: 'Rekap Audit', icon: ClipboardCheck },
  { key: 'kktp', label: 'KKTP', icon: Target },
  { key: 'jadwal', label: 'Jadwal & Tugas', icon: CalendarClock },
  { key: 'rapor', label: 'Rapor', icon: FileText },
];

const DOW = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

// ── Types & config ───────────────────────────────────────────────────────────

type SumatifStatus = 'Draft' | 'Aktif' | 'Selesai';

interface SumatifItem {
  id: string;
  title: string;
  subject: string;
  className: string;
  questionCount: number;
  responseCount: number;
  status: SumatifStatus;
  durationMinutes: number | null;
  startedAt: string | null;
  completedAt: string | null;
}

function sumatifStatus(status: string): SumatifStatus {
  if (status === 'active') return 'Aktif';
  if (status === 'completed') return 'Selesai';
  return 'Draft';
}

// Scheduling structural config (NOT simulasi — these are real school parameters)

// U6: SIM_HEALTH, SIM_TREN_*, SIM_RPP_SLOW removed — refactored to honest empty states
// P0: SIM_SUMATIF fake array → type-only (SumatifItem). SIM_SCHED_CONFLICTS → empty.
//      SIM_KKTP_DATA, SIM_GURU_LIST, SIM_MON_GURUS, genSimMonitor → deleted.
//      Prod shows real data or honest empty-state, never fake fallback data.

// ── Component ────────────────────────────────────────────────────────────────

export default function KsWorkspace({
  grades: _sourceGrades, attendances: sourceAttendances, classes: sourceClasses, assignments: sourceAssignments, rpp: sourceRpp, schedules: sourceSchedules, activities: _sourceActivities, lmsModules: _lmsModules, realSumatif, subjects, academicYear, semester, dataWarning, scheduleAvailable = false, rppAvailable = false, assessmentsAvailable = false, initialWorkflowView = null, canReadClassSessions = false,
}: Props) {
  const router = useRouter(), searchParams = useSearchParams();
  const [filterGuru, setFilterGuru] = useState('');
  const [filterMapel, setFilterMapel] = useState('');
  const teacherOptions = [...new Map(sourceAssignments.flatMap(a => a.teacher ? [[a.teacher.id,a.teacher.user.fullName] as const] : [])).entries()].sort((a,b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]));
  const filterMapelOpts = [...new Set(sourceAssignments.map(a => a.subject))].sort();
  const assignments = sourceAssignments.filter(a => (!filterGuru || (a.teacherId ?? a.teacher?.id) === filterGuru) && (!filterMapel || a.subject === filterMapel));
  const assignmentIds = new Set(assignments.map(a => a.id));
  const classIds = new Set(assignments.map(a => a.class.id));
  const filtered = !!filterGuru || !!filterMapel;
  const schedules = sourceSchedules.filter(s => !filtered || !!s.teachingAssignment.id && assignmentIds.has(s.teachingAssignment.id));
  const classes = sourceClasses.filter(c => !filtered || classIds.has(c.id));
  const attendances = sourceAttendances.filter(a => !filtered || classIds.has(a.classId));
  const rpp = sourceRpp.filter(row => (!filterMapel || row.subject === filterMapel) && (!filterGuru || row.teacherId === filterGuru));
  const [loadedMonitoring, setMonitoring] = useState<SchedulingMonitoring | null>(null);
  const monitoring = loadedMonitoring?.academicYear === academicYear && loadedMonitoring?.semester === semester && loadedMonitoring?.filters.teacherId === (filterGuru || null) && loadedMonitoring?.filters.subject === (filterMapel || null) ? loadedMonitoring : null;
  const [monitorError, setMonitorError] = useState<string | null>(null), [monitorBusy, setMonitorBusy] = useState(false), [monitorRevision, setMonitorRevision] = useState(0);
  useEffect(() => {
    let active = true; setMonitoring(null); setMonitorError(null); setMonitorBusy(true);
    fetchMonitoringKbm(academicYear,semester,{ teacherId: filterGuru || undefined, subject: filterMapel || undefined }).then(result => {
      if (!active) return;
      const parsed = result.success ? MonitoringSchema.safeParse(result.data) : null;
      if (parsed?.success && parsed.data.state === 'ready' && parsed.data.academicYear === academicYear && parsed.data.semester === semester) setMonitoring(parsed.data);
      else setMonitorError(result.error || (parsed?.success ? parsed.data.reason : null) || 'Sumber monitoring belum tersedia.');
    }).catch(() => { if (active) setMonitorError('Sumber monitoring belum tersedia.'); }).finally(() => { if (active) setMonitorBusy(false); });
    return () => { active = false; };
  }, [academicYear,semester,filterGuru,filterMapel,monitorRevision]);
  const monitoringRead = { data: monitoring, error: monitorError, loading: monitorBusy, retry: () => setMonitorRevision(value => value+1) };
  const initialWorkflow = academicWorkflowPresentation(initialWorkflowView);
  const [screen, setScreen] = useState<Screen>(initialWorkflow.leadershipScreen);
  // Opsi B (mobile nav): auto-center tab aktif saat ganti screen (anti hidden).
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const active = nav.querySelector<HTMLElement>('[data-active="true"]');
    if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [screen]);
  const [selRpp, setSelRpp] = useState<RppItem | null>(null);
  const sumatifData = useMemo<SumatifItem[]>(() => (realSumatif ?? [])
    .filter(item => item.academicYear === academicYear && item.semester === semester && (!filterGuru || item.teacherId === filterGuru) && (!filterMapel || item.module?.subject === filterMapel || item.teachingAssignment?.subject === filterMapel))
    .filter((item) => item.type.toLowerCase() === 'sumatif')
    .map((item) => ({
      id: item.id,
      title: item.title,
      subject: item.module?.subject ?? '—',
      className: item.class?.name ?? '—',
      questionCount: item.questions?.length ?? 0,
      responseCount: item._count?.responses ?? 0,
      status: sumatifStatus(item.status),
      durationMinutes: item.durationMinutes,
      startedAt: item.startedAt,
      completedAt: item.completedAt,
    })), [realSumatif, academicYear, semester, filterGuru, filterMapel]);
  const [selSumatif, setSelSumatif] = useState<SumatifItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // Derived data
  const pendingRpp = useMemo(
    () => rpp.filter((r) => r.status === 'submitted' || r.status === 'curriculum_reviewed'),
    [rpp],
  );
  const activeSumatif = sumatifData.filter((s) => s.status === 'Aktif');

  const navWithBadges = NAV.map((n) => {
    if (n.key === 'modul') return { ...n, badge: pendingRpp.length };
    if (n.key === 'sumatif') return { ...n, badge: activeSumatif.length };
    return n;
  });

  // KPI calculations from real data
  const todayISO = wibTodayISO();
  const todayAtt = attendances.filter((a) => a.date?.slice(0, 10) === todayISO);
  const hadirPct = attendances.length ? Math.round((attendances.filter((a) => a.status === 'hadir').length / attendances.length) * 100) : null;

  // Thresholds and counts are resolved by the authoritative API, never by a local fallback.
  const kelasMapel = useMemo(() => (monitoring?.data ?? []).map(row => ({
    kelas: row.kelas, mapel: row.mapel, count: row.gradeCount, avg: row.avg, tuntasPct: row.tuntasPct,
  })), [monitoring]);
  const belowKktp = kelasMapel.filter(k => k.tuntasPct !== null && k.tuntasPct < 75);

  return (
    <ScheduleReadProvider value={{ academicYear, semester, teacherId: filterGuru, subject: filterMapel, available: scheduleAvailable, subjects: subjects ?? [] }}><div className="space-y-1">
      <h1 className="text-2xl font-bold tracking-tight text-[#0f2e25]">Dashboard KS / Waka Kurikulum</h1>
      <p className="text-sm text-[#6b8079]">Pengawasan akademik · approval modul ajar · monitoring sumatif · monitoring KBM</p>

      {dataWarning && screen !== 'sesi' && (
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />Sebagian data gagal dimuat dari server. Muat ulang halaman jika berlanjut.
        </div>
      )}

      {/* Global Filter Bar */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-[#9bb0a8]">
          <SlidersHorizontal className="h-3.5 w-3.5" />{screen === 'sesi' ? 'Periode' : 'Filter'}
        </span>
        <span className="inline-flex items-center gap-2 rounded-xl border border-[#e6efea] bg-white px-3 py-2 text-[12.5px] font-bold text-[#355a4e] shadow-sm">
          <CalendarClock className="h-[15px] w-[15px] text-emerald-600" />TA {academicYear || '—'}
        </span>
        <div className="inline-flex rounded-xl bg-[#f4f7f5] p-1">
          {([1,2] as const).map((s) => (
            <button key={s} type="button" onClick={() => {
              const query = new URLSearchParams(searchParams.toString()); query.set('academicYear', academicYear); query.set('semester', String(s));
              if (screen === 'sesi') query.set('view', 'learning-recap');
              router.push('/dashboard/akademik?' + query.toString());
            }}
              className={clsx('rounded-lg px-3 py-1.5 text-[12px] font-bold', semester === s ? 'bg-white text-emerald-700 shadow-sm' : 'text-[#6b8079]')}>
              {s === 1 ? 'Ganjil' : 'Genap'}
            </button>
          ))}
        </div>
        <select hidden={screen === 'sesi'} aria-label="Filter guru" value={filterGuru} onChange={(e) => setFilterGuru(e.target.value)}
          className="rounded-xl border border-[#e6efea] bg-white px-3 py-2 text-[12.5px] font-bold text-[#355a4e] shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600">
          <option value="">Semua Guru</option>
          {teacherOptions.map(([id,name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select hidden={screen === 'sesi'} aria-label="Filter mata pelajaran" value={filterMapel} onChange={(e) => setFilterMapel(e.target.value)}
          className="rounded-xl border border-[#e6efea] bg-white px-3 py-2 text-[12.5px] font-bold text-[#355a4e] shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600">
          <option value="">Semua Mapel</option>
          {filterMapelOpts.map((m) => <option key={m}>{m}</option>)}
        </select>
        {screen !== 'sesi' && <><span className="ml-auto hidden items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11.5px] font-bold text-blue-700 sm:inline-flex">
          <Users className="h-3.5 w-3.5" />{classes.length} rombel · {assignments.length} penugasan
        </span>
        <span className="hidden items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11.5px] font-bold text-emerald-700 sm:inline-flex">
          <BadgeCheck className="h-3.5 w-3.5" />Kepala Sekolah
        </span>
        <span className="hidden items-center gap-1.5 rounded-lg bg-sky-50 px-2.5 py-1 text-[10px] font-bold text-sky-700 sm:inline-flex"><Check className="h-3 w-3" /> Filter Aktif</span></>}
      </div>

      {/* Sub-nav — Opsi B: horizontal scroll + fade affordance + auto-center active (mobile), wrap (desktop) */}
      <div className="relative">
        <nav
          ref={navRef}
          className="mt-4 flex gap-2 overflow-x-auto border-b border-[#e6efea] pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-x-visible"
        >
          {navWithBadges.map((n) => {
            const Icon = n.icon;
            const on = screen === n.key;
            return (
              <button
                key={n.key}
                type="button"
                data-active={on || undefined}
                onClick={() => setScreen(n.key)}
                className={clsx('inline-flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2 text-[13px] font-bold',
                  on ? 'border-emerald-600 bg-emerald-600 text-white shadow-[0_8px_18px_-8px_rgba(5,150,105,.5)]' : 'border-[#e6efea] bg-white text-[#355a4e] hover:border-emerald-200')}>
                <Icon className={clsx('h-4 w-4', on ? 'text-white' : 'text-[#6b8079]')} />{n.label}
                {n.badge ? <span className={clsx('rounded-full px-1.5 py-0.5 text-[9px] font-extrabold', on ? 'bg-white/25 text-white' : 'bg-rose-500 text-white')}>{n.badge}</span> : null}
              </button>
            );
          })}
        </nav>
        {/* Edge fade gradient — sinyal "masih ada tab →" (mobile only, fix discoverability) */}
        <div className="pointer-events-none absolute right-0 top-0 h-[calc(100%-0.75rem)] w-10 bg-gradient-to-r from-transparent to-gray-50 sm:hidden" />
      </div>

      <div className="pt-4">
        {screen === 'sesi' && <LearningRecap key={`${academicYear}|${semester}`} academicYear={academicYear} semester={semester} scope="operations" canRead={canReadClassSessions} />}
        {screen === 'beranda' && <BerandaKs hadirPct={hadirPct} todayAtt={todayAtt} attendances={attendances} dataComplete={!dataWarning && !!monitoring} pendingRpp={rppAvailable ? pendingRpp.length : null} activeSumatif={assessmentsAvailable ? activeSumatif.length : null} belowKktp={belowKktp} schedules={schedules} classes={classes} onNavigate={setScreen} />}
        {screen === 'modul' && <ModulAjarKs rpp={rpp} onReview={setSelRpp} />}
        {screen === 'sumatif' && <AuditSumatifKs onOpenDetail={setSelSumatif} data={sumatifData} />}
        {screen === 'monitor' && <SchedulingMonitoringPanel academicYear={academicYear} semester={semester} teacherId={filterGuru || undefined} subject={filterMapel || undefined} subjects={subjects} readResult={monitoringRead} />}
        {screen === 'rekap' && <SchedulingMonitoringPanel academicYear={academicYear} semester={semester} teacherId={filterGuru || undefined} subject={filterMapel || undefined} subjects={subjects} readResult={monitoringRead} audit />}
        {screen === 'kktp' && <KktpKs kelasMapel={kelasMapel} subjects={subjects ?? []} showToast={showToast} academicYear={academicYear} semester={semester} />}
        {screen === 'jadwal' && <JadwalTugasKs schedules={schedules} classes={classes} pendingRpp={pendingRpp} activeSumatif={activeSumatif} />}
        {screen === 'rapor' && <RaporPipelineKs academicYear={academicYear} semester={semester} />}
      </div>

      {/* Modul Ajar Detail Modal */}
      {selRpp && <RppDetailModal rpp={selRpp} onClose={() => setSelRpp(null)} />}

      {/* Sumatif Detail Modal */}
      {selSumatif && <SumatifDetailModal item={selSumatif} onClose={() => setSelSumatif(null)} />}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-[#0f2e25] px-4 py-3 text-[12.5px] font-bold text-white shadow-lg">
          {toast}
        </div>
      )}
    </div></ScheduleReadProvider>
  );
}

// ═══ SCREEN 1: BERANDA ════════════════════════════════════════════════════════

function BerandaKs({ hadirPct: _hadirPct, todayAtt, attendances, dataComplete, pendingRpp, activeSumatif, belowKktp, schedules, classes, onNavigate }: {
  hadirPct: number | null; todayAtt: AttendanceItem[]; attendances: AttendanceItem[]; dataComplete: boolean; pendingRpp: number | null; activeSumatif: number | null;
  belowKktp: { kelas: string; mapel: string; tuntasPct: number | null }[];
  schedules: ScheduleItem[]; classes: ClassRef[]; onNavigate: (s: Screen) => void;
}) {
  const [trenPeriod, setTrenPeriod] = useState<'10H' | '1B' | '3B'>('10H');
  const [berandaModal, setBerandaModal] = useState<null | 'kehadiran' | 'guruHadir' | 'kelasBerjalan'>(null);
  // P1 (S-05): Fetch real teacher attendance for KS dashboard
  const [teacherAtt, setTeacherAtt] = useState<TeacherAttendanceSummary | null>(null);
  const read = useScheduleRead();
  const trenData = useMemo(() => {
    if (!read.period.period) return null;
    const days = trenPeriod === '10H' ? 10 : trenPeriod === '1B' ? 30 : 90;
    const end = Math.min(Date.parse(wibTodayISO()),Date.parse(read.period.period.endDate.slice(0,10)));
    const start = Math.max(end-(days-1)*86400000,Date.parse(read.period.period.startDate.slice(0,10)));
    const siswa: (number | null)[] = [];
    for (let stamp = start; stamp <= end; stamp += 86400000) {
      const date = new Date(stamp).toISOString().slice(0,10), recorded = attendances.filter(row => row.date.slice(0,10) === date);
      siswa.push(recorded.length ? Math.round(recorded.filter(row => row.status === 'hadir').length/recorded.length*100) : null);
    }
    return siswa.some(value => value !== null) ? { siswa, guru: [] as (number | null)[] } : null;
  }, [read.period.period,attendances,trenPeriod]);
  const dow = scheduleDayOfWeek();
  const todaySchedules = schedules.filter((s) => s.dayOfWeek === dow);
  const activeClasses = new Set(todaySchedules.map((s) => s.classId)).size;
  const todayHadirPct = todayAtt.length ? Math.round((todayAtt.filter((a) => a.status === 'hadir').length / todayAtt.length) * 100) : null;

  // P1 (S-05): Fetch teacher attendance on mount
  useEffect(() => {
    let active = true; setTeacherAtt(null);
    fetchTeacherAttendanceToday({ academicYear: read.academicYear, semester: read.semester, teacherId: read.teacherId || undefined, subject: read.subject || undefined }).then((res) => {
      if (active && res.success && res.data) setTeacherAtt(res.data);
    }).catch(() => { /* Retain unavailable state, never substitute zero. */ });
    return () => { active = false; };
  }, [read.academicYear,read.semester,read.teacherId,read.subject]);


  return (
    <div className="space-y-4">
      {/* KPI grid */}
      {!dataComplete && <p role="status" className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Sebagian sumber belum terverifikasi dalam cakupan ini. Tidak dapat menyimpulkan seluruh tugas selesai; gunakan muat ulang pada panel terkait.</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi icon={Users} label="Kehadiran Siswa" value={todayHadirPct !== null ? `${todayHadirPct}%` : '—'} sub={todayAtt.length ? `${todayAtt.length} catatan hari ini` : undefined} onClick={() => setBerandaModal('kehadiran')} />
        <Kpi icon={BadgeCheck} label="Presensi Guru Tercatat" value={teacherAtt ? `${teacherAtt.present}/${teacherAtt.total}` : '—'} sub={teacherAtt ? `${teacherAtt.absent} wajib belum tercatat · ${teacherAtt.notRequired} bebas kewajiban` : 'Belum tersedia'} onClick={() => setBerandaModal('guruHadir')} />
        <Kpi icon={Presentation} label="Kelas Terjadwal Hari Ini" value={read.available && read.todayInPeriod ? `${activeClasses}` : '—'} sub={read.available && read.todayInPeriod ? `${todaySchedules.length} blok terencana, bukan sesi aktif` : 'Jadwal tidak tersedia untuk hari ini'} onClick={() => setBerandaModal('kelasBerjalan')} />
        <Kpi icon={FileClock} label="Modul Pending" value={pendingRpp === null ? '—' : String(pendingRpp)} valueClass="text-amber-600" onClick={() => onNavigate('modul')} />
        <Kpi icon={ClipboardPenLine} label="Sumatif Aktif" value={activeSumatif === null ? '—' : String(activeSumatif)} valueClass="text-sky-600" onClick={() => onNavigate('sumatif')} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        {/* Papan Pembelajaran Hari Ini — Heatmap */}
        <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]"><Presentation className="h-[18px] w-[18px] text-emerald-600" />Papan Pembelajaran Hari Ini</h3>
            <span className="rounded-md bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700">{wibDateLabel()}</span>
          </div>
          <PapanHeatmap schedules={schedules} classes={classes} />
        </div>

        {/* Health Score */}
        <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]"><Activity className="h-[18px] w-[18px] text-emerald-600" />Skor Kondisi Sekolah</h3>
          </div>
          {/* U6: SIM_HEALTH refactored to honest empty state */}
          <div className="mt-4 flex flex-col items-center justify-center py-6">
            <div className="text-[14px] font-bold text-[#9bb0a8]">Skor belum tersedia</div>
            <div className="mt-1 text-[11.5px] text-[#6b8079]">Menunggu data nilai dan kehadiran yang cukup</div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Perlu Tindakan */}
        <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
          <h3 className="flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]"><ListChecks className="h-[18px] w-[18px] text-emerald-600" />Perlu Tindakan</h3>
          <div className="mt-3 space-y-2.5">
            {pendingRpp !== null && pendingRpp > 0 && (
              <button type="button" onClick={() => onNavigate('modul')} className="flex w-full items-center gap-3 rounded-xl border border-[#e6efea] bg-white p-3 text-left transition hover:border-emerald-200 hover:shadow-sm">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-600"><FileClock className="h-[18px] w-[18px]" /></div>
                <div className="min-w-0 flex-1"><b className="text-[12.5px] text-[#0f2e25]">{pendingRpp} Modul Ajar menunggu approval</b><div className="text-[11.5px] text-[#6b8079]">Klik untuk review</div></div>
                <ChevronRight className="h-4 w-4 shrink-0 text-[#9bb0a8]" />
              </button>
            )}
            {belowKktp.length > 0 && (
              <button type="button" onClick={() => onNavigate('monitor')} className="flex w-full items-center gap-3 rounded-xl border border-[#e6efea] bg-white p-3 text-left transition hover:border-emerald-200 hover:shadow-sm">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-rose-50 text-rose-600"><AlertTriangle className="h-[18px] w-[18px]" /></div>
                <div className="min-w-0 flex-1"><b className="text-[12.5px] text-[#0f2e25]">{belowKktp.length} penugasan dengan hasil perlu ditinjau</b><div className="text-[11.5px] text-[#6b8079]">Kurang dari 75% catatan nilai memenuhi KKTP mapel; bukan progres CP. {belowKktp.slice(0, 2).map((k) => `${k.kelas} — ${k.mapel} ${k.tuntasPct}%`).join(' · ')}</div></div>
                <ChevronRight className="h-4 w-4 shrink-0 text-[#9bb0a8]" />
              </button>
            )}
            {dataComplete && pendingRpp === 0 && belowKktp.length === 0 && (
              <div className="grid h-20 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] font-medium text-[#9bb0a8]">Tidak ada tindakan tertunda.</div>
            )}
          </div>
        </div>

        {/* Tren Kehadiran */}
        <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]"><TrendingUp className="h-[18px] w-[18px] text-emerald-600" />Tren Kehadiran — {trenPeriod === '10H' ? '10 Hari' : trenPeriod === '1B' ? '1 Bulan' : '3 Bulan'}</h3>
            <div className="inline-flex rounded-xl bg-[#f4f7f5] p-1">
              {(['10H', '1B', '3B'] as const).map((p) => (
                <button key={p} type="button" onClick={() => setTrenPeriod(p)} className={clsx('rounded-lg px-3 py-1.5 text-[12px] font-bold', trenPeriod === p ? 'bg-white text-emerald-700 shadow-sm' : 'text-[#6b8079]')}>{p}</button>
              ))}
            </div>
          </div>
          {trenData ? (
            <TrenChart siswa={trenData.siswa} guru={trenData.guru} />
          ) : (
            /* U6: SIM_TREN fallback replaced with honest empty state */
            <div className="flex h-32 items-center justify-center text-[12px] font-medium text-[#9bb0a8]">Belum ada data tren kehadiran</div>
          )}
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700"><TrendingUp className="h-3 w-3" /> {trenData ? 'Catatan harian periode dan kelas pilihan; celah = data belum ada' : 'Data harian belum tersedia pada cakupan pilihan'}</div>
        </div>
      </div>

      {/* Drill-down Modals */}
      {berandaModal === 'kehadiran' && <KehadiranDetailModal todayAtt={todayAtt} onClose={() => setBerandaModal(null)} />}
      {berandaModal === 'guruHadir' && <GuruHadirModal data={teacherAtt} onClose={() => setBerandaModal(null)} />}
      {berandaModal === 'kelasBerjalan' && <KelasBerjalanModal schedules={schedules} classes={classes} onClose={() => setBerandaModal(null)} />}
    </div>
  );
}

// ═══ BERANDA: HEATMAP PAPAN ═══════════════════════════════════════════════════

function PapanHeatmap({ schedules, classes }: { schedules: ScheduleItem[]; classes: ClassRef[] }) {
  return <ScheduleBoard schedules={schedules} classes={classes} />;
}

function KehadiranDetailModal({ todayAtt, onClose }: { todayAtt: AttendanceItem[]; onClose: () => void }) {
  const byClass = useMemo(() => {
    const m = new Map<string, { hadir: number; izin: number; sakit: number; alpha: number; total: number }>();
    for (const a of todayAtt) {
      const kelas = a.class?.name ?? '—';
      if (!m.has(kelas)) m.set(kelas, { hadir: 0, izin: 0, sakit: 0, alpha: 0, total: 0 });
      const row = m.get(kelas)!;
      row.total++;
      if (a.status === 'hadir') row.hadir++;
      else if (a.status === 'izin') row.izin++;
      else if (a.status === 'sakit') row.sakit++;
      else if (a.status === 'alpha') row.alpha++;
    }
    return [...m.entries()].map(([kelas, c]) => ({ kelas, ...c, pct: c.total ? Math.round((c.hadir / c.total) * 100) : 0 }));
  }, [todayAtt]);

  const totalHadir = todayAtt.filter((a) => a.status === 'hadir').length;
  const totalPct = todayAtt.length ? Math.round((totalHadir / todayAtt.length) * 100) : 0;

  return (
    <KsDetailDialog title="Kehadiran Siswa — Rincian" onClose={onClose}>
        <div className="sticky top-0 flex items-center justify-between border-b border-[#e6efea] bg-white py-4 pl-5 pr-16">
          <div><h3 className="flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]"><Users className="h-5 w-5 text-emerald-600" />Kehadiran Siswa — Rincian</h3><p className="text-[11.5px] text-[#6b8079]">Per kelas · {wibDateLabel()}</p></div>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap gap-2">
            <StatPill n={`${totalPct}%`} l="Kehadiran" />
            <StatPill n={`${totalHadir}/${todayAtt.length}`} l="Hadir/Total" />
            <StatPill n={`${todayAtt.length - totalHadir}`} l="Tidak Hadir" />
          </div>
          {byClass.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead><tr className="border-b border-[#e6efea] text-left text-[10.5px] uppercase tracking-wide text-[#6b8079]">
                  <th className="py-2 pr-3">Kelas</th><th className="py-2 pr-3 text-right">Hadir</th><th className="py-2 pr-3 text-right">Izin</th><th className="py-2 pr-3 text-right">Sakit</th><th className="py-2 pr-3 text-right">Alpha</th><th className="py-2 text-right">% Hadir</th>
                </tr></thead>
                <tbody>
                  {byClass.map((row) => (
                    <tr key={row.kelas} className="border-b border-[#f0f4f2]">
                      <td className="py-2.5 pr-3 font-bold text-[#0f2e25]">{row.kelas}</td>
                      <td className="py-2.5 pr-3 text-right font-bold text-emerald-700">{row.hadir}</td>
                      <td className="py-2.5 pr-3 text-right text-[#355a4e]">{row.izin}</td>
                      <td className="py-2.5 pr-3 text-right text-[#355a4e]">{row.sakit}</td>
                      <td className="py-2.5 pr-3 text-right text-rose-600">{row.alpha}</td>
                      <td className="py-2.5 text-right"><span className={clsx('rounded-md px-2 py-0.5 text-[10.5px] font-bold', row.pct >= 90 ? 'bg-emerald-50 text-emerald-700' : row.pct >= 80 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-600')}>{row.pct}%</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="grid h-20 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] text-[#9bb0a8]">Belum ada data kehadiran hari ini.</div>}
        </div>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[#e6efea] bg-white px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-[#e6efea] bg-white px-4 py-2 text-[12.5px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]">Tutup</button>
        </div>
    </KsDetailDialog>
  );
}

function GuruHadirModal({ data, onClose }: { data: TeacherAttendanceSummary | null; onClose: () => void }) {
  const focus = useKsDialogFocus();
  return <Dialog open onOpenChange={(open: boolean) => { if (!open) onClose(); }}>
    <DialogContent {...focus} className="max-h-[88vh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto">
      <DialogHeader><DialogTitle>Presensi Guru Harian</DialogTitle><DialogDescription>Ringkasan StaffAttendance. Bebas kewajiban atau belum jatuh waktu tidak dihitung sebagai absen.</DialogDescription></DialogHeader>
      {!data ? <p role="status">Ringkasan belum tersedia. Tutup dan muat ulang sumber; tidak dapat menyimpulkan nol kehadiran.</p> : <div className="space-y-4">
        <p className="text-sm text-slate-600">{data.date} · {data.present}/{data.total} guru memiliki presensi tercatat.</p>
        <div className="grid grid-cols-2 gap-3">{[['Kewajiban tersedia',data.required],['Wajib belum tercatat',data.absent],['Belum jatuh waktu',data.notDue],['Bebas kewajiban',data.notRequired],['Tidak dijadwalkan',data.notScheduled],['Status belum diketahui',data.unknown],['Terlambat',data.late],['Perlu review lokasi',data.review],['Lokasi masuk di area',data.inside]].map(([label,value]) => <StatPill key={label} n={String(value)} l={String(label)} />)}</div>
        <p className="text-xs text-slate-500">Lokasi tidak menyatakan bukti mengajar. Status review tidak otomatis berarti di luar area.</p>
        <a href="/dashboard/presensi-guru" className="inline-flex rounded-lg bg-emerald-700 px-4 py-2 text-sm text-white">Buka rekap presensi pegawai</a>
      </div>}
    </DialogContent>
  </Dialog>;
}

function KelasBerjalanModal({ schedules, classes, onClose }: { schedules: ScheduleItem[]; classes: ClassRef[]; onClose: () => void }) {
  const focus = useKsDialogFocus();
  return <Dialog open onOpenChange={(open: boolean) => { if (!open) onClose(); }}>
    <DialogContent {...focus} className="max-h-[88vh] w-[calc(100%-2rem)] max-w-5xl overflow-y-auto">
      <DialogHeader><DialogTitle>Jadwal Kelas Hari Ini</DialogTitle><DialogDescription>Semua blok terencana tetap terlihat. Rentang waktu jadwal bukan bukti sesi aktif atau kelas libur.</DialogDescription></DialogHeader>
      <ScheduleBoard schedules={schedules} classes={classes} />
    </DialogContent>
  </Dialog>;
}

function ModulAjarKs({ rpp, onReview }: { rpp: RppItem[]; onReview: (r: RppItem) => void }) {
  const [filter, setFilter] = useState<'Semua' | 'Menunggu' | 'Disetujui' | 'Ditolak'>('Semua');

  const statusMap: Record<string, 'Semua' | 'Menunggu' | 'Disetujui' | 'Ditolak'> = {
    submitted: 'Menunggu', curriculum_reviewed: 'Menunggu', approved: 'Disetujui', revision: 'Ditolak', draft: 'Semua',
  };
  const filtered = rpp.filter((r) => filter === 'Semua' || statusMap[r.status] === filter);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-[17px] font-bold text-[#0f2e25]"><FileCheck2 className="h-5 w-5 text-emerald-600" />Status Modul Ajar</h3>
          <p className="text-[12.5px] text-[#6b8079]">Ringkasan status. Keputusan dua tahap dilakukan pada antrean khusus.</p>
        </div>
        <a href="/dashboard/rpp" className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-2 text-[12px] font-bold text-white hover:bg-emerald-700">Buka Review Modul Ajar</a>
      </div>
      <div className="inline-flex rounded-xl bg-[#f4f7f5] p-1">
          {(['Semua', 'Menunggu', 'Disetujui', 'Ditolak'] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)}
              className={clsx('rounded-lg px-3 py-1.5 text-[12px] font-bold', filter === f ? 'bg-white text-emerald-700 shadow-sm' : 'text-[#6b8079]')}>{f}</button>
          ))}
      </div>

      {filtered.length === 0 ? (
        <div className="grid h-24 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] text-[#9bb0a8]">Tidak ada modul ajar untuk filter ini.</div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((r) => {
            const st = statusMap[r.status] ?? 'Semua';
            const stBadge = st === 'Menunggu' ? 'bg-amber-50 text-amber-700' : st === 'Disetujui' ? 'bg-emerald-50 text-emerald-700' : st === 'Ditolak' ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-600';
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[#e6efea] bg-white p-3.5">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-100 text-[12px] font-bold text-emerald-700">{r.subject.charAt(0)}</div>
                <div className="min-w-0 flex-1">
                  <b className="text-[13px] text-[#0f2e25]">{r.title}</b>
                  <div className="text-[11px] text-[#6b8079]">{r.subject} · {r.class?.name ?? '—'} · {r.status === 'submitted' ? 'menunggu kurikulum' : r.status === 'curriculum_reviewed' ? 'menunggu persetujuan KS' : r.status === 'approved' ? 'disetujui final' : r.status === 'revision' ? 'revisi' : 'draft'}{r.submittedAt ? ` ${new Date(r.submittedAt).toLocaleDateString('id')}` : ''}</div>
                  {r.status === 'revision' && r.reviewNote && <div className="mt-1 text-[10.5px] font-medium text-amber-700">Catatan KS: {r.reviewNote}</div>}
                </div>
                <span className={clsx('rounded-md px-2 py-0.5 text-[10.5px] font-bold', stBadge)}>{st}</span>
                <button type="button" onClick={() => onReview(r)} className="inline-flex items-center gap-1 rounded-lg border border-[#e6efea] bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]"><Info className="h-3.5 w-3.5" />Detail</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══ SCREEN 3: AUDIT SUMATIF ═════════════════════════════════════════════════

function AuditSumatifKs({ onOpenDetail, data }: { onOpenDetail: (s: SumatifItem) => void; data: SumatifItem[] }) {
  const [filter, setFilter] = useState<'Semua' | SumatifStatus>('Semua');
  const filtered = data.filter((s) => filter === 'Semua' || s.status === filter);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-[17px] font-bold text-[#0f2e25]"><ClipboardPenLine className="h-5 w-5 text-emerald-600" />Monitoring Sumatif</h3>
          <p className="text-[12.5px] text-[#6b8079]">Status sesi, jumlah soal, dan respons siswa</p>
        </div>
        <div className="inline-flex rounded-xl bg-[#f4f7f5] p-1">
          {(['Semua', 'Draft', 'Aktif', 'Selesai'] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)} className={clsx('rounded-lg px-3 py-1.5 text-[12px] font-bold', filter === f ? 'bg-white text-emerald-700 shadow-sm' : 'text-[#6b8079]')}>{f}</button>
          ))}
        </div>
      </div>
      <div className="space-y-2.5">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#e6efea] bg-[#f9fbfa] px-4 py-8 text-center">
            <ClipboardPenLine className="mx-auto h-7 w-7 text-[#cbd5e1]" />
            <p className="mt-2 text-[13px] font-bold text-[#0f2e25]">Belum ada sesi sumatif</p>
          </div>
        ) : (
          filtered.map((s) => {
            const stBadge = s.status === 'Aktif' ? 'bg-sky-50 text-sky-700' : s.status === 'Selesai' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600';
            return (
              <button key={s.id} type="button" onClick={() => onOpenDetail(s)} className="flex w-full items-center gap-3 rounded-xl border border-[#e6efea] bg-white p-3.5 text-left transition hover:border-emerald-200 hover:shadow-sm">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-100 text-[11px] font-bold text-emerald-700">{s.questionCount}</div>
                <div className="min-w-0 flex-1"><b className="text-[13px] text-[#0f2e25]">{s.title}</b><div className="text-[11px] text-[#6b8079]">{s.subject} · {s.className} · {s.responseCount} respons</div></div>
                <span className={clsx('rounded-md px-2 py-0.5 text-[10.5px] font-bold', stBadge)}>{s.status}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ═══ SCREEN 4: MONITORING KBM ═════════════════════════════════════════════════




// ═══ SCREEN 7: JADWAL & TUGAS ═════════════════════════════════════════════════

function JadwalTugasKs({ schedules, classes, pendingRpp, activeSumatif }: {
  schedules: ScheduleItem[]; classes: ClassRef[];
  pendingRpp: RppItem[]; activeSumatif: SumatifItem[];
}) {
  const [selClass, setSelClass] = useState<string>('all');

  const read = useScheduleRead(), bell = read.period;
  const dailyCounts = [1,2,3,4,5,6,7].map((day) => bell.slotsForDay(day).length);
  const jpRange = dailyCounts.length ? `${Math.min(...dailyCounts)}–${Math.max(...dailyCounts)}` : '—';

  const totalJP = schedules.reduce((sum, s) => sum + (s.jpEnd - s.jpStart + 1), 0);

  // Beban Mengajar per Guru
  const guruLoad = useMemo(() => {
    const m = new Map<string, { id:string; name: string; jp: number }>();
    const physicalSlots = new Set<string>();
    for (const s of schedules) {
      const name = s.teachingAssignment.teacher?.user?.fullName ?? '—';
      const teacherKey = s.teachingAssignment.teacher?.id ?? `unknown:${s.id}`;
      for (let jp = s.jpStart; jp <= s.jpEnd; jp++) {
        const key = `${teacherKey}|${s.dayOfWeek}|${jp}`;
        if (!physicalSlots.has(key)) { m.set(teacherKey, { id:teacherKey, name, jp: (m.get(teacherKey)?.jp ?? 0) + 1 }); physicalSlots.add(key); }
      }
    }
    return [...m.values()].sort((a, b) => b.jp - a.jp);
  }, [schedules]);
  const maxObservedLoad = Math.max(1,...guruLoad.map(g => g.jp));

  // Antrian hanya memakai status server; tidak membuat deadline sintetis.
  const tugasMendatang = useMemo(() => [
    ...pendingRpp.map((r) => ({ title: r.title, subject: r.subject, kelas: r.class?.name ?? '—', status: 'Menunggu Review' })),
    ...activeSumatif.map((s) => ({ title: s.title, subject: s.subject, kelas: s.className, status: 'Sumatif Aktif' })),
  ], [activeSumatif, pendingRpp]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-[17px] font-bold text-[#0f2e25]"><CalendarClock className="h-5 w-5 text-emerald-600" />Jadwal & Pembagian Tugas Mengajar</h3>
          <p className="text-[12.5px] text-[#6b8079]">{classes.length} rombel · {totalJP} JP total · mode pantau</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={CalendarClock} label="Total JP" value={`${totalJP}`} />
        <Kpi icon={LayoutGrid} label="Rombel" value={`${classes.length}`} />
        <Kpi icon={Users} label="Mapel" value={`${new Set(schedules.map((s) => s.teachingAssignment?.subject).filter(Boolean)).size}`} />
        <Kpi icon={Presentation} label="Sesi" value={`${schedules.length}`} />
      </div>

      {/* Struktur jadwal, read-only untuk KS. */}
      <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
        <h4 className="flex items-center gap-2 text-[14px] font-bold text-[#0f2e25]"><SlidersHorizontal className="h-4 w-4 text-emerald-600" />Struktur Jadwal</h4>
        <div className="mt-3 grid grid-cols-3 gap-3 lg:grid-cols-6">
          {[['Hari dalam pola bel', `${dailyCounts.filter(count => count > 0).length}`], ['JP/Hari', jpRange], ['Kapasitas pola JP/Minggu', `${dailyCounts.reduce((sum, count) => sum + count, 0)}`], ['Rombel', `${classes.length}`], ['Guru', `${guruLoad.length}`], ['JP guru tertinggi (tersimpan)', `${guruLoad.length ? maxObservedLoad : '—'}`]].map(([label, val]) => (
            <div key={label} className="rounded-xl bg-[#f4f7f5] px-3 py-2.5 text-center"><div className="text-[20px] font-extrabold text-[#0f2e25]">{val}</div><div className="text-[10.5px] font-medium text-[#6b8079]">{label}</div></div>
          ))}
        </div>
      </div>

      {/* Kelengkapan penugasan; panel ini tidak menyatakan bebas overlap. */}
      {(() => {
        const conflictSlots = schedules.filter(row => !row.teachingAssignment.teacher?.id).flatMap(row =>
          Array.from({ length:row.jpEnd-row.jpStart+1 },(_,index) => ({ day:row.dayOfWeek,jp:row.jpStart+index,rombel:row.class.name })));
        if (!read.available) return <p role="status" className="rounded-lg bg-amber-50 p-3 text-xs">Kelengkapan penugasan belum dapat diperiksa.</p>;
        if (!schedules.length) return <p className="p-3 text-xs">Belum ada slot tersimpan pada cakupan ini.</p>;
        return conflictSlots.length > 0 ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-5 shadow-sm">
            <h4 className="flex items-center gap-2 text-[14px] font-bold text-rose-600"><AlertTriangle className="h-4 w-4" />{conflictSlots.length} Slot tanpa Guru</h4>
            <p className="text-[11.5px] text-rose-600">Tidak ada guru tersedia untuk slot berikut:</p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-[12px]"><thead><tr className="border-b border-rose-200 text-left text-[10.5px] uppercase text-rose-400"><th className="py-2 pr-3">Hari</th><th className="py-2 pr-3">JP</th><th className="py-2">Rombel</th></tr></thead><tbody>
                {conflictSlots.map((c, i) => <tr key={i} className="border-b border-rose-100"><td className="py-2 pr-3 font-bold text-rose-700">{DOW[c.day]}</td><td className="py-2 pr-3 text-rose-600">JP{c.jp}</td><td className="py-2 text-rose-600">{c.rombel}</td></tr>)}
              </tbody></table>
            </div>
          </div>
        ) : (
          <div className="rounded-lg bg-emerald-50 px-3 py-2 text-[11.5px] font-semibold text-emerald-700"><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />Semua {schedules.length} slot jadwal memiliki guru.</div>
        );
      })()}

      {/* Matriks Jadwal Mingguan */}
      <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h4 className="flex items-center gap-2 text-[14px] font-bold text-[#0f2e25]"><LayoutGrid className="h-4 w-4 text-emerald-600" />Matriks Jadwal Mingguan</h4>
          <select aria-label="Filter kelas jadwal" value={selClass} onChange={(e) => setSelClass(e.target.value)} className="rounded-lg border border-[#e6efea] bg-white px-3 py-1.5 text-[12px] font-bold text-[#355a4e]">
            <option value="all">Semua Kelas</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="mt-3"><ScheduleBoard schedules={schedules} classes={classes} weekly classId={selClass === 'all' ? undefined : selClass} /></div>
      </div>

      {/* Beban Mengajar per Guru */}
      <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h4 className="flex items-center gap-2 text-[14px] font-bold text-[#0f2e25]"><Users className="h-4 w-4 text-emerald-600" />Beban Mengajar per Guru</h4>
          <span className="rounded-md bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700">JP fisik unik per guru, bukan akumulasi kelas gabungan</span>
        </div>
        <div className="mt-3 max-h-[460px] space-y-2.5 overflow-auto">
          {guruLoad.map((g) => {
            const pct = g.jp / maxObservedLoad * 100;
            return (
              <div key={g.id} className="flex items-center gap-3">
                <span className="w-28 shrink-0 truncate text-[12px] font-bold text-[#0f2e25]" title={g.name}>{g.name.split(',')[0]}</span>
                <div className="h-[9px] flex-1 overflow-hidden rounded-md bg-[#eef3f0]"><span className="block h-full rounded-md" style={{ width: `${pct}%`, background: '#059669' }} /></div>
                <span className={'w-12 shrink-0 text-right text-[12px] font-bold text-[#355a4e]'}>{g.jp} JP</span>
              </div>
            );
          })}
          {guruLoad.length === 0 && <div className="grid h-20 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] text-[#9bb0a8]">Belum ada data.</div>}
        </div>
      </div>

      {/* Status akademik tanpa deadline sintetis. */}
      <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
        <h4 className="flex items-center gap-2 text-[14px] font-bold text-[#0f2e25]"><FileClock className="h-4 w-4 text-emerald-600" />Status Akademik</h4>
        <div className="mt-3 space-y-1">
          {tugasMendatang.map((t, i) => (
            <div key={`${t.status}-${i}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[#f0f4f2] py-2.5 text-[12px] sm:grid-cols-[2fr_1fr_1fr_120px]">
              <span className="min-w-0 font-bold text-[#0f2e25]">{t.title}</span>
              <span className="hidden text-[#355a4e] sm:block">{t.subject}</span>
              <span className="hidden text-[#6b8079] sm:block">{t.kelas}</span>
              <span className="text-right"><span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">{t.status}</span></span>
            </div>
          ))}
          {tugasMendatang.length === 0 && <div className="grid h-20 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] text-[#9bb0a8]">Tidak ada tugas mendesak.</div>}
        </div>
      </div>

    </div>
  );
}

// ═══ MODALS ═══════════════════════════════════════════════════════════════════

function useKsDialogFocus() {
  const trigger = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: () => { trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; },
    onCloseAutoFocus: (event: Event) => {
      event.preventDefault();
      if (trigger.current?.isConnected) trigger.current.focus();
    },
  };
}

function KsDetailDialog({ title, onClose, children, compact = false }: {
  title: string; onClose: () => void; children: React.ReactNode; compact?: boolean;
}) {
  const focus = useKsDialogFocus();
  return <Dialog open onOpenChange={(open: boolean) => { if (!open) onClose(); }}>
    <DialogContent
      {...focus}
      className={clsx('block max-h-[88dvh] w-[calc(100%-2rem)] gap-0 overflow-y-auto rounded-2xl border-[#e6efea] bg-white p-0 text-[#0f2e25] shadow-xl', compact ? 'max-w-xl' : 'max-w-2xl')}
      aria-describedby={undefined}
    >
      <DialogTitle className="sr-only">{title}</DialogTitle>
      {children}
    </DialogContent>
  </Dialog>;
}

function RppDetailModal({ rpp, onClose }: { rpp: RppItem; onClose: () => void }) {
  const body = rpp.body;
  const fase = body?.fase ?? '—';
  const profileFramework = resolveProfileFramework(rpp.academicYear);

  return (
    <KsDetailDialog title={`Rincian Modul Ajar: ${rpp.title}`} onClose={onClose}>
        <div className="sticky top-0 flex items-center justify-between border-b border-[#e6efea] bg-white py-4 pl-5 pr-16">
          <div><h3 className="flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]"><FileCheck2 className="h-5 w-5 text-emerald-600" />{rpp.title}</h3><p className="text-[11.5px] text-[#6b8079]">{rpp.subject} · {rpp.class?.name ?? '—'} · {rpp.status}</p></div>
        </div>
        <div className="space-y-4 p-5">
          {/* Stats */}
          <div className="flex flex-wrap gap-2">
            <StatPill n={`${body?.jpAllocation ?? '—'}`} l="Alokasi JP" />
            <StatPill n={`${body?.tp?.length ?? 0}`} l="CP/TP" />
            <StatPill n={fase} l="Fase" />
            <StatPill n={rpp.status === 'approved' ? 'Disetujui final' : rpp.status === 'curriculum_reviewed' ? 'Menunggu KS' : rpp.status === 'submitted' ? 'Menunggu kurikulum' : rpp.status === 'revision' ? 'Revisi' : 'Draft'} l="Status" />
          </div>
          {rpp.reviewNote && <div className="rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] font-semibold text-amber-700"><AlertTriangle className="mr-1 inline h-3 w-3" />Catatan KS: {rpp.reviewNote}</div>}

          {/* Identitas Modul Ajar */}
          <DetailSection icon={Info} title="Identitas Modul Ajar">
            <table className="w-full text-[12px]"><tbody>
              <tr><td className="w-[140px] py-1.5 text-[#6b8079]">Judul / TP</td><td className="py-1.5 font-bold text-[#0f2e25]">{rpp.title}</td></tr>
              <tr><td className="py-1.5 text-[#6b8079]">Mata Pelajaran</td><td className="py-1.5 text-[#355a4e]">{rpp.subject}</td></tr>
              <tr><td className="py-1.5 text-[#6b8079]">Kelas / Fase</td><td className="py-1.5 text-[#355a4e]">{rpp.class?.name ?? '—'} · Fase {fase}</td></tr>
              <tr><td className="py-1.5 text-[#6b8079]">Semester</td><td className="py-1.5 text-[#355a4e]">{rpp.semester === 1 ? 'Ganjil' : 'Genap'} · TA {rpp.academicYear}</td></tr>
              <tr><td className="py-1.5 text-[#6b8079]">Alokasi JP</td><td className="py-1.5 text-[#355a4e]">{body?.jpAllocation ?? '—'} JP × 40 menit</td></tr>
              <tr><td className="py-1.5 text-[#6b8079]">Pengembang</td><td className="py-1.5 text-[#355a4e]">{body?.pengembang ?? '—'}</td></tr>
              <tr><td className="py-1.5 text-[#6b8079]">Diajukan</td><td className="py-1.5 text-[#355a4e]">{rpp.submittedAt ? new Date(rpp.submittedAt).toLocaleDateString('id') : '—'}</td></tr>
            </tbody></table>
          </DetailSection>

          {/* CP & TP */}
          {body?.cp && <DetailSection icon={Target} title="Capaian Pembelajaran (CP)"><p className="text-[12.5px] text-[#355a4e]">{body.cp}</p></DetailSection>}
          {body?.tp && body.tp.length > 0 && <DetailSection icon={ListChecks} title="Tujuan Pembelajaran (TP)"><ul className="space-y-1">{body.tp.map((tp, i) => <li key={i} className="flex gap-2 text-[12.5px] text-[#355a4e]"><span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-emerald-100 text-[10px] font-bold text-emerald-700">{i + 1}</span>{tp}</li>)}</ul></DetailSection>}

          {/* ATP */}
          {body?.atp && body.atp.length > 0 && (
            <DetailSection icon={Route} title="Alur Tujuan Pembelajaran (ATP)">
              <table className="w-full text-[12px]"><thead><tr className="border-b border-[#e6efea] text-left text-[10.5px] uppercase text-[#6b8079]"><th className="py-2 pr-3">TP</th><th className="py-2 pr-3">Pertemuan</th><th className="py-2">Indikator Ketercapaian</th></tr></thead><tbody>
                {body.atp.map((item, i) => <tr key={i} className="border-b border-[#f0f4f2]"><td className="py-2 pr-3 font-bold text-[#0f2e25]">{item.tpRef ?? `ATP ${i + 1}`}</td><td className="py-2 pr-3 text-[#355a4e]">{item.tpRef ? '—' : ''}</td><td className="py-2 text-[#355a4e]">{item.indikator ?? '—'}</td></tr>)}
              </tbody></table>
            </DetailSection>
          )}

          {(body?.profilDimensi?.length || body?.profilUraian) && (
            <DetailSection icon={Users} title={profileFramework.label}>
              {body?.profilDimensi?.length ? (
                <div className="flex flex-wrap gap-2">
                  {body.profilDimensi.map((d) => <span key={d} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11.5px] font-bold text-emerald-700">{d}</span>)}
                </div>
              ) : null}
              {body?.profilUraian && <p className="mt-2 text-[12px] text-[#355a4e]">{body.profilUraian}</p>}
            </DetailSection>
          )}

          {/* Kegiatan */}
          {body?.kegiatan && body.kegiatan.length > 0 && <DetailSection icon={LayoutGrid} title="Kegiatan Pembelajaran"><div className="space-y-2">{body.kegiatan.map((k, i) => <div key={i} className="rounded-lg border border-[#e6efea] p-3"><b className="text-[11px] text-emerald-700">{k.pertemuan ?? `Pertemuan ${i + 1}`}</b>{k.pendahuluan && <p className="mt-1 text-[12px] text-[#355a4e]"><b>Pendahuluan:</b> {k.pendahuluan}</p>}{(k.inti || k.deskripsi) && <p className="mt-1 text-[12px] text-[#355a4e]"><b>Inti:</b> {k.inti ?? k.deskripsi}</p>}{k.penutup && <p className="mt-1 text-[12px] text-[#355a4e]"><b>Penutup:</b> {k.penutup}</p>}{k.diferensiasi && <p className="mt-1 text-[11px] text-[#9bb0a8]">Diferensiasi: {k.diferensiasi}</p>}</div>)}</div></DetailSection>}

          {/* Asesmen */}
          {body?.asesmen && <DetailSection icon={ClipboardCheck} title="Asesmen"><p className="text-[12.5px] text-[#355a4e]">{body.asesmen}</p></DetailSection>}
          {(body?.asesmenDiagnostik || body?.asesmenFormatif || body?.asesmenSumatif) && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {body.asesmenDiagnostik && <div className="rounded-lg border border-[#e6efea] p-3"><div className="text-[10px] font-bold text-sky-600">Diagnostik</div><p className="mt-1 text-[11.5px] text-[#355a4e]">{body.asesmenDiagnostik}</p></div>}
              {body.asesmenFormatif && <div className="rounded-lg border border-[#e6efea] p-3"><div className="text-[10px] font-bold text-emerald-700">Formatif</div><p className="mt-1 text-[11.5px] text-[#355a4e]">{body.asesmenFormatif}</p></div>}
              {body.asesmenSumatif && <div className="rounded-lg border border-[#e6efea] p-3"><div className="text-[10px] font-bold text-amber-600">Sumatif</div><p className="mt-1 text-[11.5px] text-[#355a4e]">{body.asesmenSumatif}</p></div>}
            </div>
          )}

          {/* Sarana */}
          {body?.sarana && <DetailSection icon={Info} title="Sarana & Target"><p className="text-[12.5px] text-[#355a4e]">{body.sarana}</p></DetailSection>}

          {/* Pengayaan & Refleksi */}
          {(body?.pengayaan || body?.remedial || body?.refleksiGuru || body?.refleksiSiswa || body?.refleksi) && <DetailSection icon={Lightbulb} title="Pengayaan & Refleksi">
            {body?.pengayaan && <p className="text-[12.5px] text-[#355a4e]">{body.pengayaan}</p>}
            {body?.remedial && <p className="mt-1 text-[12px] text-[#355a4e]">{body.remedial}</p>}
            {body?.refleksi && <p className="mt-2 text-[12px] text-[#355a4e]">{body.refleksi}</p>}
            {body?.refleksiGuru && <div className="mt-2"><b className="text-[11px] font-bold text-[#6b8079]">Refleksi Guru</b><p className="mt-1 text-[12px] text-[#355a4e]">{body.refleksiGuru}</p></div>}
            {body?.refleksiSiswa && <div className="mt-2"><b className="text-[11px] font-bold text-[#6b8079]">Refleksi Peserta Didik</b><p className="mt-1 text-[12px] text-[#355a4e]">{body.refleksiSiswa}</p></div>}
          </DetailSection>}

          {/* Lampiran */}
          {(body?.lampiran || body?.lampiranUrl) && <DetailSection icon={Paperclip} title="Lampiran">
            {body?.lampiran && <p className="text-[12.5px] text-[#355a4e]">{body.lampiran}</p>}
            {body?.lampiranUrl && <a href={body.lampiranUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-[12px] font-bold text-emerald-600 hover:underline">{body.lampiranUrl}</a>}
          </DetailSection>}

          <p className="text-[11px] text-[#9bb0a8]"><Info className="mr-1 inline h-3 w-3" />Keputusan dilakukan melalui antrean Review Modul Ajar agar jejak review dua tahap tetap utuh.</p>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[#e6efea] bg-white px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-[#e6efea] bg-white px-4 py-2 text-[12.5px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]">Tutup</button>
          <a href="/dashboard/rpp" className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2 text-[12.5px] font-bold text-white hover:bg-emerald-700">Buka antrean review</a>
        </div>
    </KsDetailDialog>
  );
}

function SumatifDetailModal({ item, onClose }: { item: SumatifItem; onClose: () => void }) {
  return (
    <KsDetailDialog title={`Rincian Sumatif: ${item.title}`} onClose={onClose} compact>
        <div className="sticky top-0 flex items-center justify-between border-b border-[#e6efea] bg-white py-4 pl-5 pr-16">
          <div><h3 className="flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]"><ClipboardPenLine className="h-5 w-5 text-emerald-600" />{item.title}</h3><p className="text-[11.5px] text-[#6b8079]">{item.subject} · {item.className}</p></div>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap gap-2">
            <StatPill n={`${item.questionCount}`} l="Jumlah Soal" />
            <StatPill n={`${item.responseCount}`} l="Respons" />
            <StatPill n={item.durationMinutes ? `${item.durationMinutes} mnt` : '—'} l="Durasi" />
            <StatPill n={item.status} l="Status" />
          </div>
          <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-[12px]">
            <dt className="font-semibold text-[#6b8079]">Mulai</dt>
            <dd className="text-[#355a4e]">{item.startedAt ? new Date(item.startedAt).toLocaleString('id-ID') : '—'}</dd>
            <dt className="font-semibold text-[#6b8079]">Selesai</dt>
            <dd className="text-[#355a4e]">{item.completedAt ? new Date(item.completedAt).toLocaleString('id-ID') : '—'}</dd>
          </dl>
        </div>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[#e6efea] bg-white px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-[#e6efea] bg-white px-4 py-2 text-[12.5px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]">Tutup</button>
        </div>
    </KsDetailDialog>
  );
}

// ═══ SHARED COMPONENTS ═════════════════════════════════════════════════════════

function Kpi({ icon: Icon, label, value, sub, valueClass, onClick }: { icon: LucideIcon; label: string; value: string; sub?: string; valueClass?: string; onClick?: () => void }) {
  const className = 'rounded-2xl border border-[#e6efea] bg-white p-4 text-left shadow-sm';
  const content = <>
    <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[#6b8079]"><Icon aria-hidden="true" className="h-3.5 w-3.5 text-emerald-600" />{label}</span>
    <span className={clsx('mt-1.5 block text-[24px] font-extrabold tracking-tight text-[#0f2e25]', valueClass)}>{value}</span>
    {sub && <span className="mt-0.5 block text-[10.5px] font-medium text-[#9bb0a8]">{sub}</span>}
  </>;
  return onClick
    ? <button type="button" onClick={onClick} className={clsx(className, 'w-full transition hover:border-emerald-200 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600')}>{content}</button>
    : <div className={className}>{content}</div>;
}

function TrenChart({ siswa, guru }: { siswa: (number | null)[]; guru: (number | null)[] }) {
  const W = 620, H = 120;
  const y = (value: number) => H - 10 - value / 100 * (H - 30);
  const x = (index: number, length: number) => 10 + index * (W-20) / Math.max(1,length-1);
  const segments = (values: (number | null)[]) => {
    const parts: string[][] = [[]];
    values.forEach((value,index) => {
      if (value === null) parts.push([]);
      else parts[parts.length-1]!.push(x(index,values.length)+','+y(value));
    });
    return parts.filter(part => part.length);
  };
  return <figure><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Persentase hadir dari catatan harian, skala nol sampai seratus. Celah berarti data belum tersedia." className="mt-2 w-full">
    {[0,25,50,75,100].map(value => <g key={value}><line x1={0} y1={y(value)} x2={W} y2={y(value)} stroke="#e6efea" /><text x={0} y={y(value)-2} fontSize={8} fill="#6b8079">{value}%</text></g>)}
    {segments(siswa).map((points,index) => <polyline key={index} points={points.join(' ')} fill="none" stroke="#059669" strokeWidth={2.5} />)}
    {siswa.map((value,index) => value === null ? null : <circle key={index} cx={x(index,siswa.length)} cy={y(value)} r={2} fill="#059669"><title>{value}% dari catatan harian</title></circle>)}
    {segments(guru).map((points,index) => <polyline key={index} points={points.join(' ')} fill="none" stroke="#0284c7" strokeWidth={2} />)}
  </svg><figcaption className="text-xs text-slate-500">Tidak ada garis penghubung pada tanggal tanpa catatan. Kehadiran guru tidak diperkirakan dari data siswa.</figcaption></figure>;
}

function StatPill({ n, l }: { n: string; l: string }) {
  return <div className="rounded-lg border border-[#e6efea] px-3 py-2 text-center"><div className="text-[16px] font-extrabold text-[#0f2e25]">{n}</div><div className="text-[10px] font-bold text-[#6b8079]">{l}</div></div>;
}

function DetailSection({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 border-b border-[#e6efea] pb-1 text-[11px] font-bold text-emerald-700"><Icon className="h-4 w-4" />{title}</div>
      {children}
    </div>
  );
}
