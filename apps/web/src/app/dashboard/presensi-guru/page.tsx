import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveRoles } from '@/lib/view-as';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import PresensiGuru, { AttendanceRecord, TodayStatus } from './_components/PresensiGuru';

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
  const [today, list] = await Promise.all([
    isGuru ? apiFetch<TodayStatus>('/teacher-attendance/today', token) : Promise.resolve(null),
    apiFetch<ListResponse>('/teacher-attendance?limit=31', token),
  ]);

  return (
    <PresensiGuru
      isGuru={isGuru}
      isStaf={isStaf}
      today={today}
      records={list?.data ?? []}
      total={list?.total ?? 0}
    />
  );
}
