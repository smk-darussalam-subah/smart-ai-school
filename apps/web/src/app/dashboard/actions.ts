'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { apiFetch, PaginatedResponse, AttendanceItem } from '@/lib/api';

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
