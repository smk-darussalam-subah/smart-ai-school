'use client';

// =============================================================================
// KsWorkspace — Dashboard KS / Waka Kurikulum (F4 — mockup adoption).
// 7 screens: Beranda · Modul Ajar (RPP approval) · Audit Sumatif ·
// Monitoring KBM · Rekap Audit · KKTP · Jadwal & Tugas.
// Desktop-first. Real data where APIs exist; SIMULASI bertanda for the rest.
// Mockup ref: .tasks/akademik-mockup/akademik-ks.html (1,305 lines)
// =============================================================================

import { useMemo, useState, useTransition } from 'react';
import {
  LayoutDashboard, FileCheck2, ClipboardPenLine, Monitor, ClipboardCheck,
  Target, CalendarClock, Users, BadgeCheck, Presentation, FileClock,
  AlertTriangle, Activity, TrendingUp, ListChecks, ChevronRight, X,
  Check, CheckCircle2, XCircle, Info, Save, Table2, LayoutGrid,
  type LucideIcon,
} from 'lucide-react';
import clsx from 'clsx';
import type { GradeItem, AttendanceItem } from '@/lib/api';
import type { ScheduleItem, ActivityItem, RppItem, ClassRef, LmsModuleItem } from './guru-types';
import { KKTP_DEFAULT } from '@/lib/academic';
import { JP_SLOTS, fmtMin, scheduleDayOfWeek, wibTodayISO, wibDateLabel } from '@/lib/bell-times';
import { reviewRpp } from '../actions';

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

// SIMULASI: Sumatif audit queue — backend /assessments/audit belum tersedia
const SIM_SUMATIF = [
  { id: 's1', guru: 'Siti Aminah', mapel: 'Matematika', kelas: 'X TKRO 1', jenis: 'UH', judul: 'UH 3 — Sistem Persamaan Linear', soal: 10, status: 'Menunggu', tanggal: '15 Jun', kkm: 75, deskripsi: '10 soal: 5 PG, 3 isian, 2 uraian. Durasi 45 menit.' },
  { id: 's2', guru: 'Budi Hartono', mapel: 'Pemrograman Web', kelas: 'XI TJKT 1', jenis: 'UTS', judul: 'UTS Ganjil — HTML, CSS & Layout', soal: 15, status: 'Menunggu', tanggal: '13 Jun', kkm: 75, deskripsi: '15 soal: 8 PG, 4 isian, 3 praktik. Durasi 90 menit.' },
  { id: 's3', guru: 'Dewi Lestari', mapel: 'B. Indonesia', kelas: 'XI TJKT 1', jenis: 'UH', judul: 'UH 2 — Teks Eksposisi', soal: 8, status: 'Disetujui', tanggal: '8 Jun', kkm: 75, deskripsi: '8 soal: 4 PG, 2 isian, 2 uraian. Durasi 40 menit.' },
];

// SIMULASI: Health score pillars — backend aggregation belum ada
const SIM_HEALTH = { score: 82, delta: 3, pilars: [
  { label: 'Akademik', pct: 80 }, { label: 'Kehadiran', pct: 94 },
  { label: 'Keuangan', pct: 88 }, { label: 'SDM/Guru', pct: 68 },
] };

// SIMULASI: Tren kehadiran 10 hari — backend aggregation belum ada
const SIM_TREN_SISWA = [88, 90, 86, 92, 89, 93, 91, 94, 92, 93];
const SIM_TREN_GURU = [90, 92, 88, 93, 91, 94, 92, 95, 93, 94];

// ── Component ────────────────────────────────────────────────────────────────

