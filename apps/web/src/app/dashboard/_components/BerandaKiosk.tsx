'use client';

// =============================================================================
// BerandaKiosk (2L-B2) — Beranda "Papan Hari Ini" untuk staf, gaya display
// ruang guru. Jam besar, KPI clickable → modal drill-down (data NYATA via
// server action), Papan Pembelajaran, grafik garis tren + analisis, panel AI
// Fase 1. Item yang butuh data eksekusi per-JP ditandai Fase 2 (tanpa palsu).
// =============================================================================

import { useEffect, useState, useTransition } from 'react';
import clsx from 'clsx';
import {
  Users, UserCheck, Presentation, AlarmClockOff, Target, Sparkles,
  TrendingUp, TrendingDown, AlertTriangle, Lightbulb, MessageCircle, X, ArrowLeft,
} from 'lucide-react';
import PapanPembelajaran, { type PapanRow } from './PapanPembelajaran';
import {
  wibNow, currentJp, jpStatusLabel, wibDateLabel,
} from '@/lib/bell-times';
import {
  fetchTodayStudentAttendance, type TodayStudentAttendance,
  fetchTodayTeacherAttendance, type TodayTeacherAttendance,
} from '../actions';

// ── Tipe data dari server (page.tsx) ─────────────────────────────────────────
export interface KioskChartClass {
  className: string;
  pcts: (number | null)[];
}
export interface BerandaKioskProps {
  firstName: string;
  papanRows: PapanRow[];
  kpi: {
    studentPct: number | null;
    studentDelta: number | null;
    teacherHadir: number | null;
    kelasTerjadwalNow: number | null;
    totalKelas: number | null;
  };
  chart: { classes: KioskChartClass[]; dates: string[] } | null;
}

const STATUS_LABEL: Record<string, string> = { hadir: 'Hadir', izin: 'Izin', sakit: 'Sakit', alpha: 'Alpha' };
const STATUS_BADGE: Record<string, string> = {
  hadir: 'bg-emerald-100 text-emerald-700', izin: 'bg-sky-100 text-sky-700',
  sakit: 'bg-amber-100 text-amber-700', alpha: 'bg-red-100 text-red-700',
};

function fmtPct(v: number | null): string {
  return v === null || v === undefined ? '—' : `${v.toFixed(1)}%`;
}

