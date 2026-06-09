import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { apiFetch, PaginatedResponse } from '@/lib/api';
import SiswaTable from './_components/SiswaTable';

interface StudentItem {
  id: string; nis: string; status: string;
  user: { fullName: string; email: string };
  class?: { id: string; name: string } | null;
  joinedAt?: string; createdAt: string;
}

interface ClassItem {
  id: string; name: string;
}

interface ClassApiResponse {
  data: ClassItem[]; total: number; limit: number; offset: number;
}

export default async function SiswaPage() {
  const session = await getServerSession(authOptions);
  const token = session?.accessToken ?? '';
  const roles: string[] = (session?.roles as string[]) ?? [];
  const primaryRole = roles[0] ?? '';

  const [studentsData, classesData] = await Promise.all([
    apiFetch<PaginatedResponse<StudentItem>>('/students?limit=100', token),
    apiFetch<ClassApiResponse>('/classes?limit=100', token),
  ]);

  const students = studentsData?.data ?? [];
  const total = studentsData?.total ?? 0;
  const classes = classesData?.data ?? [];

  return (
    <SiswaTable
      students={students}
      total={total}
      classes={classes}
      currentRole={primaryRole}
    />
  );
}
