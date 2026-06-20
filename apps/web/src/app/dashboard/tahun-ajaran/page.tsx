import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveRoles } from '@/lib/view-as';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import TahunAjaranClient, { type AcademicYearRow, type SemesterRow } from './_components/TahunAjaranClient';

export const dynamic = 'force-dynamic';

export default async function TahunAjaranPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const token = session.accessToken ?? '';
  const roles = await getEffectiveRoles(session);
  if (!roles.includes('SUPER_ADMIN') && !roles.includes('KEPALA_SEKOLAH')) redirect('/dashboard');

  const [years, semesters] = await Promise.all([
    apiFetch<AcademicYearRow[]>('/school/academic-years', token),
    apiFetch<SemesterRow[]>('/school/semesters', token),
  ]);

  return <TahunAjaranClient years={years ?? []} semesters={semesters ?? []} />;
}
