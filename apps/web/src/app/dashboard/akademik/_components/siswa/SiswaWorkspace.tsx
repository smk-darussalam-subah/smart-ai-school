'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import {
  Home, CalendarClock, BookOpen, TrendingUp, ClipboardList,
  UserCheck, Award, Sun, Moon, Bell, ChevronLeft,
  LogOut, X, User as UserIcon,
} from 'lucide-react';
import clsx from 'clsx';
import ViewAsBanner from '@/components/layout/ViewAsBanner';
import BerandaSiswa from './BerandaSiswa';
import JadwalSiswa from './JadwalSiswa';
import ModulSiswa from './ModulSiswa';
import ModulDetailSiswa from './ModulDetailSiswa';
import NilaiSiswa from './NilaiSiswa';
import TugasSiswa from './TugasSiswa';
import KehadiranSiswa from './KehadiranSiswa';
import CapaianSiswa from './CapaianSiswa';
import ProfileCV from './ProfileCV';
import PengumumanModal from './PengumumanModal';
import BadgeCelebration from './BadgeCelebration';
import LessonSessionModal from './LessonSessionModal';
import ClassDetailModal from './ClassDetailModal';
import TaskDetailModal from './TaskDetailModal';
import DayDetailModal from './DayDetailModal';
import BadgeDetailModal from './BadgeDetailModal';
import PushNotificationToggle from '@/components/shared/PushNotificationToggle';
import { subscribePush, unsubscribePush } from '../../actions';
import {
  SIM_DAILY_QUEST, SIM_KALENDER,
  normalizeAnnouncements,
} from './siswa-data';
import type { SiswaNilai, SiswaTugas, SiswaBadge, SiswaXP, SiswaLeaderboardEntry, SiswaModul, SiswaCP, SiswaKehadiranStats, BadgeCelebrationData } from './siswa-types';
import type { AttendanceEntry } from './KehadiranSiswa';

export type SiswaScreen = 'beranda' | 'jadwal' | 'modul' | 'nilai' | 'tugas' | 'kehadiran' | 'capaian';

// ── Modal data types (discriminated union) ─────────────────────────────────
export interface LessonModalData {
  subject: string;
  teacher: string;
  room: string;
  jpIndex: number;
}
export interface TaskModalData {
  task: SiswaTugas;
}
export interface DayModalData {
  day: number;
  status: string;
}
export interface BadgeModalData {
  badge: SiswaBadge;
}

export type ModalState =
  | { type: 'lesson'; data: LessonModalData }
  | { type: 'class'; data: LessonModalData }
  | { type: 'task'; data: TaskModalData }
  | { type: 'day'; data: DayModalData }
  | { type: 'badge'; data: BadgeModalData }
  | { type: 'pengumuman' }
  | { type: null };

interface SiswaWorkspaceProps {
  grades?: unknown[];
  attendance?: unknown[];
  schedule?: unknown[];
  announcements?: unknown[];
  realBadges?: SiswaBadge[] | null;
  realXp?: SiswaXP | null;
  realLeaderboard?: SiswaLeaderboardEntry[] | null;
  realAssignments?: unknown[] | null;
  realModules?: unknown[] | null;
  realCp?: unknown[] | null;
  realAttStats?: { hadir: number; izin: number; sakit: number; alpha: number; total: number; pct: number } | null;
  viewAs?: string | null;
}

function initials(name?: string | null): string {
  if (!name) return 'U';
  return name.split(' ').map((w) => w.charAt(0)).slice(0, 2).join('').toUpperCase();
}

