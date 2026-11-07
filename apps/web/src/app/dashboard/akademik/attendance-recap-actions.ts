'use server';
import { getActionSession } from '@/lib/action-session';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { apiFetchResult } from '@/lib/api';
import {
  RecapQuerySchema,
  readAttendanceRecap,
  type RecapQuery,
  type RecapRead,
} from '@/lib/attendance-recap';

export async function fetchAttendanceRecap(input: RecapQuery): Promise<RecapRead> {
  const parsed = RecapQuerySchema.safeParse(input);
  if (!parsed.success)
    return { state: 'error', message: 'Pilih periode dan filter rekap yang valid.' };
  const session = await getActionSession(authOptions);
  if (!session?.accessToken) redirect('/login?reason=session');
  const params = new URLSearchParams(
    Object.entries(parsed.data)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  );
  const result = await apiFetchResult<unknown>(
    '/attendance/student-sessions/recap?' + params,
    session.accessToken,
  );
  if (result.status !== 'success')
    return {
      state: result.status === 'forbidden' ? 'denied' : 'error',
      message:
        result.status === 'forbidden'
          ? 'Rekap ini tidak termasuk kewenangan Anda.'
          : 'Rekap belum dapat dimuat. Coba lagi atau persempit rentang tanggal.',
    };
  const data = readAttendanceRecap(result.data, parsed.data);
  return data
    ? { state: 'ready', data }
    : { state: 'error', message: 'Rekap belum dapat diverifikasi. Muat ulang.' };
}
