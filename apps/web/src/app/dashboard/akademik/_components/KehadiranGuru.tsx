'use client';

// KehadiranGuru — layar Kehadiran Dashboard Guru (W1).
// KPI dari data NYATA /attendance. Rekap per-sesi, attention list & tren = SIMULASI
// (backend /attendance/sessions belum tersedia).

import { useMemo } from 'react';
import { CalendarCheck, Users, Check, Info, UserX, TrendingUp } from 'lucide-react';
import type { AttendanceItem } from '@/lib/api';

interface Props {
  attendances: AttendanceItem[];
  className: string; // '' = semua kelas
}

// ── SIMULASI: Rekap kehadiran per sesi (backend /attendance/sessions belum ada) ──
const SESI_REKAP: [string, string, string, string, number, number, number, number, number, string][] = [
  ['16 Jun', 'Pemrograman Web', 'XI TJKT 1', 'Pert. 5 · TP 3.2', 30, 1, 1, 0, 94, 'Citra: izin keluarga; Joko: sakit demam'],
  ['9 Jun', 'Pemrograman Web', 'XI TJKT 1', 'Pert. 4 · TP 3.2', 31, 1, 0, 0, 97, 'Fajar: izin acara'],
  ['2 Jun', 'Pemrograman Web', 'XI TJKT 1', 'Pert. 3 · TP 3.1', 32, 0, 0, 0, 100, '—'],
  ['26 Mei', 'Pemrograman Web', 'XI TJKT 1', 'Pert. 2 · TP 3.1', 29, 1, 1, 1, 91, 'Fajar: alpha; Eka: sakit; Dimas: izin'],
  ['16 Jun', 'Basis Data', 'XI TJKT 1', 'Pert. 4 · TP 2.1', 30, 0, 2, 0, 94, 'Bunga & Indah: izin lomba'],
  ['15 Jun', 'PBO', 'XII TJKT 1', 'Pert. 6 · TP 4.1', 28, 2, 1, 1, 90, 'Kartika: sakit; Lukman: izin; Hadi: alpha'],
];

const ATT_ATTENTION = [
  { n: 'Fajar Nugroho', k: 'XI TJKT 1', m: 'Pemrograman Web', d: '2 alpha · 1 sakit', c: 'rose' },
  { n: 'Citra Dewi', k: 'XI TJKT 1', m: 'Pemrograman Web', d: '3 izin — keperluan keluarga', c: 'sky' },
  { n: 'Joko Widodo', k: 'XI TJKT 1', m: 'Pemrograman Web', d: '2 sakit berturut', c: 'amber' },
  { n: 'Hadi Santoso', k: 'XII TJKT 1', m: 'PBO', d: '1 alpha tanpa keterangan', c: 'rose' },
];

const ATT_COLOR: Record<string, string> = {
  rose: 'bg-rose-50 text-rose-600',
  sky: 'bg-sky-50 text-sky-700',
  amber: 'bg-amber-50 text-amber-700',
};

// SVG sparkline untuk tren 10 hari (SIMULASI)
const TREND_POINTS = '10,40 78,30 146,46 214,24 282,38 350,20 418,32 486,18 554,28 600,22';

