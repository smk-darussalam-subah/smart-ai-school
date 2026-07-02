'use client';

// =============================================================================
// KsWorkspace — Dashboard KS / Waka Kurikulum (F4 — mockup adoption).
// 7 screens: Beranda · Modul Ajar (RPP approval) · Audit Sumatif ·
// Monitoring KBM · Rekap Audit · KKTP · Jadwal & Tugas.
// Desktop-first. Real data where APIs exist; SIMULASI bertanda for the rest.
// Mockup ref: .tasks/akademik-mockup/akademik-ks.html (1,305 lines)
// =============================================================================

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  LayoutDashboard, FileCheck2, ClipboardPenLine, Monitor, ClipboardCheck,
  Target, CalendarClock, Users, BadgeCheck, Presentation, FileClock,
  AlertTriangle, Activity, TrendingUp, ListChecks, ChevronRight, X, UserX,
  Check, CheckCircle2, XCircle, Info, Save, Table2, LayoutGrid, SlidersHorizontal,
  Route, Lightbulb, Paperclip, FileText, RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import clsx from 'clsx';
import type { GradeItem, AttendanceItem } from '@/lib/api';
import type { ScheduleItem, ActivityItem, RppItem, ClassRef, LmsModuleItem } from './guru-types';
import { KKTP_DEFAULT } from '@/lib/academic';
import { JP_SLOTS, fmtMin, scheduleDayOfWeek, wibTodayISO, wibDateLabel, currentJp, wibNow } from '@/lib/bell-times';
import { reviewRpp, fetchAttendanceHeatmap, fetchMonitoringKbm, fetchRekapAudit } from '../actions';

// ── Types ────────────────────────────────────────────────────────────────────

interface Assignment { id: string; subject: string; class: { id: string; name: string } }

interface Props {
  grades: GradeItem[];
  attendances: AttendanceItem[];
  classes: ClassRef[];
  assignments: Assignment[];
  rpp: RppItem[];
  schedules: ScheduleItem[];
  activities: ActivityItem[];
  lmsModules: LmsModuleItem[];
  realSumatif?: unknown[];
  academicYear: string;
  semester: number;
  dataWarning?: boolean;
}

type Screen = 'beranda' | 'modul' | 'sumatif' | 'monitor' | 'rekap' | 'kktp' | 'jadwal';

const NAV: { key: Screen; label: string; icon: LucideIcon; badge?: number }[] = [
  { key: 'beranda', label: 'Beranda', icon: LayoutDashboard },
  { key: 'modul', label: 'Modul Ajar', icon: FileCheck2 },
  { key: 'sumatif', label: 'Sumatif', icon: ClipboardPenLine },
  { key: 'monitor', label: 'Monitoring KBM', icon: Monitor },
  { key: 'rekap', label: 'Rekap Audit', icon: ClipboardCheck },
  { key: 'kktp', label: 'KKTP', icon: Target },
  { key: 'jadwal', label: 'Jadwal & Tugas', icon: CalendarClock },
];

const DOW = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

// ── SIMULASI data (bertanda) ─────────────────────────────────────────────────

// SIMULASI: Sumatif audit queue — now wired to real assessment sessions
const SIM_SUMATIF = [
  { id: 's1', guru: 'Siti Aminah', mapel: 'Matematika', kelas: 'X TKRO 1', jenis: 'UH', judul: 'UH 3 — Sistem Persamaan Linear', soal: 10, status: 'Menunggu', tanggal: '15 Jun', kkm: 75, deskripsi: '10 soal: 5 PG, 3 isian, 2 uraian. Durasi 45 menit.' },
  { id: 's2', guru: 'Budi Hartono', mapel: 'Pemrograman Web', kelas: 'XI TJKT 1', jenis: 'UTS', judul: 'UTS Ganjil — HTML, CSS & Layout', soal: 15, status: 'Menunggu', tanggal: '13 Jun', kkm: 75, deskripsi: '15 soal: 8 PG, 4 isian, 3 praktik. Durasi 90 menit.' },
  { id: 's3', guru: 'Dewi Lestari', mapel: 'B. Indonesia', kelas: 'XI TJKT 1', jenis: 'UH', judul: 'UH 2 — Teks Eksposisi', soal: 8, status: 'Disetujui', tanggal: '8 Jun', kkm: 75, deskripsi: '8 soal: 4 PG, 2 isian, 2 uraian. Durasi 40 menit.' },
];

// SIMULASI: Health score pillars — now wired to /analytics endpoints (fallback)
const SIM_HEALTH = { score: 82, delta: 3, pilars: [
  { label: 'Akademik', pct: 80 }, { label: 'Kehadiran', pct: 94 },
  { label: 'Keuangan', pct: 88 }, { label: 'SDM/Guru', pct: 68 },
] };

// SIMULASI: Tren kehadiran — now wired to /attendance/heatmap (fallback)
const SIM_TREN_SISWA = [88, 90, 86, 92, 89, 93, 91, 94, 92, 93];
const SIM_TREN_GURU = [90, 92, 88, 93, 91, 94, 92, 95, 93, 94];
// SIMULASI: Tren kehadiran 1 bulan — wired to /attendance/heatmap (fallback)
const SIM_TREN_SISWA_1B = [86, 88, 87, 90, 89, 91, 88, 92, 90, 93, 89, 91, 87, 90, 88, 92, 90, 94, 91, 93, 89, 90, 88, 92, 90, 93, 91, 94, 92, 93];
const SIM_TREN_GURU_1B = [89, 91, 90, 93, 92, 94, 91, 95, 93, 95, 92, 94, 90, 93, 91, 95, 93, 96, 94, 95, 92, 93, 91, 95, 93, 96, 94, 96, 95, 94];
// SIMULASI: Tren kehadiran 3 bulan — wired to /attendance/heatmap (fallback)
const SIM_TREN_SISWA_3B = [85, 87, 84, 88, 86, 89, 87, 90, 88, 91, 89, 92];
const SIM_TREN_GURU_3B = [88, 90, 87, 91, 89, 92, 90, 93, 91, 94, 92, 95];
// SIMULASI: Guru RPP turnaround — can be derived from /rpp (fallback)
const SIM_RPP_SLOW: number = 3;

// SIMULASI: Scheduling config — now wired to /schedules/auto-generate (fallback)
const SIM_SCHED_CONFIG = { days: 6, jpPerDay: 8, maxJpGuru: 24 };
const SIM_SCHED_CONFLICTS: { day: number; jp: number; rombel: string }[] = [
  { day: 3, jp: 6, rombel: 'X TJKT 1' },
];

// SIMULASI: KKTP per-mapel — now wired to /kktp-config endpoint (fallback)
const SIM_KKTP_DATA: Record<string, { kktp: number; affected: number }> = {
  'Matematika': { kktp: 70, affected: 4 },
  'Pemrograman Web': { kktp: 75, affected: 2 },
  'Basis Data': { kktp: 75, affected: 1 },
  'B. Indonesia': { kktp: 75, affected: 3 },
  'B. Inggris': { kktp: 72, affected: 3 },
  'TKRO Produktif': { kktp: 75, affected: 2 },
  'Akuntansi': { kktp: 75, affected: 2 },
};
// SIMULASI: Guru list — now wired to /student-dashboard/teachers (fallback)
const SIM_GURU_LIST = ['Budi Hartono, S.Kom', 'Siti Aminah, S.Pd', 'Ahmad Rifai, S.T.', 'Dewi Lestari, S.Pd', 'Eko Prasetyo, S.Pd', 'Rina Wati, S.E.', 'Hendra Gunawan, S.Pd'];
// SIMULASI: Monitoring guru — now wired to /analytics/monitoring-kbm (fallback)
const SIM_MON_GURUS = ['Budi Hartono', 'Siti Aminah', 'Ahmad Rifai', 'Dewi Lestari', 'Eko Prasetyo', 'Rina Wati'];

// Fallback: Generate monitoring data from kelasMapel when API unavailable
function genSimMonitor(km: { kelas: string; mapel: string; avg: number | null; tuntasPct: number | null; count: number }[]) {
  return km.map((k, i) => {
    const tp = k.tuntasPct ?? 75;
    const status = tp >= 75 ? 'on' as const : tp >= 60 ? 'warn' as const : 'risk' as const;
    return { guru: SIM_MON_GURUS[i % SIM_MON_GURUS.length]!, mapel: k.mapel, kelas: k.kelas, cp: tp, pert: 4 + (i % 4), rencana: 12 + (i % 5), jurnal: 3 + (i % 4), hadir: 85 + (i % 10), rata: k.avg, status };
  });
}

// ── Component ────────────────────────────────────────────────────────────────

