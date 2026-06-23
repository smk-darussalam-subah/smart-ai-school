'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Home, CalendarClock, BookOpen, TrendingUp, ClipboardList,
  UserCheck, Award, Sun, Moon, Bell, Settings, ChevronLeft,
} from 'lucide-react';
import clsx from 'clsx';
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
import {
  SIM_PENGUMUMAN, SIM_NILAI, SIM_TUGAS, SIM_KEH_STATS,
  SIM_BADGES, SIM_MODULS, SIM_CPDATA,
  SIM_DAILY_QUEST, SIM_KALENDER, SIM_XP, SIM_LEADERBOARD,
  normalizeAnnouncements,
} from './siswa-data';
import type { SiswaNilai, SiswaTugas, SiswaBadge, BadgeCelebrationData } from './siswa-types';
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
}

export default function SiswaWorkspace({ grades, attendance, schedule, announcements }: SiswaWorkspaceProps) {
  const [activeScreen, setActiveScreen] = useState<SiswaScreen>('beranda');
  const [activeModulId, setActiveModulId] = useState<number | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
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
            grades={(grades?.length ? grades : SIM_NILAI) as SiswaNilai[]}
            tasks={SIM_TUGAS}
            badges={SIM_BADGES}
            modules={SIM_MODULS}
            quest={SIM_DAILY_QUEST}
            xp={SIM_XP}
            kehStats={SIM_KEH_STATS}
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
            modules={SIM_MODULS}
            badges={SIM_BADGES}
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
            tasks={SIM_TUGAS}
          />
        );
      case 'kehadiran':
        return (
          <KehadiranSiswa
            {...commonProps}
            stats={SIM_KEH_STATS}
            attendance={(attendance || []) as AttendanceEntry[]}
          />
        );
      case 'capaian':
        return (
          <CapaianSiswa
            {...commonProps}
            xp={SIM_XP}
            leaderboard={SIM_LEADERBOARD}
            cpData={SIM_CPDATA}
            badges={SIM_BADGES}
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
              onClick={() => showToast('Pengaturan (simulasi)')}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] transition-colors hover:bg-[var(--surface2)]"
              aria-label="Settings"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Mockup badge */}
      <div className="mx-auto max-w-[560px] px-5 py-2">
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] font-bold text-amber-500">
          <span className="text-xs">🧪</span> MOCKUP — Data dummy untuk preview. Dashboard Siswa DIIS.
        </div>
      </div>

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
            : SIM_PENGUMUMAN}
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
      />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 animate-[fadeIn_.3s_ease] rounded-xl border border-emerald-500 bg-[var(--bg2)] px-5 py-3 text-[12.5px] font-bold text-[var(--text)] shadow-[0_8px_40px_-12px_rgba(0,0,0,.6)]">
          {toast}
        </div>
      )}
    </div>
  );
}
