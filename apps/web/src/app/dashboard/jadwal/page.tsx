import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveRoles } from '@/lib/view-as';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import JadwalMatrix, { ScheduleItem } from './_components/JadwalMatrix';
import type { AssignmentOption } from './_components/JadwalForm';

interface ListResponse {
  data: ScheduleItem[];
  total: number;
}

interface ClassItem {
  id: string;
  name: string;
  grade: number;
}

export default async function JadwalPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const roles: string[] = await getEffectiveRoles(session);
  if (roles.includes('INDUSTRI')) redirect('/dashboard');

  const token = session.accessToken ?? '';
  const isStaf = ['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA'].some((r) => roles.includes(r));
  const canManage = ['SUPER_ADMIN', 'TATA_USAHA'].some((r) => roles.includes(r));

  const [schedulesRes, classesRes, assignmentsRes] = await Promise.all([
    apiFetch<ListResponse>('/schedules?limit=500', token),
    isStaf
      ? apiFetch<{ data: ClassItem[] }>('/classes?limit=100', token)
      : Promise.resolve(null),
    canManage
      ? apiFetch<{ data: AssignmentOption[] }>('/teaching-assignments?limit=200', token)
      : Promise.resolve(null),
  ]);

  return (
    <JadwalMatrix
      schedules={schedulesRes?.data ?? []}
      classes={classesRes?.data ?? []}
      isStaf={isStaf}
      canManage={canManage}
      assignments={assignmentsRes?.data ?? []}
    />
  );
}