export default function SiswaWorkspace({ grades, attendance, schedule, announcements, realBadges, realXp, realLeaderboard, realAssignments, realModules, realCp, realAttStats, viewAs }: SiswaWorkspaceProps) {
  const { data: session } = useSession();
  const [activeScreen, setActiveScreen] = useState<SiswaScreen>('beranda');
  const [activeModulId, setActiveModulId] = useState<number | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [modal, setModal] = useState<ModalState>({ type: null });
  const [badgeCelebration, setBadgeCelebration] = useState<BadgeCelebrationData>({ show: false });
  const [toast, setToast] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Theme management
  useEffect(() => {
    const saved = localStorage.getItem('diis-theme') as 'dark' | 'light' | null;
    if (saved) setTheme(saved);
    document.documentElement.setAttribute('data-theme', saved || 'dark');
  }, []);

  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('diis-theme', next);
    document.documentElement.setAttribute('data-theme', next);
    showToast(`Theme: ${next === 'dark' ? 'Gelap' : 'Terang'}`);
  }, [theme]);

  // Toast system
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Navigation
  const go = useCallback((screen: SiswaScreen) => {
    setActiveScreen(screen);
    setActiveModulId(null);
    window.scrollTo(0, 0);
  }, []);

  // Swipe gesture for Profile CV
  useEffect(() => {
    let touchStartX = 0;
    let touchEndX = 0;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartX = e.changedTouches[0]?.screenX ?? 0;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      touchEndX = e.changedTouches[0]?.screenX ?? 0;
      const diff = touchStartX - touchEndX;
      if (Math.abs(diff) > 60) {
        if (diff > 0 && !profileOpen) setProfileOpen(true); // swipe left
        if (diff < 0 && profileOpen) setProfileOpen(false); // swipe right
      }
    };

    document.addEventListener('touchstart', handleTouchStart);
    document.addEventListener('touchend', handleTouchEnd);
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [profileOpen]);

  const navItems: { key: SiswaScreen; label: string; icon: typeof Home }[] = [
    { key: 'beranda', label: 'Beranda', icon: Home },
    { key: 'jadwal', label: 'Jadwal', icon: CalendarClock },
    { key: 'modul', label: 'Modul', icon: BookOpen },
    { key: 'nilai', label: 'Nilai', icon: TrendingUp },
    { key: 'tugas', label: 'Tugas', icon: ClipboardList },
    { key: 'kehadiran', label: 'Hadir', icon: UserCheck },
    { key: 'capaian', label: 'Capaian', icon: Award },
  ];

  const renderScreen = () => {
    const commonProps = {
      showToast,
      go,
      setModal,
      setBadgeCelebration,
      setActiveModulId,
    };

    switch (activeScreen) {
      case 'beranda':
        return (
          <BerandaSiswa
            {...commonProps}
            grades={(grades ?? []) as SiswaNilai[]}
            tasks={(realAssignments ?? []) as unknown as SiswaTugas[]}
            badges={realBadges ?? []}
            modules={(realModules ?? []) as unknown as SiswaModul[]}
            quest={SIM_DAILY_QUEST}
            xp={realXp ?? { level: 1, current: 0, next: 500 }}
            kehStats={realAttStats ?? { hadir: 0, izin: 0, sakit: 0, alpha: 0, total: 0, pct: 0 }}
            schedule={schedule || []}
          />
        );
      case 'jadwal':
        return (
          <JadwalSiswa
            {...commonProps}
            schedule={schedule || []}
            kalender={SIM_KALENDER}
          />
        );
      case 'modul':
        if (activeModulId) {
          return null; // ModulDetail rendered separately
        }
        return (
          <ModulSiswa
            {...commonProps}
            modules={(realModules ?? []) as unknown as SiswaModul[]}
            badges={realBadges ?? []}
            setActiveModulId={setActiveModulId}
          />
        );
      case 'nilai':
        return (
          <NilaiSiswa
            {...commonProps}
            grades={(grades ?? []) as SiswaNilai[]}
          />
        );
      case 'tugas':
        return (
          <TugasSiswa
            {...commonProps}
            tasks={(realAssignments ?? []) as unknown as SiswaTugas[]}
          />
        );
      case 'kehadiran':
        return (
          <KehadiranSiswa
            {...commonProps}
            stats={(realAttStats ?? { hadir: 0, izin: 0, sakit: 0, alpha: 0, total: 0, pct: 0 }) as SiswaKehadiranStats}
            attendance={(attendance || []) as AttendanceEntry[]}
          />
        );
      case 'capaian':
        return (
          <CapaianSiswa
            {...commonProps}
            xp={realXp ?? { level: 1, current: 0, next: 500 }}
            leaderboard={realLeaderboard ?? []}
            cpData={(realCp ?? []) as unknown as SiswaCP[]}
            badges={realBadges ?? []}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="siswa-app relative min-h-screen bg-[var(--bg)] text-[var(--text)] transition-colors duration-300">
      {/* Topbar */}
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--topbar-bg)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[560px] items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-800 text-base font-extrabold text-white shadow-[0_0_20px_rgba(16,185,129,.3)]">
              D
            </div>
            <div>
              <div className="text-sm font-bold">DIIS</div>
              <div className="text-[10px] font-semibold text-[var(--muted)]">Smart AI School</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] transition-colors hover:bg-[var(--surface2)]"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              onClick={() => setModal({ type: 'pengumuman' })}
              className="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] transition-colors hover:bg-[var(--surface2)]"
              aria-label="Pengumuman"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-rose-500 ring-2 ring-[var(--bg)]" />
            </button>
            <button
              onClick={() => setAccountOpen(true)}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] transition-colors hover:bg-[var(--surface2)]"
              aria-label="Akun"
            >
              <UserIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* View-As Banner (when impersonating) */}
      {viewAs && <ViewAsBanner viewAs={viewAs} />}

      {/* Screen content */}
      <main className="mx-auto max-w-[560px] pb-24">
        {activeScreen === 'modul' && activeModulId ? (
          <ModulDetailSiswa
            moduleId={activeModulId}
            go={go}
            setActiveModulId={setActiveModulId}
            setBadgeCelebration={setBadgeCelebration}
            showToast={showToast}
          />
        ) : (
          renderScreen()
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-1/2 z-30 w-full max-w-[560px] -translate-x-1/2 border-t border-[var(--border)] bg-[var(--nav-bg)] backdrop-blur-2xl">
        <div className="flex items-center justify-around px-2 py-2">
          {navItems.map(({ key, label, icon: Icon }) => {
            const isActive = activeScreen === key;
            return (
              <button
                key={key}
                onClick={() => go(key)}
                className={clsx(
                  'flex flex-col items-center gap-1 rounded-lg px-2 py-1.5 transition-all duration-200',
                  isActive ? 'text-emerald-500' : 'text-[var(--dim)]'
                )}
                aria-label={label}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon className={clsx('h-5 w-5', isActive && 'drop-shadow-[0_0_6px_rgba(16,185,129,.4)]')} />
                <span className="text-[9px] font-bold">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Swipe hint for Profile CV */}
      {!profileOpen && (
        <button
          onClick={() => setProfileOpen(true)}
          className="fixed right-0 top-1/2 z-25 -translate-y-1/2"
          aria-label="Open Profile CV"
        >
          <div className="flex h-[70px] w-[22px] animate-[swipePulse_2s_ease_infinite] items-center justify-center rounded-l-xl bg-gradient-to-br from-emerald-500 to-emerald-800">
            <ChevronLeft className="h-3.5 w-3.5 text-white" />
          </div>
        </button>
      )}

      {/* Modals & Overlays */}
      {modal.type === 'pengumuman' && (
        <PengumumanModal
          announcements={announcements?.length
            ? normalizeAnnouncements(announcements as { id: string; title: string; createdAt: string }[])
            : []}
          onClose={() => setModal({ type: null })}
        />
      )}

      {modal.type === 'lesson' && (
        <LessonSessionModal
          subject={modal.data.subject}
          teacher={modal.data.teacher}
          room={modal.data.room}
          jpIndex={modal.data.jpIndex}
          onClose={() => setModal({ type: null })}
          openModulDetail={(id: number) => {
            setModal({ type: null });
            setActiveModulId(id);
            setActiveScreen('modul');
          }}
        />
      )}

      {modal.type === 'class' && (
        <ClassDetailModal
          subject={modal.data.subject}
          teacher={modal.data.teacher}
          room={modal.data.room}
          jpIndex={modal.data.jpIndex}
          onClose={() => setModal({ type: null })}
        />
      )}

      {modal.type === 'task' && (
        <TaskDetailModal
          task={modal.data.task}
          onClose={() => setModal({ type: null })}
          showToast={showToast}
        />
      )}

      {modal.type === 'day' && (
        <DayDetailModal
          day={modal.data.day}
          status={modal.data.status}
          onClose={() => setModal({ type: null })}
        />
      )}

      {modal.type === 'badge' && (
        <BadgeDetailModal
          badge={modal.data.badge}
          onClose={() => setModal({ type: null })}
        />
      )}

      {badgeCelebration.show && (
        <BadgeCelebration
          badgeName={badgeCelebration.badgeName}
          onClose={() => setBadgeCelebration({ show: false })}
          go={go}
        />
      )}

      {/* Profile CV Slide-in */}
      <ProfileCV
        isOpen={profileOpen}
        onClose={() => setProfileOpen(false)}
        showToast={showToast}
        go={go}
        badges={realBadges ?? []}
      />

      {/* Account Sheet */}
      {accountOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          onClick={() => setAccountOpen(false)}
        >
          <div className="absolute inset-0 bg-black/50" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Panel Akun"
            className="relative w-full max-w-[560px] rounded-t-2xl border-t border-[var(--border)] bg-[var(--bg2)] p-5 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setAccountOpen(false)}
              aria-label="Tutup"
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface2)]"
            >
              <X className="h-4 w-4" />
            </button>

            {/* User info */}
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-800 text-lg font-extrabold text-white">
                {initials(session?.user?.name)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-[var(--text)]">{session?.user?.name ?? 'Pengguna'}</p>
                <p className="truncate text-xs text-[var(--muted)]">{session?.user?.email ?? ''}</p>
              </div>
            </div>

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="mb-2 flex w-full items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--surface2)]"
            >
              <span className="flex items-center gap-2">
                {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                Tema {theme === 'dark' ? 'Gelap' : 'Terang'}
              </span>
              <span className="text-xs text-[var(--muted)]">Ketuk untuk ganti</span>
            </button>

            {/* T3-03: Push notification toggle */}
            <PushNotificationToggle onSubscribe={subscribePush} onUnsubscribe={unsubscribePush} />

            {/* Logout */}
            <button
              onClick={() => { window.location.href = '/api/auth/federated-logout'; }}
              className="flex w-full items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-500 transition-colors hover:bg-red-500/20"
            >
              <LogOut className="h-4 w-4" />
              Keluar
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 animate-[fadeIn_.3s_ease] rounded-xl border border-emerald-500 bg-[var(--bg2)] px-5 py-3 text-[12.5px] font-bold text-[var(--text)] shadow-[0_8px_40px_-12px_rgba(0,0,0,.6)]">
          {toast}
        </div>
      )}
    </div>
  );
}
