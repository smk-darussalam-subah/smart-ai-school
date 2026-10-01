import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import LoadError from '@/components/LoadError';
import { apiFetch } from '@/lib/api';
import { authOptions } from '@/lib/auth';
import { getEffectiveRoles } from '@/lib/view-as';
import OnlineUsersClient, { type OnlineResponse } from './OnlineUsersClient';

export const metadata: Metadata = { title: 'User Online' };
const FILTERABLE_ROLES = [
  'SUPER_ADMIN',
  'KEPALA_SEKOLAH',
  'TATA_USAHA',
  'GURU',
  'SISWA',
  'ORANG_TUA',
  'INDUSTRI',
];

export default async function OnlineUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const roles = await getEffectiveRoles(session);
  if (!roles.some((role) => ['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA'].includes(role)))
    redirect('/dashboard');

  const sp = await searchParams;
  const threshold = [60, 120, 300].includes(Number(sp.threshold)) ? Number(sp.threshold) : 120;
  const roleFilter = FILTERABLE_ROLES.includes(sp.role ?? '') ? sp.role! : '';
  const params = new URLSearchParams({ threshold: String(threshold) });
  if (roleFilter) params.set('role', roleFilter);
  const data = await apiFetch<OnlineResponse>(`/users/online?${params}`, session.accessToken ?? '');
  if (data === null) return <LoadError />;
  return <OnlineUsersClient initialData={data} threshold={threshold} roleFilter={roleFilter} />;
}
