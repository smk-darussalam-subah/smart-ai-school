'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { apiFetch, PaginatedResponse, AttendanceItem } from '@/lib/api';
import { apiAction } from '@/lib/server-actions';
import { wibTodayISO } from '@/lib/bell-times';

// R3 — Link publik Ruang Guru (token, SA/KS).
export async function fetchKioskLink() {
  return apiAction<{ token: string | null }>('/school/kiosk-link', 'GET');
}
export async function regenerateKioskLink() {
  return apiAction<{ token: string }>('/school/kiosk-link/regenerate', 'POST');
}

// =============================================================================
// 2L-B2 — Agregat kehadiran HARI INI (school-wide) untuk KPI + drill-down modal.
// Sumber NYATA: /attendance (siswa) + /teacher-attendance (guru), filter tanggal WIB.
// =============================================================================

export interface TodayStudentAttendance {
  date: string;
  hadir: number;
  izin: number;
  sakit: number;
  alpha: number;
  total: number;
  /** siswa tidak hadir (izin/sakit/alpha) untuk drill-down nama + keterangan */
  absent: { name: string; className: string; status: string; notes: string | null }[];
}

export async function fetchTodayStudentAttendance(): Promise<TodayStudentAttendance | null> {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) return null;
  const date = wibTodayISO();
  const data = await apiFetch<PaginatedResponse<AttendanceItem>>(
    '/attendance',
    session.accessToken,
    { dateFrom: date, dateTo: date, limit: '500' },
  );
  if (!data) return null;

  const records = data.data ?? [];
  let hadir = 0, izin = 0, sakit = 0, alpha = 0;
  const absent: TodayStudentAttendance['absent'] = [];
  for (const r of records) {
    if (r.status === 'hadir') hadir++;
    else if (r.status === 'izin') izin++;
    else if (r.status === 'sakit') sakit++;
    else if (r.status === 'alpha') alpha++;
    if (r.status !== 'hadir') {
      absent.push({ name: r.student.user.fullName, className: r.class.name, status: r.status, notes: r.notes });
    }
  }
  return { date, hadir, izin, sakit, alpha, total: records.length, absent };
}

interface TeacherAttItem {
  id: string;
  checkInAt: string;
  outsideGeofence: boolean;
  teacher: { user: { fullName: string; staff: { niy: string | null } | null } };
}

export interface TodayTeacherAttendance {
  date: string;
  hadir: number;
  list: { name: string; niy: string | null; checkInAt: string; outsideGeofence: boolean }[];
}

export async function fetchTodayTeacherAttendance(): Promise<TodayTeacherAttendance | null> {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) return null;
  const date = wibTodayISO();
  const data = await apiFetch<PaginatedResponse<TeacherAttItem>>(
    '/teacher-attendance',
    session.accessToken,
    { from: date, to: date, limit: '200' },
  );
  if (!data) return null;
  const list = (data.data ?? []).map((t) => ({
    name: t.teacher.user.fullName,
    niy: t.teacher.user.staff?.niy ?? null,
    checkInAt: t.checkInAt,
    outsideGeofence: t.outsideGeofence,
  }));
  return { date, hadir: data.total ?? list.length, list };
}

export interface AttendanceDetail {
  classId: string;
  className: string;
  date: string;
  hadir: number;
  izin: number;
  sakit: number;
  alpha: number;
  total: number;
  absen: { name: string; status: string }[];
}

export async function fetchAttendanceDetailAction(
  classId: string,
  date: string,
): Promise<AttendanceDetail | null> {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) return null;

  const data = await apiFetch<PaginatedResponse<AttendanceItem>>(
    `/attendance`,
    session.accessToken,
    { classId, dateFrom: date, dateTo: date, limit: '200' },
  );

  if (!data) return null;

  const records = data.data ?? [];
  const className = records[0]?.class?.name ?? '';

  let hadir = 0, izin = 0, sakit = 0, alpha = 0;
  const absen: { name: string; status: string }[] = [];

  for (const r of records) {
    if (r.status === 'hadir') hadir++;
    else if (r.status === 'izin') izin++;
    else if (r.status === 'sakit') sakit++;
    else if (r.status === 'alpha') alpha++;

    if (r.status !== 'hadir') {
      absen.push({ name: r.student.user.fullName, status: r.status });
    }
  }

  return {
    classId,
    className,
    date,
    hadir,
    izin,
    sakit,
    alpha,
    total: records.length,
    absen,
  };
}

// =============================================================================
// R2 — Rekap kehadiran by tanggal/rentang (DATA NYATA) untuk date-picker Beranda.
// Pakai endpoint yang ada; hari tanpa record (mis. libur) otomatis tak terhitung.
// =============================================================================
export interface StudentRecap { activeDays: number; total: number; hadir: number; izin: number; sakit: number; alpha: number; hadirPct: number | null }