export default function KehadiranGuru({ attendances, className }: Props) {
  // KPI dari data NYATA
  const kpi = useMemo(() => {
    const filtered = className ? attendances.filter((a) => a.class.name === className) : attendances;
    const total = filtered.length || 1;
    const hadir = filtered.filter((a) => a.status === 'hadir').length;
    const izin = filtered.filter((a) => a.status === 'izin').length;
    const sakit = filtered.filter((a) => a.status === 'sakit').length;
    const alpha = filtered.filter((a) => a.status === 'alpha').length;
    const pct = Math.round((hadir / total) * 100);
    return { total: filtered.length, hadir, izin, sakit, alpha, pct };
  }, [attendances, className]);

  const shownAtt = className ? attendances.filter((a) => a.class.name === className) : attendances;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Users} label="Kehadiran" value={`${kpi.pct}%`} />
        <Kpi icon={Check} label="Hadir" value={`${kpi.hadir}`} valueClass="text-emerald-700" />
        <Kpi icon={Info} label="Izin" value={`${kpi.izin}`} valueClass="text-sky-600" />
        <Kpi icon={UserX} label="Alpha" value={`${kpi.alpha}`} valueClass="text-rose-600" />
      </div>

      {/* Rekap per Sesi — SIMULASI */}
      <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]">
          <CalendarCheck className="h-[18px] w-[18px] text-emerald-600" />Rekap Kehadiran per Sesi
        </h3>
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-2.5 py-1 text-[10.5px] font-bold text-sky-700">
          Rekap per-sesi akan tersedia menyusul
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-[#e6efea] bg-[#f9fbfa] text-left text-[10.5px] uppercase tracking-wide text-[#6b8079]">
                <th className="px-3 py-2">Tgl</th>
                <th className="px-3 py-2">Mapel</th>
                <th className="px-3 py-2">Kelas</th>
                <th className="px-3 py-2">Pertemuan</th>
                <th className="px-2 py-2 text-center">H</th>
                <th className="px-2 py-2 text-center">I</th>
                <th className="px-2 py-2 text-center">S</th>
                <th className="px-2 py-2 text-center">A</th>
                <th className="px-2 py-2 text-right">%</th>
                <th className="px-3 py-2">Keterangan</th>
              </tr>
            </thead>
            <tbody>
              {SESI_REKAP.map((s, i) => (
                <tr key={i} className="border-b border-[#f0f4f2] hover:bg-[#f9fbfa]">
                  <td className="px-3 py-2 font-bold text-[#0f2e25]">{s[0]}</td>
                  <td className="px-3 py-2 text-[#355a4e]">{s[1]}</td>
                  <td className="px-3 py-2"><span className="rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">{s[2]}</span></td>
                  <td className="px-3 py-2 text-[#355a4e]">{s[3]}</td>
                  <td className="px-2 py-2 text-center font-bold text-emerald-700">{s[4]}</td>
                  <td className="px-2 py-2 text-center text-sky-600">{s[5]}</td>
                  <td className="px-2 py-2 text-center text-amber-600">{s[6]}</td>
                  <td className="px-2 py-2 text-center text-rose-600">{s[7]}</td>
                  <td className="px-2 py-2 text-right">
                    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${s[8] >= 95 ? 'bg-emerald-50 text-emerald-700' : s[8] >= 90 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-600'}`}>{s[8]}%</span>
                  </td>
                  <td className="px-3 py-2 text-[10px] font-medium text-[#9bb0a8]" style={{ maxWidth: 200 }}>{s[9]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Siswa Perlu Perhatian — SIMULASI */}
      <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]">
          <UserX className="h-[18px] w-[18px] text-emerald-600" />Siswa Perlu Perhatian
        </h3>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {ATT_ATTENTION.map((s, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-[#e6efea] bg-[#f9fbfa] p-3">
              <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${ATT_COLOR[s.c] ?? 'bg-slate-100 text-slate-600'}`}>
                <UserX className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <b className="text-[12.5px] text-[#0f2e25]">{s.n}</b>
                <div className="text-[11px] text-[#6b8079]">
                  <span className="mr-1 rounded bg-sky-50 px-1 py-0.5 text-[9px] font-bold text-sky-700">{s.k}</span>
                  {s.m} · {s.d}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tren Kehadiran — SIMULASI */}
      <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]">
          <TrendingUp className="h-[18px] w-[18px] text-emerald-600" />Tren Kehadiran (10 hari)
        </h3>
        <svg viewBox="0 0 620 100" className="w-full" style={{ marginTop: 8 }}>
          <polyline fill="none" stroke="#059669" strokeWidth={2.5} points={TREND_POINTS} />
          <circle cx={600} cy={22} r={4} fill="#059669" />
        </svg>
        <div className="mt-2 flex justify-between text-[10px] font-semibold text-[#9bb0a8]">
          <span>10 hari lalu</span><span>Hari ini</span>
        </div>
      </div>

      {/* Data NYATA: Raw attendance records */}
      {shownAtt.length > 0 && (
        <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]">
            <CalendarCheck className="h-[18px] w-[18px] text-emerald-600" />Data Absensi (Terverifikasi)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-[#e6efea] bg-[#f9fbfa] text-left text-[11px] uppercase tracking-wide text-[#6b8079]">
                  <th className="px-3 py-2">Siswa</th>
                  <th className="px-3 py-2">Kelas</th>
                  <th className="px-3 py-2">Tanggal</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {shownAtt.slice(0, 50).map((a) => (
                  <tr key={a.id} className="border-b border-[#f0f4f2]">
                    <td className="px-3 py-2.5 font-semibold text-[#0f2e25]">{a.student.user.fullName}</td>
                    <td className="px-3 py-2.5 text-[#355a4e]">{a.class.name}</td>
                    <td className="px-3 py-2.5 text-[#355a4e]">{new Date(a.date).toLocaleDateString('id')}</td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={a.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {shownAtt.length > 50 && (
            <p className="mt-2 text-[11px] text-[#9bb0a8]">Menampilkan 50 dari {shownAtt.length} catatan.</p>
          )}
        </div>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, valueClass }: { icon: typeof Users; label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-2xl border border-[#e6efea] bg-white p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[#6b8079]"><Icon className="h-3.5 w-3.5 text-emerald-600" />{label}</div>
      <div className={`mt-1.5 text-[24px] font-extrabold tracking-tight text-[#0f2e25] ${valueClass ?? ''}`}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = { hadir: 'bg-emerald-50 text-emerald-700', izin: 'bg-sky-50 text-sky-700', sakit: 'bg-amber-50 text-amber-700', alpha: 'bg-rose-50 text-rose-600' };
  return <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold capitalize ${map[status] ?? 'bg-slate-100 text-slate-600'}`}>{status}</span>;
}
