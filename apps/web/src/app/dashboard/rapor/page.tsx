import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { resolveDashboardAuthority } from '@/lib/dashboard-authority';
import AcademicDataNotice from '../_components/AcademicDataNotice';
import RaporHub, { type ReportItem } from './_components/RaporHub';

const PAGE_SIZE = 20;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (value: string | string[] | undefined) => Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
interface ListResponse { data: ReportItem[]; total: number; page: number; limit: number }
interface ClassItem { id: string; name: string; canManageDraft: boolean }
interface ActiveSemester { number: number; academicYear: { code: string } }

export default async function RaporPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const authority = await resolveDashboardAuthority(session);
  if (!authority.can('report.read') || authority.hasRole('INDUSTRI')) redirect('/dashboard');
  const sp = await searchParams;
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const classId = one(sp.classId);
  const studentId = one(sp.studentId);
  const status = one(sp.status);
  const search = one(sp.search).trim().slice(0, 100);
  const query = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (classId) query.set('classId', classId);
  if (studentId) query.set('studentId', studentId);
  if (status) query.set('status', status);
  if (search) query.set('search', search);
  const isOperational = authority.hasRole('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'GURU', 'WAKA_KURIKULUM', 'KAPROG');
  const token = session.accessToken ?? '';
  const [reports, classResponse, semester] = await Promise.all([
    apiFetch<ListResponse>(`/report-cards?${query.toString()}`, token),
    isOperational ? apiFetch<{ data: ClassItem[] }>('/report-cards/options/classes', token) : Promise.resolve(null),
    apiFetch<ActiveSemester>('/school/semesters/active', token),
  ]);
  if (!reports || !semester) return <AcademicDataNotice href="/dashboard/rapor" message="Rapor atau periode aktif belum dapat dimuat." />;

  return <RaporHub
    items={reports.data}
    total={reports.total}
    classes={classResponse?.data ?? []}
    query={{ page, limit: PAGE_SIZE, classId, studentId, status, search }}
    canGenerate={!authority.hasRole('SUPER_ADMIN') && authority.can('report.wali.manage') && authority.hasRole('GURU') && (classResponse?.data.some((item) => item.canManageDraft) ?? false)}
    canCheck={!authority.hasRole('SUPER_ADMIN') && authority.can('report.review') && authority.hasRole('WAKA_KURIKULUM')}
    canPublish={authority.can('report.publish') && authority.hasRole('SUPER_ADMIN', 'KEPALA_SEKOLAH')}
    canDistribute={authority.can('report.distribute') && authority.hasRole('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA')}
    canRecover={authority.can('report.recover') && authority.hasRole('SUPER_ADMIN')}
    isOperational={isOperational}
    defaultAcademicYear={semester.academicYear.code}
    defaultSemester={semester.number}
  />;
}