export async function fetchStudentRecap(dates: string[]): Promise<StudentRecap | null> {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || dates.length === 0) return null;
  const sorted = [...dates].sort();
  const data = await apiFetch<PaginatedResponse<AttendanceItem>>(
    '/attendance', session.accessToken,
    { dateFrom: sorted[0]!, dateTo: sorted[sorted.length - 1]!, limit: '5000' },
  );
  if (!data) return null;
  const set = new Set(dates);
  const activeSet = new Set<string>();
  let hadir = 0, izin = 0, sakit = 0, alpha = 0;
  for (const r of data.data ?? []) {
    const d = String((r as { date?: string }).date ?? '').slice(0, 10);
    if (!set.has(d)) continue;
    activeSet.add(d);
    if (r.status === 'hadir') hadir++; else if (r.status === 'izin') izin++; else if (r.status === 'sakit') sakit++; else if (r.status === 'alpha') alpha++;
  }
  const total = hadir + izin + sakit + alpha;
  return { activeDays: activeSet.size, total, hadir, izin, sakit, alpha, hadirPct: total ? Math.round((hadir / total) * 1000) / 10 : null };
}

export interface TeacherRecap { activeDays: number; checkins: number }

export async function fetchTeacherRecap(dates: string[]): Promise<TeacherRecap | null> {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || dates.length === 0) return null;
  const sorted = [...dates].sort();
  const data = await apiFetch<PaginatedResponse<{ date?: string }>>(
    '/teacher-attendance', session.accessToken,
    { from: sorted[0]!, to: sorted[sorted.length - 1]!, limit: '3000' },
  );
  if (!data) return null;
  const set = new Set(dates);
  const activeSet = new Set<string>();
  let checkins = 0;
  for (const r of data.data ?? []) {
    const d = String(r.date ?? '').slice(0, 10);
    if (!set.has(d)) continue;
    activeSet.add(d);
    checkins++;
  }
  return { activeDays: activeSet.size, checkins };
}

// Tren kehadiran OVERALL (data nyata) untuk rentang panjang — granularitas auto.
interface HeatmapResp { dates: string[]; classes: { cells: { hadir: number; total: number }[] }[] }
export interface TrenSeries { labels: string[]; pcts: number[] }

export async function fetchTrenOverall(days: number): Promise<TrenSeries | null> {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) return null;
  const data = await apiFetch<HeatmapResp>('/attendance/heatmap', session.accessToken, { days: String(days) });
  if (!data || !data.dates?.length) return null;
  const n = data.dates.length;
  const daily: (number | null)[] = [];
  for (let i = 0; i < n; i++) {
    let h = 0, t = 0;
    for (const c of data.classes) { const cell = c.cells[i]; if (cell) { h += cell.hadir; t += cell.total; } }
    daily.push(t ? (h / t) * 100 : null);
  }
  const bucket = days <= 14 ? 1 : days <= 90 ? 7 : 30;
  if (bucket === 1) return { labels: data.dates, pcts: daily.map((p) => p ?? 0) };
  const labels: string[] = []; const pcts: number[] = [];
  for (let i = 0; i < n; i += bucket) {
    const slice = daily.slice(i, i + bucket).filter((x): x is number => x !== null);
    if (!slice.length) continue;
    pcts.push(Math.round((slice.reduce((a, b) => a + b, 0) / slice.length) * 10) / 10);
    labels.push((data.dates[i] ?? '').slice(5));
  }
  return { labels, pcts };
}

// =============================================================================
// Heartbeat — update lastSeenAt for online user tracking.
// Called every 60s from HeartbeatProvider. Fire-and-forget (fail-soft).
// =============================================================================

export async function heartbeatAction() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) return;
  await apiFetch('/auth/heartbeat', session.accessToken, {
    method: 'POST',
  }).catch(() => {}); // silent fail
}

// =============================================================================
// Login Event — record login event with IP and User-Agent from headers().
// Called once per session from LoginEventRecorder. Fire-and-forget.
// =============================================================================

export async function recordLoginEventAction() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) return;

  // Dynamic import to avoid edge runtime issues with next/headers
  const { headers } = await import('next/headers');
  const h = await headers();

  await apiFetch('/auth/login-events', session.accessToken, {
    method: 'POST',
    body: JSON.stringify({
      eventType: 'login',
      ipAddress: h.get('x-forwarded-for') ?? h.get('x-real-ip') ?? null,
      userAgent: h.get('user-agent') ?? null,
    }),
  }).catch(() => {}); // silent fail
}
