'use client';

import { Trophy, Award, Target, History } from 'lucide-react';
import type { ModalState } from './OrtuWorkspace';
import { SIM_TIMELINE } from './ortu-data';
import type { OrtuBadge } from './ortu-types';

/** Shape badge dari API /badges/student/:id (lihat akademik/page.tsx ortu branch). */
export interface BadgeApiItem {
  id: string;
  awardedAt: string;
  badge: { id: string; code: string; name: string; description: string; icon: string; tier: string };
}

/** Emoji tier fallback bila badge.icon kosong/tidak valid. */
const TIER_EMOJI: Record<string, string> = {
  BRONZE: '\u{1F948}', SILVER: '\u{1F948}', GOLD: '\u{1F3C6}', PLATINUM: '\u{1F48E}',
};

/** Mapping badge API → OrtuBadge view-model. Semua badge ter-award dianggap earned=true. */
function mapBadges(items: BadgeApiItem[]): OrtuBadge[] {
  return items.map((b) => ({
    emoji: b.badge?.icon || TIER_EMOJI[b.badge?.tier] || '\u{1F39F}',
    name: b.badge?.name || 'Badge',
    desc: b.badge?.description || '',
    earned: true,
  }));
}

interface CapaianOrtuProps {
  setModal: (modal: ModalState) => void;
  showToast: (msg: string) => void;
  /** T1-03a: badge real dari /badges/student/:id. */
  badges?: BadgeApiItem[];
}

/** Avatar colors for leaderboard (cycling). */

export default function CapaianOrtu({ showToast, badges }: CapaianOrtuProps) {
  // T1-03a: badges dari data real. XP/CP/leaderboard belum di-fetch untuk ortu
  // (lihat page.tsx ortu branch) → tampilkan honest empty state, BUKAN SIM.
  const earnedBadges = mapBadges(badges ?? []);

  return (
    <div className="px-4 pb-4">
      <div className="mb-3.5">
        <h1 className="text-xl font-extrabold">Capaian</h1>
        <p className="mt-0.5 text-[12px] font-medium text-[var(--muted)]">Prestasi & kompetensi</p>
      </div>

      {/* 1. XP card — T1-03a: ortu XP endpoint belum di-wire; honest empty state */}
      <div
        className="mb-3.5 rounded-[var(--r)] border border-dashed border-[var(--border)] bg-[var(--surface)] p-3.5 text-center"
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl text-[18px] font-extrabold text-white" style={{ background: 'var(--grad)' }}>
          ?
        </div>
        <p className="mt-2 text-[12.5px] font-bold text-[var(--text)]">XP & Level</p>
        <p className="text-[10.5px] text-[var(--muted)]">Data gamifikasi anak akan tersedia menyusul</p>
      </div>

      {/* 2. Ranking — belum di-fetch untuk ortu; honest empty state */}
      <div className="mb-3.5 rounded-[var(--r)] border border-dashed border-[var(--border)] bg-[var(--surface)] p-3.5 text-center">
        <Trophy className="mx-auto h-5 w-5 text-[var(--dim)]" />
        <p className="mt-1.5 text-[12px] font-bold text-[var(--muted)]">Ranking kelas belum tersedia</p>
      </div>

      {/* 3. Badges grid — T1-03a: dari /badges/student/:id (real) */}
      <div className="mb-3.5 rounded-[var(--r)] border border-[var(--border)] bg-[var(--surface)] p-3.5">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wide text-[var(--muted)]">
            <Award className="h-[15px] w-[15px] text-[var(--pri)]" />
            Badge & Prestasi
          </div>
          <span className="text-[10px] font-semibold text-[var(--muted)]">
            {earnedBadges.length} diraih
          </span>
        </div>
        {earnedBadges.length === 0 ? (
          <div className="py-5 text-center text-[12px] font-semibold text-[var(--dim)]">
            Belum ada badge yang diraih anak
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {earnedBadges.map((b) => (
              <div
                key={b.name}
                onClick={() => showToast(`${b.name}: ${b.desc}`)}
                className="cursor-pointer rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--surface)] p-2.5 text-center transition-transform hover:-translate-y-0.5"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showToast(`${b.name}: ${b.desc}`); } }}
              >
                <div className="mb-1 text-[22px] leading-none">{b.emoji}</div>
                <div className="text-[9px] font-bold leading-tight">{b.name}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. CP progress — backend /cp-progress belum ada (Skenario B); honest empty state */}
      <div className="mb-3.5 rounded-[var(--r)] border border-dashed border-[var(--border)] bg-[var(--surface)] p-3.5 text-center">
        <Target className="mx-auto h-5 w-5 text-[var(--dim)]" />
        <p className="mt-1.5 text-[12px] font-bold text-[var(--muted)]">Progress kompetensi akan tersedia menyusul</p>
      </div>

      {/* 5. Learning timeline — Skenario B: backend belum ada, SIM dipertahankan DENGAN label jelas */}
      <div className="rounded-[var(--r)] border border-[var(--border)] bg-[var(--surface)] p-3.5">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wide text-[var(--muted)]">
            <History className="h-[15px] w-[15px] text-[var(--pri)]" />
            Timeline Pembelajaran
          </div>
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-500">Contoh</span>
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
