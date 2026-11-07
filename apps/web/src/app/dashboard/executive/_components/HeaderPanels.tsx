'use client';
import React from 'react';
import {
  Activity,
  BarChart3,
  ClipboardCheck,
  GraduationCap,
  Minus,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import clsx from 'clsx';
import { Card } from './ui';
import type { Kpi, KioskHealth } from '../types';
import type { JpOverview } from '@/lib/session-attendance';
import { attendanceNumber as n, attendanceRangeLabel } from '@/lib/attendance-presentation';

function Delta({ value }: { value: number }) {
  const Icon = value === 0 ? Minus : value < 0 ? TrendingDown : TrendingUp;
  return (
    <span
      className={clsx(
        'mt-2 inline-flex items-center gap-1 text-sm font-medium',
        value < 0
          ? 'text-rose-700 dark:text-rose-300'
          : value === 0
            ? 'text-slate-600 dark:text-slate-300'
            : 'text-emerald-700 dark:text-emerald-300',
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span>
        {value === 0
          ? 'Tidak berubah'
          : `${n(Math.abs(value))} poin ${value < 0 ? 'turun' : 'naik'}`}
      </span>
    </span>
  );
}

export function GaugeHealth({ health }: { health: KioskHealth }) {
  const score = health.score;
  const label =
    score === null
      ? 'Belum tersedia'
      : score >= 80
        ? 'Baik'
        : score >= 65
          ? 'Cukup'
          : 'Perlu perhatian';
  return (
    <Card
      title="Indeks Kesehatan Sekolah"
      subtitle="Gabungan pilar tersedia"
      icon={Activity}
      level="real"
      className="col-span-12 lg:col-span-4"
    >
      <div className="grid min-w-0 gap-5 sm:grid-cols-[100px_minmax(0,1fr)]">
        <div className="min-w-0">
          <p className="text-4xl font-bold tabular-nums text-[#0f2e25] dark:text-slate-100">
            {score === null ? '—' : n(score)}
            <span className="ml-1 text-base font-medium text-slate-600 dark:text-slate-300">
              /100
            </span>
          </p>
          <p className="mt-2 text-sm font-semibold text-emerald-800 dark:text-emerald-200">
            {label}
          </p>
          {health.delta !== null && (
            <div className="mt-3">
              <p className="text-xs text-slate-600 dark:text-slate-300">Perubahan kehadiran JP</p>
              <Delta value={health.delta} />
            </div>
          )}
        </div>
        <dl className="min-w-0 space-y-3">
          {health.pilars.map((p) => (
            <div key={p.label}>
              <div className="flex items-start justify-between gap-3 text-sm">
                <dt className="min-w-0 text-slate-700 dark:text-slate-200">{p.label}</dt>
                <dd className="shrink-0 font-semibold tabular-nums text-slate-950 dark:text-slate-100">
                  {p.pct === null ? '—' : `${n(p.pct)}%`}
                </dd>
              </div>
              <div
                aria-hidden="true"
                className="mt-2 h-1.5 overflow-hidden rounded bg-slate-100 dark:bg-slate-800"
              >
                <div
                  className="h-full rounded bg-emerald-700 dark:bg-emerald-400"
                  style={{ width: `${p.pct ?? 0}%` }}
                />
              </div>
            </div>
          ))}
        </dl>
      </div>
    </Card>
  );
}

export function KpiStrip({ kpi, attendance }: { kpi: Kpi; attendance?: JpOverview | null }) {
  const items = [
    {
      label: 'Kehadiran siswa per JP',
      icon: Users,
      value: kpi.studentPct !== null ? `${n(kpi.studentPct)}%` : '—',
      delta: kpi.studentDelta,
    },
    {
      label: 'Presensi wajib guru',
      icon: ClipboardCheck,
      value: kpi.teacherPct !== null ? `${n(kpi.teacherPct)}%` : '—',
      detail: 'Hari ini',
    },
    {
      label: 'Rata-rata nilai',
      icon: GraduationCap,
      value: kpi.avgGrade !== null ? n(kpi.avgGrade) : '—',
      detail: kpi.avgGrade === null ? 'Belum ada nilai yang dapat ditampilkan' : 'Per entri nilai tercatat',
    },
    {
      label: 'Kolektibilitas SPP',
      icon: Wallet,
      value: kpi.sppCollectedPct !== null ? `${n(kpi.sppCollectedPct)}%` : '—',
      detail: 'Semua tahun dan jurusan',
    },
    {
      label: 'Konversi PPDB',
      icon: BarChart3,
      value: kpi.ppdbConversion !== null ? `${n(kpi.ppdbConversion)}%` : '—',
      detail: 'Seluruh data penerimaan',
    },
  ];
  return (
    <Card
      title="KPI Utama"
      subtitle="Pilar strategis sekolah"
      icon={BarChart3}
      level="real"
      className="col-span-12 lg:col-span-8"
    >
      <dl className="grid grid-cols-2 xl:grid-cols-5">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <div
              key={it.label}
              className="min-w-0 border-b border-[#e3ece8] px-3 py-3 dark:border-slate-700 xl:border-b-0 xl:border-r xl:last:border-r-0"
            >
              <dt className="flex min-h-10 items-start gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                <Icon
                  className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400"
                  aria-hidden="true"
                />
                <span className="min-w-0">{it.label}</span>
              </dt>
              <dd className="mt-2 text-3xl font-bold tabular-nums text-slate-950 dark:text-slate-100">
                {it.value}
              </dd>
              {it.label === 'Kehadiran siswa per JP' ? (
                <div className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                  {attendance ? (
                    <>
                      <p className="tabular-nums">
                        {n(attendance.totals.recorded)}/{n(attendance.totals.expected)} siswa-JP
                        tercatat
                      </p>
                      <p>{attendanceRangeLabel(attendance.from, attendance.to)}</p>
                    </>
                  ) : (
                    <p>Ringkasan JP belum tersedia</p>
                  )}
                </div>
              ) : (
                it.detail && (
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{it.detail}</p>
                )
              )}
              {it.delta !== undefined && it.delta !== null && <Delta value={it.delta} />}
            </div>
          );
        })}
      </dl>
    </Card>
  );
}
