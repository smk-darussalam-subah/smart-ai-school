'use client';

import { useState } from 'react';
import { Target, FileText, X } from 'lucide-react';
import { mpColor, mpIcon, SIM_NILAI } from './siswa-data';
import { KKTP_DEFAULT } from '@/lib/academic';
import type { SiswaNilai } from './siswa-types';

interface Props {
  grades: SiswaNilai[];
  showToast: (msg: string) => void;
}

type Filter = 'all' | 'tuntas' | 'remedial';

export default function NilaiSiswa({ grades, showToast }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [detailGrade, setDetailGrade] = useState<SiswaNilai | null>(null);

  const displayGrades = grades.length > 0 ? grades : SIM_NILAI;
  const isSimData = grades.length === 0;
  const tuntasCount = displayGrades.filter((g) => g.rata >= g.kktp).length;
  const remedialCount = displayGrades.length - tuntasCount;
  const avgNilai =
    Math.round(
      (displayGrades.reduce((a: number, b) => a + b.rata, 0) / displayGrades.length) * 10,
    ) / 10;

  const filteredGrades = displayGrades.filter((g) => {
    const tuntas = g.rata >= g.kktp;
    if (filter === 'tuntas') return tuntas;
    if (filter === 'remedial') return !tuntas;
    return true;
  });

  return (
    <div>
      {/* Header Stats */}
      <div className="px-5 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold tracking-tight">Nilai &amp; Capaian</h1>
          <button
            onClick={() => showToast('Rapor akan tersedia di akhir semester (simulasi)')}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-bold text-[var(--text)] transition-colors hover:bg-[var(--surface2)]"
          >
            <FileText className="h-3.5 w-3.5" />
            Rapor
          </button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-center">
            <div className="text-2xl font-extrabold text-emerald-500">{avgNilai}</div>
            <div className="mt-0.5 text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">
              Rata-rata
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-center">
            <div className="text-2xl font-extrabold text-violet-500">
              {tuntasCount}/{displayGrades.length}
            </div>
            <div className="mt-0.5 text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">
              Tuntas
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-center">
            <div className="text-2xl font-extrabold text-amber-500">{KKTP_DEFAULT}</div>
            <div className="mt-0.5 text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">
              KKTP
            </div>
          </div>
        </div>
      </div>

      {/* Data Simulasi badge — shown when SIM fallback active */}
      {isSimData && (
        <div className="mx-5 mb-2 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] font-bold text-amber-500">
          <span>🧪</span> Data Simulasi — Nilai belum tersedia dari server
        </div>
      )}

      {/* Filter Tabs */}
      <div className="sticky top-[57px] z-10 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-2">
        <div className="flex gap-2">
          {(
            [
              { key: 'all' as Filter, label: 'Semua', count: displayGrades.length },
              { key: 'tuntas' as Filter, label: 'Tuntas', count: tuntasCount },
              { key: 'remedial' as Filter, label: 'Remedial', count: remedialCount },
            ]
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                filter === tab.key
                  ? 'bg-emerald-500 text-white'
                  : 'bg-[var(--surface2)] text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      </div>

      {/* Subject Grade Cards */}
      <div className="space-y-3 px-5 py-3">
        {filteredGrades.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--muted)]">
            Tidak ada mata pelajaran pada kategori ini.
          </div>
        ) : (
          filteredGrades.map((n: SiswaNilai) => {
            const c = mpColor(n.mp);
            const tuntas = n.rata >= n.kktp;

            return (
              <button
                key={n.mp}
                onClick={() => setDetailGrade(n)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--border2)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-xl"
                      style={{ background: `${c}20`, color: c }}
                    >
                      <span className="text-lg font-extrabold">
                        {(mpIcon(n.mp) || 'book').charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <div className="text-base font-bold">{n.mp}</div>
                      <div className="mt-0.5 text-[11px] font-semibold text-[var(--muted)]">
                        {tuntas ? '✓ Tuntas' : '⚠ Perlu Remedial'} · KKTP {n.kktp}
                      </div>
                    </div>
                  </div>
                  <div
                    className={`text-2xl font-extrabold tracking-tight ${
                      tuntas ? 'text-emerald-400' : 'text-amber-500'
                    }`}
                  >
                    {n.rata}
                  </div>
                </div>

                {/* Score Bar */}
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--bar-bg)]">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${n.rata}%`,
                      background: tuntas
                        ? 'linear-gradient(90deg, #10b981, #059669)'
                        : 'linear-gradient(90deg, #fbbf24, #d97706)',
                    }}
                  />
                </div>

                {/* Trend Indicator */}
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className={`text-[11px] font-bold ${
                      n.trend === 'up'
                        ? 'text-emerald-500'
                        : n.trend === 'down'
                          ? 'text-rose-500'
                          : 'text-[var(--muted)]'
                    }`}
                  >
                    {n.trend === 'up' ? '↑' : n.trend === 'down' ? '↓' : '→'}
                  </span>
                  <span className="text-[11px] font-semibold text-[var(--muted)]">
                    {n.cp} CP tercapai
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Footer Info */}
      <div className="mx-5 mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs text-[var(--muted)]">
        <div className="flex items-start gap-2">
          <Target className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <div className="font-bold text-[var(--text)]">Cara Hitung Nilai Akhir</div>
            <div className="mt-1">
              NA = (UH × 20%) + (Praktik × 25%) + (Sikap × 15%) + (UTS × 20%) + (UAS × 20%)
            </div>
            <div className="mt-2">
              Nilai dinyatakan <span className="font-bold text-emerald-500">Tuntas</span> jika NA ≥
              KKTP ({KKTP_DEFAULT}).
            </div>
          </div>
        </div>
      </div>

      {/* Grade Detail Modal */}
      {detailGrade && (
        <GradeDetailModal grade={detailGrade} onClose={() => setDetailGrade(null)} />
      )}
    </div>
  );
}

