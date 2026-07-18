// =============================================================================
// ortu-mappers.ts — Mapper data API real → view-model Dashboard Ortu.
// Dibuat oleh audit v2 (T1-01..T1-03b) untuk mengganti konstanta SIM_ di ortu-data.ts.
// Semua fungsi MURNI (pure) & type-safe. TIDAK ada data simulasi di file ini.
// =============================================================================

import type { Pembayaran } from '@/lib/academic';
import type { AttendanceItem } from '@/lib/api';
import { generateCalendar, fmtDateShort } from '@/lib/academic';
import type { CalendarCell } from '@/lib/academic';
import { JP_SLOTS, fmtMin } from '@/lib/bell-times';
import type { ScheduleItem } from '../guru-types';
import type { OrtuWAHistory, OrtuKehadiranStats } from './ortu-types';

// ── Tipe API (shape dari akademik/page.tsx ortu branch) ──────────────────────

export interface SppApiItem {
  id: string;
  studentId: string;
  month: string;
  amount: number;
  status: string;
  dueDate: string | null;
  paidAt?: string | null;
  receiptNo?: string | null;
}

export interface SppDashboardPayment {
  id: string;
  month: number;
  year: number;
  amount: number | string;
  status: string;
  paidAt?: string | null;
  receiptNo?: string | null;
  dueDate?: string | null;
}

export interface SppDashboardGroup {
  studentId: string;
  studentName: string;
  payments: SppDashboardPayment[];
}

export interface StudentDashboardAssignment {
  id: string;
  type: string;
  title: string;
  subject: string;
  guru: string | null;
  status: string;
  progress: number;
  kktp: number;
}

export interface StudentDashboardAssignmentGroup {
  studentId: string;
  studentName: string;
  assignments: StudentDashboardAssignment[];
}

export interface OrtuAssignmentItem extends StudentDashboardAssignment {
  studentId: string;
}

export interface WaLogApiItem {
  id: string;
  studentId: string;
  recipient: string;
  message: string;
  eventType: string;
  createdAt: string;
}

export function normalizeSppGroups(groups: SppDashboardGroup[]): SppApiItem[] {
  return groups.flatMap((group) =>
    group.payments.map((payment) => ({
      id: payment.id,
      studentId: group.studentId,
      month: `${payment.month}/${payment.year}`,
      amount: Number(payment.amount),
      status: payment.status,
      dueDate: payment.dueDate ?? null,
      paidAt: payment.paidAt ?? null,
      receiptNo: payment.receiptNo ?? null,
    })),
  );
}

export function normalizeAssignmentGroups(groups: StudentDashboardAssignmentGroup[]): OrtuAssignmentItem[] {
  return groups.flatMap((group) =>
    group.assignments.map((assignment) => ({
      ...assignment,
      studentId: group.studentId,
    })),
  );
}

export function filterByStudentId<T extends { studentId?: string }>(
  items: T[] | undefined,
  studentId: string | undefined,
): T[] {
  if (!items) return [];
  if (!studentId) return items;
  return items.filter((item) => item.studentId === studentId);
}

// ── SPP → Pembayaran ──────────────────────────────────────────────────────────

/**
 * Mapping SPP API (month + status) → view-model Pembayaran (jenis + due + paidDate).
 * status API ('paid'/'unpaid') → status Pembayaran. Bila status lain → 'unpaid' (safe default).
 */
export function mapSppToPembayaran(items: SppApiItem[]): Pembayaran[] {
  return items.map((s) => {
    const paid = s.status === 'paid';
    return {
      id: s.id,
      jenis: s.month ? `SPP ${s.month}` : 'Pembayaran',
      amount: s.amount,
      due: s.dueDate ?? '',
      status: paid ? 'paid' : 'unpaid',
      paidDate: paid ? s.paidAt ?? s.month : undefined,
      desc: s.month ? `SPP bulan ${s.month}` : undefined,
    };
  });
}

// ── WA Log → OrtuWAHistory ─────────────────────────────────────────────────────

/** Normalkan eventType API ke status hadir/izin/sakit/alpha yang dikenali UI. */
function normalizeWaStatus(eventType: string): 'izin' | 'sakit' | 'alpha' {
  const e = eventType.toLowerCase();
  if (e.includes('izin') || e.includes('leave')) return 'izin';
  if (e.includes('sakit') || e.includes('sick')) return 'sakit';
  return 'alpha';
}

