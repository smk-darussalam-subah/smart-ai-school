'use client';

// =============================================================================
// PublicKioskBoard — display PUBLIK Ruang Guru (R3), tata letak MENGIKUTI Beranda
// v3 (toggle Papan ⇄ Agenda&Kalender, klik tanggal, layar penuh). READ-ONLY,
// tanpa login, tanpa PII (detail per-siswa hanya di akun staf). Auto-refresh 60s.
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import {
  Users, UserCheck, Presentation, AlarmClockOff, Target,
  CalendarDays, CalendarClock, Monitor, Minimize2,
} from 'lucide-react';
import PapanPembelajaran, { type PapanRow } from '../../../dashboard/_components/PapanPembelajaran';
import MonthCalendar from '../../../dashboard/_components/MonthCalendar';
import { wibNow, currentJp, jpStatusLabel, wibDateLabel } from '@/lib/bell-times';
import { themeForDay, EVENT_META, MONTH_NAMES, ymd, type KioskTheme, type KaldikEvent } from '@/lib/kiosk';

export interface KioskBundle {
  schoolName: string;
  health: { score: number | null; delta: number | null; breakdown: { label: string; pct: number | null; fase2?: boolean }[] };
  kpi: { studentPct: number | null; teacherHadir: number; totalGuru: number; totalKelas: number };
  papanRows: PapanRow[];
  tren: { dates: string[]; pcts: number[] };
  agenda: KaldikEvent[];
}

const KIOSK_GREETS = ['Guru & Karyawan Hebat', 'Pahlawan Pendidikan', 'Insan Pembelajar', 'Pendidik Inspiratif'];
const REFRESH_MS = 60_000;
const mon3 = (d: Date) => (MONTH_NAMES[d.getMonth()] ?? '').slice(0, 3);
const fmtPct = (v: number | null) => (v == null ? '—' : `${v.toFixed(1)}%`);

