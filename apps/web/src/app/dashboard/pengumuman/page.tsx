import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import PengumumanList, { Announcement } from './_components/PengumumanList';

interface ListResponse {
  data: Announcement[];
  total: number;
  page: number;
  limit: number;
}

export default async function PengumumanPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const roles: string[] = (session?.roles as string[]) ?? [];

  const token = session.accessToken ?? '';
  const canManage = roles.includes('SUPER_ADMIN') || roles.includes('KEPALA_SEKOLAH');
  const canDelete = roles.includes('SUPER_ADMIN');

  const res = await apiFetch<ListResponse>('/announcements?limit=100', token);
  const announcements = res?.data ?? [];
  const total = res?.total ?? 0;

  return (
    <PengumumanList
      announcements={announcements}
      total={total}
      canManage={canManage}
      canDelete={canDelete}
    />
  );
}
