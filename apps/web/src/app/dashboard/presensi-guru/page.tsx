import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveRoles } from '@/lib/view-as';
import { redirect } from 'next/navigation';
import { apiFetchResult } from '@/lib/api';
import PresensiGuru, { AttendanceRecord, TodayStatus } from './_components/PresensiGuru';
import LoadError from '@/components/LoadError';

interface ListResponse {
  data: AttendanceRecord[];
  total: number;
}

export default async function PresensiGuruPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const roles: string[] = await getEffectiveRoles(session);

  const isGuru = roles.includes('GURU');
  const isStaf = ['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA'].some((r) => roles.includes(r));
  if (!isGuru && !isStaf) redirect('/dashboard');

  const token = session.accessToken ?? '';
  const [todayResult, listResult] = await Promise.all([
    isGuru ? apiFetchResult<TodayStatus>('/teacher-attendance/today', token) : Promise.resolve(null),
    apiFetchResult<ListResponse>('/teacher-attendance?limit=31', token),
  ]);

  if (isStaf && !isGuru && listResult.status !== 'success') {
    return (
      <LoadError
        title="Rekap presensi belum dapat dimuat"
        message={listResult.message}
      />
    );
  }

  return (
    <PresensiGuru
      isGuru={isGuru}
      isStaf={isStaf}
      today={todayResult && todayResult.status === 'success' ? todayResult.data : null}
      todayError={isGuru && todayResult && todayResult.status !== 'success' ? todayResult.message : ''}
      records={listResult.status === 'success' ? listResult.data.data : []}
      total={listResult.status === 'success' ? listResult.data.total : 0}
      historyError={listResult.status === 'success' ? '' : listResult.message}
    />
  );
}
