import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveRoles } from '@/lib/view-as';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import LoadError from '@/components/LoadError';
import SubjectClient from './_components/SubjectClient';
import type { SubjectRow } from './actions';

export const metadata = { title: 'Mata Pelajaran' };

export default async function MapelPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const roles: string[] = await getEffectiveRoles(session);
  const isEditor = roles.includes('SUPER_ADMIN') || roles.includes('TATA_USAHA');

  const token = session.accessToken ?? '';
  const res = await apiFetch<{ data: SubjectRow[]; total: number }>('/subjects?limit=200', token);

  if (res === null) return <LoadError />;

  return <SubjectClient subjects={res.data} isEditor={isEditor} />;
}