export default function KsWorkspace({
  grades, attendances, classes, assignments, rpp, schedules, activities, lmsModules: _lmsModules, academicYear, semester, dataWarning,
}: Props) {
  const [screen, setScreen] = useState<Screen>('beranda');
  const [selRpp, setSelRpp] = useState<RppItem | null>(null);
  const [selSumatif, setSelSumatif] = useState<typeof SIM_SUMATIF[number] | null>(null);

  // Derived data
  const pendingRpp = useMemo(() => rpp.filter((r) => r.status === 'submitted'), [rpp]);
  const pendingSumatif = SIM_SUMATIF.filter((s) => s.status === 'Menunggu');

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

  return (
    <div className="space-y-1">
      <h1 className="text-2xl font-bold tracking-tight text-[#0f2e25]">Dashboard KS / Waka Kurikulum</h1>
      <p className="text-sm text-[#6b8079]">Pengawasan akademik · approval modul ajar · audit sumatif · monitoring KBM</p>

      {dataWarning && (
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />Sebagian data gagal dimuat dari server. Muat ulang halaman jika berlanjut.
        </div>
      )}

      {/* Context bar */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-xl border border-[#e6efea] bg-white px-3 py-2 text-[12.5px] font-semibold text-[#355a4e] shadow-sm">
          <CalendarClock className="h-[15px] w-[15px] text-emerald-600" />TA {academicYear || '—'} · Semester {semester}
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11.5px] font-bold text-blue-700">
          <Users className="h-3.5 w-3.5" />{classes.length} rombel · {assignments.length} penugasan
        </span>
        <span className="ml-auto inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11.5px] font-bold text-emerald-700">
          <BadgeCheck className="h-3.5 w-3.5" />Kepala Sekolah
        </span>
      </div>

      {/* Sub-nav */}
      <nav className="mt-4 flex flex-wrap gap-2 border-b border-[#e6efea] pb-3">
        {navWithBadges.map((n) => {
          const Icon = n.icon;
          const on = screen === n.key;
          return (
            <button key={n.key} type="button" onClick={() => setScreen(n.key)}
              className={clsx('inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-[13px] font-bold',
                on ? 'border-emerald-600 bg-emerald-600 text-white shadow-[0_8px_18px_-8px_rgba(5,150,105,.5)]' : 'border-[#e6efea] bg-white text-[#355a4e] hover:border-emerald-200')}>
              <Icon className={clsx('h-4 w-4', on ? 'text-white' : 'text-[#6b8079]')} />{n.label}
              {n.badge ? <span className={clsx('rounded-full px-1.5 py-0.5 text-[9px] font-extrabold', on ? 'bg-white/25 text-white' : 'bg-rose-500 text-white')}>{n.badge}</span> : null}
            </button>
          );
        })}
      </nav>

      <div className="pt-4">
        {screen === 'beranda' && <BerandaKs hadirPct={hadirPct} todayAtt={todayAtt} pendingRpp={pendingRpp.length} pendingSumatif={pendingSumatif.length} belowKktp={belowKktp} schedules={schedules} onNavigate={setScreen} />}
        {screen === 'modul' && <ModulAjarKs rpp={rpp} onReview={setSelRpp} />}
        {screen === 'sumatif' && <AuditSumatifKs onOpenDetail={setSelSumatif} />}
        {screen === 'monitor' && <MonitoringKbmKs kelasMapel={kelasMapel} attendances={attendances} schedules={schedules} />}
        {screen === 'rekap' && <RekapAuditKs kelasMapel={kelasMapel} grades={grades} attendances={attendances} activities={activities} rpp={rpp} />}
        {screen === 'kktp' && <KktpKs kelasMapel={kelasMapel} />}
        {screen === 'jadwal' && <JadwalTugasKs schedules={schedules} classes={classes} />}
      </div>

      {/* Modul Ajar Detail Modal */}
      {selRpp && <RppDetailModal rpp={selRpp} onClose={() => setSelRpp(null)} />}

      {/* Sumatif Detail Modal */}
      {selSumatif && <SumatifDetailModal item={selSumatif} onClose={() => setSelSumatif(null)} />}
    </div>
  );
}

// ═══ SCREEN 1: BERANDA ════════════════════════════════════════════════════════

function BerandaKs({ hadirPct: _hadirPct, todayAtt, pendingRpp, pendingSumatif, belowKktp, schedules, onNavigate }: {
  hadirPct: number | null; todayAtt: AttendanceItem[]; pendingRpp: number; pendingSumatif: number;
  belowKktp: { kelas: string; mapel: string; tuntasPct: number | null }[];
  schedules: ScheduleItem[]; onNavigate: (s: Screen) => void;
}) {
  const dow = scheduleDayOfWeek();
  const todaySchedules = schedules.filter((s) => s.dayOfWeek === dow);
  const activeClasses = new Set(todaySchedules.map((s) => s.class?.name)).size;
  const todayHadirPct = todayAtt.length ? Math.round((todayAtt.filter((a) => a.status === 'hadir').length / todayAtt.length) * 100) : null;

  return (
    <div className="space-y-4">
      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi icon={Users} label="Kehadiran Siswa" value={todayHadirPct !== null ? `${todayHadirPct}%` : '—'} sub={todayAtt.length ? `${todayAtt.length} catatan hari ini` : undefined} />
        <Kpi icon={BadgeCheck} label="Guru Hadir" value="—" sub="SIMULASI" />
        <Kpi icon={Presentation} label="Kelas Berjalan" value={`${activeClasses}`} sub={`${todaySchedules.length} sesi hari ini`} />
        <Kpi icon={FileClock} label="Modul Pending" value={`${pendingRpp}`} valueClass="text-amber-600" onClick={() => onNavigate('modul')} />
        <Kpi icon={ClipboardPenLine} label="Sumatif Pending" value={`${pendingSumatif}`} valueClass="text-amber-600" onClick={() => onNavigate('sumatif')} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        {/* Papan Pembelajaran Hari Ini */}
        <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]"><Presentation className="h-[18px] w-[18px] text-emerald-600" />Papan Pembelajaran Hari Ini</h3>
            <span className="rounded-md bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700">{wibDateLabel()}</span>
          </div>
          {todaySchedules.length === 0 ? (
            <div className="mt-3 grid h-20 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] font-medium text-[#9bb0a8]">Tidak ada jadwal mengajar hari ini.</div>
          ) : (
            <div className="mt-3 space-y-2">
              {todaySchedules.sort((a, b) => a.jpStart - b.jpStart).map((s, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl border border-[#e6efea] bg-white p-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold">JP{s.jpStart}</div>
                  <div className="min-w-0 flex-1">
                    <b className="text-[12.5px] text-[#0f2e25]">{s.teachingAssignment?.subject ?? '—'} · {s.class?.name ?? '—'}</b>
                    <div className="text-[11px] text-[#6b8079]">{s.teachingAssignment?.teacher?.user?.fullName ?? '—'} · {s.room ?? 'Ruang —'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
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
            {pendingRpp === 0 && pendingSumatif === 0 && belowKktp.length === 0 && (
              <div className="grid h-20 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] font-medium text-[#9bb0a8]">Tidak ada tindakan tertunda.</div>
            )}
          </div>
        </div>

        {/* Tren Kehadiran */}
        <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
          <h3 className="flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]"><TrendingUp className="h-[18px] w-[18px] text-emerald-600" />Tren Kehadiran — 10 Hari</h3>
          <TrenChart siswa={SIM_TREN_SISWA} guru={SIM_TREN_GURU} />
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700"><AlertTriangle className="h-3 w-3" /> SIMULASI — agregasi backend menyusul</div>
        </div>
      </div>
    </div>
  );
}

// ═══ SCREEN 2: MODUL AJAR (RPP Approval) ═══════════════════════════════════════

function ModulAjarKs({ rpp, onReview }: { rpp: RppItem[]; onReview: (r: RppItem) => void }) {
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
      if (!res.success) setErr(res.error ?? 'Gagal mereview Modul Ajar.');
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

function AuditSumatifKs({ onOpenDetail }: { onOpenDetail: (s: typeof SIM_SUMATIF[number]) => void }) {
  const [filter, setFilter] = useState<'Semua' | 'Menunggu' | 'Disetujui' | 'Ditolak'>('Semua');
  const filtered = SIM_SUMATIF.filter((s) => filter === 'Semua' || s.status === filter);

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
      <div className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-[10.5px] font-bold text-amber-700"><AlertTriangle className="h-3 w-3" /> SIMULASI — backend /assessments/audit belum tersedia</div>
      <div className="space-y-2.5">
        {filtered.map((s) => {
          const stBadge = s.status === 'Menunggu' ? 'bg-amber-50 text-amber-700' : s.status === 'Disetujui' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600';
          return (
            <button key={s.id} type="button" onClick={() => onOpenDetail(s)} className="flex w-full items-center gap-3 rounded-xl border border-[#e6efea] bg-white p-3.5 text-left transition hover:border-emerald-200 hover:shadow-sm">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-100 text-[11px] font-bold text-emerald-700">{s.jenis}</div>
              <div className="min-w-0 flex-1"><b className="text-[13px] text-[#0f2e25]">{s.judul}</b><div className="text-[11px] text-[#6b8079]">{s.guru} · {s.mapel} · {s.kelas} · {s.soal} soal · {s.tanggal}</div></div>
              <span className={clsx('rounded-md px-2 py-0.5 text-[10.5px] font-bold', stBadge)}>{s.status}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ═══ SCREEN 4: MONITORING KBM ═════════════════════════════════════════════════

function MonitoringKbmKs({ kelasMapel, attendances: _attendances, schedules: _schedules }: {
  kelasMapel: { kelas: string; mapel: string; avg: number | null; tuntasPct: number | null; count: number }[];
  attendances: AttendanceItem[]; schedules: ScheduleItem[];
}) {
  const onTrack = kelasMapel.filter((k) => k.tuntasPct !== null && k.tuntasPct >= 75).length;
  const perhatian = kelasMapel.filter((k) => k.tuntasPct !== null && k.tuntasPct >= 60 && k.tuntasPct < 75).length;
  const berisiko = kelasMapel.filter((k) => k.tuntasPct !== null && k.tuntasPct < 60).length;

  const cellTone = (pct: number | null) => pct === null ? 'bg-[#f9fbfa] text-[#cbd5e1]' : pct >= 75 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : pct >= 60 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-rose-50 text-rose-600 border-rose-200';

  return (
    <div className="space-y-4">
      <h3 className="flex items-center gap-2 text-[17px] font-bold text-[#0f2e25]"><Monitor className="h-5 w-5 text-emerald-600" />Monitoring KBM</h3>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={LayoutGrid} label="Total Kelas×Mapel" value={`${kelasMapel.length}`} />
        <Kpi icon={CheckCircle2} label="On Track" value={`${onTrack}`} valueClass="text-emerald-700" />
        <Kpi icon={AlertTriangle} label="Perhatian" value={`${perhatian}`} valueClass="text-amber-600" />
        <Kpi icon={XCircle} label="Berisiko" value={`${berisiko}`} valueClass="text-rose-600" />
      </div>

      {/* Matriks Progres */}
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
    </div>
  );
}

// ═══ SCREEN 6: KKTP ═══════════════════════════════════════════════════════════

function KktpKs({ kelasMapel }: { kelasMapel: { mapel: string }[] }) {
  const mapelList = [...new Set(kelasMapel.map((k) => k.mapel))].sort();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-[17px] font-bold text-[#0f2e25]"><Target className="h-5 w-5 text-emerald-600" />Manajemen KKTP</h3>
          <p className="text-[12.5px] text-[#6b8079]">Threshold Kriteria Ketuntasan Tujuan Pembelajaran per mapel</p>
        </div>
        <button type="button" className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-[12.5px] font-bold text-white hover:bg-emerald-700"><Save className="h-4 w-4" />Simpan Perubahan</button>
      </div>
      <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
        <div className="mb-3 rounded-lg bg-sky-50 px-3 py-2 text-[11.5px] font-semibold text-sky-700"><Info className="mr-1 inline h-3 w-3" />KKTP default {KKTP_DEFAULT}. Naikkan untuk mapel unggulan, turunkan untuk mapel yang masih adaptasi.</div>
        <div className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-[10.5px] font-bold text-amber-700"><AlertTriangle className="h-3 w-3" /> SIMULASI — backend /kktp-config belum tersedia</div>
        <div className="mt-4 space-y-3">
          {mapelList.map((mp) => (
            <div key={mp} className="grid grid-cols-[1fr_60px] items-center gap-4 border-b border-[#e6efea] py-3 lg:grid-cols-[180px_1fr_60px_100px]">
              <span className="text-[12.5px] font-bold text-[#0f2e25]">{mp}</span>
              <div className="hidden lg:block"><input type="range" min={50} max={90} defaultValue={KKTP_DEFAULT} className="h-2 w-full appearance-none rounded-lg" style={{ background: 'linear-gradient(90deg,#e11d48 0%,#f59e0b 50%,#10b981 100%)' }} /></div>
              <span className="text-right text-[14px] font-extrabold text-[#0f2e25]">{KKTP_DEFAULT}</span>
              <span className="hidden lg:block text-right text-[11px] font-bold text-[#6b8079]">Default</span>
            </div>
          ))}
          {mapelList.length === 0 && <div className="grid h-20 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] text-[#9bb0a8]">Belum ada mapel. Data muncul saat guru menginput nilai.</div>}
        </div>
      </div>
    </div>
  );
}

// ═══ SCREEN 7: JADWAL & TUGAS ═════════════════════════════════════════════════

function JadwalTugasKs({ schedules, classes }: { schedules: ScheduleItem[]; classes: ClassRef[] }) {
  const [selClass, setSelClass] = useState<string>('all');
  const filtered = selClass === 'all' ? schedules : schedules.filter((s) => s.classId === selClass);

  const matrixRows = JP_SLOTS.map((slot) => ({
    slot,
    cells: [1, 2, 3, 4, 5, 6].map((d) => filtered.find((s) => s.dayOfWeek === d && slot.jp >= s.jpStart && slot.jp <= s.jpEnd) ?? null),
  }));

  const totalJP = schedules.reduce((sum, s) => sum + (s.jpEnd - s.jpStart + 1), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-[17px] font-bold text-[#0f2e25]"><CalendarClock className="h-5 w-5 text-emerald-600" />Jadwal & Pembagian Tugas Mengajar</h3>
          <p className="text-[12.5px] text-[#6b8079]">{classes.length} rombel · {totalJP} JP total · klik sel untuk detail</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={CalendarClock} label="Total JP" value={`${totalJP}`} />
        <Kpi icon={LayoutGrid} label="Rombel" value={`${classes.length}`} />
        <Kpi icon={Users} label="Mapel" value={`${new Set(schedules.map((s) => s.teachingAssignment?.subject).filter(Boolean)).size}`} />
        <Kpi icon={Presentation} label="Sesi" value={`${schedules.length}`} />
      </div>

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
                    <td key={i} className="rounded-md border border-emerald-200 bg-emerald-50/40 px-2 py-1.5 text-center">
                      <b className="text-[10.5px] text-[#0f2e25]">{c.teachingAssignment?.subject?.slice(0, 8) ?? '—'}</b>
                      <div className="text-[9.5px] text-[#6b8079]">{c.class?.name ?? '—'}</div>
                    </td>
                  ) : <td key={i} className="rounded-md border border-[#e6efea] bg-[#f9fbfa]" />)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ═══ MODALS ═══════════════════════════════════════════════════════════════════

function RppDetailModal({ rpp, onClose }: { rpp: RppItem; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const body = rpp.body;

  const handleReview = (decision: 'approved' | 'revision') => {
    const note = decision === 'revision' ? window.prompt('Alasan revisi (opsional):', '') : undefined;
    startTransition(async () => {
      const res = await reviewRpp(rpp.id, decision, note ?? undefined);
      if (res.success) onClose();
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
            <StatPill n={`${body?.kktp ?? KKTP_DEFAULT}`} l="KKTP" />
            <StatPill n={`${body?.tp?.length ?? 0}`} l="TP" />
            <StatPill n={rpp.status === 'approved' ? 'Disetujui' : rpp.status === 'submitted' ? 'Menunggu' : rpp.status === 'revision' ? 'Revisi' : 'Draft'} l="Status" />
          </div>
          {rpp.reviewNote && <div className="rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] font-semibold text-amber-700"><AlertTriangle className="mr-1 inline h-3 w-3" />Catatan KS: {rpp.reviewNote}</div>}

          {/* CP & TP */}
          {body?.cp && <DetailSection icon={Target} title="Capaian Pembelajaran (CP)"><p className="text-[12.5px] text-[#355a4e]">{body.cp}</p></DetailSection>}
          {body?.tp && body.tp.length > 0 && <DetailSection icon={ListChecks} title="Tujuan Pembelajaran (TP)"><ul className="space-y-1">{body.tp.map((tp, i) => <li key={i} className="flex gap-2 text-[12.5px] text-[#355a4e]"><span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-emerald-100 text-[10px] font-bold text-emerald-700">{i + 1}</span>{tp}</li>)}</ul></DetailSection>}

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

          {/* Pengayaan & Remedial */}
          {body?.pengayaan && <DetailSection icon={TrendingUp} title="Pengayaan & Remedial"><p className="text-[12.5px] text-[#355a4e]">{body.pengayaan}</p>{body.remedial && <p className="mt-1 text-[12px] text-[#355a4e]">{body.remedial}</p>}</DetailSection>}
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

function SumatifDetailModal({ item, onClose }: { item: typeof SIM_SUMATIF[number]; onClose: () => void }) {
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
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700"><AlertTriangle className="mr-1 inline h-3 w-3" />SIMULASI — pratinjau soal lengkap menyusul saat backend /assessments/audit tersedia</div>
        </div>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[#e6efea] bg-white px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-[#e6efea] bg-white px-4 py-2 text-[12.5px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]">Tutup</button>
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
