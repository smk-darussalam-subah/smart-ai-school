'use client';

// SessionAnalysisPanel — U2 Wave 3: Analisis Hasil.
// Displays score distribution, ketuntasan gauge, and per-question item analysis
// (difficulty index + discrimination index) for a completed assessment session.

import { useState, useTransition, useEffect, useMemo } from 'react';
import {
  TrendingUp, Users, GraduationCap, Activity, BarChart3, Loader2,
  AlertTriangle, Target, ArrowUpDown,
} from 'lucide-react';
import clsx from 'clsx';
import { fetchSessionAnalysis } from '../actions';

interface Props {
  sessionId: string;
}

interface AnalysisData {
  session: { id: string; title: string; type: string; status: string };
  summary: {
    totalStudents: number;
    avgScore: number;
    minScore: number;
    maxScore: number;
    medianScore: number;
    ketuntasanPct: number;
    tuntasCount: number;
    belumTuntasCount: number;
  };
  scoreDistribution: Array<{ label: string; count: number }>;
  itemAnalysis: Array<{
    questionIndex: number;
    questionId: string;
    type: string;
    body: string;
    difficultyIndex: number;
    discriminationIndex: number;
    correctCount: number;
    wrongCount: number;
    blankCount: number;
  }>;
}

export default function SessionAnalysisPanel({ sessionId }: Props) {
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, startLoad] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    startLoad(async () => {
      const res = await fetchSessionAnalysis(sessionId);
      if (res.success && res.data) {
        setData(res.data as AnalysisData);
      } else {
        setErr(res.error ?? 'Gagal memuat analisis.');
      }
    });
  }, [sessionId]);

  const maxBucketCount = useMemo(
    () => data ? Math.max(...data.scoreDistribution.map((b) => b.count), 1) : 1,
    [data],
  );

  if (loading) {
    return (
      <div className="grid h-40 place-items-center text-[12.5px] text-[#9bb0a8]">
        <Loader2 className="h-5 w-5 animate-spin" /> Memuat analisis...
      </div>
    );
  }

  if (err) {
    return (
      <div className="flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-700">
        <AlertTriangle className="h-3 w-3" />{err}
      </div>
    );
  }

  if (!data || data.summary.totalStudents === 0) {
    return (
      <div className="grid h-32 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] font-medium text-[#9bb0a8]">
        Belum ada respons yang dikumpulkan untuk analisis.
      </div>
    );
  }

  const s = data.summary;
  const ketuntasanColor = s.ketuntasanPct >= 75 ? 'text-emerald-600' : s.ketuntasanPct >= 50 ? 'text-amber-600' : 'text-rose-600';

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-2">
        <div className="rounded-xl border border-[#e6efea] p-2.5 text-center">
          <Users className="mx-auto h-3.5 w-3.5 text-sky-500" />
          <div className="mt-1 text-[18px] font-extrabold text-[#0f2e25]">{s.totalStudents}</div>
          <div className="text-[9.5px] font-semibold text-[#6b8079]">Siswa</div>
        </div>
        <div className="rounded-xl border border-[#e6efea] p-2.5 text-center">
          <TrendingUp className="mx-auto h-3.5 w-3.5 text-emerald-600" />
          <div className="mt-1 text-[18px] font-extrabold text-emerald-700">{s.avgScore}</div>
          <div className="text-[9.5px] font-semibold text-[#6b8079]">Rata²</div>
        </div>
        <div className="rounded-xl border border-[#e6efea] p-2.5 text-center">
          <Activity className="mx-auto h-3.5 w-3.5 text-violet-500" />
          <div className="mt-1 text-[18px] font-extrabold text-violet-600">{s.medianScore}</div>
          <div className="text-[9.5px] font-semibold text-[#6b8079]">Median</div>
        </div>
        <div className="rounded-xl border border-[#e6efea] p-2.5 text-center">
          <Target className="mx-auto h-3.5 w-3.5 text-amber-500" />
          <div className={clsx('mt-1 text-[18px] font-extrabold', ketuntasanColor)}>{s.ketuntasanPct}%</div>
          <div className="text-[9.5px] font-semibold text-[#6b8079]">Tuntas</div>
        </div>
      </div>

      {/* Min/Max + Tuntas detail */}
      <div className="flex items-center justify-between rounded-lg bg-[#f4f7f5] px-3 py-2 text-[11px] font-semibold text-[#6b8079]">
        <span>Min: <b className="text-[#0f2e25]">{s.minScore}</b></span>
        <span>Max: <b className="text-[#0f2e25]">{s.maxScore}</b></span>
        <span className="text-emerald-700">Tuntas: {s.tuntasCount}/{s.totalStudents}</span>
        <span className="text-rose-600">Belum: {s.belumTuntasCount}/{s.totalStudents}</span>
      </div>

      {/* Score Distribution Bar Chart */}
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-[#6b8079]">
          <BarChart3 className="h-3.5 w-3.5" />Distribusi Nilai
        </div>
        <div className="flex items-end justify-between gap-1.5" style={{ height: '100px' }}>
          {data.scoreDistribution.map((b) => {
            const pct = (b.count / maxBucketCount) * 100;
            const isLow = b.label === '0-50' || b.label === '51-60';
            const isHigh = b.label === '81-90' || b.label === '91-100';
            return (
              <div key={b.label} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] font-bold text-[#0f2e25]">{b.count}</span>
                <div className="flex w-full items-end justify-center" style={{ height: '70px' }}>
                  <div
                    className={clsx(
                      'w-full max-w-[40px] rounded-t-md transition-all',
                      isLow ? 'bg-rose-300' : isHigh ? 'bg-emerald-400' : 'bg-amber-300',
                    )}
                    style={{ height: `${Math.max(pct, 3)}%` }}
                  />
                </div>
                <span className="text-[9px] font-medium text-[#9bb0a8]">{b.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Ketuntasan Gauge */}
      <div className="flex items-center gap-3 rounded-xl border border-[#e6efea] p-3">
        <div className="relative h-16 w-16 shrink-0">
          <svg className="h-16 w-16 -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e6efea" strokeWidth="4" />
            <circle
              cx="18" cy="18" r="15.5" fill="none"
              stroke={s.ketuntasanPct >= 75 ? '#10b981' : s.ketuntasanPct >= 50 ? '#f59e0b' : '#ef4444'}
              strokeWidth="4" strokeLinecap="round"
              strokeDasharray={`${(s.ketuntasanPct / 100) * 97.4} 97.4`}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <GraduationCap className="h-5 w-5 text-[#6b8079]" />
          </div>
        </div>
        <div className="flex-1">
          <div className="text-[13px] font-bold text-[#0f2e25]">Ketuntasan Belajar</div>
          <div className="text-[11px] text-[#6b8079]">
            {s.ketuntasanPct}% siswa mencapai KKTP (75). {s.tuntasCount} dari {s.totalStudents} siswa tuntas.
          </div>
        </div>
      </div>

      {/* Item Analysis Table */}
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-[#6b8079]">
          <ArrowUpDown className="h-3.5 w-3.5" />Analisis Butir Soal
        </div>
        <div className="overflow-x-auto rounded-xl border border-[#e6efea]">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-[#e6efea] bg-[#f9fbfa] text-left text-[10px] uppercase tracking-wide text-[#6b8079]">
                <th className="px-2.5 py-2">#</th>
                <th className="px-2.5 py-2">Soal</th>
                <th className="px-2.5 py-2 text-center">Tipe</th>
                <th className="px-2.5 py-2 text-center">Tingkat Kesulitan</th>
                <th className="px-2.5 py-2 text-center">Daya Beda</th>
                <th className="px-2.5 py-2 text-center">Benar</th>
                <th className="px-2.5 py-2 text-center">Salah</th>
                <th className="px-2.5 py-2 text-center">Kosong</th>
              </tr>
            </thead>
            <tbody>
              {data.itemAnalysis.map((item) => {
                const diffColor = item.type === 'essay'
                  ? 'text-slate-400'
                  : item.difficultyIndex >= 0.3 && item.difficultyIndex <= 0.7
                    ? 'text-emerald-600'
                    : item.difficultyIndex < 0.3
                      ? 'text-rose-600'
                      : 'text-amber-600';
                const discColor = item.discriminationIndex >= 0.3
                  ? 'text-emerald-600'
                  : item.discriminationIndex >= 0.1
                    ? 'text-amber-600'
                    : 'text-rose-600';
                return (
                  <tr key={item.questionId} className="border-b border-[#f0f4f2]">
                    <td className="px-2.5 py-2 font-bold text-[#9bb0a8]">{item.questionIndex + 1}</td>
                    <td className="px-2.5 py-2 text-[#0f2e25]">
                      {item.body.length > 80 ? `${item.body.slice(0, 80)}...` : item.body || '(kosong)'}
                    </td>
                    <td className="px-2.5 py-2 text-center">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-600">
                        {item.type === 'multiple_choice' ? 'PG' : item.type === 'essay' ? 'Essay' : 'B/S'}
                      </span>
                    </td>
                    <td className={clsx('px-2.5 py-2 text-center font-bold', diffColor)}>
                      {item.type === 'essay' ? '—' : item.difficultyIndex.toFixed(2)}
                    </td>
                    <td className={clsx('px-2.5 py-2 text-center font-bold', discColor)}>
                      {item.type === 'essay' ? '—' : item.discriminationIndex.toFixed(2)}
                    </td>
                    <td className="px-2.5 py-2 text-center text-emerald-600 font-bold">{item.correctCount}</td>
                    <td className="px-2.5 py-2 text-center text-rose-500 font-bold">{item.wrongCount}</td>
                    <td className="px-2.5 py-2 text-center text-slate-400 font-bold">{item.blankCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-2 text-[9.5px] text-[#9bb0a8]">
          <span>Tingkat Kesulitan: <span className="text-emerald-600">0.3-0.7 baik</span> · <span className="text-amber-600">{'<0.3 sulit'}</span> · <span className="text-rose-600">{'>0.7 mudah'}</span></span>
          <span>Daya Beda: <span className="text-emerald-600">{'≥0.3 baik'}</span> · <span className="text-amber-600">0.1-0.29 cukup</span> · <span className="text-rose-600">{'<0.1 lemah'}</span></span>
        </div>
      </div>
    </div>
  );
}
