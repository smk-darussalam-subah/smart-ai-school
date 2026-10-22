// Utility functions for Dashboard Orang Tua.
// P6: All SIMULASI constants purged — data comes from real API endpoints.

import { learnerGradeSummary } from '@/lib/learner-grades';
import { jakartaToday } from '@/lib/learner-attendance';
import { type JpSlot, fmtMin } from '@/lib/bell-times';
import type { OrtuNilai, OrtuLeaderboardEntry } from './ortu-types';

// ── Mapel Colors & helpers ──────────────────────────────────────────────────

export const MAPEL_COLORS: Record<string, string> = {
  'Pemrograman Web': '#10b981',
  'Basis Data': '#0ea5e9',
  Matematika: '#a78bfa',
  'B.Inggris': '#f59e0b',
  'B.Indonesia': '#ec4899',
  Fisika: '#ef4444',
  PJOK: '#14b8a6',
  PKn: '#8b5cf6',
};

export function mpColor(mp: string): string {
  return MAPEL_COLORS[mp] || '#3b82f6';
}

/** Inisial dari nama (untuk avatar). */
export function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w.charAt(0))
    .slice(0, 2)
    .join('');
}

/** Label waktu untuk JP dari JP_SLOTS. */
export function jpTimeRange(jp: number, JP_SLOTS: JpSlot[] = []): string {
  const slot = JP_SLOTS.find((s) => s.jp === jp);
  if (!slot) return '';
  return `${fmtMin(slot.startMin)}\u2013${fmtMin(slot.endMin)}`;
}

// ── Derived helpers ─────────────────────────────────────────────────────────

export function avgNa(nilai: OrtuNilai[]): number | null {
  return learnerGradeSummary(nilai).average;
}

export function childRank(leaderboard: OrtuLeaderboardEntry[]): number {
  return leaderboard.findIndex((s) => s.me) + 1;
}

export function tuntasCount(nilai: OrtuNilai[]): number {
  return learnerGradeSummary(nilai).tuntas;
}

export function gradeCls(v: number | null, kktp: number | null): 'ok' | 'warn' | 'bad' | 'unknown' {
  if (v === null || kktp === null) return 'unknown';
  if (v >= kktp) return 'ok';
  if (v >= 60) return 'warn';
  return 'bad';
}

export const ATT_STATUS_LABELS: Record<string, string> = {
  hadir: 'Hadir',
  izin: 'Izin',
  sakit: 'Sakit',
  alpha: 'Alpha — tanpa keterangan',
  empty: 'Belum ada catatan',
  none: 'Belum ada catatan',
  future: 'Tanggal mendatang — belum ada data',
  holiday: 'Libur kalender sekolah',
  outside: 'Di luar bulan pilihan',
};

export function currentMonthYear(): { month: string; year: number } {
  const now = new Date(`${jakartaToday()}T12:00:00`);
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'Mei',
    'Jun',
    'Jul',
    'Ags',
    'Sep',
    'Okt',
    'Nov',
    'Des',
  ];
  return { month: months[now.getMonth()]!, year: now.getFullYear() };
}
