'use client';

import { Activity, BarChart3, ClipboardList } from 'lucide-react';
import { Card, EmptyState, yScale } from './ui';
import type { GradeAnalytics } from '../types';
import { KKTP_DEFAULT } from '@/lib/academic';

function passColor(p: number | null): string {
  if (p === null) return '#e2e8f0';
  if (p < 60) return '#e11d48';
  if (p < 70) return '#d97706';
  if (p < 80) return '#f59e0b';
  if (p < 90) return '#10b981';
  return '#059669';
}

// ── Box-plot distribusi nilai per jurusan ────────────────────────────────────
export function GradeBoxPlot({ grades }: { grades: GradeAnalytics | null }) {
  const rows = grades?.byMajor ?? [];
  const W = 380;
  const H = 200;
  const y = yScale(50, 100, H - 30, 20);
  const kkm = grades?.filters.kkm ?? KKTP_DEFAULT;
  return (
    <Card title="Distribusi Nilai per Jurusan" subtitle="Median, kuartil & sebaran" icon={BarChart3} level="soon" className="col-span-12 lg:col-span-5">
      {rows.length === 0 ? (
        <EmptyState label="Belum ada nilai pada periode ini" />
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          {[100, 85, 70, 55].map((g) => (
            <g key={g}>
              <line x1={40} y1={y(g)} x2={W - 8} y2={y(g)} stroke="#eef2f0" />
              <text x={34} y={y(g) + 4} textAnchor="end" className="fill-[#6b8079] text-[10px] font-semibold">{g}</text>
            </g>
          ))}
          <line x1={40} y1={y(kkm)} x2={W - 8} y2={y(kkm)} stroke="#d97706" strokeWidth={1.3} strokeDasharray="4 3" />
          <text x={W - 8} y={y(kkm) - 4} textAnchor="end" className="fill-[#d97706] text-[9px] font-bold">KKM {kkm}</text>
          {rows.map((m, i) => {
            const cx = 80 + i * ((W - 110) / Math.max(1, rows.length));
            return (
              <g key={m.majorCode}>
                <line x1={cx} y1={y(m.max)} x2={cx} y2={y(m.min)} stroke="#047857" strokeWidth={1.4} />
                <rect x={cx - 16} y={y(m.q3)} width={32} height={Math.max(2, y(m.q1) - y(m.q3))} rx={4} fill="#a7f3d0" stroke="#047857" strokeWidth={1.4} />
                <line x1={cx - 16} y1={y(m.median)} x2={cx + 16} y2={y(m.median)} stroke="#065f46" strokeWidth={2.4} />
                <text x={cx} y={H - 14} textAnchor="middle" className="fill-[#6b8079] text-[10px] font-semibold">{m.majorCode}</text>
              </g>
            );
          })}
        </svg>
      )}
    </Card>
  );
}

// ── Scatter korelasi kehadiran ↔ nilai ───────────────────────────────────────
export function ScatterCorrelation({ grades }: { grades: GradeAnalytics | null }) {
  const pts = grades?.correlation.points ?? [];
  const r = grades?.correlation.r ?? 0;
  const W = 300;
  const H = 200;
  const yv = yScale(50, 100, H - 30, 18);
  const xv = (x: number) => 40 + ((Math.max(60, Math.min(100, x)) - 60) / 40) * (W - 52);
  // regresi least-squares dari titik (untuk garis tren)
  let line: { x1: number; y1: number; x2: number; y2: number } | null = null;
  if (pts.length >= 2) {
    const n = pts.length;
    const mx = pts.reduce((s, p) => s + p.x, 0) / n;
    const my = pts.reduce((s, p) => s + p.y, 0) / n;
    let num = 0;
    let den = 0;
    for (const p of pts) {
      num += (p.x - mx) * (p.y - my);
      den += (p.x - mx) ** 2;
    }
    const slope = den ? num / den : 0;
    const intercept = my - slope * mx;
    line = { x1: xv(60), y1: yv(slope * 60 + intercept), x2: xv(100), y2: yv(slope * 100 + intercept) };
  }
  return (
    <Card title="Korelasi Kehadiran ↔ Nilai" subtitle={`r = ${r} · kehadiran prediktor prestasi`} icon={Activity} level="soon" className="col-span-12 lg:col-span-4">
      {pts.length === 0 ? (
        <EmptyState label="Data belum cukup untuk korelasi" />
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          <line x1={40} y1={18} x2={40} y2={H - 32} stroke="#e3ece8" />
          <line x1={40} y1={H - 32} x2={W - 8} y2={H - 32} stroke="#e3ece8" />
          <text x={40} y={H - 16} className="fill-[#6b8079] text-[10px] font-semibold">60%</text>
          <text x={W - 8} y={H - 16} textAnchor="end" className="fill-[#6b8079] text-[10px] font-semibold">100% hadir</text>
          {line && <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke="#059669" strokeWidth={2} strokeDasharray="5 4" opacity={0.8} />}
          {pts.map((p, i) => (
            <circle key={i} cx={xv(p.x)} cy={yv(p.y)} r={3.6} fill="#10b981" opacity={0.8} />
          ))}
        </svg>
      )}
    </Card>
  );
}

// ── Heatmap ketuntasan KKM (jurusan × mapel) ─────────────────────────────────
export function KkmHeatmap({ grades }: { grades: GradeAnalytics | null }) {
  const matrix = grades?.kkmMatrix;
  const get = (major: string, subject: string) =>
    matrix?.cells.find((c) => c.majorCode === major && c.subject === subject)?.passRate ?? null;
  return (
    <Card title="Ketuntasan KKM" subtitle="% lulus · jurusan × mapel" icon={ClipboardList} level="soon" className="col-span-12 lg:col-span-3">
      {!matrix || matrix.majors.length === 0 || matrix.subjects.length === 0 ? (
        <EmptyState label="Belum ada nilai" />
      ) : (
        <table className="w-full border-separate" style={{ borderSpacing: 4 }}>
          <thead>
            <tr>
              <th />
              {matrix.subjects.map((s) => (
                <th key={s} className="pb-1 text-[10px] font-bold text-[#6b8079]" title={s}>
                  {s.slice(0, 4)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.majors.map((m) => (
              <tr key={m}>
                <td className="pr-1.5 text-left text-[10.5px] font-bold text-[#355a4e]">{m}</td>
                {matrix.subjects.map((s) => {
                  const p = get(m, s);
                  return (
                    <td key={s} className="rounded-md px-1 py-2 text-center text-[10.5px] font-bold text-white" style={{ background: passColor(p) }}>
                      {p === null ? '–' : Math.round(p)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
