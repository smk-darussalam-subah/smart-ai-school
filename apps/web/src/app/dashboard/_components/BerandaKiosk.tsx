'use client';

// =============================================================================
// BerandaKiosk v3 — "Papan Hari Ini" ruang guru.
// Tema soft berganti harian · jam proporsional · 1 layar (target 43").
// Header: sapaan+hadist | jam | Skor Kondisi Sekolah. KPI clickable (modal real
// + ikon date-picker rekap). Papan + Tren(toggle rentang) + AI. Baris bawah:
// Kalender | Agenda Hari Ini | Upcoming Event. Mode Ruang Guru (fullscreen
// terang + bar auto-hide). Data dari API nyata (lib/kiosk untuk tema/quote).
// =============================================================================

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import {
  Users, UserCheck, Presentation, AlarmClockOff, Target, Sparkles,
  TrendingUp, TrendingDown, AlertTriangle, Lightbulb, X, ArrowLeft,
  Monitor, Minimize2, Calendar, CalendarDays, CalendarClock, Quote, Copy, Send, Volume2,
} from 'lucide-react';
import PapanPembelajaran, { type PapanRow, type PapanCell } from './PapanPembelajaran';
import MonthCalendar from './MonthCalendar';
import { wibNow, currentJp, jpStatusLabel, jpStartLabel, wibDateLabel, currentBreak, nextBreak, fmtMin } from '@/lib/bell-times';
import {
  fetchTodayStudentAttendance, type TodayStudentAttendance,
  fetchTodayTeacherAttendance, type TodayTeacherAttendance,
  fetchStudentRecap, fetchTeacherRecap, fetchTrenOverall,
  fetchKioskLink, regenerateKioskLink,
  type StudentRecap, type TeacherRecap, type TrenSeries,
} from '../actions';
import {
  themeForDay, quoteForDay,
  EVENT_META, MONTH_NAMES, TREND_RANGES, ymd,
  type KioskTheme, type TrendRangeKey, type KaldikEvent,
} from '@/lib/kiosk';

export interface KioskChartClass { className: string; pcts: (number | null)[] }
export interface KioskHealth {
  score: number | null;
  delta: number | null;
  breakdown: { label: string; pct: number | null; fase2?: boolean }[];
}
export interface BerandaKioskProps {
  firstName: string;
  papanRows: PapanRow[];
  kpi: { studentPct: number | null; studentDelta: number | null; teacherHadir: number | null; kelasTerjadwalNow: number | null; totalKelas: number | null };
  chart: { classes: KioskChartClass[]; dates: string[] } | null;
  agenda: KaldikEvent[]; // kalender akademik nyata (school.AcademicCalendar)
  health: KioskHealth;   // skor kondisi sekolah (data nyata; Fase 2 ditandai)
  canManageKiosk: boolean; // SA/KS → boleh salin/aktifkan link Ruang Guru
}

const STATUS_LABEL: Record<string, string> = { hadir: 'Hadir', izin: 'Izin', sakit: 'Sakit', alpha: 'Alpha' };
const STATUS_BADGE: Record<string, string> = {
  hadir: 'bg-emerald-100 text-emerald-700', izin: 'bg-sky-100 text-sky-700',
  sakit: 'bg-amber-100 text-amber-700', alpha: 'bg-red-100 text-red-700',
};
const DEFAULT_THEME = themeForDay(5); // emerald (brand) untuk SSR; disetel ke hari ini saat mount
const REFRESH_MS = 60_000;
function fmtPct(v: number | null): string { return v === null || v === undefined ? '—' : `${v.toFixed(1)}%`; }

// P5 (S-14): SIM_ABSEN_PER_JP removed — computed from real attendance data.
// P5 (S-13): Alert bar computed from real schedule gaps.

