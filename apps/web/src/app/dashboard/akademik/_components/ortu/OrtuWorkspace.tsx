'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import {
  Home, CalendarCheck, TrendingUp, Wallet, Award,
  Sun, Moon, Bell, ChevronDown,
  LogOut, X, User as UserIcon,
} from 'lucide-react';
import clsx from 'clsx';
import ViewAsBanner from '@/components/layout/ViewAsBanner';
import BerandaOrtu from './BerandaOrtu';
import KehadiranOrtu from './KehadiranOrtu';
import NilaiOrtu from './NilaiOrtu';
import PembayaranOrtu from './PembayaranOrtu';
import CapaianOrtu from './CapaianOrtu';
import GradeDetailModal from './GradeDetailModal';
import PengumumanModal from './PengumumanModal';
import DayDetailModal from './DayDetailModal';
import RaporModal from './RaporModal';
import PayDetailModal from './PayDetailModal';
import PushNotificationToggle from '@/components/shared/PushNotificationToggle';
import { subscribePush, unsubscribePush } from '../../actions';
import { initials } from './ortu-data';
import type { OrtuChild, OrtuNilai, OrtuPengumuman } from './ortu-types';
import type { AttendanceCellStatus, Pembayaran } from '@/lib/academic';
import type { GradeItem, AttendanceItem } from '@/lib/api';
import type { ScheduleItem } from '../guru-types';
import { filterByStudentId, type OrtuAssignmentItem, type SppApiItem } from './ortu-mappers';

// ── Types (exported for child components) ───────────────────────────────────

export type OrtuScreen = 'beranda' | 'kehadiran' | 'nilai' | 'pembayaran' | 'capaian';

export interface ModalState {
  type: 'grade' | 'pengumuman' | 'day' | 'rapor' | 'task' | 'pay' | 'teacher' | null;
  data?: Record<string, unknown>;
}

// ── Props ───────────────────────────────────────────────────────────────────

