// Utility functions for Dashboard Orang Tua.
// P6: All SIMULASI constants purged — data comes from real API endpoints.

import { KKTP_DEFAULT } from '@/lib/academic';
import { JP_SLOTS, fmtMin } from '@/lib/bell-times';
import type { OrtuNilai, OrtuLeaderboardEntry } from './ortu-types';

// ── Mapel Colors & helpers ──────────────────────────────────────────────────

export const MAPEL_COLORS: Record<string, string> = {
  'Pemrograman Web': '#10b981',
  'Basis Data': '#0ea5e9',
  'Matematika': '#a78bfa',
  'B.Inggris': '#f59e0b',
  'B.Indonesia': '#ec4899',
  'Fisika': '#ef4444',
  'PJOK': '#14b8a6',
  'PKn': '#8b5cf6',
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
export function jpTimeRange(jp: number): string {
  const slot = JP_SLOTS.find((s) => s.jp === jp);
  if (!slot) return '';
  return `${fmtMin(slot.startMin)}\u2013${fmtMin(slot.endMin)}`;
}

// ── Derived helpers ─────────────────────────────────────────────────────────

export function avgNa(nilai: OrtuNilai[]): number {
  if (nilai.length === 0) return 0;
  return Math.round((nilai.reduce((s, n) => s + n.na, 0) / nilai.length) * 10) / 10;
}

export function childRank(leaderboard: OrtuLeaderboardEntry[]): number {
  return leaderboard.findIndex((s) => s.me) + 1;
}

export function tuntasCount(nilai: OrtuNilai[], kktp: number = KKTP_DEFAULT): number {
  return nilai.filter((n) => n.na >= kktp).length;
}

export function gradeCls(v: number, kktp: number = KKTP_DEFAULT): 'ok' | 'warn' | 'bad' {
  if (v >= kktp) return 'ok';
  if (v >= 60) return 'warn';
  return 'bad';
}

export const ATT_STATUS_LABELS: Record<string, string> = {
  hadir: 'Hadir — semua sesi',
  izin: 'Izin — keperluan keluarga',
  sakit: 'Sakit — demam',
  alpha: 'Alpha — tanpa keterangan',
  empty: 'Libur',
  none: 'Belum ada catatan',
  future: 'Tanggal future — belum ada data',
};

export function currentMonthYear(): { month: string; year: number } {
  const now = new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
  return { month: months[now.getMonth()]!, year: now.getFullYear() };
}
