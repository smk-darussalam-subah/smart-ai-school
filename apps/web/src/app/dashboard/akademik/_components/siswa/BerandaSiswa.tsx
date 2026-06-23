'use client';

import { useMemo } from 'react';
import {
  Flame, UserCheck, TrendingUp, ClipboardList, Award, CalendarClock,
  PlayCircle, ChevronRight, Target,
} from 'lucide-react';
import { wibNow, currentJp } from '@/lib/bell-times';
import { mpColor, mpIcon } from './siswa-data';
import type { SiswaScreen } from './SiswaWorkspace';

interface Props {
  showToast: (msg: string) => void;
  go: (screen: SiswaScreen) => void;
  setModal: (modal: any) => void;
  setBadgeCelebration: (data: any) => void;
  setActiveModulId: (id: number | null) => void;
  grades: any[];
  tasks: any[];
  badges: any[];
  modules: any[];
  quest: any;
  xp: any;
  kehStats: any;
}

// Mockup schedule data (matching mockup structure)
const SCHED: Record<number, Record<number, { mp: string; g: string; ruang: string }>> = {
  1: { 0: { mp: 'Pemrograman Web', g: 'Budi Hartono, S.Kom', ruang: 'Lab 1' }, 1: { mp: 'Pemrograman Web', g: 'Budi Hartono, S.Kom', ruang: 'Lab 1' }, 2: { mp: 'Matematika', g: 'Siti Aminah, S.Pd', ruang: 'R-107' }, 4: { mp: 'B.Inggris', g: 'Eko Prasetyo, S.Pd', ruang: 'R-107' }, 5: { mp: 'B.Inggris', g: 'Eko Prasetyo, S.Pd', ruang: 'R-107' }, 6: { mp: 'PJOK', g: 'Doni Kurniawan, S.Pd', ruang: 'Lapangan' }, 8: { mp: 'PKn', g: 'Nur Hidayah, S.Pd', ruang: 'R-107' }, 9: { mp: 'PKn', g: 'Nur Hidayah, S.Pd', ruang: 'R-107' } },
  2: { 0: { mp: 'Basis Data', g: 'Budi Hartono, S.Kom', ruang: 'Lab 1' }, 1: { mp: 'Basis Data', g: 'Budi Hartono, S.Kom', ruang: 'Lab 1' }, 2: { mp: 'B.Indonesia', g: 'Dewi Lestari, S.Pd', ruang: 'R-107' }, 4: { mp: 'Fisika', g: 'Hendra Gunawan, S.Pd', ruang: 'R-107' }, 5: { mp: 'Matematika', g: 'Siti Aminah, S.Pd', ruang: 'R-107' }, 6: { mp: 'Pemrograman Web', g: 'Budi Hartono, S.Kom', ruang: 'Lab 1' }, 8: { mp: 'Pemrograman Web', g: 'Budi Hartono, S.Kom', ruang: 'Lab 1' }, 9: { mp: 'Pemrograman Web', g: 'Budi Hartono, S.Kom', ruang: 'Lab 1' } },
  3: { 0: { mp: 'Matematika', g: 'Siti Aminah, S.Pd', ruang: 'R-107' }, 1: { mp: 'B.Inggris', g: 'Eko Prasetyo, S.Pd', ruang: 'R-107' }, 2: { mp: 'Basis Data', g: 'Budi Hartono, S.Kom', ruang: 'Lab 1' }, 4: { mp: 'B.Indonesia', g: 'Dewi Lestari, S.Pd', ruang: 'R-107' }, 5: { mp: 'B.Indonesia', g: 'Dewi Lestari, S.Pd', ruang: 'R-107' }, 6: { mp: 'Fisika', g: 'Hendra Gunawan, S.Pd', ruang: 'R-107' }, 8: { mp: 'PJOK', g: 'Doni Kurniawan, S.Pd', ruang: 'Lapangan' }, 9: { mp: 'PJOK', g: 'Doni Kurniawan, S.Pd', ruang: 'Lapangan' } },
  4: { 0: { mp: 'Pemrograman Web', g: 'Budi Hartono, S.Kom', ruang: 'Lab 1' }, 1: { mp: 'Pemrograman Web', g: 'Budi Hartono, S.Kom', ruang: 'Lab 1' }, 2: { mp: 'Matematika', g: 'Siti Aminah, S.Pd', ruang: 'R-107' }, 4: { mp: 'PKn', g: 'Nur Hidayah, S.Pd', ruang: 'R-107' }, 5: { mp: 'B.Inggris', g: 'Eko Prasetyo, S.Pd', ruang: 'R-107' }, 6: { mp: 'Basis Data', g: 'Budi Hartono, S.Kom', ruang: 'Lab 1' }, 8: { mp: 'Basis Data', g: 'Budi Hartono, S.Kom', ruang: 'Lab 1' }, 9: { mp: 'Basis Data', g: 'Budi Hartono, S.Kom', ruang: 'Lab 1' } },
  5: { 0: { mp: 'B.Indonesia', g: 'Dewi Lestari, S.Pd', ruang: 'R-107' }, 1: { mp: 'Fisika', g: 'Hendra Gunawan, S.Pd', ruang: 'R-107' }, 2: { mp: 'Matematika', g: 'Siti Aminah, S.Pd', ruang: 'R-107' }, 4: { mp: 'Pemrograman Web', g: 'Budi Hartono, S.Kom', ruang: 'Lab 1' }, 5: { mp: 'Pemrograman Web', g: 'Budi Hartono, S.Kom', ruang: 'Lab 1' }, 6: { mp: 'B.Inggris', g: 'Eko Prasetyo, S.Pd', ruang: 'R-107' }, 8: { mp: 'B.Indonesia', g: 'Dewi Lestari, S.Pd', ruang: 'R-107' }, 9: { mp: 'B.Indonesia', g: 'Dewi Lestari, S.Pd', ruang: 'R-107' } },
  6: { 0: { mp: 'Matematika', g: 'Siti Aminah, S.Pd', ruang: 'R-107' }, 1: { mp: 'Basis Data', g: 'Budi Hartono, S.Kom', ruang: 'Lab 1' }, 2: { mp: 'Basis Data', g: 'Budi Hartono, S.Kom', ruang: 'Lab 1' }, 4: { mp: 'PJOK', g: 'Doni Kurniawan, S.Pd', ruang: 'Lapangan' }, 5: { mp: 'Fisika', g: 'Hendra Gunawan, S.Pd', ruang: 'R-107' }, 6: { mp: 'B.Inggris', g: 'Eko Prasetyo, S.Pd', ruang: 'R-107' }, 8: { mp: 'PKn', g: 'Nur Hidayah, S.Pd', ruang: 'R-107' }, 9: { mp: 'Matematika', g: 'Siti Aminah, S.Pd', ruang: 'R-107' } },
};

