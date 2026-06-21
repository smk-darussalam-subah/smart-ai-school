'use client';

import { useState } from 'react';
import { Trophy, Star, ChevronRight, Target } from 'lucide-react';
import { SIM_BADGES, SIM_LEADERBOARD, SIM_CPDATA, SIM_XP } from './siswa-data';
import type { SiswaScreen } from './SiswaWorkspace';

interface Props {
  showToast: (msg: string) => void;
  go: (screen: SiswaScreen) => void;
  setModal: (modal: any) => void;
  xp: any;
  leaderboard: any[];
  cpData: any[];
  badges: any[];
}

export default function CapaianSiswa({ setModal, xp, leaderboard, cpData, badges }: Props) {
  const [filter, setFilter] = useState<'all' | 'earned' | 'progress'>('all');
  
  const displayBadges = badges.length > 0 ? badges : SIM_BADGES;
  const displayLeaderboard = leaderboard.length > 0 ? leaderboard : SIM_LEADERBOARD;
  const displayXP = xp || SIM_XP;
  const displayCP = cpData.length > 0 ? cpData : SIM_CPDATA;

  const filteredBadges = displayBadges.filter((b: any) => {
    if (filter === 'all') return true;
    if (filter === 'earned') return b.earned;
    return !b.earned;
  });

  const earnedCount = displayBadges.filter((b: any) => b.earned).length;
  const progressCount = displayBadges.length - earnedCount;

  return (
    <div>
      {/* XP Progress Header */}
      <div className="px-5 py-4">
        <h1 className="text-2xl font-extrabold tracking-tight">Capaian & Badge</h1>
        <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 text-white">
                <Star className="h-6 w-6" />
              </div>
              <div>
                <div className="text-lg font-extrabold">Level {displayXP.level}</div>
                <div className="text-[11px] font-semibold text-[var(--muted)]">{displayXP.current} / {displayXP.next} XP</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-extrabold text-emerald-500">{displayXP.total}</div>
              <div className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">Total XP</div>
            </div>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[var(--bar-bg)]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-700 transition-all"
              style={{ width: `${(displayXP.current / displayXP.next) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Badge Stats */}
      <div className="px-5 pb-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-center">
            <div className="text-2xl font-extrabold text-emerald-500">{earnedCount}</div>
            <div className="mt-0.5 text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">Earned</div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-center">
            <div className="text-2xl font-extrabold text-amber-500">{progressCount}</div>
            <div className="mt-0.5 text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">In Progress</div>
          </div>
        </div>
      </div>

      {/* Badge Filters */}
      <div className="sticky top-[57px] z-10 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-3">
        <div className="flex gap-1.5">
          {([
            ['all', 'Semua'],
            ['earned', 'Earned'],
            ['progress', 'Progress'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all ${
                filter === key
                  ? 'bg-emerald-500 text-white'
                  : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--border2)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Badge Grid */}
      <div className="px-5 py-4">
        <div className="grid grid-cols-3 gap-3">
          {filteredBadges.map((badge: any) => (
            <button
              key={badge.name}
              onClick={() => setModal({ type: 'badge', data: { badge } })}
              className={`relative overflow-hidden rounded-xl border text-center transition-all hover:-translate-y-0.5 ${
                badge.earned
                  ? 'border-[var(--border)] bg-[var(--surface)]'
                  : 'border-[var(--border)] bg-[var(--surface)] opacity-60'
              }`}
            >
              <div className="p-3">
                <div
                  className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full"
                  style={{ background: `${badge.color}20`, border: `2px solid ${badge.color}40` }}
                >
                  <span className="text-2xl">🏅</span>
                </div>
                <div className="text-[10px] font-bold">{badge.name}</div>
                {badge.earned ? (
                  <div className="mt-1 text-[9px] font-extrabold text-emerald-500">✓ Earned</div>
                ) : (
                  <div className="mt-1 text-[9px] font-semibold text-[var(--muted)]">{badge.prog || 0}%</div>
                )}
              </div>
              {!badge.earned && (
                <div className="h-1 w-full bg-[var(--bar-bg)]">
                  <div
                    className="h-full transition-all"
                    style={{ width: `${badge.prog || 0}%`, background: badge.color }}
                  />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Leaderboard Preview */}
      <div className="px-5 pb-3">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-[var(--muted)]">
              <Trophy className="h-3.5 w-3.5 text-amber-500" />Leaderboard Kelas
            </div>
            <button className="flex items-center gap-0.5 text-[11px] font-bold text-emerald-400">
              Full <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          <div className="space-y-2">
            {displayLeaderboard.slice(0, 5).map((entry: any, idx: number) => (
              <div
                key={entry.rank}
                className={`flex items-center gap-3 rounded-lg p-2 ${
                  entry.isMe ? 'bg-emerald-500/10 border border-emerald-500/30' : ''
                }`}
              >
                <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-extrabold ${
                  idx === 0 ? 'bg-amber-500/20 text-amber-500' :
                  idx === 1 ? 'bg-gray-400/20 text-gray-400' :
                  idx === 2 ? 'bg-orange-500/20 text-orange-500' :
                  'bg-[var(--surface2)] text-[var(--muted)]'
                }`}>
                  {entry.rank}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold">{entry.name}</div>
                  <div className="text-[10px] font-semibold text-[var(--muted)]">{entry.badges || 0} badges</div>
                </div>
                <div className="text-sm font-extrabold text-emerald-500">{entry.xp} XP</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CP Progress */}
      <div className="px-5 pb-4">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="mb-3 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-[var(--muted)]">
            <Target className="h-3.5 w-3.5 text-emerald-500" />Progress Capaian Pembelajaran
          </div>
          <div className="space-y-2.5">
            {displayCP.slice(0, 6).map((cp: any) => (
              <div key={cp.code} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold">{cp.code}</div>
                    <div className="mt-0.5 text-[10px] font-semibold text-[var(--muted)] line-clamp-2">{cp.desc}</div>
                  </div>
                  <div className={`flex-shrink-0 rounded px-2 py-1 text-[10px] font-extrabold ${
                    cp.pct >= 100 ? 'bg-emerald-500/15 text-emerald-500' :
                    cp.pct >= 50 ? 'bg-amber-500/15 text-amber-500' :
                    'bg-white/5 text-[var(--muted)]'
                  }`}>
                    {cp.pct}%
                  </div>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--bar-bg)]">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(cp.pct, 100)}%`,
                      background: cp.pct >= 100 ? 'linear-gradient(90deg, #10b981, #059669)' : cp.pct >= 50 ? 'linear-gradient(90deg, #fbbf24, #d97706)' : 'var(--dim)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
