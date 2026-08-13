import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { resolveDashboardAuthority } from '@/lib/dashboard-authority';
import AcademicDataNotice from '../_components/AcademicDataNotice';
import KegiatanList, { type ActivityItem } from './_components/KegiatanList';

const PAGE_SIZE = 12;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (value: string | string[] | undefined) => Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
interface ListResponse { data: ActivityItem[]; total: number; page: number; limit: number }
interface ClassItem { id: string; name: string }

export default async function KegiatanPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const authority = await resolveDashboardAuthority(session);
  if (!authority.can('activity.read') || authority.hasRole('INDUSTRI')) redirect('/dashboard');
  const sp = await searchParams;
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const classId = one(sp.classId);
  const category = one(sp.category);
  const search = one(sp.search).trim().slice(0, 100);
  const query = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (classId) query.set('classId', classId);
  if (category) query.set('category', category);
  if (search) query.set('search', search);
  const token = session.accessToken ?? '';
  const canManage = authority.can('activity.manage') && authority.hasRole('SUPER_ADMIN', 'GURU', 'WAKA_KESISWAAN');
  const canCreate = canManage && authority.hasRole('GURU');
  const [activities, readableClasses, manageableClasses] = await Promise.all([
    apiFetch<ListResponse>(`/class-activities?${query.toString()}`, token),
    apiFetch<ClassItem[]>('/class-activities/options/readable-classes', token),
    canManage ? apiFetch<ClassItem[]>('/class-activities/options/classes', token) : Promise.resolve([]),
  ]);
  if (!activities || !readableClasses || (canManage && !manageableClasses)) {
    return <AcademicDataNotice href="/dashboard/kegiatan" message="Kegiatan kelas atau lingkup kelas belum dapat dimuat." />;
  }
  return <KegiatanList
    items={activities.data}
    total={activities.total}
    readableClasses={readableClasses}
    manageableClasses={manageableClasses ?? []}
    query={{ page, limit: PAGE_SIZE, classId, category, search }}
    canCreate={canCreate}
    canManage={canManage}
  />;
}
