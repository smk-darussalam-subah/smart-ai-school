import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { apiFetch, PaginatedResponse, GradeItem, AttendanceItem } from '@/lib/api';
import AkademikClient from './_components/AkademikClient';

interface Assignment { id: string; subject: string; }
interface ClassItem { id: string; name: string; }

export default async function AkademikPage() {
  const session = await getServerSession(authOptions);
  const token = session?.accessToken ?? '';
  const roles: string[] = (session?.roles as string[]) ?? [];
  const canManage = roles.includes('SUPER_ADMIN') || roles.includes('GURU');

  const [gradesData, attendanceData, classesRes, assignmentsRes] = await Promise.all([
    apiFetch<PaginatedResponse<GradeItem>>('/grades?limit=200', token),
    apiFetch<PaginatedResponse<AttendanceItem>>('/attendance?limit=200', token),
    apiFetch<{ data: ClassItem[] }>('/classes?limit=50', token),
    apiFetch<{ data: Assignment[] }>('/teaching-assignments?limit=100', token),
  ]);

  return (
    <AkademikClient
      grades={gradesData?.data ?? []}
      attendances={attendanceData?.data ?? []}
      classes={classesRes?.data ?? []}
      assignments={assignmentsRes?.data ?? []}
      canManage={canManage}
    />
  );
}
