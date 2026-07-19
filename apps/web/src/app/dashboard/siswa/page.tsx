import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveRoles } from '@/lib/view-as';
import { redirect } from 'next/navigation';
import { apiFetch, PaginatedResponse } from '@/lib/api';
import LoadError from '@/components/LoadError';
import SiswaTable from './_components/SiswaTable';
import {
  toAcceptedPpdbEnrollmentLead,
  type PpdbEnrollmentLeadApi,
} from './_components/ppdb-enrollment-handoff';

interface StudentItem {
  id: string; nis: string; status: string;
  parentId?: string | null;
  user: { id: string; fullName: string; email: string; isActive?: boolean; consentAt?: string | null };
  parent?: { id: string; fullName: string } | null;
  class?: { id: string; name: string; grade?: number; majorCode?: string } | null;
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
  const grade = one(sp.grade);
  const majorCode = one(sp.majorCode).slice(0, 10);
  const joinedYear = one(sp.joinedYear);
  const parentState = one(sp.parentState);
  const classState = one(sp.classState);
  const accountStatus = one(sp.accountStatus);
  const consentStatus = one(sp.consentStatus);
  const ppdbLeadId = one(sp.ppdbLeadId);
  const sortBy = SORT_COLS.includes(one(sp.sortBy)) ? one(sp.sortBy) : 'createdAt';
  const sortOrder: 'asc' | 'desc' = one(sp.sortOrder) === 'asc' ? 'asc' : 'desc';

  const qs = new URLSearchParams({ page: String(page), limit: String(LIMIT), sortBy, sortOrder });
  if (search) qs.set('search', search);
  if (classId) qs.set('classId', classId);
  if (status) qs.set('status', status);
  if (grade) qs.set('grade', grade);
  if (majorCode) qs.set('majorCode', majorCode);
  if (joinedYear) qs.set('joinedYear', joinedYear);
  if (parentState) qs.set('parentState', parentState);
  if (classState) qs.set('classState', classState);
  if (accountStatus) qs.set('accountStatus', accountStatus);
  if (consentStatus) qs.set('consentStatus', consentStatus);

  const shouldLoadPpdbLead = canEdit && UUID_RE.test(ppdbLeadId);
  const [
    studentsData,
    classesData,
    withoutParentData,
    ppdbLeadData,
    registryData,
    withoutClassData,
    pendingConsentData,
  ] = await Promise.all([
    apiFetch<PaginatedResponse<StudentItem>>(`/students?${qs.toString()}`, token),
    apiFetch<{ data: { id: string; name: string; grade?: number; majorCode?: string }[] }>('/classes?limit=100', token),
    canEdit
      ? apiFetch<PaginatedResponse<WithoutParentItem>>('/students/without-parent?limit=100', token)
      : Promise.resolve(null),
    shouldLoadPpdbLead
      ? apiFetch<PpdbEnrollmentLeadApi>(`/ppdb/leads/${ppdbLeadId}`, token)
      : Promise.resolve(null),
    canEdit
      ? apiFetch<PaginatedResponse<StudentItem>>('/students?limit=1', token)
      : Promise.resolve(null),
    canEdit
      ? apiFetch<PaginatedResponse<StudentItem>>('/students?limit=1&classState=without_class', token)
      : Promise.resolve(null),
    canEdit
      ? apiFetch<PaginatedResponse<StudentItem>>('/students?limit=1&consentStatus=pending', token)
      : Promise.resolve(null),
  ]);

  if (
    studentsData === null ||
    classesData === null ||
    (canEdit && (withoutParentData === null || registryData === null || withoutClassData === null || pendingConsentData === null))
  ) {
    return <LoadError />;
  }

  const students = studentsData?.data ?? [];
  const total = studentsData?.total ?? 0;
  const classes = classesData?.data ?? [];
  const withoutParentStudents = withoutParentData?.data ?? [];
  const withoutParentTotal = withoutParentData?.total ?? 0;
  const ppdbEnrollmentLead = toAcceptedPpdbEnrollmentLead(ppdbLeadData);

  return (
    <SiswaTable
      students={students}
      total={total}
      classes={classes}
      canEdit={canEdit}
      withoutParentStudents={withoutParentStudents}
      withoutParentTotal={withoutParentTotal}
      readinessCounts={{
        total: registryData?.total ?? total,
        withoutParent: withoutParentTotal,
        withoutClass: withoutClassData?.total ?? 0,
        pendingConsent: pendingConsentData?.total ?? 0,
      }}
      ppdbEnrollmentLead={ppdbEnrollmentLead}
      query={{
        page,
        limit: LIMIT,
        search,
        classId,
        status,
        grade,
        majorCode,
        joinedYear,
        parentState,
        classState,
        accountStatus,
        consentStatus,
        sortBy,
        sortOrder,
      }}
    />
  );
}