export default function PublicKioskBoard({ data }: { data: KioskBundle }) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useState<KioskTheme>(themeForDay(5));
  const [dayIdx, setDayIdx] = useState(5);
  const [now, setNow] = useState({ time: '--:--', date: wibDateLabel(), jpStatus: '—', jp: 0 });
  const [ago, setAgo] = useState(0);
  const [full, setFull] = useState(false);

  const today = new Date();
  const todayStr = ymd(today);
  const [cal, setCal] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [selDate, setSelDate] = useState(todayStr);

  useEffect(() => {
    const wib = new Date(Date.now() + 7 * 60 * 60 * 1000);
    setDayIdx(wib.getUTCDay()); setTheme(themeForDay(wib.getUTCDay()));
  }, []);
  useEffect(() => {
    const tick = () => {
      const d = new Date(); const m = wibNow(d).minutes;
      const wib = new Date(d.getTime() + 7 * 60 * 60 * 1000);
      setNow({ time: `${String(wib.getUTCHours()).padStart(2, '0')}:${String(wib.getUTCMinutes()).padStart(2, '0')}`, date: wibDateLabel(d), jpStatus: jpStatusLabel(m), jp: currentJp(m) });
    };
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const r = setInterval(() => { router.refresh(); setAgo(0); }, REFRESH_MS);
    const t = setInterval(() => setAgo((s) => s + 1), 1000);
    return () => { clearInterval(r); clearInterval(t); };
  }, [router]);
  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement) setFull(false); };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);
  const enterFull = () => { setFull(true); rootRef.current?.requestFullscreen?.().catch(() => {}); };
  const exitFull = () => { setFull(false); if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); };

  const hour = Math.floor(wibNow().minutes / 60);
  const timeOfDay = hour < 11 ? 'pagi' : hour < 15 ? 'siang' : hour < 18 ? 'sore' : 'malam';
  const greet = `Selamat ${timeOfDay}, ${KIOSK_GREETS[dayIdx % KIOSK_GREETS.length]}! 👋`;

  const agendaForSel = data.agenda
    .filter((e) => selDate >= e.date && selDate <= e.endDate)
    .sort((a, b) => (a.time ? 1 : 0) - (b.time ? 1 : 0) || (a.time ?? '').localeCompare(b.time ?? ''));
  const upcoming = data.agenda.filter((e) => e.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
  const selIsToday = selDate === todayStr;
  const selD = new Date(`${selDate}T00:00:00`);
  const agendaTitle = selIsToday ? 'Agenda Hari Ini' : `Agenda ${selD.getDate()} ${mon3(selD)}`;
  const kelasNow = now.jp > 0 ? data.papanRows.filter((r) => r.cells[now.jp - 1]).length : 0;

  return (
    <div ref={rootRef} className="min-h-screen p-5 space-y-3" style={{ background: theme.soft }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium" style={{ background: '#fff', color: theme.ac, border: `1px solid ${theme.ring}` }}>
          <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ background: theme.ac2 }} /><span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: theme.ac }} /></span>
          LIVE · diperbarui {ago} dtk lalu
        </span>
        {full ? (
          <button onClick={exitFull} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"><Minimize2 className="h-4 w-4" /> Keluar Layar Penuh</button>
        ) : (
          <button onClick={enterFull} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white" style={{ background: theme.ac }}><Monitor className="h-4 w-4" /> Layar Penuh</button>
        )}
      </div>

      {/* Header */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <h1 className="text-lg font-bold text-gray-900">{greet}</h1>
          <p className="text-xs text-gray-500 mt-0.5">{data.schoolName} · Mode Ruang Guru</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center justify-center py-3">
          <p className="text-[58px] font-extrabold tracking-tight tabular-nums leading-none text-gray-900">{now.time}</p>
          <p className="text-xs text-gray-500 mt-1.5">{now.date} · <span className="font-semibold" style={{ color: theme.ac }}>{now.jpStatus}</span></p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex gap-4 items-center">
          <div className="shrink-0">
            <p className="text-[40px] font-extrabold leading-none" style={{ color: theme.ac }}>{data.health.score != null ? `${data.health.score}%` : '—'}</p>
            <p className="text-[11px] text-gray-500">Kondisi Sekolah</p>
          </div>
          <div className="flex-1 min-w-0 space-y-1.5">
            {data.health.breakdown.map((b) => (
              <div key={b.label} className="flex items-center gap-2 text-[10.5px] text-gray-500">
                <span className="w-[92px] truncate">{b.label}</span>
                <span className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${b.pct ?? 0}%`, background: theme.ac }} /></span>
                {b.pct != null ? <span className="w-9 text-right font-bold text-gray-700">{b.pct}%</span> : <span className="w-9 text-right text-[8px] font-bold uppercase text-amber-600">Fase 2</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* KPI (read-only) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiBox theme={theme} icon={<Users className="w-5 h-5" />} label="Kehadiran Siswa" value={fmtPct(data.kpi.studentPct)} />
        <KpiBox theme={theme} icon={<UserCheck className="w-5 h-5" />} label="Kehadiran Guru" value={`${data.kpi.teacherHadir}${data.kpi.totalGuru ? `/${data.kpi.totalGuru}` : ''}`} sub="hadir hari ini" />
        <KpiBox theme={theme} icon={<Presentation className="w-5 h-5" />} label="Kelas Terjadwal" value={`${kelasNow}${data.kpi.totalKelas ? `/${data.kpi.totalKelas}` : ''}`} sub={now.jp ? `JP-${now.jp} berjalan` : 'di luar JP'} />
        <KpiBox theme={theme} icon={<AlarmClockOff className="w-5 h-5" />} label="Jam Kosong" value="—" fase2 />
        <KpiBox theme={theme} icon={<Target className="w-5 h-5" />} label="Ketercapaian Silabus" value="—" fase2 />
      </div>

      {/* Papan (toggle) + Tren */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2">
          <PapanToggle theme={theme} papanRows={data.papanRows} dayLabel={now.date.split(',')[0] ?? ''}
            cal={cal} setCal={setCal} agenda={data.agenda} todayStr={todayStr} selDate={selDate} setSelDate={setSelDate}
            agendaForSel={agendaForSel} agendaTitle={agendaTitle} upcoming={upcoming} />
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 self-start">
          <h2 className="font-semibold text-gray-800 text-sm mb-1">Tren Kehadiran · {data.tren.dates.length} hari</h2>
          <TrenSvg pcts={data.tren.pcts} color={theme.ac} />
          <p className="text-[10px] text-gray-400 mt-1">Rata-rata kehadiran (data nyata)</p>
        </div>
      </div>

      <p className="text-center text-[11px] text-gray-400">Mode Ruang Guru · diperbarui {ago} dtk lalu · {data.schoolName}</p>
    </div>
  );
}

function KpiBox({ theme, icon, label, value, sub, fase2 }: { theme: KioskTheme; icon: React.ReactNode; label: string; value: string; sub?: string; fase2?: boolean }) {
  return (
    <div className={clsx('bg-white rounded-2xl border p-4', fase2 ? 'border-dashed border-amber-300 bg-amber-50/40' : 'border-gray-100 shadow-sm')}>
      <div className="flex items-start justify-between">
        <span className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: theme.soft, color: theme.ac }}>{icon}</span>
        {fase2 && <span className="text-[9px] font-bold uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Fase 2</span>}
      </div>
      <p className={clsx('text-2xl font-extrabold mt-3 leading-none', fase2 ? 'text-amber-400' : 'text-gray-900')}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}{sub ? ` · ${sub}` : ''}</p>
    </div>
  );
}

function TrenSvg({ pcts, color }: { pcts: number[]; color: string }) {
  const W = 320, H = 80, pad = 6, min = 60, max = 100;
  const y = (v: number) => H - pad - ((Math.max(min, Math.min(max, v)) - min) / (max - min)) * (H - 2 * pad);
  if (pcts.length < 2) return <p className="py-6 text-center text-xs text-gray-400">Belum ada data.</p>;
  const pts = pcts.map((p, i) => `${(pad + i * ((W - 2 * pad) / Math.max(1, pcts.length - 1))).toFixed(1)} ${y(p).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-20">
      {[60, 80, 100].map((g) => <line key={g} x1={pad} y1={y(g)} x2={W - pad} y2={y(g)} stroke="#eef2f0" strokeWidth={1} />)}
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PapanToggle({ theme, papanRows, dayLabel, cal, setCal, agenda, todayStr, selDate, setSelDate, agendaForSel, agendaTitle, upcoming }: {
  theme: KioskTheme; papanRows: PapanRow[]; dayLabel: string;
  cal: { y: number; m: number }; setCal: (f: (c: { y: number; m: number }) => { y: number; m: number }) => void;
  agenda: KaldikEvent[]; todayStr: string; selDate: string; setSelDate: (d: string) => void;
  agendaForSel: KaldikEvent[]; agendaTitle: string; upcoming: KaldikEvent[];
}) {
  const [tab, setTab] = useState<'papan' | 'agenda'>('papan');
  const navCal = (d: number) => setCal((c) => { const x = new Date(c.y, c.m + d, 1); return { y: x.getFullYear(), m: x.getMonth() }; });
  const jumpCal = (y: number, m0: number) => setCal(() => ({ y, m: m0 }));
  const tabBtn = (key: 'papan' | 'agenda', label: string, icon: React.ReactNode) => (
    <button onClick={() => setTab(key)} className={clsx('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition', tab === key ? 'text-white' : 'text-gray-500 hover:text-gray-700')} style={tab === key ? { background: theme.ac } : undefined}>{icon}{label}</button>
  );
  return (
    <div className="h-full flex flex-col gap-2">
      <div className="inline-flex self-start bg-white border border-gray-100 rounded-xl p-0.5 shadow-sm">
        {tabBtn('papan', 'Papan Pembelajaran', <Presentation className="w-4 h-4" />)}
        {tabBtn('agenda', 'Agenda & Kalender', <CalendarDays className="w-4 h-4" />)}
      </div>
      {tab === 'papan' ? (
        <PapanPembelajaran rows={papanRows} dayLabel={dayLabel} />
      ) : (
        <div className="flex flex-col xl:flex-row gap-3 anim-slide-right items-stretch">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3.5 xl:basis-[300px] xl:shrink-0 w-full">
            <MonthCalendar year={cal.y} month0={cal.m} onNav={navCal} onJump={jumpCal} events={agenda} todayStr={todayStr} accent={theme.ac} selectedDates={[selDate]} onDayClick={setSelDate} compact />
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[10px] text-gray-500">
              {(['exam', 'event', 'holiday'] as const).map((t) => (<span key={t} className="flex items-center gap-1"><i className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: EVENT_META[t].dot }} />{EVENT_META[t].label}</span>))}
            </div>
          </div>
          <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
            <AgendaList title={agendaTitle} icon={<CalendarDays className="w-4 h-4" />} theme={theme} events={agendaForSel} empty={selDate === todayStr ? 'Tidak ada agenda hari ini.' : 'Tidak ada agenda pada tanggal ini.'} />
            <AgendaList title="Upcoming Event" icon={<CalendarClock className="w-4 h-4" />} theme={theme} events={upcoming} empty="Belum ada agenda mendatang." showDate />
          </div>
        </div>
      )}
    </div>
  );
}

function AgendaList({ title, icon, theme, events, empty, showDate = false }: { title: string; icon: React.ReactNode; theme: KioskTheme; events: KaldikEvent[]; empty: string; showDate?: boolean }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col min-h-0 h-full overflow-hidden">
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-gray-100 shrink-0"><span style={{ color: theme.ac }}>{icon}</span><h2 className="font-semibold text-gray-800 text-[13px]">{title}</h2></div>
      {events.length === 0 ? <div className="flex-1 grid place-items-center min-h-[140px]"><p className="text-xs text-gray-400">{empty}</p></div> : (
        <div className="px-3 overflow-y-auto flex-1 min-h-[140px]">
          {events.map((e) => {
            const meta = EVENT_META[e.type]; const d = new Date(`${e.date}T00:00:00`);
            return (
              <div key={e.id} className="flex gap-2.5 py-2 border-b border-gray-50 last:border-0">
                {showDate ? <div className="shrink-0 w-9 text-center rounded-lg py-1 leading-none" style={{ background: meta.soft, color: meta.text }}><p className="text-sm font-extrabold">{d.getDate()}</p><p className="text-[8px] font-semibold uppercase">{mon3(d)}</p></div> : <span className="shrink-0 w-1 rounded-full self-stretch" style={{ background: meta.dot }} />}
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-gray-800 leading-snug flex items-start gap-1.5 flex-wrap"><span className="line-clamp-2">{e.name}</span><span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 mt-0.5" style={{ background: meta.soft, color: meta.text }}>{meta.label}</span></p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{e.time ? e.time : (e.date === e.endDate ? `${d.getDate()} ${mon3(d)}` : `${d.getDate()}–${new Date(`${e.endDate}T00:00:00`).getDate()} ${mon3(d)}`)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
