'use client';

// KehadiranGuru — layar Kehadiran Dashboard Guru (W1).
// KPI + Rekap per-sesi + Siswa Perlu Perhatian + Tren dari data NYATA
// /attendance/sessions. W2-B-1: hardcoded arrays (SESI_REKAP, ATT_ATTENTION,
// TREND_POINTS) dihapus — diganti realData ?? honest-empty-state.

import React, { useEffect, useMemo, useState } from 'react';
import { useBellPeriod } from '@/components/providers/BellPatternProvider';
import type { SummaryReadState } from '@/lib/teacher-summary';
import { attendanceTrend } from '@/lib/learner-attendance';
import {
  CalendarCheck,
  Users,
  Check,
  Info,
  UserX,
  TrendingUp,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import type { AttendanceItem } from '@/lib/api';
import {
  fetchAttendanceSessions,
  type AttendanceSessionItem,
  type AttendanceAttentionItem,
  type AttendanceTrendItem,
} from '../actions';

interface Props {
  attendances: AttendanceItem[];
  className: string; // '' = semua kelas
  classId?: string; // untuk query /attendance/sessions
  academicYear: string;
  semester: number;
  dataState?: SummaryReadState;
}

const ATT_COLOR: Record<string, string> = {
  rose: 'bg-rose-50 text-rose-600',
  sky: 'bg-sky-50 text-sky-700',
  amber: 'bg-amber-50 text-amber-700',
};

const ATTENTION_COLOR = (alphaCount: number) =>
  alphaCount >= 2 ? 'rose' : alphaCount >= 1 ? 'amber' : 'sky';

export default function KehadiranGuru({
  attendances,
  className: _className,
  classId,
  academicYear,
  semester,
  dataState = 'unavailable',
}: Props) {
  const period = useBellPeriod(academicYear, semester).period;
  // KPI dari data NYATA
  const kpi = useMemo(() => {
    const filtered =
      dataState !== 'ready'
        ? []
        : classId
          ? attendances.filter((a) => a.classId === classId)
          : attendances;
    const total = filtered.length || 1;
    const hadir = filtered.filter((a) => a.status === 'hadir').length;
    const izin = filtered.filter((a) => a.status === 'izin').length;
    const sakit = filtered.filter((a) => a.status === 'sakit').length;
    const alpha = filtered.filter((a) => a.status === 'alpha').length;
    const pct = Math.round((hadir / total) * 100);
    return { total: filtered.length, hadir, izin, sakit, alpha, pct };
  }, [attendances, classId, dataState]);

  const shownAtt =
    dataState !== 'ready'
      ? []
      : classId
        ? attendances.filter((a) => a.classId === classId)
        : attendances;

  // W2-B-1: Fetch real sessions/attention/trend data
  const [sessions, setSessions] = useState<AttendanceSessionItem[]>([]);
  const [attention, setAttention] = useState<AttendanceAttentionItem[]>([]);
  const [trend, setTrend] = useState<AttendanceTrendItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setSessions([]);
    setAttention([]);
    setTrend([]);
    if (!period || dataState !== 'ready') {
      setLoading(false);
      setError('Kehadiran pada periode pilihan belum dapat dimuat. Muat ulang halaman.');
      return;
    }
    fetchAttendanceSessions({
      classId: classId || undefined,
      trendDays: 10,
      from: period.startDate.slice(0, 10),
      to: period.endDate.slice(0, 10),
    })
      .then((res) => {
        if (!active) return;
        if (res.success && res.data) {
          setSessions(res.data.sessions);
          setAttention(res.data.attention);
          setTrend(res.data.trend);
        } else {
          setError(res.error ?? 'Gagal memuat rekap kehadiran');
          setSessions([]);
          setAttention([]);
          setTrend([]);
        }
      })
      .catch(() => {
        if (active) setError('Kehadiran belum dapat dimuat. Muat ulang halaman.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [classId, period, dataState]);

  // Build SVG polyline from real trend data
  const chart = useMemo(() => attendanceTrend(trend), [trend]);

  const lastTrend = [...trend].reverse().find((t) => t.pct !== null);

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          icon={Users}
          label="Kehadiran"
          value={dataState === 'ready' && kpi.total ? `${kpi.pct}%` : '—'}
        />
        <Kpi
          icon={Check}
          label="Hadir"
          value={dataState === 'ready' ? `${kpi.hadir}` : '—'}
          valueClass="text-emerald-700"
        />
        <Kpi
          icon={Info}
          label="Izin"
          value={dataState === 'ready' ? `${kpi.izin}` : '—'}
          valueClass="text-sky-600"
        />
        <Kpi
          icon={UserX}
          label="Alpha"
          value={dataState === 'ready' ? `${kpi.alpha}` : '—'}
          valueClass="text-rose-600"
        />
      </div>

      {/* Rekap per Sesi — REAL DATA */}
      <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]">
          <CalendarCheck className="h-[18px] w-[18px] text-emerald-600" />
          Rekap Absensi Harian Kelas
        </h3>
        <p className="mb-3 text-xs leading-5 text-[#355a4e]">
          Satu catatan per siswa per tanggal pada periode pilihan. Data ini bukan absensi per JP
          atau bukti mengikuti suatu mapel.
        </p>
        {loading ? (
          <div className="flex items-center gap-2 rounded-xl bg-[#f9fbfa] px-3 py-6 text-[12px] font-semibold text-[#6b8079]">
            <Loader2 className="h-4 w-4 animate-spin text-emerald-600" /> Memuat rekap kehadiran...
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-4 text-[12px] font-semibold text-rose-600">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          </div>
        ) : sessions.length === 0 ? (
          <div className="grid h-20 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] font-medium text-[#9bb0a8]">
            Belum ada catatan absensi harian pada periode dan kelas pilihan.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-[#e6efea] bg-[#f9fbfa] text-left text-[10.5px] uppercase tracking-wide text-[#6b8079]">
                  <th className="px-3 py-2">Tgl</th>
                  <th className="px-3 py-2">Jenis catatan</th>
                  <th className="px-3 py-2">Kelas</th>
                  <th className="px-2 py-2 text-center">H</th>
                  <th className="px-2 py-2 text-center">I</th>
                  <th className="px-2 py-2 text-center">S</th>
                  <th className="px-2 py-2 text-center">A</th>
                  <th className="px-2 py-2 text-right">%</th>
                  <th className="px-3 py-2">Keterangan</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s, i) => (
                  <tr
                    key={`${s.date}-${s.className}-${i}`}
                    className="border-b border-[#f0f4f2] hover:bg-[#f9fbfa]"
                  >
                    <td className="px-3 py-2 font-bold text-[#0f2e25]">{fmtShort(s.date)}</td>
                    <td className="px-3 py-2 text-[#355a4e]">{s.subject}</td>
                    <td className="px-3 py-2">
                      <span className="rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">
                        {s.className}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-center font-bold text-emerald-700">{s.hadir}</td>
                    <td className="px-2 py-2 text-center text-sky-600">{s.izin}</td>
                    <td className="px-2 py-2 text-center text-amber-600">{s.sakit}</td>
                    <td className="px-2 py-2 text-center text-rose-600">{s.alpha}</td>
                    <td className="px-2 py-2 text-right">
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${s.pct >= 95 ? 'bg-emerald-50 text-emerald-700' : s.pct >= 90 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-600'}`}
                      >
                        {s.pct}%
                      </span>
                    </td>
                    <td
                      className="px-3 py-2 text-[10px] font-medium text-[#9bb0a8]"
                      style={{ maxWidth: 200 }}
                    >
                      {s.notes ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Siswa Perlu Perhatian — REAL DATA */}
      <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]">
          <UserX className="h-[18px] w-[18px] text-emerald-600" />
          Siswa Perlu Perhatian
        </h3>
        {error ? (
          <p className="text-xs text-amber-900">
            Data belum dapat dimuat; kebutuhan tindak lanjut belum dapat disimpulkan.
          </p>
        ) : !loading && attention.length === 0 ? (
          <div className="grid h-16 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] font-medium text-[#9bb0a8]">
            Belum ditemukan catatan alpha atau ketidakhadiran berulang pada data yang berhasil
            dimuat.
          </div>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {attention.map((s, i) => {
              const colorKey = ATTENTION_COLOR(s.alphaCount);
              return (
                <div
                  key={`${s.studentName}-${i}`}
                  className="flex items-center gap-3 rounded-xl border border-[#e6efea] bg-[#f9fbfa] p-3"
                >
                  <div
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${ATT_COLOR[colorKey] ?? 'bg-slate-100 text-slate-600'}`}
                  >
                    <UserX className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <b className="text-[12.5px] text-[#0f2e25]">{s.studentName}</b>
                    <div className="text-[11px] text-[#6b8079]">
                      <span className="mr-1 rounded bg-sky-50 px-1 py-0.5 text-[9px] font-bold text-sky-700">
                        {s.className}
                      </span>
                      {s.subject} · {s.reason}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tren Kehadiran — REAL DATA */}
      <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]">
          <TrendingUp className="h-[18px] w-[18px] text-emerald-600" />
          Tren Kehadiran (10 hari)
        </h3>
        {chart.points.length > 0 ? (
          <>
            <svg viewBox="0 0 620 100" className="w-full" style={{ marginTop: 8 }}>
              {chart.segments.map((points, index) => (
                <polyline
                  key={index}
                  fill="none"
                  stroke="#059669"
                  strokeWidth={2.5}
                  points={points}
                />
              ))}
              {chart.points.map((point) => (
                <circle key={point.date} cx={point.x} cy={point.y} r={4} fill="#059669" />
              ))}
            </svg>
            <div className="mt-2 flex justify-between text-[10px] font-semibold text-[#9bb0a8]">
              <span>{trend[0] ? fmtShort(trend[0].date) : 'Awal rentang'}</span>
              {lastTrend && (
                <span>
                  {fmtShort(lastTrend.date)}: {lastTrend.pct}%
                </span>
              )}
            </div>
          </>
        ) : (
          <div className="grid h-16 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] font-medium text-[#9bb0a8]">
            {error
              ? 'Tren kehadiran belum dapat dimuat.'
              : 'Belum ada data tren kehadiran pada rentang pilihan.'}
          </div>
        )}
      </div>

      {/* Data NYATA: Raw attendance records */}
      {shownAtt.length > 0 && (
        <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]">
            <CalendarCheck className="h-[18px] w-[18px] text-emerald-600" />
            Data Absensi (Terverifikasi)
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
                    <td className="px-3 py-2.5 font-semibold text-[#0f2e25]">
                      {a.student.user.fullName}
                    </td>
                    <td className="px-3 py-2.5 text-[#355a4e]">{a.class.name}</td>
                    <td className="px-3 py-2.5 text-[#355a4e]">
                      {new Date(a.date).toLocaleDateString('id')}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={a.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {shownAtt.length > 50 && (
            <p className="mt-2 text-[11px] text-[#9bb0a8]">
              Menampilkan 50 dari {shownAtt.length} catatan.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function fmtShort(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'][d.getUTCMonth()]}`;
}

function Kpi({
  icon: Icon,
  label,
  value,
  valueClass,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-2xl border border-[#e6efea] bg-white p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[#6b8079]">
        <Icon className="h-3.5 w-3.5 text-emerald-600" />
        {label}
      </div>
      <div
        className={`mt-1.5 text-[24px] font-extrabold tracking-tight text-[#0f2e25] ${valueClass ?? ''}`}
      >
        {value}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    hadir: 'bg-emerald-50 text-emerald-700',
    izin: 'bg-sky-50 text-sky-700',
    sakit: 'bg-amber-50 text-amber-700',
    alpha: 'bg-rose-50 text-rose-600',
  };
  return (
    <span
      className={`rounded-md px-2 py-0.5 text-[11px] font-bold capitalize ${map[status] ?? 'bg-slate-100 text-slate-600'}`}
    >
      {status}
    </span>
  );
}