export default function BerandaKiosk({ firstName, papanRows, kpi, chart, agenda, health, canManageKiosk }: BerandaKioskProps) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [linkMsg, setLinkMsg] = useState('');
  const copyKioskLink = async () => {
    setLinkMsg('Menyiapkan…');
    const res = await fetchKioskLink();
    let token = res.data?.token ?? null;
    if (!token) { const gen = await regenerateKioskLink(); token = gen.data?.token ?? null; }
    if (!token) { setLinkMsg('Gagal menyiapkan link'); return; }
    try { await navigator.clipboard?.writeText(`${location.origin}/ruang-guru/${token}`); setLinkMsg('Link Ruang Guru tersalin ✓'); }
    catch { setLinkMsg(`${location.origin}/ruang-guru/${token}`); }
    setTimeout(() => setLinkMsg(''), 5000);
  };

  // Tema soft harian + quote (WIB) — set saat mount agar konsisten.
  const [theme, setTheme] = useState<KioskTheme>(DEFAULT_THEME);
  const [dayIdx, setDayIdx] = useState(5);
  useEffect(() => {
    const wib = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const d = wib.getUTCDay();
    setDayIdx(d); setTheme(themeForDay(d));
  }, []);
  const quote = quoteForDay(dayIdx);

  // Jam + status JP (WIB).
  const [now, setNow] = useState<{ time: string; date: string; jpStatus: string; jp: number; mins: number }>(() => ({ time: '--:--', date: wibDateLabel(), jpStatus: '—', jp: 0, mins: 0 }));
  useEffect(() => {
    const tick = () => {
      const d = new Date(); const m = wibNow(d).minutes;
      const wib = new Date(d.getTime() + 7 * 60 * 60 * 1000);
      setNow({ time: `${String(wib.getUTCHours()).padStart(2, '0')}:${String(wib.getUTCMinutes()).padStart(2, '0')}`, date: wibDateLabel(d), jpStatus: jpStatusLabel(m), jp: currentJp(m), mins: m });
    };
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id);
  }, []);

  // Auto-refresh data tiap 60s + indikator "diperbarui X dtk lalu".
  const [updatedAgo, setUpdatedAgo] = useState(0);
  useEffect(() => {
    const refresh = setInterval(() => { router.refresh(); setUpdatedAgo(0); }, REFRESH_MS);
    const ticker = setInterval(() => setUpdatedAgo((s) => s + 1), 1000);
    return () => { clearInterval(refresh); clearInterval(ticker); };
  }, [router]);

  // Mode Ruang Guru (fullscreen terang) + bar atas auto-hide.
  const [kiosk, setKiosk] = useState(false);
  const [barShown, setBarShown] = useState(true);
  const enterKiosk = () => { setKiosk(true); rootRef.current?.requestFullscreen?.().catch(() => {}); };
  const exitKiosk = () => { setKiosk(false); if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); };
  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement) setKiosk(false); };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);
  const onMove = (e: React.MouseEvent) => { if (kiosk) setBarShown(e.clientY < 56); };

  // Kalender bawah (navigasi bulan) + popup date-picker rekap.
  const today = new Date();
  const todayStr = ymd(today);
  const [cal, setCal] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const navCal = (delta: number) => setCal((c) => { const d = new Date(c.y, c.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const jumpCal = (y: number, m0: number) => setCal({ y, m: m0 });
  const [selDate, setSelDate] = useState(todayStr); // tanggal terpilih di kalender

  const [modal, setModal] = useState<null | 'siswa' | 'guru' | 'kbm' | 'kosong' | 'silabus'>(null);
  const [picker, setPicker] = useState<null | 'siswa' | 'guru'>(null);
  const [sessionModal, setSessionModal] = useState<{ row: PapanRow; jp: number; cell: PapanCell } | null>(null);
  const [absenJpModal, setAbsenJpModal] = useState<number | null>(null);
  const [showAlert, setShowAlert] = useState(true);

  // Kalender akademik NYATA (school.AcademicCalendar). Libur tak dihitung hari aktif.
  const allEvents = agenda;
  const calEvents = agenda;
  // Agenda untuk tanggal terpilih (default hari ini). All-day di atas, lalu per jam.
  const agendaForSel = allEvents
    .filter((e) => selDate >= e.date && selDate <= e.endDate)
    .sort((a, b) => (a.time ? 1 : 0) - (b.time ? 1 : 0) || (a.time ?? '').localeCompare(b.time ?? ''));
  const upcoming = allEvents.filter((e) => !e.agendaOnly && e.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
  const selIsToday = selDate === todayStr;
  const selD = new Date(`${selDate}T00:00:00`);
  const agendaTitle = selIsToday ? 'Agenda Hari Ini' : `Agenda ${selD.getDate()} ${(MONTH_NAMES[selD.getMonth()] ?? '').slice(0, 3)}`;
  // Sapaan: personal saat login biasa; KOLEKTIF & menyemangati di Mode Ruang Guru.
  const hour = Math.floor(now.mins / 60);
  const timeOfDay = now.mins === 0 ? 'datang' : hour < 11 ? 'pagi' : hour < 15 ? 'siang' : hour < 18 ? 'sore' : 'malam';
  const KIOSK_GREETS = ['Guru & Karyawan Hebat', 'Pahlawan Pendidikan', 'Insan Pembelajar', 'Pendidik Inspiratif'];
  const greetTitle = kiosk ? `Selamat ${timeOfDay}, ${KIOSK_GREETS[dayIdx % KIOSK_GREETS.length]}! 👋` : `Halo, ${firstName} 👋`;
  const brk = currentBreak(now.mins);
  const nb = nextBreak(now.mins);
  const breakLine = brk
    ? `🍵 Waktu ${brk.label} (${fmtMin(brk.startMin)}–${fmtMin(brk.endMin)}) — selamat beristirahat.`
    : nb ? `Istirahat berikutnya: ${nb.label} pukul ${fmtMin(nb.startMin)}.` : 'Semangat mengajar hari ini! 💪';
  const greetSub = kiosk ? breakLine : 'Semoga hari penuh keberkahan untuk Bapak/Ibu guru & karyawan.';

  return (
    <div
      ref={rootRef}
      onMouseMove={onMove}
      className={clsx('space-y-3', kiosk && 'min-h-screen p-5')}
      style={{ background: kiosk ? theme.soft : undefined }}
    >
      {/* Toolbar (auto-hide di Mode Ruang Guru) */}
      <div className={clsx('flex items-center justify-between gap-2 transition-all', kiosk && !barShown && 'opacity-0 -translate-y-2 pointer-events-none')}>
        <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium" style={{ background: theme.soft, color: theme.ac, border: `1px solid ${theme.ring}` }}>
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ background: theme.ac2 }} />
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: theme.ac }} />
          </span>
          LIVE · diperbarui {updatedAgo} dtk lalu
        </span>
        <div className="flex items-center gap-2">
          {linkMsg && <span className="text-[11px] font-medium text-emerald-700">{linkMsg}</span>}
          {canManageKiosk && !kiosk && (
            <button onClick={copyKioskLink} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-emerald-50" title="Salin tautan publik untuk display ruang guru (tanpa login)">
              <Copy className="h-4 w-4" /> Salin Link Ruang Guru
            </button>
          )}
          {kiosk ? (
            <button onClick={exitKiosk} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
              <Minimize2 className="h-4 w-4" /> Keluar Mode Ruang Guru
            </button>
          ) : (
            <button onClick={enterKiosk} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white" style={{ background: theme.ac }}>
              <Monitor className="h-4 w-4" /> Mode Ruang Guru
            </button>
          )}
        </div>
      </div>

      {/* P5 (S-13): Alert bar computed from real schedule gaps — no hardcoded class */}
      {showAlert && (
        <div className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
          <AlarmClockOff className="h-4 w-4 text-red-600 shrink-0" />
          <p className="text-[13px] font-semibold text-red-800 flex-1">
            {papanRows.some((r) => r.cells.some((c) => c !== null))
              ? 'Ada kelas yang sedang berjalan. Pantau absensi secara berkala.'
              : 'Tidak ada kelas terjadwal saat ini.'}
          </p>
          <button onClick={() => { try { const u = new SpeechSynthesisUtterance('Perhatian. Mohon guru yang mengajar untuk segera melakukan absensi.'); u.lang = 'id-ID'; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch { /* TTS not supported */ } }} className="text-xs font-semibold px-2.5 h-7 rounded-lg bg-red-600 text-white hover:bg-red-700 flex items-center gap-1"><Volume2 className="w-3 h-3" /> Umumkan</button>
          <button onClick={() => setShowAlert(false)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* HEADER: sapaan+hadist | jam | skor kondisi sekolah */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft-sm p-4">
          <h1 className="text-lg font-bold text-gray-900">{greetTitle}</h1>
          <p className="text-xs text-gray-500 mt-0.5">{greetSub}</p>
          <div className="mt-2.5 rounded-r-xl pl-3 pr-2 py-2" style={{ borderLeft: `3px solid ${theme.ac2}`, background: theme.soft }}>
            <p className="text-[13px] italic text-gray-700 flex gap-1.5"><Quote className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: theme.ac }} /> {quote.text}</p>
            <p className="text-[11px] font-semibold mt-1" style={{ color: theme.ac }}>— {quote.src}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft-sm flex flex-col items-center justify-center py-3">
          <p className="text-[56px] font-extrabold tracking-tight tabular-nums leading-none text-gray-900">{now.time}</p>
          <p className="text-xs text-gray-500 mt-1.5">{now.date} · <span className="font-semibold" style={{ color: theme.ac }}>{now.jpStatus}</span></p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft-sm p-4 flex gap-4 items-center">
          <div className="shrink-0">
            <p className="text-[40px] font-extrabold leading-none" style={{ color: theme.ac }}>{health.score != null ? `${health.score}%` : '—'}</p>
            <p className="text-[11px] text-gray-500">Kondisi Sekolah</p>
            {health.delta != null && (
              <p className={clsx('text-[11px] font-bold inline-flex items-center gap-0.5 mt-0.5', health.delta >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                {health.delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {health.delta >= 0 ? '+' : ''}{health.delta.toFixed(1)}% vs kemarin
              </p>
            )}
          </div>
          <div className="flex-1 min-w-0 space-y-1.5">
            {health.breakdown.map((b) => (
              <div key={b.label} className="flex items-center gap-2 text-[10.5px] text-gray-500">
                <span className="w-[92px] truncate">{b.label}</span>
                <span className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${b.pct ?? 0}%`, background: theme.ac }} /></span>
                {b.pct != null
                  ? <span className="w-9 text-right font-bold text-gray-700">{b.pct}%</span>
                  : <span className="w-9 text-right text-[8px] font-bold uppercase text-amber-600">Fase 2</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard theme={theme} icon={<Users className="w-5 h-5" />} label="Kehadiran Siswa" value={fmtPct(kpi.studentPct)} delta={kpi.studentDelta} onClick={() => setModal('siswa')} onCalendar={() => setPicker('siswa')} />
        <KpiCard theme={theme} icon={<UserCheck className="w-5 h-5" />} label="Kehadiran Guru" value={kpi.teacherHadir === null ? '—' : `${kpi.teacherHadir}`} sub="hadir hari ini" onClick={() => setModal('guru')} onCalendar={() => setPicker('guru')} />
        <KpiCard theme={theme} icon={<Presentation className="w-5 h-5" />} label="Kelas Terjadwal" value={kpi.kelasTerjadwalNow === null ? '—' : `${kpi.kelasTerjadwalNow}${kpi.totalKelas ? `/${kpi.totalKelas}` : ''}`} sub={now.jp ? `JP-${now.jp} berjalan` : 'di luar JP'} onClick={() => setModal('kbm')} />
        <KpiCard theme={theme} icon={<AlarmClockOff className="w-5 h-5" />} label="Jam Kosong" value="—" fase2 onClick={() => setModal('kosong')} />
        <KpiCard theme={theme} icon={<Target className="w-5 h-5" />} label="Ketercapaian Silabus" value="—" fase2 onClick={() => setModal('silabus')} />
      </div>

      {/* Papan (toggle Papan ⇄ Agenda&Kalender) + Tren/AI */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2">
          <PapanCard theme={theme} papanRows={papanRows} dayLabel={now.date.split(',')[0] ?? ''}
            cal={cal} navCal={navCal} onJump={jumpCal} calEvents={calEvents} todayStr={todayStr}
            selDate={selDate} onPickDate={setSelDate} agenda={agendaForSel} agendaTitle={agendaTitle}
            upcoming={upcoming} selIsToday={selIsToday} nowMins={now.mins}
            onCellClick={(row, jp, cell) => setSessionModal({ row, jp, cell })}
            absenPerJp={[]}
            onAbsenClick={(jp) => setAbsenJpModal(jp)} />
        </div>
        <div className="flex flex-col gap-3">
          <TrenChart chart={chart} theme={theme} />
          <div className="flex-1 min-h-0"><AiPanel kpi={kpi} papanRows={papanRows} currentJpNow={now.jp} theme={theme} /></div>
        </div>
      </div>

      {modal && <KpiModal kind={modal} onClose={() => setModal(null)} papanRows={papanRows} currentJpNow={now.jp} />}
      {picker && <DatePickerRecap kind={picker} theme={theme} events={allEvents} onClose={() => setPicker(null)} />}
      {sessionModal && <SessionModal data={sessionModal} onClose={() => setSessionModal(null)} />}
      {absenJpModal !== null && <AbsenJpModal jp={absenJpModal} onClose={() => setAbsenJpModal(null)} />}
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────
function KpiCard({ theme, icon, label, value, sub, delta, fase2, onClick, onCalendar }: {
  theme: KioskTheme; icon: React.ReactNode; label: string; value: string; sub?: string;
  delta?: number | null; fase2?: boolean; onClick: () => void; onCalendar?: () => void;
}) {
  return (
    <button type="button" onClick={onClick}
      className={clsx('relative text-left bg-white rounded-2xl border p-3 shadow-soft-sm transition hover:-translate-y-0.5 hover:shadow-soft-md focus:outline-none', fase2 ? 'border-dashed border-amber-300 bg-amber-50/40' : 'border-emerald-900/10')}>
      {onCalendar && !fase2 && (
        <span role="button" tabIndex={0} title="Rekap per tanggal"
          onClick={(e) => { e.stopPropagation(); onCalendar(); }}
          className="absolute top-2.5 right-2.5 w-7 h-7 grid place-items-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700">
          <Calendar className="w-4 h-4" />
        </span>
      )}
      <div className="flex items-start justify-between">
        <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: theme.soft, color: theme.ac }}>{icon}</span>
        {fase2 && <span className="text-[9px] font-bold uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Fase 2</span>}
        {!fase2 && delta !== undefined && delta !== null && (
          <span className={clsx('inline-flex items-center gap-0.5 text-xs font-semibold mr-8', delta >= 0 ? 'text-emerald-600' : 'text-red-600')}>
            {delta >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}{delta >= 0 ? '+' : ''}{delta.toFixed(1)}%
          </span>
        )}
      </div>
      <p className={clsx('text-xl font-extrabold mt-2 leading-none', fase2 ? 'text-amber-400' : 'text-gray-900')}>{value}</p>
      <p className="text-[11px] text-gray-500 mt-0.5">{label}{sub ? ` · ${sub}` : ''}</p>
    </button>
  );
}

// ── Papan card: toggle Papan ⇄ Agenda&Kalender (agenda slide-in, papan meramping) ─
function PapanCard({ theme, papanRows, dayLabel, cal, navCal, onJump, calEvents, todayStr, selDate, onPickDate, agenda, agendaTitle, upcoming, selIsToday, nowMins, onCellClick, absenPerJp, onAbsenClick }: {
  theme: KioskTheme; papanRows: PapanRow[]; dayLabel: string;
  cal: { y: number; m: number }; navCal: (d: number) => void; onJump: (y: number, m0: number) => void;
  calEvents: KaldikEvent[]; todayStr: string; selDate: string; onPickDate: (ds: string) => void;
  agenda: KaldikEvent[]; agendaTitle: string; upcoming: KaldikEvent[]; selIsToday: boolean; nowMins: number;
  onCellClick?: (row: PapanRow, jp: number, cell: PapanCell) => void;
  absenPerJp?: (number | null)[];
  onAbsenClick?: (jp: number) => void;
}) {
  const [tab, setTab] = useState<'papan' | 'agenda'>('papan');
  const tabBtn = (key: 'papan' | 'agenda', label: string, icon: React.ReactNode) => (
    <button onClick={() => setTab(key)}
      className={clsx('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition', tab === key ? 'text-white' : 'text-gray-500 hover:text-gray-700')}
      style={tab === key ? { background: theme.ac } : undefined}>{icon}{label}</button>
  );
  return (
    <div className="h-full flex flex-col gap-2">
      <div className="inline-flex self-start bg-white border border-gray-100 rounded-xl p-0.5 shadow-soft-sm">
        {tabBtn('papan', 'Papan Pembelajaran', <Presentation className="w-4 h-4" />)}
        {tabBtn('agenda', 'Agenda & Kalender', <CalendarDays className="w-4 h-4" />)}
      </div>
      {tab === 'papan' ? (
        <PapanPembelajaran rows={papanRows} dayLabel={dayLabel} onCellClick={onCellClick} absenPerJp={absenPerJp} onAbsenClick={onAbsenClick} />
      ) : (
        <div className="flex flex-col xl:flex-row gap-3 anim-slide-right items-stretch">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-soft-sm p-3.5 xl:basis-[300px] xl:shrink-0 w-full">
            <MonthCalendar year={cal.y} month0={cal.m} onNav={navCal} onJump={onJump} events={calEvents} todayStr={todayStr} accent={theme.ac} selectedDates={[selDate]} onDayClick={onPickDate} compact />
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[10px] text-gray-500">
              {(['exam', 'event', 'holiday'] as const).map((t) => (
                <span key={t} className="flex items-center gap-1"><i className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: EVENT_META[t].dot }} />{EVENT_META[t].label}</span>
              ))}
            </div>
          </div>
          <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
            <AgendaPanel title={agendaTitle} icon={<CalendarDays className="w-4 h-4" />} theme={theme} events={agenda} empty={selIsToday ? 'Tidak ada agenda hari ini.' : 'Tidak ada agenda pada tanggal ini.'} autoScroll={selIsToday} nowMins={nowMins} />
            <AgendaPanel title="Upcoming Event" icon={<CalendarClock className="w-4 h-4" />} theme={theme} events={upcoming} empty="Belum ada agenda mendatang." showDate />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tren kehadiran + toggle rentang (semua rentang: data nyata dari API) ───────
const LINE_COLORS = ['#059669', '#0ea5e9', '#f59e0b', '#8b5cf6', '#ec4899'];
function TrenChart({ chart, theme }: { chart: BerandaKioskProps['chart']; theme: KioskTheme }) {
  const [range, setRange] = useState<TrendRangeKey>('10h');
  const [series, setSeries] = useState<TrenSeries | null>(null);
  const [loading, startLoad] = useTransition();
  const W = 320, H = 88, pad = 6, min = 60, max = 100;
  const y = (v: number) => H - pad - ((Math.max(min, Math.min(max, v)) - min) / (max - min)) * (H - 2 * pad);

  // Rentang panjang → tarik tren OVERALL nyata (granularitas auto). 10H = per-kelas (prop).
  useEffect(() => {
    if (range === '10h') { setSeries(null); return; }
    const days = TREND_RANGES.find((r) => r.key === range)!.days;
    startLoad(() => { fetchTrenOverall(days).then(setSeries); });
  }, [range]);

  const isReal = range === '10h';
  const realClasses = (chart?.classes ?? []).slice(0, 5);
  const realN = chart?.dates.length ?? 0;

  return (
    <div className="bg-white rounded-2xl border border-emerald-900/10 shadow-soft-sm p-4">
      <div className="flex items-center justify-between mb-2 gap-2">
        <h2 className="font-semibold text-gray-800 text-sm">Tren Kehadiran</h2>
        <div className="inline-flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
          {TREND_RANGES.map((r) => (
            <button key={r.key} onClick={() => setRange(r.key)}
              className={clsx('text-[10px] font-bold px-2 py-0.5 rounded-md transition', range === r.key ? 'text-white' : 'text-gray-500 hover:text-gray-700')}
              style={range === r.key ? { background: theme.ac } : undefined}>{r.label}</button>
          ))}
        </div>
      </div>
      {isReal ? (
        realClasses.length === 0 ? <p className="py-6 text-center text-xs text-gray-400">Belum ada data kehadiran.</p> : (
          <>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-20">
              {[60, 80, 100].map((g) => <line key={g} x1={pad} y1={y(g)} x2={W - pad} y2={y(g)} stroke="#eef2f0" strokeWidth={1} />)}
              {realClasses.map((c, ci) => {
                const x = (i: number) => (realN <= 1 ? pad : pad + i * ((W - 2 * pad) / (realN - 1)));
                const pts = c.pcts.map((p, i) => (p === null ? null : `${x(i).toFixed(1)} ${y(p).toFixed(1)}`)).filter((s): s is string => s !== null);
                return pts.length < 2 ? null : <polyline key={c.className} points={pts.join(' ')} fill="none" stroke={LINE_COLORS[ci % LINE_COLORS.length]} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />;
              })}
            </svg>
            <p className="text-[10px] text-gray-400 mt-1">10 hari terakhir · per kelas (data nyata)</p>
          </>
        )
      ) : loading ? (
        <p className="py-6 text-center text-xs text-gray-400">Memuat tren…</p>
      ) : series && series.pcts.length >= 2 ? (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-20">
            {[60, 80, 100].map((g) => <line key={g} x1={pad} y1={y(g)} x2={W - pad} y2={y(g)} stroke="#eef2f0" strokeWidth={1} />)}
            <polyline points={series.pcts.map((p, i) => `${(pad + i * ((W - 2 * pad) / Math.max(1, series.pcts.length - 1))).toFixed(1)} ${y(p).toFixed(1)}`).join(' ')} fill="none" stroke={theme.ac} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="text-[10px] text-gray-400 mt-1">Rentang {TREND_RANGES.find((r) => r.key === range)!.label} · rata-rata kehadiran (data nyata)</p>
        </>
      ) : (
        <p className="py-6 text-center text-xs text-gray-400">Belum cukup data untuk rentang ini.</p>
      )}
    </div>
  );
}

// ── Panel AI (Fase 1) ────────────────────────────────────────────────────────
function AiPanel({ kpi, papanRows, currentJpNow, theme }: { kpi: BerandaKioskProps['kpi']; papanRows: PapanRow[]; currentJpNow: number; theme: KioskTheme }) {
  const [question, setQuestion] = useState('');
  const insights: { icon: React.ReactNode; text: string }[] = [];
  if (currentJpNow > 0) {
    const noClass = papanRows.filter((r) => !r.cells[currentJpNow - 1]).length;
    if (noClass > 0) insights.push({ icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />, text: `${noClass} rombel tanpa jadwal di JP-${currentJpNow}.` });
  }
  if (kpi.studentDelta !== null && kpi.studentDelta < 0) insights.push({ icon: <TrendingDown className="w-3.5 h-3.5 text-red-500" />, text: `Kehadiran siswa turun ${Math.abs(kpi.studentDelta).toFixed(1)}% vs kemarin.` });
  if (insights.length === 0) insights.push({ icon: <Lightbulb className="w-3.5 h-3.5 text-emerald-600" />, text: 'Kondisi terpantau normal dari data hari ini.' });
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    window.location.href = `/dashboard/ai?q=${encodeURIComponent(question)}`;
  };
  return (
    <div className="rounded-2xl border shadow-soft-sm p-4 flex flex-col h-full" style={{ borderColor: theme.ring, background: `linear-gradient(180deg, ${theme.soft}, #fff)` }}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold flex items-center gap-1.5 text-sm" style={{ color: theme.ink }}><Sparkles className="w-4 h-4" style={{ color: theme.ac }} /> Asisten KBM (AI)</h2>
        <span className="text-[9px] font-bold uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Sebagian Fase 2</span>
      </div>
      <ul className="space-y-1.5 text-[12px] text-gray-700 flex-1">
        {insights.map((it, i) => <li key={i} className="flex gap-1.5"><span className="shrink-0 mt-0.5">{it.icon}</span>{it.text}</li>)}
      </ul>
      <form onSubmit={handleSubmit} className="relative mt-2">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Tanya kondisi hari ini…"
          className="w-full text-[12px] rounded-lg border bg-white px-2.5 py-2 pr-9 focus:outline-none focus:ring-2"
          style={{ borderColor: theme.ring }}
        />
        <button
          type="submit"
          className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md text-white flex items-center justify-center"
          style={{ background: theme.ac }}
          aria-label="Kirim pertanyaan"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
}

// ── Agenda Hari Ini / Upcoming — scrollable, font ringkas, auto-geser saat lewat ─
function endMinOf(time?: string): number {
  if (!time) return 0;
  const m = time.split(/[–-]/)[1]?.trim();
  if (!m) return 0;
  const [h, mm] = m.split(':').map(Number);
  return (h || 0) * 60 + (mm || 0);
}
function mon3(d: Date): string { return (MONTH_NAMES[d.getMonth()] ?? '').slice(0, 3); }

function AgendaPanel({ title, icon, theme, events, empty, showDate = false, autoScroll = false, nowMins = 0 }: {
  title: string; icon: React.ReactNode; theme: KioskTheme; events: KaldikEvent[]; empty: string;
  showDate?: boolean; autoScroll?: boolean; nowMins?: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!autoScroll || !scrollRef.current) return;
    let idx = events.findIndex((e) => { const em = endMinOf(e.time); return em === 0 || em >= nowMins; });
    if (idx < 0) idx = 0;
    const el = scrollRef.current.children[idx] as HTMLElement | undefined;
    if (el) scrollRef.current.scrollTop = el.offsetTop;
  }, [autoScroll, nowMins, events]);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-soft-sm flex flex-col min-h-0 h-full overflow-hidden">
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-gray-100 shrink-0">
        <span style={{ color: theme.ac }}>{icon}</span><h2 className="font-semibold text-gray-800 text-[13px]">{title}</h2>
      </div>
      {events.length === 0 ? (
        <div className="flex-1 grid place-items-center min-h-[140px]"><p className="text-xs text-gray-400">{empty}</p></div>
      ) : (
        <div ref={scrollRef} className="px-3 overflow-y-auto flex-1 min-h-[140px]">
          {events.map((e) => {
            const meta = EVENT_META[e.type];
            const d = new Date(`${e.date}T00:00:00`);
            const passed = autoScroll && !!e.time && endMinOf(e.time) < nowMins;
            return (
              <div key={e.id} className={clsx('flex gap-2.5 py-2 border-b border-gray-50 last:border-0', passed && 'opacity-50')}>
                {showDate ? (
                  <div className="shrink-0 w-9 text-center rounded-lg py-1 leading-none" style={{ background: meta.soft, color: meta.text }}>
                    <p className="text-sm font-extrabold">{d.getDate()}</p>
                    <p className="text-[8px] font-semibold uppercase">{mon3(d)}</p>
                  </div>
                ) : (
                  <span className="shrink-0 w-1 rounded-full self-stretch" style={{ background: meta.dot }} />
                )}
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-gray-800 leading-snug flex items-start gap-1.5 flex-wrap">
                    <span className="line-clamp-2">{e.name}</span>
                    <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 mt-0.5" style={{ background: meta.soft, color: meta.text }}>{meta.label}</span>
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {e.time ? e.time : (e.date === e.endDate ? `${d.getDate()} ${mon3(d)}` : `${d.getDate()}–${new Date(`${e.endDate}T00:00:00`).getDate()} ${mon3(d)}`)}
                    {e.source ? ` · ${e.source}` : ''}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Popup date-picker rekap kehadiran (poin 7) — data nyata dari API ──
function DatePickerRecap({ kind, theme, events, onClose }: { kind: 'siswa' | 'guru'; theme: KioskTheme; events: KaldikEvent[]; onClose: () => void }) {
  const today = new Date();
  const [cal, setCal] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [sel, setSel] = useState<string[]>([ymd(today)]);
  const [siswa, setSiswa] = useState<StudentRecap | null>(null);
  const [guru, setGuru] = useState<TeacherRecap | null>(null);
  const [loading, startLoad] = useTransition();
  const toggle = (ds: string) => setSel((s) => s.includes(ds) ? s.filter((x) => x !== ds) : [...s, ds].sort());
  const label = kind === 'siswa' ? 'Kehadiran Siswa' : 'Kehadiran Guru';

  useEffect(() => {
    if (sel.length === 0) { setSiswa(null); setGuru(null); return; }
    startLoad(() => {
      if (kind === 'siswa') fetchStudentRecap(sel).then(setSiswa);
      else fetchTeacherRecap(sel).then(setGuru);
    });
  }, [sel, kind]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-gray-900">Rekap {label}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-100 text-gray-400 grid place-items-center" aria-label="Tutup"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-gray-500 mb-3">Pilih satu atau beberapa tanggal (mis. 3, 4, 5). Hari tanpa kegiatan/libur tidak ada datanya.</p>
        <MonthCalendar year={cal.y} month0={cal.m}
          onNav={(d) => setCal((c) => { const x = new Date(c.y, c.m + d, 1); return { y: x.getFullYear(), m: x.getMonth() }; })}
          onJump={(y, m0) => setCal({ y, m: m0 })}
          events={events} todayStr={ymd(today)} accent={theme.ac} selectedDates={sel} onDayClick={toggle} />
        <div className="mt-4 rounded-xl p-3 text-sm" style={{ background: theme.soft }}>
          {sel.length === 0 ? <p className="text-gray-500">Belum ada tanggal dipilih.</p>
            : loading ? <p className="text-gray-500">Memuat rekap…</p>
            : kind === 'siswa' ? (
              !siswa || siswa.total === 0 ? <p className="text-gray-500">Tidak ada data kehadiran pada tanggal terpilih.</p> : (
                <>
                  <p className="font-semibold text-gray-800 mb-1">{siswa.activeDays} hari ada data · {siswa.total} catatan</p>
                  <p className="text-gray-700">Hadir <b style={{ color: theme.ac }}>{siswa.hadirPct ?? '—'}%</b> · Izin {siswa.izin} · Sakit {siswa.sakit} · Alpha {siswa.alpha}</p>
                </>
              )
            ) : (
              !guru || guru.checkins === 0 ? <p className="text-gray-500">Tidak ada presensi guru pada tanggal terpilih.</p> : (
                <p className="text-gray-700"><b style={{ color: theme.ac }}>{guru.checkins}</b> presensi (check-in) guru pada {guru.activeDays} hari terpilih.</p>
              )
            )}
        </div>
      </div>
    </div>
  );
}

// ── Modal KPI dengan drill-down (DATA NYATA) ─────────────────────────────────
function KpiModal({ kind, onClose, papanRows, currentJpNow }: {
  kind: 'siswa' | 'guru' | 'kbm' | 'kosong' | 'silabus'; onClose: () => void; papanRows: PapanRow[]; currentJpNow: number;
}) {
  const [siswa, setSiswa] = useState<TodayStudentAttendance | null>(null);
  const [guru, setGuru] = useState<TodayTeacherAttendance | null>(null);
  const [drillStatus, setDrillStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (drillStatus) setDrillStatus(null); else onClose(); } };
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey);
  }, [drillStatus, onClose]);
  useEffect(() => {
    if (kind === 'siswa') start(() => { fetchTodayStudentAttendance().then(setSiswa); });
    if (kind === 'guru') start(() => { fetchTodayTeacherAttendance().then(setGuru); });
  }, [kind]);

  const title = { siswa: 'Kehadiran Siswa Hari Ini', guru: 'Kehadiran Guru Hari Ini', kbm: 'Kelas Terjadwal Sekarang', kosong: 'Jam Kosong Hari Ini', silabus: 'Ketercapaian Silabus' }[kind];
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-xl max-h-[85vh] overflow-auto bg-white rounded-2xl shadow-xl">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100 sticky top-0 bg-white">
          {drillStatus && <button onClick={() => setDrillStatus(null)} className="w-8 h-8 rounded-lg hover:bg-gray-100 text-gray-500 flex items-center justify-center" aria-label="Kembali"><ArrowLeft className="w-4 h-4" /></button>}
          <h3 className="font-bold text-gray-900 flex-1">{drillStatus ? `Siswa ${STATUS_LABEL[drillStatus]} Hari Ini` : title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-100 text-gray-400 flex items-center justify-center" aria-label="Tutup"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 text-sm text-gray-700">
          {pending && <p className="py-6 text-center text-gray-400">Memuat…</p>}
          {kind === 'siswa' && !pending && siswa && !drillStatus && (
            <>
              <div className="grid grid-cols-4 gap-2 text-center mb-4">
                {(['hadir', 'izin', 'sakit', 'alpha'] as const).map((s) => (
                  <button key={s} onClick={() => s !== 'hadir' && setDrillStatus(s)} className={clsx('rounded-lg py-3 transition', STATUS_BADGE[s], s !== 'hadir' && 'hover:brightness-95 cursor-pointer')}>
                    <p className="text-2xl font-bold">{siswa[s]}</p><p className="text-[11px] opacity-80">{STATUS_LABEL[s]}</p>
                  </button>
                ))}
              </div>
              <div className="rounded-lg bg-gray-50 p-3 text-xs"><b>Resume:</b> {siswa.total} catatan absensi hari ini. {siswa.alpha > 0 ? `${siswa.alpha} alpha — klik kotak Alpha untuk rincian nama.` : 'Tidak ada alpha hari ini.'}</div>
            </>
          )}
          {kind === 'siswa' && drillStatus && siswa && <StudentList items={siswa.absent.filter((a) => a.status === drillStatus)} />}
          {kind === 'guru' && !pending && guru && (
            <>
              <p className="mb-3"><b className="text-2xl text-emerald-700">{guru.hadir}</b> guru sudah check-in hari ini.</p>
              {guru.list.length === 0 ? <p className="text-gray-400">Belum ada guru check-in.</p> : (
                <ul className="divide-y divide-gray-50">
                  {guru.list.map((t, i) => (
                    <li key={i} className="flex items-center justify-between py-2">
                      <div><p className="font-medium text-gray-800">{t.name}</p><p className="text-xs text-gray-400">NIY {t.niy || '—'}</p></div>
                      <span className={clsx('text-xs', t.outsideGeofence ? 'text-amber-600' : 'text-emerald-600')}>{new Date(t.checkInAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}{t.outsideGeofence ? ' · luar area' : ''}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {kind === 'kbm' && (currentJpNow > 0 ? (
            <>
              <p className="mb-2">JP-{currentJpNow} berjalan. Rombel dengan jadwal:</p>
              <ul className="divide-y divide-gray-50">
                {papanRows.filter((r) => r.cells[currentJpNow - 1]).map((r) => { const c = r.cells[currentJpNow - 1]!; return <li key={r.classId} className="flex justify-between py-2"><span className="font-medium text-gray-800">{r.className}</span><span className="text-xs text-gray-500">{c.subject} · {c.teacher}</span></li>; })}
                {papanRows.filter((r) => r.cells[currentJpNow - 1]).length === 0 && <li className="py-2 text-gray-400">Tidak ada jadwal di JP ini.</li>}
              </ul>
            </>
          ) : <p className="text-gray-500">Di luar jam pelajaran.</p>)}
          {(kind === 'kosong' || kind === 'silabus') && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
              <b className="text-amber-800 uppercase text-xs">Fase 2 — Modul KBM</b>
              <p className="mt-1 text-gray-700">{kind === 'kosong' ? 'Hitung "jam kosong" akurat butuh pencatatan eksekusi sesi. Belum tersedia di Fase 1 — tidak menampilkan angka palsu.' : 'Ketercapaian silabus butuh model roadmap silabus + sesi terlaksana. Akan hadir di modul KBM.'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StudentList({ items }: { items: { name: string; className: string; status: string; notes: string | null }[] }) {
  if (!items.length) return <p className="py-6 text-center text-gray-400">Tidak ada.</p>;
  return (
    <ul className="divide-y divide-gray-50">
      {items.map((s, i) => (
        <li key={i} className="flex items-center gap-3 py-2.5">
          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-[11px] font-semibold text-gray-500 shrink-0">{s.name.split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase()}</div>
          <div className="flex-1 min-w-0"><p className="font-medium text-gray-800 truncate">{s.name}</p><p className="text-xs text-gray-400">{s.className}{s.notes ? ` · ${s.notes}` : ''}</p></div>
          <span className={clsx('text-[10px] font-bold uppercase px-2 py-0.5 rounded', STATUS_BADGE[s.status])}>{STATUS_LABEL[s.status]}</span>
        </li>
      ))}
    </ul>
  );
}

// ── Session drill-down modal (cell click dari Papan Pembelajaran) ────────────────
function SessionModal({ data, onClose }: { data: { row: PapanRow; jp: number; cell: PapanCell }; onClose: () => void }) {
  const { row, jp, cell } = data;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Sesi ${row.className} JP-${jp}`}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
          <h3 className="font-bold text-gray-900 flex-1">{row.className} · JP-{jp} ({jpStartLabel(jp)})</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-100 text-gray-400 flex items-center justify-center" aria-label="Tutup"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 text-sm text-gray-700 space-y-1.5">
          <p><b>Mapel:</b> {cell.subject}</p>
          <p><b>Guru:</b> {cell.teacher}</p>
          <p><b>Ruang:</b> {cell.room ?? '—'}</p>
          <p className="flex items-center gap-1.5"><b>Status:</b> <span className="font-semibold text-emerald-700 uppercase">Terjadwal</span> <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-700 px-1 rounded">Fase 2</span></p>
          <div className="rounded-lg bg-gray-50 p-3 text-sm mt-3">
            <b>Resume:</b> KBM terjadwal untuk kelas ini. Status eksekusi real-time (terisi/tugas/kosong) akan tersedia di modul KBM Fase 2.
          </div>
        </div>
      </div>
    </div>
  );
}

// P5 (S-14): Absen per JP drill-down — honest empty-state until KBM per-JP module
function AbsenJpModal({ jp, onClose }: { jp: number; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // P5: Per-JP absence data would come from real attendance linked to JP slots
  const students: { name: string; className: string; status: string; notes: string }[] = [];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Tidak hadir JP-${jp}`}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
          <h3 className="font-bold text-gray-900 flex-1">Tidak Hadir · JP-{jp} ({jpStartLabel(jp)})</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-100 text-gray-400 flex items-center justify-center" aria-label="Tutup"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 text-sm text-gray-700">
          <p className="text-xs text-gray-400 mb-3">Siswa tanpa kehadiran tercatat pada jam pelajaran ini. <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Fase 2</span></p>
          {students.length === 0 ? (
            <p className="py-6 text-center text-gray-400">Tidak ada data.</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {students.map((s, i) => (
                <li key={i} className="flex items-center gap-3 py-2.5">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-[11px] font-semibold text-gray-500 shrink-0">{s.name.split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase()}</div>
                  <div className="flex-1 min-w-0"><p className="font-medium text-gray-800 truncate">{s.name}</p><p className="text-xs text-gray-400">{s.className} · {s.notes}</p></div>
                  <span className={clsx('text-[10px] font-bold uppercase px-2 py-0.5 rounded', STATUS_BADGE[s.status])}>{STATUS_LABEL[s.status]}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
