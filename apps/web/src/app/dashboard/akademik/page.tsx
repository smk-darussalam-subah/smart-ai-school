import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveRoles } from '@/lib/view-as';
import { redirect } from 'next/navigation';
import { apiFetch, PaginatedResponse, GradeItem, AttendanceItem } from '@/lib/api';
import AkademikClient from './_components/AkademikClient';

interface Assignment { id: string; subject: string; class: { name: string } }
interface ClassItem { id: string; name: string; }
export interface SubjectItem { id: string; code: string; name: string; isActive: boolean; }

export default async function AkademikPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const token = session?.accessToken ?? '';
  const roles: string[] = await getEffectiveRoles(session);

  if (roles.includes('INDUSTRI')) redirect('/dashboard');
  const canManage = roles.includes('SUPER_ADMIN') || roles.includes('GURU');
  const canEditAssignment = roles.includes('SUPER_ADMIN') || roles.includes('TATA_USAHA');

  const [gradesData, attendanceData, classesRes, assignmentsRes, subjectsRes] = await Promise.all([
    apiFetch<PaginatedResponse<GradeItem>>('/grades?limit=200', token),
    apiFetch<PaginatedResponse<AttendanceItem>>('/attendance?limit=200', token),
    apiFetch<{ data: ClassItem[] }>('/classes?limit=50', token),
    apiFetch<{ data: Assignment[]; total: number }>('/teaching-assignments?limit=100', token),
    apiFetch<{ data: SubjectItem[] }>('/subjects?limit=200', token),
  ]);

  return (
    <AkademikClient
      grades={gradesData?.data ?? []}
      attendances={attendanceData?.data ?? []}
      classes={classesRes?.data ?? []}
      assignments={assignmentsRes?.data ?? []}
      subjects={subjectsRes?.data ?? []}
      canManage={canManage}
      canEditAssignment={canEditAssignment}
    />
  );
}
