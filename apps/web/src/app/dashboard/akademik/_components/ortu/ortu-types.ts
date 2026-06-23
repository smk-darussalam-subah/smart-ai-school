// Types untuk Dashboard Orang Tua (TUGAS C)
// SIMULASI data — backend menyusul untuk fitur pembayaran, WA history, leaderboard
// Shared types (Pembayaran, Tugas) di-import dari lib/academic.ts (sumber tunggal)

import type { Pembayaran, Tugas } from '@/lib/academic';

// ── Child (anak yang terdaftar di bawah ortu) ──────────────────────────────

export interface OrtuChild {
  id: number;
  name: string;
  kelas: string;
  active: boolean;
  avg: number;
  att: number;
  wali: string;
}

// ── Nilai (grade per mapel with raw components for detail modal) ────────────

export interface OrtuNilaiRaw {
  uh: number[];
  praktik: number[];
  sikap: number;
  uts: number;
  uas: number;
}

export interface OrtuNilai {
  mp: string;
  na: number;
  raw: OrtuNilaiRaw;
  trend: 'up' | 'down';
}

// ── Schedule slot (today's schedule) ────────────────────────────────────────

export interface OrtuScheduleSlot {
  jp: number;
  jpLabel: string;
  timeRange: string;
  mapel: string;
  guru: string;
  room: string;
}

// ── Badge (emoji-based, different from SiswaBadge) ─────────────────────────

export interface OrtuBadge {
  emoji: string;
  name: string;
  desc: string;
  earned: boolean;
}

// ── CP (Capaian Pembelajaran) ───────────────────────────────────────────────

export interface OrtuCPTP {
  tp: string;
  desc: string;
  done: boolean;
}

export interface OrtuCP {
  cp: string;
  desc: string;
  progres: number;
  tps: OrtuCPTP[];
}

// ── Leaderboard ─────────────────────────────────────────────────────────────

export interface OrtuLeaderboardEntry {
  name: string;
  kelas: string;
  xp: number;
  badges: number;
  avg: number;
  me?: boolean;
}

// ── Pengumuman ──────────────────────────────────────────────────────────────

export interface OrtuPengumuman {
  id: number;
  title: string;
  date: string;
  tag: string;
  body: string;
}

// ── WA History (absence notifications — alpha/izin/sakit only) ─────────────

export interface OrtuWAHistory {
  date: string;
  session: string;
  status: 'izin' | 'sakit' | 'alpha';
  sentTo: string;
  time: string;
  note: string;
}

// ── Teacher contact ─────────────────────────────────────────────────────────

export interface OrtuTeacher {
  name: string;
  role: string;
  mapel: string;
  phone: string;
  wa: string;
}

// ── Kehadiran Stats ─────────────────────────────────────────────────────────

export interface OrtuKehadiranStats {
  hadir: number;
  izin: number;
  sakit: number;
  alpha: number;
  total: number;
  pct: number;
}

// ── Attendance trend (3-month) ──────────────────────────────────────────────

export interface OrtuAttTrend {
  month: string;
  pct: number;
  hadir: number;
}

// ── XP / Level ──────────────────────────────────────────────────────────────

export interface OrtuXP {
  level: number;
  current: number;
  next: number;
}

// ── Learning timeline item ──────────────────────────────────────────────────

export interface OrtuTimelineItem {
  title: string;
  date: string;
  desc: string;
}

// ── Re-export shared types for convenience ──────────────────────────────────

export type { Pembayaran, Tugas };
