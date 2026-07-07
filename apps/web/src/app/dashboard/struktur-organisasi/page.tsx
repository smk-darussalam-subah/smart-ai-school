import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveRoles } from '@/lib/view-as';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import StrukturClient from './_components/StrukturClient';

export interface Position {
  id: string;
  code: string;
  name: string;
  category: 'STRUKTURAL' | 'FUNGSIONAL' | 'TENDIK';
  scopeType: 'NONE' | 'MAJOR';
  parentId: string | null;
  _count: { permissions: number };
}

export interface Assignment {
  id: string;
  positionId: string;
  majorId: string | null;
  position: { code: string; name: string; category: string };
  major: { code: string; name: string } | null;
  staff: { niy: string | null; user: { id: string; fullName: string; email: string } };
}

export interface Major { id: string; code: string; name: string }
export interface StaffCandidate { id: string; fullName: string; email: string; role: string }

const STAFF_ROLES = ['GURU', 'TATA_USAHA', 'KEPALA_SEKOLAH'];

export default async function StrukturOrganisasiPage() {
  const session = await getServerSession(authOptions);
  const roles: string[] = await getEffectiveRoles(session);
  if (!roles.includes('SUPER_ADMIN') && !roles.includes('KEPALA_SEKOLAH')) redirect('/dashboard');

  const token = session?.accessToken ?? '';

  const [catalog, assignmentsRes, majorsRes, groupedRes] = await Promise.all([
    apiFetch<Position[]>('/positions', token),
    apiFetch<{ academicYear: { id: string; code: string } | null; assignments: Assignment[] }>('/positions/assignments', token),
    apiFetch<Major[]>('/school/majors?activeOnly=true', token),
    apiFetch<{ groups: { role: string; users: StaffCandidate[] }[] }>('/users/grouped?limit=200', token),
  ]);

  const positions = Array.isArray(catalog) ? catalog : [];
  const academicYear = assignmentsRes?.academicYear ?? null;
  const assignments = assignmentsRes?.assignments ?? [];
  const majors = Array.isArray(majorsRes) ? majorsRes : [];
  const staff: StaffCandidate[] = (groupedRes?.groups ?? [])
    .filter((g) => STAFF_ROLES.includes(g.role))
    .flatMap((g) => g.users.map((u) => ({ ...u, role: g.role })));

  const isSuperAdmin = roles.includes('SUPER_ADMIN');

  return (
    <StrukturClient
      positions={positions}
      academicYear={academicYear}
      assignments={assignments}
      majors={majors}
      staff={staff}
      isSuperAdmin={isSuperAdmin}
    />
  );
}
