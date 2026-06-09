import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { apiFetch, PaginatedResponse } from '@/lib/api';
import SiswaTable from './_components/SiswaTable';

interface StudentItem {
  id: string; nis: string; status: string;
  user: { fullName: string; email: string };
  class?: { id: string; name: string } | null;
  joinedAt?: string; createdAt: string;
}

export default async function SiswaPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const roles: string[] = (session?.roles as string[]) ?? [];

  if (roles.includes('INDUSTRI')) redirect('/dashboard');

  const token = session.accessToken ?? '';
  const canEdit = roles.includes('SUPER_ADMIN') || roles.includes('TATA_USAHA');

  const [studentsData, classesData] = await Promise.all([
    apiFetch<PaginatedResponse<StudentItem>>('/students?limit=100', token),
    apiFetch<{ data: { id: string; name: string }[] }>('/classes?limit=100', token),
  ]);

  const students = studentsData?.data ?? [];
  const total = studentsData?.total ?? 0;
  const classes = classesData?.data ?? [];

  return (
    <SiswaTable students={students} total={total} classes={classes} canEdit={canEdit} />
  );
}
