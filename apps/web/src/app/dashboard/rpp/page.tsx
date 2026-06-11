import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import RppBoard, { RppItem } from './_components/RppBoard';

interface ListResponse { data: RppItem[]; total: number; }

export default async function RppPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const roles: string[] = (session?.roles as string[]) ?? [];

  const isGuru = roles.includes('GURU');
  const isReviewer = ['SUPER_ADMIN', 'KEPALA_SEKOLAH'].some((r) => roles.includes(r));
  if (!isGuru && !isReviewer) redirect('/dashboard');

  const token = session.accessToken ?? '';
  const res = await apiFetch<ListResponse>('/rpp?limit=100', token);

  return (
    <RppBoard
      items={res?.data ?? []}
      total={res?.total ?? 0}
      isGuru={isGuru}
      isReviewer={isReviewer}
      canDelete={roles.includes('SUPER_ADMIN') || isGuru}
    />
  );
}
