import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveRoles } from '@/lib/view-as';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import RppBoard, { RppItem } from './_components/RppBoard';

interface ListResponse { data: RppItem[]; total: number; }

export default async function RppPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const roles: string[] = await getEffectiveRoles(session);

  // Halaman ini = REVIEW Modul Ajar (KS/SA). Pembuatan/edit Modul Ajar oleh GURU
  // sudah satu pintu di Akademik → Pembelajaran → Modul Ajar (hapus dualitas).
  const isReviewer = ['SUPER_ADMIN', 'KEPALA_SEKOLAH'].some((r) => roles.includes(r));
  if (!isReviewer) redirect('/dashboard/akademik');

  const token = session.accessToken ?? '';
  const res = await apiFetch<ListResponse>('/rpp?limit=100', token);

  return (
    <RppBoard
      items={res?.data ?? []}
      total={res?.total ?? 0}
      isGuru={false}
      isReviewer
      canDelete={roles.includes('SUPER_ADMIN')}
    />
  );
}