// =============================================================================
// Komponen
// =============================================================================
export default function BerandaKiosk({ firstName, papanRows, kpi, chart }: BerandaKioskProps) {
  // Jam + status JP (WIB), tick tiap detik.
  const [now, setNow] = useState<{ time: string; date: string; jpStatus: string; jp: number }>(() => ({
    time: '--:--', date: wibDateLabel(), jpStatus: '—', jp: 0,
  }));
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const m = wibNow(d).minutes;
      const wib = new Date(d.getTime() + 7 * 60 * 60 * 1000);
      setNow({
        time: `${String(wib.getUTCHours()).padStart(2, '0')}:${String(wib.getUTCMinutes()).padStart(2, '0')}`,
        date: wibDateLabel(d),
        jpStatus: jpStatusLabel(m),
        jp: currentJp(m),
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Modal
  const [modal, setModal] = useState<null | 'siswa' | 'guru' | 'kbm' | 'kosong' | 'silabus'>(null);

  return (
    <div className="space-y-4">
      {/* Header: sapaan + jam besar di tengah */}
      <div className="grid grid-cols-1 md:grid-cols-3 items-center gap-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Halo, {firstName} 👋</h1>
          <p className="text-sm text-gray-500">Denyut sekolah hari ini.</p>
        </div>
        <div className="text-center leading-none">
          <p className="text-4xl font-extrabold text-gray-900 tracking-tight tabular-nums">{now.time}</p>
          <p className="text-xs text-gray-500 mt-1">
            {now.date} · <span className="text-emerald-700 font-semibold">{now.jpStatus}</span>
          </p>
        </div>
        <div className="hidden md:block" />
      </div>

      {/* KPI cards — clickable → modal */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard icon={<Users className="w-5 h-5" />} tint="bg-emerald-50 text-emerald-700"
          label="Kehadiran Siswa" value={fmtPct(kpi.studentPct)}
          delta={kpi.studentDelta} onClick={() => setModal('siswa')} />
        <KpiCard icon={<UserCheck className="w-5 h-5" />} tint="bg-teal-50 text-teal-700"
          label="Kehadiran Guru" value={kpi.teacherHadir === null ? '—' : `${kpi.teacherHadir}`}
          sub="hadir hari ini" onClick={() => setModal('guru')} />
        <KpiCard icon={<Presentation className="w-5 h-5" />} tint="bg-lime-100 text-lime-700"
          label="Kelas Terjadwal" value={kpi.kelasTerjadwalNow === null ? '—' : `${kpi.kelasTerjadwalNow}${kpi.totalKelas ? `/${kpi.totalKelas}` : ''}`}
          sub={now.jp ? `JP-${now.jp} berjalan` : 'di luar JP'} onClick={() => setModal('kbm')} />
        <KpiCard icon={<AlarmClockOff className="w-5 h-5" />} tint="bg-amber-100 text-amber-700"
          label="Jam Kosong" value="—" fase2 onClick={() => setModal('kosong')} />
        <KpiCard icon={<Target className="w-5 h-5" />} tint="bg-emerald-50 text-emerald-700"
          label="Ketercapaian Silabus" value="—" fase2 onClick={() => setModal('silabus')} />
      </div>

      {/* Papan + kolom kanan (grafik + AI) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <PapanPembelajaran rows={papanRows} dayLabel={now.date.split(',')[0] ?? ''} />
        </div>
        <div className="space-y-4">
          <TrenChart chart={chart} />
          <AiPanel kpi={kpi} papanRows={papanRows} currentJpNow={now.jp} />
        </div>
      </div>

      {modal && <KpiModal kind={modal} onClose={() => setModal(null)} papanRows={papanRows} currentJpNow={now.jp} />}
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────
function KpiCard({ icon, tint, label, value, sub, delta, fase2, onClick }: {
  icon: React.ReactNode; tint: string; label: string; value: string;
  sub?: string; delta?: number | null; fase2?: boolean; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick}
      className={clsx(
        'text-left bg-white rounded-2xl border p-4 shadow-soft-sm transition hover:-translate-y-0.5 hover:shadow-soft-md focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600',
        fase2 ? 'border-dashed border-amber-300 bg-amber-50/40' : 'border-emerald-900/10',
      )}>
      <div className="flex items-start justify-between">
        <span className={clsx('w-10 h-10 rounded-xl flex items-center justify-center', tint)}>{icon}</span>
        {fase2 && <span className="text-[9px] font-bold uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Fase 2</span>}
        {!fase2 && delta !== undefined && delta !== null && (
          <span className={clsx('inline-flex items-center gap-0.5 text-xs font-semibold', delta >= 0 ? 'text-emerald-600' : 'text-red-600')}>
            {delta >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {delta >= 0 ? '+' : ''}{delta.toFixed(1)}%
          </span>
        )}
      </div>
      <p className={clsx('text-2xl font-extrabold mt-3 leading-none', fase2 ? 'text-amber-400' : 'text-gray-900')}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}{sub ? ` · ${sub}` : ''}</p>
    </button>
  );
}

// ── Grafik garis tren per kelas + analisis ───────────────────────────────────
const LINE_COLORS = ['#059669', '#0ea5e9', '#f59e0b', '#8b5cf6', '#ec4899'];
function TrenChart({ chart }: { chart: BerandaKioskProps['chart'] }) {
  const classes = (chart?.classes ?? []).slice(0, 5);
  const n = chart?.dates.length ?? 0;
  const W = 320, H = 90, pad = 6, min = 60, max = 100;
  const x = (i: number) => (n <= 1 ? pad : pad + i * ((W - 2 * pad) / (n - 1)));
  const y = (v: number) => H - pad - ((Math.max(min, Math.min(max, v)) - min) / (max - min)) * (H - 2 * pad);

  // Analisis sederhana (aturan, bukan AI): tren rerata + kelas menurun.
  const analysis = (() => {
    if (!classes.length || n < 2) return 'Belum cukup data untuk analisis tren.';
    let declining: string | null = null;
    for (const c of classes) {
      const valid = c.pcts.filter((p): p is number => p !== null);
      if (valid.length >= 2 && valid[valid.length - 1]! < valid[0]! - 5) { declining = c.className; break; }
    }
    return declining
      ? `Perlu perhatian: kehadiran ${declining} cenderung menurun pekan ini.`
      : 'Tren kehadiran relatif stabil pekan ini.';
  })();

  return (
    <div className="bg-white rounded-2xl border border-emerald-900/10 shadow-soft-sm p-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold text-gray-800 text-sm">Tren Kehadiran · per Kelas</h2>
        <span className="text-[10px] text-gray-400">{n} hari</span>
      </div>
      {classes.length === 0 ? (
        <p className="py-6 text-center text-xs text-gray-400">Belum ada data kehadiran.</p>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-24">
            {[60, 80, 100].map((g) => (
              <line key={g} x1={pad} y1={y(g)} x2={W - pad} y2={y(g)} stroke="#eef2f0" strokeWidth={1} />
            ))}
            {classes.map((c, ci) => {
              const pts = c.pcts.map((p, i) => (p === null ? null : `${x(i).toFixed(1)} ${y(p).toFixed(1)}`)).filter((s): s is string => s !== null);
              if (pts.length < 2) return null;
              return <polyline key={c.className} points={pts.join(' ')} fill="none" stroke={LINE_COLORS[ci % LINE_COLORS.length]} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />;
            })}
          </svg>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[10px]">
            {classes.map((c, ci) => (
              <span key={c.className} className="flex items-center gap-1">
                <span className="w-3 h-0.5 inline-block" style={{ background: LINE_COLORS[ci % LINE_COLORS.length] }} />{c.className}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-gray-500 mt-1 leading-snug"><b className="text-gray-700">Analisis:</b> {analysis}</p>
        </>
      )}
    </div>
  );
}

// ── Panel AI (Fase 1: insight aturan dari data nyata + tautan tanya) ─────────
function AiPanel({ kpi, papanRows, currentJpNow }: { kpi: BerandaKioskProps['kpi']; papanRows: PapanRow[]; currentJpNow: number }) {
  const insights: { icon: React.ReactNode; text: string }[] = [];
  if (currentJpNow > 0) {
    const noClass = papanRows.filter((r) => !r.cells[currentJpNow - 1]).length;
    if (noClass > 0) insights.push({ icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />, text: `${noClass} rombel tanpa jadwal di JP-${currentJpNow}.` });
  }
  if (kpi.studentDelta !== null && kpi.studentDelta < 0) {
    insights.push({ icon: <TrendingDown className="w-3.5 h-3.5 text-red-500" />, text: `Kehadiran siswa turun ${Math.abs(kpi.studentDelta).toFixed(1)}% vs kemarin.` });
  }
  if (insights.length === 0) insights.push({ icon: <Lightbulb className="w-3.5 h-3.5 text-emerald-600" />, text: 'Kondisi terpantau normal dari data hari ini.' });

  return (
    <div className="rounded-2xl border border-emerald-200 shadow-soft-sm p-4 flex flex-col" style={{ background: 'linear-gradient(180deg,#ecfdf5,#fff)' }}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold text-emerald-900 flex items-center gap-1.5 text-sm"><Sparkles className="w-4 h-4 text-emerald-700" /> Asisten KBM (AI)</h2>
        <span className="text-[9px] font-bold uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Sebagian Fase 2</span>
      </div>
      <ul className="space-y-1.5 text-[12px] text-gray-700 flex-1">
        {insights.map((it, i) => (<li key={i} className="flex gap-1.5"><span className="shrink-0 mt-0.5">{it.icon}</span>{it.text}</li>))}
      </ul>
      <a href="/dashboard/ai" className="mt-2 flex items-center justify-center gap-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg py-2">
        <MessageCircle className="w-4 h-4" /> Tanya Asisten AI
      </a>
    </div>
  );
}

// ── Modal KPI dengan drill-down (level 2 via state internal) ──────────────────
function KpiModal({ kind, onClose, papanRows, currentJpNow }: {
  kind: 'siswa' | 'guru' | 'kbm' | 'kosong' | 'silabus'; onClose: () => void;
  papanRows: PapanRow[]; currentJpNow: number;
}) {
  const [siswa, setSiswa] = useState<TodayStudentAttendance | null>(null);
  const [guru, setGuru] = useState<TodayTeacherAttendance | null>(null);
  const [drillStatus, setDrillStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { drillStatus ? setDrillStatus(null) : onClose(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
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
          {drillStatus && (
            <button onClick={() => setDrillStatus(null)} className="w-8 h-8 rounded-lg hover:bg-gray-100 text-gray-500 flex items-center justify-center" aria-label="Kembali"><ArrowLeft className="w-4 h-4" /></button>
          )}
          <h3 className="font-bold text-gray-900 flex-1">{drillStatus ? `Siswa ${STATUS_LABEL[drillStatus]} Hari Ini` : title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-100 text-gray-400 flex items-center justify-center" aria-label="Tutup"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 text-sm text-gray-700">
          {pending && <p className="py-6 text-center text-gray-400">Memuat…</p>}

          {/* SISWA */}
          {kind === 'siswa' && !pending && siswa && !drillStatus && (
            <>
              <div className="grid grid-cols-4 gap-2 text-center mb-4">
                {(['hadir', 'izin', 'sakit', 'alpha'] as const).map((s) => (
                  <button key={s} onClick={() => s !== 'hadir' && setDrillStatus(s)}
                    className={clsx('rounded-lg py-3 transition', STATUS_BADGE[s], s !== 'hadir' && 'hover:brightness-95 cursor-pointer')}>
                    <p className="text-2xl font-bold">{siswa[s]}</p><p className="text-[11px] opacity-80">{STATUS_LABEL[s]}</p>
                  </button>
                ))}
              </div>
              <div className="rounded-lg bg-gray-50 p-3 text-xs"><b>Resume:</b> {siswa.total} catatan absensi hari ini. {siswa.alpha > 0 ? `${siswa.alpha} alpha — klik kotak Alpha untuk rincian nama.` : 'Tidak ada alpha hari ini.'}</div>
            </>
          )}
          {kind === 'siswa' && drillStatus && siswa && (
            <StudentList items={siswa.absent.filter((a) => a.status === drillStatus)} />
          )}

          {/* GURU */}
          {kind === 'guru' && !pending && guru && (
            <>
              <p className="mb-3"><b className="text-2xl text-emerald-700">{guru.hadir}</b> guru sudah check-in hari ini.</p>
              {guru.list.length === 0 ? <p className="text-gray-400">Belum ada guru check-in.</p> : (
                <ul className="divide-y divide-gray-50">
                  {guru.list.map((t, i) => (
                    <li key={i} className="flex items-center justify-between py-2">
                      <div><p className="font-medium text-gray-800">{t.name}</p><p className="text-xs text-gray-400">NIP {t.nip || '—'}</p></div>
                      <span className={clsx('text-xs', t.outsideGeofence ? 'text-amber-600' : 'text-emerald-600')}>
                        {new Date(t.checkInAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}{t.outsideGeofence ? ' · luar area' : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {/* KBM */}
          {kind === 'kbm' && (
            currentJpNow > 0 ? (
              <>
                <p className="mb-2">JP-{currentJpNow} berjalan. Rombel dengan jadwal:</p>
                <ul className="divide-y divide-gray-50">
                  {papanRows.filter((r) => r.cells[currentJpNow - 1]).map((r) => {
                    const c = r.cells[currentJpNow - 1]!;
                    return <li key={r.classId} className="flex justify-between py-2"><span className="font-medium text-gray-800">{r.className}</span><span className="text-xs text-gray-500">{c.subject} · {c.teacher}</span></li>;
                  })}
                  {papanRows.filter((r) => r.cells[currentJpNow - 1]).length === 0 && <li className="py-2 text-gray-400">Tidak ada jadwal di JP ini.</li>}
                </ul>
              </>
            ) : <p className="text-gray-500">Di luar jam pelajaran.</p>
          )}

          {/* Fase 2 placeholders */}
          {(kind === 'kosong' || kind === 'silabus') && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
              <b className="text-amber-800 uppercase text-xs">Fase 2 — Modul KBM</b>
              <p className="mt-1 text-gray-700">{kind === 'kosong'
                ? 'Hitung "jam kosong" akurat butuh pencatatan eksekusi sesi (guru menandai terisi/tugas/kosong). Belum tersedia di Fase 1 — tidak ditampilkan angka palsu.'
                : 'Ketercapaian silabus butuh model roadmap silabus + sesi terlaksana. Akan hadir di modul KBM.'}</p>
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
          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-[11px] font-semibold text-gray-500 shrink-0">
            {s.name.split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-800 truncate">{s.name}</p>
            <p className="text-xs text-gray-400">{s.className}{s.notes ? ` · ${s.notes}` : ''}</p>
          </div>
          <span className={clsx('text-[10px] font-bold uppercase px-2 py-0.5 rounded', STATUS_BADGE[s.status])}>{STATUS_LABEL[s.status]}</span>
        </li>
      ))}
    </ul>
  );
}
