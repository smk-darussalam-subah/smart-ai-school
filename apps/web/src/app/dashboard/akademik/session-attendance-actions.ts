'use server';
import { getActionSession as getServerSession } from '@/lib/action-session';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { apiFetchResult, apiErrorMessage } from '@/lib/api';
import {
  LearnerJpSchema,
  SessionRosterSchema,
  type LearnerJp,
  type SessionRoster,
  type JpRead,
  JpOverviewQuerySchema,
  readJpOverview,
  type JpOverviewQuery,
  type JpOverview,
} from '@/lib/session-attendance';

export async function fetchSessionAttendanceOverview(
  input: JpOverviewQuery,
): Promise<JpRead<JpOverview>> {
  const parsed = JpOverviewQuerySchema.safeParse(input);
  if (!parsed.success)
    return { state: 'error', message: 'Pilih periode dan rentang kehadiran yang valid.' };
  const query = new URLSearchParams(
    Object.entries(parsed.data)
      .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
      .map(([k, v]) => [k, String(v)]),
  );
  const result = await apiFetchResult<unknown>(
    '/attendance/student-sessions/overview?' + query,
    await token(),
  );
  if (result.status !== 'success')
    return {
      state: result.status === 'forbidden' ? 'denied' : 'error',
      message:
        result.status === 'forbidden'
          ? 'Anda tidak memiliki akses ke ringkasan JP ini.'
          : 'Ringkasan JP belum dapat dimuat. Coba lagi.',
    };
  const data = readJpOverview(result.data, parsed.data);
  return data
    ? { state: 'ready', data }
    : { state: 'error', message: 'Ringkasan JP belum dapat diverifikasi.' };
}

async function token() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) redirect('/login?reason=session');
  return session.accessToken;
}
export async function fetchLearnerSessionAttendance(input: {
  from: string;
  to: string;
  studentId?: string;
  academicYear?: string;
  semester?: number;
}): Promise<JpRead<LearnerJp>> {
  const parsed = z
    .object({
      from: z.string().date(),
      to: z.string().date(),
      studentId: z.string().uuid().optional(),
      academicYear: z
        .string()
        .regex(/^\d{4}\/\d{4}$/)
        .optional(),
      semester: z.number().int().min(1).max(2).optional(),
    })
    .refine((value) => Boolean(value.academicYear) === Boolean(value.semester))
    .safeParse(input);
  if (
    !parsed.success ||
    input.from > input.to ||
    Date.parse(input.to) - Date.parse(input.from) > 61 * 86400000
  )
    return { state: 'error', message: 'Pilih rentang tanggal yang valid.' };
  const result = await apiFetchResult<unknown>(
    '/attendance/student-sessions/summary?' +
      new URLSearchParams(Object.entries(parsed.data).map(([key, value]) => [key, String(value)])),
    await token(),
  );
  if (result.status !== 'success')
    return {
      state: result.status === 'forbidden' ? 'denied' : 'error',
      message:
        result.status === 'forbidden'
          ? 'Anda tidak memiliki akses kehadiran siswa ini.'
          : 'Kehadiran sesi belum dapat dimuat. Coba lagi.',
    };
  const data = LearnerJpSchema.safeParse(result.data);
  if (
    !data.success ||
    data.data.from !== input.from ||
    data.data.to !== input.to ||
    (input.academicYear && data.data.academicYear !== input.academicYear) ||
    (input.semester && data.data.semester !== input.semester) ||
    (input.studentId && data.data.studentId !== input.studentId)
  )
    return { state: 'error', message: 'Rincian kehadiran belum dapat diverifikasi. Muat ulang.' };
  return { state: 'ready', data: data.data };
}
export async function fetchSessionAttendanceRoster(input: {
  sessionId?: string;
  scheduleId?: string;
  date?: string;
}): Promise<JpRead<SessionRoster>> {
  const parsed = z
    .object({
      sessionId: z.string().uuid().optional(),
      scheduleId: z.string().uuid().optional(),
      date: z.string().date().optional(),
    })
    .safeParse(input);
  if (!parsed.success || (!input.sessionId && !(input.scheduleId && input.date)))
    return { state: 'error', message: 'Pilih sesi mengajar yang sudah dimulai.' };
  const query = Object.fromEntries(
    Object.entries(parsed.data).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
  const result = await apiFetchResult<unknown>(
    '/attendance/student-sessions/roster?' + new URLSearchParams(query),
    await token(),
  );
  if (result.status !== 'success')
    return {
      state: result.status === 'forbidden' ? 'denied' : 'error',
      message:
        'Daftar absensi sesi belum dapat dibuka. Pastikan sesi sudah dimulai dan masih menjadi kewenangan Anda.',
    };
  const data = SessionRosterSchema.safeParse(result.data);
  return data.success &&
    (!input.sessionId || data.data.sessionId === input.sessionId) &&
    (!input.date || data.data.date === input.date)
    ? { state: 'ready', data: data.data }
    : { state: 'error', message: 'Daftar siswa/JP belum dapat diverifikasi.' };
}
export async function saveSessionAttendance(
  sessionId: string,
  records: {
    studentId: string;
    jp: number;
    status: 'hadir' | 'izin' | 'sakit' | 'alpha';
    notes: string | null;
    revision: number;
  }[],
): Promise<{ success: boolean; error?: string }> {
  if (!z.string().uuid().safeParse(sessionId).success)
    return { success: false, error: 'Sesi tidak valid.' };
  const accessToken = await token();
  try {
    const response = await fetch(
      `${process.env.API_URL ?? 'http://localhost:3001'}/api/v1/attendance/student-sessions/${sessionId}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ records }),
        cache: 'no-store',
      },
    );
    if (response.status === 401) redirect('/login?reason=session');
    if (!response.ok)
      return {
        success: false,
        error: apiErrorMessage(
          await response.json().catch(() => null),
          'Absensi belum tersimpan. Muat ulang dan coba lagi.',
        ),
      };
    revalidatePath('/dashboard/akademik');
    return { success: true };
  } catch (error) {
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') throw error;
    return { success: false, error: 'Absensi belum tersimpan. Periksa koneksi lalu coba lagi.' };
  }
}
