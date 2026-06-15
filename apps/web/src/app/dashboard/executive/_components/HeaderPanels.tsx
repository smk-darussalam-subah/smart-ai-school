'use client';

import { Activity, BarChart3, ClipboardCheck, GraduationCap, Users, Wallet } from 'lucide-react';
import clsx from 'clsx';
import { Card, yScale } from './ui';
import type { Kpi, KioskHealth } from '../types';

// ── Gauge Indeks Kesehatan Sekolah ───────────────────────────────────────────
export function GaugeHealth({ health }: { health: KioskHealth }) {
  const score = health.score;
  const label = score === null ? '—' : score >= 80 ? 'BAIK' : score >= 65 ? 'CUKUP' : 'PERLU PERHATIAN';
  const up = (health.delta ?? 0) >= 0;
  return (
    <Card title="Indeks Kesehatan Sekolah" subtitle="Gabungan pilar tersedia" icon={Activity} level="soon" className="col-span-12 lg:col-span-4">
      <div className="flex items-center gap-5">
        <div>
          <div className="text-[52px] font-extrabold leading-none tracking-tighter text-[#0f2e25]">
            {score ?? '—'}
            <span className="text-lg font-bold text-[#6b8079]">/100</span>
          </div>
          {health.delta !== null && (
            <div
              className={clsx(
                'mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-extrabold',
                up ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600',
              )}
            >
              {up ? '▲' : '▼'} {Math.abs(health.delta)} pt
            </div>
          )}
          <div className="mt-2 text-[11.5px] font-extrabold text-emerald-700">{label}</div>
        </div>
        <div className="flex flex-1 flex-col gap-2">
          {health.pilars.map((p) => (
            <div key={p.label} className="grid grid-cols-[96px_1fr_30px] items-center gap-2 text-[11.5px] font-semibold text-[#355a4e]">
              <span className="truncate">{p.label}</span>
              <span className="h-[7px] overflow-hidden rounded-md bg-[#eef3f0]">
                <span
                  className="block h-full rounded-md"
                  style={{
                    width: `${p.pct ?? 0}%`,
                    background: p.pct === null ? '#cbd5e1' : 'linear-gradient(90deg,#34d399,#059669)',
                  }}
                />
              </span>
              <span className="text-right tabular-nums">{p.pct === null ? '—' : p.pct}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

// ── KPI strip ────────────────────────────────────────────────────────────────
function Spark({ pts }: { pts: number[] }) {
  if (pts.length < 2) return null;
  const W = 78;
  const H = 30;
  const min = Math.min(...pts) - 1;
  const max = Math.max(...pts) + 1;
  const y = yScale(min, max, H, 3);
  const x = (i: number) => (i * W) / (pts.length - 1);
  const d = pts.map((p, i) => `${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="absolute bottom-3 right-3 h-[30px] w-[78px]">
      <polyline points={d} fill="none" stroke="#059669" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface KpiItem {
  label: string;
  icon: typeof Users;
  value: string;
  delta?: number | null;
  spark?: number[];
}

export function KpiStrip({ kpi }: { kpi: Kpi }) {
  const items: KpiItem[] = [
    { label: 'Kehadiran Siswa', icon: Users, value: kpi.studentPct !== null ? `${kpi.studentPct}%` : '—', delta: kpi.studentDelta, spark: kpi.studentSpark },
    { label: 'Kehadiran Guru', icon: ClipboardCheck, value: kpi.teacherPct !== null ? `${kpi.teacherPct}%` : '—' },
    { label: 'Rata² Nilai', icon: GraduationCap, value: kpi.avgGrade !== null ? `${kpi.avgGrade}` : '—' },
    { label: 'Kolektibilitas SPP', icon: Wallet, value: kpi.sppCollectedPct !== null ? `${kpi.sppCollectedPct}%` : '—' },
    { label: 'Konversi PPDB', icon: BarChart3, value: kpi.ppdbConversion !== null ? `${kpi.ppdbConversion}%` : '—' },
  ];
  return (
    <Card title="KPI Utama" subtitle="Pilar strategis sekolah" icon={BarChart3} level="real" className="col-span-12 lg:col-span-8">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {items.map((it) => {
          const Icon = it.icon;
          const up = (it.delta ?? 0) >= 0;
          return (
            <div key={it.label} className="relative rounded-xl border border-[#e3ece8] bg-white p-3.5 shadow-[0_1px_2px_rgba(16,40,33,.04)]">
              <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[#6b8079]">
                <Icon className="h-3.5 w-3.5 text-emerald-600" />
                {it.label}
              </div>
              <div className="mt-1.5 text-[27px] font-extrabold tracking-tight text-[#0f2e25]">{it.value}</div>
              {it.delta !== undefined && it.delta !== null && (
                <div className={clsx('text-[11px] font-extrabold', up ? 'text-emerald-600' : 'text-rose-600')}>
                  {up ? '▲' : '▼'} {Math.abs(it.delta)}
                </div>
              )}
              {it.spark && <Spark pts={it.spark} />}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
