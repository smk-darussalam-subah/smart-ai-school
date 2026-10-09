// Utility functions for Dashboard Siswa.
// P6: All SIMULASI constants purged — data comes from real API endpoints.
// Import dari lib/bell-times untuk konstanta resmi.

import { fmtMin } from '@/lib/bell-times';
import { segmentsForDay, type BellProfile } from '@/lib/bell-patterns';
import type { SiswaPengumuman } from './siswa-types';

// ── Mapel Colors & Icons ─────────────────────────────────────────────────

export const MAPEL_COLORS = {
  'Pemrograman Web': '#10b981',
  'Basis Data': '#0ea5e9',
  'Matematika': '#a78bfa',
  'B.Indonesia': '#ec4899',
  'B.Inggris': '#f59e0b',
  'Fisika': '#ef4444',
  'PJOK': '#14b8a6',
  'PKn': '#8b5cf6',
};

export const MAPEL_ICONS: Record<string, string> = {
  'Pemrograman Web': 'code-2',
  'Basis Data': 'database',
  'Matematika': 'calculator',
  'B.Indonesia': 'book-open',
  'B.Inggris': 'languages',
  'Fisika': 'atom',
  'PJOK': 'dumbbell',
  'PKn': 'landmark',
};

export function mpColor(mp: string): string {
  return MAPEL_COLORS[mp as keyof typeof MAPEL_COLORS] || '#10b981';
}

export function mpIcon(mp: string): string {
  if (mp.includes('Pemrograman')) return 'code-2';
  if (mp.includes('Basis')) return 'database';
  if (mp.includes('Matematika')) return 'calculator';
  if (mp.includes('Indonesia')) return 'book-open';
  if (mp.includes('Inggris')) return 'languages';
  if (mp.includes('Fisika')) return 'atom';
  if (mp.includes('PJOK')) return 'dumbbell';
  if (mp.includes('PKn')) return 'landmark';
  return 'book';
}

// ── Schedule Types ─────────────────────────────────────────────────────────

export interface SimSchedSlot {
  mp: string;
  g: string;
  ruang: string;
}
export type SimSchedule = Record<number, Record<number, SimSchedSlot>>;

// ── JP Labels & Time Ranges (derived from BELL_SEGMENTS — sumber tunggal) ──
// Filter out Briefing segment to match mockup index structure (0=JP1, 3=Istirahat)
export function studentDayPattern(profile: BellProfile | null, day: number) {
  const segments = segmentsForDay(profile, day).filter((segment) => segment.type === 'INSTRUCTION' || segment.type === 'BREAK');
  const JP_LABELS: [string, string][] = segments.map((segment) => [segment.label, fmtMin(segment.startMinute) + '–' + fmtMin(segment.endMinute)]);
  const JP_MAP: [number, number][] = segments.flatMap((segment, index) => segment.type === 'INSTRUCTION' ? [[segment.jpNumber!, index] as [number, number]] : []);
  return { JP_LABELS, JP_MAP };
}

// ── API Announcements Normalize ────────────────────────────────────────────

/** Transform API announcement to SiswaPengumuman format. */
export function normalizeAnnouncements(
  apiData: { id: string; title: string; createdAt: string }[],
): SiswaPengumuman[] {
  return apiData.map((a, i) => ({
    id: a.id,
    ic: 'bell',
    color: '#10b981',
    title: a.title,
    from: 'Sekolah',
    time: a.createdAt,
    body: '',
    tag: i === 0 ? 'Penting' : 'Info',
    tagColor: i === 0 ? '#ef4444' : '#10b981',
    read: false,
  }));
}

// ── API Schedule Transform ─────────────────────────────────────────────────

export interface ApiScheduleItem {
  dayOfWeek: number;
  jpStart: number;
  jpEnd: number;
  room: string | null;
  teachingAssignment?: { subject: string };
}

/** Transform API ScheduleItem[] to component schedule format. */
export function transformApiSchedule(items: ApiScheduleItem[], profile: BellProfile | null = null): SimSchedule {
  const result: SimSchedule = {};
  for (const item of items) {
    if (!result[item.dayOfWeek]) result[item.dayOfWeek] = {};
    for (let jp = item.jpStart; jp <= item.jpEnd; jp++) {
      const idx = studentDayPattern(profile, item.dayOfWeek).JP_MAP.find(([j]) => j === jp)?.[1];
      if (idx != null) {
        result[item.dayOfWeek]![idx] = {
          mp: item.teachingAssignment?.subject ?? '—',
          g: '—',
          ruang: item.room ?? '—',
        };
      }
    }
  }
  return result;
}

/** Resolve schedule: use API data if available, fall back to empty. */
export function resolveSchedule(apiSchedule?: unknown[], profile: BellProfile | null = null): { schedule: SimSchedule; isSim: boolean; timingAvailable: boolean } {
  if (apiSchedule && apiSchedule.length > 0) {
    return { schedule: transformApiSchedule(apiSchedule as ApiScheduleItem[], profile), isSim: false, timingAvailable: profile != null };
  }
  return { schedule: {}, isSim: false, timingAvailable: profile != null };
}

/** Sum only scheduled instruction segments; breaks/ceremonies never count. */
export function scheduledInstructionMinutes(schedule: SimSchedule, profile: BellProfile | null): number | null {
  if (!profile) return null;
  let minutes = 0;
  for (const [day, slots] of Object.entries(schedule)) {
    const segments = segmentsForDay(profile, Number(day)).filter((segment) => segment.type === 'INSTRUCTION' || segment.type === 'BREAK');
    for (const index of Object.keys(slots)) {
      const segment = segments[Number(index)];
      if (!segment || segment.type !== 'INSTRUCTION') return null;
      minutes += segment.endMinute - segment.startMinute;
    }
  }
  return minutes;
}
