import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveRoles } from '@/lib/view-as';
import { redirect } from 'next/navigation';
import { apiFetch, PaginatedResponse } from '@/lib/api';
import SiswaTable from './_components/SiswaTable';
import type { PpdbEnrollmentLead } from './_components/ppdb-enrollment-handoff';

interface StudentItem {
  id: string; nis: string; status: string;
  user: { fullName: string; email: string };
  class?: { id: string; name: string } | null;
  joinedAt?: string; createdAt: string;
}

export interface WithoutParentItem {
  id: string; nis: string;
  user: { fullName: string; email: string };
  class?: { id: string; name: string } | null;
}

const LIMIT = 20;
const SORT_COLS = ['nis', 'fullName', 'status', 'createdAt'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''));

export default async function SiswaPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const roles: string[] = await getEffectiveRoles(session);

  const token = session.accessToken ?? '';
  const canEdit = roles.includes('SUPER_ADMIN') || roles.includes('TATA_USAHA');

  // URL sebagai sumber kebenaran pagination/sort/filter/search.
  const sp = await searchParams;
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const search = one(sp.search).slice(0, 100);
  const classId = one(sp.classId);
  const status = one(sp.status);
  const ppdbLeadId = one(sp.ppdbLeadId);
  const sortBy = SORT_COLS.includes(one(sp.sortBy)) ? one(sp.sortBy) : 'createdAt';
  const sortOrder: 'asc' | 'desc' = one(sp.sortOrder) === 'asc' ? 'asc' : 'desc';

  const qs = new URLSearchParams({ page: String(page), limit: String(LIMIT), sortBy, sortOrder });
  if (search) qs.set('search', search);
  if (classId) qs.set('classId', classId);
  if (status) qs.set('status', status);

  const shouldLoadPpdbLead = canEdit && UUID_RE.test(ppdbLeadId);
  const [studentsData, classesData, withoutParentData, ppdbLeadData] = await Promise.all([
    apiFetch<PaginatedResponse<StudentItem>>(`/students?${qs.toString()}`, token),
    apiFetch<{ data: { id: string; name: string }[] }>('/classes?limit=100', token),
    canEdit
      ? apiFetch<PaginatedResponse<WithoutParentItem>>('/students/without-parent?limit=100', token)
      : Promise.resolve(null),
    shouldLoadPpdbLead
      ? apiFetch<PpdbEnrollmentLead>(`/ppdb/leads/${ppdbLeadId}`, token)
      : Promise.resolve(null),
  ]);

  const students = studentsData?.data ?? [];
  const total = studentsData?.total ?? 0;
  const classes = classesData?.data ?? [];
  const withoutParentStudents = withoutParentData?.data ?? [];
  const withoutParentTotal = withoutParentData?.total ?? 0;
  const ppdbEnrollmentLead = ppdbLeadData?.status === 'accepted' ? ppdbLeadData : null;

  return (
    <SiswaTable
      students={students}
      total={total}
      classes={classes}
      canEdit={canEdit}
      withoutParentStudents={withoutParentStudents}
      withoutParentTotal={withoutParentTotal}
      ppdbEnrollmentLead={ppdbEnrollmentLead}
      query={{ page, limit: LIMIT, search, classId, status, sortBy, sortOrder }}
    />
  );
}
