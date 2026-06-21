'use client';

import { useState } from 'react';
import { TrendingUp, Target, ChevronRight, BookOpen } from 'lucide-react';
import { mpColor, mpIcon, SIM_NILAI } from './siswa-data';
import { KKTP_DEFAULT } from '@/lib/academic';
import type { SiswaScreen } from './SiswaWorkspace';

interface Props {
  grades: any[];
  showToast: (msg: string) => void;
  go: (screen: SiswaScreen) => void;
  setModal: (modal: any) => void;
}

export default function NilaiSiswa({ grades, showToast, go, setModal }: Props) {
  const [selectedMp, setSelectedMp] = useState<string | null>(null);
  
  const displayGrades = grades.length > 0 ? grades : SIM_NILAI;
  const tuntasCount = displayGrades.filter((g: any) => g.rata >= g.kktp).length;
  const avgNilai = Math.round(displayGrades.reduce((a: number, b: any) => a + b.rata, 0) / displayGrades.length * 10) / 10;

  return (
    <div>
      {/* Header Stats */}
      <div className="px-5 py-4">
        <h1 className="text-2xl font-extrabold tracking-tight">Nilai & Capaian</h1>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-center">
            <div className="text-2xl font-extrabold text-emerald-500">{avgNilai}</div>
            <div className="mt-0.5 text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">Rata-rata</div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-center">
            <div className="text-2xl font-extrabold text-violet-500">{tuntasCount}/{displayGrades.length}</div>
            <div className="mt-0.5 text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">Tuntas</div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-center">
            <div className="text-2xl font-extrabold text-amber-500">{KKTP_DEFAULT}</div>
            <div className="mt-0.5 text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">KKTP</div>
          </div>
        </div>
      </div>

      {/* Subject Grade Cards */}
      <div className="px-5 py-2 space-y-3">
        {displayGrades.map((n: any) => {
          const c = mpColor(n.mp);
          const tuntas = n.rata >= n.kktp;
          const isSelected = selectedMp === n.mp;

          return (
            <button
              key={n.mp}
              onClick={() => setSelectedMp(isSelected ? null : n.mp)}
              className="w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] text-left transition-all hover:border-[var(--border2)]"
            >
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-xl"
                      style={{ background: `${c}20`, color: c }}
                    >
                      <span className="text-lg font-extrabold">{(mpIcon(n.mp) || 'book')[0].toUpperCase()}</span>
                    </div>
                    <div>
                      <div className="text-base font-bold">{n.mp}</div>
                      <div className="mt-0.5 text-[11px] font-semibold text-[var(--muted)]">
                        {tuntas ? '✓ Tuntas' : '⚠ Perlu Remedial'} · KKTP {n.kktp}
                      </div>
                    </div>
                  </div>
                  <div className={`text-2xl font-extrabold tracking-tight ${tuntas ? 'text-emerald-400' : 'text-amber-500'}`}>
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

                {/* Component Scores (expandable) */}
                {isSelected && (
                  <div className="mt-3 space-y-2 border-t border-[var(--border)] pt-3">
                    <div className="text-[11px] font-bold text-[var(--muted)] uppercase tracking-wider">Komponen Nilai</div>
                    <div className="grid grid-cols-2 gap-2">
                      {n.scores.map((score: number | undefined, idx: number) => {
                        const labels = ['UH (20%)', 'Praktik (25%)', 'Sikap (15%)', 'UTS (20%)', 'UAS (20%)'];
                        if (!score) return null;
                        return (
                          <div key={idx} className="rounded-lg bg-[var(--surface2)] p-2">
                            <div className="text-[10px] font-semibold text-[var(--muted)]">{labels[idx]}</div>
                            <div className={`text-lg font-extrabold ${score >= n.kktp ? 'text-emerald-400' : 'text-amber-500'}`}>
                              {score}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Trend Indicator */}
                <div className="mt-2 flex items-center gap-2">
                  <span className={`text-[11px] font-bold ${n.trend === 'up' ? 'text-emerald-500' : n.trend === 'down' ? 'text-rose-500' : 'text-[var(--muted)]'}`}>
                    {n.trend === 'up' ? '↑' : n.trend === 'down' ? '↓' : '→'}
                  </span>
                  <span className="text-[11px] font-semibold text-[var(--muted)]">
                    {n.cp} CP tercapai
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer Info */}
      <div className="mx-5 mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs text-[var(--muted)]">
        <div className="flex items-start gap-2">
          <Target className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-[var(--text)]">Cara Hitung Nilai Akhir</div>
            <div className="mt-1">NA = (UH × 20%) + (Praktik × 25%) + (Sikap × 15%) + (UTS × 20%) + (UAS × 20%)</div>
            <div className="mt-2">Nilai dinyatakan <span className="font-bold text-emerald-500">Tuntas</span> jika NA ≥ KKTP ({KKTP_DEFAULT}).</div>
          </div>
        </div>
      </div>
    </div>
  );
}