const JP: [string, string][] = [['JP 1', '07.30–08.10'], ['JP 2', '08.10–08.50'], ['JP 3', '08.50–09.30'], ['Istirahat', '09.30–09.45'], ['JP 4', '09.45–10.25'], ['JP 5', '10.25–11.05'], ['JP 6', '11.05–11.45'], ['Ishoma', '11.45–12.25'], ['JP 7', '12.25–13.05'], ['JP 8', '13.05–13.45']];
const JPN: [number, number][] = [[1, 0], [2, 1], [3, 2], [4, 4], [5, 5], [6, 6], [7, 8], [8, 9]];

export default function BerandaSiswa({ showToast, go, setModal, setActiveModulId, grades, tasks, badges, modules, quest, xp, kehStats }: Props) {
  const now = wibNow();
  const dow = now.jsDay; // 0=Sunday → SCHED[0] undefined → shows "Libur"
  const currentJpIdx = currentJp(now.minutes);

  // Derived stats
  const avgNilai = useMemo(() => {
    if (grades.length === 0) return 0;
    return Math.round(grades.reduce((a: number, b: any) => a + b.rata, 0) / grades.length * 10) / 10;
  }, [grades]);

  const pendingTasks = useMemo(() => tasks.filter((t: any) => t.status === 'pending'), [tasks]);
  const tuntasCount = useMemo(() => grades.filter((g: any) => g.rata >= g.kktp).length, [grades]);
  const earnedBadges = useMemo(() => badges.filter((b: any) => b.earned).length, [badges]);
  const activeModul = useMemo(() => modules.find((m: any) => m.status === 'Aktif'), [modules]);

  // Daily quest progress
  const qDone = quest.tasks.filter((t: any) => t.done).length;
  const qPct = Math.round((qDone / quest.tasks.length) * 100);
  const qCirc = 2 * Math.PI * 22;

  // Today's schedule
  const daySched = SCHED[dow] || {};
  const hasSched = Object.keys(daySched).length > 0;

  // Urgent tasks (top 3)
  const urgentTasks = pendingTasks
    .sort((a: any, b: any) => a.dlDays - b.dlDays)
    .slice(0, 3);

  // Recent grades (top 4)
  const recentGrades = grades.slice(0, 4);

  // Badge preview (first 6)
  const badgePreview = badges.slice(0, 6);

  return (
    <div>
      {/* Greeting + Quest */}
      <div className="relative overflow-hidden px-5 pb-4 pt-2">
        <div className="absolute -right-10 -top-8 h-36 w-36 rounded-full bg-[radial-gradient(circle,rgba(16,185,129,.1),transparent_70%)] pointer-events-none" />
        <div className="relative z-10 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-extrabold tracking-tight">
              Halo, Rizky! <span className="inline-block animate-[wave_1.5s_ease_infinite]">👋</span>
            </h1>
            <p className="mt-1 text-sm font-semibold text-[var(--muted)]">XI TJKT 1 · SMK Darussalam Subah</p>
            <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/12 px-3 py-1 text-[11px] font-extrabold text-amber-500">
              <Flame className="h-3.5 w-3.5" />15 hari streak kehadiran!
            </span>
          </div>
          <button
            onClick={() => showToast('Daily Quest: Selesaikan 2 modul + 1 tugas hari ini!')}
            className="relative z-10 flex-shrink-0 text-center"
            aria-label="Daily Quest"
          >
            <div className="relative mx-auto h-14 w-14">
              <svg className="-rotate-90" width="56" height="56">
                <circle cx="28" cy="28" r="22" stroke="var(--ring-bg)" strokeWidth="5" fill="none" />
                <circle
                  cx="28"
                  cy="28"
                  r="22"
                  stroke="var(--amber)"
                  strokeWidth="5"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={qCirc}
                  strokeDashoffset={qCirc - (qCirc * qPct) / 100}
                  transform="rotate(-90 28 28)"
                />
              </svg>
              <div className="absolute inset-0 grid place-items-center">
                <Target className="h-5 w-5 text-amber-500" />
              </div>
            </div>
            <div className="mt-1 text-[7.5px] font-extrabold uppercase tracking-wider text-[var(--muted)]">
              {qDone}/{quest.tasks.length} Quest
            </div>
          </button>
        </div>
      </div>

      {/* Stat Cards Grid */}
      <div className="grid grid-cols-2 gap-2.5 px-5 pb-4">
        <button
          onClick={() => go('kehadiran')}
          className="relative cursor-pointer overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5 text-left transition-all hover:border-[var(--border2)] hover:-translate-y-0.5"
        >
          <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/12 text-emerald-500">
            <UserCheck className="h-4 w-4" />
          </div>
          <div className="text-xl font-extrabold tracking-tight">
            {kehStats?.pct ?? 92.8}<small className="text-sm font-bold text-[var(--muted)]">%</small>
          </div>
          <div className="mt-0.5 text-[10.5px] font-bold text-[var(--muted)]">Kehadiran</div>
          <div className="mt-0.5 text-[10px] font-extrabold text-emerald-500">▲ 15 hari streak</div>
        </button>

        <button
          onClick={() => go('nilai')}
          className="relative cursor-pointer overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5 text-left transition-all hover:border-[var(--border2)] hover:-translate-y-0.5"
        >
          <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/12 text-violet-500">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div className="text-xl font-extrabold tracking-tight">{avgNilai}</div>
          <div className="mt-0.5 text-[10.5px] font-bold text-[var(--muted)]">Rata² Nilai</div>
          <div className={`mt-0.5 text-[10px] font-extrabold ${avgNilai >= 75 ? 'text-emerald-500' : 'text-rose-500'}`}>
            {tuntasCount}/{grades.length} tuntas
          </div>
        </button>

        <button
          onClick={() => go('tugas')}
          className="relative cursor-pointer overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5 text-left transition-all hover:border-[var(--border2)] hover:-translate-y-0.5"
        >
          <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/12 text-amber-500">
            <ClipboardList className="h-4 w-4" />
          </div>
          <div className="text-xl font-extrabold tracking-tight">{pendingTasks.length}</div>
          <div className="mt-0.5 text-[10.5px] font-bold text-[var(--muted)]">Tugas Pending</div>
          <div className="mt-0.5 text-[10px] font-extrabold text-rose-500">▼ perlu dikerjakan</div>
        </button>

        <button
          onClick={() => go('capaian')}
          className="relative cursor-pointer overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5 text-left transition-all hover:border-[var(--border2)] hover:-translate-y-0.5"
        >
          <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-pink-500/12 text-pink-500">
            <Award className="h-4 w-4" />
          </div>
          <div className="text-xl font-extrabold tracking-tight">{earnedBadges}</div>
          <div className="mt-0.5 text-[10.5px] font-bold text-[var(--muted)]">Badge Earned</div>
          <div className="mt-0.5 text-[10px] font-extrabold text-emerald-500">▲ Level {xp.level}</div>
        </button>
      </div>

      {/* Content Area */}
      <div className="px-5 pt-0 space-y-3">
        {/* Continue Learning */}
        {activeModul && (
          <div className="rounded-2xl border border-emerald-500/20 bg-[var(--surface)] p-4 shadow-[0_0_0_1px_rgba(16,185,129,.1),0_4px_24px_-8px_rgba(16,185,129,.15)]">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-[var(--muted)]">
                <PlayCircle className="h-3.5 w-3.5 text-emerald-500" />Lanjutkan Belajar
              </div>
              <button
                onClick={() => go('modul')}
                className="flex items-center gap-0.5 text-[11px] font-bold text-emerald-400"
              >
                Semua <ChevronRight className="h-3 w-3" />
              </button>
            </div>
            <button
              onClick={() => setActiveModulId(activeModul.id)}
              className="w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] transition-all hover:border-[var(--border2)]"
            >
              <div
                className="relative flex h-12 items-center px-4"
                style={{ background: `linear-gradient(135deg, ${mpColor(activeModul.mapel)}, ${mpColor(activeModul.mapel)}80)` }}
              >
                <div className="absolute left-2.5 top-1.5 rounded bg-white/20 px-1.5 py-0.5 text-[9px] font-extrabold text-white backdrop-blur">
                  {activeModul.tp}
                </div>
                <div className="ml-auto grid h-7 w-7 place-items-center rounded-lg bg-white/20 backdrop-blur">
                  <span className="text-sm font-extrabold text-white">{(mpIcon(activeModul.mapel) ?? 'book').charAt(0).toUpperCase()}</span>
                </div>
              </div>
              <div className="p-3">
                <div className="text-sm font-bold">{activeModul.judul}</div>
                <div className="mt-0.5 text-[11px] font-semibold text-[var(--muted)]">
                  {activeModul.mapel} · {activeModul.alokasi}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-[var(--bar-bg)]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-700"
                      style={{ width: `${activeModul.prog}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-extrabold text-emerald-500">{activeModul.prog ?? 0}%</span>
                </div>
              </div>
            </button>
          </div>
        )}

        {/* Jadwal Hari Ini */}
        <div className="rounded-2xl border border-emerald-500/20 bg-[var(--surface)] p-4 shadow-[0_0_0_1px_rgba(16,185,129,.1),0_4px_24px_-8px_rgba(16,185,129,.15)]">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-[var(--muted)]">
              <CalendarClock className="h-3.5 w-3.5 text-emerald-500" />Jadwal Hari Ini
            </div>
            <button onClick={() => go('jadwal')} className="flex items-center gap-0.5 text-[11px] font-bold text-emerald-400">
              Lihat semua <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          <div className="space-y-2">
            {hasSched ? (
              JPN.map(([, idx]) => {
                const slot = daySched[idx];
                if (!slot) return null;
                const isDone = idx < (currentJpIdx === 0 ? -1 : JPN.findIndex(([j]) => j === currentJpIdx));
                const isNow = currentJpIdx > 0 && JPN[currentJpIdx - 1]?.[1] === idx;
                const dotCls = isDone ? 'bg-emerald-500' : isNow ? 'bg-amber-500 animate-pulse' : 'bg-transparent border-2 border-[var(--dim)]';
                const t = JP[idx]![1].split('–');
                const guruShort = slot.g.split(',')[0];

                return (
                  <div
                    key={idx}
                    className={`flex gap-3 ${isNow ? 'rounded-xl bg-amber-500/6 p-3 -mx-1 border border-amber-500/25 shadow-[0_0_24px_-8px_rgba(245,158,11,.25)] cursor-pointer' : 'py-2.5 border-b border-[var(--border)] last:border-b-0'}`}
                    onClick={isNow ? () => setModal({ type: 'lesson', data: { subject: slot.mp, teacher: guruShort, room: slot.ruang, jpIndex: idx } }) : undefined}
                  >
                    <div className="w-12 flex-shrink-0 text-right">
                      <div className="text-[11px] font-extrabold">{t[0]}</div>
                      <div className="text-[9px] font-semibold text-[var(--muted)]">{JP[idx]![0]}</div>
                    </div>
                    <div className={`mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full border-2 border-[var(--bg)] shadow-[0_0_0_2px_var(--em)] ${dotCls}`} />
                    <div className="flex-1 min-w-0">
                      <div className={`text-[13px] font-bold ${isNow ? 'text-base' : ''}`}>{slot.mp}</div>
                      <div className={`mt-0.5 flex items-center gap-2 text-[11px] font-semibold ${isNow ? 'text-amber-500' : 'text-[var(--muted)]'}`}>
                        <span>{guruShort}</span>·<span>{slot.ruang}</span>
                      </div>
                      {isNow && (
                        <span className="mt-1 inline-block rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-extrabold text-amber-500">
                          ▶ Sedang berlangsung — klik untuk mulai sesi
                        </span>
                      )}
                      {isDone && (
                        <span className="mt-1 inline-block rounded bg-emerald-500/12 px-1.5 py-0.5 text-[9px] font-extrabold text-emerald-500">
                          Selesai
                        </span>
                      )}
                      {!isNow && !isDone && (
                        <span className="mt-1 inline-block rounded bg-white/5 px-1.5 py-0.5 text-[9px] font-extrabold text-[var(--muted)]">
                          Akan datang
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-6 text-center text-[var(--dim)]">
                <div className="mx-auto mb-2 h-8 w-8 opacity-50">📅</div>
                <div className="text-sm">Libur — tidak ada jadwal hari ini</div>
              </div>
            )}
          </div>
        </div>

        {/* Tugas Mendesak */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-[var(--muted)]">
              <ClipboardList className="h-3.5 w-3.5 text-emerald-500" />Tugas Mendesak
            </div>
            <button onClick={() => go('tugas')} className="flex items-center gap-0.5 text-[11px] font-bold text-emerald-400">
              Semua <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          <div className="space-y-2">
            {urgentTasks.length > 0 ? (
              urgentTasks.map((t: any) => {
                const c = mpColor(t.mp);
                const urgent = t.dlDays <= 1;
                return (
                  <button
                    key={t.id}
                    onClick={() => setModal({ type: 'task', data: { task: t } })}
                    className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left transition-all hover:border-[var(--border2)] hover:bg-[var(--surface2)]"
                  >
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl" style={{ background: `${c}20`, color: c }}>
                      <span className="text-lg">{(mpIcon(t.mp) || 'book').charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-sm font-bold">{t.title}</div>
                      <div className="mt-0.5 text-[11px] font-semibold text-[var(--muted)]">
                        {t.mp} · {t.dlDays === 0 ? '⚠ Deadline hari ini!' : `${t.dlDays ?? 1} hari lagi`}
                      </div>
                    </div>
                    <span
                      className={`flex-shrink-0 rounded-lg px-2 py-1 text-[10px] font-extrabold ${urgent ? 'bg-rose-500/15 text-rose-500' : 'bg-amber-500/15 text-amber-500'}`}
                    >
                      {String(t.type ?? 'Tugas')}
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="py-6 text-center text-[var(--dim)]">
                <div className="mx-auto mb-2 h-8 w-8 opacity-50">✓</div>
                <div className="text-sm">Tidak ada tugas pending</div>
              </div>
            )}
          </div>
        </div>

        {/* Nilai Terbaru */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-[var(--muted)]">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />Nilai Terbaru
            </div>
            <button onClick={() => go('nilai')} className="flex items-center gap-0.5 text-[11px] font-bold text-emerald-400">
              Detail <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {recentGrades.map((n: any) => {
              const c = mpColor(n.mp);
              const tuntas = n.rata >= n.kktp;
              return (
                <button
                  key={n.mp}
                  onClick={() => go('nilai')}
                  className="flex w-full items-center gap-3 py-3 text-left first:pt-0 last:pb-0"
                >
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl" style={{ background: `${c}20`, color: c }}>
                    <span className="text-sm font-extrabold">{(mpIcon(n.mp) || 'book').charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold">{n.mp}</div>
                    <div className="mt-0.5 text-[11px] font-semibold text-[var(--muted)]">
                      {tuntas ? 'Tuntas' : 'Remedial'} · KKTP {n.kktp}
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--bar-bg)]">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${n.rata}%`,
                          background: tuntas ? 'linear-gradient(90deg, #10b981, #059669)' : 'linear-gradient(90deg, #fbbf24, #d97706)',
                        }}
                      />
                    </div>
                  </div>
                  <div className={`text-lg font-extrabold tracking-tight ${tuntas ? 'text-emerald-400' : 'text-amber-500'}`}>
                    {n.rata ?? 0}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Progress Capaian */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-[var(--muted)]">
              <Award className="h-3.5 w-3.5 text-emerald-500" />Progress Capaian
            </div>
            <button onClick={() => go('capaian')} className="flex items-center gap-0.5 text-[11px] font-bold text-emerald-400">
              Badge <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {badgePreview.map((b: any) => (
              <button
                key={b.name}
                onClick={() => go('capaian')}
                className={`text-center transition-all hover:-translate-y-0.5 ${!b.earned ? 'opacity-35 grayscale' : ''}`}
              >
                <div
                  className="mx-auto mb-1.5 flex h-14 w-14 items-center justify-center rounded-full"
                  style={{ background: `${b.color}20`, border: `2px solid ${b.color}40` }}
                >
                  <span className="text-2xl" style={{ color: b.color }}>🏅</span>
                </div>
                <div className="text-[10px] font-bold">{b.name}</div>
                {!b.earned && <div className="mt-0.5 text-[9px] font-semibold text-[var(--muted)]">{b.prog ?? 0}%</div>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