/** "2026-06-15T07:35:00Z" → "07:35" (WIB display). */
function timeOfDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Mapping WA log API → OrtuWAHistory. Field `session` tidak tersedia di API
 * (hanya eventType+message), jadi dibiarkan '—'. `note` ← message.
 */
export function mapWaLog(items: WaLogApiItem[]): OrtuWAHistory[] {
  return items.map((w) => ({
    date: w.createdAt ? fmtDateShort(w.createdAt) : '—',
    session: '—',
    status: normalizeWaStatus(w.eventType),
    sentTo: w.recipient || '—',
    time: w.createdAt ? timeOfDay(w.createdAt) : '—',
    note: w.message || '',
  }));
}

// ── Attendance → stats agregat ─────────────────────────────────────────────────

/**
 * Hitung statistik kehadiran dari array AttendanceItem real.
 * Mengembalikan 0 untuk semua field bila array kosong (bukan SIM).
 */
export function computeAttStats(items: AttendanceItem[]): OrtuKehadiranStats {
  let hadir = 0, izin = 0, sakit = 0, alpha = 0;
  for (const a of items) {
    if (a.status === 'hadir') hadir++;
    else if (a.status === 'izin') izin++;
    else if (a.status === 'sakit') sakit++;
    else if (a.status === 'alpha') alpha++;
  }
  const total = hadir + izin + sakit + alpha;
  const pct = total > 0 ? Math.round((hadir / total) * 1000) / 10 : 0;
  return { hadir, izin, sakit, alpha, total, pct };
}

// ── Schedule → slot hari ini ──────────────────────────────────────────────────

export interface OrtuScheduleSlotMapped {
  jp: number;
  jpEnd: number;
  timeRange: string;
  mapel: string;
  guru: string;
  room: string;
}

/**
 * Filter ScheduleItem API untuk hari (dayOfWeek 1=Senin..6=Sabtu, 0=Minggu=libur)
 * dan petakan ke slot ringkas untuk ditampilkan di Beranda/Kehadiran.
 */
export function mapTodaySchedule(items: ScheduleItem[], dayOfWeek: number): OrtuScheduleSlotMapped[] {
  if (dayOfWeek === 0) return [];
  return items
    .filter((s) => s.dayOfWeek === dayOfWeek)
    .map((s) => {
      // Estimasi rentang waktu dari JP via bell-times (sumber tunggal).
      // jpStart/jpEnd → label "07:30–08:10" bila tersedia di JP_SLOTS.
      const startMin = jpStartMin(s.jpStart);
      const endMin = jpEndMin(s.jpEnd);
      const timeRange = startMin != null && endMin != null
        ? `${fmtMin(startMin)}\u2013${fmtMin(endMin)}`
        : '';
      return {
        jp: s.jpStart,
        jpEnd: s.jpEnd,
        timeRange,
        mapel: s.teachingAssignment?.subject ?? '—',
        guru: s.teachingAssignment?.teacher?.user?.fullName ?? '—',
        room: s.room ?? '—',
      };
    })
    .sort((a, b) => a.jp - b.jp);
}

// Import JP_SLOTS lokal (bukan di top-level agar tree-shaking tetap bersih).
function jpStartMin(jp: number): number | null {
  return JP_SLOTS.find((s) => s.jp === jp)?.startMin ?? null;
}
function jpEndMin(jp: number): number | null {
  return JP_SLOTS.find((s) => s.jp === jp)?.endMin ?? null;
}

// ── Attendance → kalender bulanan real ────────────────────────────────────────

/**
 * Bangun sel kalender bulan berjalan dari data AttendanceItem real.
 * Tiap tanggal → status tercatat di hari itu (status diambil dari entri terakhir per hari).
 * Menggunakan generateCalendar() dari lib/academic.ts (sumber tunggal struktur kalender).
 */
export function attCalendarFromApi(attendance: AttendanceItem[], todayDay: number): CalendarCell[] {
  const now = new Date();
  const year = now.getFullYear();
  const monthIndex0 = now.getMonth();

  const statusByDay: Record<number, 'hadir' | 'izin' | 'sakit' | 'alpha'> = {};
  for (const a of attendance) {
    const d = new Date(a.date);
    if (Number.isNaN(d.getTime())) continue;
    const day = d.getUTCDate();
    // Entri terakhir per hari menang (asumsi array terurut waktu; bila tidak, tetap konsisten).
    statusByDay[day] = a.status;
  }

  return generateCalendar(year, monthIndex0, { todayDay, statusByDay });
}