// ── GradeDetailModal ──────────────────────────────────────────────────────

function GradeDetailModal({ grade, onClose }: { grade: SiswaNilai; onClose: () => void }) {
  const c = mpColor(grade.mp);
  const tuntas = grade.rata >= grade.kktp;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - grade.rata / 100);
  const labels = ['UH (20%)', 'Praktik (25%)', 'Sikap (15%)', 'UTS (20%)', 'UAS (20%)'];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl"
              style={{ background: `${c}20`, color: c }}
            >
              <span className="text-xl font-extrabold">
                {(mpIcon(grade.mp) || 'book').charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <div className="text-lg font-bold">{grade.mp}</div>
              <div className="text-xs font-semibold text-[var(--muted)]">
                {tuntas ? '✓ Tuntas' : '⚠ Perlu Remedial'} · KKTP {grade.kktp}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 transition-colors hover:bg-[var(--surface2)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* SVG Ring */}
        <div className="mt-5 flex flex-col items-center">
          <div className="relative h-[120px] w-[120px]">
            <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke="var(--bar-bg)"
                strokeWidth="8"
              />
              <circle
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke={tuntas ? '#10b981' : '#f59e0b'}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className={`text-3xl font-extrabold ${
                  tuntas ? 'text-emerald-400' : 'text-amber-500'
                }`}
              >
                {grade.rata}
              </span>
              <span className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">
                Nilai Akhir
              </span>
            </div>
          </div>
        </div>

        {/* Component Breakdown */}
        <div className="mt-5">
          <div className="mb-2 text-[11px] font-bold text-[var(--muted)] uppercase tracking-wider">
            Komponen Nilai
          </div>
          <div className="grid grid-cols-1 gap-2">
            {grade.scores.map((score: number | undefined, idx: number) => {
              if (!score) return null;
              const scoreTuntas = score >= grade.kktp;
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-lg bg-[var(--surface2)] px-3 py-2"
                >
                  <span className="text-xs font-semibold text-[var(--muted)]">{labels[idx]}</span>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--bar-bg)]">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${score}%`,
                          background: scoreTuntas ? '#10b981' : '#f59e0b',
                        }}
                      />
                    </div>
                    <span
                      className={`text-sm font-extrabold ${
                        scoreTuntas ? 'text-emerald-400' : 'text-amber-500'
                      }`}
                    >
                      {score}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* CP & Trend Info */}
        <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface2)] px-3 py-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[var(--muted)]">CP Tercapai</span>
            <span className="font-bold text-[var(--text)]">{grade.cp} CP</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <span
              className={`text-[11px] font-bold ${
                grade.trend === 'up'
                  ? 'text-emerald-500'
                  : grade.trend === 'down'
                    ? 'text-rose-500'
                    : 'text-[var(--muted)]'
              }`}
            >
              {grade.trend === 'up'
                ? '↑ Tren Naik'
                : grade.trend === 'down'
                  ? '↓ Tren Turun'
                  : '→ Stabil'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
