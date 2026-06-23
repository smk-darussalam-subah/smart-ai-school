'use client';

import { useState } from 'react';
import {
  Award, Trophy, Target, Zap, CheckCircle, Loader, Circle,
  Code2, Palette, Flame, Layout, CheckSquare, Calculator, Languages, Dumbbell,
} from 'lucide-react';
import { SIM_BADGES, SIM_LEADERBOARD, SIM_CPDATA, SIM_XP } from './siswa-data';
import type { SiswaScreen, ModalState } from './SiswaWorkspace';
import type { SiswaXP, SiswaLeaderboardEntry, SiswaCP, SiswaCPTP, SiswaBadge } from './siswa-types';

interface Props {
  showToast: (msg: string) => void;
  go: (screen: SiswaScreen) => void;
  setModal: (modal: ModalState) => void;
  xp: SiswaXP;
  leaderboard: SiswaLeaderboardEntry[];
  cpData: SiswaCP[];
  badges: SiswaBadge[];
}

// Map mockup icon names to lucide-react components
const ICON_MAP: Record<string, typeof Code2> = {
  'code-2': Code2,
  'palette': Palette,
  'flame': Flame,
  'zap': Zap,
  'layout': Layout,
  'check-square': CheckSquare,
  'calculator': Calculator,
  'languages': Languages,
  'dumbbell': Dumbbell,
};

