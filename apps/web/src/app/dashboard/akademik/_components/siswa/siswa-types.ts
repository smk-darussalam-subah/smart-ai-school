// Types untuk Dashboard Siswa (W2)
// SIMULASI data — backend menyusul untuk fitur LMS, gamifikasi, CV

// ── Modul Ajar (LMS) ──────────────────────────────────────────────────────

export interface SiswaModul {
  id: number;
  uuid?: string; // T3-06: real module UUID for PATCH /lms/modules/:id/progress
  tp: string;
  judul: string;
  alokasi: string;
  kktp: number;
  status: 'Selesai' | 'Aktif' | 'Terkunci';
  lms: boolean;
  prog: number;
  badge: string | null;
  mapel: string;
}

// ── Badge ──────────────────────────────────────────────────────────────────

export interface SiswaBadge {
  name: string;
  icon: string;
  color: string;
  earned: boolean;
  cat: string;
  score: number | null;
  prog: number | null;
  desc: string;
}

// ── Tugas ──────────────────────────────────────────────────────────────────

export interface SiswaTugas {
  id: number;
  mp: string;
  title: string;
  type: string;
  deadline: string;
  dlDays: number;
  status: 'pending' | 'submitted' | 'graded';
  guru: string;
  desc: string;
  score?: number;
  feedback?: string | null;
  submittedFiles?: number;
}

// ── Nilai ──────────────────────────────────────────────────────────────────

export interface SiswaNilai {
  mp: string;
  scores: [number, number, number, number, number]; // UH, Praktik, Sikap, UTS, UAS
  rata: number;
  kktp: number;
  trend: 'up' | 'down' | 'stable';
  cp: number;
}

// ── CP (Capaian Pembelajaran) ─────────────────────────────────────────────

export interface SiswaCPTP {
  tp: string;
  desc: string;
  done: boolean;
  badge: string | null;
}

export interface SiswaCP {
  cp: string;
  desc: string;
  progres: number;
  tps: SiswaCPTP[];
}

// ── Leaderboard ────────────────────────────────────────────────────────────

export interface SiswaLeaderboardEntry {
  name: string;
  kelas: string;
  xp: number;
  badges: number;
  avg: number;
  me?: boolean;
}

// ── Profile CV ─────────────────────────────────────────────────────────────

export interface SiswaSkill {
  ic: string;
  color: string;
  name: string;
  level: string;
  pct: number;
}

export interface SiswaTimeline {
  title: string;
  date: string;
  desc: string;
}

export interface SiswaProfileCV {
  name: string;
  role: string;
  tags: string[];
  stats: { n: string; l: string }[];
  skills: SiswaSkill[];
  timeline: SiswaTimeline[];
  // Flat fields used by ProfileCV component
  nis?: string;
  class?: string;
  school?: string;
  email?: string;
  phone?: string;
  address?: string;
  enrollmentDate?: string;
  xp?: number;
  level?: number;
  avgGrade?: string;
  attendance?: number;
  modulesCompleted?: number;
  streak?: number;
}

// ── Quest ──────────────────────────────────────────────────────────────────

export interface SiswaQuestTask {
  ic: string;
  label: string;
  done: boolean;
}

export interface SiswaQuest {
  title: string;
  tasks: SiswaQuestTask[];
}

// ── Kalender Akademik ─────────────────────────────────────────────────────

export interface SiswaKalenderEvent {
  d: number;
  m: string;
  title: string;
  desc: string;
  color: string;
}

// ── Pengumuman ─────────────────────────────────────────────────────────────

export interface SiswaPengumuman {
  ic: string;
  color: string;
  title: string;
  from: string;
  time: string;
  body: string;
  tag: string;
  tagColor: string;
  read?: boolean;
  id?: string;
}

// ── Kehadiran Stats ────────────────────────────────────────────────────────

export interface SiswaKehadiranStats {
  hadir: number;
  izin: number;
  sakit: number;
  alpha: number;
  total: number;
  pct: number;
}

// ── XP / Level ─────────────────────────────────────────────────────────────

export interface SiswaXP {
  level: number;
  current: number;
  next: number;
  streakDays?: number;
}

// ── Schedule (from API) ───────────────────────────────────────────────────

export interface SiswaScheduleSlot {
  id: string;
  subject: string;
  teacher: string;
  room: string;
  jpStart: number;
  jpEnd: number;
}

// ── Badge Celebration ──────────────────────────────────────────────────────

export interface BadgeCelebrationData {
  show: boolean;
  badgeName?: string;
}

// ── Mapel helpers ──────────────────────────────────────────────────────────

export const MAPEL_COLORS: Record<string, string> = {
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
  return MAPEL_COLORS[mp] || '#10b981';
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
