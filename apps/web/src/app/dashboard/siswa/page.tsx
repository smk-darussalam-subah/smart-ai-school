import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveRoles } from '@/lib/view-as';
import { redirect } from 'next/navigation';
import { apiFetch, PaginatedResponse } from '@/lib/api';
import SiswaTable from './_components/SiswaTable';

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

export default async function SiswaPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const roles: string[] = await getEffectiveRoles(session);

  if (roles.includes('INDUSTRI')) redirect('/dashboard');

  const token = session.accessToken ?? '';
  const canEdit = roles.includes('SUPER_ADMIN') || roles.includes('TATA_USAHA');

  const [studentsData, classesData, withoutParentData] = await Promise.all([
    apiFetch<PaginatedResponse<StudentItem>>('/students?limit=100', token),
    apiFetch<{ data: { id: string; name: string }[] }>('/classes?limit=100', token),
    canEdit
      ? apiFetch<PaginatedResponse<WithoutParentItem>>('/students/without-parent?limit=100', token)
      : Promise.resolve(null),
  ]);

  const students = studentsData?.data ?? [];
  const total = studentsData?.total ?? 0;
  const classes = classesData?.data ?? [];
  const withoutParentStudents = withoutParentData?.data ?? [];
  const withoutParentTotal = withoutParentData?.total ?? 0;

  return (
    <SiswaTable
      students={students}
      total={total}
      classes={classes}
      canEdit={canEdit}
      withoutParentStudents={withoutParentStudents}
      withoutParentTotal={withoutParentTotal}
    />
  );
}
