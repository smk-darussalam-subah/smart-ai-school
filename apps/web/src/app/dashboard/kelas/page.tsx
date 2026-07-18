import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveRoles } from '@/lib/view-as';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import LoadError from '@/components/LoadError';
import KelasClient from './_components/KelasClient';

export interface ClassRow {
  id: string;
  name: string;
  majorCode: string;
  grade: number;
  academicYear: string;
  capacity: number;
  teacherId: string | null;
  isActive: boolean;
  waliKelas: { id: string; fullName: string } | null;
  studentCount: number;
}

export interface Major {
  id: string;
  code: string;
  name: string;
}

export interface StaffCandidate {
  id: string;
  fullName: string;
  email: string;
  role: string;
}

const STAFF_ROLES = ['GURU', 'TATA_USAHA', 'KEPALA_SEKOLAH'];

export default async function KelasPage() {
  const session = await getServerSession(authOptions);
  const roles: string[] = await getEffectiveRoles(session);
  if (!roles.includes('SUPER_ADMIN') && !roles.includes('KEPALA_SEKOLAH') && !roles.includes('TATA_USAHA')) {
    redirect('/dashboard');
  }

  const token = session?.accessToken ?? '';

  const [classesRes, majorsRes, groupedRes] = await Promise.all([
    apiFetch<{ data: ClassRow[]; total: number }>('/classes?includeInactive=true&limit=200', token),
    apiFetch<Major[]>('/school/majors?activeOnly=true', token),
    apiFetch<{ groups: { role: string; users: StaffCandidate[] }[] }>('/users/grouped?limit=200', token),
  ]);

  if (classesRes === null) return <LoadError />;

  const classes = classesRes?.data ?? [];
  const majors = Array.isArray(majorsRes) ? majorsRes : [];
  const teachers: StaffCandidate[] = (groupedRes?.groups ?? [])
    .filter((g) => STAFF_ROLES.includes(g.role))
    .flatMap((g) => g.users.map((u) => ({ ...u, role: g.role })));

  const isSuperAdmin = roles.includes('SUPER_ADMIN');
  const canManage = isSuperAdmin || roles.includes('TATA_USAHA');

  return (
    <KelasClient
      classes={classes}
      majors={majors}
      teachers={teachers}
      isSuperAdmin={isSuperAdmin}
      canManage={canManage}
    />
  );
}
