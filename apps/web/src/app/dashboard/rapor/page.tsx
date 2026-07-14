import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveRoles } from '@/lib/view-as';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import RaporHub, { ReportItem } from './_components/RaporHub';

interface ListResponse { data: ReportItem[]; total: number; }
interface ClassItem { id: string; name: string; }
interface ActiveSemester { number: number; academicYear: { code: string } }

export default async function RaporPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const roles: string[] = await getEffectiveRoles(session);
  if (roles.includes('INDUSTRI')) redirect('/dashboard');

  const token = session.accessToken ?? '';
  const isStaf = ['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA'].some((r) => roles.includes(r));

  const [listRes, classesRes, semRes] = await Promise.all([
    apiFetch<ListResponse>('/report-cards?limit=100', token),
    isStaf ? apiFetch<{ data: ClassItem[] }>('/classes?limit=100', token) : Promise.resolve(null),
    apiFetch<ActiveSemester>('/school/semesters/active', token),
  ]);

  return (
    <RaporHub
      items={listRes?.data ?? []}
      total={listRes?.total ?? 0}
      classes={classesRes?.data ?? []}
      canGenerate={['SUPER_ADMIN', 'TATA_USAHA'].some((r) => roles.includes(r))}
      canReview={['SUPER_ADMIN', 'KEPALA_SEKOLAH'].some((r) => roles.includes(r))}
      canDistribute={isStaf}
      isStaf={isStaf}
      defaultAcademicYear={semRes?.academicYear?.code ?? ''}
      defaultSemester={semRes?.number ?? 1}
    />
  );
}