interface OrtuWorkspaceProps {
  children?: OrtuChild[];
  grades?: GradeItem[];
  attendance?: AttendanceItem[];
  schedule?: Array<ScheduleItem & { studentId?: string }>;
  announcements?: { id: string; title: string; createdAt: string }[];
  spp?: SppApiItem[];
  assignments?: OrtuAssignmentItem[];
  badges?: Array<{ id: string; studentId?: string; awardedAt: string; badge: { id: string; code: string; name: string; description: string; icon: string; tier: string } }>;
  waLog?: Array<{ id: string; studentId: string; recipient: string; message: string; eventType: string; createdAt: string }>;
  viewAs?: string | null;
  semesterLabel?: string;
  childRanks?: Record<string, number | null>;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function OrtuWorkspace({
  children: realChildren, grades, attendance, schedule, announcements, spp: realSpp, badges: realBadges, waLog: realWaLog, viewAs, semesterLabel, childRanks
}: OrtuWorkspaceProps) {
  const { data: session } = useSession();
  const [activeScreen, setActiveScreen] = useState<OrtuScreen>('beranda');
  const [modal, setModal] = useState<ModalState>({ type: null });
  const [toast, setToast] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [accountOpen, setAccountOpen] = useState(false);
  // T1-02 (audit v2): active child state untuk multi-child selector (C1 fix).
  const [activeChildIndex, setActiveChildIndex] = useState(0);
  const [childSelectorOpen, setChildSelectorOpen] = useState(false);

  // Theme management — scoped to .ortu-app CSS variables (§6.4)
  useEffect(() => {
    const saved = localStorage.getItem('diis-ortu-theme') as 'dark' | 'light' | null;
    if (saved) setTheme(saved);
    document.documentElement.setAttribute('data-theme', saved || 'dark');
  }, []);

  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('diis-ortu-theme', next);
    document.documentElement.setAttribute('data-theme', next);
    showToast(`Tema: ${next === 'dark' ? 'Gelap' : 'Terang'}`);
  }, [theme]);

  // Toast system
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Navigation
  const go = useCallback((screen: OrtuScreen) => {
    setActiveScreen(screen);
    window.scrollTo(0, 0);
  }, []);

  // Child selector — use real data (P25) or empty. T1-02: activeChildIndex untuk multi-child.
  const childList = realChildren?.length ? realChildren : [];
  const child = childList[activeChildIndex] ?? childList[0] ?? { id: 0, name: 'Anak', kelas: '—', active: false, avg: 0, att: 0, wali: '—' };
  const activeStudentId = 'studentId' in child ? child.studentId : undefined;
  const childGrades = filterByStudentId(grades, activeStudentId);
  const childAttendance = filterByStudentId(attendance, activeStudentId);
  const childSchedule = filterByStudentId(schedule, activeStudentId);
  const childSpp = filterByStudentId(realSpp, activeStudentId);
  const childBadges = filterByStudentId(realBadges, activeStudentId);
  const childWaLog = filterByStudentId(realWaLog, activeStudentId);
  const activeChildRank = activeStudentId ? childRanks?.[activeStudentId] ?? null : null;
  const selectChild = (i: number) => {
    setActiveChildIndex(i);
    setChildSelectorOpen(false);
    window.scrollTo(0, 0);
  };

  // Dynamic unpaid payment count for nav badge — use real SPP data (P25)
  const unpaidCount = childSpp?.filter((p) => p.status === 'unpaid').length ?? 0;

  const navItems: { key: OrtuScreen; label: string; icon: typeof Home }[] = [
    { key: 'beranda', label: 'Beranda', icon: Home },
    { key: 'kehadiran', label: 'Kehadiran', icon: CalendarCheck },
    { key: 'nilai', label: 'Nilai', icon: TrendingUp },
    { key: 'pembayaran', label: 'Bayar', icon: Wallet },
    { key: 'capaian', label: 'Capaian', icon: Award },
  ];

  const renderScreen = () => {
    switch (activeScreen) {
      case 'beranda':
        return (
          <BerandaOrtu
            showToast={showToast}
            go={go}
            setModal={setModal}
            grades={childGrades}
            announcements={announcements}
            children={childList}
            activeChildIndex={Math.min(activeChildIndex, Math.max(childList.length - 1, 0))}
            schedule={childSchedule}
            spp={childSpp ?? []}
            waLog={childWaLog ?? []}
            attendance={childAttendance ?? []}
            rank={activeChildRank}
          />
        );
      // Following screens implemented in subsequent batches
      case 'kehadiran':
        return (
          <KehadiranOrtu
            go={go}
            setModal={setModal}
            attendance={childAttendance ?? []}
            waLog={childWaLog ?? []}
          />
        );
      case 'nilai':
        return (
          <NilaiOrtu
            setModal={setModal}
            grades={childGrades}
          />
        );
      case 'pembayaran':
        return (
          <PembayaranOrtu
            setModal={setModal}
            spp={childSpp}
          />
        );
      case 'capaian':
        return (
          <CapaianOrtu
            setModal={setModal}
            showToast={showToast}
            badges={childBadges}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="ortu-app relative min-h-screen bg-[var(--bg)] text-[var(--text)] transition-colors duration-300">
      {/* Topbar */}
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--topbar-bg)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[560px] items-center justify-between px-4 py-3.5">
          {/* Brand */}
          <div className="flex items-center gap-2">
            <div className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-[var(--grad)] text-[12px] font-extrabold text-white">
              DIIS
            </div>
            <span className="text-[14px] font-extrabold">Orang Tua</span>
          </div>

          {/* Right buttons */}
          <div className="flex items-center gap-1.5">
            {/* Child selector — T1-02 (C1 fix): dropdown real, bukan toast */}
            <div className="relative">
              <button
                onClick={() => childList.length > 0 && setChildSelectorOpen((o) => !o)}
                className="flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 transition-colors hover:border-[var(--pri)]"
                aria-label="Pilih anak"
                aria-expanded={childSelectorOpen}
                disabled={childList.length === 0}
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--grad)] text-[10px] font-extrabold text-white">
                  {initials(child.name)}
                </div>
                <span className="text-[12px] font-bold whitespace-nowrap">{child.name.split(' ')[0]}</span>
                <ChevronDown className="h-[14px] w-[14px] text-[var(--muted)]" />
              </button>
              {childSelectorOpen && childList.length > 0 && (
                <div className="absolute right-0 top-full z-30 mt-1.5 min-w-[180px] overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface)] shadow-lg">
                  {childList.map((c, i) => (
                    <button
                      key={c.id}
                      onClick={() => selectChild(i)}
                      className={`flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-[12px] font-bold transition-colors hover:bg-[var(--surface2)] ${i === activeChildIndex ? 'text-[var(--pri)]' : 'text-[var(--text)]'}`}
                    >
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--grad)] text-[9px] font-extrabold text-white">
                        {initials(c.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{c.name}</div>
                        <div className="text-[9px] font-semibold text-[var(--muted)]">{c.kelas}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Bell / Pengumuman */}
            <button
              onClick={() => setModal({ type: 'pengumuman' })}
              className="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-[10px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] transition-colors hover:bg-[var(--surface2)]"
              aria-label="Pengumuman"
            >
              <Bell className="h-[18px] w-[18px]" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[var(--rose)] ring-1.5 ring-[var(--topbar-bg)]" />
            </button>

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-[10px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] transition-colors hover:bg-[var(--surface2)]"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>

            {/* Account */}
            <button
              onClick={() => setAccountOpen(true)}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-[10px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] transition-colors hover:bg-[var(--surface2)]"
              aria-label="Akun"
            >
              <UserIcon className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      </header>

      {/* View-As Banner (when impersonating) */}
      {viewAs && <ViewAsBanner viewAs={viewAs} />}

      {/* Screen content */}
      <main className="mx-auto max-w-[560px] pb-24">
        {renderScreen()}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-1/2 z-30 w-full max-w-[560px] -translate-x-1/2 border-t border-[var(--border)] bg-[var(--nav-bg)] backdrop-blur-2xl">
        <div className="flex items-center justify-around px-2 py-1.5">
          {navItems.map(({ key, label, icon: Icon }) => {
            const isActive = activeScreen === key;
            return (
              <button
                key={key}
                onClick={() => go(key)}
                className={clsx(
                  'relative flex flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 transition-all duration-200',
                  isActive ? 'text-[var(--pril)]' : 'text-[var(--dim)]',
                )}
                aria-label={label}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon className={clsx('h-5 w-5', isActive && 'drop-shadow-[0_0_6px_rgba(59,130,246,.4)]')} />
                <span className="text-[9.5px] font-bold">{label}</span>
                {/* Payment badge — dynamic unpaid count */}
                {key === 'pembayaran' && unpaidCount > 0 && (
                  <span className="absolute right-[calc(50%-18px)] top-0.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-[var(--rose)] px-1 text-[8.5px] font-extrabold text-white">
                    {unpaidCount}
                  </span>
                )}
                {/* Active indicator */}
                {isActive && (
                  <span className="absolute left-[30%] right-[30%] top-0 h-[2.5px] rounded-full bg-[var(--pri)]" />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Modals */}
      {modal.type === 'grade' && (
        <GradeDetailModal
          nilai={(modal.data as { nilai: OrtuNilai }).nilai}
          onClose={() => setModal({ type: null })}
        />
      )}

      {modal.type === 'pengumuman' && (
        <PengumumanModal
          announcements={(announcements ?? []) as unknown as OrtuPengumuman[]}
          onClose={() => setModal({ type: null })}
        />
      )}

      {modal.type === 'day' && (
        <DayDetailModal
          day={(modal.data as { day: number }).day}
          status={(modal.data as { status: AttendanceCellStatus }).status}
          month={(modal.data as { month: string }).month}
          year={(modal.data as { year: number }).year}
          onClose={() => setModal({ type: null })}
        />
      )}

      {modal.type === 'rapor' && (
        <RaporModal
          nilai={(childGrades ?? []) as unknown as OrtuNilai[]}
          onClose={() => setModal({ type: null })}
          showToast={showToast}
          studentName={child.name}
          catatanWaliKelas={null}
          semesterLabel={semesterLabel}
        />
      )}

      {modal.type === 'pay' && (
        <PayDetailModal
          payment={(modal.data as { payment: Pembayaran }).payment}
          onClose={() => setModal({ type: null })}
          showToast={showToast}
        />
      )}

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
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--grad)] text-lg font-extrabold text-white">
                {initials(session?.user?.name ?? 'U')}
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
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 animate-[fadeIn_.3s_ease] rounded-[10px] border border-[var(--border2)] bg-[var(--bg2)] px-4 py-2.5 text-[12px] font-semibold text-[var(--text)] shadow-[var(--shlift)]">
          {toast}
        </div>
      )}
    </div>
  );
}