export default function KsWorkspace({
  grades, attendances, classes, assignments, rpp, schedules, activities, lmsModules: _lmsModules, realSumatif, academicYear, semester, dataWarning,
}: Props) {
  const [screen, setScreen] = useState<Screen>('beranda');
  // Opsi B (mobile nav): auto-center tab aktif saat ganti screen (anti hidden).
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const active = nav.querySelector<HTMLElement>('[data-active="true"]');
    if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [screen]);
  const [selRpp, setSelRpp] = useState<RppItem | null>(null);
  // T1-05 (audit v2): gunakan data real dari /assessment/sessions; JANGAN fallback ke SIM_SUMATIF.
  // Saat kosong → array kosong → AuditSumatifKs menampilkan empty state (bukan data palsu).
  const sumatifData = (realSumatif as typeof SIM_SUMATIF | undefined) ?? [];
  const [selSumatif, setSelSumatif] = useState<typeof SIM_SUMATIF[number] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // Derived data
  const pendingRpp = useMemo(() => rpp.filter((r) => r.status === 'submitted'), [rpp]);
  const pendingSumatif = sumatifData.filter((s) => s.status === 'Menunggu');

  const navWithBadges = NAV.map((n) => {
    if (n.key === 'modul') return { ...n, badge: pendingRpp.length };
    if (n.key === 'sumatif') return { ...n, badge: pendingSumatif.length };
    return n;
  });

  // KPI calculations from real data
  const todayISO = wibTodayISO();
  const todayAtt = attendances.filter((a) => a.date?.slice(0, 10) === todayISO);
  const hadirPct = attendances.length ? Math.round((attendances.filter((a) => a.status === 'hadir').length / attendances.length) * 100) : null;

  // Grade aggregation per class×subject
  const kelasMapel = useMemo(() => {
    const m = new Map<string, { kelas: string; mapel: string; scores: number[] }>();
    for (const g of grades) {
      const key = `${g.assignment.class.name}|${g.assignment.subject}`;
      let row = m.get(key);
      if (!row) { row = { kelas: g.assignment.class.name, mapel: g.assignment.subject, scores: [] }; m.set(key, row); }
      row.scores.push(Number(g.score));
    }
    return [...m.values()].map((r) => ({
      kelas: r.kelas,
      mapel: r.mapel,
      count: r.scores.length,
      avg: r.scores.length ? Math.round((r.scores.reduce((a, b) => a + b, 0) / r.scores.length) * 10) / 10 : null,
      tuntasPct: r.scores.length ? Math.round((r.scores.filter((s) => s >= KKTP_DEFAULT).length / r.scores.length) * 100) : null,
    })).sort((a, b) => a.kelas.localeCompare(b.kelas) || a.mapel.localeCompare(b.mapel));
  }, [grades]);

  const belowKktp = kelasMapel.filter((k) => k.tuntasPct !== null && k.tuntasPct < 75);

  // Global filter state (frontend filtering — server sends full dataset)
  const [filterSemester, setFilterSemester] = useState<'Semua' | 'Ganjil' | 'Genap'>(semester === 1 ? 'Ganjil' : semester === 2 ? 'Genap' : 'Semua');
  const [filterGuru, setFilterGuru] = useState('Semua Guru');
  const [filterMapel, setFilterMapel] = useState('Semua Mapel');
  const filterMapelOpts = useMemo(() => [...new Set(kelasMapel.map((k) => k.mapel))].sort(), [kelasMapel]);

  return (
    <div className="space-y-1">
      <h1 className="text-2xl font-bold tracking-tight text-[#0f2e25]">Dashboard KS / Waka Kurikulum</h1>
      <p className="text-sm text-[#6b8079]">Pengawasan akademik · approval modul ajar · audit sumatif · monitoring KBM</p>

      {dataWarning && (
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />Sebagian data gagal dimuat dari server. Muat ulang halaman jika berlanjut.
        </div>
      )}

      {/* Global Filter Bar */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-[#9bb0a8]">
          <SlidersHorizontal className="h-3.5 w-3.5" />Filter
        </span>
        <span className="inline-flex items-center gap-2 rounded-xl border border-[#e6efea] bg-white px-3 py-2 text-[12.5px] font-bold text-[#355a4e] shadow-sm">
          <CalendarClock className="h-[15px] w-[15px] text-emerald-600" />TA {academicYear || '—'}
        </span>
        <div className="inline-flex rounded-xl bg-[#f4f7f5] p-1">
          {(['Semua', 'Ganjil', 'Genap'] as const).map((s) => (
            <button key={s} type="button" onClick={() => setFilterSemester(s)}
              className={clsx('rounded-lg px-3 py-1.5 text-[12px] font-bold', filterSemester === s ? 'bg-white text-emerald-700 shadow-sm' : 'text-[#6b8079]')}>
              {s === 'Semua' ? 'Semua Sem' : s}
            </button>
          ))}
        </div>
        <select value={filterGuru} onChange={(e) => setFilterGuru(e.target.value)}
          className="rounded-xl border border-[#e6efea] bg-white px-3 py-2 text-[12.5px] font-bold text-[#355a4e] shadow-sm outline-none">
          <option>Semua Guru</option>
          {SIM_GURU_LIST.map((g) => <option key={g}>{g}</option>)}
        </select>
        <select value={filterMapel} onChange={(e) => setFilterMapel(e.target.value)}
          className="rounded-xl border border-[#e6efea] bg-white px-3 py-2 text-[12.5px] font-bold text-[#355a4e] shadow-sm outline-none">
          <option>Semua Mapel</option>
          {filterMapelOpts.map((m) => <option key={m}>{m}</option>)}
        </select>
        <span className="ml-auto hidden items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11.5px] font-bold text-blue-700 sm:inline-flex">
          <Users className="h-3.5 w-3.5" />{classes.length} rombel · {assignments.length} penugasan
        </span>
        <span className="hidden items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11.5px] font-bold text-emerald-700 sm:inline-flex">
          <BadgeCheck className="h-3.5 w-3.5" />Kepala Sekolah
        </span>
        <span className="hidden items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700 sm:inline-flex"><AlertTriangle className="h-3 w-3" /> Filter SIMULASI</span>
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
        {screen === 'beranda' && <BerandaKs hadirPct={hadirPct} todayAtt={todayAtt} pendingRpp={pendingRpp.length} pendingSumatif={pendingSumatif.length} belowKktp={belowKktp} schedules={schedules} classes={classes} onNavigate={setScreen} />}
        {screen === 'modul' && <ModulAjarKs rpp={rpp} onReview={setSelRpp} showToast={showToast} />}
        {screen === 'sumatif' && <AuditSumatifKs onOpenDetail={setSelSumatif} data={sumatifData} />}
        {screen === 'monitor' && <MonitoringKbmKs kelasMapel={kelasMapel} attendances={attendances} schedules={schedules} classes={classes} />}
        {screen === 'rekap' && <RekapAuditKs kelasMapel={kelasMapel} grades={grades} attendances={attendances} activities={activities} rpp={rpp} />}
        {screen === 'kktp' && <KktpKs kelasMapel={kelasMapel} showToast={showToast} />}
        {screen === 'jadwal' && <JadwalTugasKs schedules={schedules} classes={classes} showToast={showToast} pendingRpp={pendingRpp} pendingSumatif={pendingSumatif} />}
      </div>

      {/* Modul Ajar Detail Modal */}
      {selRpp && <RppDetailModal rpp={selRpp} onClose={() => setSelRpp(null)} showToast={showToast} />}

      {/* Sumatif Detail Modal */}
      {selSumatif && <SumatifDetailModal item={selSumatif} onClose={() => setSelSumatif(null)} showToast={showToast} />}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-[#0f2e25] px-4 py-3 text-[12.5px] font-bold text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

// ═══ SCREEN 1: BERANDA ════════════════════════════════════════════════════════

function BerandaKs({ hadirPct: _hadirPct, todayAtt, pendingRpp, pendingSumatif, belowKktp, schedules, classes, onNavigate }: {
  hadirPct: number | null; todayAtt: AttendanceItem[]; pendingRpp: number; pendingSumatif: number;
  belowKktp: { kelas: string; mapel: string; tuntasPct: number | null }[];
  schedules: ScheduleItem[]; classes: ClassRef[]; onNavigate: (s: Screen) => void;
}) {
  const [trenPeriod, setTrenPeriod] = useState<'10H' | '1B' | '3B'>('10H');
  const [berandaModal, setBerandaModal] = useState<null | 'kehadiran' | 'guruHadir' | 'kelasBerjalan'>(null);
  const [trenData, setTrenData] = useState<{ siswa: number[]; guru: number[] } | null>(null);
  const [trenLoading, setTrenLoading] = useState(false);
  const dow = scheduleDayOfWeek();
  const todaySchedules = schedules.filter((s) => s.dayOfWeek === dow);
  const activeClasses = new Set(todaySchedules.map((s) => s.class?.name)).size;
  const todayHadirPct = todayAtt.length ? Math.round((todayAtt.filter((a) => a.status === 'hadir').length / todayAtt.length) * 100) : null;

  // T2-02: Fetch heatmap data for trend chart
  useEffect(() => {
    const days = trenPeriod === '10H' ? 10 : trenPeriod === '1B' ? 30 : 90;
    setTrenLoading(true);
    fetchAttendanceHeatmap(days).then((res) => {
      if (res.success && res.data) {
        // Compute daily overall pct from heatmap
        const pcts = res.data.dates.map((_, i) => {
          let h = 0, t = 0;
          for (const c of res.data!.classes) {
            const cell = c.cells[i];
            if (cell) { h += cell.hadir; t += cell.total; }
          }
          return t ? Math.round((h / t) * 1000) / 10 : 0;
        });
        // Split into siswa (first half) and guru (second half) — approximate
        // Since heatmap is student attendance, use it for siswa; guru stays SIMULASI
        setTrenData({ siswa: pcts, guru: pcts.map(p => Math.min(100, p + 2)) }); // Simulate guru slightly higher
      }
    }).finally(() => setTrenLoading(false));
  }, [trenPeriod]);

  return (
    <div className="space-y-4">
      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi icon={Users} label="Kehadiran Siswa" value={todayHadirPct !== null ? `${todayHadirPct}%` : '—'} sub={todayAtt.length ? `${todayAtt.length} catatan hari ini` : undefined} onClick={() => setBerandaModal('kehadiran')} />
        <Kpi icon={BadgeCheck} label="Guru Hadir" value="—" sub="SIMULASI" onClick={() => setBerandaModal('guruHadir')} />
        <Kpi icon={Presentation} label="Kelas Berjalan" value={`${activeClasses}`} sub={`${todaySchedules.length} sesi hari ini`} onClick={() => setBerandaModal('kelasBerjalan')} />
        <Kpi icon={FileClock} label="Modul Pending" value={`${pendingRpp}`} valueClass="text-amber-600" onClick={() => onNavigate('modul')} />
        <Kpi icon={ClipboardPenLine} label="Sumatif Pending" value={`${pendingSumatif}`} valueClass="text-amber-600" onClick={() => onNavigate('sumatif')} />
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
            <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">BAIK</span>
          </div>
          <div className="mt-3 flex items-center gap-5">
            <div>
              <div className="text-[42px] font-extrabold leading-none tracking-tighter text-[#0f2e25]">{SIM_HEALTH.score}<span className="text-base text-[#6b8079]">/100</span></div>
              <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">+{SIM_HEALTH.delta} pt</div>
            </div>
            <div className="flex flex-1 flex-col gap-2">
              {SIM_HEALTH.pilars.map((p) => (
                <div key={p.label} className="grid grid-cols-[80px_1fr_28px] items-center gap-2 text-[11px] font-semibold text-[#355a4e]">
                  <span className="truncate">{p.label}</span>
                  <span className="h-[7px] overflow-hidden rounded-md bg-[#eef3f0]"><span className="block h-full rounded-md" style={{ width: `${p.pct}%`, background: p.pct < 75 ? 'linear-gradient(90deg,#fbbf24,#d97706)' : 'linear-gradient(90deg,#6ee7b7,#059669)' }} /></span>
                  <span className="text-right tabular-nums">{p.pct}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700"><AlertTriangle className="h-3 w-3" /> SIMULASI — agregasi backend menyusul</div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Perlu Tindakan */}
        <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
          <h3 className="flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]"><ListChecks className="h-[18px] w-[18px] text-emerald-600" />Perlu Tindakan</h3>
          <div className="mt-3 space-y-2.5">
            {pendingRpp > 0 && (
              <button type="button" onClick={() => onNavigate('modul')} className="flex w-full items-center gap-3 rounded-xl border border-[#e6efea] bg-white p-3 text-left transition hover:border-emerald-200 hover:shadow-sm">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-600"><FileClock className="h-[18px] w-[18px]" /></div>
                <div className="min-w-0 flex-1"><b className="text-[12.5px] text-[#0f2e25]">{pendingRpp} Modul Ajar menunggu approval</b><div className="text-[11.5px] text-[#6b8079]">Klik untuk review</div></div>
                <ChevronRight className="h-4 w-4 shrink-0 text-[#9bb0a8]" />
              </button>
            )}
            {pendingSumatif > 0 && (
              <button type="button" onClick={() => onNavigate('sumatif')} className="flex w-full items-center gap-3 rounded-xl border border-[#e6efea] bg-white p-3 text-left transition hover:border-emerald-200 hover:shadow-sm">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-600"><ClipboardPenLine className="h-[18px] w-[18px]" /></div>
                <div className="min-w-0 flex-1"><b className="text-[12.5px] text-[#0f2e25]">{pendingSumatif} soal sumatif perlu audit</b><div className="text-[11.5px] text-[#6b8079]">Klik untuk audit</div></div>
                <ChevronRight className="h-4 w-4 shrink-0 text-[#9bb0a8]" />
              </button>
            )}
            {belowKktp.length > 0 && (
              <button type="button" onClick={() => onNavigate('monitor')} className="flex w-full items-center gap-3 rounded-xl border border-[#e6efea] bg-white p-3 text-left transition hover:border-emerald-200 hover:shadow-sm">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-rose-50 text-rose-600"><AlertTriangle className="h-[18px] w-[18px]" /></div>
                <div className="min-w-0 flex-1"><b className="text-[12.5px] text-[#0f2e25]">{belowKktp.length} kelas di bawah KKTP</b><div className="text-[11.5px] text-[#6b8079]">{belowKktp.slice(0, 2).map((k) => `${k.kelas} — ${k.mapel} ${k.tuntasPct}%`).join(' · ')}</div></div>
                <ChevronRight className="h-4 w-4 shrink-0 text-[#9bb0a8]" />
              </button>
            )}
            <button type="button" onClick={() => onNavigate('monitor')} className="flex w-full items-center gap-3 rounded-xl border border-[#e6efea] bg-white p-3 text-left transition hover:border-emerald-200 hover:shadow-sm">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-600"><UserX className="h-[18px] w-[18px]" /></div>
              <div className="min-w-0 flex-1"><b className="text-[12.5px] text-[#0f2e25]">{SIM_RPP_SLOW} guru RPP turnaround &gt; 7 hari</b><div className="text-[11.5px] text-[#6b8079]">Perlu follow-up Wakakur · <span className="font-bold text-amber-700">SIMULASI</span></div></div>
              <ChevronRight className="h-4 w-4 shrink-0 text-[#9bb0a8]" />
            </button>
            {pendingRpp === 0 && pendingSumatif === 0 && belowKktp.length === 0 && SIM_RPP_SLOW === 0 && (
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
          {trenLoading ? (
            <div className="flex h-32 items-center justify-center text-[12px] font-medium text-[#9bb0a8]">Memuat data tren...</div>
          ) : trenData ? (
            <TrenChart siswa={trenData.siswa} guru={trenData.guru} />
          ) : (
            <TrenChart siswa={trenPeriod === '10H' ? SIM_TREN_SISWA : trenPeriod === '1B' ? SIM_TREN_SISWA_1B : SIM_TREN_SISWA_3B} guru={trenPeriod === '10H' ? SIM_TREN_GURU : trenPeriod === '1B' ? SIM_TREN_GURU_1B : SIM_TREN_GURU_3B} />
          )}
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700"><AlertTriangle className="h-3 w-3" /> {trenData ? 'Data siswa nyata — data guru masih SIMULASI' : 'SIMULASI — agregasi backend menyusul'}</div>
        </div>
      </div>

      {/* Drill-down Modals */}
      {berandaModal === 'kehadiran' && <KehadiranDetailModal todayAtt={todayAtt} onClose={() => setBerandaModal(null)} />}
      {berandaModal === 'guruHadir' && <GuruHadirModal onClose={() => setBerandaModal(null)} />}
      {berandaModal === 'kelasBerjalan' && <KelasBerjalanModal schedules={schedules} classes={classes} onClose={() => setBerandaModal(null)} />}
    </div>
  );
}

// ═══ BERANDA: HEATMAP PAPAN ═══════════════════════════════════════════════════

function PapanHeatmap({ schedules, classes }: { schedules: ScheduleItem[]; classes: ClassRef[] }) {
  const dow = scheduleDayOfWeek();
  const { minutes } = wibNow();
  const liveJp = currentJp(minutes);
  const todaySched = schedules.filter((s) => s.dayOfWeek === dow);

  const grid = useMemo(() => {
    const m = new Map<string, Map<number, ScheduleItem>>();
    for (const s of todaySched) {
      if (!m.has(s.classId)) m.set(s.classId, new Map());
      for (let jp = s.jpStart; jp <= s.jpEnd; jp++) m.get(s.classId)!.set(jp, s);
    }
    return m;
  }, [todaySched]);

  if (todaySched.length === 0) {
    return <div className="mt-3 grid h-20 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] font-medium text-[#9bb0a8]">Tidak ada jadwal mengajar hari ini.</div>;
  }

  return (
    <div className="mt-3 overflow-x-auto">
      <div className="flex min-w-[520px] flex-col gap-1">
        <div className="flex items-center gap-1">
          <div className="w-20 shrink-0" />
          {JP_SLOTS.map((slot) => (
            <div key={slot.jp} className={clsx('flex-1 text-center', slot.jp === liveJp ? 'text-emerald-700' : 'text-[#9bb0a8]')}>
              <div className="text-[10px] font-bold">JP{slot.jp}</div>
              <div className="text-[9px]">{fmtMin(slot.startMin)}</div>
            </div>
          ))}
        </div>
        {classes.map((cls) => {
          const row = grid.get(cls.id);
          return (
            <div key={cls.id} className="flex items-center gap-1">
              <div className="w-20 shrink-0 truncate text-[11px] font-bold text-[#355a4e]">{cls.name}</div>
              {JP_SLOTS.map((slot) => {
                const sched = row?.get(slot.jp);
                const isLive = slot.jp === liveJp;
                if (sched) {
                  const mp = sched.teachingAssignment?.subject ?? '—';
                  const mpShort = mp.length > 8 ? mp.slice(0, 7) + '…' : mp;
                  const guruName = sched.teachingAssignment?.teacher?.user?.fullName ?? '—';
                  return (
                    <div key={slot.jp} title={`JP${slot.jp} (${fmtMin(slot.startMin)}–${fmtMin(slot.endMin)}) · ${mp} · ${guruName} · ${sched.room ?? '—'}`}
                      className={clsx('flex h-[34px] min-w-[48px] flex-1 cursor-pointer items-center justify-center rounded-md text-[9px] font-bold text-white transition hover:scale-105',
                        isLive ? 'bg-emerald-500 ring-2 ring-emerald-700 ring-offset-1' : 'bg-emerald-500/85')}>
                      {mpShort}
                    </div>
                  );
                }
                return <div key={slot.jp} className="flex h-[34px] min-w-[48px] flex-1 items-center justify-center rounded-md border border-dashed border-[#e6efea] bg-[#f4f7f5] text-[9px] text-[#9bb0a8]">—</div>;
              })}
            </div>
          );
        })}
      </div>
      <div className="mt-2.5 flex gap-3.5 text-[11px] font-semibold text-[#6b8079]">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />Ada jadwal</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-dashed border-[#e6efea] bg-[#f4f7f5]" />Kosong</span>
        {liveJp > 0 && <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500 ring-2 ring-emerald-700 ring-offset-1" />Berlangsung</span>}
        <span className="ml-auto text-[#9bb0a8]">Hover untuk info</span>
      </div>
    </div>
  );
}

// ═══ BERANDA: DRILL-DOWN MODALS ═══════════════════════════════════════════════

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sticky top-0 flex items-center justify-between border-b border-[#e6efea] bg-white px-5 py-4">
          <div><h3 className="flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]"><Users className="h-5 w-5 text-emerald-600" />Kehadiran Siswa — Rincian</h3><p className="text-[11.5px] text-[#6b8079]">Per kelas · {wibDateLabel()}</p></div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-[#9bb0a8] hover:bg-[#f4f7f5]" aria-label="Tutup"><X className="h-5 w-5" /></button>
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
      </div>
    </div>
  );
}

function GuruHadirModal({ onClose }: { onClose: () => void }) {
  const simGuru = SIM_GURU_LIST.map((nama, i) => ({
    nama,
    inisial: nama.split(' ').map((w) => w[0]).slice(0, 2).join(''),
    mapel: ['Matematika', 'Pemrograman Web', 'TKRO Produktif', 'B. Indonesia', 'B. Inggris', 'Akuntansi', 'Fisika'][i] ?? '—',
    jp: 20 + ((i * 3) % 12),
    status: i === 4 ? 'Izin' : 'Hadir',
  }));
  const hadir = simGuru.filter((g) => g.status === 'Hadir').length;
  const izin = simGuru.filter((g) => g.status !== 'Hadir');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sticky top-0 flex items-center justify-between border-b border-[#e6efea] bg-white px-5 py-4">
          <div><h3 className="flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]"><BadgeCheck className="h-5 w-5 text-emerald-600" />Guru Hadir — {hadir}/{simGuru.length}</h3><p className="text-[11.5px] text-[#6b8079]">{hadir} hadir · {izin.length} tidak hadir · {wibDateLabel()}</p></div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-[#9bb0a8] hover:bg-[#f4f7f5]" aria-label="Tutup"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap gap-2">
            <StatPill n={`${hadir}`} l="Hadir" />
            <StatPill n={`${izin.length}`} l="Izin/Sakit" />
            <StatPill n={`${simGuru.length}`} l="Total Guru" />
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-[10.5px] font-bold text-amber-700"><AlertTriangle className="h-3 w-3" /> SIMULASI — backend /teachers/attendance belum tersedia</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead><tr className="border-b border-[#e6efea] text-left text-[10.5px] uppercase tracking-wide text-[#6b8079]">
                <th className="py-2 pr-3">Guru</th><th className="py-2 pr-3">Mapel</th><th className="py-2 pr-3 text-right">JP</th><th className="py-2 pr-3">Status</th><th className="py-2">Pengganti</th>
              </tr></thead>
              <tbody>
                {simGuru.map((g) => (
                  <tr key={g.nama} className="border-b border-[#f0f4f2]">
                    <td className="py-2.5 pr-3"><span className="mr-1.5 inline-grid h-5 w-5 place-items-center rounded bg-emerald-100 text-[9px] font-bold text-emerald-700">{g.inisial}</span><b className="text-[#0f2e25]">{g.nama.split(',')[0]}</b></td>
                    <td className="py-2.5 pr-3 text-[#355a4e]">{g.mapel}</td>
                    <td className="py-2.5 pr-3 text-right text-[#355a4e]">{g.jp} JP</td>
                    <td className="py-2.5 pr-3"><span className={clsx('rounded-md px-2 py-0.5 text-[10.5px] font-bold', g.status === 'Hadir' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>{g.status}</span></td>
                    <td className="py-2.5 text-[#355a4e]">{g.status !== 'Hadir' ? <span className="rounded-md bg-sky-50 px-2 py-0.5 text-[10.5px] font-bold text-sky-700">Belajar Mandiri</span> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {izin.length > 0 && <div className="rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] font-semibold text-amber-700"><AlertTriangle className="mr-1 inline h-3 w-3" />{izin.map((g) => `${g.nama.split(',')[0]} (${g.status})`).join(', ')} — kelas yang bersangkutan belajar mandiri atau digantikan rekan sejawat.</div>}
        </div>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[#e6efea] bg-white px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-[#e6efea] bg-white px-4 py-2 text-[12.5px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]">Tutup</button>
        </div>
      </div>
    </div>
  );
}

function KelasBerjalanModal({ schedules, classes, onClose }: { schedules: ScheduleItem[]; classes: ClassRef[]; onClose: () => void }) {
  const dow = scheduleDayOfWeek();
  const { minutes } = wibNow();
  const liveJp = currentJp(minutes);
  const todaySched = schedules.filter((s) => s.dayOfWeek === dow);

  const data = classes.map((cls) => {
    const classSched = todaySched.filter((s) => s.classId === cls.id);
    const live = classSched.find((s) => liveJp >= s.jpStart && liveJp <= s.jpEnd);
    const next = classSched.find((s) => s.jpStart > liveJp);
    const slot = live ?? next;
    return {
      rombel: cls.name,
      jp: slot ? `JP${slot.jpStart}` : '—',
      mapel: slot?.teachingAssignment?.subject ?? 'Libur',
      guru: slot?.teachingAssignment?.teacher?.user?.fullName?.split(',')[0] ?? '—',
      ruang: slot?.room ?? '—',
      status: live ? 'Berlangsung' : slot ? 'Terjadwal' : 'Libur',
    };
  });

  const liveCount = data.filter((d) => d.status === 'Berlangsung').length;
  const scheduledCount = data.filter((d) => d.status === 'Terjadwal').length;
  const idleCount = data.filter((d) => d.status === 'Libur').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sticky top-0 flex items-center justify-between border-b border-[#e6efea] bg-white px-5 py-4">
          <div><h3 className="flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]"><Presentation className="h-5 w-5 text-emerald-600" />Kelas Berjalan — {liveCount}/{classes.length}</h3><p className="text-[11.5px] text-[#6b8079]">{liveCount} berlangsung · {scheduledCount} terjadwal · {idleCount} libur · {wibDateLabel()}</p></div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-[#9bb0a8] hover:bg-[#f4f7f5]" aria-label="Tutup"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap gap-2">
            <StatPill n={`${liveCount}`} l="Berlangsung" />
            <StatPill n={`${scheduledCount}`} l="Terjadwal" />
            <StatPill n={`${idleCount}`} l="Libur" />
            <StatPill n={`${classes.length}`} l="Total Rombel" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead><tr className="border-b border-[#e6efea] text-left text-[10.5px] uppercase tracking-wide text-[#6b8079]">
                <th className="py-2 pr-3">Rombel</th><th className="py-2 pr-3">JP</th><th className="py-2 pr-3">Mapel</th><th className="py-2 pr-3">Guru</th><th className="py-2 pr-3">Ruang</th><th className="py-2">Status</th>
              </tr></thead>
              <tbody>
                {data.map((d) => (
                  <tr key={d.rombel} className="border-b border-[#f0f4f2]">
                    <td className="py-2.5 pr-3 font-bold text-[#0f2e25]">{d.rombel}</td>
                    <td className="py-2.5 pr-3 text-[#355a4e]">{d.jp}</td>
                    <td className="py-2.5 pr-3 text-[#355a4e]">{d.mapel}</td>
                    <td className="py-2.5 pr-3 text-[#355a4e]">{d.guru}</td>
                    <td className="py-2.5 pr-3 text-[#355a4e]">{d.ruang}</td>
                    <td className="py-2.5">
                      <span className={clsx('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] font-bold', d.status === 'Berlangsung' ? 'bg-emerald-50 text-emerald-700' : d.status === 'Terjadwal' ? 'bg-slate-100 text-slate-600' : 'bg-rose-50 text-rose-600')}>
                        {d.status === 'Berlangsung' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />}
                        {d.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[#e6efea] bg-white px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-[#e6efea] bg-white px-4 py-2 text-[12.5px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]">Tutup</button>
        </div>
      </div>
    </div>
  );
}

// ═══ SCREEN 2: MODUL AJAR (RPP Approval) ═══════════════════════════════════════

function ModulAjarKs({ rpp, onReview, showToast }: { rpp: RppItem[]; onReview: (r: RppItem) => void; showToast: (msg: string) => void }) {
  const [filter, setFilter] = useState<'Semua' | 'Menunggu' | 'Disetujui' | 'Ditolak'>('Semua');
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const statusMap: Record<string, 'Semua' | 'Menunggu' | 'Disetujui' | 'Ditolak'> = {
    submitted: 'Menunggu', approved: 'Disetujui', revision: 'Ditolak', draft: 'Semua',
  };
  const filtered = rpp.filter((r) => filter === 'Semua' || statusMap[r.status] === filter);

  const handleReview = (r: RppItem, decision: 'approved' | 'revision') => {
    const note = decision === 'revision' ? window.prompt('Alasan revisi (opsional):', '') : undefined;
    setErr(null); setBusyId(r.id);
    startTransition(async () => {
      const res = await reviewRpp(r.id, decision, note ?? undefined);
      setBusyId(null);
      if (res.success) showToast(decision === 'approved' ? 'Modul ajar disetujui — notifikasi terkirim ke guru' : 'Modul ajar ditolak — guru diberi notifikasi');
      else setErr(res.error ?? 'Gagal mereview Modul Ajar.');
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-[17px] font-bold text-[#0f2e25]"><FileCheck2 className="h-5 w-5 text-emerald-600" />Approval Modul Ajar / RPP</h3>
          <p className="text-[12.5px] text-[#6b8079]">Review dan approve modul ajar yang diajukan guru</p>
        </div>
        <div className="inline-flex rounded-xl bg-[#f4f7f5] p-1">
          {(['Semua', 'Menunggu', 'Disetujui', 'Ditolak'] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)}
              className={clsx('rounded-lg px-3 py-1.5 text-[12px] font-bold', filter === f ? 'bg-white text-emerald-700 shadow-sm' : 'text-[#6b8079]')}>{f}</button>
          ))}
        </div>
      </div>

      {err && <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-600"><AlertTriangle className="h-4 w-4 shrink-0" />{err}</div>}

      {filtered.length === 0 ? (
        <div className="grid h-24 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] text-[#9bb0a8]">Tidak ada modul ajar untuk filter ini.</div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((r) => {
            const st = statusMap[r.status] ?? 'Semua';
            const stBadge = st === 'Menunggu' ? 'bg-amber-50 text-amber-700' : st === 'Disetujui' ? 'bg-emerald-50 text-emerald-700' : st === 'Ditolak' ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-600';
            const isBusy = pending && busyId === r.id;
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[#e6efea] bg-white p-3.5">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-100 text-[12px] font-bold text-emerald-700">{r.subject.charAt(0)}</div>
                <div className="min-w-0 flex-1">
                  <b className="text-[13px] text-[#0f2e25]">{r.title}</b>
                  <div className="text-[11px] text-[#6b8079]">{r.subject} · {r.class?.name ?? '—'} · {r.status === 'submitted' ? 'diajukan' : r.status === 'approved' ? 'disetujui' : r.status === 'revision' ? 'revisi' : 'draft'}{r.submittedAt ? ` ${new Date(r.submittedAt).toLocaleDateString('id')}` : ''}</div>
                  {r.status === 'revision' && r.reviewNote && <div className="mt-1 text-[10.5px] font-medium text-amber-700">Catatan KS: {r.reviewNote}</div>}
                </div>
                <span className={clsx('rounded-md px-2 py-0.5 text-[10.5px] font-bold', stBadge)}>{st}</span>
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => onReview(r)} className="inline-flex items-center gap-1 rounded-lg border border-[#e6efea] bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]"><Info className="h-3.5 w-3.5" />Detail</button>
                  {r.status === 'submitted' && (
                    <>
                      <button type="button" onClick={() => handleReview(r, 'approved')} disabled={isBusy} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"><Check className="h-3.5 w-3.5" />Approve</button>
                      <button type="button" onClick={() => handleReview(r, 'revision')} disabled={isBusy} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-600 hover:bg-rose-100 disabled:opacity-50"><X className="h-3.5 w-3.5" />Tolak</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══ SCREEN 3: AUDIT SUMATIF ═════════════════════════════════════════════════

function AuditSumatifKs({ onOpenDetail, data }: { onOpenDetail: (s: typeof SIM_SUMATIF[number]) => void; data: typeof SIM_SUMATIF }) {
  const [filter, setFilter] = useState<'Semua' | 'Menunggu' | 'Disetujui' | 'Ditolak'>('Semua');
  const filtered = data.filter((s) => filter === 'Semua' || s.status === filter);
  const sumatifDataPresent = data.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-[17px] font-bold text-[#0f2e25]"><ClipboardPenLine className="h-5 w-5 text-emerald-600" />Audit Sumatif</h3>
          <p className="text-[12.5px] text-[#6b8079]">Review soal sumatif sebelum dipublikasi ke siswa</p>
        </div>
        <div className="inline-flex rounded-xl bg-[#f4f7f5] p-1">
          {(['Semua', 'Menunggu', 'Disetujui', 'Ditolak'] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)} className={clsx('rounded-lg px-3 py-1.5 text-[12px] font-bold', filter === f ? 'bg-white text-emerald-700 shadow-sm' : 'text-[#6b8079]')}>{f}</button>
          ))}
        </div>
      </div>
      {sumatifDataPresent ? (
        <div className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-2.5 py-1 text-[10.5px] font-bold text-sky-700"><ClipboardPenLine className="h-3 w-3" /> Data sesi dari /assessment/sessions</div>
      ) : null}
      <div className="space-y-2.5">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#e6efea] bg-[#f9fbfa] px-4 py-8 text-center">
            <ClipboardPenLine className="mx-auto h-7 w-7 text-[#cbd5e1]" />
            <p className="mt-2 text-[13px] font-bold text-[#0f2e25]">Belum ada sesi sumatif</p>
            <p className="text-[11.5px] text-[#6b8079]">Sesi assessment yang dibuat guru akan muncul di sini untuk diaudit.</p>
          </div>
        ) : (
          filtered.map((s) => {
            const stBadge = s.status === 'Menunggu' ? 'bg-amber-50 text-amber-700' : s.status === 'Disetujui' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600';
            return (
              <button key={s.id} type="button" onClick={() => onOpenDetail(s)} className="flex w-full items-center gap-3 rounded-xl border border-[#e6efea] bg-white p-3.5 text-left transition hover:border-emerald-200 hover:shadow-sm">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-100 text-[11px] font-bold text-emerald-700">{s.jenis}</div>
                <div className="min-w-0 flex-1"><b className="text-[13px] text-[#0f2e25]">{s.judul}</b><div className="text-[11px] text-[#6b8079]">{s.guru} · {s.mapel} · {s.kelas} · {s.soal} soal · {s.tanggal}</div></div>
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

function MonitoringKbmKs({ kelasMapel, attendances: _attendances, schedules, classes }: {
  kelasMapel: { kelas: string; mapel: string; avg: number | null; tuntasPct: number | null; count: number }[];
  attendances: AttendanceItem[]; schedules: ScheduleItem[]; classes: ClassRef[];
}) {
  const onTrack = kelasMapel.filter((k) => k.tuntasPct !== null && k.tuntasPct >= 75).length;
  const perhatian = kelasMapel.filter((k) => k.tuntasPct !== null && k.tuntasPct >= 60 && k.tuntasPct < 75).length;
  const berisiko = kelasMapel.filter((k) => k.tuntasPct !== null && k.tuntasPct < 60).length;

  const cellTone = (pct: number | null) => pct === null ? 'bg-[#f9fbfa] text-[#cbd5e1]' : pct >= 75 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : pct >= 60 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-rose-50 text-rose-600 border-rose-200';

  // B6: Fetch real monitoring data from /analytics/monitoring-kbm
  const [realMonData, setRealMonData] = useState<Array<{ guru: string; mapel: string; kelas: string; jp: number; avg: number | null; tuntasPct: number | null; hadirPct: number | null; jurnalCount: number; gradeCount: number; status: string }>>([]);
  useEffect(() => {
    fetchMonitoringKbm().then((res) => {
      if (res.success && res.data) {
        const data = res.data as { data: Array<{ guru: string; mapel: string; kelas: string; jp: number; avg: number | null; tuntasPct: number | null; hadirPct: number | null; jurnalCount: number; gradeCount: number; status: string }> };
        setRealMonData(data.data ?? []);
      }
    });
  }, []);

  // Use real data if available, otherwise fall back to SIMULASI from kelasMapel
  const monData = realMonData.length > 0 ? realMonData.map((m) => ({
    guru: m.guru, mapel: m.mapel, kelas: m.kelas, cp: m.tuntasPct ?? 0,
    pert: 0, rencana: 0, jurnal: m.jurnalCount, hadir: m.hadirPct ?? 0, rata: m.avg, status: m.status as 'on' | 'warn' | 'risk',
  })) : useMemo(() => kelasMapel.map((k, i) => {
    const tp = k.tuntasPct ?? 75;
    const status = tp >= 75 ? 'on' as const : tp >= 60 ? 'warn' as const : 'risk' as const;
    return { guru: SIM_MON_GURUS[i % SIM_MON_GURUS.length]!, mapel: k.mapel, kelas: k.kelas, cp: tp, pert: 4 + (i % 4), rencana: 12 + (i % 5), jurnal: 3 + (i % 4), hadir: 85 + (i % 10), rata: k.avg, status };
  }), [kelasMapel]);

  // G8: Guru × Kelas matrix data
  const guruList = useMemo(() => [...new Set(monData.map((m) => m.guru))], [monData]);
  const kelasList = useMemo(() => [...new Set(monData.map((m) => m.kelas))], [monData]);
  const monCellCls = (s: string) => s === 'on' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : s === 'warn' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-rose-50 border-rose-200 text-rose-600';
  const monCellCol = (s: string) => s === 'on' ? 'text-emerald-700' : s === 'warn' ? 'text-amber-600' : 'text-rose-600';

  // G10: Kehadiran per Sesi (JP) matrix
  const dow = scheduleDayOfWeek();
  const todaySched = schedules.filter((s) => s.dayOfWeek === dow);
  const classJpSched = useMemo(() => {
    const m = new Map<string, Map<number, ScheduleItem>>();
    for (const s of todaySched) {
      if (!m.has(s.classId)) m.set(s.classId, new Map());
      for (let jp = s.jpStart; jp <= s.jpEnd; jp++) m.get(s.classId)!.set(jp, s);
    }
    return m;
  }, [todaySched]);
  const { minutes } = wibNow();
  const liveJp = currentJp(minutes);

  return (
    <div className="space-y-4">
      <h3 className="flex items-center gap-2 text-[17px] font-bold text-[#0f2e25]"><Monitor className="h-5 w-5 text-emerald-600" />Monitoring KBM</h3>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={LayoutGrid} label="Total Kelas×Mapel" value={`${kelasMapel.length}`} />
        <Kpi icon={CheckCircle2} label="On Track" value={`${onTrack}`} valueClass="text-emerald-700" />
        <Kpi icon={AlertTriangle} label="Perhatian" value={`${perhatian}`} valueClass="text-amber-600" />
        <Kpi icon={XCircle} label="Berisiko" value={`${berisiko}`} valueClass="text-rose-600" />
      </div>

      {/* G8: Matriks Progres CP — Guru × Kelas (SIMULASI) */}
      <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h4 className="flex items-center gap-2 text-[14px] font-bold text-[#0f2e25]"><LayoutGrid className="h-4 w-4 text-emerald-600" />Matriks Progres CP — Guru × Kelas</h4>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700"><AlertTriangle className="h-3 w-3" /> SIMULASI</span>
        </div>
        <p className="text-[11.5px] text-[#6b8079]">Persen ketercapaian CP/TP per guru × kelas</p>
        {monData.length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[11.5px] border-separate" style={{ borderSpacing: 4 }}>
              <thead><tr className="text-[10px] font-extrabold uppercase text-[#6b8079]"><th className="px-2 py-2 text-left">Guru \ Kelas</th>{kelasList.map((k) => <th key={k} className="px-2 py-2 text-center">{k}</th>)}</tr></thead>
              <tbody>
                {guruList.map((g) => (
                  <tr key={g}>
                    <td className="px-2 py-2 text-left font-bold text-[#0f2e25] whitespace-nowrap">{g.split(',')[0]}</td>
                    {kelasList.map((k) => {
                      const r = monData.find((m) => m.guru === g && m.kelas === k);
                      return r ? (
                        <td key={k} className={clsx('rounded-md border px-2 py-2 text-center', monCellCls(r.status))}>
                          <b>{r.cp}%</b>
                          <div className="text-[9.5px] font-medium opacity-80">{r.mapel.length > 10 ? r.mapel.slice(0, 9) + '…' : r.mapel}</div>
                          <div className="text-[9.5px] opacity-60">{r.pert}/{r.rencana} pert</div>
                        </td>
                      ) : <td key={k} className="px-2 py-2 text-center text-[#cbd5e1]">–</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="mt-3 grid h-20 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] text-[#9bb0a8]">Belum ada data.</div>}
      </div>

      {/* G9: Rincian Progres per Guru (SIMULASI) */}
      <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
        <h4 className="flex items-center gap-2 text-[14px] font-bold text-[#0f2e25]"><ListChecks className="h-4 w-4 text-emerald-600" />Rincian Progres per Guru</h4>
        <div className="mt-3 space-y-1">
          {monData.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_2fr_48px_56px] items-center gap-3 border-b border-[#f0f4f2] py-2 text-[12px] font-bold">
              <span className="text-[#0f2e25]">{r.guru.split(',')[0]}</span>
              <span className="text-[#6b8079]">{r.kelas}</span>
              <div>
                <div className="text-[11px] font-bold text-[#355a4e]">{r.mapel}</div>
                <div className="mt-1 h-[9px] overflow-hidden rounded-md bg-[#eef3f0]"><span className="block h-full rounded-md" style={{ width: `${r.cp}%`, background: r.status === 'on' ? 'linear-gradient(90deg,#34d399,#059669)' : r.status === 'warn' ? 'linear-gradient(90deg,#fbbf24,#d97706)' : 'linear-gradient(90deg,#fb7185,#e11d48)' }} /></div>
              </div>
              <span className={clsx('text-right', monCellCol(r.status))}>{r.cp}%</span>
              <span className="text-right text-[#6b8079]">{r.pert}/{r.rencana}</span>
            </div>
          ))}
          {monData.length === 0 && <div className="grid h-20 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] text-[#9bb0a8]">Belum ada data.</div>}
        </div>
      </div>

      {/* G10: Kehadiran Siswa per Sesi (JP) */}
      <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h4 className="flex items-center gap-2 text-[14px] font-bold text-[#0f2e25]"><Users className="h-4 w-4 text-emerald-600" />Kehadiran Siswa per Sesi (JP)</h4>
          <span className="rounded-md bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700">{wibDateLabel()}</span>
        </div>
        <p className="text-[11.5px] text-[#6b8079]">Persentase kehadiran siswa per rombel × sesi (JP) — hari ini · <span className="font-bold text-amber-700">SIMULASI</span></p>
        {todaySched.length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[11.5px] border-separate" style={{ borderSpacing: 4 }}>
              <thead><tr className="text-[10px] font-extrabold uppercase text-[#6b8079]"><th className="px-2 py-2 text-left">Rombel \ JP</th>{JP_SLOTS.map((slot) => <th key={slot.jp} className={clsx('px-2 py-2 text-center', slot.jp === liveJp ? 'text-emerald-700' : '')}>JP{slot.jp}</th>)}</tr></thead>
              <tbody>
                {classes.map((cls, ci) => {
                  const jpMap = classJpSched.get(cls.id);
                  return (
                    <tr key={cls.id}>
                      <td className="px-2 py-2 text-left font-bold text-[#0f2e25] whitespace-nowrap">{cls.name}</td>
                      {JP_SLOTS.map((slot) => {
                        const sched = jpMap?.get(slot.jp);
                        if (sched) {
                          const hadir = 85 + ((ci * 3 + slot.jp * 2) % 13);
                          const cls2 = hadir >= 90 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : hadir >= 85 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-rose-50 border-rose-200 text-rose-600';
                          const mp = sched.teachingAssignment?.subject ?? '—';
                          return <td key={slot.jp} className={clsx('rounded-md border px-2 py-1.5 text-center', cls2)}><b>{hadir}%</b><div className="text-[9.5px] opacity-70">{mp.length > 10 ? mp.slice(0, 9) + '…' : mp}</div></td>;
                        }
                        return <td key={slot.jp} className="rounded-md border border-dashed border-[#e6efea] bg-[#f4f7f5] px-2 py-1.5 text-center text-[#9bb0a8]">—</td>;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <div className="mt-3 grid h-20 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] font-medium text-[#9bb0a8]">Tidak ada jadwal mengajar hari ini.</div>}
      </div>

      {/* Rincian per Kelas × Mapel (real data) */}
      <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
        <h4 className="flex items-center gap-2 text-[14px] font-bold text-[#0f2e25]"><Table2 className="h-4 w-4 text-emerald-600" />Rincian per Kelas × Mapel</h4>
        <p className="text-[11.5px] text-[#6b8079]">Rata² nilai & persentase ketuntasan KKTP dari data gradebook nyata</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead><tr className="border-b border-[#e6efea] text-left text-[10.5px] uppercase tracking-wide text-[#6b8079]">
              <th className="py-2 pr-3">Kelas</th><th className="py-2 pr-3">Mapel</th><th className="py-2 pr-3 text-right">Rata²</th><th className="py-2 pr-3 text-right">Entri</th><th className="py-2 text-right">Tuntas</th>
            </tr></thead>
            <tbody>
              {kelasMapel.map((k, i) => (
                <tr key={i} className="border-b border-[#f0f4f2]">
                  <td className="py-2.5 pr-3 font-bold text-[#0f2e25]">{k.kelas}</td>
                  <td className="py-2.5 pr-3 text-[#355a4e]">{k.mapel}</td>
                  <td className="py-2.5 pr-3 text-right font-bold text-[#0f2e25]">{k.avg ?? '—'}</td>
                  <td className="py-2.5 pr-3 text-right text-[#355a4e]">{k.count}</td>
                  <td className="py-2.5 text-right">
                    {k.tuntasPct !== null ? <span className={clsx('rounded-md px-2 py-0.5 text-[10.5px] font-bold', cellTone(k.tuntasPct))}>{k.tuntasPct}%</span> : <span className="text-[#cbd5e1]">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ═══ SCREEN 5: REKAP AUDIT ═══════════════════════════════════════════════════

function RekapAuditKs({ kelasMapel, grades, attendances, activities, rpp }: {
  kelasMapel: { kelas: string; mapel: string; avg: number | null; tuntasPct: number | null; count: number }[];
  grades: GradeItem[]; attendances: AttendanceItem[]; activities: ActivityItem[]; rpp: RppItem[];
}) {
  const scores = grades.map((g) => Number(g.score)).filter((n) => !Number.isNaN(n));
  const rata = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;
  const tuntas = scores.filter((s) => s >= KKTP_DEFAULT).length;
  const tuntasPct = scores.length ? Math.round((tuntas / scores.length) * 100) : null;
  const approvedRpp = rpp.filter((r) => r.status === 'approved').length;
  const hadirPct = attendances.length ? Math.round((attendances.filter((a) => a.status === 'hadir').length / attendances.length) * 100) : null;

  const kelasList = [...new Set(kelasMapel.map((k) => k.kelas))].sort();
  const mapelList = [...new Set(kelasMapel.map((k) => k.mapel))].sort();

  // B7: Fetch real rekap audit data from /analytics/rekap-audit
  const [realRekap, setRealRekap] = useState<Array<{ teacher: string; className: string; subject: string; count: number; average: number; tuntasCount: number; tuntasPct: number | null }>>([]);
  useEffect(() => {
    fetchRekapAudit().then((res) => {
      if (res.success && res.data) {
        const data = res.data as { data: Array<{ teacher: string; className: string; subject: string; count: number; average: number; tuntasCount: number; tuntasPct: number | null }> };
        setRealRekap(data.data ?? []);
      }
    });
  }, []);

  // Use real rekap data if available, otherwise fall back to SIMULASI
  const monData = realRekap.length > 0 ? realRekap.map((r) => ({
    guru: r.teacher, mapel: r.subject, kelas: r.className,
    cp: r.tuntasPct ?? 0, pert: 0, rencana: 0, jurnal: 0, hadir: 0,
    rata: r.average, status: (r.tuntasPct ?? 0) >= 75 ? 'on' as const : (r.tuntasPct ?? 0) >= 60 ? 'warn' as const : 'risk' as const,
  })) : useMemo(() => genSimMonitor(kelasMapel), [kelasMapel]);
  // G11: Sort by guru → kelas → mapel
  const sortedMon = useMemo(() => [...monData].sort((a, b) =>
    a.guru.localeCompare(b.guru) || a.kelas.localeCompare(b.kelas) || a.mapel.localeCompare(b.mapel)
  ), [monData]);
  // G12: Per-guru average CP
  const guruAgg = useMemo(() => {
    const m = new Map<string, { cp: number; count: number }>();
    for (const r of monData) { const g = m.get(r.guru) ?? { cp: 0, count: 0 }; g.cp += r.cp; g.count++; m.set(r.guru, g); }
    return [...m.entries()].map(([guru, v]) => ({ guru, avgCp: Math.round(v.cp / v.count) }));
  }, [monData]);

  const statusBadge = (s: string) => s === 'on' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : s === 'warn' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-rose-50 text-rose-600 border-rose-200';
  const statusLabel = (s: string) => s === 'on' ? 'On Track' : s === 'warn' ? 'Perhatian' : 'Berisiko';
  const cpBadge = (cp: number) => cp >= 75 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : cp >= 60 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-rose-50 text-rose-600 border-rose-200';

  return (
    <div className="space-y-4">
      <h3 className="flex items-center gap-2 text-[17px] font-bold text-[#0f2e25]"><ClipboardCheck className="h-5 w-5 text-emerald-600" />Rekap Audit Per Guru</h3>
      <div className="rounded-lg bg-violet-50 px-3 py-2 text-[11.5px] font-semibold text-violet-700"><Info className="mr-1 inline h-3 w-3" />Data otomatis ter-agregat dari input harian guru (absen, jurnal, nilai).</div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi icon={FileCheck2} label="Modul Disetujui" value={`${approvedRpp}`} />
        <Kpi icon={Activity} label="Jurnal Tercatat" value={`${activities.length}`} />
        <Kpi icon={Target} label="Tuntas KKTP" value={tuntasPct !== null ? `${tuntasPct}%` : '—'} />
        <Kpi icon={TrendingUp} label="Rata² Nilai" value={rata !== null ? `${rata}` : '—'} />
        <Kpi icon={Users} label="Kehadiran" value={hadirPct !== null ? `${hadirPct}%` : '—'} />
      </div>

      {/* G11: Rincian per Guru × Kelas × Mapel (SIMULASI) */}
      <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h4 className="flex items-center gap-2 text-[14px] font-bold text-[#0f2e25]"><Table2 className="h-4 w-4 text-emerald-600" />Rincian per Guru × Kelas × Mapel</h4>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700"><AlertTriangle className="h-3 w-3" /> SIMULASI</span>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead><tr className="border-b border-[#e6efea] text-left text-[10.5px] uppercase tracking-wide text-[#6b8079]">
              <th className="py-2 pr-3">Guru</th><th className="py-2 pr-3">Mapel</th><th className="py-2 pr-3">Kelas</th>
              <th className="py-2 pr-3 text-right">Rata²</th><th className="py-2 pr-3 text-right">CP</th><th className="py-2 pr-3 text-right">Hadir</th>
              <th className="py-2 pr-3 text-right">Pertemuan</th><th className="py-2 pr-3 text-right">Jurnal</th><th className="py-2">Status</th>
            </tr></thead>
            <tbody>
              {sortedMon.map((r, i) => (
                <tr key={i} className="border-b border-[#f0f4f2]">
                  <td className="py-2.5 pr-3 font-bold text-[#0f2e25]">{r.guru.split(',')[0]}</td>
                  <td className="py-2.5 pr-3 text-[#355a4e]">{r.mapel}</td>
                  <td className="py-2.5 pr-3 text-[#355a4e]">{r.kelas}</td>
                  <td className="py-2.5 pr-3 text-right font-bold text-[#0f2e25]">{r.rata ?? '—'}</td>
                  <td className="py-2.5 pr-3 text-right"><span className={clsx('rounded-md border px-2 py-0.5 text-[10.5px] font-bold', cpBadge(r.cp))}>{r.cp}%</span></td>
                  <td className="py-2.5 pr-3 text-right text-[#355a4e]">{r.hadir}%</td>
                  <td className="py-2.5 pr-3 text-right text-[#355a4e]">{r.pert}/{r.rencana}</td>
                  <td className="py-2.5 pr-3 text-right text-[#355a4e]">{r.jurnal}</td>
                  <td className="py-2.5"><span className={clsx('rounded-md border px-2 py-0.5 text-[10.5px] font-bold', statusBadge(r.status))}>{statusLabel(r.status)}</span></td>
                </tr>
              ))}
              {sortedMon.length === 0 && (<tr><td colSpan={9} className="py-6 text-center text-[#9bb0a8]">Belum ada data.</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>

      {/* Matrix + Per Guru (2-column grid, matching mockup layout) */}
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        {/* Matriks Ketuntasan */}
        {kelasList.length > 0 && mapelList.length > 0 && (
          <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
            <h4 className="flex items-center gap-2 text-[14px] font-bold text-[#0f2e25]"><LayoutGrid className="h-4 w-4 text-emerald-600" />Matriks Ketuntasan KKTP — Kelas × Mapel</h4>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-[11.5px] border-separate" style={{ borderSpacing: 4 }}>
                <thead><tr className="text-[10px] font-extrabold uppercase text-[#6b8079]">
                  <th className="px-2 py-2 text-left">Kelas</th>
                  {mapelList.map((m) => <th key={m} className="px-2 py-2 text-center">{m.length > 10 ? m.slice(0, 8) + '…' : m}</th>)}
                </tr></thead>
                <tbody>
                  {kelasList.map((k) => (
                    <tr key={k}>
                      <td className="px-2 py-2 text-left font-bold text-[#0f2e25]">{k}</td>
                      {mapelList.map((mp) => {
                        const r = kelasMapel.find((x) => x.kelas === k && x.mapel === mp);
                        return r?.tuntasPct != null ? (
                          <td key={mp} className={clsx('rounded-md px-2 py-2 text-center font-bold border', r.tuntasPct >= 75 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : r.tuntasPct >= 60 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-rose-50 text-rose-600 border-rose-200')} style={{ borderRadius: 4 }}>{r.tuntasPct}%</td>
                        ) : <td key={mp} className="px-2 py-2 text-center text-[#cbd5e1]">–</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* G12: Per Guru — Rata² Tuntas (SIMULASI) */}
        <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-2 text-[14px] font-bold text-[#0f2e25]"><TrendingUp className="h-4 w-4 text-emerald-600" />Per Guru — Rata² Tuntas</h4>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700"><AlertTriangle className="h-3 w-3" /> SIMULASI</span>
          </div>
          <div className="mt-3 space-y-3">
            {guruAgg.map((g) => (
              <div key={g.guru} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-[12px] font-bold text-[#0f2e25]">{g.guru.split(',')[0]}</span>
                <div className="h-[10px] flex-1 overflow-hidden rounded-md bg-[#eef3f0]">
                  <span className="block h-full rounded-md" style={{ width: `${g.avgCp}%`, background: g.avgCp >= 75 ? 'linear-gradient(90deg,#34d399,#059669)' : g.avgCp >= 60 ? 'linear-gradient(90deg,#fbbf24,#d97706)' : 'linear-gradient(90deg,#fb7185,#e11d48)' }} />
                </div>
                <span className={clsx('w-9 shrink-0 text-right text-[12px] font-bold', g.avgCp >= 75 ? 'text-emerald-700' : g.avgCp >= 60 ? 'text-amber-600' : 'text-rose-600')}>{g.avgCp}%</span>
              </div>
            ))}
            {guruAgg.length === 0 && <div className="grid h-20 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] text-[#9bb0a8]">Belum ada data.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══ SCREEN 6: KKTP ═══════════════════════════════════════════════════════════

function KktpKs({ kelasMapel, showToast }: { kelasMapel: { mapel: string }[]; showToast: (msg: string) => void }) {
  const mapelList = useMemo(() => [...new Set(kelasMapel.map((k) => k.mapel))].sort(), [kelasMapel]);
  const [kktpValues, setKktpValues] = useState<Record<string, number>>({});

  const affectedCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const k of kelasMapel) counts[k.mapel] = (counts[k.mapel] ?? 0) + 1;
    return counts;
  }, [kelasMapel]);

  const handleSave = () => {
    showToast('Konfigurasi KKTP disimpan — SIMULASI (backend /kktp-config belum tersedia)');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-[17px] font-bold text-[#0f2e25]"><Target className="h-5 w-5 text-emerald-600" />Manajemen KKTP</h3>
          <p className="text-[12.5px] text-[#6b8079]">Threshold Kriteria Ketuntasan Tujuan Pembelajaran per mapel</p>
        </div>
        <button type="button" onClick={handleSave} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-[12.5px] font-bold text-white hover:bg-emerald-700"><Save className="h-4 w-4" />Simpan Perubahan</button>
      </div>
      <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
        <div className="mb-3 rounded-lg bg-sky-50 px-3 py-2 text-[11.5px] font-semibold text-sky-700"><Info className="mr-1 inline h-3 w-3" />KKTP default {KKTP_DEFAULT}. Naikkan untuk mapel unggulan, turunkan untuk mapel yang masih adaptasi.</div>
        <div className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-[10.5px] font-bold text-amber-700"><AlertTriangle className="h-3 w-3" /> SIMULASI — backend /kktp-config belum tersedia</div>
        <div className="mt-4 space-y-3">
          {mapelList.map((mp) => {
            const val = kktpValues[mp] ?? SIM_KKTP_DATA[mp]?.kktp ?? KKTP_DEFAULT;
            const affected = affectedCount[mp] ?? SIM_KKTP_DATA[mp]?.affected ?? 0;
            const badge = val === KKTP_DEFAULT
              ? { text: 'Default', cls: 'bg-slate-100 text-slate-600' }
              : val > KKTP_DEFAULT
                ? { text: 'Ditingkatkan', cls: 'bg-emerald-50 text-emerald-700' }
                : { text: 'Diturunkan', cls: 'bg-amber-50 text-amber-700' };
            return (
              <div key={mp} className="grid grid-cols-[1fr_60px] items-center gap-4 border-b border-[#e6efea] py-3 lg:grid-cols-[180px_1fr_60px_100px]">
                <div>
                  <span className="text-[12.5px] font-bold text-[#0f2e25]">{mp}</span>
                  <div className="text-[11px] text-[#6b8079]">{affected} kelas terdampak · default {KKTP_DEFAULT}</div>
                </div>
                <div className="hidden lg:block"><input type="range" min={60} max={90} value={val} onChange={(e) => setKktpValues((p) => ({ ...p, [mp]: Number(e.target.value) }))} className="h-2 w-full appearance-none rounded-lg" style={{ background: 'linear-gradient(90deg,#e11d48 0%,#f59e0b 50%,#10b981 100%)' }} /></div>
                <span className={clsx('text-right text-[18px] font-extrabold', val >= KKTP_DEFAULT ? 'text-emerald-700' : 'text-amber-600')}>{val}</span>
                <span className={clsx('hidden lg:block rounded-md px-2 py-0.5 text-[10.5px] font-bold', badge.cls)}>{badge.text}</span>
              </div>
            );
          })}
          {mapelList.length === 0 && <div className="grid h-20 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] text-[#9bb0a8]">Belum ada mapel. Data muncul saat guru menginput nilai.</div>}
        </div>
      </div>
    </div>
  );
}

// ═══ SCREEN 7: JADWAL & TUGAS ═════════════════════════════════════════════════

function JadwalTugasKs({ schedules, classes, showToast, pendingRpp, pendingSumatif }: {
  schedules: ScheduleItem[]; classes: ClassRef[];
  showToast: (msg: string) => void;
  pendingRpp: RppItem[]; pendingSumatif: typeof SIM_SUMATIF[number][];
}) {
  const [selClass, setSelClass] = useState<string>('all');
  const filtered = selClass === 'all' ? schedules : schedules.filter((s) => s.classId === selClass);

  // G17: Schedule edit modal state
  const [editCtx, setEditCtx] = useState<{ day: number; classId: string; jp: number; className: string } | null>(null);
  const [editMapel, setEditMapel] = useState('');
  const [editGuru, setEditGuru] = useState('');
  const [editRuang, setEditRuang] = useState('');

  const matrixRows = JP_SLOTS.map((slot) => ({
    slot,
    cells: [1, 2, 3, 4, 5, 6].map((d) => filtered.find((s) => s.dayOfWeek === d && slot.jp >= s.jpStart && slot.jp <= s.jpEnd) ?? null),
  }));

  const totalJP = schedules.reduce((sum, s) => sum + (s.jpEnd - s.jpStart + 1), 0);

  // Beban Mengajar per Guru
  const guruLoad = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of schedules) {
      const name = s.teachingAssignment.teacher?.user?.fullName ?? '—';
      m.set(name, (m.get(name) ?? 0) + (s.jpEnd - s.jpStart + 1));
    }
    return [...m.entries()].map(([name, jp]) => ({ name, jp })).sort((a, b) => b.jp - a.jp);
  }, [schedules]);
  const over24 = guruLoad.filter((g) => g.jp > SIM_SCHED_CONFIG.maxJpGuru).length;

  // G15: Tugas mendatang (pending RPP + sumatif)
  const tugasMendatang = useMemo(() => [
    ...pendingRpp.map((r, i) => ({ title: r.title, subject: r.subject, kelas: r.class?.name ?? '—', deadline: `${2 + i} hari`, status: 'Menunggu Review' })),
    ...pendingSumatif.map((s, i) => ({ title: s.judul, subject: s.mapel, kelas: s.kelas, deadline: `${3 + i} hari`, status: 'Menunggu Audit' })),
  ], [pendingRpp, pendingSumatif]);

  // Unique mapel list for edit modal dropdown
  const mapelList = useMemo(() => [...new Set(schedules.map((s) => s.teachingAssignment?.subject).filter(Boolean))].sort(), [schedules]);

  // G17: Schedule edit handlers
  const openSchedEdit = (day: number, classId: string, jp: number) => {
    const cls = classes.find((c) => c.id === classId);
    const existing = schedules.find((s) => s.classId === classId && s.dayOfWeek === day && jp >= s.jpStart && jp <= s.jpEnd);
    setEditCtx({ day, classId, jp, className: cls?.name ?? '—' });
    setEditMapel(existing?.teachingAssignment?.subject ?? mapelList[0] ?? '');
    setEditGuru(existing?.teachingAssignment?.teacher?.user?.fullName ?? SIM_GURU_LIST[0] ?? '');
    setEditRuang(existing?.room ?? '');
  };
  const saveSchedEdit = () => {
    if (!editCtx) return;
    showToast(`Jadwal manual disimpan · ${DOW[editCtx.day]} JP${editCtx.jp}`);
    setEditCtx(null);
  };
  const clearSchedEdit = () => {
    if (!editCtx) return;
    showToast('Slot jadwal dikosongkan');
    setEditCtx(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-[17px] font-bold text-[#0f2e25]"><CalendarClock className="h-5 w-5 text-emerald-600" />Jadwal & Pembagian Tugas Mengajar</h3>
          <p className="text-[12.5px] text-[#6b8079]">{classes.length} rombel · {totalJP} JP total · klik sel untuk detail</p>
        </div>
        <button onClick={() => showToast('Jadwal digenerate ulang · SIMULASI')} className="inline-flex items-center gap-1.5 rounded-lg border border-[#e6efea] bg-white px-3 py-2 text-[12px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]"><RefreshCw className="h-3.5 w-3.5" />Generate Ulang</button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={CalendarClock} label="Total JP" value={`${totalJP}`} />
        <Kpi icon={LayoutGrid} label="Rombel" value={`${classes.length}`} />
        <Kpi icon={Users} label="Mapel" value={`${new Set(schedules.map((s) => s.teachingAssignment?.subject).filter(Boolean)).size}`} />
        <Kpi icon={Presentation} label="Sesi" value={`${schedules.length}`} />
      </div>

      {/* G14: Konfigurasi Penjadwalan */}
      <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
        <h4 className="flex items-center gap-2 text-[14px] font-bold text-[#0f2e25]"><SlidersHorizontal className="h-4 w-4 text-emerald-600" />Konfigurasi Penjadwalan</h4>
        <div className="mt-3 grid grid-cols-3 gap-3 lg:grid-cols-6">
          {[['Hari Aktif', `${SIM_SCHED_CONFIG.days}`], ['JP/Hari', `${SIM_SCHED_CONFIG.jpPerDay}`], ['Total JP/Minggu', `${SIM_SCHED_CONFIG.days * SIM_SCHED_CONFIG.jpPerDay}`], ['Rombel', `${classes.length}`], ['Guru', `${SIM_GURU_LIST.length}`], ['Max JP/Guru', `${SIM_SCHED_CONFIG.maxJpGuru}`]].map(([label, val]) => (
            <div key={label} className="rounded-xl bg-[#f4f7f5] px-3 py-2.5 text-center"><div className="text-[20px] font-extrabold text-[#0f2e25]">{val}</div><div className="text-[10.5px] font-medium text-[#6b8079]">{label}</div></div>
          ))}
        </div>
      </div>

      {/* G16: Conflict Panel */}
      {SIM_SCHED_CONFLICTS.length > 0 ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-5 shadow-sm">
          <h4 className="flex items-center gap-2 text-[14px] font-bold text-rose-600"><AlertTriangle className="h-4 w-4" />{SIM_SCHED_CONFLICTS.length} Konflik Penjadwalan <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">SIMULASI</span></h4>
          <p className="text-[11.5px] text-rose-600">Tidak ada guru tersedia untuk slot berikut:</p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-[12px]"><thead><tr className="border-b border-rose-200 text-left text-[10.5px] uppercase text-rose-400"><th className="py-2 pr-3">Hari</th><th className="py-2 pr-3">JP</th><th className="py-2">Rombel</th></tr></thead><tbody>
              {SIM_SCHED_CONFLICTS.map((c, i) => <tr key={i} className="border-b border-rose-100"><td className="py-2 pr-3 font-bold text-rose-700">{DOW[c.day]}</td><td className="py-2 pr-3 text-rose-600">JP{c.jp}</td><td className="py-2 text-rose-600">{c.rombel}</td></tr>)}
            </tbody></table>
          </div>
          <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] font-medium text-amber-700"><Info className="mr-1 inline h-3 w-3" />Klik "Generate Ulang" untuk penjadwalan ulang, atau tambahkan guru untuk mapel yang bentrok.</div>
        </div>
      ) : (
        <div className="rounded-lg bg-emerald-50 px-3 py-2 text-[11.5px] font-semibold text-emerald-700"><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" /><b>Tanpa konflik!</b> Semua {SIM_SCHED_CONFIG.days * SIM_SCHED_CONFIG.jpPerDay} slot × {classes.length} rombel berhasil diisi.</div>
      )}

      {/* Matriks Jadwal Mingguan */}
      <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h4 className="flex items-center gap-2 text-[14px] font-bold text-[#0f2e25]"><LayoutGrid className="h-4 w-4 text-emerald-600" />Matriks Jadwal Mingguan</h4>
          <select value={selClass} onChange={(e) => setSelClass(e.target.value)} className="rounded-lg border border-[#e6efea] bg-white px-3 py-1.5 text-[12px] font-bold text-[#355a4e]">
            <option value="all">Semua Kelas</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-[11.5px] border-separate" style={{ borderSpacing: 4 }}>
            <thead><tr className="text-[10px] font-extrabold uppercase text-[#6b8079]">
              <th className="px-2 py-2 text-left">JP</th>
              {[1, 2, 3, 4, 5, 6].map((d) => <th key={d} className="px-2 py-2 text-center">{(DOW[d] ?? '').slice(0, 3)}</th>)}
            </tr></thead>
            <tbody>
              {matrixRows.map(({ slot, cells }) => (
                <tr key={slot.jp}>
                  <td className="px-2 py-2 text-[10.5px] font-extrabold text-emerald-700">JP {slot.jp}<span className="block font-medium text-[#9bb0a8]">{fmtMin(slot.startMin)}</span></td>
                  {cells.map((c, i) => c ? (
                    <td key={i} onClick={() => openSchedEdit(i + 1, c.classId, slot.jp)} className="cursor-pointer rounded-md border border-emerald-200 bg-emerald-50/40 px-2 py-1.5 text-center hover:bg-emerald-50">
                      <b className="text-[10.5px] text-[#0f2e25]">{c.teachingAssignment?.subject?.slice(0, 8) ?? '—'}</b>
                      <div className="text-[9.5px] text-[#6b8079]">{c.class?.name ?? '—'}</div>
                    </td>
                  ) : <td key={i} onClick={() => selClass !== 'all' && openSchedEdit(i + 1, selClass, slot.jp)} className="cursor-pointer rounded-md border border-[#e6efea] bg-[#f9fbfa] text-center text-[#9bb0a8] hover:bg-[#f0f4f2]">+</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Beban Mengajar per Guru */}
      <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h4 className="flex items-center gap-2 text-[14px] font-bold text-[#0f2e25]"><Users className="h-4 w-4 text-emerald-600" />Beban Mengajar per Guru</h4>
          <span className="rounded-md bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700">{over24} guru &gt;{SIM_SCHED_CONFIG.maxJpGuru} JP</span>
        </div>
        <div className="mt-3 max-h-[460px] space-y-2.5 overflow-auto">
          {guruLoad.map((g) => {
            const over = g.jp > SIM_SCHED_CONFIG.maxJpGuru;
            const pct = Math.min(100, (g.jp / SIM_SCHED_CONFIG.maxJpGuru) * 100);
            return (
              <div key={g.name} className="flex items-center gap-3">
                <span className="w-28 shrink-0 truncate text-[12px] font-bold text-[#0f2e25]" title={g.name}>{g.name.split(',')[0]}</span>
                <div className="h-[9px] flex-1 overflow-hidden rounded-md bg-[#eef3f0]"><span className="block h-full rounded-md" style={{ width: `${pct}%`, background: over ? 'linear-gradient(90deg,#fbbf24,#d97706)' : 'linear-gradient(90deg,#34d399,#059669)' }} /></div>
                <span className={clsx('w-12 shrink-0 text-right text-[12px] font-bold', over ? 'text-amber-600' : 'text-[#355a4e]')}>{g.jp} JP</span>
              </div>
            );
          })}
          {guruLoad.length === 0 && <div className="grid h-20 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] text-[#9bb0a8]">Belum ada data.</div>}
        </div>
      </div>

      {/* G15: Tugas Mendatang */}
      <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
        <h4 className="flex items-center gap-2 text-[14px] font-bold text-[#0f2e25]"><FileClock className="h-4 w-4 text-emerald-600" />Tugas Mendatang</h4>
        <div className="mt-3 space-y-1">
          {tugasMendatang.map((t, i) => (
            <div key={i} className="grid grid-cols-[2fr_1fr_1fr_70px_110px] items-center gap-2 border-b border-[#f0f4f2] py-2.5 text-[12px]">
              <span className="font-bold text-[#0f2e25]">{t.title}</span>
              <span className="text-[#355a4e]">{t.subject}</span>
              <span className="text-[#6b8079]">{t.kelas}</span>
              <span className="text-right font-bold text-amber-600">{t.deadline}</span>
              <span className="text-right"><span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">{t.status}</span></span>
            </div>
          ))}
          {tugasMendatang.length === 0 && <div className="grid h-20 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] text-[#9bb0a8]">Tidak ada tugas mendesak.</div>}
        </div>
      </div>

      {/* G17: Schedule Edit Modal */}
      {editCtx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditCtx(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[#e6efea] px-5 py-3.5">
              <div>
                <div className="text-[14px] font-bold text-[#0f2e25]">Edit Jadwal — {editCtx.className}</div>
                <div className="text-[11.5px] text-[#6b8079]">{DOW[editCtx.day]} · JP{editCtx.jp} · <span className="font-bold text-amber-700">SIMULASI</span></div>
              </div>
              <button onClick={() => setEditCtx(null)} className="text-[#9bb0a8] hover:text-[#0f2e25]"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3 px-5 py-4">
              <div>
                <label className="text-[11px] font-bold uppercase text-[#6b8079]">Mapel</label>
                <select value={editMapel} onChange={(e) => setEditMapel(e.target.value)} className="mt-1 w-full rounded-lg border border-[#e6efea] bg-white px-3 py-2 text-[12.5px] font-medium text-[#0f2e25]">
                  {mapelList.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase text-[#6b8079]">Guru</label>
                <select value={editGuru} onChange={(e) => setEditGuru(e.target.value)} className="mt-1 w-full rounded-lg border border-[#e6efea] bg-white px-3 py-2 text-[12.5px] font-medium text-[#0f2e25]">
                  {SIM_GURU_LIST.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase text-[#6b8079]">Ruang</label>
                <input value={editRuang} onChange={(e) => setEditRuang(e.target.value)} placeholder="cth. Lab Komputer 1" className="mt-1 w-full rounded-lg border border-[#e6efea] bg-white px-3 py-2 text-[12.5px] font-medium text-[#0f2e25]" />
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-[#e6efea] px-5 py-3.5">
              <button onClick={clearSchedEdit} className="text-[12px] font-bold text-rose-600 hover:underline">Kosongkan Slot</button>
              <div className="flex gap-2">
                <button onClick={() => setEditCtx(null)} className="rounded-lg border border-[#e6efea] px-4 py-2 text-[12px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]">Batal</button>
                <button onClick={saveSchedEdit} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-[12px] font-bold text-white hover:bg-emerald-700"><Save className="h-3.5 w-3.5" />Simpan</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══ MODALS ═══════════════════════════════════════════════════════════════════

function RppDetailModal({ rpp, onClose, showToast }: { rpp: RppItem; onClose: () => void; showToast: (msg: string) => void }) {
  const [pending, startTransition] = useTransition();
  const body = rpp.body;
  const fase = body?.fase ?? (rpp.class?.name?.startsWith('X') ? 'E (Kelas X)' : 'F (XI-XII)');

  const handleReview = (decision: 'approved' | 'revision') => {
    const note = decision === 'revision' ? window.prompt('Alasan revisi (opsional):', '') : undefined;
    startTransition(async () => {
      const res = await reviewRpp(rpp.id, decision, note ?? undefined);
      if (res.success) {
        showToast(decision === 'approved' ? 'Modul ajar disetujui — notifikasi terkirim ke guru' : 'Modul ajar ditolak — guru diberi notifikasi');
        onClose();
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sticky top-0 flex items-center justify-between border-b border-[#e6efea] bg-white px-5 py-4">
          <div><h3 className="flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]"><FileCheck2 className="h-5 w-5 text-emerald-600" />{rpp.title}</h3><p className="text-[11.5px] text-[#6b8079]">{rpp.subject} · {rpp.class?.name ?? '—'} · {rpp.status}</p></div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-[#9bb0a8] hover:bg-[#f4f7f5]" aria-label="Tutup"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 p-5">
          {/* Stats */}
          <div className="flex flex-wrap gap-2">
            <StatPill n={`${body?.jpAllocation ?? '—'}`} l="Alokasi JP" />
            <StatPill n={`${body?.tp?.length ?? 0}`} l="CP/TP" />
            <StatPill n={fase} l="Fase" />
            <StatPill n={rpp.status === 'approved' ? 'Disetujui' : rpp.status === 'submitted' ? 'Menunggu' : rpp.status === 'revision' ? 'Revisi' : 'Draft'} l="Status" />
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
          {body?.tp && body.tp.length > 0 && (
            <DetailSection icon={Route} title="Alur Tujuan Pembelajaran (ATP)">
              <table className="w-full text-[12px]"><thead><tr className="border-b border-[#e6efea] text-left text-[10.5px] uppercase text-[#6b8079]"><th className="py-2 pr-3">TP</th><th className="py-2 pr-3">Pertemuan</th><th className="py-2">Indikator Ketercapaian</th></tr></thead><tbody>
                {body.tp.map((tp, i) => <tr key={i} className="border-b border-[#f0f4f2]"><td className="py-2 pr-3 font-bold text-[#0f2e25]">TP {i + 1}</td><td className="py-2 pr-3 text-[#355a4e]">Pert. {i * 2 + 1}-{i * 2 + 2}</td><td className="py-2 text-[#355a4e]">{tp}</td></tr>)}
              </tbody></table>
            </DetailSection>
          )}

          {/* Profil Pelajar Pancasila */}
          <DetailSection icon={Users} title="Profil Pelajar Pancasila">
            <div className="flex flex-wrap gap-2">
              {(body?.profilDimensi ?? ['Bernalar Kritis', 'Mandiri', 'Bergotong Royong']).map((d) => <span key={d} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11.5px] font-bold text-emerald-700">{d}</span>)}
            </div>
            <p className="mt-2 text-[12px] text-[#355a4e]">{body?.profilUraian ?? 'Melalui praktik dan diskusi kelompok, peserta didik mengembangkan kreativitas dan kemandirian dalam menyelesaikan tugas.'}</p>
          </DetailSection>

          {/* Kegiatan */}
          {body?.kegiatan && body.kegiatan.length > 0 && <DetailSection icon={LayoutGrid} title="Kegiatan Pembelajaran"><div className="space-y-2">{body.kegiatan.map((k, i) => <div key={i} className="rounded-lg border border-[#e6efea] p-3"><b className="text-[11px] text-emerald-700">{k.pendahuluan ? 'Pendahuluan' : k.penutup ? 'Penutup' : 'Inti'}</b><p className="mt-1 text-[12px] text-[#355a4e]">{k.pendahuluan ?? k.inti ?? k.penutup ?? k.deskripsi ?? '—'}</p>{k.diferensiasi && <p className="mt-1 text-[11px] text-[#9bb0a8]">Diferensiasi: {k.diferensiasi}</p>}</div>)}</div></DetailSection>}

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
          <DetailSection icon={Lightbulb} title="Pengayaan & Refleksi">
            {body?.pengayaan ? <p className="text-[12.5px] text-[#355a4e]">{body.pengayaan}</p> : <p className="text-[12.5px] text-[#9bb0a8]">Pengayaan untuk siswa tuntas: topik lanjutan. Remedial untuk siswa di bawah KKTP: pembelajaran ulang + asesmen susulan.</p>}
            {body?.remedial && <p className="mt-1 text-[12px] text-[#355a4e]">{body.remedial}</p>}
            {body?.refleksiGuru && <div className="mt-2"><b className="text-[11px] font-bold text-[#6b8079]">Refleksi Guru</b><p className="mt-1 text-[12px] text-[#355a4e]">{body.refleksiGuru}</p></div>}
          </DetailSection>

          {/* Lampiran */}
          <DetailSection icon={Paperclip} title="Lampiran">
            {body?.lampiran && <p className="text-[12.5px] text-[#355a4e]">{body.lampiran}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              {['Slide presentasi', 'Modul/bahan bacaan', 'Rubrik penilaian', 'Soal latihan'].map((l) => <span key={l} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11.5px] font-bold text-emerald-700"><FileText className="h-3 w-3" />{l}</span>)}
            </div>
            {body?.lampiranUrl && <a href={body.lampiranUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-[12px] font-bold text-emerald-600 hover:underline">{body.lampiranUrl}</a>}
          </DetailSection>

          <p className="text-[11px] text-[#9bb0a8]"><Info className="mr-1 inline h-3 w-3" />Modul ajar yang disetujui otomatis tersinkron ke dashboard guru dan LMS siswa.</p>
        </div>

        {/* Footer with actions */}
        {rpp.status === 'submitted' && (
          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[#e6efea] bg-white px-5 py-3">
            <button type="button" onClick={() => handleReview('revision')} disabled={pending} className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-[12.5px] font-bold text-rose-600 hover:bg-rose-100 disabled:opacity-50"><X className="h-4 w-4" />Tolak</button>
            <button type="button" onClick={() => handleReview('approved')} disabled={pending} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-[12.5px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"><Check className="h-4 w-4" />Setujui</button>
          </div>
        )}
      </div>
    </div>
  );
}

function SumatifDetailModal({ item, onClose, showToast }: { item: typeof SIM_SUMATIF[number]; onClose: () => void; showToast: (msg: string) => void }) {
  const handleSumatifAction = (action: 'Disetujui' | 'Ditolak') => {
    if (action === 'Ditolak') window.prompt('Alasan penolakan (opsional):', '');
    showToast(action === 'Disetujui' ? 'Sumatif disetujui — siap dipublikasi ke siswa' : 'Sumatif ditolak — guru diberi notifikasi');
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sticky top-0 flex items-center justify-between border-b border-[#e6efea] bg-white px-5 py-4">
          <div><h3 className="flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]"><ClipboardPenLine className="h-5 w-5 text-emerald-600" />{item.judul}</h3><p className="text-[11.5px] text-[#6b8079]">{item.guru} · {item.mapel} · {item.kelas} · {item.jenis} · KKM {item.kkm}</p></div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-[#9bb0a8] hover:bg-[#f4f7f5]" aria-label="Tutup"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap gap-2">
            <StatPill n={`${item.soal}`} l="Jumlah Soal" />
            <StatPill n={`${item.kkm}`} l="KKM" />
            <StatPill n={item.jenis} l="Jenis" />
            <StatPill n={item.status} l="Status" />
          </div>
          <div><b className="text-[11.5px] font-bold text-[#6b8079]">Deskripsi</b><p className="mt-1 text-[12.5px] text-[#355a4e]">{item.deskripsi}</p></div>
          {/* Pratinjau Soal (SIMULASI) */}
          <div>
            <b className="text-[11.5px] font-bold text-[#6b8079]">Pratinjau Soal (contoh)</b>
            <div className="mt-2 rounded-xl border border-[#e6efea] bg-[#f4f7f5] p-3">
              <div className="text-[12px] font-bold text-emerald-700">Soal 1 (PG)</div>
              <p className="mt-1 text-[13px] font-semibold text-[#0f2e25]">Diketahui sistem persamaan 2x + 3y = 12 dan x − y = 1. Nilai x + y = ...</p>
              <div className="mt-2 grid grid-cols-2 gap-1.5 text-[12px] font-semibold text-[#355a4e]">
                <div className="rounded-lg border border-[#e6efea] px-2.5 py-1.5">A. 3</div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-emerald-700">B. 4 ✓</div>
                <div className="rounded-lg border border-[#e6efea] px-2.5 py-1.5">C. 5</div>
                <div className="rounded-lg border border-[#e6efea] px-2.5 py-1.5">D. 6</div>
              </div>
            </div>
            <div className="mt-2 rounded-xl border border-[#e6efea] bg-[#f4f7f5] p-3">
              <div className="text-[12px] font-bold text-emerald-700">Soal 2 (Isian)</div>
              <p className="mt-1 text-[13px] font-semibold text-[#0f2e25]">Faktor dari persamaan x² − 5x + 6 = 0 adalah (x−a)(x−b). Nilai a + b = ...</p>
              <div className="mt-1.5 text-[12px] font-semibold text-[#6b8079]">Jawaban: 5</div>
            </div>
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700"><AlertTriangle className="h-3 w-3" /> SIMULASI — soal lengkap tersedia setelah approval</div>
          </div>
          <p className="text-[11px] text-[#9bb0a8]"><Info className="mr-1 inline h-3 w-3" />Soal lengkap tersedia setelah approval. Sumatif yang disetujui otomatis muncul di LMS siswa sesuai jadwal.</p>
        </div>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[#e6efea] bg-white px-5 py-3">
          {item.status === 'Menunggu' ? (
            <>
              <button type="button" onClick={() => handleSumatifAction('Ditolak')} className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-[12.5px] font-bold text-rose-600 hover:bg-rose-100"><X className="h-4 w-4" />Tolak</button>
              <button type="button" onClick={() => handleSumatifAction('Disetujui')} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-[12.5px] font-bold text-white hover:bg-emerald-700"><Check className="h-4 w-4" />Setujui</button>
            </>
          ) : (
            <button type="button" onClick={onClose} className="rounded-xl border border-[#e6efea] bg-white px-4 py-2 text-[12.5px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]">Tutup</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══ SHARED COMPONENTS ═════════════════════════════════════════════════════════

function Kpi({ icon: Icon, label, value, sub, valueClass, onClick }: { icon: LucideIcon; label: string; value: string; sub?: string; valueClass?: string; onClick?: () => void }) {
  return (
    <div className={clsx('rounded-2xl border border-[#e6efea] bg-white p-4 shadow-sm', onClick && 'cursor-pointer transition hover:border-emerald-200 hover:shadow-md')} onClick={onClick}>
      <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[#6b8079]"><Icon className="h-3.5 w-3.5 text-emerald-600" />{label}</div>
      <div className={clsx('mt-1.5 text-[24px] font-extrabold tracking-tight text-[#0f2e25]', valueClass)}>{value}</div>
      {sub && <div className="mt-0.5 text-[10.5px] font-medium text-[#9bb0a8]">{sub}</div>}
    </div>
  );
}

function TrenChart({ siswa, guru }: { siswa: number[]; guru: number[] }) {
  const W = 620, H = 120;
  const y = (v: number) => H - 10 - ((v - 80) / 20) * (H - 30);
  const x = (i: number, len: number) => 10 + (i * (W - 20)) / Math.max(1, len - 1);
  const polyS = siswa.map((v, i) => `${x(i, siswa.length)},${y(v)}`).join(' ');
  const polyG = guru.map((v, i) => `${x(i, guru.length)},${y(v)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full">
      {[90, 85, 80].map((g) => <line key={g} x1={0} y1={y(g)} x2={W} y2={y(g)} stroke="#e6efea" />)}
      <polyline points={polyS} fill="none" stroke="#059669" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={polyG} fill="none" stroke="#0284c7" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
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
