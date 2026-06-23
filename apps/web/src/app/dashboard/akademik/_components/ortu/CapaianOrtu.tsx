'use client';

import { Trophy, Award, Target, History } from 'lucide-react';
import type { ModalState } from './OrtuWorkspace';
import {
  SIM_XP, SIM_LEADERBOARD, SIM_BADGES, SIM_CPDATA, SIM_TIMELINE,
  initials,
} from './ortu-data';

interface CapaianOrtuProps {
  setModal: (modal: ModalState) => void;
  showToast: (msg: string) => void;
}

/** Avatar colors for leaderboard (cycling). */
const AVATAR_COLORS = ['#3b82f6', '#0ea5e9', '#a78bfa', '#ec4899', '#f59e0b', '#14b8a6'];

export default function CapaianOrtu({ showToast }: CapaianOrtuProps) {
  const { level, current, next } = SIM_XP;
  const xpProgress = Math.round((current % 1000) / 1000 * 100);
  const xpToNext = next - current;
  const earnedBadges = SIM_BADGES.filter((b) => b.earned);

  return (
    <div className="px-4 pb-4">
      <div className="mb-3.5">
        <h1 className="text-xl font-extrabold">Capaian</h1>
        <p className="mt-0.5 text-[12px] font-medium text-[var(--muted)]">Prestasi & kompetensi</p>
      </div>

      {/* 1. XP card */}
      <div
        className="mb-3.5 rounded-[var(--r)] border p-3.5"
        style={{ borderColor: 'var(--glow-bd)', boxShadow: 'var(--glow-sh)' }}
      >
        <div className="flex items-center gap-3.5">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl text-[20px] font-extrabold text-white"
            style={{ background: 'var(--grad)' }}
          >
            L{level}
          </div>
          <div className="flex-1">
            <b className="text-[14px]">Level {level} · {current.toLocaleString()} XP</b>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded bg-[var(--bar-bg)]">
              <div
                className="h-full rounded"
                style={{ width: `${xpProgress}%`, background: 'var(--grad-v)' }}
              />
            </div>
            <small className="mt-1 block text-[10px] font-semibold text-[var(--muted)]">
              {xpToNext} XP ke Level {level + 1}
            </small>
          </div>
        </div>
      </div>

      {/* 2. Ranking */}
      <div className="mb-3.5 rounded-[var(--r)] border border-[var(--border)] bg-[var(--surface)] p-3.5">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wide text-[var(--muted)]">
            <Trophy className="h-[15px] w-[15px] text-[var(--pri)]" />
            Ranking Kelas TJKT
          </div>
          <span className="text-[10px] font-semibold text-[var(--muted)]">Sem Genap 25/26</span>
        </div>
        {SIM_LEADERBOARD.map((s, i) => {
          const rc = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
          const avC = AVATAR_COLORS[i % AVATAR_COLORS.length]!;
          return (
            <div
              key={i}
              className="mb-1 flex items-center gap-2.5 rounded-[10px] p-2 last:mb-0"
              style={{
                background: s.me ? 'rgba(59,130,246,.08)' : undefined,
                border: s.me ? '1px solid rgba(59,130,246,.2)' : undefined,
              }}
            >
              <div
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-extrabold"
                style={{
                  background: rc === 'gold' ? 'rgba(245,158,11,.15)'
                    : rc === 'silver' ? 'rgba(155,163,175,.15)'
                    : rc === 'bronze' ? 'rgba(180,83,9,.15)'
                    : 'var(--surface2)',
                  color: rc === 'gold' ? 'var(--amber)'
                    : rc === 'silver' ? '#9ca3af'
                    : rc === 'bronze' ? '#b45309'
                    : 'var(--muted)',
                }}
              >
                {i + 1}
              </div>
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold text-white"
                style={{ background: avC }}
              >
                {initials(s.name)}
              </div>
              <div className="min-w-0 flex-1">
                <b className="block text-[12px]">
                  {s.name}{s.me ? ' (Putra Anda)' : ''}
                </b>
                <small className="text-[9.5px] font-semibold text-[var(--muted)]">
                  {s.kelas} · {s.badges} badge · {s.avg} avg
                </small>
              </div>
              <div className="shrink-0 text-[13px] font-extrabold text-[var(--pri)]">
                {s.xp.toLocaleString()}
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. Badges grid */}
      <div className="mb-3.5 rounded-[var(--r)] border border-[var(--border)] bg-[var(--surface)] p-3.5">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wide text-[var(--muted)]">
            <Award className="h-[15px] w-[15px] text-[var(--pri)]" />
            Badge & Prestasi
          </div>
          <span className="text-[10px] font-semibold text-[var(--muted)]">
            {earnedBadges.length}/{SIM_BADGES.length} diraih
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {SIM_BADGES.map((b) => (
            <div
              key={b.name}
              onClick={() => showToast(`${b.name}: ${b.desc}`)}
              className="cursor-pointer rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--surface)] p-2.5 text-center transition-transform hover:-translate-y-0.5"
              style={b.earned ? undefined : { opacity: 0.4, filter: 'grayscale(1)' }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showToast(`${b.name}: ${b.desc}`); } }}
            >
              <div className="mb-1 text-[22px] leading-none">{b.emoji}</div>
              <div className="text-[9px] font-bold leading-tight">{b.name}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. CP progress */}
      <div className="mb-3.5 rounded-[var(--r)] border border-[var(--border)] bg-[var(--surface)] p-3.5">
        <div className="mb-2.5 flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wide text-[var(--muted)]">
          <Target className="h-[15px] w-[15px] text-[var(--pri)]" />
          Progress Kompetensi
        </div>
        {SIM_CPDATA.map((cp) => (
          <div key={cp.cp} className="mb-3 last:mb-0">
            <div className="mb-1 flex items-center justify-between">
              <b className="text-[12px]">{cp.cp}: {cp.desc}</b>
              <span className="text-[12px] font-extrabold text-[var(--pril)]">{cp.progres}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded bg-[var(--bar-bg)]">
              <div
                className="h-full rounded"
                style={{ width: `${cp.progres}%`, background: 'var(--grad-v)' }}
              />
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {cp.tps.map((tp) => (
                <span
                  key={tp.tp}
                  className="rounded-md px-1.5 py-0.5 text-[9px] font-bold"
                  style={{
                    background: tp.done ? 'rgba(16,185,129,.12)' : 'var(--surface2)',
                    color: tp.done ? 'var(--em)' : 'var(--muted)',
                  }}
                >
                  {tp.done ? '✓ ' : ''}{tp.tp}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 5. Learning timeline */}
      <div className="rounded-[var(--r)] border border-[var(--border)] bg-[var(--surface)] p-3.5">
        <div className="mb-2.5 flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wide text-[var(--muted)]">
          <History className="h-[15px] w-[15px] text-[var(--pri)]" />
          Timeline Pembelajaran
        </div>
        <div className="relative pl-[18px]">
          {/* Vertical line */}
          <div
            className="absolute left-[5px] top-1 bottom-1 w-0.5"
            style={{ background: 'var(--border2)' }}
          />
          {SIM_TIMELINE.map((t, i) => (
            <div key={i} className="relative pb-3 last:pb-0">
              {/* Dot */}
              <div
                className="absolute left-[-16px] top-1 h-2.5 w-2.5 rounded-full border-2"
                style={{ background: 'var(--pri)', borderColor: 'var(--bg)' }}
              />
              <b className="block text-[12px]">{t.title}</b>
              <small className="text-[10px] font-semibold text-[var(--muted)]">{t.date}</small>
              <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--muted)]">{t.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
