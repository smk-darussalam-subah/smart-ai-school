'use client';

import { useMemo } from 'react';
import {
  Flame, UserCheck, TrendingUp, ClipboardList, Award, CalendarClock,
  PlayCircle, ChevronRight, Target,
} from 'lucide-react';
import { wibNow, currentJp } from '@/lib/bell-times';
import { mpColor, mpIcon, JP_LABELS, JP_MAP, resolveSchedule } from './siswa-data';
import type { SiswaScreen, ModalState } from './SiswaWorkspace';
import type { SiswaNilai, SiswaTugas, SiswaBadge, SiswaModul, SiswaQuest, SiswaXP, SiswaKehadiranStats } from './siswa-types';

interface Props {
  showToast: (msg: string) => void;
  go: (screen: SiswaScreen) => void;
  setModal: (modal: ModalState) => void;
  setBadgeCelebration: (data: { show: boolean; badgeName?: string }) => void;
  setActiveModulId: (id: number | null) => void;
  grades: SiswaNilai[];
  tasks: SiswaTugas[];
  badges: SiswaBadge[];
  modules: SiswaModul[];
  quest: SiswaQuest;
  xp: SiswaXP;
  kehStats: SiswaKehadiranStats;
  schedule?: unknown[];
  userName?: string | null;
  studentClassName?: string | null;
}

export default function BerandaSiswa({ showToast, go, setModal, setActiveModulId, grades, tasks, badges, modules, quest, xp, kehStats, schedule, userName, studentClassName }: Props) {
  const now = wibNow();
  const dow = now.jsDay; // 0=Sunday → SCHED[0] undefined → shows "Libur"
  const currentJpIdx = currentJp(now.minutes);

  // Derived stats
  const avgNilai = useMemo(() => {
    if (grades.length === 0) return null;
    return Math.round(grades.reduce((a: number, b) => a + b.rata, 0) / grades.length * 10) / 10;
  }, [grades]);

  const pendingTasks = useMemo(() => tasks.filter((t) => t.status === 'pending'), [tasks]);
  const tuntasCount = useMemo(() => grades.filter((g) => g.rata >= g.kktp).length, [grades]);
  const earnedBadges = useMemo(() => badges.filter((b) => b.earned).length, [badges]);
  const activeModul = useMemo(() => modules.find((m) => m.status === 'Aktif'), [modules]);
  const hasAttendance = (kehStats?.total ?? 0) > 0;

  // Daily quest progress
  const qDone = quest.tasks.filter((t) => t.done).length;
  const qTotal = quest.tasks.length;
  const qPct = qTotal > 0 ? Math.round((qDone / qTotal) * 100) : 0;
  const qCirc = 2 * Math.PI * 22;

  // Today's schedule — resolveSchedule uses API data if available, falls back to SIM
  const { schedule: schedData, isSim: isSimSchedule } = resolveSchedule(schedule);
  const daySched = schedData[dow] || {};
  const hasSched = Object.keys(daySched).length > 0;

  // Urgent tasks (top 3)
  const urgentTasks = pendingTasks
    .sort((a, b) => a.dlDays - b.dlDays)
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
              Halo, {userName || 'Siswa'}! <span className="inline-block animate-[wave_1.5s_ease_infinite]">👋</span>
            </h1>
            <p className="mt-1 text-sm font-semibold text-[var(--muted)]">{studentClassName || '—'} · SMK Darussalam Subah</p>
            {xp.streakDays != null && xp.streakDays > 0 && (
              <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/12 px-3 py-1 text-[11px] font-extrabold text-amber-500">
                <Flame className="h-3.5 w-3.5" />{xp.streakDays} hari streak kehadiran!
              </span>
            )}
          </div>
          <button
            onClick={() => showToast(qTotal > 0 ? 'Daily Quest: Selesaikan quest hari ini!' : 'Daily Quest belum tersedia hari ini.')}
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
              {qDone}/{qTotal} Quest
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
            {hasAttendance ? (
              <>
                {kehStats.pct}<small className="text-sm font-bold text-[var(--muted)]">%</small>
              </>
            ) : '—'}
          </div>
          <div className="mt-0.5 text-[10.5px] font-bold text-[var(--muted)]">Kehadiran</div>
          <div className={`mt-0.5 text-[10px] font-extrabold ${hasAttendance ? 'text-emerald-500' : 'text-[var(--muted)]'}`}>
            {hasAttendance
              ? xp.streakDays != null && xp.streakDays > 0 ? `+ ${xp.streakDays} hari streak` : 'tercatat'
              : 'belum ada presensi'}
          </div>
        </button>

        <button
          onClick={() => go('nilai')}
          className="relative cursor-pointer overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5 text-left transition-all hover:border-[var(--border2)] hover:-translate-y-0.5"
        >
          <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/12 text-violet-500">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div className="text-xl font-extrabold tracking-tight">{avgNilai !== null ? avgNilai : '—'}</div>
          <div className="mt-0.5 text-[10.5px] font-bold text-[var(--muted)]">Rata² Nilai</div>
          <div className={`mt-0.5 text-[10px] font-extrabold ${avgNilai === null ? 'text-[var(--muted)]' : avgNilai >= 75 ? 'text-emerald-500' : 'text-rose-500'}`}>
            {grades.length > 0 ? `${tuntasCount}/${grades.length} tuntas` : 'belum ada nilai'}
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
          <div className={`mt-0.5 text-[10px] font-extrabold ${pendingTasks.length > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
            {pendingTasks.length > 0 ? 'perlu dikerjakan' : 'tidak ada tugas'}
          </div>
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
          <div className="mt-0.5 text-[10px] font-extrabold text-emerald-500">Level {xp.level}</div>
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
              {isSimSchedule && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] text-amber-500">Simulasi</span>}
            </div>
            <button onClick={() => go('jadwal')} className="flex items-center gap-0.5 text-[11px] font-bold text-emerald-400">
              Lihat semua <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          <div className="space-y-2">
            {hasSched ? (
              JP_MAP.map(([, idx]) => {
                const slot = daySched[idx];
                if (!slot) return null;
                const isDone = idx < (currentJpIdx === 0 ? -1 : JP_MAP.findIndex(([j]) => j === currentJpIdx));
                const isNow = currentJpIdx > 0 && JP_MAP[currentJpIdx - 1]?.[1] === idx;
                const dotCls = isDone ? 'bg-emerald-500' : isNow ? 'bg-amber-500 animate-pulse' : 'bg-transparent border-2 border-[var(--dim)]';
                const t = JP_LABELS[idx]![1].split('–');
                const guruShort = slot.g.split(',')[0] ?? slot.g;

                return (
                  <div
                    key={idx}
                    className={`flex gap-3 ${isNow ? 'rounded-xl bg-amber-500/6 p-3 -mx-1 border border-amber-500/25 shadow-[0_0_24px_-8px_rgba(245,158,11,.25)] cursor-pointer' : 'py-2.5 border-b border-[var(--border)] last:border-b-0'}`}
                    onClick={isNow ? () => setModal({ type: 'lesson', data: { subject: slot.mp, teacher: guruShort, room: slot.ruang, jpIndex: idx } }) : undefined}
                  >
                    <div className="w-12 flex-shrink-0 text-right">
                      <div className="text-[11px] font-extrabold">{t[0]}</div>
                      <div className="text-[9px] font-semibold text-[var(--muted)]">{JP_LABELS[idx]![0]}</div>
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
              urgentTasks.map((t) => {
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
            {recentGrades.map((n) => {
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
            {badgePreview.map((b) => (
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
