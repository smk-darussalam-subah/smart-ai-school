'use client';

import { BookOpen, Info, TrendingUp, TrendingDown } from 'lucide-react';
import { KKTP_DEFAULT, NA_WEIGHTS } from '@/lib/academic';
import type { ModalState } from './OrtuWorkspace';
import type { OrtuNilai } from './ortu-types';
import {
  mpColor, gradeCls, avgNa, tuntasCount,
} from './ortu-data';

interface NilaiOrtuProps {
  setModal: (modal: ModalState) => void;
  grades?: unknown[];
}

/** Average an array of scores, rounded to integer. */
function avgArr(arr: number[]): number {
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

export default function NilaiOrtu({ setModal, grades }: NilaiOrtuProps) {
  // T1-04 (audit v2): nilai langsung dari props. Empty → empty state, BUKAN SIM_NILAI.
  const nilai: OrtuNilai[] = grades?.length ? (grades as OrtuNilai[]) : [];
  const avg = avgNa(nilai);
  // Leaderboard ortu belum di-fetch di page.tsx → ranking tidak tersedia (null = sembunyikan).
  const rank: number | null = null;
  const tuntas = tuntasCount(nilai);

  const statCards = [
    { n: avg > 0 ? String(avg) : '—', l: 'Rata²' },
    { n: rank != null ? `#${rank}` : '—', l: 'Ranking' },
    { n: nilai.length > 0 ? `${tuntas}/${nilai.length}` : '—', l: 'Tuntas' },
  ];

  return (
    <div className="px-4 pb-4">
      <div className="mb-3.5">
        <h1 className="text-xl font-extrabold">Nilai Akademik</h1>
        <p className="mt-0.5 text-[12px] font-medium text-[var(--muted)]">Progress nilai & rapor</p>
        {nilai.length === 0 && (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-[11px] font-bold text-sky-500">
            <span>ℹ️</span> Belum ada nilai — guru belum menginput nilai untuk anak Anda
          </div>
        )}
      </div>

      {/* 1. Stat grid */}
      <div className="mb-3.5 grid grid-cols-3 gap-2">
        {statCards.map((s, i) => (
          <div key={i} className="rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--surface)] p-3 text-center">
            <div className="text-[18px] font-extrabold text-[var(--pril)]">{s.n}</div>
            <div className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--muted)]">{s.l}</div>
          </div>
        ))}
      </div>

      {/* 2. KKTP info bar */}
      <div className="mb-3.5 flex items-center gap-2 rounded-[var(--r)] border border-[var(--border)] bg-[var(--surface)] p-2.5 text-[11.5px] font-semibold">
        <Info className="h-4 w-4 shrink-0 text-[var(--pri)]" />
        <span>
          KKTP (Kriteria Ketuntasan): <b>{KKTP_DEFAULT}</b> · Bobot: UH {Math.round(NA_WEIGHTS.uh * 100)}% · Praktik {Math.round(NA_WEIGHTS.praktik * 100)}% · Sikap {Math.round(NA_WEIGHTS.sikap * 100)}% · UTS {Math.round(NA_WEIGHTS.uts * 100)}% · UAS {Math.round(NA_WEIGHTS.uas * 100)}%
        </span>
      </div>

      {/* 3. Subject list */}
      <div className="rounded-[var(--r)] border border-[var(--border)] bg-[var(--surface)] p-3.5">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wide text-[var(--muted)]">
            <BookOpen className="h-[15px] w-[15px] text-[var(--pri)]" />
            Nilai per Mapel
          </div>
          <button
            onClick={() => setModal({ type: 'rapor' })}
            className="cursor-pointer text-[11px] font-bold text-[var(--pril)]"
          >
            Rapor
          </button>
        </div>
        {nilai.map((n) => {
          const c = mpColor(n.mp);
          const cls = gradeCls(n.na);
          const vC = cls === 'ok' ? 'var(--em)' : cls === 'warn' ? 'var(--amber)' : 'var(--rose)';
          const s = n.raw;
          const uhAvg = avgArr(s.uh);
          const pkAvg = avgArr(s.praktik);
          const components = [uhAvg, pkAvg, s.sikap, s.uts, s.uas];

          return (
            <div
              key={n.mp}
              onClick={() => setModal({ type: 'grade', data: { nilai: n } })}
              className="mb-2 flex cursor-pointer items-center gap-2.5 rounded-[var(--r-sm)] border border-[var(--border)] p-2.5 transition-colors hover:border-[var(--border2)] hover:bg-[var(--surface2)] last:mb-0"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setModal({ type: 'grade', data: { nilai: n } }); } }}
            >
              <div className="h-10 w-1 shrink-0 rounded" style={{ background: c }} />
              <div className="min-w-0 flex-1">
                <b className="block text-[13px]">{n.mp}</b>
                <small className="text-[10px] font-semibold text-[var(--muted)]">
                  UH {uhAvg} · Praktik {pkAvg} · Sikap {s.sikap} · UTS {s.uts} · UAS {s.uas}
                </small>
                {/* Component mini-bars */}
                <div className="mt-1 flex gap-0.5">
                  {components.map((v, i) => (
                    <div
                      key={i}
                      className="h-1 flex-1 rounded"
                      style={{ background: c, opacity: v / 100 }}
                    />
                  ))}
                </div>
              </div>
              <div className="shrink-0 text-[18px] font-extrabold" style={{ color: vC }}>
                {n.na}
              </div>
              <div className="shrink-0" style={{ color: n.trend === 'up' ? 'var(--em)' : 'var(--rose)' }}>
                {n.trend === 'up'
                  ? <TrendingUp className="h-[14px] w-[14px]" />
                  : <TrendingDown className="h-[14px] w-[14px]" />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
