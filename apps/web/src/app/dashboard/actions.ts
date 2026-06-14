'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { apiFetch, PaginatedResponse, AttendanceItem } from '@/lib/api';
import { wibTodayISO } from '@/lib/bell-times';

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
