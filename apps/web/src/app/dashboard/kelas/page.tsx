import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import LoadError from '@/components/LoadError';
import { resolveDashboardAuthority } from '@/lib/dashboard-authority';
import { CLASS_CONFIG_DISCOVERABILITY_RULE } from '@/lib/navigation-authority';
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
  if (!session) redirect('/login');
  const authority = await resolveDashboardAuthority(session);
  if (!CLASS_CONFIG_DISCOVERABILITY_RULE.permissions.every((permission) => authority.can(permission)) ||
    !authority.hasRole(...CLASS_CONFIG_DISCOVERABILITY_RULE.roles)) {
    redirect('/dashboard');
  }

  const token = session?.accessToken ?? '';

  const canManage = authority.can('academic.teaching.manage') && authority.hasRole('SUPER_ADMIN', 'TATA_USAHA');
  const [classesRes, majorsRes, groupedRes] = await Promise.all([
    apiFetch<{ data: ClassRow[]; total: number }>('/classes?includeInactive=true&limit=100', token),
    apiFetch<Major[]>('/school/majors?activeOnly=true', token),
    canManage
      ? apiFetch<{ groups: { role: string; users: StaffCandidate[] }[] }>('/users/grouped?limit=100', token)
      : Promise.resolve(null),
  ]);

  if (classesRes === null) return <LoadError />;

  const classes = classesRes?.data ?? [];
  const majors = Array.isArray(majorsRes) ? majorsRes : [];
  const teachers: StaffCandidate[] = (groupedRes?.groups ?? [])
    .filter((g) => STAFF_ROLES.includes(g.role))
    .flatMap((g) => g.users.map((u) => ({ ...u, role: g.role })));

  const isSuperAdmin = authority.hasRole('SUPER_ADMIN');

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