function getIcon(name: string) {
  return ICON_MAP[name] || Award;
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

export default function CapaianSiswa({ showToast, go: _go, setModal, xp, leaderboard, cpData, badges }: Props) {
  const [filter, setFilter] = useState<'all' | 'earned' | 'progress'>('all');

  const displayBadges = badges.length > 0 ? badges : SIM_BADGES;
  const displayLeaderboard = leaderboard.length > 0 ? leaderboard : SIM_LEADERBOARD;
  const displayXP = xp || SIM_XP;
  const displayCP = cpData.length > 0 ? cpData : SIM_CPDATA;

  const filteredBadges = displayBadges.filter((b: SiswaBadge) => {
    if (filter === 'all') return true;
    if (filter === 'earned') return b.earned;
    return !b.earned;
  });

  const earnedCount = displayBadges.filter((b: SiswaBadge) => b.earned).length;
  const progressCount = displayBadges.length - earnedCount;
  const xpPct = Math.round((displayXP.current / displayXP.next) * 100);

  return (
    <div>
      {/* XP Card — gradient design matching mockup .xp-card */}
      <div className="px-5 py-4">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-800 p-4 text-white">
          <div className="absolute -right-5 -top-5 h-25 w-25 rounded-full bg-white/8" />
          <div className="relative z-10">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xl font-extrabold">Level {displayXP.level}</div>
                <div className="mt-0.5 text-[11px] font-semibold opacity-80">Rizky Pratama</div>
              </div>
              <Zap className="h-7 w-7 opacity-80" />
            </div>
            <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-white transition-all"
                style={{ width: `${xpPct}%` }}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] font-semibold opacity-85">
              <span>{displayXP.current.toLocaleString()} XP</span>
              <span>{displayXP.next.toLocaleString()} XP → Level {displayXP.level + 1}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="px-5 pb-3">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-[var(--muted)]">
              <Trophy className="h-3.5 w-3.5 text-amber-500" />Leaderboard TJKT
            </div>
            <button
              onClick={() => showToast('Periode: Semester Genap 2025/2026')}
              className="text-[11px] font-bold text-emerald-400"
            >
              Info
            </button>
          </div>
          <div className="space-y-1">
            {displayLeaderboard.map((entry: SiswaLeaderboardEntry, idx: number) => {
              const rankColors = ['#10b981', '#0ea5e9', '#a78bfa', '#ec4899', '#f59e0b', '#14b8a6'];
              const avColor = rankColors[idx % rankColors.length];
              const rankCls = idx === 0 ? 'bg-amber-500/15 text-amber-500' :
                idx === 1 ? 'bg-gray-400/15 text-gray-400' :
                idx === 2 ? 'bg-orange-500/15 text-orange-500' :
                'bg-[var(--surface2)] text-[var(--muted)]';

              return (
                <div
                  key={idx}
                  className={`flex items-center gap-2.5 rounded-lg p-2 transition-colors hover:bg-[var(--surface2)] ${
                    entry.me ? 'border border-emerald-500/20 bg-emerald-500/8' : ''
                  }`}
                >
                  <div className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-[11px] font-extrabold ${rankCls}`}>
                    {idx + 1}
                  </div>
                  <div
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold text-white"
                    style={{ background: avColor }}
                  >
                    {initials(entry.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold">
                      {entry.name}{entry.me ? ' (You)' : ''}
                    </div>
                    <div className="text-[10px] font-semibold text-[var(--muted)]">
                      {entry.kelas} · {entry.badges} badge · {entry.avg} avg
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-sm font-extrabold text-emerald-500">
                    {entry.xp.toLocaleString()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* CP Progress with TP breakdown */}
      <div className="px-5 pb-3">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="mb-3 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-[var(--muted)]">
            <Target className="h-3.5 w-3.5 text-emerald-500" />Progress CP per Mapel
          </div>
          <div className="space-y-2.5">
            {displayCP.map((cp: SiswaCP) => {
              const ok = cp.progres >= 75;
              const StatusIcon = cp.progres >= 100 ? CheckCircle : cp.progres > 0 ? Loader : Circle;
              return (
                <div
                  key={cp.cp}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
                  style={{ boxShadow: 'var(--sh)' }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="flex h-6 w-6 items-center justify-center rounded-md"
                        style={{
                          background: ok ? 'rgba(16,185,129,.15)' : 'rgba(245,158,11,.15)',
                        }}
                      >
                        <StatusIcon
                          className="h-3.5 w-3.5"
                          style={{ color: ok ? 'var(--em)' : 'var(--amber)' }}
                        />
                      </div>
                      <div className="text-[13px] font-bold">{cp.cp}: {cp.desc}</div>
                    </div>
                    <span
                      className="text-xs font-extrabold"
                      style={{ color: ok ? 'var(--em)' : 'var(--amber)' }}
                    >
                      {cp.progres}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--bar-bg)]">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${cp.progres}%`,
                        background: ok
                          ? 'linear-gradient(90deg, #10b981, #059669)'
                          : 'linear-gradient(90deg, #fbbf24, #d97706)',
                      }}
                    />
                  </div>
                  {/* TP breakdown */}
                  {cp.tps && cp.tps.length > 0 && (
                    <div className="mt-2">
                      {cp.tps.map((tp: SiswaCPTP, tpIdx: number) => (
                        <div
                          key={tpIdx}
                          className={`flex items-center gap-2 border-b border-[var(--border)] py-1.5 text-xs font-semibold last:border-b-0 ${
                            tp.done ? 'text-[var(--text)]' : 'text-[var(--muted)]'
                          }`}
                        >
                          <div
                            className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded ${
                              tp.done
                                ? 'border-0 bg-emerald-500'
                                : 'border-[1.5px] border-[var(--dim)]'
                            }`}
                          >
                            {tp.done && <CheckSquare className="h-3 w-3 text-white" />}
                          </div>
                          <span className="flex-1">{tp.tp}: {tp.desc}</span>
                          {tp.badge && <Award className="h-4 w-4 flex-shrink-0 text-amber-500" />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Badge Stats */}
      <div className="px-5 pb-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-center">
            <div className="text-2xl font-extrabold text-emerald-500">{earnedCount}</div>
            <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Earned</div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-center">
            <div className="text-2xl font-extrabold text-amber-500">{progressCount}</div>
            <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">In Progress</div>
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

      {/* Badge Grid — colored lucide icons matching mockup */}
      <div className="px-5 py-4">
        <div className="grid grid-cols-3 gap-3">
          {filteredBadges.map((badge: SiswaBadge) => {
            const Icon = getIcon(badge.icon);
            return (
              <button
                key={badge.name}
                onClick={() => setModal({ type: 'badge', data: { badge } })}
                className={`text-center transition-all hover:-translate-y-0.5 ${
                  !badge.earned ? 'opacity-40 grayscale' : ''
                }`}
              >
                <div
                  className="mx-auto mb-1.5 flex h-14 w-14 items-center justify-center rounded-full"
                  style={{ background: `${badge.color}20`, border: `2px solid ${badge.color}40` }}
                >
                  <Icon className="h-6 w-6" style={{ color: badge.color }} />
                </div>
                <div className="text-[10px] font-bold">{badge.name}</div>
                <div className="mt-0.5 text-[8.5px] font-semibold uppercase tracking-wide text-[var(--dim)]">{badge.cat}</div>
                {badge.earned ? (
                  badge.score ? (
                    <div className="mt-0.5 text-[9px] font-extrabold text-emerald-500">★ {badge.score}</div>
                  ) : (
                    <div className="mt-0.5 text-[9px] font-extrabold text-emerald-500">✓ Earned</div>
                  )
                ) : (
                  <div className="mt-0.5 text-[9px] font-semibold text-[var(--muted)]">{badge.prog || 0}%</div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
