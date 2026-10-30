'use client';

import React from 'react';
import { Activity, BarChart3, ClipboardList } from 'lucide-react';
import { Card, EmptyState, yScale } from './ui';
import type { GradeAnalytics } from '../types';
import { attendanceNumber as n } from '@/lib/attendance-presentation';

function passColor(p: number | null): string {
  if (p === null) return '#e2e8f0';
  if (p < 60) return '#ffe4e6';
  if (p < 70) return '#fef3c7';
  if (p < 80) return '#ffedd5';
  if (p < 90) return '#d1fae5';
  return '#a7f3d0';
}

// ── Box-plot distribusi nilai per jurusan ────────────────────────────────────
export function GradeBoxPlot({ grades }: { grades: GradeAnalytics | null }) {
  const rows = grades?.byMajor ?? [];
  const W = 380;
  const H = 200;
  const y = yScale(0, 100, H - 30, 20);
  return (
    <Card
      title="Distribusi Nilai per Jurusan"
      subtitle="Median, kuartil & sebaran"
      icon={BarChart3}
      level="real"
      className="col-span-12 lg:col-span-5"
    >
      {rows.length === 0 ? (
        <EmptyState
          label={grades ? 'Belum ada nilai pada periode ini' : 'Data nilai belum tersedia'}
        />
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label="Distribusi nilai dari 0 sampai 100 per jurusan"
        >
          {[100, 75, 50, 25, 0].map((g) => (
            <g key={g}>
              <line x1={40} y1={y(g)} x2={W - 8} y2={y(g)} stroke="#eef2f0" />
              <text
                x={34}
                y={y(g) + 4}
                textAnchor="end"
                className="fill-slate-600 text-xs font-semibold dark:fill-slate-300"
              >
                {g}
              </text>
            </g>
          ))}
          {rows.map((m, i) => {
            const cx = 80 + i * ((W - 110) / Math.max(1, rows.length));
            return (
              <g key={m.majorCode}>
                <line
                  x1={cx}
                  y1={y(m.max)}
                  x2={cx}
                  y2={y(m.min)}
                  stroke="#047857"
                  strokeWidth={1.4}
                />
                <rect
                  x={cx - 16}
                  y={y(m.q3)}
                  width={32}
                  height={Math.max(2, y(m.q1) - y(m.q3))}
                  rx={4}
                  fill="#a7f3d0"
                  stroke="#047857"
                  strokeWidth={1.4}
                />
                <line
                  x1={cx - 16}
                  y1={y(m.median)}
                  x2={cx + 16}
                  y2={y(m.median)}
                  stroke="#065f46"
                  strokeWidth={2.4}
                />
                <text
                  x={cx}
                  y={H - 14}
                  textAnchor="middle"
                  className="fill-slate-600 text-xs font-semibold dark:fill-slate-300"
                >
                  {m.majorCode}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      {rows.length > 0 && (
        <details className="mt-3 border-t border-slate-200 dark:border-slate-700">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:text-emerald-200 dark:focus-visible:outline-emerald-400">
            Lihat distribusi nilai
          </summary>
          <div className="overflow-x-auto" tabIndex={0} aria-label="Rincian distribusi nilai">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <caption className="sr-only">
                Distribusi nilai per jurusan, skala 0 sampai 100
              </caption>
              <thead>
                <tr>
                  {['Jurusan', 'Entri', 'Min', 'Q1', 'Median', 'Q3', 'Maks'].map((label) => (
                    <th key={label} scope="col" className="px-2 py-2 font-semibold">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.majorCode}
                    className="border-t border-slate-200 dark:border-slate-700"
                  >
                    <th scope="row" className="px-2 py-2 font-medium">
                      {row.majorCode}
                    </th>
                    {[row.count, row.min, row.q1, row.median, row.q3, row.max].map((value, i) => (
                      <td key={i} className="px-2 py-2 tabular-nums">
                        {n(value)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
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
  const yv = yScale(0, 100, H - 30, 18);
  const xv = (x: number) => 40 + (Math.max(0, Math.min(100, x)) / 100) * (W - 52);
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
    line = {
      x1: xv(0),
      y1: yv(intercept),
      x2: xv(100),
      y2: yv(slope * 100 + intercept),
    };
  }
  return (
    <Card
      title="Korelasi Kehadiran ↔ Nilai"
      subtitle={
        pts.length < 2 ? 'Data korelasi belum cukup' : `r = ${r} · hubungan pada data yang tersedia`
      }
      icon={Activity}
      level="real"
      className="col-span-12 lg:col-span-4"
    >
      {grades?.correlation.basis && <p className="mb-3 text-xs text-slate-600 dark:text-slate-300">
        Absensi harian · {grades.correlation.basis.from} – {grades.correlation.basis.to ?? 'periode belum dimulai'}
      </p>}
      {pts.length === 0 ? (
        <EmptyState label="Data belum cukup untuk korelasi" />
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label="Korelasi kehadiran dan nilai pada skala 0 sampai 100"
        >
          <line x1={40} y1={18} x2={40} y2={H - 32} stroke="#e3ece8" />
          <line x1={40} y1={H - 32} x2={W - 8} y2={H - 32} stroke="#e3ece8" />
          <text
            x={40}
            y={H - 16}
            className="fill-slate-600 text-xs font-semibold dark:fill-slate-300"
          >
            0%
          </text>
          <text
            x={W - 8}
            y={H - 16}
            textAnchor="end"
            className="fill-slate-600 text-xs font-semibold dark:fill-slate-300"
          >
            100% hadir
          </text>
          {line && (
            <line
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke="#059669"
              strokeWidth={2}
              strokeDasharray="5 4"
              opacity={0.8}
            />
          )}
          {pts.map((p, i) => {
            return (
              <circle key={i} cx={xv(p.x)} cy={yv(p.y)} r={3.6} fill="#10b981" opacity={0.8}>
                <title>{`Kehadiran ${p.x}%, Nilai ${p.y}`}</title>
              </circle>
            );
          })}
        </svg>
      )}
      {pts.length > 0 && (
        <details className="mt-3 border-t border-slate-200 dark:border-slate-700">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:text-emerald-200 dark:focus-visible:outline-emerald-400">
            Lihat data korelasi
          </summary>
          <div className="max-h-80 overflow-auto" tabIndex={0} aria-label="Rincian data korelasi">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Pasangan persentase kehadiran dan nilai</caption>
              <thead>
                <tr>
                  <th scope="col" className="py-2 font-semibold">
                    Kehadiran
                  </th>
                  <th scope="col" className="py-2 font-semibold">
                    Nilai
                  </th>
                </tr>
              </thead>
              <tbody>
                {pts.map((point, i) => (
                  <tr key={i} className="border-t border-slate-200 dark:border-slate-700">
                    <td className="py-2 tabular-nums">{n(point.x)}%</td>
                    <td className="py-2 tabular-nums">{n(point.y)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </Card>
  );
}

// ── Heatmap ketuntasan KKTP authoritative (jurusan × mapel) ──────────────────
export function KkmHeatmap({ grades }: { grades: GradeAnalytics | null }) {
  const matrix = grades?.kkmMatrix;
  const fallback = grades?.bySubject?.filter(s => s.kktpProvenance === 'system_default') ?? [];
  const fallbackCount = fallback.reduce((sum, s) => sum + s.count, 0);
  const fallbackValues = [...new Set(fallback.map(s => s.kktp))].filter(v => v !== null).join(', ');
  const get = (major: string, subject: string) =>
    matrix?.cells.find((c) => c.majorCode === major && c.subject === subject)?.passRate ?? null;
  return (
    <Card
      title="Entri nilai mencapai KKTP"
      subtitle="Jurusan × mapel · persentase entri, bukan siswa tuntas"
      icon={ClipboardList}
      level="real"
      className="col-span-12 lg:col-span-3"
    >
      {!matrix || matrix.majors.length === 0 || matrix.subjects.length === 0 ? (
        <EmptyState label={grades ? 'Belum ada nilai' : 'Data nilai belum tersedia'} />
      ) : (
        <>
          <div
            className="min-w-0 overflow-x-auto"
            tabIndex={0}
            aria-label="Tabel ketuntasan per jurusan dan mapel"
          >
            <table className="w-full min-w-[20rem] border-separate" style={{ borderSpacing: 4 }}>
              <caption className="sr-only">
                Persentase entri nilai yang mencapai ambang KKTP per jurusan dan mata pelajaran
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="text-left text-sm font-medium">
                    Jurusan
                  </th>
                  {matrix.subjects.map((s) => (
                    <th
                      key={s}
                      scope="col"
                      className="max-w-40 break-words pb-2 text-sm font-semibold text-slate-700 dark:text-slate-200"
                      title={s}
                    >
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.majors.map((m) => (
                  <tr key={m}>
                    <th
                      scope="row"
                      className="pr-1.5 text-left text-sm font-semibold text-slate-700 dark:text-slate-200"
                    >
                      {m}
                    </th>
                    {matrix.subjects.map((s) => {
                      const p = get(m, s);
                      return (
                        <td
                          key={s}
                          className="rounded px-2 py-3 text-center text-sm font-semibold tabular-nums text-slate-950"
                          style={{ background: passColor(p) }}
                          aria-label={`${m} ${s}: ${p === null ? 'KKTP belum tersedia atau tidak ada data' : `${Math.round(p)}% entri mencapai KKTP`}`}
                        >
                          {p === null ? '–' : Math.round(p)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {fallbackCount > 0 && <p className="mt-3 text-sm text-slate-700 dark:text-slate-200">
            {fallbackCount} dari {grades?.overall.count} entri memakai ambang bawaan{fallbackValues ? ` (${fallbackValues})` : ''}.
          </p>}
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <span className="inline-flex items-center gap-1">
              <i className="h-2.5 w-2.5 rounded-sm" style={{ background: '#e11d48' }} />
              &lt;60
            </span>
            <span className="inline-flex items-center gap-1">
              <i className="h-2.5 w-2.5 rounded-sm" style={{ background: '#d97706' }} />
              60–69
            </span>
            <span className="inline-flex items-center gap-1">
              <i className="h-2.5 w-2.5 rounded-sm" style={{ background: '#f59e0b' }} />
              70–79
            </span>
            <span className="inline-flex items-center gap-1">
              <i className="h-2.5 w-2.5 rounded-sm" style={{ background: '#10b981' }} />
              80–89
            </span>
            <span className="inline-flex items-center gap-1">
              <i className="h-2.5 w-2.5 rounded-sm" style={{ background: '#059669' }} />
              90+
            </span>
          </div>
          <p className="mt-2 text-xs leading-4 text-slate-600 dark:text-slate-300">
            Ambang tiap mata pelajaran mengikuti pengaturannya. Sel abu-abu belum memiliki data
            yang dapat dinilai.
          </p>
        </>
      )}
    </Card>
  );
}
