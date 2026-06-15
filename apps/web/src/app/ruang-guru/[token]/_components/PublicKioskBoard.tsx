'use client';

// =============================================================================
// PublicKioskBoard — display PUBLIK Ruang Guru (R3). READ-ONLY, tanpa login,
// tanpa PII. Tema soft harian + jam + skor + KPI + Papan + Tren + Agenda.
// Auto-refresh 60s. Data dari /public/kiosk (sudah ter-token & agregat).
// =============================================================================

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, UserCheck, Presentation, CalendarDays, CalendarClock, TrendingUp, TrendingDown } from 'lucide-react';
import PapanPembelajaran, { type PapanRow } from '../../../dashboard/_components/PapanPembelajaran';
import MonthCalendar from '../../../dashboard/_components/MonthCalendar';
import { wibNow, currentJp, jpStatusLabel, wibDateLabel } from '@/lib/bell-times';
import { themeForDay, EVENT_META, MONTH_NAMES, ymd, type KaldikEvent } from '@/lib/kiosk';

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

export default function PublicKioskBoard({ data }: { data: KioskBundle }) {
  const router = useRouter();
  const [theme, setTheme] = useState(themeForDay(5));
  const [dayIdx, setDayIdx] = useState(5);
  const [now, setNow] = useState({ time: '--:--', date: wibDateLabel(), jpStatus: '—', jp: 0 });
  const [ago, setAgo] = useState(0);
  const [cal, setCal] = useState(() => { const t = new Date(); return { y: t.getFullYear(), m: t.getMonth() }; });

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

  const hour = Math.floor((wibNow().minutes) / 60);
  const timeOfDay = hour < 11 ? 'pagi' : hour < 15 ? 'siang' : hour < 18 ? 'sore' : 'malam';
  const greet = `Selamat ${timeOfDay}, ${KIOSK_GREETS[dayIdx % KIOSK_GREETS.length]}! 👋`;

  const todayStr = ymd(new Date());
  const agendaToday = data.agenda.filter((e) => todayStr >= e.date && todayStr <= e.endDate);
  const upcoming = data.agenda.filter((e) => e.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
  const kelasNow = now.jp > 0 ? data.papanRows.filter((r) => r.cells[now.jp - 1]).length : 0;

  // Tren SVG (overall)
  const W = 320, H = 80, pad = 6, min = 60, max = 100;
  const y = (v: number) => H - pad - ((Math.max(min, Math.min(max, v)) - min) / (max - min)) * (H - 2 * pad);
  const trenPts = data.tren.pcts.map((p, i) => `${(pad + i * ((W - 2 * pad) / Math.max(1, data.tren.pcts.length - 1))).toFixed(1)} ${y(p).toFixed(1)}`).join(' ');

  return (
    <div className="min-h-screen p-5 space-y-3" style={{ background: theme.soft }}>
      {/* Header */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <h1 className="text-lg font-bold text-gray-900">{greet}</h1>
          <p className="text-xs text-gray-500 mt-0.5">{data.schoolName} · Mode Ruang Guru</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center justify-center py-3">
          <p className="text-[64px] font-extrabold tracking-tight tabular-nums leading-none text-gray-900">{now.time}</p>
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiBox theme={theme} icon={<Users className="w-5 h-5" />} label="Kehadiran Siswa" value={data.kpi.studentPct != null ? `${data.kpi.studentPct.toFixed(1)}%` : '—'} />
        <KpiBox theme={theme} icon={<UserCheck className="w-5 h-5" />} label="Kehadiran Guru" value={`${data.kpi.teacherHadir}${data.kpi.totalGuru ? `/${data.kpi.totalGuru}` : ''}`} sub="hadir hari ini" />
        <KpiBox theme={theme} icon={<Presentation className="w-5 h-5" />} label="Kelas Terjadwal" value={`${kelasNow}${data.kpi.totalKelas ? `/${data.kpi.totalKelas}` : ''}`} sub={now.jp ? `JP-${now.jp} berjalan` : 'di luar JP'} />
        <KpiBox theme={theme} icon={data.health.delta != null && data.health.delta < 0 ? <TrendingDown className="w-5 h-5" /> : <TrendingUp className="w-5 h-5" />} label="Tren Kehadiran" value={data.tren.pcts.length ? `${data.tren.pcts[data.tren.pcts.length - 1]}%` : '—'} sub="rata-rata terkini" />
      </div>

      {/* Papan + Agenda/Tren */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2"><PapanPembelajaran rows={data.papanRows} dayLabel={now.date.split(',')[0] ?? ''} /></div>
        <div className="space-y-3">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <h2 className="font-semibold text-gray-800 text-sm mb-1">Tren Kehadiran · {data.tren.dates.length} hari</h2>
            {data.tren.pcts.length >= 2 ? (
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-20">
                {[60, 80, 100].map((g) => <line key={g} x1={pad} y1={y(g)} x2={W - pad} y2={y(g)} stroke="#eef2f0" strokeWidth={1} />)}
                <polyline points={trenPts} fill="none" stroke={theme.ac} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : <p className="py-6 text-center text-xs text-gray-400">Belum ada data.</p>}
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3.5">
            <MonthCalendar year={cal.y} month0={cal.m} onNav={(d) => setCal((c) => { const x = new Date(c.y, c.m + d, 1); return { y: x.getFullYear(), m: x.getMonth() }; })} events={data.agenda} todayStr={todayStr} accent={theme.ac} compact />
          </div>
        </div>
      </div>

      {/* Agenda hari ini + Upcoming */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <AgendaList title="Agenda Hari Ini" icon={<CalendarDays className="w-4 h-4" />} theme={theme} events={agendaToday} empty="Tidak ada agenda hari ini." />
        <AgendaList title="Upcoming Event" icon={<CalendarClock className="w-4 h-4" />} theme={theme} events={upcoming} empty="Belum ada agenda mendatang." showDate />
      </div>

      <p className="text-center text-[11px] text-gray-400">Mode Ruang Guru · diperbarui {ago} dtk lalu · {data.schoolName}</p>
    </div>
  );
}

function KpiBox({ theme, icon, label, value, sub }: { theme: { ac: string; soft: string }; icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <span className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: theme.soft, color: theme.ac }}>{icon}</span>
      <p className="text-2xl font-extrabold mt-3 leading-none text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}{sub ? ` · ${sub}` : ''}</p>
    </div>
  );
}

function AgendaList({ title, icon, theme, events, empty, showDate = false }: { title: string; icon: React.ReactNode; theme: { ac: string }; events: KaldikEvent[]; empty: string; showDate?: boolean }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col">
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-gray-100">
        <span style={{ color: theme.ac }}>{icon}</span><h2 className="font-semibold text-gray-800 text-[13px]">{title}</h2>
      </div>
      {events.length === 0 ? <p className="py-6 text-center text-xs text-gray-400">{empty}</p> : (
        <div className="px-3 max-h-[186px] overflow-y-auto">
          {events.map((e) => {
            const meta = EVENT_META[e.type];
            const d = new Date(`${e.date}T00:00:00`);
            return (
              <div key={e.id} className="flex gap-2.5 py-2 border-b border-gray-50 last:border-0">
                {showDate
                  ? <div className="shrink-0 w-9 text-center rounded-lg py-1 leading-none" style={{ background: meta.soft, color: meta.text }}><p className="text-sm font-extrabold">{d.getDate()}</p><p className="text-[8px] font-semibold uppercase">{mon3(d)}</p></div>
                  : <span className="shrink-0 w-1 rounded-full self-stretch" style={{ background: meta.dot }} />}
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-gray-800 leading-snug flex items-start gap-1.5 flex-wrap"><span className="line-clamp-2">{e.name}</span><span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 mt-0.5" style={{ background: meta.soft, color: meta.text }}>{meta.label}</span></p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{e.date === e.endDate ? `${d.getDate()} ${mon3(d)}` : `${d.getDate()}–${new Date(`${e.endDate}T00:00:00`).getDate()} ${mon3(d)}`}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
