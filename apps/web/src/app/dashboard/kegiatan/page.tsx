import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveRoles } from '@/lib/view-as';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import KegiatanList, { ActivityItem } from './_components/KegiatanList';

interface ListResponse { data: ActivityItem[]; total: number; }
interface ClassItem { id: string; name: string; }

export default async function KegiatanPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const roles: string[] = await getEffectiveRoles(session);
  if (roles.includes('INDUSTRI')) redirect('/dashboard');

  const token = session.accessToken ?? '';
  const isGuru = roles.includes('GURU');
  const isStafOrGuru = isGuru || ['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA'].some((r) => roles.includes(r));

  const [listRes, classesRes] = await Promise.all([
    apiFetch<ListResponse>('/class-activities?limit=100', token),
    isStafOrGuru
      ? apiFetch<{ data: ClassItem[] }>('/classes?limit=100', token)
      : Promise.resolve(null),
  ]);

  return (
    <KegiatanList
      items={listRes?.data ?? []}
      total={listRes?.total ?? 0}
      classes={classesRes?.data ?? []}
      isGuru={isGuru}
      canDelete={isGuru || roles.includes('SUPER_ADMIN')}
    />
  );
}
